"""
CASA-AI Master Pipeline.
Integrates RT-DETR Detection, ByteTrack Tracking, Motion Analysis, 
Motility Classification, and Report Generation into a single workflow.
"""

import argparse
from pathlib import Path
import time
import numpy as np

# Import our custom modules
from tracking.tracker import SpermTracker
from analysis.motion import MotionAnalyzer
from analysis.classifier import MotilityClassifier
from analysis.calibration import CalibrationSettings
from analysis.quality import select_motion_trajectories, MIN_TRACK_OBSERVATIONS
from utils.detection import sperm_class_ids
from utils.annotations import frame_annotations
from reports.generator import ReportGenerator
import cv2

def run_pipeline(
    video_path: str, 
    model_path: str, 
    output_dir: str, 
    conf_thres: float = 0.25, 
    progress_callback=None,
    pixel_scale: float = 0.8,
    fps: float = 30.0,
    chamber_depth: float = 20.0,
    dilution_factor: float = 1.0,
    prog_speed_threshold: float = 25.0,
    prog_linearity_threshold: float = 0.8,
    immotile_speed_threshold: float = 5.0,
    fps_mode: str = "auto",
    chamber_type: str = "custom",
    annotation_callback=None,
):
    calibration = CalibrationSettings(
        pixel_scale=pixel_scale,
        fps=fps,
        fps_mode=fps_mode,
        chamber_type=chamber_type,
        chamber_depth=chamber_depth,
        dilution_factor=dilution_factor,
        prog_speed_threshold=prog_speed_threshold,
        prog_linearity_threshold=prog_linearity_threshold,
        immotile_speed_threshold=immotile_speed_threshold,
    )
    capture = cv2.VideoCapture(video_path)
    try:
        if not capture.isOpened():
            raise ValueError("Video tidak dapat dibuka.")
        metadata_fps = capture.get(cv2.CAP_PROP_FPS)
    finally:
        capture.release()
    if calibration.fps_mode == "auto":
        if not np.isfinite(metadata_fps) or metadata_fps <= 0:
            raise ValueError("FPS video tidak tersedia; pilih mode FPS manual dan masukkan FPS rekaman.")
        effective_fps = float(metadata_fps)
        fps_source = "video_metadata"
    else:
        effective_fps = calibration.fps
        fps_source = "manual"

    print(f"Starting CASA-AI Pipeline on {video_path}")
    
    video_id = Path(video_path).stem
    output_video_path = str(Path(output_dir) / f"{video_id}_annotated.webm")
    
    # 1. Initialize Components
    start_time = time.time()
    tracker = SpermTracker(model_path=model_path, conf_thres=conf_thres)
    motion_engine = MotionAnalyzer(fps=effective_fps, um_per_pixel=calibration.pixel_scale)
    classifier = MotilityClassifier(
        prog_speed_threshold=prog_speed_threshold,
        prog_linearity_threshold=prog_linearity_threshold,
        immotile_speed_threshold=immotile_speed_threshold
    )
    report_gen = ReportGenerator(output_dir=output_dir)
    
    # 2. Run Tracking
    model_name = "YOLO" if ('yolo' in model_path.lower() or 'best.pt' in model_path.lower()) else "RT-DETR"
    print(f"Step 1: Running {model_name} + ByteTrack...")
    
    video_writer = None
    frame_width, frame_height = 0, 0
    per_frame_counts = [] # track sperm count per frame for median calculation
    tracked_observations = 0
    
    # This processes the video and stores trajectories inside the tracker object
    try:
        for frame_idx, total_frames, img, tracks, detection_count in tracker.process_video(video_path):
            if video_writer is None:
                height, width = img.shape[:2]
                frame_height, frame_width = height, width
                fourcc = cv2.VideoWriter_fourcc(*'vp80')
                video_writer = cv2.VideoWriter(output_video_path, fourcc, effective_fps, (width, height))
                if not video_writer.isOpened():
                    raise RuntimeError("Encoder video WebM tidak tersedia.")

            video_writer.write(img)
            per_frame_counts.append(detection_count)
            tracked_observations += len(tracks)
            if annotation_callback is not None:
                annotation_callback(frame_idx, tracker.frame_detections)
            if progress_callback is not None:
                progress_callback(frame_idx, total_frames)
    finally:
        if video_writer is not None:
            video_writer.release()
    if not per_frame_counts:
        raise ValueError("Video tidak berisi frame yang dapat dianalisis.")
        
    all_trajectories = tracker.get_all_trajectories()
    
    valid_trajectories, quality = select_motion_trajectories(all_trajectories)
    # Preserve fractional medians; concentration counts all sperm detections,
    # independently of whether ByteTrack assigns an ID.
    canonical_count = float(np.median(per_frame_counts))
    detection_observations = sum(per_frame_counts)
    quality.update({
        "frames_analyzed": len(per_frame_counts),
        "detection_observations": detection_observations,
        "tracked_observations": tracked_observations,
        "tracking_assignment_percent": 100 * tracked_observations / detection_observations if detection_observations else None,
        "minimum_detections_per_frame": min(per_frame_counts),
        "maximum_detections_per_frame": max(per_frame_counts),
    })
    
    print(f"Tracking complete. Found {len(valid_trajectories)} valid tracks (filtered from {len(all_trajectories)}).")
    print(f"Canonical sperm count (median per-frame): {canonical_count}")
    
    # 3. Analyze Motion
    print("Step 2: Analyzing Motion Physics...")
    motion_stats = motion_engine.analyze_all(valid_trajectories)
    
    # 4. Classify Motility
    print("Step 3: Classifying Motility (Rule Engine)...")
    classifications = classifier.classify_all(motion_stats)
    summary_stats = classifier.get_summary_statistics(classifications)
    
    # Detection count and motility denominator describe different populations.
    summary_stats["total_sperm"] = canonical_count
    summary_stats["count_method"] = "median_detections_per_frame"
    summary_stats["total_tracks"] = len(valid_trajectories)
    summary_stats["motility_denominator"] = len(classifications)
    summary_stats["classification_counts"] = {
        category: sum(value == category for value in classifications.values())
        for category in ("Progressive", "Non-progressive", "Immotile")
    }
    
    # Calculate Estimated Concentration (Millions/mL)
    estimated_concentration = calibration.concentration(canonical_count, frame_width, frame_height)
        
    summary_stats["estimated_concentration"] = estimated_concentration
    summary_stats["motility_available"] = bool(valid_trajectories)
    
    # Generate Heatmap Image
    print("Generating Movement Heatmap...")
    heatmap_path = str(Path(output_dir) / f"{video_id}_heatmap.jpg")
    heatmap_img = np.zeros((frame_height, frame_width, 3), dtype=np.uint8)
    for track_id, trajectory in valid_trajectories.items():
        if len(trajectory) > 1:
            pts = np.array([[int(pt[0]), int(pt[1])] for pt in trajectory], np.int32)
            pts = pts.reshape((-1, 1, 2))
            cv2.polylines(heatmap_img, [pts], False, (0, 255, 255), 2) # Yellow lines for trajectories
    cv2.imwrite(heatmap_path, heatmap_img)
    
    analysis_duration = time.time() - start_time
    summary_stats["analysis_duration"] = analysis_duration
    
    aggregate_motion = motion_engine.get_aggregate_statistics(motion_stats)
    
    # 5. Generate Reports
    print("Step 4: Generating Reports...")
    
    # Combine data for JSON
    full_data = {
        "video_id": video_id,
        "summary": summary_stats,
        "motion": aggregate_motion,
        "calibration": calibration.snapshot(frame_width, frame_height, effective_fps, fps_source),
        "analysis_method": {
            **motion_engine.method_snapshot(),
            "confidence_threshold": conf_thres,
            "minimum_track_observations": MIN_TRACK_OBSERVATIONS,
            "maximum_frame_gap": 1,
            "segment_policy": quality["segment_policy"],
            "motility_basis": "track_ids_not_unique_cells",
        },
        "quality": quality,
        "sperm_details": []
    }
    
    for track_id, stats in motion_stats.items():
        full_data["sperm_details"].append({
            "id": track_id,
            "motion_stats": stats,
            "classification": classifications[track_id]
        })
        
    json_path = report_gen.generate_json_report(full_data, f"{video_id}_full_report.json")
    md_path = report_gen.generate_summary_markdown(video_id, summary_stats, full_data["calibration"], aggregate_motion, quality, full_data["analysis_method"])
    
    print("\n--- Pipeline Complete ---")
    print(f"JSON Report saved to: {json_path}")
    print(f"Markdown Summary saved to: {md_path}")
    print("\nSummary:")
    print(f"Total: {summary_stats['total_sperm']}")
    print(f"Progressive: {summary_stats['progressive_percent']:.1f}%")
    print(f"Non-Progressive: {summary_stats['non_progressive_percent']:.1f}%")
    print(f"Immotile: {summary_stats['immotile_percent']:.1f}%")
    
    return full_data, output_video_path, heatmap_path

