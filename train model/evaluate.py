"""
RT-DETR Evaluation Script
Calculates Precision, Recall, F1, mAP50, and mAP50-95 on the validation set.
"""

import argparse
from ultralytics import RTDETR

def evaluate_model(model_path: str, data_yaml: str):
    """
    Evaluate trained RT-DETR model.
    """
    print(f"Loading model from {model_path}...")
    try:
        model = RTDETR(model_path)
    except Exception as e:
        print(f"Error loading model: {e}")
        return
        
    print(f"Evaluating on dataset {data_yaml}...")
    metrics = model.val(data=data_yaml)
    
    print("\n--- Evaluation Results ---")
    print(f"mAP50-95: {metrics.box.map:.4f}")
    print(f"mAP50:    {metrics.box.map50:.4f}")
    
    # Ultralytics metrics object contains precision and recall arrays
    # Extracting scalar values at conf threshold
    try:
        p = metrics.box.mp
        r = metrics.box.mr
        f1 = (2 * p * r) / (p + r) if (p + r) > 0 else 0
        print(f"Precision (mean): {p:.4f}")
        print(f"Recall (mean):    {r:.4f}")
        print(f"F1 Score:         {f1:.4f}")
    except Exception:
        print("Note: Detailed P/R metrics are saved in runs/val directory.")
        
    print("Evaluation complete. Detailed results saved in runs/val/")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="RT-DETR Evaluation Script")
    parser.add_argument("--model", type=str, default="runs/train/weights/best.pt", help="Path to model weights")
    parser.add_argument("--data", type=str, default="dataset/dataset.yaml", help="Path to data.yaml")
    
    args = parser.parse_args()
    evaluate_model(args.model, args.data)
