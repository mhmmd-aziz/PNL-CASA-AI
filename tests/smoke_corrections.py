import hashlib
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / ".tmp" / "correction-smoke"
OUTPUT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "train model"))
os.environ.setdefault("YOLO_CONFIG_DIR", str(ROOT / ".tmp" / "ultralytics"))

import cv2
from analysis.calibration import CalibrationSettings
from detection_corrections import calculate_result, render_revision
from pipeline import run_pipeline, analyze_single_image

capture = cv2.VideoCapture(str(ROOT / "SAMPEL TEST" / "TEST 1.mp4"))
assert capture.isOpened()
fps = capture.get(cv2.CAP_PROP_FPS)
success, image = capture.read()
assert success
height, width = image.shape[:2]
source = OUTPUT / "source.avi"
writer = cv2.VideoWriter(str(source), cv2.VideoWriter_fourcc(*"MJPG"), fps, (width, height))
assert writer.isOpened()
try:
    writer.write(image)
    for frame_index in range(19):
        success, frame = capture.read()
        assert success
        writer.write(frame)
finally:
    writer.release()
    capture.release()

model = ROOT / "train model" / "runs" / "train_sperma_undersampled_cepat2" / "weights" / "best.pt"
model_hash = hashlib.sha256(model.read_bytes()).hexdigest()
annotations = []
data, original_media, _ = run_pipeline(str(source), str(model), str(OUTPUT), annotation_callback=lambda frame, boxes: annotations.append((frame, boxes)))
assert len(annotations) == 20
settings = CalibrationSettings().model_dump()
recomputed, _ = calculate_result(data, annotations, settings, False)
assert recomputed["summary"]["total_sperm"] == data["summary"]["total_sperm"]
assert recomputed["summary"]["motility_denominator"] == data["summary"]["motility_denominator"]
for metric in ["average_speed", "average_path_speed", "average_straight_line_speed"]:
    expected = data["motion"][metric]
    actual = recomputed["motion"][metric]
    assert expected == actual or abs(expected - actual) < 1e-8, (metric, expected, actual)
annotations_path = OUTPUT / "annotations.jsonl"
annotations_path.write_text(''.join(json.dumps({"frame": frame, "boxes": boxes}) + "\n" for frame, boxes in annotations), encoding="utf-8")
session = {"source": str(source), "annotations": str(annotations_path), "original": data, "settings": settings, "is_image": False, "width": width, "height": height}
original_hash = hashlib.sha256(Path(original_media).read_bytes()).hexdigest()
overrides = {str(frame): [] for frame, boxes in annotations}
corrected, revised_media, heatmap = render_revision(session, overrides, OUTPUT / "revised")
assert corrected["summary"]["total_sperm"] == 0
assert corrected["summary"]["estimated_concentration"] == 0
assert corrected["summary"]["motility_available"] is False
assert hashlib.sha256(Path(original_media).read_bytes()).hexdigest() == original_hash
rendered = cv2.VideoCapture(revised_media)
try:
    assert rendered.isOpened() and rendered.read()[0]
    assert int(rendered.get(cv2.CAP_PROP_FRAME_COUNT)) == 20
finally:
    rendered.release()
assert cv2.imread(heatmap) is not None
image_path = OUTPUT / "image.png"
cv2.imwrite(str(image_path), image)
image_annotations = []
image_data, _ = analyze_single_image(str(image_path), str(model), str(OUTPUT), annotation_callback=lambda frame, boxes: image_annotations.append((frame, boxes)))
assert len(image_annotations[0][1]) == image_data["summary"]["total_sperm"]
assert hashlib.sha256(model.read_bytes()).hexdigest() == model_hash
print("CORRECTION_REAL_INFERENCE_OK", json.dumps({"frames": 20, "original_count": data["summary"]["total_sperm"], "corrected_count": corrected["summary"]["total_sperm"], "image_boxes": len(image_annotations[0][1])}))
