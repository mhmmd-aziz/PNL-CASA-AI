import math
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


CHAMBER_DEPTHS = {"makler": 10.0, "leja": 20.0, "neubauer": 100.0}


class CalibrationSettings(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra="forbid")

    pixel_scale: float = Field(default=0.8, gt=0)
    fps: float = Field(default=30.0, gt=0)
    fps_mode: Literal["auto", "manual"] = "auto"
    chamber_type: Literal["custom", "makler", "leja", "neubauer"] = "custom"
    chamber_depth: float = Field(default=20.0, gt=0)
    dilution_factor: float = Field(default=1.0, ge=1)
    prog_speed_threshold: float = Field(default=25.0, gt=0)
    prog_linearity_threshold: float = Field(default=0.8, ge=0, le=1)
    immotile_speed_threshold: float = Field(default=5.0, ge=0)

    @model_validator(mode="after")
    def validate_relationships(self):
        if self.immotile_speed_threshold > self.prog_speed_threshold:
            raise ValueError("Ambang immotil tidak boleh melebihi ambang progresif.")
        expected_depth = CHAMBER_DEPTHS.get(self.chamber_type)
        if expected_depth is not None and not math.isclose(self.chamber_depth, expected_depth):
            raise ValueError("Kedalaman tidak sesuai preset bilik; pilih bilik custom untuk kedalaman lain.")
        return self

    def concentration(self, count: float, width: int, height: int) -> float:
        if width <= 0 or height <= 0:
            raise ValueError("Dimensi gambar/video harus lebih besar dari nol.")
        volume_ml = width * height * self.pixel_scale ** 2 * self.chamber_depth * 1e-12
        if not math.isfinite(volume_ml) or volume_ml <= 0:
            raise ValueError("Volume kalibrasi berada di luar rentang perhitungan.")
        concentration = count * self.dilution_factor / volume_ml / 1_000_000.0
        if not math.isfinite(concentration):
            raise ValueError("Konsentrasi berada di luar rentang perhitungan.")
        return concentration

    def snapshot(self, width: int, height: int, effective_fps=None, fps_source="not_applicable"):
        return {
            **self.model_dump(),
            "configured_fps": self.fps,
            "fps": effective_fps,
            "fps_source": fps_source,
            "pixel_scale_unit": "um/px",
            "speed_metric": "VCL",
            "linearity_metric": "LIN",
            "frame_width": width,
            "frame_height": height,
        }
