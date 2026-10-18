"""
Registrasi pemeriksaan (langkah 1 alur kerja).

Front Office mendaftarkan pasien dan pemeriksaan baru, mencatat serah terima
sampel, dan mendapatkan kode sampel. Analis dan Super Admin tidak mengubah data
di sini; data makroskopis dan analisis diisi di langkah berikutnya.
"""
import json
import math
import secrets
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth_routes import hash_password, require_roles
from database.db_connection import DatabaseConnection, get_connection, log_audit_event

router = APIRouter(prefix="/api/examinations", tags=["examinations"])
patients_router = APIRouter(prefix="/api/patients", tags=["patients"])

FRONT_OFFICE = Depends(require_roles("FRONT_OFFICE"))
VIEW_ROLES = ("FRONT_OFFICE", "ANALYST", "PHYSICIAN")


ANALYST = Depends(require_roles("ANALYST"))


class MacroscopicUpdate(BaseModel):
    volume_ml: Optional[float] = Field(default=None, gt=0, le=20)
    liquefaction_time_min: Optional[int] = Field(default=None, ge=0, le=180)
    viscosity: Optional[Literal["NORMAL", "INCREASED", "DECREASED"]] = None
    ph_value: Optional[float] = Field(default=None, ge=0, le=14)
    appearance: Optional[str] = Field(default=None, max_length=100)
    macroscopic_notes: Optional[str] = Field(default=None, max_length=1000)


class ExaminationCreate(BaseModel):
    # Pasien: isi ID rekam medis jika sudah terdaftar; jika kosong, pasien baru dibuat
    medical_record_number: Optional[str] = Field(default=None, max_length=40)
    full_name: Optional[str] = Field(default=None, min_length=3, max_length=120)
    birth_date: Optional[date] = None
    gender: Optional[Literal["MALE", "FEMALE", "OTHER"]] = None
    phone: Optional[str] = Field(default=None, max_length=25)
    # Email untuk akun portal pasien; wajib jika pasien belum punya akun
    email: Optional[str] = Field(default=None, max_length=254, pattern=r'^[^@\s]+@[^@\s]+\.[^@\s]+$')

    # Jadwal pemeriksaan (waktu pengambilan sampel) dan serah terima sampel
    collection_datetime: datetime
    received_datetime: Optional[datetime] = None
    # Pemaksaan jadwal ganda pada hari yang sama; alasan wajib dan tercatat di log audit
    override_same_day: bool = False
    override_reason: Optional[str] = Field(default=None, max_length=300)
    abstinence_duration_hours: Optional[int] = Field(default=None, ge=0, le=720)
    # Waktu mulai pantang; pemeriksaan hanya boleh setelah pantang selesai (mulai + lama pantang)
    abstinence_start_at: Optional[datetime] = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat(timespec="minutes") if value else None


WIB = timezone(timedelta(hours=7))


def ensure_queue_columns() -> None:
    """Menambahkan kolom antrean ke database yang sudah ada (tanpa menghapus data)."""
    conn = get_connection()
    existing = {row["name"] for row in conn.execute("PRAGMA table_info(examinations)").fetchall()}
    if "queue_date" not in existing:
        conn.execute("ALTER TABLE examinations ADD COLUMN queue_date TEXT")
    if "queue_number" not in existing:
        conn.execute("ALTER TABLE examinations ADD COLUMN queue_number TEXT")
    if "abstinence_start_at" not in existing:
        conn.execute("ALTER TABLE examinations ADD COLUMN abstinence_start_at TEXT")
    if "abstinence_ready_at" not in existing:
        conn.execute("ALTER TABLE examinations ADD COLUMN abstinence_ready_at TEXT")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_exams_queue ON examinations(queue_date, queue_number)")
    conn.commit()


# Jadwal pemeriksaan: slot tetap, kapasitas per slot, dan nomor antrean berdasarkan urutan jam.
SLOT_MINUTES = 15
WORK_START_MINUTE = 0          # 00:00 WIB (layanan 24 jam)
WORK_END_MINUTE = 24 * 60       # 24:00 WIB (slot terakhir mulai 23:45)
SLOT_CAPACITY = 4             # jumlah pasien per slot; sesuaikan dengan kapasitas laboratorium


def _load_day_bookings(conn, day: str) -> list[dict]:
    """Pemeriksaan aktif pada satu tanggal, diurutkan menurut jam lalu id."""
    rows = conn.execute(
        """
        SELECT id, patient_id, collection_datetime
        FROM examinations WHERE queue_date = ? AND status <> 'CANCELLED'
        """,
        (day,),
    ).fetchall()
    bookings = [
        {
            "id": row["id"],
            "patient_id": row["patient_id"],
            "at": datetime.fromisoformat(row["collection_datetime"]).astimezone(WIB),
        }
        for row in rows
    ]
    return sorted(bookings, key=lambda b: (b["at"], b["id"]))


def _validate_schedule(
    conn, scheduled: datetime, patient_id: int, exclude_id: Optional[int] = None, override_same_day: bool = False
) -> tuple[str, bool]:
    """Memastikan jadwal valid dan tidak bertabrakan. Mengembalikan tanggal (YYYY-MM-DD) WIB dan
    apakah pasien dijadwalkan ganda pada hari yang sama atas pemaksaan (override)."""
    local = scheduled.astimezone(WIB)
    minute_of_day = local.hour * 60 + local.minute
    if local.second or local.microsecond or local.minute % SLOT_MINUTES:
        raise HTTPException(status_code=422, detail=f"Jadwal harus di jam kelipatan {SLOT_MINUTES} menit, misalnya 09:00 atau 09:15.")
    if not (WORK_START_MINUTE <= minute_of_day < WORK_END_MINUTE):
        raise HTTPException(status_code=422, detail="Di luar jam layanan.")
    if local <= datetime.now(WIB):
        raise HTTPException(status_code=422, detail="Jadwal sudah lewat. Pilih jam yang akan datang.")

    bookings = [b for b in _load_day_bookings(conn, local.date().isoformat()) if b["id"] != exclude_id]
    in_slot = [b for b in bookings if b["at"] == local]
    if len(in_slot) >= SLOT_CAPACITY:
        raise HTTPException(status_code=409, detail=f"Slot {local:%H:%M} sudah penuh. Pilih jam lain.")
    same_day_override = False
    if any(b["patient_id"] == patient_id for b in bookings):
        if not override_same_day:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "SAME_DAY_EXAM",
                    "message": "Pasien ini sudah memiliki pemeriksaan pada tanggal tersebut. Lanjutkan dengan pemaksaan dan isi alasan.",
                },
            )
        same_day_override = True
    return local.date().isoformat(), same_day_override


