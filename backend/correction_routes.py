import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

import cv2
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from auth_routes import require_roles, sign_output_url
from detection_corrections import CorrectionRequest, FrameReader, propagate_tracks, read_frames, render_revision, validate_frames
from examinations_routes import check_analysis_target, persist_video_analysis


router = APIRouter(prefix="/api/analysis", tags=["detection corrections"])
STORE_DIR = Path(__file__).resolve().parent / "data" / "corrections"
OUTPUT_DIR = Path(__file__).resolve().parent / "outputs"
ANALYST = Depends(require_roles("ANALYST"))


def connection():
    STORE_DIR.mkdir(parents=True, exist_ok=True)
    database = sqlite3.connect(STORE_DIR / "revisions.sqlite", timeout=60)
    database.row_factory = sqlite3.Row
    database.execute("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, owner INTEGER NOT NULL, payload TEXT NOT NULL)")
    database.execute("CREATE TABLE IF NOT EXISTS revisions (session_id TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (session_id, revision))")
    database.commit()
    return database


@contextmanager
def capture_annotations(analysis_id):
    STORE_DIR.mkdir(parents=True, exist_ok=True)
    path = STORE_DIR / f"{analysis_id}.jsonl"
    with path.open("w", encoding="utf-8") as stream:
        def capture(frame, boxes):
            stream.write(json.dumps({"frame": frame, "boxes": boxes}, allow_nan=False) + "\n")
        yield path, capture


def register_analysis(analysis_id, owner, source, annotations, data, media, heatmap, settings, model, confidence, examination_id=None, run_id=None, is_image=False):
    frame_count = sum(1 for _ in read_frames(annotations))
    if not frame_count:
        raise ValueError("Data kotak untuk koreksi tidak tersedia.")
    payload = {
        "id": analysis_id, "owner": owner, "source": str(source), "annotations": str(annotations),
        "original": data, "current": data, "original_media": str(media), "original_heatmap": str(heatmap) if heatmap else None,
        "media": str(media), "heatmap": str(heatmap) if heatmap else None,
        "settings": settings, "model": model, "confidence": confidence,
        "examination_id": examination_id, "run_id": run_id, "is_image": is_image,
        "width": data["calibration"]["frame_width"], "height": data["calibration"]["frame_height"],
        "frame_count": frame_count, "revision": 0, "overrides": {},
    }
    database = connection()
    try:
        with database:
            database.execute("INSERT INTO sessions VALUES (?, ?, ?)", (analysis_id, owner, json.dumps(payload, allow_nan=False)))
    finally:
        database.close()


def load_session(database, analysis_id, user, writable=False):
    row = database.execute("SELECT owner, payload FROM sessions WHERE id = ?", (analysis_id,)).fetchone()
    if row is None or row["owner"] != user["id"]:
        raise HTTPException(status_code=404, detail="Hasil analisis tidak ditemukan atau bukan milik Anda.")
    session = json.loads(row["payload"])
    if writable and session["examination_id"] is not None:
        check_analysis_target(session["examination_id"], user)
    return session


def result_payload(session, original=False):
    media_key, heatmap_key, data_key = ("original_media", "original_heatmap", "original") if original else ("media", "heatmap", "current")
    return {
        "success": True, "analysis_id": session["id"], "revision": 0 if original else session["revision"],
        "data": session[data_key], "isImage": session["is_image"],
        "video_url": sign_output_url(Path(session[media_key]).name, session["owner"]),
        "heatmap_url": sign_output_url(Path(session[heatmap_key]).name, session["owner"]) if session[heatmap_key] else None,
    }


@router.get("/{analysis_id}/annotations")
def annotation_metadata(analysis_id: str, user: dict = ANALYST):
    database = connection()
    try:
        session = load_session(database, analysis_id, user)
        return {key: session[key] for key in ("id", "width", "height", "frame_count", "is_image", "revision")} | {
            "fps": session["original"]["calibration"].get("fps"),
            "original_result": result_payload(session, original=True),
            "current_result": result_payload(session),
        }
    finally:
        database.close()


