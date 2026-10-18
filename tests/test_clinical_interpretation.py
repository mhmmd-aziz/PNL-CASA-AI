import json
import math
import os
import sys
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import clinical_interpretation as ci


def detail(volume=2.5, ph=7.8, concentration=40.0, pr=35.0, np_=10.0):
    return {
        "macroscopic": {"volume_ml": volume, "ph_value": ph},
        "analysis": {
            "pr_percentage": pr,
            "np_percentage": np_,
            "summary": {"estimated_concentration": concentration},
            "quality": {},
            "manual_correction": None,
        },
    }


def status_of(findings, key):
    return next(item for item in findings["findings"] if item["key"] == key)


class WhoFindingsValidationTests(unittest.TestCase):
    def test_valid_values_are_classified(self):
        findings = ci.who_findings(detail())
        self.assertEqual(status_of(findings, "volume_ml")["status"], "within")
        self.assertEqual(status_of(findings, "concentration_million_ml")["status"], "within")
        self.assertEqual(status_of(findings, "total_motility_percent")["value"], 45.0)
        self.assertEqual(status_of(findings, "total_number_million")["value"], 100.0)

    def test_nan_and_infinity_become_unavailable(self):
        for bad in (math.nan, math.inf, -math.inf):
            with self.subTest(value=bad):
                findings = ci.who_findings(detail(concentration=bad, volume=bad))
                self.assertEqual(status_of(findings, "concentration_million_ml")["status"], "unavailable")
                self.assertEqual(status_of(findings, "volume_ml")["status"], "unavailable")
                self.assertEqual(status_of(findings, "total_number_million")["status"], "unavailable")

    def test_out_of_domain_values_are_not_classified(self):
        findings = ci.who_findings(detail(volume=0, ph=15.0, concentration=-1.0, pr=120.0))
        self.assertEqual(status_of(findings, "volume_ml")["status"], "unavailable")
        self.assertEqual(status_of(findings, "ph")["status"], "unavailable")
        self.assertEqual(status_of(findings, "concentration_million_ml")["status"], "unavailable")
        self.assertEqual(status_of(findings, "progressive_motility_percent")["status"], "unavailable")

    def test_boolean_is_not_a_number(self):
        findings = ci.who_findings(detail(ph=True))
        self.assertEqual(status_of(findings, "ph")["status"], "unavailable")

    def test_below_reference_is_flagged(self):
        findings = ci.who_findings(detail(concentration=5.0))
        self.assertEqual(status_of(findings, "concentration_million_ml")["status"], "below")


class ContextNotesTests(unittest.TestCase):
    def sample(self, **overrides):
        base = detail()
        base["abstinence_duration_hours"] = 72
        base["macroscopic"].update({"liquefaction_time_min": 30, "viscosity": "NORMAL"})
        base["analysis"]["quality"] = {"frames_analyzed": 120, "tracking_assignment_percent": 95}
        base.update(overrides)
        return base

    def categories(self, findings):
        return [note["text"] for note in findings["context_notes"]]

    def test_normal_pre_analytic_values_produce_no_notes(self):
        self.assertEqual(ci.who_findings(self.sample())["context_notes"], [])

    def test_abstinence_outside_range_is_noted_with_source(self):
        notes = ci.who_findings(self.sample(abstinence_duration_hours=24))["context_notes"]
        self.assertEqual(notes[0]["category"], "pra-analitik")
        self.assertEqual(notes[0]["source"], ci.SOURCE_WHO_6TH)
        self.assertIn("24 jam", notes[0]["text"])

    def test_missing_abstinence_and_liquefaction_are_noted(self):
        data = self.sample()
        data.pop("abstinence_duration_hours")
        data["macroscopic"]["liquefaction_time_min"] = None
        texts = self.categories(ci.who_findings(data))
        self.assertIn("Lama pantang belum tercatat.", texts)
        self.assertIn("Waktu likuefaksi belum tercatat.", texts)

    def test_long_liquefaction_and_increased_viscosity_are_noted(self):
        data = self.sample()
        data["macroscopic"].update({"liquefaction_time_min": 90, "viscosity": "INCREASED"})
        texts = self.categories(ci.who_findings(data))
        self.assertTrue(any("Likuefaksi 90 menit" in text for text in texts))
        self.assertIn("Viskositas tercatat meningkat.", texts)

    def test_image_media_without_motility_is_noted_as_internal(self):
        data = self.sample()
        data["analysis"]["summary"] = {"motility_available": False}
        notes = ci.who_findings(data)["context_notes"]
        motility = [note for note in notes if "motilitas tidak dapat dinilai" in note["text"]]
        self.assertEqual(len(motility), 1)
        self.assertEqual(motility[0]["source"], ci.SOURCE_INTERNAL)

    def test_short_analysis_is_noted(self):
        data = self.sample()
        data["analysis"]["quality"] = {"frames_analyzed": 5}
        self.assertTrue(any("Durasi analisis pendek" in text for text in self.categories(ci.who_findings(data))))

    def test_clinical_history_note_is_always_for_the_reviewer_not_the_patient(self):
        findings = ci.who_findings(self.sample())
        self.assertTrue(any("kondisi klinis pasien" in note for note in findings["review_notes"]))
        self.assertFalse(any("kondisi klinis pasien" in rec for rec in findings["recommendations"]))

    def test_media_review_note_only_when_media_exists(self):
        without = ci.who_findings(self.sample())["review_notes"]
        data = self.sample()
        data["analysis"]["video_url"] = "https://example.invalid/video"
        with_media = ci.who_findings(data)["review_notes"]
        self.assertFalse(any("video anotasi" in note for note in without))
        self.assertTrue(any("video anotasi" in note for note in with_media))

    def test_technical_notes_go_to_reviewers_only(self):
        data = self.sample()
        data["analysis"].update({"video_url": "https://example.invalid/video", "manual_correction": {"changed_frames": [1]}})
        data["analysis"]["quality"] = {"frames_analyzed": 120, "tracking_assignment_percent": 60}
        findings = ci.who_findings(data)
        notes = " ".join(findings["review_notes"])
        for expected in ("kalibrasi", "tracking", "koreksi manual", "video anotasi"):
            self.assertIn(expected, notes)

    def test_ai_payload_includes_context_notes_with_sources(self):
        findings = ci.who_findings(self.sample(abstinence_duration_hours=24))
        payload = ci._ai_payload(findings)
        self.assertIn("Catatan pra-analitik", payload)
        self.assertIn(ci.SOURCE_WHO_6TH, payload)
        self.assertIn("lama pantang 24 jam", payload)

    def test_ai_payload_marks_missing_raw_values_as_not_recorded(self):
        data = self.sample()
        data.pop("abstinence_duration_hours")
        payload = ci._ai_payload(ci.who_findings(data))
        self.assertIn("lama pantang tidak tercatat", payload)


