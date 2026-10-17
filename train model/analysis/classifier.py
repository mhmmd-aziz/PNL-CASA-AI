"""
Motility Classification Rule Engine for CASA-AI.
Classifies sperm motility based on motion metrics.
Uses a strict rule engine, no deep learning.
"""

from typing import Dict, Any

class MotilityClassifier:
    def __init__(
        self,
        prog_speed_threshold: float = 25.0, # µm/s (or pixels/s if uncalibrated)
        prog_linearity_threshold: float = 0.8,
        immotile_speed_threshold: float = 5.0,
    ):
        """
        Initialize the rule engine with configurable thresholds.
        
        Args:
            prog_speed_threshold: Minimum average speed to be considered Progressive.
            prog_linearity_threshold: Minimum linearity (0 to 1) to be considered Progressive.
            immotile_speed_threshold: Maximum average speed to be considered Immotile.
        """
        self.prog_speed_threshold = prog_speed_threshold
        self.prog_linearity_threshold = prog_linearity_threshold
        self.immotile_speed_threshold = immotile_speed_threshold

    def classify_sperm(self, motion_stats: Dict[str, float]) -> str:
        """
        Classify a single sperm based on its motion statistics.
        Returns: 'Progressive', 'Non-progressive', or 'Immotile'
        """
        # If tracking was too short to determine speed, default to Immotile
        if motion_stats.get("movement_duration", 0) <= 0:
            return "Immotile"
            
        speed = motion_stats.get("average_speed", 0.0)
        linearity = motion_stats.get("linearity", 0.0)
        
        # Rule 1: Immotile
        # If it barely moves, it's immotile.
        if speed < self.immotile_speed_threshold:
            return "Immotile"
            
        # Rule 2: Progressive
        # If it moves fast enough AND moves in a relatively straight line
        if speed >= self.prog_speed_threshold and linearity >= self.prog_linearity_threshold:
            return "Progressive"
            
        # Rule 3: Non-progressive
        # It moves (speed >= immotile threshold) but doesn't meet BOTH progressive criteria.
        # Examples: Fast but swimming in tight circles (low linearity), 
        # or twitching in place.
        return "Non-progressive"

    def classify_all(self, all_motion_stats: Dict[int, Dict[str, float]]) -> Dict[int, str]:
        """
        Classify all tracked sperm.
        Returns { track_id: 'Classification' }
        """
        classifications = {}
        for track_id, stats in all_motion_stats.items():
            classifications[track_id] = self.classify_sperm(stats)
        return classifications
        
    def get_summary_statistics(self, classifications: Dict[int, str]) -> Dict[str, Any]:
        """
        Calculate overall WHO standard statistics based on classifications.
        """
        total = len(classifications)
        if total == 0:
            return {
                "total_sperm": 0,
                "progressive_percent": 0.0,
                "non_progressive_percent": 0.0,
                "immotile_percent": 0.0,
            }
            
        counts = {
            "Progressive": 0,
            "Non-progressive": 0,
            "Immotile": 0
        }
        
        for cls in classifications.values():
            if cls in counts:
                counts[cls] += 1
                
        return {
            "total_sperm": total,
            "progressive_percent": (counts["Progressive"] / total) * 100.0,
            "non_progressive_percent": (counts["Non-progressive"] / total) * 100.0,
            "immotile_percent": (counts["Immotile"] / total) * 100.0,
        }
