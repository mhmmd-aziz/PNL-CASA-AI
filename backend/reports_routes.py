"""
Pelepasan laporan (langkah 5 alur kerja) dan portal pasien.

- Dokter melihat laporan yang sudah disetujui, lalu merilisnya.
- Pasien hanya melihat laporan miliknya sendiri yang sudah dirilis. Data video
  mentah, lintasan, dan data analisis internal tidak pernah ditampilkan di sini.
"""
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from auth_routes import require_roles
from database.db_connection import get_connection, log_audit_event

router = APIRouter(prefix="/api/reports", tags=["reports"])

PHYSICIAN = Depends(require_roles("PHYSICIAN"))
PATIENT = Depends(require_roles("PATIENT"))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _public_report(row) -> dict:
    """Bentuk laporan untuk pasien: hanya isi laporan dan ringkasan hasil, tanpa data internal."""
    try:
        signature = json.loads(row["signature_data"] or "{}")
    except (TypeError, json.JSONDecodeError):
        signature = {}
    return {
        "id": row["id"],
        "report_number": row["report_number"],
        "sample_code": row["sample_code"],
        "examination_date": row["collection_datetime"],
        "released_at": row["released_at"],
        "physician_name": row["physician_name"],
        "physician_license": row["physician_license"],
        "physician_signature": signature.get("signature_png"),
        "signed_at": row["approved_at"],
        "patient": {
            "full_name": row["patient_name"],
            "medical_record_number": row["medical_record_number"],
            "date_of_birth": row["date_of_birth"],
            "gender": row["gender"],
        },
        "macroscopic": {
            "volume_ml": row["volume_ml"],
            "liquefaction_time_min": row["liquefaction_time_min"],
            "viscosity": row["viscosity"],
            "ph_value": row["ph_value"],
            "appearance": row["appearance"],
        },
        "clinical_interpretation": row["clinical_interpretation"],
        "recommendations": row["recommendations"],
        "results": {
            "pr_percentage": row["final_pr_percentage"],
            "np_percentage": row["final_np_percentage"],
            "im_percentage": row["final_im_percentage"],
        },
    }


_REPORT_SELECT = """
    SELECT r.id, r.report_number, r.status, r.approved_at, r.released_at, r.physician_license,
           r.signature_data, r.clinical_interpretation, r.recommendations,
           e.sample_code, e.collection_datetime, e.volume_ml, e.liquefaction_time_min,
           e.viscosity, e.ph_value, e.appearance,
           p.full_name AS patient_name, p.medical_record_number, p.date_of_birth, p.gender,
           u.full_name AS physician_name,
           v.final_pr_percentage, v.final_np_percentage, v.final_im_percentage
    FROM reports r
    JOIN examinations e ON e.id = r.examination_id
    JOIN patients p ON p.id = e.patient_id
    LEFT JOIN users u ON u.id = r.approved_by
    LEFT JOIN analysis_revisions v ON v.id = r.revision_id
"""


@router.get("/approved")
def approved_reports(user: dict = PHYSICIAN):
    """Laporan yang sudah disetujui dan menunggu dirilis."""
    conn = get_connection()
    rows = conn.execute(_REPORT_SELECT + " WHERE r.status = 'APPROVED' ORDER BY r.approved_at DESC").fetchall()
    return [
        {
            "id": row["id"],
            "report_number": row["report_number"],
            "sample_code": row["sample_code"],
            "approved_at": row["approved_at"],
            "physician_name": row["physician_name"],
        }
        for row in rows
    ]


