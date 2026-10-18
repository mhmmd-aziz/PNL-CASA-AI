"""Pengujian fitur utama CASA-AI dalam tiga skenario: positif, negatif, dan edge case.

Alur yang diuji: login -> registrasi (Front Office) -> terima sampel & data makroskopis
(Analis) -> analisis video -> kirim ke dokter -> setujui & tanda tangan (Dokter) ->
rilis laporan -> pasien melihat laporannya sendiri.

Semua tes memakai database SQLite sementara yang dibuat dari skema database aktif
(tanpa menyalin isi baris), file kalibrasi sementara, serta folder upload/output
sementara. Inferensi model diganti stub agar tes memeriksa alur aplikasi, bukan
akurasi model; uji model nyata ada di tests/smoke_inference.py.
"""

import json
import math
import os
import sqlite3
import sys
import tempfile
import unittest
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
(ROOT / ".tmp" / "ultralytics" / "Ultralytics").mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "train model"))
os.environ.setdefault("YOLO_CONFIG_DIR", str(ROOT / ".tmp" / "ultralytics"))

from fastapi.testclient import TestClient

import auth_routes
import calibration_store
import correction_routes
import examinations_routes
import main
from database import db_connection

LIVE_DB = ROOT / "backend" / "database" / "casa_ai.db"
WIB = timezone(timedelta(hours=7))
SIGNATURE = "data:image/png;base64,iVBORw0KGgo="
PASSWORD = "Rahasia-Uji-123"

STAFF = [
    ("fo@lab.test", "Petugas FO", "FRONT_OFFICE", None),
    ("analis@lab.test", "Analis Satu", "ANALYST", None),
    ("analis2@lab.test", "Analis Dua", "ANALYST", None),
    ("dokter@lab.test", "dr. Uji", "PHYSICIAN", "SIP-UJI-001"),
    ("dokter-tanpa-sip@lab.test", "dr. Tanpa SIP", "PHYSICIAN", None),
    ("admin@lab.test", "Super Admin", "SUPER_ADMIN", None),
]


def schema_sql() -> list[str]:
    """Skema tabel/indeks/trigger dari database aktif, tanpa data pasien."""
    conn = sqlite3.connect(LIVE_DB)
    try:
        rows = conn.execute(
            "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' "
            "ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END"
        ).fetchall()
    finally:
        conn.close()
    return [row[0] for row in rows]


def next_slot(days: int = 1, hour: int = 10, minute: int = 0) -> str:
    local = (datetime.now(WIB) + timedelta(days=days)).replace(hour=hour, minute=minute, second=0, microsecond=0)
    return local.isoformat()


def fake_result(motility: bool = True, pr=40.0, np_=35.0, im=25.0) -> dict:
    return {
        "summary": {
            "total_sperm": 28.5,
            "motility_available": motility,
            "progressive_percent": pr,
            "non_progressive_percent": np_,
            "immotile_percent": im,
        },
        "motion": {"average_speed": 41.2, "average_linearity": 0.61},
        "calibration": {"frame_width": 640, "frame_height": 480},
    }


