"""Exercise real image/video inference on a short local sample, without training."""

import json
import os
import hashlib
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / ".tmp" / "qc-inference"
OUTPUT.mkdir(parents=True, exist_ok=True)
(ROOT / ".tmp" / "ultralytics" / "Ultralytics").mkdir(parents=True, exist_ok=True)
os.environ.setdefault("YOLO_CONFIG_DIR", str(ROOT / ".tmp" / "ultralytics"))
sys.path.insert(0, str(ROOT / "train model"))

import cv2
from analysis.calibration import CalibrationSettings
from pipeline import analyze_single_image, run_pipeline

source = cv2.VideoCapture(str(ROOT / "SAMPEL TEST" / "TEST 1.mp4"))
assert source.isOpened(), "Local sample cannot be opened"
fps = source.get(cv2.CAP_PROP_FPS)
ok, frame = source.read()
assert ok, "Sample has no readable frames"
height, width = frame.shape[:2]
image_path = OUTPUT / "sample.jpg"
assert cv2.imwrite(str(image_path), frame)
video_path = OUTPUT / "sample.avi"
writer = cv2.VideoWriter(str(video_path), cv2.VideoWriter_fourcc(*"MJPG"), fps, (width, height))
assert writer.isOpened()
try:
    writer.write(frame)
    for _ in range(29):
        ok, frame = source.read()
        if not ok:
            break
        writer.write(frame)
finally:
    writer.release()
    source.release()

model = str(ROOT / "train model" / "runs" / "train_sperma_undersampled_cepat2" / "weights" / "best.pt")
model_hash_before = hashlib.sha256(Path(model).read_bytes()).hexdigest()
image_data, image_output = analyze_single_image(str(image_path), model, str(OUTPUT))
assert image_data["summary"]["motility_available"] is False
assert image_data["calibration"]["fps"] is None
assert Path(image_output).stat().st_size > 0

results = {}
for mode in ("auto", "manual"):
    directory = OUTPUT / mode
    data, video_output, heatmap_output = run_pipeline(str(video_path), model, str(directory), fps_mode=mode, fps=60)
    expected_fps = fps if mode == "auto" else 60
    assert data["calibration"]["fps"] == expected_fps
    assert data["calibration"]["fps_source"] == ("video_metadata" if mode == "auto" else "manual")
    rendered = cv2.VideoCapture(video_output)
    try:
        assert rendered.isOpened()
        assert abs(rendered.get(cv2.CAP_PROP_FPS) - expected_fps) < .1
        assert rendered.read()[0], "Output video is not decodable"
    finally:
        rendered.release()
    assert cv2.imread(heatmap_output) is not None
    report = json.loads((directory / "sample_full_report.json").read_text())
    assert report["data"]["calibration"] == data["calibration"]
    assert data["summary"]["estimated_concentration"] == CalibrationSettings().concentration(data["summary"]["total_sperm"], width, height)
    if data["summary"]["motility_available"]:
        assert abs(sum(data["summary"][key] for key in ("progressive_percent", "non_progressive_percent", "immotile_percent")) - 100) < 1e-8
        assert data["summary"]["motility_denominator"] == len(data["sperm_details"])
        assert sum(data["summary"]["classification_counts"].values()) == data["summary"]["motility_denominator"]
        assert data["motion"]["average_path_speed"] is not None
        for item in data["sperm_details"]:
            stats = item["motion_stats"]
            assert stats["straight_line_speed"] <= stats["average_path_speed"] + 1e-8
            assert stats["average_path_speed"] <= stats["average_speed"] + 1e-8
    assert data["quality"]["tracked_observations"] <= data["quality"]["detection_observations"]
    assert data["analysis_method"]["smoothing_passes"] == 2
    results[mode] = data

assert results["auto"]["summary"]["total_sperm"] == results["manual"]["summary"]["total_sperm"]
assert results["auto"]["motion"]["average_speed"] > 0
assert abs(results["manual"]["motion"]["average_speed"] / results["auto"]["motion"]["average_speed"] - 60 / fps) < 1e-8
assert abs(results["manual"]["motion"]["average_path_speed"] / results["auto"]["motion"]["average_path_speed"] - 60 / fps) < 1e-8
assert hashlib.sha256(Path(model).read_bytes()).hexdigest() == model_hash_before
print("QC_REAL_INFERENCE_OK", json.dumps({"image": image_data["summary"], "video_auto": results["auto"]["summary"], "video_manual": results["manual"]["summary"], "source_fps": fps}))
