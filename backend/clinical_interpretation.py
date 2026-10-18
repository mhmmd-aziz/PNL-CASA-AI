"""Interpretasi berbasis acuan WHO dan draf rekomendasi AI untuk tinjauan dokter.

Ini bukan diagnosis. Hasil ditandai sebagai estimasi, dan keputusan klinis ada pada dokter penanggung jawab.
"""
import base64
import json
import logging
import math
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

from fastapi import HTTPException

logger = logging.getLogger(__name__)

OUTPUT_DIR = Path(__file__).resolve().parent / "outputs"
MAX_HEATMAP_BYTES = 5_000_000

REFERENCE_VERSION = "who-lab-manual-6ed-2021-lrl-v1"
REFERENCE_NOTE = (
    "Batas bawah acuan (persentil ke-5) WHO laboratory manual edisi ke-6 (2021). "
    "Nilai ini belum diverifikasi oleh ahli domain laboratorium dan hanya sebagai pembanding."
)
PROGRESSIVE_CAVEAT = (
    "PR di sistem memakai ambang prototipe (VCL ≥ 25 µm/s dan LIN ≥ 0.8), bukan definisi progresif WHO. "
    "Bandingkan dengan acuan WHO secara hati-hati."
)

# key: (batas bawah acuan, satuan, label)
WHO_LOWER_LIMITS = {
    "volume_ml": (1.4, "mL", "Volume"),
    "concentration_million_ml": (16.0, "juta/mL", "Konsentrasi"),
    "total_number_million": (39.0, "juta/ejakulat", "Jumlah total"),
    "total_motility_percent": (42.0, "%", "Motilitas total (PR+NP)"),
    "progressive_motility_percent": (30.0, "%", "Motilitas progresif (PR)"),
    "ph": (7.2, "", "pH"),
}


def _number(value, low: float = 0.0, high: Optional[float] = None) -> Optional[float]:
    """Angka valid dalam rentang [low, high]; selain itu None agar ditampilkan sebagai tidak tersedia."""
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
        return None
    number = float(value)
    if number < low or (high is not None and number > high):
        return None
    return number


def _metrics(detail: dict) -> dict:
    macro = detail.get("macroscopic") or {}
    analysis = detail.get("analysis") or {}
    summary = analysis.get("summary") or {}
    pr = _number(analysis.get("pr_percentage"), high=100.0)
    np_ = _number(analysis.get("np_percentage"), high=100.0)
    concentration = _number(summary.get("estimated_concentration"))
    # Volume nol tidak mungkin; batas atas sama dengan validasi input makroskopis.
    volume = _number(macro.get("volume_ml"), high=20.0) or None
    return {
        "volume_ml": volume,
        "concentration_million_ml": concentration,
        "total_number_million": concentration * volume if concentration is not None and volume is not None else None,
        "total_motility_percent": pr + np_ if pr is not None and np_ is not None else None,
        "progressive_motility_percent": pr,
        "ph": _number(macro.get("ph_value"), high=14.0),
    }


SOURCE_WHO_6TH = "WHO laboratory manual edisi ke-6 (2021)"
SOURCE_INTERNAL = "aturan internal prototipe, belum divalidasi"

# Ambang pra-analitik dan mutu. Dikumpulkan di sini agar mudah diubah dan diverifikasi ahli domain.
ABSTINENCE_MIN_HOURS = 48  # 2 hari, sesuai pedoman WHO yang juga dipakai di examinations_routes
ABSTINENCE_MAX_HOURS = 168  # 7 hari
LIQUEFACTION_MAX_MIN = 60  # perlu verifikasi domain terhadap halaman WHO edisi ke-6
MIN_FRAMES_ANALYZED = 30  # ambang internal