class ScenarioBase(unittest.TestCase):
    SCHEMA = None

    @classmethod
    def setUpClass(cls):
        cls.SCHEMA = schema_sql()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=ROOT / ".tmp")
        base = Path(self.tmp.name)
        self.db_path = base / "casa_ai_test.db"
        conn = sqlite3.connect(self.db_path)
        for statement in self.SCHEMA:
            conn.execute(statement)
        conn.commit()
        conn.close()

        (base / "uploads").mkdir()
        (base / "outputs").mkdir()
        self.outputs = base / "outputs"
        self.pipeline_result = fake_result()
        self.pipeline_error = None

        self.original_connection = db_connection._db_connection
        db_connection._db_connection = db_connection.DatabaseConnection(self.db_path)
        self.patches = [
            patch.object(db_connection, "DB_FILE", self.db_path),
            # Hash cepat khusus tes; format dan verifikasi tetap PBKDF2 yang sama
            patch.object(auth_routes, "PBKDF2_ITERATIONS", 1_000),
            patch.object(calibration_store, "CALIBRATION_PATH", base / "calibration.json"),
            patch.object(correction_routes, "STORE_DIR", base / "corrections"),
            patch.object(main, "UPLOAD_DIR", base / "uploads"),
            patch.object(main, "OUTPUT_DIR", self.outputs),
            patch.object(main, "trained_model_path", return_value=str(base / "best.pt")),
            patch.object(main, "run_pipeline", side_effect=self._fake_pipeline),
            patch.object(main, "register_analysis"),
        ]
        for item in self.patches:
            item.start()

        self.users, self.passwords = {}, {}
        conn = self.db()
        hashed = auth_routes.hash_password(PASSWORD)
        for email, name, role, license_number in STAFF:
            cursor = conn.execute(
                "INSERT INTO users (email, password_hash, full_name, role, license_number) VALUES (?, ?, ?, ?, ?)",
                (email, hashed, name, role, license_number),
            )
            self.users[email] = cursor.lastrowid
        conn.commit()
        self.client = TestClient(main.app, raise_server_exceptions=False)

    def tearDown(self):
        self.client.close()
        for item in reversed(self.patches):
            item.stop()
        db_connection._db_connection.close()
        db_connection._db_connection = self.original_connection
        self.tmp.cleanup()

    # ------------------------------------------------------------------ helpers

    def db(self):
        return db_connection.get_connection()

    def _fake_pipeline(self, video_path, output_dir, **kwargs):
        if self.pipeline_error:
            raise self.pipeline_error
        stem = Path(video_path).stem
        video = Path(output_dir) / f"{stem}_annotated.webm"
        heatmap = Path(output_dir) / f"{stem}_heatmap.png"
        video.write_bytes(b"webm")
        heatmap.write_bytes(b"png")
        return self.pipeline_result, str(video), str(heatmap)

    def login(self, email: str, password: str = PASSWORD):
        return self.client.post("/api/auth/login", json={"email": email, "password": password})

    def auth(self, email: str) -> dict:
        """Header sesi untuk akun staf atau pasien (sesi dibuat lewat login asli)."""
        response = self.login(email, self.passwords.get(email, PASSWORD))
        self.assertEqual(response.status_code, 200, response.text)
        return {"Authorization": f"Bearer {response.json()['token']}"}

    def register(self, name="Pasien Uji Satu", email="pasien1@mail.test", slot=None, **extra):
        payload = {
            "full_name": name,
            "birth_date": "1990-05-01",
            "gender": "MALE",
            "email": email,
            "collection_datetime": slot or next_slot(),
            **extra,
        }
        return self.client.post("/api/examinations", json=payload, headers=self.auth("fo@lab.test"))

    def registered(self, **kwargs) -> dict:
        response = self.register(**kwargs)
        self.assertEqual(response.status_code, 201, response.text)
        data = response.json()
        if data["portal_account"]:
            self.passwords[data["portal_account"]["email"]] = data["portal_account"]["temporary_password"]
        return data

    def receive(self, exam_id, analyst="analis@lab.test"):
        return self.client.post(f"/api/examinations/{exam_id}/receive", headers=self.auth(analyst))

    def macroscopic(self, exam_id, analyst="analis@lab.test", **values):
        payload = {"volume_ml": 2.5, "liquefaction_time_min": 30, "viscosity": "NORMAL", "ph_value": 7.6, **values}
        return self.client.put(f"/api/examinations/{exam_id}/macroscopic", json=payload, headers=self.auth(analyst))

    def analyze(self, exam_id, analyst="analis@lab.test", data=None, content=b"\x00\x00\x00\x18ftypmp42"):
        headers = self.auth(analyst)
        response = self.client.post(
            "/api/analyze",
            files={"video": ("sampel.mp4", content, "video/mp4")},
            data={"examination_id": str(exam_id), **(data or {})},
            headers=headers,
        )
        if response.status_code != 200:
            return response, None
        progress = self.client.get(f"/api/progress/{response.json()['task_id']}", headers=headers)
        return response, progress

    def submit(self, exam_id, analyst="analis@lab.test"):
        return self.client.post(f"/api/examinations/{exam_id}/submit", headers=self.auth(analyst))

    def approve(self, exam_id, doctor="dokter@lab.test", **overrides):
        payload = {
            "clinical_interpretation": "Hasil estimasi motilitas perlu dikonfirmasi dengan klinis pasien.",
            "recommendations": "Kontrol ulang 3 bulan.",
            "sign": True,
            "signature_png": SIGNATURE,
            **overrides,
        }
        return self.client.post(f"/api/review/{exam_id}/approve", json=payload, headers=self.auth(doctor))

    def release(self, report_id, doctor="dokter@lab.test"):
        return self.client.post(f"/api/reports/{report_id}/release", headers=self.auth(doctor))

    def report_id(self, exam_id) -> int:
        return self.db().execute("SELECT id FROM reports WHERE examination_id = ?", (exam_id,)).fetchone()[0]

    def status(self, exam_id) -> str:
        return self.db().execute("SELECT status FROM examinations WHERE id = ?", (exam_id,)).fetchone()[0]

    def audit_actions(self) -> list[str]:
        return [row[0] for row in self.db().execute("SELECT action_type FROM audit_logs ORDER BY id")]

    def ready_for_review(self, **kwargs) -> int:
        exam_id = self.registered(**kwargs)["id"]
        self.assertEqual(self.receive(exam_id).status_code, 200)
        self.assertEqual(self.macroscopic(exam_id).status_code, 200)
        _, progress = self.analyze(exam_id)
        self.assertTrue(progress.json()["result"]["success"], progress.text)
        self.assertEqual(self.submit(exam_id).status_code, 200)
        return exam_id


