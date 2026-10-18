import copy
import json
import time
from collections import defaultdict
from pathlib import Path
from typing import Literal, Optional

import cv2
import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from analysis.calibration import CalibrationSettings
from analysis.classifier import MotilityClassifier
from analysis.motion import MotionAnalyzer
from analysis.quality import select_motion_trajectories


class EditedBox(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    id: str = Field(min_length=1, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")
    box: tuple[float, float, float, float]
    label: Literal["sperm", "excluded"] = "sperm"
    track_id: Optional[int] = Field(default=None, gt=0, strict=True)


class EditedFrame(BaseModel):
    model_config = ConfigDict(extra="forbid")
    frame: int = Field(ge=0, strict=True)
    boxes: list[EditedBox] = Field(max_length=5000)


class TrackSeed(BaseModel):
    model_config = ConfigDict(extra="forbid")
    frame: int = Field(ge=0, strict=True)
    box_id: str = Field(min_length=1, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")


class DeletionSeed(BaseModel):
    """Kotak yang baru dihapus analis pada satu frame; server mencari objek yang sama di frame lain lalu menghapusnya juga."""
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    frame: int = Field(ge=0, strict=True)
    box: tuple[float, float, float, float]
    label: Literal["sperm", "excluded"] = "sperm"


class CorrectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=0, strict=True)
    reason: str = Field(min_length=3, max_length=1000)
    frames: list[EditedFrame] = Field(min_length=1, max_length=50000)
    tracks: list[TrackSeed] = Field(default_factory=list, max_length=50000)
    deletions: list[DeletionSeed] = Field(default_factory=list, max_length=50000)


TRACK_MATCH_THRESHOLD = 0.6
TRACK_SNAP_IOU = 0.3
TRACK_MAX_GAP = 3


def box_iou(first, second):
    left, top = max(first[0], second[0]), max(first[1], second[1])
    right, bottom = min(first[2], second[2]), min(first[3], second[3])
    intersection = max(0.0, right - left) * max(0.0, bottom - top)
    if intersection <= 0:
        return 0.0
    union = (first[2] - first[0]) * (first[3] - first[1]) + (second[2] - second[0]) * (second[3] - second[1]) - intersection
    return intersection / union


class FrameReader:
    def __init__(self, path, width, height):
        self.capture = cv2.VideoCapture(path)
        if not self.capture.isOpened():
            raise ValueError("Sumber video tidak dapat dibuka untuk pelacakan.")
        self.width, self.height = width, height
        self.position = None

    def gray(self, index):
        if index != self.position:
            self.capture.set(cv2.CAP_PROP_POS_FRAMES, index)
        success, image = self.capture.read()
        self.position = index + 1 if success else None
        if not success or image.shape[:2] != (self.height, self.width):
            raise ValueError("Frame video sumber tidak dapat dibaca untuk pelacakan.")
        return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    def close(self):
        self.capture.release()


def _match(gray, template, center):
    height, width = gray.shape
    template_height, template_width = template.shape
    radius = max(template_height, template_width) * 2 + 10
    x0, y0 = max(0, int(center[0] - radius)), max(0, int(center[1] - radius))
    x1, y1 = min(width, int(center[0] + radius) + template_width), min(height, int(center[1] + radius) + template_height)
    region = gray[y0:y1, x0:x1]
    if region.shape[0] < template_height or region.shape[1] < template_width:
        return None
    scores = cv2.matchTemplate(region, template, cv2.TM_CCOEFF_NORMED)
    _, best_score, _, location = cv2.minMaxLoc(scores)
    if best_score < TRACK_MATCH_THRESHOLD:
        return None
    left, top = x0 + location[0], y0 + location[1]
    return [float(left), float(top), float(left + template_width), float(top + template_height)]


def _apply_match(boxes, box, label, track_id, frame):
    candidates = [item for item in boxes if item.get("source") == "ai" and box_iou(box, item["box"]) >= TRACK_SNAP_IOU]
    if candidates:
        best = max(candidates, key=lambda item: box_iou(box, item["box"]))
        return [dict(item, label=label, track_id=track_id, source="manual") if item["id"] == best["id"] else item for item in boxes]
    return boxes + [{"id": f"auto-{track_id}-{frame}", "box": box, "label": label, "track_id": track_id, "confidence": None, "source": "manual"}]


def _track_direction(reader, frames_by_index, overrides, frame_count, seed_frame, step, label, track_id, template, center):
    linked, gap = [], 0
    frame = seed_frame + step
    while 0 <= frame < frame_count:
        if frame not in frames_by_index:
            break
        boxes = overrides.get(str(frame), frames_by_index[frame])
        if any(item.get("track_id") == track_id for item in boxes):
            break
        box = _match(reader.gray(frame), template, center)
        if box is None:
            gap += 1
            if gap > TRACK_MAX_GAP:
                break
        else:
            gap = 0
            overrides[str(frame)] = _apply_match(boxes, box, label, track_id, frame)
            center = ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)
            linked.append(frame)
        frame += step
    return linked


def propagate_tracks(reader, frames_by_index, overrides, frame_count, seeds):
    """Beri ID lintasan pada kotak manual lalu cari objek yang sama ke depan dan ke belakang (pencocokan tampilan)."""
    summary = []
    for seed in seeds:
        base = overrides.get(str(seed.frame))
        seed_box = next((box for box in base or [] if box["id"] == seed.box_id), None)
        if seed_box is None or seed_box["source"] != "manual":
            raise ValueError("Kotak baru untuk pelacakan tidak ditemukan pada frame tersebut.")
        if seed_box.get("track_id") is not None:
            continue
        left, top, right, bottom = [int(round(value)) for value in seed_box["box"]]
        gray = reader.gray(seed.frame)
        template = gray[max(0, top):min(reader.height, bottom), max(0, left):min(reader.width, right)]
        if template.size == 0 or float(np.std(template)) < 3:
            summary.append({"track_id": None, "label": seed_box["label"], "start_frame": seed.frame, "end_frame": seed.frame, "linked_frames": 0})
            continue
        values = [item.get("track_id") or 0 for boxes in list(frames_by_index.values()) + list(overrides.values()) for item in boxes]
        track_id = max(values, default=0) + 1
        overrides[str(seed.frame)] = [dict(item, track_id=track_id) if item["id"] == seed.box_id else item for item in base]
        center = ((left + right) / 2, (top + bottom) / 2)
        label = seed_box["label"]
        backward = _track_direction(reader, frames_by_index, overrides, frame_count, seed.frame, -1, label, track_id, template, center)
        forward = _track_direction(reader, frames_by_index, overrides, frame_count, seed.frame, 1, label, track_id, template, center)
        frames = backward + forward
        summary.append({
            "track_id": track_id, "label": label,
            "start_frame": min(frames, default=seed.frame), "end_frame": max(frames, default=seed.frame),
            "linked_frames": len(frames),
        })
    return summary


def _delete_direction(reader, frames_by_index, overrides, frame_count, seed_frame, step, template, center):
    """Mengikuti objek yang dihapus ke satu arah dan membuang kotak yang menutupinya. Aturan pencocokan dan jeda sama dengan pelacakan kotak baru."""
    removed, gap = [], 0
    frame = seed_frame + step
    while 0 <= frame < frame_count:
        if frame not in frames_by_index:
            break
        box = _match(reader.gray(frame), template, center)
        if box is None:
            gap += 1
            if gap > TRACK_MAX_GAP:
                break
        else:
            gap = 0
            boxes = overrides.get(str(frame), frames_by_index[frame])
            candidates = [item for item in boxes if box_iou(box, item["box"]) >= TRACK_SNAP_IOU]
            if candidates:
                best = max(candidates, key=lambda item: box_iou(box, item["box"]))
                overrides[str(frame)] = [item for item in boxes if item["id"] != best["id"]]
                removed.append(frame)
            center = ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)
        frame += step
    return removed


