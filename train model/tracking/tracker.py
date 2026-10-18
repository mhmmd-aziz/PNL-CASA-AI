"""
Tracking Engine for CASA-AI.
Integrates ByteTrack to track sperm cells detected by RT-DETR.
Extracts Unique ID, Bounding Box, Confidence, and Trajectory.
"""

import cv2
import numpy as np
from pathlib import Path
from collections import defaultdict, deque
from ultralytics import RTDETR, YOLO
from utils.detection import sperm_class_ids
from utils.annotations import frame_annotations, attach_tracks

class SpermTracker:
    def __init__(self, model_path: str, conf_thres: float = 0.25):
        """
        Initialize the Tracker with a trained model.
        Supports both YOLO and RT-DETR models.
        """
        # Try loading with YOLO first if 'yolo' is in the name, or just try both
        model_type = None
        try:
            if 'yolo' in model_path.lower() or 'best.pt' in model_path.lower():
                self.model = YOLO(model_path)
                model_type = "YOLO"
            else:
                self.model = RTDETR(model_path)
                model_type = "RT-DETR"
        except Exception:
            # Fallback
            try:
                self.model = RTDETR(model_path)
                model_type = "RT-DETR"
            except Exception:
                self.model = YOLO(model_path)
                model_type = "YOLO"

        print(f"✓ Loaded {model_type} model from {Path(model_path).name}")
        self.conf_thres = conf_thres
        self.sperm_class_ids = sperm_class_ids(self.model.names)
        
        # Store trajectory history for each tracked ID
        # Format: { track_id: [(center_x, center_y, frame_idx), ...] }
        self.trajectories = defaultdict(list)
        self._detection_counts = deque()
        self._detection_boxes = deque()
        self.frame_detections = []
        # Register before model.track() installs its callback, which replaces
        # detection boxes with the subset assigned a tracking ID.
        self.model.add_callback("on_predict_postprocess_end", self._capture_detection_counts)

    def _capture_detection_counts(self, predictor):
        """Count sperm detections before ByteTrack filters unassigned boxes."""
        for result in predictor.results:
            boxes = result.boxes
            count = 0 if boxes is None else int(np.isin(
                boxes.cls.cpu().numpy().astype(int), self.sperm_class_ids
            ).sum())
            self._detection_counts.append(count)
            self._detection_boxes.append([] if boxes is None else frame_annotations(
                boxes.xyxy.cpu().numpy(), boxes.cls.cpu().numpy(), boxes.conf.cpu().numpy(), self.sperm_class_ids
            ))
        
    def process_video(self, video_path: str):
        """
        Process a video using RT-DETR + ByteTrack.
        Yields tracking data frame by frame.
        """
        self.trajectories.clear()
        self._detection_counts.clear()
        self._detection_boxes.clear()
        cap = cv2.VideoCapture(video_path)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.release()

        # Run tracking using ByteTrack. 
        # Ultralytics natively supports 'bytetrack.yaml'
        results = self.model.track(
            source=video_path,
            tracker="bytetrack.yaml",
            conf=self.conf_thres,
            classes=self.sperm_class_ids,
            stream=True # Use generator for memory efficiency on long videos
        )
        
        frame_idx = 0
        for r in results:
            frame_data = []
            
            # If detections exist and have been assigned an ID by ByteTrack
            if r.boxes is not None and r.boxes.id is not None:
                boxes = r.boxes.xyxy.cpu().numpy()
                confs = r.boxes.conf.cpu().numpy()
                track_ids = r.boxes.id.cpu().numpy().astype(int)
                
                for box, conf, track_id in zip(boxes, confs, track_ids):
                    x1, y1, x2, y2 = box
                    center_x = (x1 + x2) / 2.0
                    center_y = (y1 + y2) / 2.0
                    
                    # Update trajectory history
                    self.trajectories[track_id].append((center_x, center_y, frame_idx))
                    
                    frame_data.append({
                        "id": int(track_id),
                        "box": [float(x1), float(y1), float(x2), float(y2)],
                        "confidence": float(conf),
                        "center": (float(center_x), float(center_y))
                    })
            
            if not self._detection_counts:
                raise RuntimeError("Hitungan deteksi sebelum tracking tidak tersedia.")
            self.frame_detections = attach_tracks(self._detection_boxes.popleft(), frame_data)
            yield frame_idx, total_frames, r.plot(), frame_data, self._detection_counts.popleft()
            frame_idx += 1
            
    def get_trajectory(self, track_id: int) -> list:
        """
        Retrieve the full coordinate trajectory of a specific sperm ID.
        """
        return self.trajectories.get(track_id, [])

    def get_all_trajectories(self) -> dict:
        """
        Retrieve all recorded trajectories.
        """
        return dict(self.trajectories)
