"""
RT-DETR Prediction Script
Supports inference on images, folders, videos, and webcams.
Outputs bounding boxes, confidences, and FPS.
"""

import argparse
from pathlib import Path
from ultralytics import RTDETR

def run_inference(model_path: str, source: str, conf_thres: float = 0.25):
    """
    Run RT-DETR inference on the specified source.
    
    Args:
        model_path (str): Path to the trained RT-DETR weights (e.g., best.pt).
        source (str): Path to image, video, directory, or '0' for webcam.
        conf_thres (float): Confidence threshold for detections.
    """
    print(f"Loading model from {model_path}...")
    try:
        model = RTDETR(model_path)
    except Exception as e:
        print(f"Error loading model: {e}")
        return
        
    print(f"Running inference on {source}...")
    
    # Run prediction
    results = model.predict(
        source=source,
        conf=conf_thres,
        save=True,          # Save annotated images/videos
        save_txt=True,      # Save detection txt files
        save_conf=True,     # Save confidences in txt files
        project='runs/predict',
        name='exp',
        exist_ok=False      # Will auto-increment name if exists
    )
    
    print("Inference complete. Results saved to runs/predict/exp*")
    
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="RT-DETR Inference Script")
    parser.add_argument("--model", type=str, default="runs/train/weights/best.pt", help="Path to model weights")
    parser.add_argument("--source", type=str, required=True, help="Path to image, video, or folder. Use '0' for webcam.")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold")
    
    args = parser.parse_args()
    
    run_inference(args.model, args.source, args.conf)