def propagate_deletions(reader, frames_by_index, overrides, frame_count, seeds):
    """Hapus kotak yang sama di frame sebelum dan sesudah frame tempat analis menghapusnya (pencocokan tampilan)."""
    summary = []
    for seed in seeds:
        if seed.frame >= frame_count or seed.frame not in frames_by_index:
            raise ValueError("Nomor frame untuk penghapusan tidak valid.")
        left, top, right, bottom = [int(round(value)) for value in seed.box]
        gray = reader.gray(seed.frame)
        template = gray[max(0, top):min(reader.height, bottom), max(0, left):min(reader.width, right)]
        if template.size == 0 or float(np.std(template)) < 3:
            summary.append({"kind": "delete", "label": seed.label, "tracked": False, "start_frame": seed.frame, "end_frame": seed.frame, "linked_frames": 0})
            continue
        center = ((left + right) / 2, (top + bottom) / 2)
        backward = _delete_direction(reader, frames_by_index, overrides, frame_count, seed.frame, -1, template, center)
        forward = _delete_direction(reader, frames_by_index, overrides, frame_count, seed.frame, 1, template, center)
        frames = backward + forward
        summary.append({
            "kind": "delete", "label": seed.label, "tracked": True,
            "start_frame": min(frames, default=seed.frame), "end_frame": max(frames, default=seed.frame),
            "linked_frames": len(frames),
        })
    return summary