class PatientRecommendationTests(unittest.TestCase):
    """Rekomendasi pada laporan dibaca pasien: saran praktis sesuai temuan, bukan catatan teknis untuk peninjau."""

    DOCTOR_TERMS = ("kalibrasi", "tracking", "heatmap", "anotasi", "koreksi manual", "analis", "id lintasan", "sistem ini", "frame")
    FORBIDDEN = ("mandul", "infertil", "dosis", "resep", "tablet", "kapsul", "vitamin", "zinc", "klomifen", "hormon tambahan")

    def recs(self, hours=72, **overrides):
        data = detail(**overrides)
        data["abstinence_duration_hours"] = hours
        return ci.who_findings(data)["recommendations"]

    def text(self, recs):
        return " ".join(recs)

    def test_low_concentration_gets_lifestyle_advice_retest_and_consultation(self):
        text = self.text(self.recs(concentration=5.0))
        self.assertIn("Jumlah sperma di bawah batas acuan", text)
        for expected in ("merokok", "alkohol", "panas berlebih", "berat badan", "pemeriksaan ulang", "3 bulan", "urologi atau andrologi"):
            self.assertIn(expected, text)
        self.assertNotIn("Gerak sperma di bawah batas acuan", text)
        self.assertNotIn("Volume sampel di bawah batas acuan", text)

    def test_low_motility_is_called_out_separately(self):
        text = self.text(self.recs(pr=10.0, np_=10.0))
        self.assertIn("Gerak sperma di bawah batas acuan", text)
        self.assertIn("kencing manis", text)
        self.assertNotIn("Jumlah sperma di bawah batas acuan", text)
        self.assertIn("pemeriksaan ulang", text)

    def test_low_volume_explains_collection(self):
        text = self.text(self.recs(volume=1.0))
        self.assertIn("Volume sampel di bawah batas acuan", text)
        self.assertIn("tertampung ke wadah", text)

    def test_all_within_reference_keeps_advice_short_and_reassuring(self):
        recs = self.recs()
        text = self.text(recs)
        self.assertIn("dalam rentang batas acuan", text)
        self.assertIn("12 bulan", text)
        self.assertNotIn("pemeriksaan ulang", text)
        self.assertNotIn("urologi", text)
        self.assertLessEqual(len(recs), 5)

    def test_short_abstinence_adds_collection_instruction(self):
        self.assertIn("di luar 2–7 hari", self.text(self.recs(hours=24)))
        self.assertNotIn("di luar 2–7 hari", self.text(self.recs(hours=72)))

    def test_unavailable_results_get_only_generic_lines(self):
        recs = self.recs(volume=None, concentration=None, pr=None, np_=None)
        self.assertEqual(len(recs), 2)
        self.assertIn("bersifat umum", recs[0])
        self.assertIn("bukan diagnosis", recs[-1])

    def test_every_variant_ends_with_the_physician_decides_statement(self):
        for kwargs in ({}, {"concentration": 5.0}, {"pr": 5.0, "np_": 5.0, "volume": 1.0}, {"volume": None, "concentration": None}):
            with self.subTest(kwargs=kwargs):
                self.assertIn("bukan diagnosis", self.recs(**kwargs)[-1])
                self.assertIn("dokter", self.recs(**kwargs)[-1])

    def test_patient_text_has_no_technical_terms_prescriptions_or_verdicts(self):
        scenarios = [{}, {"concentration": 5.0}, {"pr": 5.0, "np_": 5.0}, {"volume": 1.0}, {"concentration": 5.0, "pr": 5.0, "np_": 5.0, "volume": 1.0}]
        for kwargs in scenarios:
            for hours in (24, 72):
                text = self.text(self.recs(hours=hours, **kwargs)).lower()
                for term in self.DOCTOR_TERMS + self.FORBIDDEN:
                    self.assertNotIn(term, text, f"{term!r} muncul pada {kwargs} hours={hours}")

    def test_worst_case_fits_the_report_recommendation_field(self):
        recs = self.recs(hours=24, concentration=5.0, pr=5.0, np_=5.0, volume=1.0)
        numbered = "\n".join(f"{index}. {item}" for index, item in enumerate(recs, 1))
        self.assertLessEqual(len(numbered), 1800)
        self.assertEqual(len(recs), len(set(recs)))

    def test_ai_prompt_asks_for_patient_advice_without_technical_notes(self):
        prompt = ci.SYSTEM_PROMPT
        self.assertIn("saran praktis untuk pasien", prompt)
        self.assertIn("tidak boleh masuk ke bagian ini", prompt)
        self.assertIn("Jangan menyebut obat, suplemen, dosis, atau terapi", prompt)