def who_findings(detail: dict) -> dict:
    values = _metrics(detail)
    findings = []
    for key, (limit, unit, label) in WHO_LOWER_LIMITS.items():
        value = values[key]
        if value is None:
            status = "unavailable"
        elif value < limit:
            status = "below"
        else:
            status = "within"
        findings.append({
            "key": key,
            "label": label,
            "value": value,
            "unit": unit,
            "reference_lower_limit": limit,
            "status": status,
            "caveat": PROGRESSIVE_CAVEAT if key == "progressive_motility_percent" and value is not None else None,
        })
    analysis = detail.get("analysis") or {}
    quality = analysis.get("quality") or {}
    pattern_notes = _pattern_notes(values)
    context_notes = _context_notes(detail, quality)
    has_media = bool(analysis.get("video_url") or analysis.get("heatmap_url"))
    return {
        "reference_version": REFERENCE_VERSION,
        "reference_note": REFERENCE_NOTE,
        "findings": findings,
        "pattern_notes": pattern_notes,
        "context_notes": context_notes,
        "inputs": {
            "abstinence_duration_hours": detail.get("abstinence_duration_hours"),
            "liquefaction_time_min": (detail.get("macroscopic") or {}).get("liquefaction_time_min"),
            "viscosity": (detail.get("macroscopic") or {}).get("viscosity"),
            "frames_analyzed": quality.get("frames_analyzed"),
            "tracking_assignment_percent": quality.get("tracking_assignment_percent"),
            "has_media": has_media,
        },
        "summary_text": _summary_text(findings, pattern_notes + [note["text"] for note in context_notes]),
        "recommendations": _patient_recommendations(values, detail.get("abstinence_duration_hours")),
        "review_notes": _review_notes(values, quality, analysis.get("manual_correction"), has_media),
        "disclaimer": "Estimasi berbantuan AI untuk pembanding WHO. Bukan diagnosis; wajib ditinjau dokter penanggung jawab.",
    }


def _summary_text(findings: list, pattern_notes: list) -> str:
    sentences = []
    for item in findings:
        if item["status"] == "unavailable":
            sentences.append(f"{item['label']} tidak tersedia.")
            continue
        value = f"{item['value']:.2f} {item['unit']}".strip()
        limit = f"{item['reference_lower_limit']} {item['unit']}".strip()
        relation = "di bawah" if item["status"] == "below" else "dalam rentang"
        sentences.append(f"{item['label']} {value}, {relation} batas bawah acuan WHO ({limit}).")
    sentences.extend(pattern_notes)
    sentences.append("Hasil ini estimasi berbantuan AI dan perlu ditinjau dokter penanggung jawab.")
    return " ".join(sentences)


def _pattern_notes(values: dict) -> list:
    notes = []
    pr, total = values["progressive_motility_percent"], values["total_motility_percent"]
    if pr is not None and total is not None and pr < 30 and total - pr > pr:
        notes.append("Lintasan dominan tidak progresif.")
    if values["concentration_million_ml"] is not None and values["concentration_million_ml"] < 16:
        notes.append("Konsentrasi di bawah batas bawah acuan WHO.")
    return notes


def _context_notes(detail: dict, quality: dict) -> list:
    """Catatan pra-analitik dan mutu. Tiap catatan membawa sumber acuannya."""
    macro = detail.get("macroscopic") or {}
    analysis = detail.get("analysis") or {}
    summary = analysis.get("summary") or {}
    notes = []

    hours = _number(detail.get("abstinence_duration_hours"))
    if hours is None:
        notes.append({"category": "pra-analitik", "text": "Lama pantang belum tercatat.", "source": SOURCE_WHO_6TH})
    elif hours < ABSTINENCE_MIN_HOURS or hours > ABSTINENCE_MAX_HOURS:
        notes.append({"category": "pra-analitik", "text": f"Lama pantang {hours:g} jam di luar rentang 2–7 hari.", "source": SOURCE_WHO_6TH})

    liquefaction = _number(macro.get("liquefaction_time_min"))
    if liquefaction is None:
        notes.append({"category": "pra-analitik", "text": "Waktu likuefaksi belum tercatat.", "source": SOURCE_WHO_6TH})
    elif liquefaction > LIQUEFACTION_MAX_MIN:
        notes.append({"category": "pra-analitik", "text": f"Likuefaksi {liquefaction:g} menit, melewati {LIQUEFACTION_MAX_MIN} menit.", "source": SOURCE_WHO_6TH})

    if macro.get("viscosity") == "INCREASED":
        notes.append({"category": "pra-analitik", "text": "Viskositas tercatat meningkat.", "source": SOURCE_WHO_6TH})

    if analysis and summary.get("motility_available") is False:
        notes.append({"category": "analitik", "text": "Pemeriksaan berbasis gambar: PR, NP, dan IM tidak tersedia, sehingga motilitas tidak dapat dinilai.", "source": SOURCE_INTERNAL})

    frames = _number(quality.get("frames_analyzed"))
    if frames is not None and frames < MIN_FRAMES_ANALYZED:
        notes.append({"category": "mutu", "text": f"Durasi analisis pendek ({frames:g} frame), stabilitas hitung kurang.", "source": SOURCE_INTERNAL})
    return notes


def _below(values: dict, key: str) -> bool:
    return values[key] is not None and values[key] < WHO_LOWER_LIMITS[key][0]