@router.get("/approved/{report_id}")
def approved_report_detail(report_id: int, user: dict = PHYSICIAN):
    """Pratinjau lengkap laporan yang sudah disetujui sebelum dirilis."""
    conn = get_connection()
    row = conn.execute(
        _REPORT_SELECT + " WHERE r.id = ? AND r.status = 'APPROVED'",
        (report_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Laporan siap rilis tidak ditemukan.")
    return _public_report(row)


@router.post("/{report_id}/release")
def release_report(report_id: int, user: dict = PHYSICIAN):
    """Dokter merilis laporan: laporan dan sampel berstatus RELEASED, dan pasien bisa melihatnya."""
    conn = get_connection()
    row = conn.execute(
        """
        SELECT r.id, r.status, r.examination_id, r.report_number, e.sample_code
        FROM reports r JOIN examinations e ON e.id = r.examination_id
        WHERE r.id = ?
        """,
        (report_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Laporan tidak ditemukan.")
    if row["status"] != "APPROVED":
        raise HTTPException(status_code=409, detail="Hanya laporan yang sudah disetujui yang bisa dirilis.")

    now = _now()
    try:
        conn.execute(
            """
            UPDATE reports SET status = 'RELEASED', released_at = ?, released_by = ?, updated_at = datetime('now')
            WHERE id = ? AND status = 'APPROVED'
            """,
            (now, user["id"], report_id),
        )
        conn.execute(
            "UPDATE examinations SET status = 'RELEASED', updated_at = datetime('now') WHERE id = ? AND status = 'APPROVED'",
            (row["examination_id"],),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise HTTPException(status_code=500, detail="Pelepasan laporan gagal. Coba lagi.")

    log_audit_event(
        actor_id=user["id"],
        action_type="RELEASE_REPORT",
        description=f"Laporan {row['report_number']} dirilis untuk pasien",
        target_type="report",
        target_id=report_id,
        actor_email=user["email"],
        actor_role=user["role"],
    )
    return {"report_number": row["report_number"], "status": "RELEASED", "released_at": now}


@router.get("/mine")
def my_reports(user: dict = PATIENT):
    """Daftar laporan milik pasien yang sedang masuk dan sudah dirilis."""
    conn = get_connection()
    rows = conn.execute(
        _REPORT_SELECT
        + """
        WHERE p.user_id = ? AND r.status = 'RELEASED'
        ORDER BY r.released_at DESC
        """,
        (user["id"],),
    ).fetchall()
    return [_public_report(row) for row in rows]


@router.get("/mine/{report_id}")
def my_report_detail(report_id: int, user: dict = PATIENT):
    conn = get_connection()
    row = conn.execute(
        _REPORT_SELECT
        + """
        WHERE r.id = ? AND p.user_id = ? AND r.status = 'RELEASED'
        """,
        (report_id, user["id"]),
    ).fetchone()
    if row is None:
        # Sengaja sama dengan "tidak ditemukan", agar laporan orang lain tidak terlihat keberadaannya
        raise HTTPException(status_code=404, detail="Laporan tidak ditemukan.")
    return _public_report(row)


# ---------------------------------------------------------------------------
# Riwayat laporan
# ---------------------------------------------------------------------------

SUPER_ADMIN = Depends(require_roles("SUPER_ADMIN"))


@router.get("/history/physician")
def physician_report_history(user: dict = PHYSICIAN):
    """Riwayat laporan yang disetujui dokter ini sendiri (disetujui maupun dirilis)."""
    conn = get_connection()
    rows = conn.execute(
        _REPORT_SELECT
        + """
        WHERE r.approved_by = ? AND r.status IN ('APPROVED', 'RELEASED')
        ORDER BY COALESCE(r.released_at, r.approved_at) DESC, r.id DESC
        """,
        (user["id"],),
    ).fetchall()
    return [
        {
            "id": row["id"],
            "report_number": row["report_number"],
            "status": row["status"],
            "sample_code": row["sample_code"],
            "patient_name": row["patient_name"],
            "medical_record_number": row["medical_record_number"],
            "approved_at": row["approved_at"],
            "released_at": row["released_at"],
        }
        for row in rows
    ]


@router.get("/history/physician/{report_id}")
def physician_report_history_detail(report_id: int, user: dict = PHYSICIAN):
    conn = get_connection()
    row = conn.execute(
        _REPORT_SELECT + " WHERE r.id = ? AND r.approved_by = ? AND r.status IN ('APPROVED', 'RELEASED')",
        (report_id, user["id"]),
    ).fetchone()
    if row is None:
        # Laporan dokter lain diperlakukan sama dengan tidak ada
        raise HTTPException(status_code=404, detail="Laporan tidak ditemukan.")
    return _public_report(row) | {"status": row["status"]}


@router.get("/history/admin")
def admin_report_history(user: dict = SUPER_ADMIN):
    """Riwayat laporan yang sudah dirilis untuk Super Admin.

    Hanya data administratif: tanpa identitas pasien dan tanpa isi klinis, karena
    hak administratif tidak memberi akses ke hasil klinis pasien.
    """
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT r.id, r.report_number, r.report_version, r.approved_at, r.released_at,
               e.sample_code, u.full_name AS physician_name, rel.full_name AS released_by_name
        FROM reports r
        JOIN examinations e ON e.id = r.examination_id
        LEFT JOIN users u ON u.id = r.approved_by
        LEFT JOIN users rel ON rel.id = r.released_by
        WHERE r.status = 'RELEASED'
        ORDER BY r.released_at DESC, r.id DESC
        """
    ).fetchall()
    return [
        {
            "id": row["id"],
            "report_number": row["report_number"],
            "report_version": row["report_version"],
            "sample_code": row["sample_code"],
            "physician_name": row["physician_name"],
            "released_by_name": row["released_by_name"],
            "approved_at": row["approved_at"],
            "released_at": row["released_at"],
        }
        for row in rows
    ]