# =============================================================================
# a. Skenario Positif — penggunaan aplikasi sesuai alur normal
# =============================================================================

class PositiveScenarios(ScenarioBase):
    def test_p1_login_profile_and_logout(self):
        response = self.login("analis@lab.test")
        self.assertEqual(response.status_code, 200)
        token = response.json()["token"]
        self.assertEqual(response.json()["user"]["role"], "ANALYST")
        headers = {"Authorization": f"Bearer {token}"}
        self.assertEqual(self.client.get("/api/auth/me", headers=headers).json()["email"], "analis@lab.test")
        self.assertEqual(self.client.post("/api/auth/logout", headers=headers).status_code, 200)
        self.assertEqual(self.client.get("/api/auth/me", headers=headers).status_code, 401)
        # Token mentah tidak tersimpan di database
        self.assertIsNone(self.db().execute("SELECT 1 FROM auth_sessions WHERE token_hash = ?", (token,)).fetchone())
        self.assertIn("LOGIN_SUCCESS", self.audit_actions())

    def test_p2_full_workflow_registration_to_patient_report(self):
        registered = self.registered()
        exam_id = registered["id"]
        self.assertEqual(registered["status"], "REGISTERED")
        self.assertTrue(registered["sample_code"].startswith("SMP-"))
        self.assertIsNotNone(registered["portal_account"]["temporary_password"])

        received = self.receive(exam_id)
        self.assertEqual(received.json()["status"], "IN_PROGRESS")
        self.assertEqual(received.json()["current_analyst_id"], self.users["analis@lab.test"])
        self.assertEqual(self.macroscopic(exam_id).json()["volume_ml"], 2.5)

        response, progress = self.analyze(exam_id)
        self.assertEqual(response.status_code, 200, response.text)
        result = progress.json()
        self.assertEqual(result["status"], "completed")
        self.assertTrue(result["result"]["success"])
        self.assertIn("sig=", result["result"]["video_url"])

        run = self.db().execute("SELECT * FROM analysis_runs WHERE examination_id = ?", (exam_id,)).fetchone()
        self.assertEqual(run["status"], "COMPLETED")
        self.assertEqual(run["pr_percentage"], 40.0)
        # Kalibrasi efektif disimpan bersama hasil agar dapat direproduksi
        self.assertIn("pixel_scale", json.loads(run["calibration_snapshot"]))
        assets = {row[0] for row in self.db().execute("SELECT asset_type FROM media_assets WHERE examination_id = ?", (exam_id,))}
        self.assertEqual(assets, {"VIDEO_SOURCE", "ANNOTATED_VIDEO", "HEATMAP"})

        self.assertEqual(self.submit(exam_id).json()["status"], "PENDING_REVIEW")
        approved = self.approve(exam_id)
        self.assertEqual(approved.status_code, 200, approved.text)
        self.assertEqual(self.status(exam_id), "APPROVED")

        report_id = self.report_id(exam_id)
        released = self.release(report_id)
        self.assertEqual(released.json()["status"], "RELEASED")
        self.assertEqual(self.status(exam_id), "RELEASED")

        patient = self.auth(registered["portal_account"]["email"])
        reports = self.client.get("/api/reports/mine", headers=patient).json()
        self.assertEqual([r["id"] for r in reports], [report_id])
        self.assertEqual(reports[0]["results"]["pr_percentage"], 40.0)
        self.assertEqual(reports[0]["physician_license"], "SIP-UJI-001")

        actions = self.audit_actions()
        for action in ["REGISTER_EXAMINATION", "RECEIVE_SAMPLE", "SUBMIT_FOR_REVIEW", "PHYSICIAN_APPROVE", "RELEASE_REPORT"]:
            self.assertIn(action, actions)
        events = [row[0] for row in self.db().execute("SELECT event_type FROM review_events WHERE examination_id = ? ORDER BY id", (exam_id,))]
        self.assertEqual(events, ["SUBMIT_FOR_REVIEW", "PHYSICIAN_APPROVE"])

    def test_p3_return_for_correction_then_resubmit(self):
        exam_id = self.ready_for_review()
        response = self.client.post(
            f"/api/review/{exam_id}/return",
            json={"reason": "Video buram, mohon rekam ulang bidang pandang."},
            headers=self.auth("dokter@lab.test"),
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.status(exam_id), "RETURNED_FOR_CORRECTION")
        self.assertEqual(self.receive(exam_id).status_code, 200)
        self.analyze(exam_id)
        self.assertEqual(self.submit(exam_id).status_code, 200)
        self.assertEqual(self.approve(exam_id).status_code, 200)
        self.assertEqual(self.db().execute("SELECT COUNT(*) FROM analysis_runs WHERE examination_id = ?", (exam_id,)).fetchone()[0], 2)

    def test_p4_admin_saves_calibration_used_by_next_analysis(self):
        admin = self.auth("admin@lab.test")
        profile = self.client.get("/api/calibration", headers=admin).json()
        profile.update(pixel_scale=0.65, chamber_type="leja", chamber_depth=20, dilution_factor=2)
        self.assertEqual(self.client.put("/api/calibration", json=profile, headers=admin).status_code, 200)
        exam_id = self.registered()["id"]
        self.receive(exam_id)
        self.macroscopic(exam_id)
        self.analyze(exam_id)
        snapshot = json.loads(self.db().execute("SELECT calibration_snapshot FROM analysis_runs").fetchone()[0])
        self.assertEqual((snapshot["pixel_scale"], snapshot["chamber_type"], snapshot["dilution_factor"]), (0.65, "leja", 2))

    def test_p6_schedule_card_data_includes_abstinence_window(self):
        slot = next_slot(days=4)
        start = (datetime.fromisoformat(slot) - timedelta(hours=72)).isoformat()
        created = self.registered(slot=slot, abstinence_start_at=start, abstinence_duration_hours=72)
        self.assertEqual(created["abstinence_duration_hours"], 72)
        self.assertEqual(datetime.fromisoformat(created["abstinence_start_at"]), datetime.fromisoformat(start))
        self.assertEqual(datetime.fromisoformat(created["abstinence_ready_at"]), datetime.fromisoformat(slot))
        listed = self.client.get("/api/examinations", headers=self.auth("fo@lab.test")).json()
        self.assertEqual(listed[0]["abstinence_ready_at"], created["abstinence_ready_at"])

    def test_p7_front_office_deletes_wrongly_registered_patient(self):
        keep = self.registered(name="Pasien Tetap", email="tetap@mail.test", slot=next_slot(hour=9))
        wrong = self.registered(name="Pasien Salah Input", email="salah@mail.test", slot=next_slot(hour=9))
        patient_id = self.db().execute("SELECT patient_id FROM examinations WHERE id = ?", (wrong["id"],)).fetchone()[0]
        patient_headers = self.auth("salah@mail.test")

        listed = {p["id"]: p for p in self.client.get("/api/patients", headers=self.auth("fo@lab.test")).json()}
        self.assertTrue(listed[patient_id]["can_delete"])
        response = self.client.delete(f"/api/patients/{patient_id}", headers=self.auth("fo@lab.test"))
        self.assertEqual(response.status_code, 200, response.text)

        conn = self.db()
        self.assertIsNone(conn.execute("SELECT 1 FROM patients WHERE id = ?", (patient_id,)).fetchone())
        self.assertIsNone(conn.execute("SELECT 1 FROM examinations WHERE id = ?", (wrong["id"],)).fetchone())
        self.assertIsNone(conn.execute("SELECT 1 FROM users WHERE email = 'salah@mail.test'").fetchone())
        # Sesi pasien yang dihapus tidak berlaku lagi, dan antrean pasien lain dirapikan
        self.assertEqual(self.client.get("/api/auth/me", headers=patient_headers).status_code, 401)
        self.assertEqual(conn.execute("SELECT queue_number FROM examinations WHERE id = ?", (keep["id"],)).fetchone()[0], "A-001")
        self.assertIn("DELETE_PATIENT", self.audit_actions())

    def test_p8_gender_is_set_automatically(self):
        exam = self.registered(gender="FEMALE")
        response = self.client.post("/api/patients", json={
            "full_name": "Pasien Tanpa Gender", "birth_date": "1992-02-02", "email": "tanpagender@mail.test",
        }, headers=self.auth("fo@lab.test"))
        self.assertEqual(response.status_code, 201, response.text)
        genders = {row[0] for row in self.db().execute("SELECT gender FROM patients")}
        self.assertEqual(genders, {"MALE"})
        self.assertTrue(exam["id"])

    def test_p5_existing_patient_registered_again_by_medical_record_number(self):
        first = self.registered()
        second = self.register(medical_record_number=first["medical_record_number"], full_name=None, email=None,
                               slot=next_slot(days=2))
        self.assertEqual(second.status_code, 201, second.text)
        self.assertEqual(second.json()["medical_record_number"], first["medical_record_number"])
        self.assertIsNone(second.json()["portal_account"])