def _patient_recommendations(values: dict, abstinence_hours) -> list:
    """Saran untuk pasien (masuk ke kolom Rekomendasi pada laporan).

    Saran bersifat umum dan disesuaikan dengan parameter yang berada di bawah batas acuan. Bukan diagnosis,
    resep, dosis, atau terapi; dokter menyesuaikannya dengan riwayat pasien sebelum laporan disetujui.
    """
    low_count = _below(values, "concentration_million_ml") or _below(values, "total_number_million")
    low_motility = _below(values, "progressive_motility_percent") or _below(values, "total_motility_percent")
    low_volume = _below(values, "volume_ml")
    any_low = low_count or low_motility or low_volume
    measured = [
        key for key in ("volume_ml", "concentration_million_ml", "total_number_million", "total_motility_percent", "progressive_motility_percent")
        if values[key] is not None
    ]
    hours = _number(abstinence_hours)

    recs = ["Saran ini bersifat umum dan belum disesuaikan dengan riwayat kesehatan Anda; diskusikan dengan dokter."]
    if low_count:
        recs.append("Jumlah sperma di bawah batas acuan. Dokter dapat memeriksa penyebabnya, misalnya infeksi, varikokel (pelebaran pembuluh darah di kantung zakar), atau gangguan hormon.")
    if low_motility:
        recs.append("Gerak sperma di bawah batas acuan. Penyakit yang belum terkontrol (misalnya kencing manis) atau demam tinggi baru-baru ini dapat memengaruhi hasil; sampaikan ke dokter.")
    if low_volume:
        recs.append("Volume sampel di bawah batas acuan. Pastikan seluruh cairan tertampung ke wadah saat pengambilan sampel; sampaikan ke petugas jika ada yang tumpah.")
    if any_low:
        recs.append("Satu pemeriksaan belum cukup untuk menyimpulkan. Disarankan pemeriksaan ulang (WHO menganjurkan dua sampel) dengan pantang 2–7 hari sebelum tiap pengambilan; setelah memperbaiki gaya hidup, umumnya sekitar 3 bulan kemudian. Dokter menentukan waktunya.")
        recs.append("Berhenti merokok dan hindari asap rokok; batasi atau hentikan alkohol.")
        recs.append("Jaga berat badan ideal, olahraga teratur dengan intensitas sedang, tidur cukup, kelola stres, dan makan bergizi seimbang (sayur, buah, kacang-kacangan, ikan).")
        recs.append("Hindari panas berlebih pada area testis (berendam air panas atau sauna lama) dan celana yang terlalu ketat.")
        recs.append("Jangan memakai steroid anabolik, dan jangan menghentikan obat rutin tanpa bertanya ke dokter. Beri tahu dokter semua obat dan suplemen yang Anda pakai.")
        recs.append("Konsultasikan hasil ini ke dokter (urologi atau andrologi) untuk pemeriksaan lanjutan.")
    elif measured:
        recs.append("Parameter yang terukur berada dalam rentang batas acuan. Pertahankan gaya hidup sehat: tidak merokok, batasi alkohol, olahraga teratur, dan makan bergizi seimbang.")
        recs.append("Hasil ini bukan jaminan kesuburan. Jika setelah 12 bulan berusaha kehamilan belum terjadi, konsultasikan ke dokter.")
    if hours is not None and (hours < ABSTINENCE_MIN_HOURS or hours > ABSTINENCE_MAX_HOURS):
        recs.append("Lama pantang pada pemeriksaan ini di luar 2–7 hari sehingga hasil dapat terpengaruh. Pada pengambilan berikutnya, tahan ejakulasi 2–7 hari sebelum sampel diambil.")
    recs.append("Hasil ini estimasi berbantuan AI dan bukan diagnosis; keputusan dan tindak lanjut ditentukan oleh dokter Anda.")
    return recs


def _review_notes(values: dict, quality: dict, manual_correction, has_media: bool = False) -> list:
    """Catatan untuk analis dan dokter peninjau. Tidak ikut ke laporan pasien."""
    notes = ["Saran untuk pasien dibuat otomatis dari angka hasil dan bersifat umum; sesuaikan dengan riwayat pasien sebelum menyetujui."]
    if values["volume_ml"] is None:
        notes.append("Isi data volume sampel agar jumlah total dapat dihitung.")
    if values["progressive_motility_percent"] is not None:
        notes.append("Periksa kalibrasi (skala µm/px, FPS, kedalaman bilik) sebelum menafsirkan PR.")
    tracked = quality.get("tracking_assignment_percent")
    if tracked is not None and tracked < 90:
        notes.append("Persentase deteksi yang mendapat ID lintasan rendah; tinjau kualitas tracking.")
    if manual_correction:
        notes.append("Hasil memuat koreksi manual analis; cantumkan jumlah koreksi pada laporan.")
    if has_media:
        notes.append("Tinjau video anotasi dan heatmap sebelum menyetujui; pastikan deteksi yang tampak sesuai angka.")
    notes.append("Riwayat dan kondisi klinis pasien tidak tercatat di sistem ini; padukan dengan penilaian klinis dokter.")
    notes.append("Keputusan klinis dan tindak lanjut ada pada dokter penanggung jawab.")
    return notes


