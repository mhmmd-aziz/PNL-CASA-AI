import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { CalendarDays, CheckCircle2, AlertCircle, Printer } from 'lucide-react';
import { API_BASE_URL } from '../api.js';
import { getAuthHeader } from '../auth';
import LabelPrinter, { SampleQr } from './SampleLabel';

function todayWib() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// Tampilan waktu WIB, misalnya 19 Okt 2026, 09:00 WIB
function formatWib(date) {
  return `${new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date)} WIB`;
}

function errorMessage(error) {
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail?.message) return detail.message;
  if (Array.isArray(detail) && detail.length) return detail[0].msg;
  if (!error.response) return 'Tidak dapat terhubung ke server. Pastikan backend berjalan.';
  return 'Penjadwalan gagal. Coba lagi.';
}

const label = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.72rem', fontWeight: 600 };
const hint = { fontWeight: 400, fontSize: '0.7rem', color: 'var(--text-muted)' };

// Jadwalkan pemeriksaan untuk satu pasien yang sudah terdaftar
export default function ScheduleExamForm({ patient, onClose, onScheduled }) {
  const [day, setDay] = useState(todayWib());
  const [time, setTime] = useState('');
  const [slots, setSlots] = useState(null);
  // Lama pantang 2–7 hari (pedoman WHO), default 3 hari; mulai pantang dihitung mundur dari jadwal
  const [abstinenceHours, setAbstinenceHours] = useState('72');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [sameDayWarning, setSameDayWarning] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [result, setResult] = useState(null);
  const [labelItem, setLabelItem] = useState(null);

  const loadSlots = useCallback(async (date) => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/examinations/slots`, { params: { date }, headers: getAuthHeader() });
      setSlots(data);
    } catch (error) {
      setSlots(null);
      setNotice({ type: 'error', text: errorMessage(error) });
    }
  }, []);

  useEffect(() => {
    loadSlots(day);
  }, [day, loadSlots]);

  const submit = async (event) => {
    event.preventDefault();
    setNotice(null);
    if (!time) {
      setNotice({ type: 'error', text: 'Pilih jam pemeriksaan.' });
      return;
    }
    const reason = overrideReason.trim();
    if (sameDayWarning && reason.length < 10) {
      setNotice({ type: 'error', text: 'Isi alasan pemaksaan jadwal minimal 10 karakter.' });
      return;
    }
    const scheduledMs = Date.parse(`${day}T${time}:00+07:00`);
    const hours = Number(abstinenceHours);
    const payload = {
      medical_record_number: patient.medical_record_number,
      collection_datetime: `${day}T${time}:00+07:00`,
      abstinence_start_at: new Date(scheduledMs - hours * 3600000).toISOString(),
      abstinence_duration_hours: hours,
      ...(sameDayWarning ? { override_same_day: true, override_reason: reason } : {})
    };
    setBusy(true);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/api/examinations`, payload, { headers: getAuthHeader() });
      setResult(data);
      setLabelItem(data);
      onScheduled?.();
    } catch (error) {
      if (error.response?.data?.detail?.code === 'SAME_DAY_EXAM') setSameDayWarning(true);
      setNotice({ type: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div role="status" style={{ padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--teal-subtle)', border: '1px solid var(--teal-light)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.84rem' }}>
          <CheckCircle2 size={20} color="var(--teal)" />
          <span style={{ flex: 1 }}>
            Pemeriksaan untuk <strong>{patient.full_name}</strong> terjadwal. Antrean <strong>{result.queue_number}</strong>.
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <SampleQr item={result} size={132} />
          <div style={{ display: 'flex', flex: '1 1 260px', flexDirection: 'column', gap: '9px', minWidth: 0 }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>QR pemeriksaan — ditampilkan sekali setelah penjadwalan</div>
              <strong className="sample-id-cell" style={{ fontSize: '0.86rem' }}>{result.sample_code}</strong>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" className="action-pill-btn secondary" onClick={() => setLabelItem(result)}>
                <Printer size={13} /> Cetak label & kartu pasien
              </button>
              <button type="button" className="action-pill-btn secondary" onClick={onClose}>Tutup</button>
            </div>
          </div>
        </div>
        <LabelPrinter item={labelItem} onDone={() => setLabelItem(null)} />
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-card-alt)' }}>
      <div style={{ gridColumn: '1 / -1', fontSize: '0.84rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <CalendarDays size={16} color="var(--teal)" /> Jadwalkan pemeriksaan: {patient.full_name} ({patient.medical_record_number})
      </div>
      <label style={label}>
        Tanggal
        <input type="date" className="search-box" min={todayWib()} value={day} onChange={(e) => { setDay(e.target.value); setTime(''); setSameDayWarning(false); }} />
      </label>
      <label style={label}>
        Jam
        <select className="search-box" value={time} onChange={(e) => { setTime(e.target.value); setSameDayWarning(false); }} disabled={!slots}>
          <option value="">— pilih jam —</option>
          {(slots?.slots || []).map((slot) => (
            <option key={slot.time} value={slot.time} disabled={!slot.available}>
              {slot.time} — {slot.past ? 'sudah lewat' : slot.available ? `sisa ${slot.capacity - slot.booked}` : 'penuh'}
            </option>
          ))}
        </select>
        <span style={hint}>Slot 15 menit, maksimal {slots ? slots.capacity : 4} pasien.</span>
      </label>
      <label style={label}>
        Lama pantang (pedoman WHO 2–7 hari)
        <select className="search-box" value={abstinenceHours} onChange={(e) => setAbstinenceHours(e.target.value)}>
          {[2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d * 24}>{d} hari ({d * 24} jam)</option>)}
        </select>
      </label>
      <div style={{ ...label, gap: '4px' }}>
        Mulai pantang (otomatis)
        <span className="search-box" style={{ display: 'block', color: 'var(--text-secondary)' }}>
          {time ? formatWib(new Date(Date.parse(`${day}T${time}:00+07:00`) - Number(abstinenceHours) * 3600000)) : 'Pilih jam pemeriksaan dulu'}
        </span>
        <span style={hint}>Pasien siap diperiksa tepat pada jam pemeriksaan.</span>
      </div>
      {sameDayWarning && (
        <div role="alert" style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid #D97706', background: 'rgba(217, 119, 6, 0.08)', fontSize: '0.8rem' }}>
          <strong style={{ color: '#B45309' }}>Peringatan: pasien ini sudah memiliki pemeriksaan pada tanggal tersebut.</strong>
          <span style={{ color: 'var(--text-secondary)' }}>Anda tetap bisa memaksa jadwal ini. Alasan akan dicatat di log audit.</span>
          <textarea
            className="search-box"
            rows={2}
            maxLength={300}
            aria-label="Alasan pemaksaan jadwal"
            placeholder="Tulis alasan, minimal 10 karakter"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
          />
        </div>
      )}
      <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
        {notice && (
          <span role="alert" style={{ flex: '1 1 220px', color: '#DC2626', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <AlertCircle size={14} /> {notice.text}
          </span>
        )}
        <button type="button" className="action-pill-btn secondary" style={{ flexShrink: 0 }} onClick={onClose}>Batal</button>
        <button type="submit" className="action-pill-btn primary" style={{ flexShrink: 0 }} disabled={busy}>
          {busy ? 'Menyimpan...' : sameDayWarning ? 'Paksa jadwalkan' : 'Jadwalkan'}
        </button>
      </div>
    </form>
  );
}
