"""
Detection Corrections - Human-in-the-loop quality control for AI detections.

Analyst dapat mengoreksi deteksi AI (hapus false positives, tambah yang terlewat,
geser/resize boxes), dengan tracking forward dan re-calculation metrics otomatis.
"""
import json
from datetime import datetime, timezone
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth_routes import require_roles, get_current_user
from database.db_connection import get_connection, log_audit_event

router = APIRouter(prefix="/api/examinations", tags=["detection_corrections"])

ANALYST = Depends(require_roles("ANALYST"))


class BboxJson(BaseModel):
    """Bounding box: {x, y, w, h} dalam pixel coordinates."""
    x: float = Field(ge=0)
    y: float = Field(ge=0)
    w: float = Field(gt=0)
    h: float = Field(gt=0)


class DetectionCorrectionSubmit(BaseModel):
    """Submit satu koreksi deteksi pada frame tertentu."""
    analysis_run_id: int
    frame_index: int = Field(ge=0)
    correction_type: Literal["DELETE", "ADD", "MOVE"]

    # Original detection (dari AI) - untuk DELETE dan MOVE
    original_bbox: Optional[BboxJson] = None
    original_confidence: Optional[float] = Field(default=None, ge=0, le=1)
    original_label: Optional[str] = None

    # Corrected detection (hasil koreksi analyst) - untuk ADD dan MOVE
    corrected_bbox: Optional[BboxJson] = None
    corrected_confidence: Optional[float] = Field(default=None, ge=0, le=1)
    corrected_label: Optional[str] = None

    notes: Optional[str] = Field(default=None, max_length=500)


class TrackingProposalAccept(BaseModel):
    """Accept/reject tracking proposal untuk frame-frame berikutnya."""
    accepted: bool = True
    notes: Optional[str] = Field(default=None, max_length=500)


class CorrectionResponse(BaseModel):
    """Response ketika koreksi berhasil disimpan."""
    id: int
    examination_id: int
    frame_index: int
    correction_type: str
    tracking_proposal_json: Optional[dict] = None
    created_at: str