def ai_configured() -> bool:
    return bool(os.environ.get("WAY_API_KEY", ""))


def _gateway_config() -> tuple[str, str, str]:
    base = os.environ.get("WAY_BASE_URL", "https://api-way.gutech.dev").rstrip("/")
    key = os.environ.get("WAY_API_KEY", "")
    model = os.environ.get("WAY_INTERPRETATION_MODEL", "claude-haiku-5-5")
    if not key:
        raise HTTPException(status_code=503, detail="Rekomendasi AI belum dikonfigurasi (WAY_API_KEY belum diatur). Aturan WHO tetap tersedia.")
    return base, key, model


SYSTEM_PROMPT = (
    "Anda membantu dokter menyusun draf interpretasi hasil analisis semen berbantuan AI, dalam Bahasa Indonesia. "
    "Lakukan penalaran terstruktur: nilai setiap parameter terhadap batas bawah acuan WHO yang diberikan, jelaskan pola "
    "yang terlihat (misalnya hubungan konsentrasi dan motilitas), dan sebutkan keterbatasan kalibrasi atau mutu "
    "pemeriksaan bila relevan. Jika gambar heatmap lintasan terlampir, deskripsikan pola sebarannya yang terlihat "
    "dan nyatakan bahwa pembacaan gambar adalah estimasi. Nyatakan dengan tegas dan lugas apa yang tampak dari angka terhadap batas WHO, misalnya "
    "'konsentrasi 5,09 juta/mL berada di bawah batas bawah WHO 16 juta/mL', tanpa kalimat berbelit. Berhati-hatilah "
    "hanya pada kesimpulan klinis. Dasar acuan hanya angka dan batas WHO dalam pesan pengguna. Jangan mengarang sumber, "
    "nomor jurnal, nama penulis, atau pasal peraturan. Jika menyebut pengetahuan umum di luar acuan itu, tandai dengan "
    "'(pengetahuan umum, belum diverifikasi)'. Jangan menyatakan diri sebagai dokter atau spesialis, jangan menegakkan "
    "diagnosis, jangan menyatakan kemandulan atau kesuburan secara pasti, dan jangan memberi resep, dosis, atau terapi. "
    "Sebutkan bahwa ini estimasi AI yang wajib ditinjau dokter penanggung jawab. Format jawaban: baris 'INTERPRETASI:' "
    "lalu teks; baris 'SUMBER ACUAN:' berisi versi acuan WHO yang dipakai; baris 'KESIMPULAN PASIEN:' berisi 3 sampai 5 "
    "kalimat berbahasa awam tentang apa yang ditemukan dan langkah berikutnya, tanpa istilah teknis berlebihan dan tanpa "
    "kata diagnosis; lalu baris 'REKOMENDASI:' dengan maksimal lima poin saran praktis untuk pasien dalam bahasa awam, disesuaikan dengan temuan (misalnya jika jumlah atau gerak sperma di bawah batas acuan: berhenti merokok, batasi alkohol, hindari paparan panas pada area testis, jaga berat badan dan pola makan, tidur cukup, pemeriksaan ulang sekitar 3 bulan setelah memperbaiki gaya hidup, dan konsultasi ke dokter; jika semua dalam rentang: pertahankan gaya hidup sehat). Jangan menyebut obat, suplemen, dosis, atau terapi, dan jangan menjanjikan hasil. Catatan teknis untuk dokter (kalibrasi, tracking, koreksi analis) tidak boleh masuk ke bagian ini. Tulis teks polos tanpa markdown: jangan memakai tanda bintang, pagar, atau backtick. "
    "Total jawaban maksimal 1500 karakter."
)