def frame_boxes(session, frame):
    if frame >= session["frame_count"]:
        raise HTTPException(status_code=404, detail="Frame tidak tersedia.")
    for index, boxes in read_frames(session["annotations"]):
        if index == frame:
            return boxes
    raise HTTPException(status_code=404, detail="Data kotak frame tidak tersedia.")


@router.get("/{analysis_id}/frames/{frame}")
def annotations_for_frame(analysis_id: str, frame: int, user: dict = ANALYST):
    database = connection()
    try:
        session = load_session(database, analysis_id, user)
        original = frame_boxes(session, frame)
        return {"frame": frame, "revision": session["revision"], "original": original, "boxes": session["overrides"].get(str(frame), original)}
    finally:
        database.close()


@router.get("/{analysis_id}/frame-image")
def original_frame_image(analysis_id: str, frame: int = Query(ge=0), user: dict = ANALYST):
    database = connection()
    try:
        session = load_session(database, analysis_id, user)
    finally:
        database.close()
    if frame >= session["frame_count"]:
        raise HTTPException(status_code=404, detail="Frame tidak tersedia.")
    if session["is_image"]:
        image = cv2.imread(session["source"])
    else:
        capture = cv2.VideoCapture(session["source"])
        try:
            capture.set(cv2.CAP_PROP_POS_FRAMES, frame)
            success, image = capture.read()
            if not success:
                image = None
        finally:
            capture.release()
    if image is None or image.shape[:2] != (session["height"], session["width"]):
        raise HTTPException(status_code=422, detail="Frame sumber tidak dapat dibaca dengan ukuran asli.")
    success, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 95])
    if not success:
        raise HTTPException(status_code=500, detail="Frame tidak dapat ditampilkan.")
    return Response(encoded.tobytes(), media_type="image/jpeg", headers={"Cache-Control": "no-store"})


def build_overrides(session, request):
    overrides = dict(session["overrides"])
    for frame in request.frames:
        originals = {box["id"]: box for box in frame_boxes(session, frame.frame)}
        corrected = []
        for box in frame.boxes:
            values = box.model_dump(mode="json")
            original = originals.get(box.id)
            unchanged = original is not None and all(values[key] == original[key] for key in ("box", "label", "track_id"))
            values["confidence"] = original.get("confidence") if unchanged else None
            if unchanged and "center" in original:
                values["center"] = original["center"]
            values["source"] = "ai" if unchanged else "manual"
            corrected.append(values)
        overrides[str(frame.frame)] = corrected
    if not request.tracks:
        return overrides, []
    if session["is_image"]:
        raise ValueError("Citra tunggal tidak memiliki pelacakan lintasan.")
    frames_by_index = {index: boxes for index, boxes in read_frames(session["annotations"])}
    reader = FrameReader(session["source"], session["width"], session["height"])
    try:
        propagation = propagate_tracks(reader, frames_by_index, overrides, session["frame_count"], request.tracks)
    finally:
        reader.close()
    return overrides, propagation


class AttachRequest(BaseModel):
    examination_id: int = Field(ge=1, strict=True)


@router.post("/{analysis_id}/attach")
def attach_analysis(analysis_id: str, request: AttachRequest, user: dict = ANALYST):
    database = connection()
    try:
        session = load_session(database, analysis_id, user)
        if session["examination_id"] is not None:
            if session["examination_id"] != request.examination_id:
                raise HTTPException(status_code=409, detail="Hasil analisis ini sudah dikaitkan ke pemeriksaan lain.")
            return {"ok": True, "examination_id": request.examination_id}
        if session["is_image"]:
            raise HTTPException(status_code=422, detail="Citra tunggal tidak dapat dikaitkan ke pemeriksaan.")
        check_analysis_target(request.examination_id, user)
        session["run_id"] = persist_video_analysis(
            examination_id=request.examination_id, actor_id=user["id"], source_path=session["source"],
            output_video_path=session["media"], heatmap_path=session["heatmap"], data=session["current"],
            calibration=session["settings"], model_path=session["model"], conf_thres=session["confidence"],
            expected_run_id=None,
        )
        session["examination_id"] = request.examination_id
        database.execute("BEGIN IMMEDIATE")
        database.execute("UPDATE sessions SET payload = ? WHERE id = ?", (json.dumps(session, allow_nan=False), analysis_id))
        database.commit()
        return {"ok": True, "examination_id": request.examination_id}
    finally:
        database.close()