def _override_reason(payload_reason: Optional[str]) -> str:
    reason = (payload_reason or "").strip()
    if len(reason) < 10:
        raise HTTPException(status_code=422, detail="Isi alasan pemaksaan jadwal minimal 10 karakter.")
    return reason


def _as_wib(value: datetime) -> datetime:
    """Waktu tanpa zona dianggap WIB, karena klinik berada di WIB."""
    return value.replace(tzinfo=WIB) if value.tzinfo is None else value.astimezone(WIB)


# Pedoman WHO (laboratory manual semen): pantang seksual 2–7 hari sebelum pengambilan sampel.
ABSTINENCE_MIN_HOURS = 48
ABSTINENCE_MAX_HOURS = 168
ABSTINENCE_DEFAULT_HOURS = 72


def _abstinence_ready_at(payload, scheduled: datetime) -> Optional[datetime]:
    """Waktu siap diperiksa = mulai pantang + lama pantang. Jadwal tidak boleh sebelum itu."""
    if payload.abstinence_start_at is None and payload.abstinence_duration_hours is None:
        return None
    if payload.abstinence_start_at is None or payload.abstinence_duration_hours is None:
        raise HTTPException(status_code=422, detail="Isi waktu mulai pantang dan lama pantang bersama-sama.")
    if not (ABSTINENCE_MIN_HOURS <= payload.abstinence_duration_hours <= ABSTINENCE_MAX_HOURS):
        raise HTTPException(status_code=422, detail="Lama pantang harus 2–7 hari (48–168 jam) sesuai pedoman WHO.")
    ready = _as_wib(payload.abstinence_start_at)
    ready = ready + timedelta(hours=payload.abstinence_duration_hours)
    if scheduled < ready:
        raise HTTPException(
            status_code=422,
            detail=f"Pantang belum selesai. Pasien siap diperiksa mulai {ready.astimezone(WIB):%d-%m-%Y %H:%M} WIB.",
        )
    return ready


def _renumber_day(conn, day: str) -> None:
    """Memberi nomor antrean A-001, A-002, … sesuai urutan jam pada tanggal itu."""
    for number, booking in enumerate(_load_day_bookings(conn, day), start=1):
        conn.execute(
            "UPDATE examinations SET queue_number = ?, queue_date = ? WHERE id = ?",
            (f"A-{number:03d}", day, booking["id"]),
        )


# Tanpa huruf/angka yang mirip (0/O, 1/I/L) agar mudah dibaca dan diketik
PORTAL_PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def _create_portal_account(conn, patient_id: int, full_name: str, phone: Optional[str], email: str) -> str:
    """Membuat akun portal pasien dengan kata sandi acak. Mengembalikan kata sandi tersebut (hanya sekali tampil)."""
    email = email.strip().lower()
    if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
        raise HTTPException(status_code=409, detail="Email sudah digunakan akun lain. Gunakan email pasien yang berbeda.")
    temporary_password = "-".join(
        "".join(secrets.choice(PORTAL_PASSWORD_ALPHABET) for _ in range(4)) for _ in range(2)
    )
    cursor = conn.execute(
        """
        INSERT INTO users (email, password_hash, full_name, role, phone_number)
        VALUES (?, ?, ?, 'PATIENT', ?)
        """,
        (email, hash_password(temporary_password), full_name.strip(), phone.strip() if phone else None),
    )
    conn.execute(
        "UPDATE patients SET user_id = ?, email = ?, updated_at = datetime('now') WHERE id = ?",
        (cursor.lastrowid, email, patient_id),
    )
    return temporary_password


def _new_sample_code(conn) -> str:
    for _ in range(5):
        candidate = f"SMP-{_now():%Y%m%d}-{secrets.token_hex(3).upper()}"
        if conn.execute("SELECT 1 FROM examinations WHERE sample_code = ?", (candidate,)).fetchone() is None:
            return candidate
    raise HTTPException(status_code=500, detail="Gagal membuat kode sampel. Coba lagi.")


def _new_medical_record_number(conn) -> str:
    """Nomor rekam medis otomatis, berurutan per tahun: RM-2026-000001, RM-2026-000002, …"""
    prefix = f"RM-{_now().astimezone(WIB).year}-"
    rows = conn.execute(
        "SELECT medical_record_number FROM patients WHERE medical_record_number LIKE ?", (prefix + "%",)
    ).fetchall()
    numbers = [int(row[0][len(prefix):]) for row in rows if row[0][len(prefix):].isdigit()]
    return f"{prefix}{max(numbers, default=0) + 1:06d}"


