from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
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
app.mount("/outputs", StaticFiles(directory=str(OUTPUT_DIR)), name="outputs")


def read_calibration():
    try:
        return load_calibration()
    except (OSError, ValueError) as error:
        raise HTTPException(status_code=500, detail="Tidak dapat membaca konfigurasi kalibrasi tersimpan.") from error


@app.get("/api/calibration", response_model=CalibrationSettings)
async def get_calibration():
    return read_calibration()


@app.put("/api/calibration", response_model=CalibrationSettings)
async def update_calibration(settings: CalibrationSettings):
    try:
        return save_calibration(settings)
    except OSError as error:
        raise HTTPException(status_code=500, detail="Konfigurasi kalibrasi gagal disimpan di server.") from error


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

def process_video_task(
    task_id: str, 
    video_path: str, 
    model_path: str, 
    output_dir: str, 
    conf_thres: float,
    calibration: CalibrationSettings
):
    try:
        def progress_callback(frame_idx, total_frames):
            PROGRESS_STORE[task_id] = {"status": "processing", "frame": frame_idx, "total_frames": total_frames}
            
        full_data, output_video_path, heatmap_path = run_pipeline(
            video_path=video_path,
            model_path=model_path,
            output_dir=output_dir,
            conf_thres=conf_thres,
            progress_callback=progress_callback,
            **calibration.model_dump()
        )
        
        full_data = make_serializable(full_data)
        
        video_filename = Path(output_video_path).name
        video_url = f"/outputs/{video_filename}"
        
        heatmap_filename = Path(heatmap_path).name
        heatmap_url = f"/outputs/{heatmap_filename}"
        
        RESULT_STORE[task_id] = {
            "success": True,
            "data": full_data,
            "video_url": video_url,
            "heatmap_url": heatmap_url
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        RESULT_STORE[task_id] = {
            "success": False,
            "error": str(e)
        }

@app.post("/api/analyze")
async def analyze_video(
    background_tasks: BackgroundTasks,
    video: UploadFile = File(...),
    conf_thres: float = Form(0.25, gt=0, le=1, allow_inf_nan=False),
    calibration: CalibrationSettings = Depends(analysis_calibration)
):
    try:
        task_id = str(uuid.uuid4())
        model_path = trained_model_path()
        
        # Save uploaded video
        video_path = UPLOAD_DIR / f"{task_id}{Path(video.filename or 'video.mp4').suffix}"
        with open(video_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)
            
        PROGRESS_STORE[task_id] = {"status": "starting", "frame": 0}
        
        background_tasks.add_task(
            process_video_task,
            task_id=task_id,
            video_path=str(video_path),
            model_path=model_path,
            output_dir=str(OUTPUT_DIR),
            conf_thres=conf_thres,
            calibration=calibration
        )
        
        return JSONResponse(content={"task_id": task_id})
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/progress/{task_id}")
async def get_progress(task_id: str):
    if task_id in RESULT_STORE:
        result = RESULT_STORE[task_id]
        # Clean up safely
        PROGRESS_STORE.pop(task_id, None)
        RESULT_STORE.pop(task_id, None)
        return JSONResponse(content={"status": "completed", "result": result})
        
    if task_id in PROGRESS_STORE:
        return JSONResponse(content=PROGRESS_STORE[task_id])
        
    raise HTTPException(status_code=404, detail="Task not found")

@app.post("/api/analyze_image")
async def analyze_image_endpoint(
    image: UploadFile = File(...),
    conf_thres: float = Form(0.25, gt=0, le=1, allow_inf_nan=False),
    calibration: CalibrationSettings = Depends(analysis_calibration)
):
    try:
        model_path = trained_model_path()
        image_path = UPLOAD_DIR / f"{uuid.uuid4()}{Path(image.filename or 'image.jpg').suffix}"
        with open(image_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
            
        full_data, output_image_path = analyze_single_image(
            image_path=str(image_path),
            model_path=model_path,
            output_dir=str(OUTPUT_DIR),
            conf_thres=conf_thres,
            calibration=calibration
        )
        
        full_data = make_serializable(full_data)
        
        image_filename = Path(output_image_path).name
        image_url = f"/outputs/{image_filename}"
        
        return JSONResponse(content={
            "success": True,
            "data": full_data,
            "video_url": image_url,  # Use same key as video endpoint for frontend compatibility
            "heatmap_url": None
        })

        
    except HTTPException:
        raise
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# Triggering uvicorn reload

# Triggering uvicorn reload 2

# Triggering uvicorn reload 3

# Triggering uvicorn reload 4

# Triggering uvicorn reload 5

# Triggering uvicorn reload 6

# Triggering uvicorn reload 7