def _ai_payload(findings: dict) -> str:
    lines = [f"Acuan: {findings['reference_version']} (batas bawah WHO)."]
    for item in findings["findings"]:
        value = "tidak tersedia" if item["value"] is None else f"{item['value']:.2f} {item['unit']}".strip()
        lines.append(f"- {item['label']}: {value}; batas bawah WHO {item['reference_lower_limit']} {item['unit']}; status: {item['status']}")
    if findings["pattern_notes"]:
        lines.append("Pola: " + " ".join(findings["pattern_notes"]))
    inputs = findings["inputs"]
    lines.append(
        "Data pra-analitik dan mutu (nilai mentah; 'tidak tercatat' berarti kosong): "
        f"lama pantang {_raw(inputs['abstinence_duration_hours'], 'jam')}; "
        f"likuefaksi {_raw(inputs['liquefaction_time_min'], 'menit')}; "
        f"viskositas {inputs['viscosity'] or 'tidak tercatat'}; "
        f"frame dianalisis {_raw(inputs['frames_analyzed'], '')}; "
        f"deteksi dengan ID lintasan {_raw(inputs['tracking_assignment_percent'], '%')}; "
        f"video/heatmap {'tersedia' if inputs['has_media'] else 'tidak tersedia'}."
    )
    for note in findings["context_notes"]:
        lines.append(f"Catatan {note['category']}: {note['text']} (sumber: {note['source']})")
    return "\n".join(lines)


def _raw(value, unit: str) -> str:
    return "tidak tercatat" if value is None else f"{value} {unit}".strip()


def _plain_text(text: str) -> str:
    """Hapus penanda markdown agar teks tampil polos di kolom interpretasi."""
    text = re.sub(r"^\s{0,3}#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\*\*|__|`", "", text)
    text = re.sub(r"(?<!\w)\*(?=\S)|(?<=\S)\*(?!\w)", "", text)
    return text.strip()


def load_heatmap_data_url(file_name: Optional[str]) -> Optional[str]:
    """Heatmap hasil analisis sebagai data URL. Hanya berkas di folder output; nama dari sistem, bukan input pengguna."""
    if not file_name:
        return None
    path = (OUTPUT_DIR / Path(file_name).name).resolve()
    if path.parent != OUTPUT_DIR.resolve() or not path.is_file() or path.stat().st_size > MAX_HEATMAP_BYTES:
        return None
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def generate_ai_draft(findings: dict, heatmap_file: Optional[str] = None) -> dict:
    base, key, model = _gateway_config()
    heatmap = load_heatmap_data_url(heatmap_file)
    user_content = _ai_payload(findings)
    if heatmap:
        user_content = [
            {"type": "text", "text": user_content + "\nGambar heatmap lintasan terlampir; baca pola sebarannya."},
            {"type": "image_url", "image_url": {"url": heatmap}},
        ]
    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        "max_tokens": 4000,
        "temperature": 0.2,
    }).encode("utf-8")
    request = urllib.request.Request(
        f"{base}/v1/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "CASA-AI/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        logger.error("Gateway AI menolak permintaan: HTTP %s %s", error.code, error.read()[:300])
        raise HTTPException(status_code=503, detail="Rekomendasi AI tidak dapat dibuat sekarang. Coba lagi atau gunakan aturan WHO.")
    except (OSError, TimeoutError, json.JSONDecodeError) as error:
        logger.error("Gateway AI tidak dapat dihubungi: %s", error)
        raise HTTPException(status_code=503, detail="Rekomendasi AI tidak dapat dibuat sekarang. Coba lagi atau gunakan aturan WHO.")

    # Respons gateway tidak dipercaya bentuknya; setiap tingkat diperiksa tipenya.
    choices = payload.get("choices") if isinstance(payload, dict) else None
    first = choices[0] if isinstance(choices, list) and choices else None
    message = first.get("message") if isinstance(first, dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    text = content.strip() if isinstance(content, str) else ""
    if not text:
        raise HTTPException(status_code=503, detail="Rekomendasi AI kosong. Coba lagi atau gunakan aturan WHO.")

    parts = re.split(r"\**\s*REKOMENDASI\s*:\s*\**", text, maxsplit=1)
    patient_parts = re.split(r"\**\s*KESIMPULAN PASIEN\s*:\s*\**", parts[0], maxsplit=1)
    interpretation = _plain_text(re.sub(r"\**\s*INTERPRETASI\s*:\s*\**", "", patient_parts[0]))
    patient_summary = _plain_text(patient_parts[1]) if len(patient_parts) > 1 else ""
    recommendations = _plain_text(parts[1]) if len(parts) > 1 else ""
    return {
        "source": "ai_draft",
        "model": (payload.get("model") if isinstance(payload, dict) else None) or model,
        "interpretation": interpretation or _plain_text(text),
        "patient_summary": patient_summary or None,
        "recommendations": recommendations or None,
        "heatmap_used": heatmap is not None,
        "reference_version": findings["reference_version"],
        "disclaimer": "Draf AI belum diverifikasi. Ubah atau hapus sebelum disetujui; dokter bertanggung jawab atas isi laporan.",
    }