def _resolve_patient(conn, payload: ExaminationCreate, actor_id: int) -> int:
    """Mengembalikan id pasien: pasien lama lewat nomor rekam medis, atau pasien baru."""
    if payload.medical_record_number:
        row = conn.execute(
            "SELECT id FROM patients WHERE medical_record_number = ?",
            (payload.medical_record_number.strip(),),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Nomor rekam medis tidak ditemukan.")
        return row["id"]

    if not payload.full_name or not payload.birth_date:
        raise HTTPException(status_code=422, detail="Isi nama lengkap dan tanggal lahir untuk pasien baru.")
    today = _now().date()
    if payload.birth_date >= today or payload.birth_date.year < today.year - 130:
        raise HTTPException(status_code=422, detail="Tanggal lahir tidak valid.")
    _ensure_not_duplicate(conn, payload.full_name, payload.birth_date)

    cursor = conn.execute(
        """
        INSERT INTO patients (medical_record_number, full_name, date_of_birth, gender, phone_number, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            _new_medical_record_number(conn),
            payload.full_name.strip(),
            payload.birth_date.isoformat(),
            payload.gender,
            payload.phone.strip() if payload.phone else None,
            actor_id,
        ),
    )
    return cursor.lastrowid


def check_analysis_target(examination_id: int, user: dict) -> None:
    """Dipanggil sebelum analisis dijalankan: sampel harus milik analis ini dan data makroskopisnya sudah diisi."""
    conn = get_connection()
    row = conn.execute(
        "SELECT status, current_analyst_id, volume_ml FROM examinations WHERE id = ?", (examination_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Pemeriksaan tidak ditemukan.")
    if row["status"] != "IN_PROGRESS" or row["current_analyst_id"] != user["id"]:
        raise HTTPException(status_code=409, detail="Terima sampel ini terlebih dahulu sebelum menjalankan analisis.")
    if row["volume_ml"] is None:
        raise HTTPException(status_code=409, detail="Isi data makroskopis sampel sebelum menjalankan analisis.")


def _safe_pct(value) -> Optional[float]:
    if isinstance(value, (int, float)) and math.isfinite(value) and 0 <= value <= 100:
        return float(value)
    return None


def _safe_unit(value) -> Optional[float]:
    if isinstance(value, (int, float)) and math.isfinite(value) and 0 <= value <= 1:
        return float(value)
    return None


def persist_video_analysis(examination_id: int, actor_id: int, source_path: str, output_video_path: str,
                           heatmap_path: Optional[str], data: dict, calibration: dict, model_path: str,
                           conf_thres: float, expected_run_id: Optional[int] = None) -> int:
    """Menyimpan berkas dan hasil analisis video ke database. Mengembalikan id analysis_runs."""
    conn = DatabaseConnection().connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        target = conn.execute("SELECT status, current_analyst_id FROM examinations WHERE id = ?", (examination_id,)).fetchone()
        if target is None or target["status"] != "IN_PROGRESS" or target["current_analyst_id"] != actor_id:
            raise HTTPException(status_code=409, detail="Pemeriksaan tidak lagi dapat diubah oleh analis ini.")
        if expected_run_id is not None:
            latest = conn.execute("SELECT id FROM analysis_runs WHERE examination_id = ? AND status = 'COMPLETED' ORDER BY id DESC LIMIT 1", (examination_id,)).fetchone()
            if latest is None or latest["id"] != expected_run_id:
                raise HTTPException(status_code=409, detail="Pemeriksaan sudah memiliki analisis yang lebih baru. Koreksi lama tidak disimpan.")
        def add_media(asset_type: str, path: str) -> int:
            file_path = Path(path)
            cursor = conn.execute(
                """
                INSERT INTO media_assets (examination_id, asset_type, file_name, file_size_bytes, storage_path, uploaded_by)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (examination_id, asset_type, file_path.name, file_path.stat().st_size, str(file_path), actor_id),
            )
            return cursor.lastrowid

        source_id = add_media("VIDEO_SOURCE", source_path)
        annotated_id = add_media("ANNOTATED_VIDEO", output_video_path)
        heatmap_id = add_media("HEATMAP", heatmap_path) if heatmap_path else None

        summary = data.get("summary") or {}
        motion = data.get("motion") or {}
        motility = summary.get("motility_available") is not False
        now = _now().isoformat(timespec="seconds")
        cursor = conn.execute(
            """
            INSERT INTO analysis_runs (
                examination_id, source_media_id, calibration_snapshot, status, model_checkpoint,
                config_params, started_at, completed_at, pr_percentage, np_percentage, im_percentage,
                avg_speed_um_s, avg_linearity, tracking_data_json
            ) VALUES (?, ?, ?, 'COMPLETED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                examination_id,
                source_id,
                json.dumps(calibration),
                Path(model_path).name,
                json.dumps({"conf_thres": conf_thres}),
                now,
                now,
                _safe_pct(summary.get("progressive_percent")) if motility else None,
                _safe_pct(summary.get("non_progressive_percent")) if motility else None,
                _safe_pct(summary.get("immotile_percent")) if motility else None,
                motion.get("average_speed") if motility and isinstance(motion.get("average_speed"), (int, float)) else None,
                _safe_unit(motion.get("average_linearity")) if motility else None,
                json.dumps(data, allow_nan=False),
            ),
        )
        run_id = cursor.lastrowid
        # Hubungkan artefak hasil dengan run yang tepat agar dokter selalu melihat
        # video dan heatmap dari revisi analisis yang sedang ditinjau.
        output_ids = [annotated_id] + ([heatmap_id] if heatmap_id else [])
        conn.execute(
            f"UPDATE media_assets SET analysis_run_id = ? WHERE id IN ({','.join('?' for _ in output_ids)})",
            (run_id, *output_ids),
        )
        conn.commit()
        return run_id
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _examination_detail(conn, examination_id: int) -> dict:
    row = conn.execute(
        """
        SELECT e.id, e.sample_code, e.status, e.collection_datetime, e.received_datetime,
               e.abstinence_duration_hours, e.abstinence_start_at, e.abstinence_ready_at,
               e.created_at, p.medical_record_number, p.full_name,
               e.volume_ml, e.liquefaction_time_min, e.viscosity, e.ph_value, e.appearance,
               e.macroscopic_notes, e.current_analyst_id, e.queue_number, e.queue_date
        FROM examinations e JOIN patients p ON p.id = e.patient_id
        WHERE e.id = ?
        """,
        (examination_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Pemeriksaan tidak ditemukan.")
    data = _examination_row(row)
    data.update({
        "volume_ml": row["volume_ml"],
        "liquefaction_time_min": row["liquefaction_time_min"],
        "viscosity": row["viscosity"],
        "ph_value": row["ph_value"],
        "appearance": row["appearance"],
        "macroscopic_notes": row["macroscopic_notes"],
        "current_analyst_id": row["current_analyst_id"],
    })
    return data


# Status internal (dipakai alur kerja) dipetakan ke tiga label yang tampil di semua tabel.
PUBLIC_STATUS = {
    "REGISTERED": "Menunggu jadwal",
    "IN_PROGRESS": "Proses dokter",
    "RETURNED_FOR_CORRECTION": "Proses dokter",
    "PENDING_REVIEW": "Proses dokter",
    "FAILED_ANALYSIS": "Proses dokter",
    "APPROVED": "Periksa selesai",
    "RELEASED": "Periksa selesai",
    "CANCELLED": "Dibatalkan",
}


def public_status(code: str, analyst_id: Optional[int] = None) -> str:
    # Sampel yang baru dikirim Front Office dan belum diambil analis punya label sendiri
    if code == "IN_PROGRESS" and analyst_id is None:
        return "Dikirim ke analis"
    return PUBLIC_STATUS.get(code, code)


def _examination_row(row) -> dict:
    return {
        "id": row["id"],
        "sample_code": row["sample_code"],
        "status": row["status"],
        "status_label": public_status(row["status"], row["current_analyst_id"] if "current_analyst_id" in row.keys() else None),
        "medical_record_number": row["medical_record_number"],
        "patient_name": row["full_name"],
        "collection_datetime": row["collection_datetime"],
        "received_datetime": row["received_datetime"],
        "abstinence_duration_hours": row["abstinence_duration_hours"],
        # Waktu mulai pantang dan waktu paling awal pasien boleh diperiksa (untuk kartu jadwal)
        "abstinence_start_at": row["abstinence_start_at"] if "abstinence_start_at" in row.keys() else None,
        "abstinence_ready_at": row["abstinence_ready_at"] if "abstinence_ready_at" in row.keys() else None,
        "created_at": row["created_at"],
        "queue_number": row["queue_number"],
        "queue_date": row["queue_date"],
        "current_analyst_id": row["current_analyst_id"] if "current_analyst_id" in row.keys() else None,
        "received_datetime": row["received_datetime"],
    }


@router.post("", status_code=201)
def create_examination(payload: ExaminationCreate, user: dict = FRONT_OFFICE):
    conn = get_connection()
    try:
        patient_id = _resolve_patient(conn, payload, user["id"])
        patient = conn.execute(
            "SELECT full_name, phone_number, user_id FROM patients WHERE id = ?", (patient_id,)
        ).fetchone()
        temporary_password = None
        if patient["user_id"] is None:
            if not payload.email:
                raise HTTPException(status_code=422, detail="Isi email pasien untuk membuatkan akun portal.")
            temporary_password = _create_portal_account(
                conn, patient_id, patient["full_name"], patient["phone_number"], payload.email
            )
        # Sampel belum tentu sudah diterima saat pendaftaran (pemeriksaan bisa dijadwalkan).
        # Waktu penerimaan hanya dicatat jika diisi, dan harus tidak sebelum waktu pengambilan.
        received = payload.received_datetime
        if received is not None and received.tzinfo is None:
            received = received.replace(tzinfo=timezone.utc)
        collected = payload.collection_datetime
        if collected.tzinfo is None:
            collected = collected.replace(tzinfo=timezone.utc)
        if received is not None and collected > received + timedelta(minutes=5):
            raise HTTPException(status_code=422, detail="Waktu pengambilan tidak boleh setelah waktu penerimaan.")

        sample_code = _new_sample_code(conn)
        queue_date, same_day_override = _validate_schedule(
            conn, collected, patient_id, override_same_day=payload.override_same_day
        )
        if same_day_override:
            override_reason = _override_reason(payload.override_reason)
        ready_at = _abstinence_ready_at(payload, collected)
        cursor = conn.execute(
            """
            INSERT INTO examinations (
                patient_id, sample_code, collection_datetime, received_datetime,
                abstinence_duration_hours, status, created_by, queue_date, queue_number,
                abstinence_start_at, abstinence_ready_at
            ) VALUES (?, ?, ?, ?, ?, 'REGISTERED', ?, ?, ?, ?, ?)
            """,
            (
                patient_id,
                sample_code,
                _iso(collected),
                _iso(received),
                payload.abstinence_duration_hours,
                user["id"],
                queue_date,
                None,
                _iso(_as_wib(payload.abstinence_start_at)) if payload.abstinence_start_at else None,
                _iso(ready_at) if ready_at else None,
            ),
        )
        _renumber_day(conn, queue_date)
        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise HTTPException(status_code=500, detail="Registrasi pemeriksaan gagal. Coba lagi.")

    log_audit_event(
        actor_id=user["id"],
        action_type="REGISTER_EXAMINATION",
        description=f"Pemeriksaan {sample_code} didaftarkan",
        target_type="examination",
        target_id=cursor.lastrowid,
        actor_email=user["email"],
        actor_role=user["role"],
    )
    if same_day_override:
        log_audit_event(
            actor_id=user["id"],
            action_type="OVERRIDE_SAME_DAY_BOOKING",
            description=f"Pemeriksaan {sample_code} dijadwalkan ganda pada hari yang sama. Alasan: {override_reason}",
            target_type="examination",
            target_id=cursor.lastrowid,
            actor_email=user["email"],
            actor_role=user["role"],
        )
    row = conn.execute(
        """
        SELECT e.id, e.sample_code, e.status, e.collection_datetime, e.received_datetime,
               e.abstinence_duration_hours, e.abstinence_start_at, e.abstinence_ready_at,
               e.created_at, e.queue_number, e.queue_date, p.medical_record_number, p.full_name
        FROM examinations e JOIN patients p ON p.id = e.patient_id
        WHERE e.id = ?
        """,
        (cursor.lastrowid,),
    ).fetchone()
    result = _examination_row(row)
    result["portal_account"] = (
        {"email": payload.email.strip().lower(), "temporary_password": temporary_password}
        if temporary_password
        else None
    )
    return result


@router.post("/{examination_id}/receive")
def receive_examination(examination_id: int, user: dict = ANALYST):
    """Analis menerima sampel: status REGISTERED berubah menjadi IN_PROGRESS."""
    conn = get_connection()
    row = conn.execute(
        "SELECT id, status, sample_code, current_analyst_id FROM examinations WHERE id = ?", (examination_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Pemeriksaan tidak ditemukan.")
    # Sampel yang sudah diserahkan Front Office (IN_PROGRESS tanpa analis) boleh diambil analis
    waiting = row["status"] in ("REGISTERED", "RETURNED_FOR_CORRECTION") or (
        row["status"] == "IN_PROGRESS" and row["current_analyst_id"] is None
    )
    if not waiting:
        raise HTTPException(status_code=409, detail="Sampel ini sudah diambil analis atau tidak lagi menunggu penerimaan.")
    ready_row = conn.execute("SELECT abstinence_ready_at FROM examinations WHERE id = ?", (examination_id,)).fetchone()
    if ready_row["abstinence_ready_at"] and datetime.fromisoformat(ready_row["abstinence_ready_at"]) > _now():
        raise HTTPException(status_code=409, detail="Pantang pasien belum selesai. Sampel belum bisa diterima untuk pemeriksaan.")
    conn.execute(
        """
        UPDATE examinations
        SET status = 'IN_PROGRESS', current_analyst_id = ?, updated_at = datetime('now'),
            received_datetime = COALESCE(received_datetime, ?)
        WHERE id = ? AND (status IN ('REGISTERED', 'RETURNED_FOR_CORRECTION')
                          OR (status = 'IN_PROGRESS' AND current_analyst_id IS NULL))
        """,
        (user["id"], _iso(_now()), examination_id),
    )
    conn.commit()
    log_audit_event(
        actor_id=user["id"],
        action_type="RECEIVE_SAMPLE",
        description=f"Sampel {row['sample_code']} diterima analis",
        target_type="examination",
        target_id=examination_id,
        actor_email=user["email"],
        actor_role=user["role"],
    )
    return _examination_detail(conn, examination_id)


@router.post("/{examination_id}/submit")
def submit_for_review(examination_id: int, user: dict = ANALYST):
    """Analis mengirim sampel ke dokter setelah analisis selesai dan data makroskopis lengkap."""
    conn = get_connection()
    row = conn.execute(
        "SELECT status, current_analyst_id, volume_ml, sample_code FROM examinations WHERE id = ?", (examination_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Pemeriksaan tidak ditemukan.")
    if row["status"] != "IN_PROGRESS" or row["current_analyst_id"] != user["id"]:
        raise HTTPException(status_code=409, detail="Sampel ini tidak sedang Anda proses.")
    if row["volume_ml"] is None:
        raise HTTPException(status_code=409, detail="Lengkapi data makroskopis sebelum mengirim ke dokter.")
    has_run = conn.execute(
        "SELECT 1 FROM analysis_runs WHERE examination_id = ? AND status = 'COMPLETED' LIMIT 1", (examination_id,)
    ).fetchone()
    if has_run is None:
        raise HTTPException(status_code=409, detail="Jalankan analisis video untuk sampel ini sebelum mengirim ke dokter.")

    try:
        conn.execute(
            """
            UPDATE examinations SET status = 'PENDING_REVIEW', updated_at = datetime('now')
            WHERE id = ? AND status = 'IN_PROGRESS'
            """,
            (examination_id,),
        )
        conn.execute(
            """
            INSERT INTO review_events (examination_id, event_type, actor_id, actor_role, action, reason)
            VALUES (?, 'SUBMIT_FOR_REVIEW', ?, ?, 'SUBMIT', 'Analisis selesai, dikirim ke dokter')
            """,
            (examination_id, user["id"], user["role"]),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise HTTPException(status_code=500, detail="Pengiriman ke dokter gagal. Coba lagi.")

    log_audit_event(
        actor_id=user["id"],
        action_type="SUBMIT_FOR_REVIEW",
        description=f"Sampel {row['sample_code']} dikirim ke dokter",
        target_type="examination",
        target_id=examination_id,
        actor_email=user["email"],
        actor_role=user["role"],
    )
    return _examination_detail(conn, examination_id)


@router.put("/{examination_id}/macroscopic")
def update_macroscopic(examination_id: int, payload: MacroscopicUpdate, user: dict = ANALYST):
    """Analis mengisi data makroskopis sampel yang sedang ia tangani."""
    conn = get_connection()
    row = conn.execute(
        "SELECT status, current_analyst_id FROM examinations WHERE id = ?", (examination_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Pemeriksaan tidak ditemukan.")
    if row["status"] != "IN_PROGRESS" or row["current_analyst_id"] != user["id"]:
        raise HTTPException(status_code=409, detail="Terima sampel ini terlebih dahulu untuk mengisi data makroskopis.")

    values = payload.model_dump()
    conn.execute(
        """
        UPDATE examinations
        SET volume_ml = ?, liquefaction_time_min = ?, viscosity = ?, ph_value = ?,
            appearance = ?, macroscopic_notes = ?, updated_at = datetime('now')
        WHERE id = ?
        """,
        (
            values["volume_ml"],
            values["liquefaction_time_min"],
            values["viscosity"],
            values["ph_value"],
            values["appearance"].strip() if values["appearance"] else None,
            values["macroscopic_notes"].strip() if values["macroscopic_notes"] else None,
            examination_id,
        ),
    )
    conn.commit()
    return _examination_detail(conn, examination_id)


@router.get("")
def list_examinations(user: dict = Depends(require_roles(*VIEW_ROLES))):
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT e.id, e.sample_code, e.status, e.collection_datetime, e.received_datetime,
               e.abstinence_duration_hours, e.abstinence_start_at, e.abstinence_ready_at,
               e.created_at, e.queue_number, e.queue_date,
               e.current_analyst_id, p.medical_record_number, p.full_name,
               e.volume_ml,
               EXISTS (
                   SELECT 1 FROM analysis_runs ar
                   WHERE ar.examination_id = e.id AND ar.status = 'COMPLETED'
               ) AS has_completed_analysis
        FROM examinations e JOIN patients p ON p.id = e.patient_id
        WHERE e.status <> 'CANCELLED'
        ORDER BY e.collection_datetime DESC, e.id DESC
        LIMIT 500
        """
    ).fetchall()

    def _row_with_macro(row):
        data = _examination_row(row)
        data["volume_ml"] = row["volume_ml"]
        data["has_completed_analysis"] = bool(row["has_completed_analysis"])
        return data

    return [_row_with_macro(row) for row in rows]


@router.get("/slots")
def list_slots(date: str = Query(pattern=r"^\d{4}-\d{2}-\d{2}$"), user: dict = FRONT_OFFICE):
    """Ketersediaan slot pada satu tanggal, untuk dipilih saat penjadwalan."""
    try:
        day = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=422, detail="Tanggal tidak valid.")
    now = datetime.now(WIB)
    conn = get_connection()
    counts: dict[str, int] = {}
    for booking in _load_day_bookings(conn, day.isoformat()):
        key = booking["at"].strftime("%H:%M")
        counts[key] = counts.get(key, 0) + 1

    slots = []
    for minute in range(WORK_START_MINUTE, WORK_END_MINUTE, SLOT_MINUTES):
        start = datetime(day.year, day.month, day.day, minute // 60, minute % 60, tzinfo=WIB)
        label = f"{minute // 60:02d}:{minute % 60:02d}"
        booked = counts.get(label, 0)
        past = start <= now
        slots.append({
            "time": label,
            "booked": booked,
            "capacity": SLOT_CAPACITY,
            "available": (not past) and booked < SLOT_CAPACITY,
            "past": past,
        })
    return {"date": day.isoformat(), "slot_minutes": SLOT_MINUTES, "capacity": SLOT_CAPACITY, "slots": slots}


@router.get("/mine")
def my_queue(user: dict = Depends(require_roles("PATIENT"))):
    """Antrean dan jadwal pemeriksaan milik pasien yang sedang masuk."""
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT e.id, e.sample_code, e.status, e.collection_datetime, e.queue_date, e.queue_number,
               e.current_analyst_id, e.abstinence_duration_hours, e.abstinence_ready_at, p.full_name, p.medical_record_number, p.date_of_birth,
               p.gender, p.phone_number, p.email
        FROM examinations e JOIN patients p ON p.id = e.patient_id
        WHERE p.user_id = ? AND e.status <> 'CANCELLED'
        ORDER BY e.collection_datetime DESC, e.id DESC
        """,
        (user["id"],),
    ).fetchall()
    if not rows:
        profile = conn.execute(
            """
            SELECT p.full_name, p.medical_record_number, p.date_of_birth, p.gender, p.phone_number, p.email
            FROM patients p WHERE p.user_id = ?
            """,
            (user["id"],),
        ).fetchone()
    else:
        profile = rows[0]
    return {
        "profile": None if profile is None else {
            "full_name": profile["full_name"],
            "medical_record_number": profile["medical_record_number"],
            "date_of_birth": profile["date_of_birth"],
            "gender": profile["gender"],
            "phone_number": profile["phone_number"],
            "email": profile["email"],
        },
        "items": [
            {
                "id": row["id"],
                "sample_code": row["sample_code"],
                "queue_number": row["queue_number"],
                "queue_date": row["queue_date"],
                "scheduled_at": row["collection_datetime"],
                "abstinence_duration_hours": row["abstinence_duration_hours"],
                "ready_at": row["abstinence_ready_at"],
                "status_label": public_status(row["status"], row["current_analyst_id"]),
                "patient_name": row["full_name"],
            }
            for row in rows
        ],
    }


class PortalAccountCreate(BaseModel):
    medical_record_number: str = Field(min_length=3, max_length=40)
    email: str = Field(min_length=5, max_length=254, pattern=r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
    password: str = Field(min_length=8, max_length=256)


@patients_router.post("/portal-account", status_code=201)
def create_portal_account(payload: PortalAccountCreate, user: dict = FRONT_OFFICE):
    """Front Office membuatkan akun portal untuk pasien yang sudah terdaftar."""
    conn = get_connection()
    patient = conn.execute(
        "SELECT id, full_name, phone_number, user_id FROM patients WHERE medical_record_number = ?",
        (payload.medical_record_number.strip(),),
    ).fetchone()
    if patient is None:
        raise HTTPException(status_code=404, detail="Nomor rekam medis tidak ditemukan.")
    if patient["user_id"] is not None:
        raise HTTPException(status_code=409, detail="Pasien ini sudah memiliki akun portal.")
    email = payload.email.strip().lower()
    if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
        raise HTTPException(status_code=409, detail="Email sudah digunakan akun lain.")
    try:
        cursor = conn.execute(
            """
            INSERT INTO users (email, password_hash, full_name, role, phone_number)
            VALUES (?, ?, ?, 'PATIENT', ?)
            """,
            (email, hash_password(payload.password), patient["full_name"], patient["phone_number"]),
        )
        account_id = cursor.lastrowid
        conn.execute(
            "UPDATE patients SET user_id = ?, email = ?, updated_at = datetime('now') WHERE id = ?",
            (account_id, email, patient["id"]),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise HTTPException(status_code=500, detail="Akun portal gagal dibuat. Coba lagi.")

    log_audit_event(
        actor_id=user["id"],
        action_type="CREATE_PATIENT_ACCOUNT",
        description=f"Akun portal dibuat untuk pasien {payload.medical_record_number.strip()}",
        target_type="patient",
        target_id=patient["id"],
        actor_email=user["email"],
        actor_role=user["role"],
    )
    return {"medical_record_number": payload.medical_record_number.strip(), "email": email, "account_id": account_id}


# ---------------------------------------------------------------------------
# Front Office: ubah dan batalkan (CRUD tanpa hapus permanen)
# ---------------------------------------------------------------------------

class PatientUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=3, max_length=120)
    birth_date: Optional[date] = None
    gender: Optional[Literal["MALE", "FEMALE", "OTHER"]] = None
    phone: Optional[str] = Field(default=None, max_length=25)
    email: Optional[str] = Field(default=None, max_length=254, pattern=r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


class ScheduleUpdate(BaseModel):
    collection_datetime: datetime
    override_same_day: bool = False
    override_reason: Optional[str] = Field(default=None, max_length=300)


class PatientCreate(BaseModel):
    full_name: str = Field(min_length=3, max_length=120)
    birth_date: date
    gender: Optional[Literal["MALE", "FEMALE", "OTHER"]] = None
    phone: Optional[str] = Field(default=None, max_length=25)
    email: str = Field(min_length=5, max_length=254, pattern=r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def _ensure_not_duplicate(conn, full_name: str, birth: date) -> None:
    row = conn.execute(
        "SELECT medical_record_number FROM patients WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(?)) AND date_of_birth = ?",
        (full_name, birth.isoformat()),
    ).fetchone()
    if row is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Pasien dengan nama dan tanggal lahir yang sama sudah terdaftar (No. RM {row['medical_record_number']}). Pilih pasien tersebut, jangan daftar ulang.",
        )


@patients_router.post("", status_code=201)
def register_patient(payload: PatientCreate, user: dict = FRONT_OFFICE):
    """Mendaftarkan pasien baru beserta akun portalnya. Jadwal pemeriksaan dibuat terpisah."""
    today = _now().astimezone(WIB).date()
    if payload.birth_date >= today or payload.birth_date.year < today.year - 130:
        raise HTTPException(status_code=422, detail="Tanggal lahir tidak valid.")
    conn = get_connection()
    _ensure_not_duplicate(conn, payload.full_name, payload.birth_date)
    try:
        mrn = _new_medical_record_number(conn)
        cursor = conn.execute(
            """
            INSERT INTO patients (medical_record_number, full_name, date_of_birth, gender, phone_number, created_by)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (mrn, payload.full_name.strip(), payload.birth_date.isoformat(), payload.gender,
             payload.phone.strip() if payload.phone else None, user["id"]),
        )
        patient_id = cursor.lastrowid
        temporary_password = _create_portal_account(conn, patient_id, payload.full_name, payload.phone, payload.email)
        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise HTTPException(status_code=500, detail="Pendaftaran pasien gagal. Coba lagi.")

    log_audit_event(
        actor_id=user["id"],
        action_type="REGISTER_PATIENT",
        description=f"Pasien {payload.full_name.strip()} terdaftar dengan No. RM {mrn}",
        target_type="patient",
        target_id=patient_id,
        actor_email=user["email"],
        actor_role=user["role"],
    )
    return {
        "id": patient_id,
        "medical_record_number": mrn,
        "full_name": payload.full_name.strip(),
        "portal_account": {"email": payload.email.strip().lower(), "temporary_password": temporary_password},
    }


