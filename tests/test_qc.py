"""Regression checks for calibration, numerical results, and API behavior."""

import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
from unittest.mock import MagicMock

ROOT = Path(__file__).resolve().parents[1]
(ROOT / ".tmp" / "ultralytics" / "Ultralytics").mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "train model"))
os.environ.setdefault("YOLO_CONFIG_DIR", str(ROOT / ".tmp" / "ultralytics"))

from fastapi.testclient import TestClient
from pydantic import ValidationError
import main
import auth_routes
import calibration_store
import correction_routes
from analysis.calibration import CalibrationSettings
from analysis.motion import MotionAnalyzer
from analysis.classifier import MotilityClassifier
from reports.generator import ReportGenerator
from utils.detection import sperm_class_ids
from analysis.quality import select_motion_trajectories
from tracking.tracker import SpermTracker
from ultralytics.engine.results import Results
import numpy as np
import torch
import pipeline


class NumericalQC(unittest.TestCase):
    def test_straight_path_vap_matches_vsl_and_vcl(self):
        stats = MotionAnalyzer(fps=10, um_per_pixel=2).analyze_trajectory([(i * 3, i * 4, i) for i in range(20)])
        self.assertAlmostEqual(stats["average_path_speed"], 100)
        self.assertAlmostEqual(stats["straightness"], 1)
        self.assertAlmostEqual(stats["wobble"], 1)

    def test_zigzag_smoothing_reduces_length_without_losing_endpoints(self):
        trajectory = [(i, (-1) ** i * 3, i) for i in range(21)]
        stats = MotionAnalyzer().analyze_trajectory(trajectory)
        self.assertLess(stats["average_path_speed"], stats["average_speed"])
        self.assertGreaterEqual(stats["average_path_speed"], stats["straight_line_speed"])
        self.assertGreater(stats["straightness"], 0)
        self.assertLessEqual(stats["straightness"], 1)
        self.assertGreater(stats["wobble"], 0)
        self.assertLess(stats["wobble"], 1)

    def test_vap_preserves_irregular_constant_speed_and_scales_with_fps(self):
        trajectory = [(i * 3, i * 4, i) for i in [0, 1, 4, 8, 10]]
        a = MotionAnalyzer(fps=10, um_per_pixel=2).analyze_trajectory(trajectory)
        b = MotionAnalyzer(fps=20, um_per_pixel=2).analyze_trajectory(trajectory)
        self.assertAlmostEqual(a["average_path_speed"], 100)
        self.assertAlmostEqual(b["average_path_speed"], 2 * a["average_path_speed"])
        self.assertAlmostEqual(a["wobble"], b["wobble"])

    def test_stationary_vap_is_zero_but_ratios_are_undefined(self):
        engine = MotionAnalyzer()
        stationary = engine.analyze_trajectory([(5, 7, i) for i in range(20)])
        moving = engine.analyze_trajectory([(i, 0, i) for i in range(20)])
        self.assertEqual(stationary["average_path_speed"], 0)
        self.assertIsNone(stationary["straightness"])
        self.assertIsNone(stationary["wobble"])
        aggregate = engine.get_aggregate_statistics({1: stationary, 2: moving})
        self.assertEqual(aggregate["average_straightness"], 1)
        self.assertEqual(aggregate["straightness_track_count"], 1)
        self.assertEqual(aggregate["average_track_frames"], 20)
        json.dumps(aggregate, allow_nan=False)

    def test_gaps_are_not_bridged_or_counted_as_extra_cells(self):
        complete = [(i, 0, i) for i in range(16)]
        broken = [(i, 0, i) for i in list(range(10)) + list(range(20, 30))]
        two_segments = complete + [(i, 0, i) for i in range(50, 70)]
        selected, quality = select_motion_trajectories({1: complete, 2: broken, 3: two_segments})
        self.assertEqual(set(selected), {1, 3})
        self.assertEqual(len(selected[3]), 20)
        self.assertEqual(selected[3][0][2], 50)
        self.assertEqual(quality["tracks_with_gaps"], 2)
        self.assertEqual(quality["excluded_track_ids"], 1)

    def test_concentration_units_and_dilution(self):
        settings = CalibrationSettings(pixel_scale=1, chamber_depth=20)
        self.assertAlmostEqual(settings.concentration(100, 1000, 1000), 5)
        diluted = settings.model_copy(update={"dilution_factor": 4})
        self.assertAlmostEqual(diluted.concentration(100, 1000, 1000), 20)

    def test_motion_with_skipped_frames_uses_elapsed_time(self):
        stats = MotionAnalyzer(fps=10, um_per_pixel=2).analyze_trajectory(
            [(0, 0, 0), (3, 4, 1), (6, 8, 5)]
        )
        self.assertAlmostEqual(stats["average_speed"], 40)
        self.assertAlmostEqual(stats["maximum_speed"], 100)
        self.assertAlmostEqual(stats["straight_line_speed"], 40)
        self.assertAlmostEqual(stats["linearity"], 1)

    def test_invalid_frame_order_rejected(self):
        with self.assertRaises(ValueError):
            MotionAnalyzer().analyze_trajectory([(0, 0, 1), (1, 1, 1)])

    def test_classification_threshold_boundaries(self):
        classifier = MotilityClassifier()
        for speed, linearity, expected in [(25, .8, "Progressive"), (25, .79, "Non-progressive"), (4.9, 1, "Immotile"), (5, 1, "Non-progressive")]:
            with self.subTest(speed=speed, linearity=linearity):
                self.assertEqual(classifier.classify_sperm({"movement_duration": 1, "average_speed": speed, "linearity": linearity}), expected)

    def test_invalid_calibration_rejected(self):
        for override in [{"pixel_scale": 0}, {"fps": float("nan")}, {"chamber_type": "makler", "chamber_depth": 20}, {"immotile_speed_threshold": 26}, {"dilution_factor": .5}]:
            with self.subTest(override=override), self.assertRaises(ValidationError):
                CalibrationSettings(**override)
        CalibrationSettings(prog_linearity_threshold=0, immotile_speed_threshold=0)

    def test_class_filter_excludes_clusters_and_debris(self):
        self.assertEqual(sperm_class_ids({0: "sperm", 1: "sperm cluster", 2: "debris"}), [0])
        with self.assertRaises(ValueError):
            sperm_class_ids({0: "person"})

    def test_unavailable_motility_markdown_is_na(self):
        with tempfile.TemporaryDirectory(dir=ROOT / ".tmp") as directory:
            path = ReportGenerator(directory).generate_summary_markdown("short", {"total_sperm": 4, "motility_available": False})
            report = path.read_text(encoding="utf-8")
            self.assertEqual(report.count("** N/A"), 3)
            self.assertNotIn("0.00%", report)


