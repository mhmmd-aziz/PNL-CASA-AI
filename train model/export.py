"""
RT-DETR Export Script
Exports the PyTorch model to specified formats (e.g., ONNX, TensorRT).
"""

import argparse
from ultralytics import RTDETR

def export_model(model_path: str, format: str = 'onnx'):
    """
    Export RT-DETR model.
    """
    print(f"Loading model from {model_path}...")
    try:
        model = RTDETR(model_path)
    except Exception as e:
        print(f"Error loading model: {e}")
        return
        
    print(f"Exporting model to {format} format...")
    export_path = model.export(format=format, opset=12)
    print(f"Export complete! File saved at: {export_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="RT-DETR Export Script")
    parser.add_argument("--model", type=str, default="runs/train/weights/best.pt", help="Path to model weights")
    parser.add_argument("--format", type=str, default="onnx", help="Export format (onnx, torchscript, engine, etc.)")
    
    args = parser.parse_args()
    export_model(args.model, args.format)
