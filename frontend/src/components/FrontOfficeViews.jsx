import { Fragment, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { CalendarClock, ListOrdered, Users, Search, CalendarDays, Trash2, Play, X, QrCode, Printer } from 'lucide-react';
import { API_BASE_URL } from '../api.js';
import { getAuthHeader } from '../auth';
import LabelPrinter, { SampleQr } from './SampleLabel';

// Tiga status yang tampil di semua tabel (dipetakan di backend: public_status)
const STATUS_OPTIONS = ['Menunggu jadwal', 'Dikirim ke analis', 'Proses dokter', 'Periksa selesai'];

// Tanggal hari ini di zona WIB (YYYY-MM-DD)
function todayWib() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function wibParts(value) {
  const date = new Date(value);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const time = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  const weekday = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long' }).format(date);
  const dateText = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  const dateShort = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  return { day, time, weekday, dateText, dateShort };
}

function errorMessage(error) {
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (!error.response) return 'Tidak dapat terhubung ke server. Pastikan backend berjalan.';
  return 'Permintaan gagal. Coba lagi.';
}

function QrAction({ item }) {
  const [open, setOpen] = useState(false);
  const [printItem, setPrintItem] = useState(null);
  return (
    <>
      <button type="button" className="action-pill-btn secondary qr-icon-btn" title={`Lihat QR ${item.sample_code}`} aria-label={`Lihat QR pemeriksaan ${item.sample_code}`} onClick={() => setOpen(true)}>
        <QrCode size={16} />
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal-content-panel qr-preview-modal" role="dialog" aria-modal="true" aria-label={`QR pemeriksaan ${item.sample_code}`} onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>QR Pemeriksaan</h3>
              <button type="button" className="modal-close-btn" onClick={() => setOpen(false)} aria-label="Tutup"><X size={18} /></button>
            </div>
            <div className="qr-preview-content">
              <SampleQr item={item} size={190} />
              <div className="qr-preview-data">
                <span>Kode sampel</span><strong className="sample-id-cell">{item.sample_code}</strong>
                <span>Pasien</span><strong>{item.patient_name}</strong>
                <span>No. RM</span><strong>{item.medical_record_number}</strong>
                <span>Antrean</span><strong>{item.queue_number || '—'}</strong>
                <span>Jadwal</span><strong>{wibParts(item.collection_datetime).dateShort}, {wibParts(item.collection_datetime).time} WIB</strong>
              </div>
            </div>
            <div className="qr-preview-actions">
              <button type="button" className="action-pill-btn secondary" onClick={() => setOpen(false)}>Tutup</button>
              <button type="button" className="action-pill-btn primary" onClick={() => setPrintItem(item)}><Printer size={14} /> Cetak ulang</button>
            </div>
            <LabelPrinter item={printItem} onDone={() => setPrintItem(null)} />
          </div>
        </div>
      )}
    </>
  );
}

