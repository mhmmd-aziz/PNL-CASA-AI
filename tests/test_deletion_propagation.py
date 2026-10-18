"""Hapus kotak di editor koreksi harus ikut menghapus objek yang sama di frame lain.

Memakai video sintetis kecil: satu objek bergerak (A) dan satu objek diam (B). Tes regresi di bagian bawah
memastikan jalur tambah kotak (propagate_tracks) tetap berperilaku seperti sebelumnya.
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np
from fastapi import FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "train model"))

import correction_routes
from analysis.calibration import CalibrationSettings
from detection_corrections import (
    CorrectionRequest, DeletionSeed, EditedBox, EditedFrame, FrameReader, TrackSeed, propagate_deletions, propagate_tracks,
)

WIDTH, HEIGHT, FRAMES = 160, 120, 12
STATIC = (120, 30)


def moving(index):
    return 30 + 4 * index, 70


def box_around(center):
    return [float(center[0] - 9), float(center[1] - 9), float(center[0] + 9), float(center[1] + 9)]


def raw_boxes(index):
    """Bentuk kotak yang disimpan pipeline: A (bergerak, ID 5) dan B (diam, ID 6)."""
    return [
        {"id": "det-0", "box": box_around(moving(index)), "label": "sperm", "track_id": 5, "confidence": 0.9},
        {"id": "det-1", "box": box_around(STATIC), "label": "sperm", "track_id": 6, "confidence": 0.9},
    ]


def draw(gray, center):
    cv2.circle(gray, center, 8, 210, -1)
    cv2.circle(gray, (center[0] - 2, center[1] - 2), 3, 40, -1)


def make_video(directory, visible=range(FRAMES), flat=False):
    path = str(Path(directory) / "synthetic.avi")
    background = np.full((HEIGHT, WIDTH), 100, np.uint8) if flat else np.random.default_rng(1).integers(90, 130, (HEIGHT, WIDTH), dtype=np.uint8)
    writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"MJPG"), 10, (WIDTH, HEIGHT))
    for index in range(FRAMES):
        gray = background.copy()
        if not flat:
            draw(gray, STATIC)
            if index in visible:
                draw(gray, moving(index))
        writer.write(cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR))
    writer.release()
    return path


class SyntheticVideoCase(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.frames = {index: raw_boxes(index) for index in range(FRAMES)}

    def tearDown(self):
        self.directory.cleanup()

    def delete(self, video, frame, visible_box=None, label="sperm", edited=None):
        """Menghapus A pada `frame` (B tetap) lalu merambatkannya. Mengembalikan (overrides, ringkasan)."""
        overrides = {str(frame): edited if edited is not None else [self.frames[frame][1]]}
        seed = DeletionSeed(frame=frame, box=visible_box or self.frames[frame][0]["box"], label=label)
        reader = FrameReader(video, WIDTH, HEIGHT)
        try:
            summary = propagate_deletions(reader, self.frames, overrides, FRAMES, [seed])
        finally:
            reader.close()
        return overrides, summary

    def ids(self, overrides, index):
        return [item["id"] for item in overrides.get(str(index), self.frames[index])]


class PropagateDeletionTests(SyntheticVideoCase):
    def test_deletion_removes_the_same_object_in_every_frame_and_keeps_others(self):
        overrides, summary = self.delete(make_video(self.root), 6)
        for index in range(FRAMES):
            self.assertEqual(self.ids(overrides, index), ["det-1"], f"frame {index}")
        self.assertEqual(summary, [{"kind": "delete", "label": "sperm", "tracked": True, "start_frame": 0, "end_frame": 11, "linked_frames": 11}])

    def test_frames_without_a_matching_box_are_left_untouched(self):
        video = make_video(self.root)
        del self.frames[3][0]  # detektor melewatkan A di frame 3
        overrides, summary = self.delete(video, 6)
        self.assertNotIn("3", overrides)
        self.assertEqual(self.ids(overrides, 3), ["det-1"])
        self.assertEqual(summary[0]["linked_frames"], 10)

    def test_short_gap_is_bridged_but_a_gap_longer_than_three_frames_stops_the_search(self):
        # A hilang 3 frame (4-6): pencarian tetap berlanjut ketika A muncul lagi
        overrides, _ = self.delete(make_video(self.root, visible=[0, 1, 2, 3, 7, 8, 9, 10, 11]), 2, edited=None)
        removed = [index for index in range(FRAMES) if "det-0" not in self.ids(overrides, index)]
        self.assertEqual(removed, [0, 1, 2, 3, 7, 8, 9, 10, 11])
        self.assertEqual(self.ids(overrides, 5), ["det-0", "det-1"])  # frame tanpa objek tidak diubah

    def test_gap_longer_than_three_frames_stops(self):
        # A hilang 4 frame (4-7): pencarian berhenti, kemunculan berikutnya tidak ikut terhapus
        overrides, _ = self.delete(make_video(self.root, visible=[0, 1, 2, 3, 8, 9, 10, 11]), 2)
        removed = [index for index in range(FRAMES) if "det-0" not in self.ids(overrides, index)]
        self.assertEqual(removed, [0, 1, 2, 3])
        for index in range(8, FRAMES):
            self.assertEqual(self.ids(overrides, index), ["det-0", "det-1"])

    def test_low_contrast_object_is_deleted_only_in_the_current_frame(self):
        overrides, summary = self.delete(make_video(self.root, flat=True), 6)
        self.assertEqual(list(overrides), ["6"])
        self.assertEqual(summary, [{"kind": "delete", "label": "sperm", "tracked": False, "start_frame": 6, "end_frame": 6, "linked_frames": 0}])

    def test_invalid_frame_is_rejected(self):
        reader = FrameReader(make_video(self.root), WIDTH, HEIGHT)
        try:
            with self.assertRaises(ValueError):
                propagate_deletions(reader, self.frames, {}, FRAMES, [DeletionSeed(frame=FRAMES + 3, box=[1, 1, 5, 5])])
        finally:
            reader.close()

    def test_excluded_label_is_propagated_too(self):
        overrides, summary = self.delete(make_video(self.root), 6, label="excluded")
        self.assertEqual(summary[0]["label"], "excluded")
        self.assertEqual(self.ids(overrides, 0), ["det-1"])


class AddPathRegression(SyntheticVideoCase):
    """Pelacakan kotak baru (jalur tambah) tidak boleh berubah oleh fitur hapus."""

    def test_new_box_is_still_tracked_across_all_frames(self):
        video = make_video(self.root)
        manual = {"id": "manual-1", "box": box_around(moving(4)), "label": "sperm", "track_id": None, "confidence": None, "source": "manual"}
        overrides = {"4": [self.frames[4][1], manual]}
        reader = FrameReader(video, WIDTH, HEIGHT)
        try:
            summary = propagate_tracks(reader, self.frames, overrides, FRAMES, [TrackSeed(frame=4, box_id="manual-1")])
        finally:
            reader.close()
        self.assertEqual(summary[0]["track_id"], 7)
        self.assertEqual((summary[0]["start_frame"], summary[0]["end_frame"], summary[0]["linked_frames"]), (0, 11, 11))
        for index in range(FRAMES):
            self.assertIn(7, [item["track_id"] for item in overrides[str(index)]], f"frame {index}")

    def test_request_without_deletions_behaves_as_before(self):
        request = CorrectionRequest(revision=0, reason="Tanpa hapus", frames=[EditedFrame(frame=6, boxes=[])])
        self.assertEqual(request.deletions, [])


class BuildOverridesWithDeletions(SyntheticVideoCase):
    def setUp(self):
        super().setUp()
        self.video = make_video(self.root)
        self.annotations = self.root / "annotations.jsonl"
        self.annotations.write_text("\n".join(json.dumps({"frame": index, "boxes": boxes}) for index, boxes in self.frames.items()) + "\n", encoding="utf-8")
        self.session = {"annotations": str(self.annotations), "source": self.video, "width": WIDTH, "height": HEIGHT, "frame_count": FRAMES, "overrides": {}, "is_image": False}
        self.kept = EditedBox(id="det-1", box=tuple(self.frames[6][1]["box"]), label="sperm", track_id=6)

    def request(self, **extra):
        return CorrectionRequest(revision=0, reason="Bukan sperma", frames=[EditedFrame(frame=6, boxes=[self.kept])], **extra)

    def test_save_request_with_deletion_removes_the_object_everywhere(self):
        deletion = DeletionSeed(frame=6, box=tuple(self.frames[6][0]["box"]))
        overrides, propagation = correction_routes.build_overrides(self.session, self.request(deletions=[deletion]))
        self.assertEqual(sorted(overrides, key=int), [str(index) for index in range(FRAMES)])
        for boxes in overrides.values():
            self.assertEqual([item["id"] for item in boxes], ["det-1"])
        self.assertEqual((propagation[0]["kind"], propagation[0]["linked_frames"]), ("delete", 11))

    def test_without_deletion_only_the_edited_frame_changes(self):
        overrides, propagation = correction_routes.build_overrides(self.session, self.request())
        self.assertEqual(list(overrides), ["6"])
        self.assertEqual(propagation, [])

    def test_image_sessions_reject_deletion_tracking(self):
        self.session["is_image"] = True
        with self.assertRaises(ValueError):
            correction_routes.build_overrides(self.session, self.request(deletions=[DeletionSeed(frame=6, box=(1, 1, 5, 5))]))


class DeletionPreviewAPI(SyntheticVideoCase):
    def setUp(self):
        super().setUp()
        self.video = make_video(self.root)
        self.owner = {"id": 7, "role": "ANALYST", "email": "analis@lab.test"}
        self.patches = [
            patch.object(correction_routes, "STORE_DIR", self.root / "private"),
            patch.object(correction_routes, "OUTPUT_DIR", self.root),
            patch.object(correction_routes, "log_audit_event"),
        ]
        for item in self.patches:
            item.start()
        app = FastAPI()
        app.include_router(correction_routes.router)
        app.dependency_overrides[correction_routes.ANALYST.dependency] = lambda: self.owner
        self.client = TestClient(app)
        calibration = CalibrationSettings(pixel_scale=1, fps=10)
        original = {"summary": {"total_sperm": 2, "motility_available": True}, "motion": {}, "calibration": calibration.snapshot(WIDTH, HEIGHT, 10),
                    "analysis_method": {}, "sperm_details": []}
        with correction_routes.capture_annotations("video-session") as (path, capture):
            for index, boxes in self.frames.items():
                capture(index, boxes)
        correction_routes.register_analysis("video-session", 7, self.video, path, original, self.video, None, calibration.model_dump(), "best.pt", .25)

    def tearDown(self):
        self.client.close()
        for item in reversed(self.patches):
            item.stop()
        super().tearDown()

    def payload(self, **extra):
        kept = {"id": "det-1", "box": self.frames[6][1]["box"], "label": "sperm", "track_id": 6}
        return {"revision": 0, "reason": "Bukan sperma", "frames": [{"frame": 6, "boxes": [kept]}], **extra}

    def test_preview_returns_every_frame_where_the_object_was_removed(self):
        deletion = {"frame": 6, "box": self.frames[6][0]["box"], "label": "sperm"}
        response = self.client.post("/api/analysis/video-session/corrections/preview", json=self.payload(deletions=[deletion]))
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual(sorted(item["frame"] for item in result["frames"]), list(range(FRAMES)))
        for item in result["frames"]:
            self.assertEqual([box["id"] for box in item["boxes"]], ["det-1"])
        self.assertEqual(result["propagation"][0]["kind"], "delete")
        self.assertEqual(result["propagation"][0]["linked_frames"], 11)

    def test_old_clients_without_deletions_still_work(self):
        response = self.client.post("/api/analysis/video-session/corrections/preview", json=self.payload())
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([item["frame"] for item in response.json()["frames"]], [6])
        self.assertEqual(response.json()["propagation"], [])

    def test_out_of_bounds_deletion_is_rejected(self):
        bad = {"frame": 6, "box": [0, 0, WIDTH + 50, 10], "label": "sperm"}
        self.assertEqual(self.client.post("/api/analysis/video-session/corrections/preview", json=self.payload(deletions=[bad])).status_code, 422)
        wrong_frame = {"frame": FRAMES + 5, "box": [1, 1, 5, 5], "label": "sperm"}
        self.assertEqual(self.client.post("/api/analysis/video-session/corrections/preview", json=self.payload(deletions=[wrong_frame])).status_code, 422)


if __name__ == "__main__":
    unittest.main(verbosity=2)
