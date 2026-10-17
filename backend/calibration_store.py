import json
from pathlib import Path
from tempfile import NamedTemporaryFile

from analysis.calibration import CalibrationSettings


CALIBRATION_PATH = Path(__file__).resolve().parent / "data" / "calibration.json"


def load_calibration():
    if not CALIBRATION_PATH.exists():
        return CalibrationSettings()
    return CalibrationSettings.model_validate_json(CALIBRATION_PATH.read_text(encoding="utf-8"))


def save_calibration(settings: CalibrationSettings):
    CALIBRATION_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = None
    try:
        with NamedTemporaryFile(mode="w", encoding="utf-8", dir=CALIBRATION_PATH.parent, delete=False) as temporary_file:
            temporary_path = Path(temporary_file.name)
            json.dump(settings.model_dump(), temporary_file, indent=2, allow_nan=False)
        temporary_path.replace(CALIBRATION_PATH)
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()
    return settings