def _get_examination_and_analyst(conn, examination_id: int, user: dict):
    """Check examination ownership dan role."""
    row = conn.execute(
        "SELECT id, current_analyst_id, status FROM examinations WHERE id = ?",
        (examination_id,),
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Pemeriksaan tidak ditemukan.")

    if row["status"] not in ("IN_PROGRESS", "PENDING_REVIEW"):
        raise HTTPException(status_code=400, detail="Pemeriksaan harus dalam status IN_PROGRESS atau PENDING_REVIEW.")

    # Analyst harus yang current analyst pada pemeriksaan ini
    if user["role"] == "ANALYST" and row["current_analyst_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Anda bukan analyst untuk pemeriksaan ini.")

    return row


@router.post("/{examination_id}/corrections")
def submit_correction(examination_id: int, payload: DetectionCorrectionSubmit, user: dict = ANALYST):
    """
    Submit satu koreksi deteksi pada frame tertentu.

    Endpoint ini menerima koreksi individual (delete, add, move) dan menyimpannya
    untuk tracking. Jika ada deteksi yang dilewatkan, sistem akan proposal tracking
    ke frame-frame berikutnya.
    """
    conn = get_connection()
    try:
        exam_row = _get_examination_and_analyst(conn, examination_id, user)

        # Validasi analysis_run_id
        run = conn.execute(
            "SELECT id, tracking_data_json FROM analysis_runs WHERE id = ? AND examination_id = ?",
            (payload.analysis_run_id, examination_id),
        ).fetchone()

        if not run:
            raise HTTPException(status_code=404, detail="Analysis run tidak ditemukan.")

        # Prepare kolom-kolom untuk insertion
        original_bbox_json = None
        if payload.original_bbox:
            original_bbox_json = json.dumps(payload.original_bbox.dict())

        corrected_bbox_json = None
        if payload.corrected_bbox:
            corrected_bbox_json = json.dumps(payload.corrected_bbox.dict())

        tracking_proposal = None
        if payload.correction_type == "ADD":
            # Jika menambah deteksi baru, coba tracking forward
            tracking_proposal = _generate_tracking_proposal(
                run["tracking_data_json"], payload.frame_index, corrected_bbox_json
            )

        # Insert correction
        cursor = conn.execute(
            """
            INSERT INTO detection_corrections (
                examination_id, analysis_run_id, frame_index, correction_type,
                original_bbox, original_confidence, original_label,
                corrected_bbox, corrected_confidence, corrected_label,
                tracking_proposal_json, analyst_id, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                examination_id,
                payload.analysis_run_id,
                payload.frame_index,
                payload.correction_type,
                original_bbox_json,
                payload.original_confidence,
                payload.original_label,
                corrected_bbox_json,
                payload.corrected_confidence,
                payload.corrected_label,
                json.dumps(tracking_proposal) if tracking_proposal else None,
                user["id"],
                payload.notes,
                datetime.now(timezone.utc).isoformat(timespec="seconds"),
            ),
        )

        correction_id = cursor.lastrowid
        conn.commit()

        # Log to audit
        log_audit_event(
            actor_id=user["id"],
            action_type="CORRECT_DETECTION",
            description=(
                f"Koreksi deteksi ({payload.correction_type}) di frame {payload.frame_index} "
                f"pada pemeriksaan {exam_row['id']}"
            ),
            target_type="examination",
            target_id=examination_id,
            actor_email=user["email"],
            actor_role=user["role"],
        )

        # Mark analysis_run as having corrections
        conn.execute(
            "UPDATE analysis_runs SET has_corrections=1, last_corrected_at=? WHERE id=?",
            (datetime.now(timezone.utc).isoformat(timespec="seconds"), payload.analysis_run_id),
        )
        conn.commit()

        return CorrectionResponse(
            id=correction_id,
            examination_id=examination_id,
            frame_index=payload.frame_index,
            correction_type=payload.correction_type,
            tracking_proposal_json=tracking_proposal,
            created_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        )

    finally:
        conn.close()


@router.get("/{examination_id}/corrections")
def list_corrections(examination_id: int, user: dict = ANALYST):
    """
    List semua koreksi yang sudah dilakukan untuk pemeriksaan ini.
    """
    conn = get_connection()
    try:
        exam_row = _get_examination_and_analyst(conn, examination_id, user)

        rows = conn.execute(
            """
            SELECT
                id, examination_id, analysis_run_id, frame_index, correction_type,
                original_bbox, original_confidence, original_label,
                corrected_bbox, corrected_confidence, corrected_label,
                tracking_proposal_json, tracking_accepted, analyst_id,
                notes, created_at
            FROM detection_corrections
            WHERE examination_id = ?
            ORDER BY frame_index, created_at
            """,
            (examination_id,),
        ).fetchall()

        corrections = []
        for row in rows:
            corrections.append({
                "id": row["id"],
                "examination_id": row["examination_id"],
                "analysis_run_id": row["analysis_run_id"],
                "frame_index": row["frame_index"],
                "correction_type": row["correction_type"],
                "original_bbox": json.loads(row["original_bbox"]) if row["original_bbox"] else None,
                "original_confidence": row["original_confidence"],
                "original_label": row["original_label"],
                "corrected_bbox": json.loads(row["corrected_bbox"]) if row["corrected_bbox"] else None,
                "corrected_confidence": row["corrected_confidence"],
                "corrected_label": row["corrected_label"],
                "tracking_proposal": json.loads(row["tracking_proposal_json"]) if row["tracking_proposal_json"] else None,
                "tracking_accepted": row["tracking_accepted"],
                "notes": row["notes"],
                "created_at": row["created_at"],
            })

        return {"corrections": corrections, "total": len(corrections)}

    finally:
        conn.close()


@router.delete("/{examination_id}/corrections/{correction_id}")
def delete_correction(examination_id: int, correction_id: int, user: dict = ANALYST):
    """
    Undo koreksi (hapus dari history). Hanya analyst yang membuat koreksi yang bisa menghapusnya.
    """
    conn = get_connection()
    try:
        exam_row = _get_examination_and_analyst(conn, examination_id, user)

        # Check ownership
        correction = conn.execute(
            "SELECT id, analyst_id FROM detection_corrections WHERE id = ? AND examination_id = ?",
            (correction_id, examination_id),
        ).fetchone()

        if not correction:
            raise HTTPException(status_code=404, detail="Koreksi tidak ditemukan.")

        if user["role"] == "ANALYST" and correction["analyst_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Anda tidak bisa menghapus koreksi orang lain.")

        conn.execute("DELETE FROM detection_corrections WHERE id = ?", (correction_id,))
        conn.commit()

        log_audit_event(
            actor_id=user["id"],
            action_type="UNDO_DETECTION_CORRECTION",
            description=f"Undo koreksi deteksi #{correction_id}",
            target_type="examination",
            target_id=examination_id,
            actor_email=user["email"],
            actor_role=user["role"],
        )

        return {"status": "ok", "message": "Koreksi dihapus."}

    finally:
        conn.close()


@router.post("/{examination_id}/corrections/{correction_id}/accept-tracking")
def accept_tracking_proposal(
    examination_id: int, correction_id: int, payload: TrackingProposalAccept, user: dict = ANALYST
):
    """
    Accept atau reject tracking proposal untuk frame-frame berikutnya.

    Jika analyst menerima proposal, sistem akan insert koreks i baru untuk frame-frame
    yang di-track. Jika reject, hanya koreksi frame yang saat ini disimpan.
    """
    conn = get_connection()
    try:
        exam_row = _get_examination_and_analyst(conn, examination_id, user)

        # Get correction
        correction = conn.execute(
            """
            SELECT id, analysis_run_id, frame_index, correction_type,
                   tracking_proposal_json, analyst_id
            FROM detection_corrections
            WHERE id = ? AND examination_id = ?
            """,
            (correction_id, examination_id),
        ).fetchone()

        if not correction:
            raise HTTPException(status_code=404, detail="Koreksi tidak ditemukan.")

        if correction["correction_type"] != "ADD":
            raise HTTPException(status_code=400, detail="Tracking proposal hanya untuk deteksi baru (ADD).")

        if not correction["tracking_proposal_json"]:
            raise HTTPException(status_code=400, detail="Tidak ada tracking proposal untuk koreksi ini.")

        # Update tracking_accepted flag
        conn.execute(
            """
            UPDATE detection_corrections
            SET tracking_accepted = ?
            WHERE id = ?
            """,
            (1 if payload.accepted else 0, correction_id),
        )

        if payload.accepted:
            # Insert corrections untuk frame-frame yang di-track
            proposal = json.loads(correction["tracking_proposal_json"])
            for frame_data in proposal.get("proposed_frames", []):
                conn.execute(
                    """
                    INSERT INTO detection_corrections (
                        examination_id, analysis_run_id, frame_index, correction_type,
                        corrected_bbox, corrected_confidence, corrected_label,
                        analyst_id, notes, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        examination_id,
                        correction["analysis_run_id"],
                        frame_data["frame_index"],
                        "ADD",
                        json.dumps(frame_data["bbox"]),
                        frame_data.get("confidence"),
                        frame_data.get("label"),
                        user["id"],
                        f"Auto-tracked dari frame {correction['frame_index']} (accepted)",
                        datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    ),
                )

        conn.commit()

        log_audit_event(
            actor_id=user["id"],
            action_type="TRACKING_PROPOSAL_" + ("ACCEPT" if payload.accepted else "REJECT"),
            description=f"{'Accepted' if payload.accepted else 'Rejected'} tracking proposal untuk koreksi #{correction_id}",
            target_type="examination",
            target_id=examination_id,
            actor_email=user["email"],
            actor_role=user["role"],
        )

        return {"status": "ok", "accepted": payload.accepted}

    finally:
        conn.close()


def _generate_tracking_proposal(tracking_data_json: str, from_frame: int, new_bbox_json: str) -> Optional[dict]:
    """
    Generate tracking proposal untuk 2-3 frame ke depan menggunakan optical flow.

    Returns: { "proposed_frames": [{ "frame_index": N, "bbox": {...}, "confidence": 0.X, "label": "..." }] }
    """
    new_bbox = json.loads(new_bbox_json) if new_bbox_json else None
    if not new_bbox:
        return None

    # MVP: Propose same bbox untuk 2-3 frame berikutnya
    # Analyst dapat adjust manual jika diperlukan
    # Untuk production, implement optical flow dari video frames

    proposed_frames = []
    for frame_offset in [1, 2, 3]:
        proposed_frames.append({
            "frame_index": from_frame + frame_offset,
            "bbox": new_bbox,
            "confidence": 0.75,
            "label": "sperm"
        })

    return {"proposed_frames": proposed_frames}


# Helper: Re-calculate metrics setelah koreksi
def recalculate_metrics_with_corrections(conn, examination_id: int, analysis_run_id: int) -> dict:
    """
    Re-calculate motility groups, concentration, dll berdasarkan koreksi yang sudah accepted.

    Proses:
    1. Load original tracking_data dari analysis_run
    2. Apply semua corrections yang accepted (DELETE, ADD, MOVE)
    3. Re-calculate metrics (PR/NP/IM counts, avg_speed, avg_linearity, concentration)
    4. Update analysis_run dengan metrics baru
    5. Return metrics baru
    """

    # Get original analysis_run
    run = conn.execute(
        """
        SELECT tracking_data_json, original_tracking_data_json, pr_count, np_count, im_count,
               avg_speed_um_s, avg_linearity, concentration_million_ml
        FROM analysis_runs WHERE id = ?
        """,
        (analysis_run_id,)
    ).fetchone()

    if not run:
        return {}

    # Parse tracking data
    try:
        tracking_data = json.loads(run['tracking_data_json']) if run['tracking_data_json'] else {}
        if not tracking_data.get('frames'):
            tracking_data = {'frames': []}
    except:
        tracking_data = {'frames': []}

    # Get all accepted corrections
    corrections = conn.execute(
        """
        SELECT frame_index, correction_type, original_bbox, corrected_bbox,
               original_label, corrected_label
        FROM detection_corrections
        WHERE analysis_run_id = ? AND (tracking_accepted IS NULL OR tracking_accepted = 1)
        ORDER BY frame_index, created_at
        """,
        (analysis_run_id,)
    ).fetchall()

    # Apply corrections to tracking_data
    corrections_by_frame = {}
    for corr in corrections:
        frame_idx = corr['frame_index']
        if frame_idx not in corrections_by_frame:
            corrections_by_frame[frame_idx] = []
        corrections_by_frame[frame_idx].append(corr)

    # Update frames dengan corrections
    corrected_frames = {}
    for frame_data in tracking_data.get('frames', []):
        frame_idx = frame_data.get('frame_index', 0)
        detections = list(frame_data.get('detections', []))  # Make a copy

        frame_corrections = corrections_by_frame.get(frame_idx, [])

        # Apply MOVE corrections (update existing detection)
        move_corrections = [c for c in frame_corrections if c['correction_type'] == 'MOVE']
        for corr in move_corrections:
            if corr['original_bbox'] and corr['corrected_bbox']:
                orig = json.loads(corr['original_bbox'])
                corrected = json.loads(corr['corrected_bbox'])

                # Find and replace detection that matches original_bbox
                for i, det in enumerate(detections):
                    if _bbox_matches(det.get('bbox', {}), orig, iou_threshold=0.3):
                        detections[i] = {
                            'bbox': corrected,
                            'confidence': det.get('confidence', 0.95),
                            'label': corr['corrected_label'] or det.get('label', 'sperm'),
                            'is_corrected': True
                        }
                        break

        # Apply DELETE corrections (remove detection)
        delete_corrections = [c for c in frame_corrections if c['correction_type'] == 'DELETE']
        for corr in delete_corrections:
            if corr['original_bbox']:
                orig = json.loads(corr['original_bbox'])
                # Remove all detections that match original_bbox
                detections = [d for d in detections if not _bbox_matches(d.get('bbox', {}), orig, iou_threshold=0.3)]

        # Apply ADD corrections (add new detection)
        add_corrections = [c for c in frame_corrections if c['correction_type'] == 'ADD']
        for corr in add_corrections:
            if corr['corrected_bbox']:
                corrected = json.loads(corr['corrected_bbox'])
                detections.append({
                    'bbox': corrected,
                    'confidence': 0.95,  # Analyst-corrected, high confidence
                    'label': corr['corrected_label'] or 'sperm',
                    'is_corrected': True
                })

        corrected_frames[frame_idx] = {'frame_index': frame_idx, 'detections': detections}

    # Re-calculate metrics
    new_pr, new_np, new_im = _calculate_motility_groups(corrected_frames)
    new_speed, new_linearity = _calculate_movement_metrics(corrected_frames)
    new_concentration = _calculate_concentration(corrected_frames, run)

    # Update analysis_run dengan metrics baru
    conn.execute(
        """
        UPDATE analysis_runs
        SET pr_count = ?, np_count = ?, im_count = ?,
            pr_percentage = ?, np_percentage = ?, im_percentage = ?,
            avg_speed_um_s = ?, avg_linearity = ?,
            concentration_million_ml = ?
        WHERE id = ?
        """,
        (
            new_pr, new_np, new_im,
            (new_pr / (new_pr + new_np + new_im) * 100) if (new_pr + new_np + new_im) > 0 else 0,
            (new_np / (new_pr + new_np + new_im) * 100) if (new_pr + new_np + new_im) > 0 else 0,
            (new_im / (new_pr + new_np + new_im) * 100) if (new_pr + new_np + new_im) > 0 else 0,
            new_speed, new_linearity, new_concentration,
            analysis_run_id
        )
    )
    conn.commit()

    return {
        'pr_count': new_pr,
        'np_count': new_np,
        'im_count': new_im,
        'avg_speed_um_s': new_speed,
        'avg_linearity': new_linearity,
        'concentration_million_ml': new_concentration
    }


def _bbox_matches(bbox1: dict, bbox2: dict, iou_threshold: float = 0.3) -> bool:
    """
    Check if two bboxes match using Intersection over Union (IoU).

    bbox format: {"x": float, "y": float, "w": float, "h": float}
    iou_threshold: minimum IoU untuk dianggap match (default 0.3 = 30% overlap)
    """
    if not bbox1 or not bbox2:
        return False

    # Extract coordinates
    x1_min, y1_min = bbox1.get('x', 0), bbox1.get('y', 0)
    x1_max = x1_min + bbox1.get('w', 0)
    y1_max = y1_min + bbox1.get('h', 0)

    x2_min, y2_min = bbox2.get('x', 0), bbox2.get('y', 0)
    x2_max = x2_min + bbox2.get('w', 0)
    y2_max = y2_min + bbox2.get('h', 0)

    # Calculate intersection area
    x_inter_min = max(x1_min, x2_min)
    y_inter_min = max(y1_min, y2_min)
    x_inter_max = min(x1_max, x2_max)
    y_inter_max = min(y1_max, y2_max)

    if x_inter_max < x_inter_min or y_inter_max < y_inter_min:
        return False  # No intersection

    inter_area = (x_inter_max - x_inter_min) * (y_inter_max - y_inter_min)

    # Calculate union area
    bbox1_area = bbox1.get('w', 0) * bbox1.get('h', 0)
    bbox2_area = bbox2.get('w', 0) * bbox2.get('h', 0)
    union_area = bbox1_area + bbox2_area - inter_area

    if union_area <= 0:
        return False

    iou = inter_area / union_area
    return iou >= iou_threshold


def _calculate_motility_groups(frames_data: dict) -> tuple[int, int, int]:
    """Calculate PR, NP, IM counts dari corrected detections."""
    # TODO: Implement proper motility classification
    # Untuk sekarang, return sama dengan awal (placeholder)
    return 0, 0, 0


def _calculate_movement_metrics(frames_data: dict) -> tuple[float, float]:
    """Calculate average speed dan linearity dari corrected tracks."""
    # TODO: Implement proper movement calculation
    # Memerlukan tracking ID dan trajectory per sperm
    return 0.0, 0.0


def _calculate_concentration(frames_data: dict, run_data: dict) -> float:
    """Calculate sperm concentration dari corrected detections."""
    # TODO: Implement concentration calculation
    # Formula: (total_count / frames) * (chamber_volume) / (dilution_factor)
    return 0.0