def analyze_single_image(
    image_path: str, 
    model_path: str, 
    output_dir: str, 
    conf_thres: float = 0.25,
    pixel_scale: float = 0.8,
    chamber_depth: float = 20.0,
    dilution_factor: float = 1.0,
    calibration: CalibrationSettings = None,
    annotation_callback=None,
):
    if calibration is None:
        calibration = CalibrationSettings(pixel_scale=pixel_scale, chamber_depth=chamber_depth, dilution_factor=dilution_factor)
    report_gen = ReportGenerator(output_dir=output_dir)
    from ultralytics import YOLO, RTDETR
    import cv2
    import time as _time
    
    print(f"Starting CASA-AI Image Analysis on {image_path}")
    start_time = _time.time()
    image_id = Path(image_path).stem
    output_image_path = str(Path(output_dir) / f"{image_id}_annotated.jpg")
    
    try:
        if 'yolo' in model_path.lower() or 'best.pt' in model_path.lower():
            model = YOLO(model_path)
        else:
            model = RTDETR(model_path)
    except Exception:
        model = YOLO(model_path)
        
    results = model.predict(source=image_path, conf=conf_thres, save=False)
    r = results[0]
    annotated_img = r.plot()
    cv2.imwrite(output_image_path, annotated_img)
    
    # Count only sperms (class 0), exclude debris/cluster classes
    class_names = r.names if r.names else {}
    class_ids = sperm_class_ids(class_names)
    
    if r.boxes is not None and len(r.boxes) > 0:
        if r.boxes.cls is not None:
            classes = r.boxes.cls.cpu().numpy().astype(int)
            total_sperm = int(sum(1 for class_id in classes if class_id in class_ids))
        else:
            raise ValueError("Deteksi model tidak menyediakan label kelas.")
    else:
        total_sperm = 0
        
    if annotation_callback is not None:
        boxes = [] if r.boxes is None else frame_annotations(
            r.boxes.xyxy.cpu().numpy(), r.boxes.cls.cpu().numpy(), r.boxes.conf.cpu().numpy(), class_ids
        )
        annotation_callback(0, boxes)

    img_height, img_width = annotated_img.shape[:2]
    estimated_concentration = calibration.concentration(total_sperm, img_width, img_height)
    
    analysis_duration = _time.time() - start_time
    
    summary_stats = {
        "total_sperm": total_sperm,
        "count_method": "single_image_detections",
        "motility_denominator": 0,
        "estimated_concentration": estimated_concentration,
        "progressive_percent": 0.0,
        "non_progressive_percent": 0.0,
        "immotile_percent": 0.0,
        "motility_available": False,
        "analysis_duration": analysis_duration,
        "is_image": True
    }
    
    # Motion metrics are not calculable from a single frame
    motion_stats = {
        "average_speed": 0.0,
        "maximum_speed": 0.0,
        "average_distance": 0.0,
        "average_track_frames": 0.0,
        "average_path_speed": None,
        "average_straightness": None,
        "average_wobble": None,
    }
    
    full_data = {
        "video_id": image_id,
        "summary": summary_stats,
        "motion": motion_stats,
        "calibration": calibration.snapshot(img_width, img_height),
        "analysis_method": {"confidence_threshold": conf_thres, "motion_available": False},
        "sperm_details": []
    }
    
    report_gen.generate_json_report(full_data, f"{image_id}_full_report.json")
    return full_data, output_image_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CASA-AI Master Pipeline")
    parser.add_argument("--video", type=str, required=True, help="Path to input video")
    parser.add_argument("--model", type=str, default="runs/train/weights/best.pt", help="Path to RT-DETR weights")
    parser.add_argument("--output", type=str, default="reports/output", help="Output directory for reports")
    parser.add_argument("--pixel-scale", type=float, default=0.8, help="Micrometers per pixel")
    parser.add_argument("--fps-mode", choices=["auto", "manual"], default="auto")
    parser.add_argument("--fps", type=float, default=30.0, help="Recording FPS for manual mode")
    parser.add_argument("--chamber-depth", type=float, default=20.0, help="Chamber depth in micrometers")
    parser.add_argument("--dilution-factor", type=float, default=1.0)
    parser.add_argument("--prog-speed-threshold", type=float, default=25.0)
    parser.add_argument("--prog-linearity-threshold", type=float, default=0.8)
    parser.add_argument("--immotile-speed-threshold", type=float, default=5.0)
    
    args = parser.parse_args()
    run_pipeline(
        args.video, args.model, args.output,
        pixel_scale=args.pixel_scale, fps=args.fps, fps_mode=args.fps_mode,
        chamber_depth=args.chamber_depth, dilution_factor=args.dilution_factor,
        prog_speed_threshold=args.prog_speed_threshold,
        prog_linearity_threshold=args.prog_linearity_threshold,
        immotile_speed_threshold=args.immotile_speed_threshold,
    )