class ApiQC(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(dir=ROOT / ".tmp")
        directory = Path(self.directory.name)
        self.profile = directory / "calibration.json"
        self.patches = [
            patch.object(calibration_store, "CALIBRATION_PATH", self.profile),
            patch.object(main, "UPLOAD_DIR", directory),
            patch.object(correction_routes, "STORE_DIR", directory / "corrections"),
            patch.object(main, "register_analysis"),
            # Pencatatan audit tidak boleh menulis ke database lokal pada tes ini
            patch.object(main, "log_audit_event"),
        ]
        for item in self.patches:
            item.start()
        self.audit = main.log_audit_event
        # Endpoint kalibrasi/analisis kini butuh sesi; peran bawaan analis, diganti per tes bila perlu
        self.user = {"id": 1, "email": "analyst@lab.local", "full_name": "Analis", "role": "ANALYST"}
        main.app.dependency_overrides[auth_routes.get_current_user] = lambda: self.user
        self.client = TestClient(main.app, raise_server_exceptions=False)

    def tearDown(self):
        main.app.dependency_overrides.pop(auth_routes.get_current_user, None)
        self.client.close()
        for item in reversed(self.patches):
            item.stop()
        self.directory.cleanup()

    def test_profile_roundtrip_and_invalid_update_preserves_profile(self):
        self.user = {**self.user, "role": "SUPER_ADMIN"}
        profile = self.client.get("/api/calibration").json()
        profile.update(pixel_scale=1.2, chamber_type="makler", chamber_depth=10)
        self.assertEqual(self.client.put("/api/calibration", json=profile).status_code, 200)
        saved = self.audit.call_args.kwargs
        self.assertEqual(saved["action_type"], "UPDATE_CALIBRATION")
        self.assertEqual(saved["after_state"]["pixel_scale"], 1.2)
        self.assertNotEqual(saved["before_state"]["pixel_scale"], 1.2)
        self.assertEqual(self.client.get("/api/calibration").json(), profile)
        self.assertEqual(json.loads(self.profile.read_text()), profile)
        self.assertEqual(self.client.put("/api/calibration", json={**profile, "pixel_scale": 0}).status_code, 422)
        self.assertEqual(self.client.get("/api/calibration").json(), profile)

    def test_form_override_uses_saved_profile_and_legacy_fps(self):
        calibration_store.save_calibration(CalibrationSettings(pixel_scale=1.2, chamber_type="makler", chamber_depth=10))
        with patch.object(main, "trained_model_path", return_value="test.pt"), patch.object(main, "analyze_single_image", return_value=({"summary": {}}, "image.jpg")) as analyze:
            response = self.client.post("/api/analyze_image", files={"image": ("sample.jpg", b"test")}, data={"fps": "60", "chamber_depth": "30"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([call.kwargs["action_type"] for call in self.audit.call_args_list], ["UPLOAD_MEDIA", "RUN_ANALYSIS"])
        self.assertNotIn("sample.jpg", str(self.audit.call_args_list))
        settings = analyze.call_args.kwargs["calibration"]
        self.assertEqual(settings.pixel_scale, 1.2)
        self.assertEqual(settings.fps_mode, "manual")
        self.assertEqual(settings.fps, 60)
        self.assertEqual(settings.chamber_type, "custom")
        self.assertEqual(settings.chamber_depth, 30)
        self.assertEqual(calibration_store.load_calibration().chamber_depth, 10)

    def test_invalid_multipart_numbers_return_422(self):
        for endpoint, file_field in [("/api/analyze_image", "image"), ("/api/analyze", "video")]:
            for field, value in [("pixel_scale", "0"), ("pixel_scale", "nan"), ("fps", "inf"), ("conf_thres", "nan"), ("conf_thres", "2"), ("immotile_speed_threshold", "26")]:
                with self.subTest(endpoint=endpoint, field=field, value=value):
                    response = self.client.post(endpoint, files={file_field: ("sample.bin", b"test")}, data={field: value})
                    self.assertEqual(response.status_code, 422, response.text)

    def test_missing_model_is_service_unavailable(self):
        with patch.object(main, "TRAIN_MODEL_DIR", Path(self.directory.name)):
            response = self.client.post("/api/analyze_image", files={"image": ("sample.jpg", b"test")})
        self.assertEqual(response.status_code, 503)

    def test_corrupt_profile_returns_explicit_error(self):
        self.profile.write_text("broken", encoding="utf-8")
        response = self.client.get("/api/calibration")
        self.assertEqual(response.status_code, 500)
        self.assertIn("kalibrasi", response.json()["detail"])


class DetectionTrackingQC(unittest.TestCase):
    def test_counts_include_detections_without_tracking_ids(self):
        image = np.zeros((20, 20, 3), dtype=np.uint8)
        raw = Results(image, "sample.avi", {0: "sperm", 1: "debris"}, boxes=torch.tensor([
            [1, 1, 3, 3, .9, 0], [5, 5, 7, 7, .4, 0], [10, 10, 12, 12, .9, 1],
        ], dtype=torch.float32))
        tracked = raw[[0]]
        tracked.update(boxes=torch.tensor([[1, 1, 3, 3, 7, .9, 0]], dtype=torch.float32))
        unassigned = raw[[1]]
        model = MagicMock()
        model.names = {0: "sperm", 1: "debris"}
        callbacks = []
        model.add_callback.side_effect = lambda event, callback: callbacks.append(callback)
        def frames(**kwargs):
            self.assertEqual(kwargs["tracker"], "bytetrack.yaml")
            for before, after in [(raw, tracked), (unassigned, unassigned)]:
                for callback in callbacks:
                    callback(SimpleNamespace(results=[before]))
                yield after
        model.track.side_effect = frames
        with patch("tracking.tracker.YOLO", return_value=model), patch("tracking.tracker.cv2.VideoCapture"):
            tracker = SpermTracker("best.pt")
            frames = list(tracker.process_video("sample.avi"))
        self.assertEqual([frame[4] for frame in frames], [2, 1])
        self.assertEqual([len(frame[3]) for frame in frames], [1, 0])
        self.assertEqual(len(tracker.get_all_trajectories()[7]), 1)

    def test_pipeline_preserves_fractional_detection_median_without_tracks(self):
        image = np.zeros((20, 20, 3), dtype=np.uint8)
        tracker = MagicMock()
        tracker.process_video.return_value = [(0, 2, image, [], 1), (1, 2, image, [], 2)]
        tracker.get_all_trajectories.return_value = {}
        with tempfile.TemporaryDirectory(dir=ROOT / ".tmp") as directory, patch.object(pipeline, "SpermTracker", return_value=tracker), patch.object(pipeline.cv2, "VideoCapture") as capture, patch.object(pipeline.cv2, "VideoWriter"):
            capture.return_value.get.return_value = 30
            data, _, _ = pipeline.run_pipeline("sample.avi", "best.pt", directory)
            self.assertEqual(data["summary"]["total_sperm"], 1.5)
            self.assertEqual(data["summary"]["motility_denominator"], 0)
            self.assertFalse(data["summary"]["motility_available"])
            self.assertIsNone(data["motion"]["average_path_speed"])
            self.assertEqual(data["quality"]["detection_observations"], 3)
            self.assertEqual(data["quality"]["tracked_observations"], 0)
            self.assertAlmostEqual(data["summary"]["estimated_concentration"], CalibrationSettings().concentration(1.5, 20, 20))
            report = json.loads((Path(directory) / "sample_full_report.json").read_text())
            self.assertEqual(report["data"]["analysis_method"]["smoothing_passes"], 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