// Hook sederhana: memuat semua pemeriksaan (sudah diurutkan dari backend)
function useExaminations() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/examinations`, { headers: getAuthHeader() });
      setItems(data);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return { items, error, loading, reload: load };
}

function ScheduleTable({ rows, emptyText, renderAction }) {
  return (
    <div className="casa-table-wrap">
      <table className="casa-table">
        <thead>
          <tr>
            <th>Jam</th>
            <th>Antrean</th>
            <th>Pasien</th>
            <th>No. RM</th>
            <th>Kode Sampel</th>
            <th>Status</th>
            {renderAction && <th style={{ textAlign: 'right' }}>Aksi</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={renderAction ? 7 : 6}>{emptyText}</td></tr>}
          {rows.map((item) => (
            <tr key={item.id}>
              <td className="fo-schedule">{wibParts(item.collection_datetime).time}</td>
              <td><strong>{item.queue_number || '—'}</strong></td>
              <td>{item.patient_name}</td>
              <td>{item.medical_record_number}</td>
              <td className="sample-id-cell">{item.sample_code}</td>
              <td>{item.status_label}</td>
              {renderAction && <td style={{ textAlign: 'right' }}>{renderAction(item)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Dashboard: jadwal datang hari ini
export function TodaySchedule() {
  const { items, error, loading } = useExaminations();
  const today = todayWib();
  const todays = items
    .filter((item) => item.status !== 'CANCELLED' && item.queue_date === today)
    .sort((a, b) => new Date(a.collection_datetime) - new Date(b.collection_datetime));
  const headline = todays.length ? wibParts(todays[0].collection_datetime) : wibParts(new Date());
  const waiting = todays.filter((item) => item.status === 'REGISTERED').length;

  return (
    <section className="bottom-table-card fo-panel">
      <div className="table-header-row">
        <div>
          <div className="table-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CalendarClock size={18} color="var(--teal)" />
            <span>Jadwal Datang Hari Ini</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {headline.weekday}, {headline.dateText} • {todays.length} pasien terjadwal • {waiting} belum datang/diterima
          </div>
        </div>
      </div>
      {error && <p role="alert" style={{ color: '#DC2626', fontSize: '0.8rem' }}>{error}</p>}
      {loading ? <p style={{ fontSize: '0.8rem' }}>Memuat jadwal...</p> : <ScheduleTable rows={todays} emptyText="Tidak ada pasien terjadwal hari ini." renderAction={(item) => <QrAction item={item} />} />}
    </section>
  );
}

// Antrian Pasien: antrean hari ini untuk Front Office
// Antrian Pasien: antrean untuk Front Office, bisa difilter sesuka hati
export function QueuePanel() {
  const { items, error, loading, reload } = useExaminations();
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [forcing, setForcing] = useState(null);

  const handover = async (item) => {
    setBusyId(item.id);
    setNotice(null);
    try {
      await handoverExamination(item);
      setNotice({ type: 'ok', text: `${item.patient_name} (${item.sample_code}) langsung masuk pemeriksaan.` });
      reload();
    } catch (err) {
      if (isPantangBlocked(err)) setForcing({ item, message: errorMessage(err) });
      else setNotice({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusyId(null);
    }
  };

  const forceHandover = async (reason) => {
    const item = forcing.item;
    setBusyId(item.id);
    try {
      await handoverExamination(item, { override: true, reason });
      setNotice({ type: 'ok', text: `${item.patient_name} (${item.sample_code}) dipaksa masuk pemeriksaan dan dicatat di log audit.` });
      setForcing(null);
      reload();
    } catch (err) {
      setNotice({ type: 'error', text: errorMessage(err) });
      setForcing(null);
    } finally {
      setBusyId(null);
    }
  };

  const [day, setDay] = useState(todayWib());
  const [status, setStatus] = useState('ALL');
  const [fromTime, setFromTime] = useState('');
  const [toTime, setToTime] = useState('');
  const [query, setQuery] = useState('');

  // Pilihan tanggal: hari ini, atau semua tanggal yang punya pemeriksaan
  const availableDays = useMemo(
    () => [...new Set(items.map((item) => item.queue_date).filter(Boolean))].sort().reverse(),
    [items]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((item) => item.status !== 'CANCELLED')
      .filter((item) => day === 'ALL' || item.queue_date === day)
      .filter((item) => status === 'ALL' || item.status_label === status)
      .filter((item) => {
        if (!fromTime && !toTime) return true;
        const time = wibParts(item.collection_datetime).time;
        return (!fromTime || time >= fromTime) && (!toTime || time <= toTime);
      })
      .filter((item) => !q || [item.patient_name, item.medical_record_number, item.sample_code, item.queue_number]
        .some((value) => value && String(value).toLowerCase().includes(q)))
      .sort((a, b) => new Date(a.collection_datetime) - new Date(b.collection_datetime));
  }, [items, day, status, fromTime, toTime, query]);

  const received = rows.filter((item) => item.status !== 'REGISTERED').length;
  const isFiltered = day !== todayWib() || status !== 'ALL' || fromTime || toTime || query;

  const resetFilters = () => {
    setDay(todayWib());
    setStatus('ALL');
    setFromTime('');
    setToTime('');
    setQuery('');
  };

  return (
    <section className="bottom-table-card fo-panel">
      <div className="table-header-row">
        <div>
          <div className="table-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ListOrdered size={18} color="var(--teal)" />
            <span>Antrian Pasien</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {day === 'ALL' ? 'Semua tanggal' : wibParts(`${day}T12:00:00+07:00`).dateText} • {rows.length} pasien • {received} sudah diterima laboratorium
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isFiltered && <button type="button" className="action-pill-btn secondary" onClick={resetFilters}>Reset filter</button>}
          <button type="button" className="action-pill-btn secondary" onClick={reload}>Muat ulang</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', margin: '4px 0 12px' }}>
        <label style={filterLabel}>
          Tanggal
          <select className="search-box" value={day} onChange={(e) => setDay(e.target.value)} style={{ minWidth: '170px' }}>
            <option value={todayWib()}>Hari ini</option>
            <option value="ALL">Semua tanggal</option>
            {availableDays.filter((d) => d !== todayWib()).map((d) => (
              <option key={d} value={d}>{wibParts(`${d}T12:00:00+07:00`).dateText}</option>
            ))}
          </select>
        </label>
        <label style={filterLabel}>
          Status
          <select className="search-box" value={status} onChange={(e) => setStatus(e.target.value)} style={{ minWidth: '170px' }}>
            <option value="ALL">Semua status</option>
            {STATUS_OPTIONS.map((text) => <option key={text} value={text}>{text}</option>)}
          </select>
        </label>
        <label style={filterLabel}>
          Jam dari
          <input type="time" className="search-box" value={fromTime} onChange={(e) => setFromTime(e.target.value)} />
        </label>
        <label style={filterLabel}>
          Sampai
          <input type="time" className="search-box" value={toTime} onChange={(e) => setToTime(e.target.value)} />
        </label>
        <label style={{ ...filterLabel, flex: 1, minWidth: '220px' }}>
          Cari
          <input className="search-box" placeholder="Nama, No. RM, kode sampel, atau antrean" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      {notice && <p role="status" style={{ fontSize: '0.8rem', color: notice.type === 'ok' ? 'var(--teal)' : '#DC2626' }}>{notice.text}</p>}
      {error && <p role="alert" style={{ color: '#DC2626', fontSize: '0.8rem' }}>{error}</p>}
      {loading ? <p style={{ fontSize: '0.8rem' }}>Memuat antrean...</p> : (
        <ScheduleTable
          rows={rows}
          emptyText="Tidak ada antrean yang cocok dengan filter."
          renderAction={(item) => (
            <span className="fo-row-actions">
              <QrAction item={item} />
              {canHandover(item) ? (
                <button type="button" className="action-pill-btn primary" disabled={busyId === item.id} onClick={() => handover(item)}>
                  <Play size={13} /> Langsung ke pemeriksaan
                </button>
              ) : (item.received_datetime ? <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Sudah diserahkan</span> : null)}
            </span>
          )}
        />
      )}
      {forcing && (
        <ForceHandoverDialog item={forcing.item} message={forcing.message} busy={busyId === forcing.item.id} onCancel={() => setForcing(null)} onConfirm={forceHandover} />
      )}
    </section>
  );
}

// Aksi langsung ke pemeriksaan: untuk pemeriksaan yang belum diserahkan (masa pantang tetap dicek server)
function canHandover(item) {
  return item.status === 'REGISTERED' && !item.received_datetime;
}

async function handoverExamination(item, payload = {}) {
  await axios.post(`${API_BASE_URL}/api/examinations/${item.id}/handover`, payload, { headers: getAuthHeader() });
}

// Pantang belum selesai: boleh dipaksa lanjut dengan alasan (untuk test atau lomba), tercatat di log audit
function isPantangBlocked(error) {
  const detail = error.response?.data?.detail;
  return error.response?.status === 409 && typeof detail === 'string' && detail.startsWith('Pantang belum selesai');
}

function ForceHandoverDialog({ item, message, onCancel, onConfirm, busy }) {
  const [reason, setReason] = useState('');
  const valid = reason.trim().length >= 5;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-content-panel" style={{ maxWidth: '520px', width: '100%' }} role="dialog" aria-modal="true" aria-label="Lanjutkan paksa" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Pantang belum selesai</h3>
        </div>
        <p style={{ fontSize: '0.84rem' }}>
          <strong>{item.patient_name}</strong> ({item.sample_code}). {message}
        </p>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Lanjutkan hanya untuk keperluan test atau lomba. Tindakan ini tercatat di log audit Super Admin beserta alasannya.
        </p>
        <label style={{ ...filterLabel, marginTop: '8px' }}>
          Alasan (minimal 5 karakter)
          <textarea className="search-box" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
          <button type="button" className="action-pill-btn secondary" onClick={onCancel}>Batal</button>
          <button type="button" className="action-pill-btn primary" disabled={!valid || busy} onClick={() => onConfirm(reason.trim())}>
            Ya, lanjutkan paksa
          </button>
        </div>
      </div>
    </div>
  );
}

const filterLabel = { fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' };

// Editor jadwal: pilih tanggal lalu slot yang tersedia pada tanggal itu
function RescheduleEditor({ item, onDone, onCancel }) {
  const [day, setDay] = useState(wibParts(item.collection_datetime).day);
  const [time, setTime] = useState('');
  const [slots, setSlots] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/examinations/slots`, { params: { date: day }, headers: getAuthHeader() })
      .then(({ data }) => setSlots(data))
      .catch((error) => { setSlots(null); setNotice({ type: 'error', text: errorMessage(error) }); });
  }, [day]);

  const save = async () => {
    if (!time) {
      setNotice({ type: 'error', text: 'Pilih jam pemeriksaan.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await axios.put(
        `${API_BASE_URL}/api/examinations/${item.id}/schedule`,
        { collection_datetime: `${day}T${time}:00+07:00` },
        { headers: getAuthHeader() }
      );
      onDone('Jadwal diubah.');
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap', padding: '12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-card-alt)' }}>
      <label style={filterLabel}>
        Tanggal
        <input type="date" className="search-box" value={day} min={todayWib()} onChange={(e) => { setDay(e.target.value); setTime(''); }} />
      </label>
      <label style={filterLabel}>
        Jam
        <select className="search-box" value={time} onChange={(e) => setTime(e.target.value)} disabled={!slots} style={{ minWidth: '200px' }}>
          <option value="">— pilih jam —</option>
          {(slots?.slots || []).map((slot) => (
            <option key={slot.time} value={slot.time} disabled={!slot.available}>
              {slot.time} — {slot.past ? 'sudah lewat' : slot.available ? `sisa ${slot.capacity - slot.booked}` : 'penuh'}
            </option>
          ))}
        </select>
      </label>
      {notice && <span role="alert" style={{ color: '#DC2626', fontSize: '0.8rem' }}>{notice.text}</span>}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
        <button type="button" className="action-pill-btn secondary" onClick={onCancel}>Batal</button>
        <button type="button" className="action-pill-btn primary" disabled={busy} onClick={save}>{busy ? 'Menyimpan...' : 'Simpan Jadwal'}</button>
      </div>
    </div>
  );
}

