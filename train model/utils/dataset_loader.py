"""
Dataset loader for CASA-AI.
This script parses the VISEM-Tracking Dataset and structures it into YOLO format
for RT-DETR training.
Splits data (80% train, 10% valid, 10% test) by video sequence to prevent data leakage.
"""

import os
import shutil
import random
import yaml
from pathlib import Path
from tqdm import tqdm

def create_yolo_dataset(source_dir: str, target_dir: str):
    print("Preparing YOLO dataset...")
    source_path = Path(source_dir)
    target_path = Path(target_dir)

    # Directories to create
    splits = ['train', 'valid', 'test']
    for split in splits:
        (target_path / 'images' / split).mkdir(parents=True, exist_ok=True)
        (target_path / 'labels' / split).mkdir(parents=True, exist_ok=True)

    train_path = source_path / 'Train'
    if not train_path.exists():
        raise FileNotFoundError(f"Source directory {train_path} not found.")

    # Get all video IDs
    video_ids = [d.name for d in train_path.iterdir() if d.is_dir()]
    video_ids.sort()
    
    # Shuffle predictably
    random.seed(42)
    random.shuffle(video_ids)

    # Split: 80% / 10% / 10%
    n_total = len(video_ids)
    n_train = int(0.8 * n_total)
    n_valid = int(0.1 * n_total)
    
    train_vids = video_ids[:n_train]
    valid_vids = video_ids[n_train:n_train+n_valid]
    test_vids = video_ids[n_train+n_valid:]

    print(f"Total videos: {n_total}")
    print(f"Train videos: {len(train_vids)} {train_vids}")
    print(f"Valid videos: {len(valid_vids)} {valid_vids}")
    print(f"Test videos: {len(test_vids)} {test_vids}")

    def copy_sequence(vid_id, split):
        vid_dir = train_path / str(vid_id)
        img_dir = vid_dir / 'images'
        lbl_dir = vid_dir / 'labels'
        
        if not img_dir.exists() or not lbl_dir.exists():
            print(f"Warning: {img_dir} or {lbl_dir} missing, skipping video {vid_id}.")
            return
            
        img_files = list(img_dir.glob('*.jpg')) + list(img_dir.glob('*.png'))
        
        for img_file in tqdm(img_files, desc=f"Copying {vid_id} -> {split}"):
            lbl_file = lbl_dir / (img_file.stem + '.txt')
            
            if not lbl_file.exists():
                continue
                
            dest_img = target_path / 'images' / split / f"{vid_id}_{img_file.name}"
            dest_lbl = target_path / 'labels' / split / f"{vid_id}_{lbl_file.name}"
            
            shutil.copy(img_file, dest_img)
            shutil.copy(lbl_file, dest_lbl)

    print("\nStarting copy process...")
    for vid in train_vids: copy_sequence(vid, 'train')
    for vid in valid_vids: copy_sequence(vid, 'valid')
    for vid in test_vids: copy_sequence(vid, 'test')

    # Create dataset.yaml
    yaml_path = target_path / 'dataset.yaml'
    # Use forward slashes for cross-platform compatibility in yaml
    dataset_yaml = {
        'path': target_path.absolute().as_posix(),
        'train': 'images/train',
        'val': 'images/valid',
        'test': 'images/test',
        'names': {
            0: 'sperm'
        }
    }
    
    with open(yaml_path, 'w') as f:
        yaml.dump(dataset_yaml, f, sort_keys=False)
        
    print(f"\nDataset preparation complete! Created {yaml_path}")

if __name__ == "__main__":
    SOURCE = "e:/INAFEST/daatsets sperm/VISEM_Tracking_Train_v4"
    TARGET = "e:/INAFEST/train model/dataset"
    create_yolo_dataset(SOURCE, TARGET)
