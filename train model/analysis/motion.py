"""
Motion Analysis Engine for CASA-AI.
Calculates physics of sperm movement based on tracked trajectories.
Uses OpenCV and NumPy.
"""

import math
import numpy as np
from typing import List, Dict

class MotionAnalyzer:
    SMOOTHING_PASSES = 2

    @classmethod
    def method_snapshot(cls):
        """Record the reproducible experimental VAP estimator with each result."""
        return {
            "version": "trajectory-v2",
            "vap_method": "time_weighted_neighbor_average",
            "smoothing_passes": cls.SMOOTHING_PASSES,
            "smoothing_endpoints": "fixed",
            "ratio_aggregation": "mean_of_per_track_ratios",
            "zero_denominator_ratios": "null_excluded_from_mean",
        }

    @classmethod
    def smooth_path(cls, pts, frames):
        """Average each point with its time-interpolated neighbours twice.

        Endpoints stay fixed. Each update replaces a point by the midpoint
        between itself and its neighbours' time-linear interpolation. This
        preserves straight constant-speed paths, including irregular sampling.
        VAP is an experimental estimator, not a vendor/WHO-calibrated metric.
        """
        smoothed = pts.copy()
        weights = ((frames[1:-1] - frames[:-2]) / (frames[2:] - frames[:-2]))[:, None]
        for _ in range(cls.SMOOTHING_PASSES):
            neighbours = (1 - weights) * smoothed[:-2] + weights * smoothed[2:]
            smoothed[1:-1] = .5 * smoothed[1:-1] + .5 * neighbours
        return smoothed

    def __init__(self, fps: float = 30.0, um_per_pixel: float = 1.0):
        """
        Args:
            fps (float): Frames per second of the video (for time conversion).
            um_per_pixel (float): Micrometers represented by one pixel.
        """
        if not math.isfinite(fps) or fps <= 0:
            raise ValueError("FPS harus positif dan terbatas.")
        if not math.isfinite(um_per_pixel) or um_per_pixel <= 0:
            raise ValueError("Skala piksel harus positif dan terbatas (um/px).")
        self.fps = fps
        self.um_per_pixel = um_per_pixel

    def analyze_trajectory(self, trajectory: List[tuple]) -> Dict[str, float]:
        """
        Analyzes a single trajectory.
        Trajectory format: [(center_x, center_y, frame_idx), ...]
        
        Returns a dictionary of computed motion parameters.
        """
        if len(trajectory) < 2:
            return {
                "distance": 0.0,
                "speed": 0.0,
                "trajectory_length": 0.0,
                "movement_duration": 0.0,
                "linearity": 0.0,
                "average_speed": 0.0,
                "maximum_speed": 0.0,
                "straight_line_speed": 0.0,
                "average_path_speed": None,
                "straightness": None,
                "wobble": None,
                "observation_count": len(trajectory),
            }
            
        pts = np.array([[pt[0], pt[1]] for pt in trajectory], dtype=float)
        frames = np.array([pt[2] for pt in trajectory], dtype=float)
        if not np.all(np.isfinite(pts)) or not np.all(np.isfinite(frames)):
            raise ValueError("Koordinat dan indeks frame harus berupa angka terbatas.")
        
        # Distance = Euclidean distance between consecutive centroids
        diffs = np.diff(pts, axis=0)
        distances = np.linalg.norm(diffs, axis=1) * self.um_per_pixel
        
        # Frame differences (handling skipped frames in tracking)
        frame_diffs = np.diff(frames)
        if np.any(frame_diffs <= 0):
            raise ValueError("Indeks frame lintasan harus meningkat.")
        time_diffs = frame_diffs / self.fps
        
        # Speed = Distance / Time
        speeds = distances / time_diffs
        
        # Trajectory Length = Accumulated travelled distance
        traj_length = float(np.sum(distances))
        
        # Movement Duration = Number of tracked frames / fps
        move_duration = (frames[-1] - frames[0]) / self.fps
        
        # Straight Distance (Start to End)
        straight_distance = np.linalg.norm(pts[-1] - pts[0]) * self.um_per_pixel
        
        # Linearity = Straight Distance / Trajectory Length
        linearity = straight_distance / traj_length if traj_length > 0 else 0.0
        
        # Aggregated stats
        avg_speed = traj_length / move_duration
        max_speed = float(np.max(speeds)) if len(speeds) > 0 else 0.0
        
        smoothed = self.smooth_path(pts, frames)
        average_path_length = float(np.linalg.norm(np.diff(smoothed, axis=0), axis=1).sum() * self.um_per_pixel)
        average_path_speed = average_path_length / move_duration
        straightness = float(straight_distance / average_path_length) if average_path_length > 0 else None
        wobble = average_path_length / traj_length if traj_length > 0 else None
        
        return {
            "distance": straight_distance, # Net distance
            "trajectory_length": traj_length, # Gross distance
            "movement_duration": move_duration,
            "linearity": linearity,
            "average_speed": avg_speed,
            "maximum_speed": max_speed,
            "straight_line_speed": float(straight_distance / move_duration),
            "average_path_speed": average_path_speed,
            "average_path_length": average_path_length,
            "straightness": straightness,
            "wobble": wobble,
            "observation_count": len(trajectory),
        }

    def analyze_all(self, trajectories: dict) -> dict:
        """
        Analyzes all trajectories.
        Returns { track_id: stats_dict }
        """
        results = {}
        for track_id, traj in trajectories.items():
            results[track_id] = self.analyze_trajectory(traj)
        return results

    def get_aggregate_statistics(self, all_stats: Dict[int, Dict[str, float]]) -> Dict[str, float]:
        """
        Calculate global motion statistics across all tracked sperm.
        """
        if not all_stats:
            return {
                "average_speed": 0.0,
                "maximum_speed": 0.0,
                "average_distance": 0.0,
                "average_track_frames": 0.0,
                "average_straight_line_speed": 0.0,
                "average_linearity": 0.0,
                "average_path_speed": None,
                "average_straightness": None,
                "average_wobble": None,
                "straightness_track_count": 0,
                "wobble_track_count": 0,
            }
            
        speeds = [s.get("average_speed", 0.0) for s in all_stats.values()]
        max_speeds = [s.get("maximum_speed", 0.0) for s in all_stats.values()]
        distances = [s.get("trajectory_length", 0.0) for s in all_stats.values()]
        observations = [s["observation_count"] for s in all_stats.values()]
        path_speeds = [s["average_path_speed"] for s in all_stats.values() if s.get("average_path_speed") is not None]
        straightness = [s["straightness"] for s in all_stats.values() if s.get("straightness") is not None]
        wobble = [s["wobble"] for s in all_stats.values() if s.get("wobble") is not None]
        
        return {
            "average_speed": float(np.mean(speeds)) if speeds else 0.0,
            "maximum_speed": float(np.max(max_speeds)) if max_speeds else 0.0,
            "average_distance": float(np.mean(distances)) if distances else 0.0,
            "average_track_frames": float(np.mean(observations)) if observations else 0.0,
            "average_straight_line_speed": float(np.mean([stats.get("straight_line_speed", 0.0) for stats in all_stats.values()])),
            "average_linearity": float(np.mean([stats.get("linearity", 0.0) for stats in all_stats.values()])),
            "average_path_speed": float(np.mean(path_speeds)) if path_speeds else None,
            "average_straightness": float(np.mean(straightness)) if straightness else None,
            "average_wobble": float(np.mean(wobble)) if wobble else None,
            "straightness_track_count": len(straightness),
            "wobble_track_count": len(wobble),
        }