def validate_frames(request, width, height, frame_count, is_image):
    for seed in request.deletions:
        left, top, right, bottom = seed.box
        if seed.frame >= frame_count or not (0 <= left < right <= width and 0 <= top < bottom <= height):
            raise ValueError("Penghapusan harus menunjuk frame dan kotak yang valid.")
    frame_ids = set()
    for frame in request.frames:
        if frame.frame >= frame_count or frame.frame in frame_ids:
            raise ValueError("Nomor frame tidak valid atau berulang.")
        frame_ids.add(frame.frame)
        box_ids, track_ids = set(), set()
        for detection in frame.boxes:
            left, top, right, bottom = detection.box
            if not (0 <= left < right <= width and 0 <= top < bottom <= height):
                raise ValueError("Kotak harus berada dalam gambar dan memiliki luas positif.")
            if detection.id in box_ids:
                raise ValueError("ID kotak tidak boleh berulang dalam satu frame.")
            box_ids.add(detection.id)
            if is_image and detection.track_id is not None:
                raise ValueError("Citra tunggal tidak memiliki ID lintasan.")
            if detection.label == "sperm" and detection.track_id is not None:
                if detection.track_id in track_ids:
                    raise ValueError("Satu ID lintasan hanya boleh digunakan satu objek per frame.")
                track_ids.add(detection.track_id)
    if not request.reason.strip():
        raise ValueError("Alasan koreksi wajib diisi.")


def read_frames(path, overrides=None):
    overrides = overrides or {}
    with open(path, encoding="utf-8") as stream:
        for line in stream:
            original = json.loads(line)
            yield original["frame"], overrides.get(str(original["frame"]), original["boxes"])


