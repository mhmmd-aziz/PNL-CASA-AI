import json
import sqlite3
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import auth_routes
import reports_routes as rr

SCHEMA = """
CREATE TABLE users (id INTEGER PRIMARY KEY, full_name TEXT);
CREATE TABLE patients (id INTEGER PRIMARY KEY, full_name TEXT, medical_record_number TEXT, date_of_birth TEXT, gender TEXT, user_id INTEGER);
CREATE TABLE examinations (id INTEGER PRIMARY KEY, patient_id INTEGER, sample_code TEXT, collection_datetime TEXT,
    volume_ml REAL, liquefaction_time_min INTEGER, viscosity TEXT, ph_value REAL, appearance TEXT);
CREATE TABLE analysis_revisions (id INTEGER PRIMARY KEY, final_pr_percentage REAL, final_np_percentage REAL, final_im_percentage REAL);
CREATE TABLE reports (id INTEGER PRIMARY KEY, examination_id INTEGER, revision_id INTEGER, report_number TEXT, report_version INTEGER,
    status TEXT, approved_by INTEGER, approved_at TEXT, released_by INTEGER, released_at TEXT, physician_license TEXT,
    signature_data TEXT, clinical_interpretation TEXT, recommendations TEXT);
"""

DOCTOR_A, DOCTOR_B = 10, 11


def make_db():
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    conn.executemany("INSERT INTO users VALUES (?, ?)", [(DOCTOR_A, "dr. Ani"), (DOCTOR_B, "dr. Budi")])
    conn.executemany(
        "INSERT INTO patients VALUES (?, ?, ?, ?, ?, ?)",
        [(1, "Pasien Satu", "RM-1", "1990-01-01", "MALE", None), (2, "Pasien Dua", "RM-2", "1991-01-01", "MALE", None)],
    )
    conn.executemany(
        "INSERT INTO examinations VALUES (?, ?, ?, ?, 2.0, 30, 'NORMAL', 7.5, 'putih')",
        [(1, 1, "SMP-1", "2026-10-01T09:00"), (2, 2, "SMP-2", "2026-10-02T09:00"), (3, 1, "SMP-3", "2026-10-03T09:00")],
    )
    conn.execute("INSERT INTO analysis_revisions VALUES (1, 40, 30, 30)")
    signature = json.dumps({"signature_png": "data:image/png;base64,AAAA"})
    conn.executemany(
        "INSERT INTO reports VALUES (?, ?, 1, ?, 1, ?, ?, ?, ?, ?, 'SIP-1', ?, 'Interpretasi rahasia', 'Saran')",
        [
            (1, 1, "LAB-1", "RELEASED", DOCTOR_A, "2026-10-01T10:00", DOCTOR_A, "2026-10-01T11:00", signature),
            (2, 2, "LAB-2", "RELEASED", DOCTOR_B, "2026-10-02T10:00", DOCTOR_B, "2026-10-02T11:00", signature),
            (3, 3, "LAB-3", "APPROVED", DOCTOR_A, "2026-10-03T10:00", None, None, signature),
        ],
    )
    conn.commit()
    return conn


class ReportHistoryTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(rr.router)
        self.user = {"id": DOCTOR_A, "email": "a@lab.local", "role": "PHYSICIAN", "full_name": "dr. Ani"}
        app.dependency_overrides[auth_routes.get_current_user] = lambda: self.user
        self.client = TestClient(app)
        self.patch = patch.object(rr, "get_connection", return_value=make_db())
        self.patch.start()

    def tearDown(self):
        self.patch.stop()

    def as_role(self, role, user_id=1):
        self.user = {"id": user_id, "email": "x@lab.local", "role": role, "full_name": "X"}

    def test_physician_sees_only_own_approved_and_released_reports(self):
        response = self.client.get("/api/reports/history/physician")
        self.assertEqual(response.status_code, 200)
        items = response.json()
        self.assertEqual([item["report_number"] for item in items], ["LAB-3", "LAB-1"])
        self.assertEqual({item["status"] for item in items}, {"APPROVED", "RELEASED"})
        self.assertEqual(items[1]["patient_name"], "Pasien Satu")

    def test_physician_detail_is_limited_to_own_reports(self):
        own = self.client.get("/api/reports/history/physician/1")
        self.assertEqual(own.status_code, 200)
        self.assertEqual(own.json()["status"], "RELEASED")
        self.assertEqual(own.json()["clinical_interpretation"], "Interpretasi rahasia")
        other = self.client.get("/api/reports/history/physician/2")
        self.assertEqual(other.status_code, 404)

    def test_admin_sees_released_reports_without_patient_or_clinical_data(self):
        self.as_role("SUPER_ADMIN")
        response = self.client.get("/api/reports/history/admin")
        self.assertEqual(response.status_code, 200)
        items = response.json()
        self.assertEqual([item["report_number"] for item in items], ["LAB-2", "LAB-1"])
        self.assertEqual(items[0]["physician_name"], "dr. Budi")
        self.assertEqual(items[0]["released_by_name"], "dr. Budi")
        text = json.dumps(items)
        for leaked in ("Pasien", "RM-", "Interpretasi rahasia", "signature", "1990-01-01"):
            self.assertNotIn(leaked, text)

    def test_roles_cannot_use_each_others_history(self):
        for role in ("FRONT_OFFICE", "ANALYST", "PATIENT", "PHYSICIAN"):
            with self.subTest(role=role):
                self.as_role(role)
                self.assertEqual(self.client.get("/api/reports/history/admin").status_code, 403)
        for role in ("FRONT_OFFICE", "ANALYST", "PATIENT", "SUPER_ADMIN"):
            with self.subTest(role=role):
                self.as_role(role)
                self.assertEqual(self.client.get("/api/reports/history/physician").status_code, 403)
                self.assertEqual(self.client.get("/api/reports/history/physician/1").status_code, 403)


if __name__ == "__main__":
    unittest.main()
