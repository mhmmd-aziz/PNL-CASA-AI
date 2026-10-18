"""
Tinjauan dokter (langkah 4 alur kerja).

Dokter meninjau sampel yang dikirim analis, lalu menyetujui (dengan interpretasi
klinis dan tanda tangan digital) atau mengembalikannya ke analis untuk diperbaiki.
Pelepasan laporan ke pasien belum ada di tahap ini.
"""
import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth_routes import require_roles, sign_output_url
from clinical_interpretation import ai_configured, generate_ai_draft, who_findings
from database.db_connection import get_connection, log_audit_event

router = APIRouter(prefix="/api/review", tags=["review"])

PHYSICIAN = Depends(require_roles("PHYSICIAN"))


class ApproveRequest(BaseModel):
    clinical_interpretation: str = Field(min_length=10, max_length=2000)
    recommendations: Optional[str] = Field(default=None, max_length=2000)
    sign: bool = False
    signature_png: str = Field(max_length=500_000)


class ReturnRequest(BaseModel):
    reason: str = Field(min_length=10, max_length=500)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _load_pending(conn, examination_id: int, user: dict):
    row = conn.execute(
        "SELECT id, sample_code, status, current_analyst_id FROM examinations WHERE id = ?", (examination_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Pemeriksaan tidak ditemukan.")
    if row["status"] != "PENDING_REVIEW":
        raise HTTPException(status_code=409, detail="Sampel ini tidak sedang menunggu tinjauan dokter.")
    return row


def _review_detail(conn, examination_id: int, user_id: int) -> dict:
    exam = conn.execute(
        """
        SELECT e.id, e.sample_code, e.status, e.collection_datetime, e.received_datetime,
               e.abstinence_duration_hours, e.volume_ml, e.liquefaction_time_min, e.viscosity,
               e.ph_value, e.appearance, e.macroscopic_notes, p.medical_record_number, p.full_name,
               p.date_of_birth, p.gender
        FROM examinations e JOIN patients p ON p.id = e.patient_id
        WHERE e.id = ?
        """,
        (examination_id,),
    ).fetchone()
    if exam is None:
        raise HTTPException(status_code=404, detail="Pemeriksaan tidak ditemukan.")

    runs = conn.execute(
        """
        SELECT id, status, completed_at, pr_percentage, np_percentage, im_percentage,
               avg_speed_um_s, avg_linearity, tracking_data_json
        FROM analysis_runs WHERE examination_id = ? AND status = 'COMPLETED'
        ORDER BY id DESC
        """,
        (examination_id,),
    ).fetchall()

    events = conn.execute(
        """
        SELECT event_type, actor_role, reason, created_at
        FROM review_events WHERE examination_id = ? ORDER BY id DESC LIMIT 20
        """,
        (examination_id,),
    ).fetchall()

    latest = None
    if runs:
        tracking = json.loads(runs[0]["tracking_data_json"] or "{}")
        media_rows = conn.execute(
            """
            SELECT asset_type, file_name, analysis_run_id FROM media_assets
            WHERE examination_id = ? AND asset_type IN ('ANNOTATED_VIDEO', 'HEATMAP')
              AND (analysis_run_id = ? OR analysis_run_id IS NULL)
            ORDER BY CASE WHEN analysis_run_id = ? THEN 0 ELSE 1 END, id DESC
            """,
            (examination_id, runs[0]["id"], runs[0]["id"]),
        ).fetchall()
        media = {}
        linked_media = [asset for asset in media_rows if asset["analysis_run_id"] == runs[0]["id"]]
        for asset in linked_media or media_rows:
            media.setdefault(asset["asset_type"], asset["file_name"])
        latest = {
            "run_id": runs[0]["id"],
            "completed_at": runs[0]["completed_at"],
            "pr_percentage": runs[0]["pr_percentage"],
            "np_percentage": runs[0]["np_percentage"],
            "im_percentage": runs[0]["im_percentage"],
            "avg_speed_um_s": runs[0]["avg_speed_um_s"],
            "avg_linearity": runs[0]["avg_linearity"],
            "summary": tracking.get("summary", {}),
            "motion": tracking.get("motion", {}),
            "quality": tracking.get("quality", {}),
            "manual_correction": tracking.get("manual_correction"),
            "heatmap_file": media.get("HEATMAP"),
            "video_url": sign_output_url(media["ANNOTATED_VIDEO"], user_id) if media.get("ANNOTATED_VIDEO") else None,
            "heatmap_url": sign_output_url(media["HEATMAP"], user_id) if media.get("HEATMAP") else None,
        }

    return {
        "id": exam["id"],
        "sample_code": exam["sample_code"],
        "status": exam["status"],
        "patient": {
            "medical_record_number": exam["medical_record_number"],
            "full_name": exam["full_name"],
            "date_of_birth": exam["date_of_birth"],
            "gender": exam["gender"],
        },
        "collection_datetime": exam["collection_datetime"],
        "received_datetime": exam["received_datetime"],
        "abstinence_duration_hours": exam["abstinence_duration_hours"],
        "macroscopic": {
            "volume_ml": exam["volume_ml"],
            "liquefaction_time_min": exam["liquefaction_time_min"],
            "viscosity": exam["viscosity"],
            "ph_value": exam["ph_value"],
            "appearance": exam["appearance"],
            "notes": exam["macroscopic_notes"],
        },
        "analysis": latest,
        "analysis_runs_count": len(runs),
        "history": [
            {"event": e["event_type"], "by_role": e["actor_role"], "reason": e["reason"], "at": e["created_at"]}
            for e in events
        ],
    }


@router.get("/queue")
def review_queue(user: dict = PHYSICIAN):
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT e.id, e.sample_code, e.collection_datetime, e.created_at, p.full_name, p.medical_record_number
        FROM examinations e JOIN patients p ON p.id = e.patient_id
        WHERE e.status = 'PENDING_REVIEW'
        ORDER BY e.updated_at ASC, e.id ASC
        """
    ).fetchall()
    return [
        {
            "id": row["id"],
            "sample_code": row["sample_code"],
            "patient_name": row["full_name"],
            "medical_record_number": row["medical_record_number"],
            "collection_datetime": row["collection_datetime"],
        }
        for row in rows
    ]


@router.get("/{examination_id}")
def review_detail(examination_id: int, user: dict = PHYSICIAN):
    return _review_detail(get_connection(), examination_id, user["id"])


@router.get("/{examination_id}/interpretation")
def who_interpretation(examination_id: int, user: dict = PHYSICIAN):
    detail = _review_detail(get_connection(), examination_id, user["id"])
    if detail["analysis"] is None:
        raise HTTPException(status_code=409, detail="Belum ada hasil analisis yang selesai untuk sampel ini.")
    return {**who_findings(detail), "ai_configured": ai_configured()}


@router.post("/{examination_id}/interpretation/ai")
def ai_interpretation(examination_id: int, user: dict = PHYSICIAN):
    detail = _review_detail(get_connection(), examination_id, user["id"])
    if detail["analysis"] is None:
        raise HTTPException(status_code=409, detail="Belum ada hasil analisis yang selesai untuk sampel ini.")
    try:
        draft = generate_ai_draft(who_findings(detail), heatmap_file=detail["analysis"].get("heatmap_file"))
    except HTTPException as error:
        log_audit_event(
            actor_id=user["id"],
            action_type="AI_INTERPRETATION_DRAFT",
            description=f"Draf interpretasi AI gagal dibuat untuk {detail['sample_code']}",
            target_type="examination",
            target_id=examination_id,
            actor_email=user["email"],
            actor_role=user["role"],
            result="FAILURE",
            error_message=str(error.detail),
        )
        raise
    log_audit_event(
        actor_id=user["id"],
        action_type="AI_INTERPRETATION_DRAFT",
        description=f"Draf interpretasi AI dibuat untuk {detail['sample_code']} (model {draft['model']}, acuan {draft['reference_version']})",
        target_type="examination",
        target_id=examination_id,
        actor_email=user["email"],
        actor_role=user["role"],
    )
    return draft


@router.post("/{examination_id}/approve")
def approve(examination_id: int, payload: ApproveRequest, user: dict = PHYSICIAN):
    """Dokter menyetujui hasil: membuat revisi, laporan (DRAFT -> APPROVED), dan menandatangani."""
    if not payload.sign:
        raise HTTPException(status_code=422, detail="Centang tanda tangan digital untuk menyetujui laporan.")
    if not payload.signature_png.startswith("data:image/png;base64,"):
        raise HTTPException(status_code=422, detail="Tanda tangan dokter belum dibuat atau formatnya tidak valid.")
    conn = get_connection()
    exam = _load_pending(conn, examination_id, user)

    license_row = conn.execute("SELECT license_number FROM users WHERE id = ?", (user["id"],)).fetchone()
    license_number = license_row["license_number"] if license_row else None
    if not license_number:
        raise HTTPException(status_code=409, detail="Akun dokter belum memiliki nomor SIP/STR. Hubungi administrator.")

    runs = conn.execute(
        """
        SELECT id, pr_percentage, np_percentage, im_percentage, avg_speed_um_s, avg_linearity
        FROM analysis_runs WHERE examination_id = ? AND status = 'COMPLETED' ORDER BY id DESC
        """,
        (examination_id,),
    ).fetchall()
    if not runs:
        raise HTTPException(status_code=409, detail="Belum ada hasil analisis yang selesai untuk sampel ini.")
    latest = runs[0]

    try:
        revision_number = conn.execute(
            "SELECT COALESCE(MAX(revision_number), 0) + 1 FROM analysis_revisions WHERE examination_id = ?",
            (examination_id,),
        ).fetchone()[0]
        now = _now().isoformat(timespec="seconds")
        revision_id = conn.execute(
            """
            INSERT INTO analysis_revisions (
                examination_id, revision_number, total_videos_analyzed,
                final_pr_percentage, final_np_percentage, final_im_percentage,
                final_avg_speed_um_s, final_avg_linearity, is_submitted, submitted_at, submitted_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                examination_id,
                revision_number,
                len(runs),
                latest["pr_percentage"],
                latest["np_percentage"],
                latest["im_percentage"],
                latest["avg_speed_um_s"],
                latest["avg_linearity"],
                now,
                exam["current_analyst_id"],
            ),
        ).lastrowid

        report_number = f"LAB-CASA/{_now():%Y}/{examination_id:05d}-R{revision_number}"
        conn.execute(
            """
            INSERT INTO reports (
                examination_id, revision_id, report_number, report_version, status, approved_by, approved_at,
                signature_method, signature_data, physician_license,
                clinical_interpretation, recommendations
            ) VALUES (?, ?, ?, (SELECT COALESCE(MAX(report_version), 0) + 1 FROM reports WHERE examination_id = ?), 'APPROVED', ?, ?, 'AUTHENTICATED_APPROVAL', ?, ?, ?, ?)
            """,
            (
                examination_id,
                revision_id,
                report_number,
                examination_id,
                user["id"],
                now,
                json.dumps({
                    "signer": user["full_name"],
                    "signed_at": now,
                    "method": "AUTHENTICATED_APPROVAL_WITH_DRAWN_SIGNATURE",
                    "signature_png": payload.signature_png,
                }),
                license_number,
                payload.clinical_interpretation.strip(),
                payload.recommendations.strip() if payload.recommendations else None,
            ),
        )
        conn.execute(
            """
            UPDATE examinations SET status = 'APPROVED', current_physician_id = ?, updated_at = datetime('now')
            WHERE id = ? AND status = 'PENDING_REVIEW'
            """,
            (user["id"], examination_id),
        )
        conn.execute(
            """
            INSERT INTO review_events (examination_id, revision_id, event_type, actor_id, actor_role, action, reason)
            VALUES (?, ?, 'PHYSICIAN_APPROVE', ?, ?, 'APPROVE', 'Disetujui dan ditandatangani dokter')
            """,
            (examination_id, revision_id, user["id"], user["role"]),
        )
        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise HTTPException(status_code=500, detail="Persetujuan gagal disimpan. Coba lagi.")

    log_audit_event(
        actor_id=user["id"],
        action_type="PHYSICIAN_APPROVE",
        description=f"Sampel {exam['sample_code']} disetujui dan ditandatangani ({report_number})",
        target_type="examination",
        target_id=examination_id,
        actor_email=user["email"],
        actor_role=user["role"],
    )
    return {"report_number": report_number, "status": "APPROVED", "detail": _review_detail(conn, examination_id, user["id"])}


@router.post("/{examination_id}/return")
def return_for_correction(examination_id: int, payload: ReturnRequest, user: dict = PHYSICIAN):
    """Dokter mengembalikan sampel ke analis dengan alasan yang jelas."""
    conn = get_connection()
    exam = _load_pending(conn, examination_id, user)
    try:
        conn.execute(
            """
            UPDATE examinations SET status = 'RETURNED_FOR_CORRECTION', current_physician_id = ?,
                   updated_at = datetime('now')
            WHERE id = ? AND status = 'PENDING_REVIEW'
            """,
            (user["id"], examination_id),
        )
        conn.execute(
            """
            INSERT INTO review_events (examination_id, event_type, actor_id, actor_role, action, reason)
            VALUES (?, 'PHYSICIAN_RETURN', ?, ?, 'RETURN', ?)
            """,
            (examination_id, user["id"], user["role"], payload.reason.strip()),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise HTTPException(status_code=500, detail="Pengembalian gagal disimpan. Coba lagi.")

    log_audit_event(
        actor_id=user["id"],
        action_type="PHYSICIAN_RETURN",
        description=f"Sampel {exam['sample_code']} dikembalikan ke analis",
        target_type="examination",
        target_id=examination_id,
        actor_email=user["email"],
        actor_role=user["role"],
    )
    return {"status": "RETURNED_FOR_CORRECTION"}