class SystemPromptTests(unittest.TestCase):
    def test_prompt_forbids_invented_sources_and_specialist_persona(self):
        prompt = ci.SYSTEM_PROMPT
        self.assertIn("Jangan mengarang sumber", prompt)
        self.assertIn("Jangan menyatakan diri sebagai dokter atau spesialis", prompt)
        self.assertIn("SUMBER ACUAN:", prompt)
        self.assertIn("Nyatakan dengan tegas dan lugas", prompt)
        self.assertNotIn("dokter spesialis", prompt.replace("Jangan menyatakan diri sebagai dokter atau spesialis", ""))
        self.assertIn("maksimal 1500 karakter", prompt)


class AiConfiguredTests(unittest.TestCase):
    def test_reports_configured_only_when_key_is_set(self):
        with patch.dict(os.environ, {"WAY_API_KEY": ""}):
            self.assertFalse(ci.ai_configured())
        with patch.dict(os.environ, {"WAY_API_KEY": "test-key"}):
            self.assertTrue(ci.ai_configured())


class PatientSummaryAndHeatmapTests(unittest.TestCase):
    def _respond(self, content, captured):
        response = MagicMock()
        response.read.return_value = json.dumps({"choices": [{"message": {"content": content}}]}).encode("utf-8")
        response.__enter__.return_value = response

        def fake_urlopen(request, timeout=None):
            captured.append(json.loads(request.data.decode("utf-8")))
            return response
        return patch("clinical_interpretation.urllib.request.urlopen", side_effect=fake_urlopen)

    def test_patient_summary_is_split_from_interpretation(self):
        content = (
            "INTERPRETASI:\nKonsentrasi rendah.\nSUMBER ACUAN: who\n"
            "KESIMPULAN PASIEN:\nHasil menunjukkan jumlah sperma di bawah acuan. Dokter akan menjelaskan lebih lanjut.\n"
            "REKOMENDASI:\n1. Periksa ulang."
        )
        with patch.dict(os.environ, {"WAY_API_KEY": "test-key"}), self._respond(content, []):
            draft = ci.generate_ai_draft(ci.who_findings(detail()))
        self.assertNotIn("KESIMPULAN", draft["interpretation"])
        self.assertEqual(draft["patient_summary"], "Hasil menunjukkan jumlah sperma di bawah acuan. Dokter akan menjelaskan lebih lanjut.")
        self.assertEqual(draft["recommendations"], "1. Periksa ulang.")

    def test_heatmap_is_sent_as_image_only_when_file_exists(self):
        sent = []
        with patch.dict(os.environ, {"WAY_API_KEY": "test-key"}), self._respond("INTERPRETASI: x", sent):
            ci.generate_ai_draft(ci.who_findings(detail()), heatmap_file="tidak_ada_123.jpg")
        self.assertIsInstance(sent[-1]["messages"][1]["content"], str)

    def test_heatmap_loader_rejects_path_traversal_and_missing_files(self):
        self.assertIsNone(ci.load_heatmap_data_url("../../main.py"))
        self.assertIsNone(ci.load_heatmap_data_url("tidak_ada_123.jpg"))
        self.assertIsNone(ci.load_heatmap_data_url(None))

    def test_heatmap_loader_returns_data_url_for_real_output(self):
        real = next(ci.OUTPUT_DIR.glob("*_heatmap.jpg"), None)
        if real is None:
            self.skipTest("tidak ada heatmap di folder output")
        data_url = ci.load_heatmap_data_url(real.name)
        self.assertTrue(data_url.startswith("data:image/jpeg;base64,"))


