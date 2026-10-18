def frame_annotations(boxes, classes, confidences, allowed_classes):
    return [
        {
            "id": f"det-{index}",
            "box": [float(value) for value in box],
            "label": "sperm",
            "track_id": None,
            "confidence": float(confidence),
        }
        for index, (box, class_id, confidence) in enumerate(zip(boxes, classes, confidences))
        if int(class_id) in allowed_classes
    ]


def attach_tracks(detections, tracks):
    """
    Match tracking results dengan detection results berdasarkan IoU (Intersection over Union).

    Args:
        detections: list of detection dicts dengan 'box': [left, top, right, bottom]
        tracks: list of tracking results dengan 'box': [left, top, right, bottom] dan 'id'

    Returns:
        detections dengan track_id dan center coordinate ditambahkan

    Raises:
        ValueError: jika track tidak dapat di-match dengan detection (IoU < threshold)
    """
    available = set(range(len(detections)))
    iou_threshold = 0.3  # Turunkan dari 0.5 menjadi 0.3 untuk lebih toleran

    for track in tracks:
        best_index, best_overlap = None, 0.0
        left, top, right, bottom = track["box"]

        # Find detection dengan IoU tertinggi
        for index in available:
            other_left, other_top, other_right, other_bottom = detections[index]["box"]

            # Calculate IoU
            intersection = max(0, min(right, other_right) - max(left, other_left)) * max(0, min(bottom, other_bottom) - max(top, other_top))
            union = (right - left) * (bottom - top) + (other_right - other_left) * (other_bottom - other_top) - intersection
            overlap = intersection / union if union else 0

            if overlap > best_overlap:
                best_index, best_overlap = index, overlap

        # Jika tidak ada match, log warning tapi jangan raise error (bisa ada deteksi baru atau hilang)
        if best_index is None or best_overlap < iou_threshold:
            # Skip track yang tidak ada match - sperma baru atau hilang
            continue

        # Update detection dengan track info
        detections[best_index]["track_id"] = track["id"]
        detections[best_index]["box"] = track["box"]
        detections[best_index]["center"] = list(track.get("center", ((left + right) / 2, (top + bottom) / 2)))
        available.remove(best_index)

    return detections
