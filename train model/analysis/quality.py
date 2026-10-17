"""Explicit observation requirements for trajectory-based motion estimates."""

MIN_TRACK_OBSERVATIONS = 15


def select_motion_trajectories(trajectories, minimum=MIN_TRACK_OBSERVATIONS):
    """Use one longest contiguous segment per ID, never bridge missing frames.

    Tracking IDs are not guaranteed unique biological cells. Keeping one segment
    per ID prevents counting its separate segments as additional motility votes.
    """
    selected = {}
    tracks_with_gaps = 0
    discarded_observations = 0
    for track_id, trajectory in trajectories.items():
        segments = []
        segment = []
        for point in trajectory:
            if segment and point[2] - segment[-1][2] != 1:
                segments.append(segment)
                segment = []
            segment.append(point)
        if segment:
            segments.append(segment)
        tracks_with_gaps += int(len(segments) > 1)
        longest = max(segments, key=len, default=[])
        if len(longest) >= minimum:
            selected[track_id] = longest
            discarded_observations += len(trajectory) - len(longest)
        else:
            discarded_observations += len(trajectory)
    return selected, {
        "total_track_ids": len(trajectories),
        "valid_track_ids": len(selected),
        "excluded_track_ids": len(trajectories) - len(selected),
        "tracks_with_gaps": tracks_with_gaps,
        "discarded_track_observations": discarded_observations,
        "minimum_track_observations": minimum,
        "segment_policy": "longest_contiguous_segment_per_track_id",
    }