@patients_router.get("")
def list_patients(user: dict = FRONT_OFFICE):
    """Daftar seluruh pasien untuk Front Office."""
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT p.id, p.medical_record_number, p.full_name, p.date_of_birth, p.gender,
               p.phone_number, p.email, p.user_id,
               (SELECT COUNT(*) FROM examinations e WHERE e.patient_id = p.id AND e.status <> 'CANCELLED') AS exam_count
        FROM patients p
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT 500
        """
    ).fetchall()
    return [
        {
            "id": row["id"],
            "medical_record_number": row["medical_record_number"],
            "full_name": row["full_name"],
            "date_of_birth": row["date_of_birth"],
            "gender": row["gender"],
            "phone_number": row["phone_number"],
            "email": row["email"],
            "has_portal_account": row["user_id"] is not None,
            "exam_count": row["exam_count"],
        }
        for row in rows
    ]


@patients_router.put("/{patient_id}")
def update_patient(patient_id: int, payload: PatientUpdate, user: dict = FRONT_OFFICE):
    """Ubah data pribadi pasien. Email yang juga dipakai akun portal ikut diubah."""
    conn = get_connection()
    patient = conn.execute("SELECT * FROM patients WHERE id = ?", (patient_id,)).fetchone()
    if patient is None:
        raise HTTPException(status_code=404, detail="Pasien tidak ditemukan.")

    changes = payload.model_dump(exclude_unset=True)
    new_email = changes["email"].strip().lower() if changes.get("email") else (patient["email"] or "")
    if new_email and new_email != (patient["email"] or "").lower():
        taken = conn.execute(
            "SELECT 1 FROM users WHERE email = ? AND id <> COALESCE(?, -1)", (new_email, patient["user_id"])
        ).fetchone()
        if taken:
            raise HTTPException(status_code=409, detail="Email sudah digunakan akun lain.")

    full_name = changes["full_name"].strip() if changes.get("full_name") else patient["full_name"]
    birth = changes["birth_date"].isoformat() if changes.get("birth_date") else patient["date_of_birth"]
    gender = changes["gender"] if "gender" in changes else patient["gender"]
    phone = (changes["phone"] or "").strip() if "phone" in changes else (patient["phone_number"] or "")
    phone = phone or None
    try:
        conn.execute(
            """
            UPDATE patients SET full_name = ?, date_of_birth = ?, gender = ?, phone_number = ?, email = ?,
                   updated_at = datetime('now')
            WHERE id = ?
            """,
            (full_name, birth, gender, phone, new_email or None, patient_id),
        )
        if patient["user_id"] is not None:
            conn.execute(
                "UPDATE users SET full_name = ?, email = ?, phone_number = ?, updated_at = datetime('now') WHERE id = ?",
                (full_name, new_email, phone, patient["user_id"]),
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise HTTPException(status_code=500, detail="Perubahan data pasien gagal disimpan.")

    log_audit_event(
        actor_id=user["id"],
        action_type="UPDATE_PATIENT",
        description=f"Data pasien {patient['medical_record_number']} diubah: {', '.join(sorted(changes.keys())) or 'tanpa perubahan'}",
        target_type="patient",
        target_id=patient_id,
        actor_email=user["email"],
        actor_role=user["role"],
    )
    return {"id": patient_id, "updated": sorted(changes.keys())}


@router.put("/{examination_id}/schedule")
def reschedule_examination(examination_id: int, payload: ScheduleUpdate, user: dict = FRONT_OFFICE):
    """Ubah jadwal pemeriksaan yang belum diterima laboratorium. Aturan jadwal tetap berlaku."""
    conn = get_connection()
    row = conn.execute(
        "SELECT id, patient_id, status, queue_date, sample_code, abstinence_ready_at FROM examinations WHERE id = ?",
        (examination_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Pemeriksaan tidak ditemukan.")
    if row["status"] != "REGISTERED":
        raise HTTPException(status_code=409, detail="Jadwal hanya bisa diubah sebelum sampel diterima laboratorium.")

    scheduled = payload.collection_datetime
    if scheduled.tzinfo is None:
        scheduled = scheduled.replace(tzinfo=WIB)
    if row["abstinence_ready_at"] and scheduled < datetime.fromisoformat(row["abstinence_ready_at"]):
        raise HTTPException(status_code=422, detail="Jadwal baru masih sebelum pasien siap diperiksa (pantang belum selesai).")

    old_day = row["queue_date"]
    try:
        new_day, same_day_override = _validate_schedule(
            conn, scheduled, row["patient_id"], exclude_id=examination_id, override_same_day=payload.override_same_day
        )
        if same_day_override:
            override_reason = _override_reason(payload.override_reason)
        conn.execute(
            "UPDATE examinations SET collection_datetime = ?, updated_at = datetime('now') WHERE id = ?",
            (_iso(scheduled), examination_id),
        )
        _renumber_day(conn, new_day)
        if old_day and old_day != new_day:
            _renumber_day(conn, old_day)
        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise HTTPException(status_code=500, detail="Perubahan jadwal gagal disimpan.")

    log_audit_event(
        actor_id=user["id"],
        action_type="RESCHEDULE_EXAMINATION",
        description=f"Jadwal {row['sample_code']} diubah ke {scheduled.astimezone(WIB):%d-%m-%Y %H:%M} WIB",
        target_type="examination",
        target_id=examination_id,
        actor_email=user["email"],
        actor_role=user["role"],
    )
    if same_day_override:
        log_audit_event(
            actor_id=user["id"],
            action_type="OVERRIDE_SAME_DAY_BOOKING",
            description=f"Jadwal {row['sample_code']} dipaksa ganda pada hari yang sama. Alasan: {override_reason}",
            target_type="examination",
            target_id=examination_id,
            actor_email=user["email"],
            actor_role=user["role"],
        )
    return _examination_detail(conn, examination_id)


@router.post("/{examination_id}/cancel")
def cancel_examination(examination_id: int, user: dict = FRONT_OFFICE):
    """Membatalkan pemeriksaan yang belum diterima laboratorium. Data tidak dihapus."""
    conn = get_connection()
    row = conn.execute(
        """
        SELECT e.id, e.status, e.queue_date, e.sample_code, e.collection_datetime,
               p.full_name AS patient_name, p.medical_record_number
        FROM examinations e JOIN patients p ON p.id = e.patient_id
        WHERE e.id = ?
        """,
        (examination_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Pemeriksaan tidak ditemukan.")
    if row["status"] != "REGISTERED":
        raise HTTPException(status_code=409, detail="Pemeriksaan hanya bisa dihapus sebelum sampel diterima laboratorium.")
    try:
        conn.execute(
            "UPDATE examinations SET status = 'CANCELLED', updated_at = datetime('now') WHERE id = ? AND status = 'REGISTERED'",
            (examination_id,),
        )
        if row["queue_date"]:
            _renumber_day(conn, row["queue_date"])
        conn.commit()
    except Exception:
        conn.rollback()
        raise HTTPException(status_code=500, detail="Pembatalan gagal disimpan.")

    log_audit_event(
        actor_id=user["id"],
        action_type="CANCEL_EXAMINATION",
        description=f"Pemeriksaan {row['sample_code']} dihapus dari daftar oleh Front Office (pasien {row['patient_name']}, RM {row['medical_record_number']}, jadwal semula {row['collection_datetime']})",
        target_type="examination",
        target_id=examination_id,
        actor_email=user["email"],
        actor_role=user["role"],
    )
    return {"id": examination_id, "status_label": public_status("CANCELLED")}


class HandoverRequest(BaseModel):
    override: bool = False
    reason: Optional[str] = Field(default=None, max_length=300)


@router.post("/{examination_id}/handover")
def handover_to_examination(examination_id: int, payload: Optional[HandoverRequest] = None, user: dict = FRONT_OFFICE):
    """Front Office langsung menyerahkan pasien/sampel ke pemeriksaan (serah terima).
    Jika pantang belum selesai, hanya bisa dipaksa dengan override + alasan; tercatat di log audit."""
    conn = get_connection()
    row = conn.execute(
        """
        SELECT e.id, e.status, e.queue_date, e.sample_code, e.received_datetime, e.abstinence_ready_at,
               p.full_name AS patient_name
        FROM examinations e JOIN patients p ON p.id = e.patient_id
        WHERE e.id = ?
        """,
        (examination_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Pemeriksaan tidak ditemukan.")
    if row["status"] != "REGISTERED" or row["received_datetime"]:
        raise HTTPException(status_code=409, detail="Pasien ini sudah diserahkan atau tidak lagi menunggu pemeriksaan.")
    now = _now()
    forced_from = None
    if row["abstinence_ready_at"] and datetime.fromisoformat(row["abstinence_ready_at"]) > now:
        ready = datetime.fromisoformat(row["abstinence_ready_at"]).astimezone(WIB)
        if not (payload and payload.override):
            raise HTTPException(status_code=409, detail=f"Pantang belum selesai. Siap diperiksa mulai {ready:%d-%m-%Y %H:%M} WIB.")
        if not (payload.reason and payload.reason.strip()):
            raise HTTPException(status_code=422, detail="Isi alasan pemaksaan untuk keperluan test atau lomba.")
        forced_from = ready

    try:
        conn.execute(
            """
            UPDATE examinations
            SET received_datetime = ?, status = 'IN_PROGRESS', updated_at = datetime('now'),
                abstinence_ready_at = CASE WHEN ? THEN ? ELSE abstinence_ready_at END
            WHERE id = ? AND received_datetime IS NULL AND status = 'REGISTERED'
            """,
            (_iso(now), forced_from is not None, _iso(now), examination_id),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise HTTPException(status_code=500, detail="Penyerahan gagal disimpan.")

    if forced_from is not None:
        log_audit_event(
            actor_id=user["id"],
            action_type="OVERRIDE_ABSTINENCE",
            description=(
                f"Pantang {row['sample_code']} ({row['patient_name']}) DIPAKSA lanjut. "
                f"Siap semula {forced_from:%d-%m-%Y %H:%M} WIB, dilewati pada {now.astimezone(WIB):%d-%m-%Y %H:%M} WIB. "
                f"Alasan: {payload.reason.strip()}"
            ),
            target_type="examination",
            target_id=examination_id,
            actor_email=user["email"],
            actor_role=user["role"],
        )

    log_audit_event(
        actor_id=user["id"],
        action_type="HANDOVER_TO_EXAMINATION",
        description=f"Sampel {row['sample_code']} ({row['patient_name']}) diserahkan langsung ke pemeriksaan",
        target_type="examination",
        target_id=examination_id,
        actor_email=user["email"],
        actor_role=user["role"],
    )
    return _examination_detail(conn, examination_id)

