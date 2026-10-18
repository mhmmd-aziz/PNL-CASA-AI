import sys
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import examinations_routes as er

FUTURE = datetime(2099, 1, 15, 9, 0, tzinfo=er.WIB)


def booking(patient_id, at=FUTURE, identifier=1):
    return {"id": identifier, "patient_id": patient_id, "at": at}


class SameDayBookingTests(unittest.TestCase):
    def validate(self, bookings, patient_id=7, override=False):
        with patch.object(er, "_load_day_bookings", return_value=bookings):
            return er._validate_schedule(object(), FUTURE, patient_id, override_same_day=override)

    def test_free_day_is_accepted_without_override(self):
        self.assertEqual(self.validate([booking(patient_id=99)]), ("2099-01-15", False))

    def test_same_patient_same_day_is_blocked_without_override(self):
        with self.assertRaises(HTTPException) as ctx:
            self.validate([booking(patient_id=7, at=datetime(2099, 1, 15, 10, 0, tzinfo=er.WIB))])
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["code"], "SAME_DAY_EXAM")

    def test_same_patient_same_day_is_allowed_with_override_and_flagged(self):
        result = self.validate([booking(patient_id=7)], override=True)
        self.assertEqual(result, ("2099-01-15", True))

    def test_override_flag_is_not_set_when_there_is_no_conflict(self):
        self.assertEqual(self.validate([], override=True), ("2099-01-15", False))

    def test_override_reason_must_be_meaningful(self):
        for reason in (None, "", "   ", "pendek"):
            with self.subTest(reason=reason):
                with self.assertRaises(HTTPException) as ctx:
                    er._override_reason(reason)
                self.assertEqual(ctx.exception.status_code, 422)

    def test_override_reason_is_trimmed_and_accepted(self):
        self.assertEqual(er._override_reason("  pasien kembali untuk pemeriksaan ulang  "), "pasien kembali untuk pemeriksaan ulang")


if __name__ == "__main__":
    unittest.main()
