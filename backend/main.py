from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
import shutil
import os
import sys
from pathlib import Path
import uuid
from typing import Literal, Optional
from pydantic import ValidationError

# Add the train model directory to sys.path so we can import pipeline
TRAIN_MODEL_DIR = Path(__file__).parent.parent / "train model"
sys.path.append(str(TRAIN_MODEL_DIR))

from analysis.calibration import CalibrationSettings
from calibration_store import load_calibration, save_calibration

def make_serializable(obj):
    if isinstance(obj, dict):
        return {str(k): make_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [make_serializable(v) for v in obj]
    elif hasattr(obj, 'tolist'):
        return make_serializable(obj.tolist())
    elif hasattr(obj, 'item'):
        return obj.item()
    return obj

try:
    from pipeline import run_pipeline, analyze_single_image
except ImportError as e:
    print(f"Error importing pipeline: {e}")
    # Provide a dummy fallback for development if import fails
    def run_pipeline(*args, **kwargs):
        raise RuntimeError("Pipeline module not found.")
    def analyze_single_image(*args, **kwargs):
        raise RuntimeError("Pipeline module not found.")

app = FastAPI(title="CASA-AI API")

from auth_routes import router as auth_router, require_roles, sign_output_url, verify_output_url
from database.db_connection import log_audit_event
app.include_router(auth_router)
from examinations_routes import router as examinations_router, patients_router, check_analysis_target, persist_video_analysis
app.include_router(examinations_router)
app.include_router(patients_router)
from examinations_routes import ensure_queue_columns
ensure_queue_columns()
from review_routes import router as review_router
app.include_router(review_router)
from reports_routes import router as reports_router
app.include_router(reports_router)
from admin_routes import router as admin_router
app.include_router(admin_router)
from dashboard_routes import router as dashboard_router
app.include_router(dashboard_router)
from correction_routes import router as correction_router, capture_annotations, register_analysis
app.include_router(correction_router)
from detection_routes import router as detection_router
app.include_router(detection_router)

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"
OUTPUT_DIR = Path(__file__).resolve().parent / "outputs"
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

# Mount outputs so videos can be served to the frontend

@app.get("/outputs/{file_name}")
async def get_output_file(
    file_name: str,
    uid: Optional[int] = None,
    exp: Optional[int] = None,
    sig: Optional[str] = None,
):
    """Hasil video/gambar analisis: hanya lewat URL bertanda tangan milik analis atau dokter."""
    user = verify_output_url(file_name, uid, exp, sig)
    if user["role"] not in ("ANALYST", "PHYSICIAN"):
        raise HTTPException(status_code=403, detail="Peran Anda tidak memiliki akses ke berkas ini.")
    safe_name = Path(file_name).name
    file_path = OUTPUT_DIR / safe_name
    if safe_name != file_name or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Berkas tidak ditemukan.")
    return FileResponse(file_path)


def read_calibration():
    try:
        return load_calibration()
    except (OSError, ValueError) as error:
        raise HTTPException(status_code=500, detail="Tidak dapat membaca konfigurasi kalibrasi tersimpan.") from error


@app.get("/api/calibration", response_model=CalibrationSettings)
async def get_calibration(user: dict = Depends(require_roles("ANALYST", "SUPER_ADMIN"))):
    return read_calibration()


@app.put("/api/calibration", response_model=CalibrationSettings)
async def update_calibration(settings: CalibrationSettings, user: dict = Depends(require_roles("SUPER_ADMIN"))):
    try:
        previous = load_calibration().model_dump()
    except (OSError, ValueError):
        previous = None
    try:
        saved = save_calibration(settings)
    except OSError as error:
        raise HTTPException(status_code=500, detail="Konfigurasi kalibrasi gagal disimpan di server.") from error
    current = saved.model_dump()
    changed = sorted(key for key, value in current.items() if previous is None or previous.get(key) != value)
    log_audit_event(
        actor_id=user["id"],
        action_type="UPDATE_CALIBRATION",
        description=f"Profil kalibrasi disimpan. Nilai berubah: {', '.join(changed) or 'tidak ada'}",
        target_type="calibration",
        actor_email=user.get("email"),
        actor_role=user.get("role"),
        before_state=previous,
        after_state=current,
    )
    return saved


def audit_analysis(*, user, examination_id, task_id, model_path, conf_thres, calibration, kind, run_id=None, error=None):
    """Mencatat hasil sebuah analisis (berhasil atau gagal). Kegagalan mencatat tidak boleh menggagalkan analisis."""
    try:
        ok = error is None
        log_audit_event(
            actor_id=user["id"],
            action_type="RUN_ANALYSIS",
            description=(f"Analisis {kind} selesai" if ok else f"Analisis {kind} gagal") + f" (tugas {task_id[:8]})",
            target_type="examination" if examination_id is not None else "analysis",
            target_id=examination_id,
            actor_email=user.get("email"),
            actor_role=user.get("role"),
            after_state={
                "task_id": task_id, "run_id": run_id, "model": Path(model_path).name,
                "conf_thres": conf_thres, "calibration": calibration.model_dump(),
            },
            result="SUCCESS" if ok else "FAILURE",
            error_message=None if ok else str(error)[:300],
        )
    except Exception:
        import traceback
        traceback.print_exc()


def audit_upload(*, user, examination_id, task_id, path, kind):
    """Mencatat unggahan media. Nama berkas asli dari klien sengaja tidak disimpan di log."""
    size = path.stat().st_size
    log_audit_event(
        actor_id=user["id"],
        action_type="UPLOAD_MEDIA",
        description=f"{kind.capitalize()} diunggah untuk analisis (tugas {task_id[:8]}, {size} byte)",
        target_type="examination" if examination_id is not None else "analysis",
        target_id=examination_id,
        actor_email=user.get("email"),
        actor_role=user.get("role"),
        after_state={"task_id": task_id, "extension": path.suffix.lower(), "size_bytes": size},
    )


def analysis_calibration(
    pixel_scale: Optional[float] = Form(None),
    fps: Optional[float] = Form(None),
    fps_mode: Optional[Literal["auto", "manual"]] = Form(None),
    chamber_type: Optional[Literal["custom", "makler", "leja", "neubauer"]] = Form(None),
    chamber_depth: Optional[float] = Form(None),
    dilution_factor: Optional[float] = Form(None),
    prog_speed_threshold: Optional[float] = Form(None),
    prog_linearity_threshold: Optional[float] = Form(None),
    immotile_speed_threshold: Optional[float] = Form(None),
):
    settings = read_calibration().model_dump()
    overrides = {
        "pixel_scale": pixel_scale,
        "fps": fps,
        "fps_mode": fps_mode,
        "chamber_type": chamber_type,
        "chamber_depth": chamber_depth,
        "dilution_factor": dilution_factor,
        "prog_speed_threshold": prog_speed_threshold,
        "prog_linearity_threshold": prog_linearity_threshold,
        "immotile_speed_threshold": immotile_speed_threshold,
    }
    if chamber_type is None and chamber_depth is not None and chamber_depth != settings["chamber_depth"]:
        overrides["chamber_type"] = "custom"
    if fps_mode is None and fps is not None:
        overrides["fps_mode"] = "manual"
    settings.update({key: value for key, value in overrides.items() if value is not None})
    try:
        return CalibrationSettings.model_validate(settings)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=error.errors(include_context=False, include_input=False)) from error