# =============================================================================
# b. Skenario Negatif — kesalahan input atau gangguan sistem
# =============================================================================

class NegativeScenarios(ScenarioBase):
    def test_n1_wrong_credentials_are_rejected_with_same_message_and_audited(self):
        wrong_password = self.login("analis@lab.test", "salah")
        unknown_email = self.login("tidak-ada@lab.test", "salah")
        self.assertEqual(wrong_password.status_code, 401)
        self.assertEqual(unknown_email.status_code, 401)
        self.assertEqual(wrong_password.json()["detail"], unknown_email.json()["detail"])
        self.assertEqual(self.audit_actions().count("LOGIN_FAILED"), 2)

    def test_n2_missing_or_forged_token_is_rejected(self):
        self.assertEqual(self.client.get("/api/examinations").status_code, 401)
        self.assertEqual(self.client.get("/api/examinations", headers={"Authorization": "Bearer palsu"}).status_code, 401)
        self.assertEqual(self.client.get("/api/examinations", headers={"Authorization": "Token abc"}).status_code, 401)

    def test_n3_roles_cannot_cross_their_boundaries(self):
        exam_id = self.ready_for_review()
        checks = [
            ("analis@lab.test", "post", f"/api/review/{exam_id}/approve", {"clinical_interpretation": "x" * 20, "sign": True, "signature_png": SIGNATURE}),
            ("fo@lab.test", "post", f"/api/examinations/{exam_id}/receive", None),
            ("dokter@lab.test", "post", "/api/examinations", {"full_name": "Tidak Boleh", "birth_date": "1990-01-01", "collection_datetime": next_slot()}),
            ("admin@lab.test", "post", f"/api/review/{exam_id}/approve", {"clinical_interpretation": "x" * 20, "sign": True, "signature_png": SIGNATURE}),
            ("analis@lab.test", "put", "/api/calibration", {}),
            ("fo@lab.test", "get", "/api/admin/audit-logs", None),
        ]
        for email, method, url, body in checks:
            with self.subTest(email=email, url=url):
                response = getattr(self.client, method)(url, json=body, headers=self.auth(email)) if body is not None \
                    else getattr(self.client, method)(url, headers=self.auth(email))
                self.assertEqual(response.status_code, 403, response.text)
        self.assertEqual(self.status(exam_id), "PENDING_REVIEW")

    def test_n4_invalid_registration_input(self):
        cases = [
            ({"full_name": None}, 422),
            ({"email": "bukan-email"}, 422),
            ({"collection_datetime": next_slot(days=-1)}, 422),
            ({"collection_datetime": next_slot(minute=7)}, 422),
            ({"birth_date": (datetime.now().date() + timedelta(days=1)).isoformat()}, 422),
            ({"medical_record_number": "RM-TIDAK-ADA"}, 404),
            ({"abstinence_duration_hours": 72}, 422),  # tanpa waktu mulai pantang
        ]
        for extra, expected in cases:
            with self.subTest(extra=extra):
                payload = {"full_name": "Pasien Negatif", "email": "neg@mail.test", **extra}
                self.assertEqual(self.register(**payload).status_code, expected)
        self.assertEqual(self.db().execute("SELECT COUNT(*) FROM examinations").fetchone()[0], 0)

    def test_n5_invalid_macroscopic_and_calibration_input(self):
        exam_id = self.registered()["id"]
        self.receive(exam_id)
        for field, value in [("volume_ml", 0), ("volume_ml", -1), ("ph_value", 15), ("viscosity", "CAIR"), ("liquefaction_time_min", -5)]:
            with self.subTest(field=field, value=value):
                self.assertEqual(self.macroscopic(exam_id, **{field: value}).status_code, 422)
        self.assertIsNone(self.db().execute("SELECT volume_ml FROM examinations WHERE id = ?", (exam_id,)).fetchone()[0])

        admin = self.auth("admin@lab.test")
        before = self.client.get("/api/calibration", headers=admin).json()
        for override in [{"pixel_scale": 0}, {"dilution_factor": 0.5}, {"prog_linearity_threshold": 1.5}]:
            with self.subTest(override=override):
                self.assertEqual(self.client.put("/api/calibration", json={**before, **override}, headers=admin).status_code, 422)
        self.assertEqual(self.client.get("/api/calibration", headers=admin).json(), before)

    def test_n6_out_of_order_workflow_transitions_are_rejected(self):
        exam_id = self.registered()["id"]
        response, _ = self.analyze(exam_id)
        self.assertEqual(response.status_code, 409)  # belum diterima
        self.assertEqual(self.submit(exam_id).status_code, 409)
        self.receive(exam_id)
        response, _ = self.analyze(exam_id)
        self.assertEqual(response.status_code, 409)  # makroskopis belum diisi
        self.macroscopic(exam_id)
        self.assertEqual(self.submit(exam_id).status_code, 409)  # belum ada analisis
        self.assertEqual(self.approve(exam_id).status_code, 409)  # belum PENDING_REVIEW
        self.assertEqual(self.status(exam_id), "IN_PROGRESS")

    def test_n7_approval_requires_signature_and_physician_license(self):
        exam_id = self.ready_for_review()
        self.assertEqual(self.approve(exam_id, sign=False).status_code, 422)
        self.assertEqual(self.approve(exam_id, signature_png="bukan-gambar").status_code, 422)
        self.assertEqual(self.approve(exam_id, clinical_interpretation="pendek").status_code, 422)
        self.assertEqual(self.approve(exam_id, doctor="dokter-tanpa-sip@lab.test").status_code, 409)
        self.assertEqual(self.status(exam_id), "PENDING_REVIEW")
        self.assertEqual(self.db().execute("SELECT COUNT(*) FROM reports").fetchone()[0], 0)

    def test_n8_pipeline_failure_does_not_fabricate_result(self):
        exam_id = self.registered()["id"]
        self.receive(exam_id)
        self.macroscopic(exam_id)
        self.pipeline_error = RuntimeError("Video tidak dapat didekode")
        response, progress = self.analyze(exam_id)
        self.assertEqual(response.status_code, 200)
        result = progress.json()["result"]
        self.assertFalse(result["success"])
        self.assertIn("didekode", result["error"])
        self.assertEqual(self.db().execute("SELECT COUNT(*) FROM analysis_runs").fetchone()[0], 0)
        self.assertEqual(self.submit(exam_id).status_code, 409)

    def test_n9_missing_model_weights_and_corrupt_calibration(self):
        exam_id = self.registered()["id"]
        self.receive(exam_id)
        self.macroscopic(exam_id)
        with patch.object(main, "trained_model_path", side_effect=main.HTTPException(status_code=503, detail="Bobot model tidak ditemukan")):
            response, _ = self.analyze(exam_id)
        self.assertEqual(response.status_code, 503)

        calibration_store.CALIBRATION_PATH.write_text("{rusak", encoding="utf-8")
        response = self.client.get("/api/calibration", headers=self.auth("analis@lab.test"))
        self.assertEqual(response.status_code, 500)
        response, _ = self.analyze(exam_id)
        self.assertEqual(response.status_code, 500)
        self.assertEqual(self.db().execute("SELECT COUNT(*) FROM analysis_runs").fetchone()[0], 0)

    def test_n11_patient_with_lab_data_cannot_be_deleted(self):
        exam_id = self.registered()["id"]
        self.receive(exam_id)
        patient_id = self.db().execute("SELECT patient_id FROM examinations WHERE id = ?", (exam_id,)).fetchone()[0]

        listed = {p["id"]: p for p in self.client.get("/api/patients", headers=self.auth("fo@lab.test")).json()}
        self.assertFalse(listed[patient_id]["can_delete"])
        response = self.client.delete(f"/api/patients/{patient_id}", headers=self.auth("fo@lab.test"))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.client.delete(f"/api/patients/{patient_id}", headers=self.auth("analis@lab.test")).status_code, 403)
        self.assertEqual(self.client.delete(f"/api/patients/{patient_id}", headers=self.auth("admin@lab.test")).status_code, 403)
        self.assertEqual(self.client.delete("/api/patients/99999", headers=self.auth("fo@lab.test")).status_code, 404)
        self.assertIsNotNone(self.db().execute("SELECT 1 FROM patients WHERE id = ?", (patient_id,)).fetchone())
        self.assertEqual(self.status(exam_id), "IN_PROGRESS")

    def test_n10_invalid_analysis_parameters(self):
        exam_id = self.registered()["id"]
        self.receive(exam_id)
        self.macroscopic(exam_id)
        for field, value in [("conf_thres", "0"), ("conf_thres", "1.5"), ("pixel_scale", "-1"), ("fps", "nan"), ("chamber_type", "kaca")]:
            with self.subTest(field=field, value=value):
                response, _ = self.analyze(exam_id, data={field: value})
                self.assertEqual(response.status_code, 422)