def calculate_result(original, frames, settings, is_image):
    result = copy.deepcopy(original)
    calibration = CalibrationSettings.model_validate(settings)
    snapshot = result["calibration"]
    counts, trajectories = [], defaultdict(list)
    for frame_index, boxes in frames:
        included = [box for box in boxes if box["label"] == "sperm"]
        counts.append(len(included))
        for detection in included:
            if detection["track_id"] is not None:
                left, top, right, bottom = detection["box"]
                center = detection.get("center", ((left + right) / 2, (top + bottom) / 2))
                trajectories[detection["track_id"]].append((center[0], center[1], frame_index))
    if not counts:
        raise ValueError("Data frame tidak tersedia.")
    canonical_count = counts[0] if is_image else float(np.median(counts))
    result["summary"]["total_sperm"] = canonical_count
    result["summary"]["estimated_concentration"] = calibration.concentration(canonical_count, snapshot["frame_width"], snapshot["frame_height"])
    if is_image:
        result["summary"]["motility_available"] = False
        return result, {}
    valid, quality = select_motion_trajectories(trajectories)
    engine = MotionAnalyzer(fps=snapshot["fps"], um_per_pixel=calibration.pixel_scale)
    stats = engine.analyze_all(valid)
    classifier = MotilityClassifier(
        prog_speed_threshold=calibration.prog_speed_threshold,
        prog_linearity_threshold=calibration.prog_linearity_threshold,
        immotile_speed_threshold=calibration.immotile_speed_threshold,
    )
    classifications = classifier.classify_all(stats)
    summary = classifier.get_summary_statistics(classifications)
    result["summary"].update(summary)
    result["summary"].update({
        "total_sperm": canonical_count,
        "total_tracks": len(valid),
        "motility_denominator": len(classifications),
        "motility_available": bool(valid),
        "classification_counts": {category: sum(value == category for value in classifications.values()) for category in ("Progressive", "Non-progressive", "Immotile")},
    })
    tracked = sum(len(points) for points in trajectories.values())
    observed = sum(counts)
    quality.update({
        "frames_analyzed": len(counts),
        "detection_observations": observed,
        "tracked_observations": tracked,
        "tracking_assignment_percent": 100 * tracked / observed if observed else None,
        "minimum_detections_per_frame": min(counts),
        "maximum_detections_per_frame": max(counts),
    })
    result["quality"] = quality
    result["motion"] = engine.get_aggregate_statistics(stats)
    result["sperm_details"] = [{"id": track_id, "motion_stats": values, "classification": classifications[track_id]} for track_id, values in stats.items()]
    return result, valid


def draw_boxes(image, boxes):
    for detection in boxes:
        left, top, right, bottom = [round(value) for value in detection["box"]]
        color = (0, 175, 160) if detection["label"] == "sperm" else (70, 70, 230)
        label = detection["label"]
        if detection["track_id"] is not None:
            label += f" #{detection['track_id']}"
        cv2.rectangle(image, (left, top), (right, bottom), color, 1)
        cv2.putText(image, label, (left, max(12, top - 3)), cv2.FONT_HERSHEY_SIMPLEX, 0.35, color, 1)
    return image


def render_revision(session, overrides, output_base):
    started = time.monotonic()
    result, trajectories = calculate_result(session["original"], read_frames(session["annotations"], overrides), session["settings"], session["is_image"])
    width, height = session["width"], session["height"]
    media_path = str(output_base) + (".jpg" if session["is_image"] else ".webm")
    heatmap_path = None
    if session["is_image"]:
        image = cv2.imread(session["source"])
        if image is None:
            raise ValueError("Citra sumber tidak dapat dibuka.")
        _, boxes = next(read_frames(session["annotations"], overrides))
        if not cv2.imwrite(media_path, draw_boxes(image, boxes)):
            raise ValueError("Citra hasil koreksi tidak dapat disimpan.")
    else:
        capture = cv2.VideoCapture(session["source"])
        writer = cv2.VideoWriter(media_path, cv2.VideoWriter_fourcc(*"vp80"), session["original"]["calibration"]["fps"], (width, height))
        try:
            if not capture.isOpened() or not writer.isOpened():
                raise ValueError("Sumber video atau encoder koreksi tidak tersedia.")
            for _, boxes in read_frames(session["annotations"], overrides):
                success, image = capture.read()
                if not success or image.shape[:2] != (height, width):
                    raise ValueError("Frame video sumber tidak cocok dengan hasil analisis.")
                writer.write(draw_boxes(image, boxes))
        finally:
            capture.release()
            writer.release()
        heatmap_path = str(output_base) + "_heatmap.jpg"
        heatmap = np.zeros((height, width, 3), dtype=np.uint8)
        for points in trajectories.values():
            coordinates = np.array([[round(point[0]), round(point[1])] for point in points], np.int32)
            cv2.polylines(heatmap, [coordinates.reshape((-1, 1, 2))], False, (0, 255, 255), 2)
        if not cv2.imwrite(heatmap_path, heatmap):
            raise ValueError("Heatmap koreksi tidak dapat disimpan.")
    result["summary"]["correction_duration"] = time.monotonic() - started
    return result, media_path, heatmap_path
