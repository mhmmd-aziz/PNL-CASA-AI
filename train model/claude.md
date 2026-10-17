# CLAUDE.md

# CASA-AI Hackathon 2026

## Project

AI-based Computer Assisted Sperm Analysis (CASA)

Theme:
Accessible Healthcare with AI

Target:
Develop an AI system capable of automatically analyzing sperm motility from microscopic videos.

The project is intended as an AI-assisted screening tool, NOT a medical diagnosis system.

---

# Primary Goal

Build an end-to-end AI pipeline that can:

- Detect every sperm cell
- Track every sperm
- Calculate motion
- Classify motility
- Generate screening report

The project must include AI fine-tuning.

Primary detection model:

RT-DETR

Tracking:

ByteTrack

Motion analysis:

Custom implementation using OpenCV + NumPy.

---

# Dataset

Dataset Source:

VISEM-Tracking Dataset (Kaggle)

This dataset already contains:

- Microscopic videos
- Extracted image frames
- YOLO format labels
- Tracking annotations
- Metadata

Dataset is already downloaded locally.

Claude should automatically detect dataset structure.

Expected folder example:

dataset/

    train/

        images/

        labels/

    valid/

        images/

        labels/

    test/

        images/

        labels/

If dataset split does not exist:

Automatically split dataset:

80%

10%

10%

---

# AI Model

Detection Model:

YOLO11n

Framework:

Ultralytics

Backbone:

Official YOLO11 pretrained COCO weights.

Task:

Object Detection

Classes:

1

Class Name:

sperm

Fine-tune the entire detection model using transfer learning.

Do not replace YOLO11 with RT-DETR or any other detector.

---

# Training

Create complete training pipeline.

Include:

train.py

predict.py

evaluate.py

export.py

Automatically generate:

runs/

weights/

best.pt

last.pt

training graphs

confusion matrix

PR Curve

mAP

Precision

Recall

Loss Graph

Training should support:

Resume

Mixed Precision

CUDA

Multi-worker DataLoader

Early Stopping

Checkpoint Saving

TensorBoard

---

# Hyperparameters

Epochs:

50

Image Size:

416

Batch Size:

32

Optimizer:

AdamW

Initial Learning Rate:

1e-4

Weight Decay:

1e-4

Scheduler:

Cosine Learning Rate

Mixed Precision:

Enabled

Early Stopping:

Patience = 10

Workers:

2

Cache Images:

Enabled if RAM >=16GB

Device:

CUDA GPU

---

# Inference

Create inference for

Single Image

Folder

Video

Webcam

Output should include

Bounding Box

Confidence

FPS

---

# Tracking

Use ByteTrack.

Pipeline:

Video

↓

RT-DETR

↓

ByteTrack

↓

Tracked IDs

Every sperm should have

Unique ID

Bounding Box

Confidence

Trajectory

---

# Motion Analysis

Develop custom module.

Input:

Tracking coordinates.

Output:

Speed

Direction

Distance

Track Length

Moving Time

Stopped Time

Average Speed

Maximum Speed

Trajectory

Motion History

# Motion Analysis Formula

For each tracked sperm:

Distance =
Euclidean distance between consecutive centroids.

Speed =
Distance / Time

Direction =
Angle between movement vectors.

Trajectory Length =
Accumulated travelled distance.

Movement Duration =
Number of tracked frames.

Linearity =
Straight Distance / Trajectory Length

Average Speed =
Mean speed across trajectory.

Classification:

Progressive

Average Speed > Threshold
AND
Linearity > Threshold

Non-progressive

Moving
BUT
Speed below threshold

Immotile

Movement below threshold

---

# Tracking Engine

Tracking MUST use ByteTrack.

Do NOT replace ByteTrack with:

- DeepSORT
- StrongSORT
- BoT-SORT
- OCSORT

ByteTrack is mandatory.

# Motility Classification

Do NOT use another Deep Learning model.

Develop custom rule engine.

Categories

Progressive

Non-progressive

Immotile

Classification based on

Average Speed

Movement Distance

Linearity

Trajectory

Movement Duration

---

# AI Report

Automatically generate JSON.

Example

{

"total_sperm": 534,

"progressive": 63,

"non_progressive": 21,

"immotile": 16,

"average_speed": 34.7,

"average_distance": 82.3

}

Generate readable summary.

Example:

The analyzed sample demonstrates predominantly progressive sperm motility with acceptable average movement speed. This result may assist laboratory screening but must not replace professional medical interpretation.

---

# Evaluation

Compute

Precision

Recall

F1

mAP50

mAP50-95

Inference Time

FPS

Average Tracking Time

---

# Folder Structure

project/

dataset/

models/

weights/

runs/

configs/

scripts/

tracking/

analysis/

reports/

utils/

train.py

predict.py

evaluate.py

export.py

requirements.txt

README.md

CLAUDE.md

---

# Coding Standards

Python 3.11

PyTorch

Ultralytics

OpenCV

NumPy

SciPy

ByteTrack

TorchMetrics

Hydra configuration preferred.

Every function must include

Type Hints

Docstrings

Logging

Error handling

No duplicated code.

Use modular architecture.

---

# Deliverables

✓ Dataset Loader

✓ YOLO11 Training Pipeline

✓ Validation Pipeline

✓ Model Evaluation

✓ Prediction Module

✓ Video Inference

✓ ByteTrack Integration

✓ Motion Analysis Engine

✓ Motility Classification

✓ AI Report Generator

✓ Export Model

✓ Experiment Logger