@router.post("/{analysis_id}/corrections/preview")
def preview_corrections(analysis_id: str, request: CorrectionRequest, user: dict = ANALYST):
    database = connection()
    try:
        session = load_session(database, analysis_id, user)
        if session["revision"] != request.revision:
            raise HTTPException(status_code=409, detail="Hasil sudah berubah. Muat ulang editor sebelum melihat pratinjau.")
        validate_frames(request, session["width"], session["height"], session["frame_count"], session["is_image"])
        overrides, propagation = build_overrides(session, request)
        changed = [{"frame": int(key), "boxes": boxes} for key, boxes in overrides.items() if session["overrides"].get(key) != boxes]
        return {"propagation": propagation, "frames": changed}
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    finally:
        database.close()


@router.post("/{analysis_id}/corrections")
def save_corrections(analysis_id: str, request: CorrectionRequest, user: dict = ANALYST):
    database = connection()
    try:
        database.execute("BEGIN IMMEDIATE")
        session = load_session(database, analysis_id, user, writable=True)
        if session["revision"] != request.revision:
            raise HTTPException(status_code=409, detail="Hasil sudah berubah. Muat ulang editor sebelum menyimpan koreksi.")
        validate_frames(request, session["width"], session["height"], session["frame_count"], session["is_image"])
        overrides, propagation = build_overrides(session, request)
        if overrides == session["overrides"]:
            raise ValueError("Tidak ada perubahan kotak untuk disimpan.")
        revision = session["revision"] + 1
        output_base = OUTPUT_DIR / f"{analysis_id}_revision_{revision}_{uuid.uuid4().hex}"
        data, media, heatmap = render_revision(session, overrides, output_base)
        audit = {
            "analysis_id": analysis_id, "revision": revision, "previous_revision": session["revision"],
            "actor_id": user["id"], "created_at": datetime.now(timezone.utc).isoformat(),
            "reason": request.reason.strip(), "changed_frames": sorted(int(frame) for frame in overrides),
            "tracking_policy": "appearance_template_match_bidirectional",
            "tracks": propagation,
            "original_preserved": True,
        }
        data["manual_correction"] = audit
        report = Path(str(output_base) + "_full_report.json")
        report.write_text(json.dumps(data, allow_nan=False), encoding="utf-8")
        if session["examination_id"] is not None:
            session["run_id"] = persist_video_analysis(
                examination_id=session["examination_id"], actor_id=user["id"], source_path=session["source"],
                output_video_path=media, heatmap_path=heatmap, data=data, calibration=session["settings"],
                model_path=session["model"], conf_thres=session["confidence"], expected_run_id=session["run_id"],
            )
        session.update({"current": data, "media": media, "heatmap": heatmap, "revision": revision, "overrides": overrides})
        database.execute("INSERT INTO revisions VALUES (?, ?, ?)", (analysis_id, revision, json.dumps({"audit": audit, "frames": overrides, "result": data, "media": media, "heatmap": heatmap}, allow_nan=False)))
        database.execute("UPDATE sessions SET payload = ? WHERE id = ?", (json.dumps(session, allow_nan=False), analysis_id))
        database.commit()
        return result_payload(session) | {"propagation": propagation}
    except ValueError as error:
        database.rollback()
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception:
        database.rollback()
        raise
    finally:
        database.close()