// Daftar Pasien & Sampel: semua pemeriksaan, dengan jadwal, serta ubah jadwal dan batalkan
export function SamplesPanel() {
  const { items, error, loading, reload } = useExaminations();
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [forcing, setForcing] = useState(null);
  const editingItem = items.find((item) => item.id === editingId) || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [item.patient_name, item.medical_record_number, item.sample_code, item.queue_number]
        .some((value) => value && String(value).toLowerCase().includes(q))
    );
  }, [items, query]);

  const handover = async (item) => {
    setBusyId(item.id);
    setNotice(null);
    try {
      await handoverExamination(item);
      setNotice({ type: 'ok', text: `${item.patient_name} (${item.sample_code}) langsung masuk pemeriksaan.` });
      reload();
    } catch (err) {
      if (isPantangBlocked(err)) setForcing({ item, message: errorMessage(err) });
      else setNotice({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusyId(null);
    }
  };

  const forceHandover = async (reason) => {
    const item = forcing.item;
    setBusyId(item.id);
    try {
      await handoverExamination(item, { override: true, reason });
      setNotice({ type: 'ok', text: `${item.patient_name} (${item.sample_code}) dipaksa masuk pemeriksaan dan dicatat di log audit.` });
      setForcing(null);
      reload();
    } catch (err) {
      setNotice({ type: 'error', text: errorMessage(err) });
      setForcing(null);
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (item) => {
    if (!window.confirm(`Hapus pemeriksaan ${item.sample_code} untuk ${item.patient_name} dari daftar?

Riwayatnya tetap tercatat di log audit Super Admin.`)) return;
    setBusyId(item.id);
    setNotice(null);
    try {
      await axios.post(`${API_BASE_URL}/api/examinations/${item.id}/cancel`, null, { headers: getAuthHeader() });
      setNotice({ type: 'ok', text: `Pemeriksaan ${item.sample_code} dihapus dari daftar.` });
      reload();
    } catch (err) {
      setNotice({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusyId(null);
    }
  };

  const done = (text) => {
    setEditingId(null);
    setNotice({ type: 'ok', text });
    reload();
  };

  return (
    <section className="bottom-table-card fo-panel">
      <div className="table-header-row">
        <div className="table-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={18} color="var(--teal)" />
          <span>Pemeriksaan & Sampel</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>Semua pemeriksaan dan statusnya. Ubah jadwal atau hapus hanya untuk sampel yang belum diterima lab.</span>
        </div>
        <div className="fo-toolbar">
          <Search size={16} color="var(--text-muted)" />
          <input
            className="search-box"
            placeholder="Cari nama, No. RM, kode sampel, atau antrean"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setQuery(draft); }}
          />
          <button type="button" className="action-pill-btn primary" onClick={() => setQuery(draft)}>Cari</button>
          {query && <button type="button" className="action-pill-btn secondary" onClick={() => { setDraft(''); setQuery(''); }}>Reset</button>}
          <button type="button" className="action-pill-btn secondary" onClick={reload}>Muat ulang</button>
        </div>
      </div>
      {notice && <p role="status" style={{ fontSize: '0.8rem', color: notice.type === 'ok' ? 'var(--teal)' : '#DC2626' }}>{notice.text}</p>}
      {error && <p role="alert" style={{ color: '#DC2626', fontSize: '0.8rem' }}>{error}</p>}
      <div className="casa-table-wrap">
        <table className="casa-table">
          <thead>
            <tr>
              <th>Jadwal</th>
              <th>Antrean</th>
              <th>Pasien</th>
              <th>No. RM</th>
              <th>Kode Sampel</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7}>Memuat data...</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={7}>Tidak ada data yang cocok.</td></tr>}
            {filtered.map((item) => {
              const at = wibParts(item.collection_datetime);
              const editable = item.status === 'REGISTERED';
              return (
                <Fragment key={item.id}>
                  <tr>
                    <td className="fo-schedule">
                      <strong>{at.dateShort}</strong>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{at.time} WIB</div>
                    </td>
                    <td>{item.queue_number || '—'}</td>
                    <td>{item.patient_name}</td>
                    <td>{item.medical_record_number}</td>
                    <td className="sample-id-cell">{item.sample_code}</td>
                    <td>{item.status_label}</td>
                    <td>
                      {canHandover(item) && (
                        <button type="button" className="action-pill-btn primary" style={{ marginRight: '6px' }} disabled={busyId === item.id} onClick={() => handover(item)}>
                          <Play size={13} /> Langsung ke pemeriksaan
                        </button>
                      )}
                      {editable ? (
                        <span className="fo-actions">
                          <button type="button" className="action-pill-btn secondary" onClick={() => setEditingId(item.id)}>
                            <CalendarDays size={13} /> Ubah jadwal
                          </button>
                          <button type="button" className="action-pill-btn secondary" disabled={busyId === item.id} onClick={() => cancel(item)}>
                            <Trash2 size={13} /> Hapus
                          </button>
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Sudah diterima lab</span>
                      )}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {editingItem && (
        <div className="modal-backdrop" onClick={() => setEditingId(null)}>
          <div className="modal-content-panel" style={{ maxWidth: '640px', width: '100%' }} role="dialog" aria-modal="true" aria-label="Ubah jadwal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Ubah Jadwal: {editingItem.patient_name}</h3>
              <button type="button" className="modal-close-btn" onClick={() => setEditingId(null)} aria-label="Tutup">
                <X size={18} />
              </button>
            </div>
            <RescheduleEditor item={editingItem} onDone={done} onCancel={() => setEditingId(null)} />
          </div>
        </div>
      )}
      {forcing && (
        <ForceHandoverDialog item={forcing.item} message={forcing.message} busy={busyId === forcing.item.id} onCancel={() => setForcing(null)} onConfirm={forceHandover} />
      )}
    </section>
  );
}
