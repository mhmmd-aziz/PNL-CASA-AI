import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "train model"))

from analysis.calibration import CalibrationSettings
from detection_corrections import CorrectionRequest, calculate_result, validate_frames
from utils.annotations import attach_tracks, frame_annotations
import correction_routes


def detection(identifier="det-0", box=None, track_id=None, label="sperm"):
    return {"id": identifier, "box": box or [2, 2, 6, 6], "track_id": track_id, "label": label}


def baseline(is_image=False):
    calibration = CalibrationSettings(pixel_scale=1, fps=10)
    return {
        "summary": {"total_sperm": 1, "motility_available": not is_image, "analysis_duration": 1.2},
        "motion": {}, "calibration": calibration.snapshot(80, 60, None if is_image else 10),
        "analysis_method": {}, "sperm_details": [],
    }, calibration.model_dump()


class CorrectionNumerics(unittest.TestCase):
    def test_image_addition_recomputes_count_not_motility(self):
        original, settings = baseline(True)
        saved = copy.deepcopy(original)
        result, _ = calculate_result(original, [(0, [detection(), detection("manual-1", label="excluded"), detection("manual-2")])], settings, True)
        self.assertEqual(result["summary"]["total_sperm"], 2)
        self.assertFalse(result["summary"]["motility_available"])
        self.assertAlmostEqual(result["summary"]["estimated_concentration"], CalibrationSettings(**settings).concentration(2, 80, 60))
        self.assertEqual(original, saved)

    def test_single_frame_box_does_not_invent_a_track(self):
        original, settings = baseline()
        frames = [(index, [detection()]) for index in range(20)]
        result, _ = calculate_result(original, frames, settings, False)
        self.assertEqual(result["summary"]["total_sperm"], 1)
        self.assertEqual(result["summary"]["motility_denominator"], 0)
        self.assertFalse(result["summary"]["motility_available"])

    def test_track_move_recomputes_speed_and_deletion_breaks_segments(self):
        original, settings = baseline()
        frames = [(index, [detection(box=[index + 1, 2, index + 5, 6], track_id=1)]) for index in range(20)]
        result, _ = calculate_result(original, frames, settings, False)
        self.assertAlmostEqual(result["motion"]["average_speed"], 10)
        faster = [(index, [detection(box=[2 * index + 1, 2, 2 * index + 5, 6], track_id=1)]) for index in range(20)]
        revised, _ = calculate_result(original, faster, settings, False)
        self.assertAlmostEqual(revised["motion"]["average_speed"], 20)
        frames[10] = (10, [])
        broken, _ = calculate_result(original, frames, settings, False)
        self.assertFalse(broken["summary"]["motility_available"])
        self.assertEqual(broken["quality"]["tracks_with_gaps"], 1)

    def test_all_deleted_is_measured_zero_and_fractional_median_survives(self):
        original, settings = baseline()
        zero, _ = calculate_result(original, [(0, []), (1, [])], settings, False)
        self.assertEqual(zero["summary"]["estimated_concentration"], 0)
        partial, _ = calculate_result(original, [(0, [detection()]), (1, [detection(), detection("second")])], settings, False)
        self.assertEqual(partial["summary"]["total_sperm"], 1.5)

    def test_detection_capture_keeps_untracked_boxes_without_duplicate_ids(self):
        boxes = frame_annotations([[1, 1, 5, 5], [20, 20, 25, 25], [40, 40, 45, 45]], [0, 0, 1], [.9, .4, .8], [0])
        attach_tracks(boxes, [{"id": 12, "box": [1, 1, 5, 5]}])
        self.assertEqual(len(boxes), 2)
        self.assertEqual([box["track_id"] for box in boxes], [12, None])

    def test_validation_rejects_invalid_coordinates_ids_and_duplicate_tracks(self):
        cases = [
            [detection(box=[-1, 0, 4, 5])], [detection(box=[1, 1, 1, 5])],
            [detection(box=[1, 1, 81, 5])], [detection(), detection()],
            [detection(track_id=1), detection("second", track_id=1)],
        ]
        for boxes in cases:
            request = CorrectionRequest(revision=0, reason="Koreksi kotak", frames=[{"frame": 0, "boxes": boxes}])
            with self.assertRaises(ValueError):
                validate_frames(request, 80, 60, 1, False)
        with self.assertRaises(ValidationError):
            CorrectionRequest(revision=0, reason="Koreksi", frames=[{"frame": 0, "boxes": [detection(box=[float("nan"), 1, 4, 5])]}])
        request = CorrectionRequest(revision=0, reason="Koreksi", frames=[{"frame": 1, "boxes": []}])
        with self.assertRaises(ValueError):
            validate_frames(request, 80, 60, 1, False)


