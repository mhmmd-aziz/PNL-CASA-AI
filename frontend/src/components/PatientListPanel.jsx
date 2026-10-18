import { Fragment, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Users, Search, Pencil, CalendarDays, CheckCircle2, AlertCircle, X } from 'lucide-react';
import ScheduleExamForm from './ScheduleExamForm';
import { API_BASE_URL } from '../api.js';
import { getAuthHeader } from '../auth';

const GENDER_OPTIONS = [
  { value: '', label: '— pilih —' },
  { value: 'MALE', label: 'Laki-laki' },
  { value: 'FEMALE', label: 'Perempuan' },
  { value: 'OTHER', label: 'Lainnya' }
];

function errorMessage(error) {
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length) return detail[0].msg;
  if (!error.response) return 'Tidak dapat terhubung ke server. Pastikan backend berjalan.';
  return 'Permintaan gagal. Coba lagi.';
}

const fmtDate = (value) => (value ? new Date(`${value}T12:00:00+07:00`).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' }) : '—');
const label = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.72rem', fontWeight: 600 };

// Form ubah data pribadi pasien
function PatientEditor({ patient, onSaved, onClose }) {
  const [form, setForm] = useState({
    full_name: patient.full_name || '',
    birth_date: patient.date_of_birth || '',
    gender: patient.gender || '',
    phone: patient.phone_number || '',
    email: patient.email || ''
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await axios.put(
        `${API_BASE_URL}/api/patients/${patient.id}`,
        {
          full_name: form.full_name.trim(),
          birth_date: form.birth_date || null,
          gender: form.gender || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null
        },
        { headers: getAuthHeader() }
      );
      onSaved('Data pasien tersimpan.');
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-card-alt)' }}>
      <label style={label}>Nama lengkap<input className="search-box" required minLength={3} value={form.full_name} onChange={update('full_name')} /></label>
      <label style={label}>Tanggal lahir<input type="date" className="search-box" value={form.birth_date} onChange={update('birth_date')} /></label>
      <label style={label}>Jenis kelamin
        <select className="search-box" value={form.gender} onChange={update('gender')}>
          {GENDER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label style={label}>No. HP<input className="search-box" value={form.phone} onChange={update('phone')} /></label>
      <label style={label}>
        Email{patient.has_portal_account ? ' (juga dipakai masuk portal)' : ''}
        <input type="email" className="search-box" value={form.email} onChange={update('email')} />
      </label>
      <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px' }}>
        {notice && (
          <span role="alert" style={{ color: '#DC2626', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px', marginRight: 'auto' }}>
            <AlertCircle size={14} /> {notice.text}
          </span>
        )}
        <button type="button" className="action-pill-btn secondary" onClick={onClose}>Tutup</button>
        <button type="submit" className="action-pill-btn primary" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan Perubahan'}</button>
      </div>
    </form>
  );
}

// List Pasien: semua pasien, dengan pencarian dan ubah data
export default function PatientListPanel() {
  const [patients, setPatients] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState('ALL');
  const [editingId, setEditingId] = useState(null);
  const [schedulingId, setSchedulingId] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/patients`, { headers: getAuthHeader() });
      setPatients(data);
      setLoadError('');
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return patients
      .filter((p) => accountFilter === 'ALL' || (accountFilter === 'YES' ? p.has_portal_account : !p.has_portal_account))
      .filter((p) => !q || [p.full_name, p.medical_record_number, p.phone_number, p.email]
        .some((value) => value && String(value).toLowerCase().includes(q)));
  }, [patients, query, accountFilter]);

  const schedulingPatient = patients.find((p) => p.id === schedulingId) || null;
  const editingPatient = patients.find((p) => p.id === editingId) || null;

  const saved = (text) => {
    setEditingId(null);
    setNotice({ type: 'ok', text });
    load();
  };

  return (
    <section className="bottom-table-card fo-panel">
      <div className="table-header-row">
        <div className="table-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={18} color="var(--teal)" />
          <span>List Pasien</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>{rows.length} pasien. Data diri pasien; klik Jadwalkan untuk membuat pemeriksaan baru.</span>
        </div>
        <div className="fo-toolbar">
          <Search size={16} color="var(--text-muted)" />
          <input className="search-box" placeholder="Cari nama, No. RM, HP, atau email" value={query} onChange={(e) => setQuery(e.target.value)} style={{ minWidth: '240px' }} />
          <select className="search-box" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
            <option value="ALL">Semua pasien</option>
            <option value="YES">Punya akun portal</option>
            <option value="NO">Belum punya akun</option>
          </select>
        </div>
      </div>

      {notice && (
        <p role="status" style={{ fontSize: '0.8rem', color: notice.type === 'ok' ? 'var(--teal)' : '#DC2626', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {notice.type === 'ok' && <CheckCircle2 size={14} />} {notice.text}
        </p>
      )}
      {loadError && <p role="alert" style={{ color: '#DC2626', fontSize: '0.8rem' }}>{loadError}</p>}

      <div className="casa-table-wrap">
        <table className="casa-table">
          <thead>
            <tr>
              <th>No. RM</th>
              <th>Nama</th>
              <th>Tanggal lahir</th>
              <th>HP</th>
              <th>Email</th>
              <th>Akun portal</th>
              <th>Pemeriksaan</th>
              <th className="patient-action-cell" style={{ textAlign: 'right' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8}>Memuat data pasien...</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={8}>Tidak ada pasien yang cocok.</td></tr>}
            {rows.map((p) => (
              <Fragment key={p.id}>
                <tr>
                  <td className="sample-id-cell">{p.medical_record_number}</td>
                  <td><strong>{p.full_name}</strong></td>
                  <td>{fmtDate(p.date_of_birth)}</td>
                  <td>{p.phone_number || '—'}</td>
                  <td>{p.email || '—'}</td>
                  <td>{p.has_portal_account ? 'Ya' : 'Belum'}</td>
                  <td>{p.exam_count}</td>
                  <td className="patient-action-cell">
                    <span className="fo-actions patient-actions">
                      <button type="button" className="action-pill-btn primary" onClick={() => { setSchedulingId(schedulingId === p.id ? null : p.id); setEditingId(null); }}>
                        <CalendarDays size={13} /> Jadwalkan pemeriksaan
                      </button>
                      <button type="button" className="action-pill-btn secondary" onClick={() => { setEditingId(p.id); setSchedulingId(null); }}>
                        <Pencil size={13} /> Ubah
                      </button>
                    </span>
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {schedulingPatient && (
        <div className="modal-backdrop" onClick={() => setSchedulingId(null)}>
          <div className="modal-content-panel" style={{ maxWidth: '640px', width: '100%' }} role="dialog" aria-modal="true" aria-label="Jadwalkan pemeriksaan" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Jadwalkan Pemeriksaan</h3>
              <button type="button" className="modal-close-btn" onClick={() => setSchedulingId(null)} aria-label="Tutup">
                <X size={18} />
              </button>
            </div>
            <ScheduleExamForm patient={schedulingPatient} onScheduled={load} onClose={() => setSchedulingId(null)} />
          </div>
        </div>
      )}
      {editingPatient && (
        <div className="modal-backdrop" onClick={() => setEditingId(null)}>
          <div className="modal-content-panel" style={{ maxWidth: '640px', width: '100%' }} role="dialog" aria-modal="true" aria-label="Ubah data pasien" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Ubah Data Pasien</h3>
              <button type="button" className="modal-close-btn" onClick={() => setEditingId(null)} aria-label="Tutup">
                <X size={18} />
              </button>
            </div>
            <PatientEditor patient={editingPatient} onSaved={saved} onClose={() => setEditingId(null)} />
          </div>
        </div>
      )}
    </section>
  );
}