def trained_model_path():
    candidates = [
        TRAIN_MODEL_DIR / "runs" / "train_sperma_undersampled_cepat2" / "weights" / "best.pt",
        TRAIN_MODEL_DIR / "runs" / "train" / "weights" / "best.pt",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    raise HTTPException(status_code=503, detail="Bobot model sperma terlatih tidak ditemukan. Analisis tidak dijalankan dengan model generik.")

# Stores for background tasks
PROGRESS_STORE = {}
RESULT_STORE = {}
TASK_OWNERS = {}

def process_video_task(
    task_id: str, 
    video_path: str, 
    model_path: str, 
    output_dir: str, 
    conf_thres: float,
    calibration: CalibrationSettings,
    examination_id: Optional[int] = None,
    actor_id: Optional[int] = None,
    actor: Optional[dict] = None
):
    actor = actor or {"id": actor_id}
    try:
        def progress_callback(frame_idx, total_frames):
            PROGRESS_STORE[task_id] = {"status": "processing", "frame": frame_idx, "total_frames": total_frames}
            
        with capture_annotations(task_id) as (annotations_path, capture):
            full_data, output_video_path, heatmap_path = run_pipeline(
                video_path=video_path,
                model_path=model_path,
                output_dir=output_dir,
                conf_thres=conf_thres,
                progress_callback=progress_callback,
                annotation_callback=capture,
                **calibration.model_dump()
            )

        full_data = make_serializable(full_data)
        
        video_filename = Path(output_video_path).name
        video_url = sign_output_url(video_filename, actor_id)
        
        heatmap_filename = Path(heatmap_path).name
        heatmap_url = sign_output_url(heatmap_filename, actor_id)
        
        run_id = None
        if examination_id is not None:
            run_id = persist_video_analysis(
                examination_id=examination_id,
                actor_id=actor_id,
                source_path=video_path,
                output_video_path=output_video_path,
                heatmap_path=heatmap_path,
                data=full_data,
                calibration=calibration.model_dump(),
                model_path=model_path,
                conf_thres=conf_thres,
            )

        register_analysis(task_id, actor_id, video_path, annotations_path, full_data, output_video_path, heatmap_path,
                          calibration.model_dump(), model_path, conf_thres, examination_id, run_id)

        RESULT_STORE[task_id] = {
            "success": True,
            "analysis_id": task_id,
            "revision": 0,
            "data": full_data,
            "video_url": video_url,
            "heatmap_url": heatmap_url
        }
        audit_analysis(user=actor, examination_id=examination_id, task_id=task_id, model_path=model_path,
                       conf_thres=conf_thres, calibration=calibration, kind="video", run_id=run_id)
    except Exception as e:
        import traceback
        traceback.print_exc()
        audit_analysis(user=actor, examination_id=examination_id, task_id=task_id, model_path=model_path,
                       conf_thres=conf_thres, calibration=calibration, kind="video", error=e)
        RESULT_STORE[task_id] = {
            "success": False,
            "error": str(e)
        }

@app.post("/api/analyze")
async def analyze_video(
    background_tasks: BackgroundTasks,
    video: UploadFile = File(...),
    conf_thres: float = Form(0.25, gt=0, le=1, allow_inf_nan=False),
    calibration: CalibrationSettings = Depends(analysis_calibration),
    examination_id: Optional[int] = Form(None),
    user: dict = Depends(require_roles("ANALYST"))
):
    try:
        if examination_id is not None:
            check_analysis_target(examination_id, user)
        task_id = str(uuid.uuid4())
        model_path = trained_model_path()
        
        # Save uploaded video
        video_path = UPLOAD_DIR / f"{task_id}{Path(video.filename or 'video.mp4').suffix}"
        with open(video_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)
            
        audit_upload(user=user, examination_id=examination_id, task_id=task_id, path=video_path, kind="video")
        TASK_OWNERS[task_id] = user["id"]
        PROGRESS_STORE[task_id] = {"status": "starting", "frame": 0}
        
        background_tasks.add_task(
            process_video_task,
            task_id=task_id,
            video_path=str(video_path),
            model_path=model_path,
            output_dir=str(OUTPUT_DIR),
            conf_thres=conf_thres,
            calibration=calibration,
            examination_id=examination_id,
            actor_id=user["id"],
            actor=user
        )
        
        return JSONResponse(content={"task_id": task_id})
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/progress/{task_id}")
async def get_progress(task_id: str, user: dict = Depends(require_roles("ANALYST"))):
    if TASK_OWNERS.get(task_id) != user["id"]:
        raise HTTPException(status_code=404, detail="Task not found")
    if task_id in RESULT_STORE:
        result = RESULT_STORE[task_id]
        # Clean up safely
        PROGRESS_STORE.pop(task_id, None)
        RESULT_STORE.pop(task_id, None)
        TASK_OWNERS.pop(task_id, None)
        return JSONResponse(content={"status": "completed", "result": result})

    if task_id in PROGRESS_STORE:
        return JSONResponse(content=PROGRESS_STORE[task_id])
        
    raise HTTPException(status_code=404, detail="Task not found")

@app.post("/api/analyze_image")
async def analyze_image_endpoint(
    image: UploadFile = File(...),
    conf_thres: float = Form(0.25, gt=0, le=1, allow_inf_nan=False),
    calibration: CalibrationSettings = Depends(analysis_calibration),
    examination_id: Optional[int] = Form(None),
    user: dict = Depends(require_roles("ANALYST"))
):
    if examination_id is not None:
        raise HTTPException(status_code=422, detail="Analisis citra belum bisa dikaitkan ke pemeriksaan. Gunakan video untuk sampel pemeriksaan.")
    analysis_id = None
    model_path = ""
    try:
        model_path = trained_model_path()
        image_path = UPLOAD_DIR / f"{uuid.uuid4()}{Path(image.filename or 'image.jpg').suffix}"
        with open(image_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
            
        analysis_id = image_path.stem
        audit_upload(user=user, examination_id=None, task_id=analysis_id, path=image_path, kind="gambar")
        with capture_annotations(analysis_id) as (annotations_path, capture):
            full_data, output_image_path = analyze_single_image(
                image_path=str(image_path),
                model_path=model_path,
                output_dir=str(OUTPUT_DIR),
                conf_thres=conf_thres,
                calibration=calibration,
                annotation_callback=capture
            )

        full_data = make_serializable(full_data)
        
        image_filename = Path(output_image_path).name
        image_url = sign_output_url(image_filename, user["id"])
        
        register_analysis(analysis_id, user["id"], image_path, annotations_path, full_data, output_image_path, None,
                          calibration.model_dump(), model_path, conf_thres, is_image=True)
        audit_analysis(user=user, examination_id=None, task_id=analysis_id, model_path=model_path,
                       conf_thres=conf_thres, calibration=calibration, kind="gambar")

        return JSONResponse(content={
            "success": True,
            "analysis_id": analysis_id,
            "revision": 0,
            "data": full_data,
            "video_url": image_url,  # Use same key as video endpoint for frontend compatibility
            "heatmap_url": None
        })

        
    except HTTPException:
        raise
    except ValueError as error:
        if analysis_id is not None:
            audit_analysis(user=user, examination_id=None, task_id=analysis_id, model_path=model_path,
                           conf_thres=conf_thres, calibration=calibration, kind="gambar", error=error)
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as e:
        import traceback
        traceback.print_exc()
        if analysis_id is not None:
            audit_analysis(user=user, examination_id=None, task_id=analysis_id, model_path=model_path,
                           conf_thres=conf_thres, calibration=calibration, kind="gambar", error=e)
        raise HTTPException(status_code=500, detail=str(e))

# Triggering uvicorn reload

# Triggering uvicorn reload 2

# Triggering uvicorn reload 3

# Triggering uvicorn reload 4

# Triggering uvicorn reload 5

# Triggering uvicorn reload 6

# Triggering uvicorn reload 7