class PlainTextTests(unittest.TestCase):
    def test_markdown_markers_are_removed(self):
        raw = "**SUMBER ACUAN:** who-lab\n## Judul\n- *miring* dan `kode` __tebal__"
        self.assertEqual(ci._plain_text(raw), "SUMBER ACUAN: who-lab\nJudul\n- miring dan kode tebal")

    def test_generated_draft_has_no_asterisks(self):
        findings = ci.who_findings(detail())
        content = "INTERPRETASI:\n**Konsentrasi** rendah.\n**SUMBER ACUAN:** who\nREKOMENDASI:\n1. **Ulangi** pemeriksaan."
        response = MagicMock()
        response.read.return_value = json.dumps({"choices": [{"message": {"content": content}}]}).encode("utf-8")
        response.__enter__.return_value = response
        with patch.dict(os.environ, {"WAY_API_KEY": "test-key"}), \
                patch("clinical_interpretation.urllib.request.urlopen", return_value=response):
            draft = ci.generate_ai_draft(findings)
        self.assertNotIn("*", draft["interpretation"] + (draft["recommendations"] or ""))
        self.assertIn("SUMBER ACUAN: who", draft["interpretation"])
        self.assertEqual(draft["recommendations"], "1. Ulangi pemeriksaan.")


class AiDraftResponseTests(unittest.TestCase):
    def setUp(self):
        self.findings = ci.who_findings(detail())
        self.env = patch.dict(os.environ, {"WAY_API_KEY": "test-key"})
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def _respond(self, body):
        response = MagicMock()
        response.read.return_value = body if isinstance(body, bytes) else json.dumps(body).encode("utf-8")
        response.__enter__.return_value = response
        return patch("clinical_interpretation.urllib.request.urlopen", return_value=response)

    def test_missing_key_returns_503_with_who_hint(self):
        with patch.dict(os.environ, {"WAY_API_KEY": ""}):
            with self.assertRaises(HTTPException) as ctx:
                ci.generate_ai_draft(self.findings)
        self.assertEqual(ctx.exception.status_code, 503)
        self.assertIn("Aturan WHO tetap tersedia", ctx.exception.detail)

    def test_valid_response_is_split_into_sections(self):
        content = "INTERPRETASI: Konsentrasi rendah.\nREKOMENDASI: Ulangi pemeriksaan."
        with self._respond({"model": "m", "choices": [{"message": {"content": content}}]}):
            draft = ci.generate_ai_draft(self.findings)
        self.assertEqual(draft["interpretation"], "Konsentrasi rendah.")
        self.assertEqual(draft["recommendations"], "Ulangi pemeriksaan.")
        self.assertEqual(draft["source"], "ai_draft")

    def test_malformed_shapes_return_503_not_500(self):
        malformed = [
            [],
            "text",
            {"choices": "none"},
            {"choices": [None]},
            {"choices": [{"message": "x"}]},
            {"choices": [{"message": {"content": 42}}]},
        ]
        for body in malformed:
            with self.subTest(body=body):
                with self._respond(body):
                    with self.assertRaises(HTTPException) as ctx:
                        ci.generate_ai_draft(self.findings)
                self.assertEqual(ctx.exception.status_code, 503)

    def test_connection_error_returns_503(self):
        with patch("clinical_interpretation.urllib.request.urlopen", side_effect=ConnectionResetError()):
            with self.assertRaises(HTTPException) as ctx:
                ci.generate_ai_draft(self.findings)
        self.assertEqual(ctx.exception.status_code, 503)

    def test_http_error_returns_503(self):
        error = urllib.error.HTTPError("url", 401, "unauthorized", {}, None)
        error.read = lambda: b"denied"
        with patch("clinical_interpretation.urllib.request.urlopen", side_effect=error):
            with self.assertRaises(HTTPException) as ctx:
                ci.generate_ai_draft(self.findings)
        self.assertEqual(ctx.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