class CorrectionAPI(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.owner = {"id": 7, "role": "ANALYST"}
        self.patches = [
            patch.object(correction_routes, "STORE_DIR", self.root / "private"),
            patch.object(correction_routes, "OUTPUT_DIR", self.root),
            patch.object(correction_routes, "sign_output_url", side_effect=lambda name, owner: f"/outputs/{name}?test_owner={owner}"),
            # Pencatatan audit tidak boleh menulis ke database lokal pada tes ini
            patch.object(correction_routes, "log_audit_event"),
        ]
        for patched in self.patches:
            patched.start()
        self.audit = correction_routes.log_audit_event
        application = FastAPI()
        application.include_router(correction_routes.router)
        application.dependency_overrides[correction_routes.ANALYST.dependency] = lambda: self.owner
        self.client = TestClient(application)
        self.original, self.settings = baseline(True)
        self.source = self.root / "source.png"
        cv2.imwrite(str(self.source), np.zeros((60, 80, 3), dtype=np.uint8))
        with correction_routes.capture_annotations("test-session") as (path, capture):
            capture(0, [detection()])
        correction_routes.register_analysis("test-session", 7, self.source, path, self.original, self.source, None, self.settings, "best.pt", .25, is_image=True)

    def tearDown(self):
        self.client.close()
        for patched in reversed(self.patches):
            patched.stop()
        self.directory.cleanup()

    def request(self, revision=0, boxes=None):
        return {"revision": revision, "reason": "Objek terlewat ditambahkan", "frames": [{"frame": 0, "boxes": boxes if boxes is not None else [detection(), detection("manual-1", box=[10, 10, 14, 14])]}]}

    def test_original_frame_and_owner_access(self):
        response = self.client.get("/api/analysis/test-session/frame-image?frame=0")
        self.assertEqual(response.status_code, 200)
        image = cv2.imdecode(np.frombuffer(response.content, np.uint8), cv2.IMREAD_COLOR)
        self.assertEqual(image.shape, (60, 80, 3))
        self.assertEqual(int(image.sum()), 0)
        self.assertEqual(self.client.get("/api/analysis/test-session/frame-image?frame=1").status_code, 404)
        self.owner = {"id": 99, "role": "ANALYST"}
        self.assertEqual(self.client.get("/api/analysis/test-session/annotations").status_code, 404)
        self.assertEqual(self.client.post("/api/analysis/test-session/corrections", json=self.request()).status_code, 404)

    def test_save_revision_preserves_original_and_rejects_stale_edit(self):
        response = self.client.post("/api/analysis/test-session/corrections", json=self.request())
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual(result["revision"], 1)
        self.assertEqual(result["data"]["summary"]["total_sperm"], 2)
        self.assertEqual(result["data"]["manual_correction"]["actor_id"], 7)
        saved = self.audit.call_args.kwargs
        self.assertEqual(saved["action_type"], "SAVE_DETECTION_CORRECTION")
        self.assertEqual((saved["actor_id"], saved["target_type"]), (7, "analysis"))
        self.assertEqual(saved["after_state"]["revision"], 1)
        self.assertIn("Objek terlewat ditambahkan", saved["description"])
        self.assertNotIn("test_owner", json.dumps(result["data"]))
        stored = self.client.get("/api/analysis/test-session/annotations").json()
        self.assertEqual(stored["original_result"]["data"], self.original)
        self.assertNotEqual(stored["original_result"]["video_url"], stored["current_result"]["video_url"])
        self.assertEqual(self.client.post("/api/analysis/test-session/corrections", json=self.request()).status_code, 409)
        self.assertEqual(self.audit.call_count, 1)  # edit yang ditolak tidak dicatat sebagai koreksi tersimpan
        boxes = self.client.get("/api/analysis/test-session/frames/0").json()
        self.assertEqual(len(boxes["original"]), 1)
        self.assertEqual(len(boxes["boxes"]), 2)
        self.assertEqual(boxes["boxes"][1]["source"], "manual")
        self.assertIsNone(boxes["boxes"][1]["confidence"])

    def test_invalid_edit_or_render_failure_keeps_revision(self):
        invalid = self.client.post("/api/analysis/test-session/corrections", json=self.request(boxes=[detection(box=[0, 0, 900, 10])]))
        self.assertEqual(invalid.status_code, 422)
        with patch.object(correction_routes, "render_revision", side_effect=ValueError("Encoder unavailable")):
            self.assertEqual(self.client.post("/api/analysis/test-session/corrections", json=self.request()).status_code, 422)
        self.assertEqual(self.client.get("/api/analysis/test-session/annotations").json()["revision"], 0)

    def test_linked_review_lock_blocks_correction(self):
        database = correction_routes.connection()
        with database:
            session = correction_routes.load_session(database, "test-session", self.owner)
            session["examination_id"] = 42
            database.execute("UPDATE sessions SET payload = ? WHERE id = ?", (json.dumps(session), "test-session"))
        database.close()
        with patch.object(correction_routes, "check_analysis_target", side_effect=HTTPException(409, "Sudah ditinjau")), patch.object(correction_routes, "render_revision") as render:
            self.assertEqual(self.client.post("/api/analysis/test-session/corrections", json=self.request()).status_code, 409)
            render.assert_not_called()

    def test_revert_to_original_creates_second_revision(self):
        self.assertEqual(self.client.post("/api/analysis/test-session/corrections", json=self.request()).status_code, 200)
        response = self.client.post("/api/analysis/test-session/corrections", json=self.request(revision=1, boxes=[detection()]))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["data"]["summary"]["total_sperm"], 1)
        database = correction_routes.connection()
        self.assertEqual(database.execute("SELECT COUNT(*) FROM revisions").fetchone()[0], 2)
        database.close()


if __name__ == "__main__":
    unittest.main()