# =============================================================================
# c. Skenario Edge Case — kondisi tidak terduga atau jarang terjadi
# =============================================================================

class EdgeCaseScenarios(ScenarioBase):
    def test_e1_macroscopic_boundary_values(self):
        exam_id = self.registered()["id"]
        self.receive(exam_id)
        for values, expected in [
            ({"ph_value": 0}, 200), ({"ph_value": 14}, 200), ({"ph_value": 14.01}, 422),
            ({"volume_ml": 20}, 200), ({"volume_ml": 20.01}, 422), ({"volume_ml": 0.01}, 200),
            ({"liquefaction_time_min": 0}, 200), ({"liquefaction_time_min": 180}, 200), ({"liquefaction_time_min": 181}, 422),
        ]:
            with self.subTest(values=values):
                self.assertEqual(self.macroscopic(exam_id, **values).status_code, expected)

    def test_e2_abstinence_window_boundaries(self):
        start = (datetime.now(WIB) - timedelta(days=10)).replace(microsecond=0).isoformat()
        for index, (hours, expected) in enumerate([(47, 422), (48, 201), (168, 201), (169, 422)]):
            with self.subTest(hours=hours):
                response = self.register(
                    name=f"Pasien Pantang {index}", email=f"pantang{index}@mail.test",
                    abstinence_start_at=start, abstinence_duration_hours=hours,
                )
                self.assertEqual(response.status_code, expected, response.text)

    def test_e3_sample_cannot_be_received_before_abstinence_ends(self):
        start = datetime.now(WIB).replace(microsecond=0)
        exam = self.registered(slot=next_slot(days=4), abstinence_start_at=start.isoformat(), abstinence_duration_hours=72)
        self.assertEqual(self.receive(exam["id"]).status_code, 409)
        self.assertEqual(self.status(exam["id"]), "REGISTERED")

    def test_e4_slot_capacity_is_enforced(self):
        slot = next_slot(hour=9)
        for index in range(examinations_routes.SLOT_CAPACITY):
            self.registered(name=f"Pasien Slot {index}", email=f"slot{index}@mail.test", slot=slot)
        response = self.register(name="Pasien Slot Penuh", email="slotpenuh@mail.test", slot=slot)
        self.assertEqual(response.status_code, 409)
        self.assertIn("penuh", response.json()["detail"])

    def test_e5_same_day_double_booking_requires_override_reason(self):
        first = self.registered(slot=next_slot(hour=9))
        again = {"medical_record_number": first["medical_record_number"], "full_name": None, "email": None,
                 "slot": next_slot(hour=14)}
        response = self.register(**again)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"]["code"], "SAME_DAY_EXAM")
        self.assertEqual(self.register(**again, override_same_day=True, override_reason="pendek").status_code, 422)
        ok = self.register(**again, override_same_day=True, override_reason="Pasien diminta dokter ulang hari ini")
        self.assertEqual(ok.status_code, 201, ok.text)
        self.assertIn("OVERRIDE_SAME_DAY_BOOKING", self.audit_actions())

    def test_e6_duplicate_new_patient_is_rejected(self):
        self.registered(name="Pasien Kembar", email="kembar1@mail.test")
        response = self.register(name="Pasien Kembar", email="kembar2@mail.test", slot=next_slot(days=2))
        self.assertEqual(response.status_code, 409, response.text)
        duplicate_email = self.register(name="Pasien Lain", email="kembar1@mail.test", slot=next_slot(days=3))
        self.assertEqual(duplicate_email.status_code, 409)

    def test_e7_second_analyst_cannot_take_or_modify_claimed_sample(self):
        exam_id = self.registered()["id"]
        self.assertEqual(self.receive(exam_id).status_code, 200)
        self.assertEqual(self.receive(exam_id, analyst="analis2@lab.test").status_code, 409)
        self.assertEqual(self.macroscopic(exam_id, analyst="analis2@lab.test").status_code, 409)
        self.macroscopic(exam_id)
        response, _ = self.analyze(exam_id, analyst="analis2@lab.test")
        self.assertEqual(response.status_code, 409)
        self.analyze(exam_id)
        self.assertEqual(self.submit(exam_id, analyst="analis2@lab.test").status_code, 409)

    def test_e8_progress_of_another_analysts_task_is_hidden(self):
        exam_id = self.registered()["id"]
        self.receive(exam_id)
        self.macroscopic(exam_id)
        self.pipeline_result = fake_result()
        response = self.client.post(
            "/api/analyze", files={"video": ("v.mp4", b"x")}, data={"examination_id": str(exam_id)},
            headers=self.auth("analis@lab.test"),
        )
        task_id = response.json()["task_id"]
        self.assertEqual(self.client.get(f"/api/progress/{task_id}", headers=self.auth("analis2@lab.test")).status_code, 404)
        self.assertEqual(self.client.get("/api/progress/tidak-ada", headers=self.auth("analis@lab.test")).status_code, 404)

    def test_e9_released_report_is_immutable(self):
        exam_id = self.ready_for_review()
        self.approve(exam_id)
        report_id = self.report_id(exam_id)
        self.assertEqual(self.release(report_id).status_code, 200)
        self.assertEqual(self.release(report_id).status_code, 409)
        self.assertEqual(self.approve(exam_id).status_code, 409)
        returned = self.client.post(f"/api/review/{exam_id}/return", json={"reason": "Coba ubah setelah rilis"},
                                    headers=self.auth("dokter@lab.test"))
        self.assertEqual(returned.status_code, 409)
        self.assertEqual(self.macroscopic(exam_id, volume_ml=9).status_code, 409)
        self.assertEqual(self.db().execute("SELECT COUNT(*) FROM reports").fetchone()[0], 1)
        self.assertEqual(self.status(exam_id), "RELEASED")

    def test_e10_patient_cannot_see_other_patients_or_unreleased_reports(self):
        exam_a = self.ready_for_review(name="Pasien Alpha", email="alpha@mail.test")
        exam_b = self.ready_for_review(name="Pasien Beta", email="beta@mail.test", slot=next_slot(hour=11))
        self.approve(exam_a)
        self.approve(exam_b)
        self.release(self.report_id(exam_a))
        report_b = self.report_id(exam_b)  # disetujui tapi belum dirilis

        alpha, beta = self.auth("alpha@mail.test"), self.auth("beta@mail.test")
        self.assertEqual(self.client.get(f"/api/reports/mine/{report_b}", headers=alpha).status_code, 404)
        self.assertEqual(self.client.get("/api/reports/mine", headers=beta).json(), [])
        self.assertEqual(self.client.get(f"/api/reports/mine/{self.report_id(exam_a)}", headers=beta).status_code, 404)
        self.assertEqual(self.client.get("/api/examinations", headers=alpha).status_code, 403)
        self.assertEqual(self.client.get(f"/api/review/{exam_a}", headers=alpha).status_code, 403)

    def test_e11_unavailable_or_out_of_range_motility_is_stored_as_null_not_zero(self):
        for index, (result, label) in enumerate([
            (fake_result(motility=False), "motilitas tidak tersedia"),
            (fake_result(pr=150.0, np_=-3.0, im=100.01), "persentase di luar 0-100"),
        ]):
            with self.subTest(label=label):
                exam_id = self.registered(name=f"Pasien Null {index}", email=f"null{index}@mail.test",
                                          slot=next_slot(hour=12 + index))["id"]
                self.receive(exam_id)
                self.macroscopic(exam_id)
                self.pipeline_result = result
                _, progress = self.analyze(exam_id)
                self.assertTrue(progress.json()["result"]["success"])
                row = self.db().execute("SELECT pr_percentage, np_percentage, im_percentage FROM analysis_runs WHERE examination_id = ?", (exam_id,)).fetchone()
                self.assertEqual(tuple(row), (None, None, None))

    def test_e11b_non_finite_metrics_fail_explicitly(self):
        exam_id = self.registered()["id"]
        self.receive(exam_id)
        self.macroscopic(exam_id)
        self.pipeline_result = fake_result(im=math.inf)
        _, progress = self.analyze(exam_id)
        self.assertFalse(progress.json()["result"]["success"])
        self.assertEqual(self.db().execute("SELECT COUNT(*) FROM analysis_runs").fetchone()[0], 0)
        self.assertEqual(self.submit(exam_id).status_code, 409)

    def test_e12_expired_and_deactivated_sessions_are_rejected(self):
        headers = self.auth("analis@lab.test")
        conn = self.db()
        conn.execute("UPDATE auth_sessions SET expires_at = ?", ((datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat(),))
        conn.commit()
        response = self.client.get("/api/auth/me", headers=headers)
        self.assertEqual(response.status_code, 401)
        self.assertIn("berakhir", response.json()["detail"])

        headers = self.auth("fo@lab.test")
        conn.execute("UPDATE users SET is_active = 0 WHERE email = 'fo@lab.test'")
        conn.commit()
        self.assertEqual(self.client.get("/api/auth/me", headers=headers).status_code, 401)
        self.assertEqual(self.login("fo@lab.test").status_code, 403)

    def test_e13_client_filename_is_never_used_as_storage_path(self):
        exam_id = self.registered()["id"]
        self.receive(exam_id)
        self.macroscopic(exam_id)
        response = self.client.post(
            "/api/analyze", files={"video": ("../../../backend/main.mp4", b"x")},
            data={"examination_id": str(exam_id)}, headers=self.auth("analis@lab.test"),
        )
        self.assertEqual(response.status_code, 200)
        stored = [path.name for path in main.UPLOAD_DIR.iterdir()]
        self.assertEqual(stored, [f"{response.json()['task_id']}.mp4"])

    def test_e14_admin_cannot_remove_last_super_admin(self):
        admin = self.auth("admin@lab.test")
        response = self.client.patch(f"/api/admin/users/{self.users['admin@lab.test']}", json={"is_active": False}, headers=admin)
        self.assertEqual(response.status_code, 409)



# =============================================================================
# Temuan terbuka: perilaku yang seharusnya, tetapi belum dipenuhi aplikasi.
# Ditandai expectedFailure agar terlihat di setiap run; hapus tanda setelah diperbaiki.
# =============================================================================

class KnownDefects(ScenarioBase):
    @unittest.expectedFailure
    def test_d1_upload_rejects_empty_or_non_video_files(self):
        exam_id = self.registered()["id"]
        self.receive(exam_id)
        self.macroscopic(exam_id)
        for name, content in [("kosong.mp4", b""), ("program.exe", b"MZ"), ("catatan.txt", b"halo")]:
            with self.subTest(name=name):
                response = self.client.post("/api/analyze", files={"video": (name, content)},
                                            data={"examination_id": str(exam_id)}, headers=self.auth("analis@lab.test"))
                self.assertEqual(response.status_code, 422)

    @unittest.expectedFailure
    def test_d2_failed_task_leaves_no_submittable_run(self):
        exam_id = self.registered()["id"]
        self.receive(exam_id)
        self.macroscopic(exam_id)
        # register_analysis berjalan SETELAH persist_video_analysis meng-commit hasil
        main.register_analysis.side_effect = ValueError("Data kotak untuk koreksi tidak tersedia.")
        _, progress = self.analyze(exam_id)
        self.assertFalse(progress.json()["result"]["success"])
        self.assertEqual(self.db().execute("SELECT COUNT(*) FROM analysis_runs").fetchone()[0], 0)
        self.assertEqual(self.submit(exam_id).status_code, 409)

if __name__ == "__main__":
    unittest.main(verbosity=2)
