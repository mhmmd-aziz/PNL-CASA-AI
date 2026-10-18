import { useEffect, useState } from 'react';
import axios from 'axios';
import { UserCheck, ScrollText, CheckCircle2, AlertCircle } from 'lucide-react';
import { API_BASE_URL } from '../api.js';
import { getAuthHeader } from '../auth';

const ROLE_OPTIONS = [
  { value: 'FRONT_OFFICE', label: 'Front Office / Admin Lab' },
  { value: 'ANALYST', label: 'Analis / ATLM' },
  { value: 'PHYSICIAN', label: 'Dokter Penanggung Jawab' },
  { value: 'SUPER_ADMIN', label: 'Super Admin / Kepala Lab' }
];

const ROLE_LABEL = Object.fromEntries(ROLE_OPTIONS.map((option) => [option.value, option.label]));

function errorMessage(error) {
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length) return detail[0].msg;
  if (!error.response) return 'Tidak dapat terhubung ke server. Pastikan backend berjalan.';
  return 'Permintaan gagal. Coba lagi.';
}

const fmtTime = (value) => (value ? new Date(value).toLocaleString('id-ID') : '—');
const EMPTY_FORM = { email: '', fullName: '', role: 'FRONT_OFFICE', password: '', phoneNumber: '', licenseNumber: '' };

export function UsersPanel() {
  const [users, setUsers] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/admin/users`, { headers: getAuthHeader() });
      setUsers(data);
      setLoadError('');
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const create = async (event) => {
    event.preventDefault();
    setNotice(null);
    setBusy(true);
    try {
      await axios.post(
        `${API_BASE_URL}/api/admin/users`,
        {
          email: form.email.trim(),
          full_name: form.fullName.trim(),
          role: form.role,
          password: form.password,
          phone_number: form.phoneNumber.trim() || null,
          license_number: form.licenseNumber.trim() || null
        },
        { headers: getAuthHeader() }
      );
      setNotice({ type: 'ok', text: `Akun ${form.email.trim()} dibuat.` });
      setForm(EMPTY_FORM);
      await load();
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const patch = async (user, changes, doneText) => {
    setNotice(null);
    setBusy(true);
    try {
      await axios.patch(`${API_BASE_URL}/api/admin/users/${user.id}`, changes, { headers: getAuthHeader() });
      setNotice({ type: 'ok', text: doneText });
      await load();
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const label = { display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', fontWeight: 600 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <section className="card-box" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <UserCheck size={20} color="var(--teal)" /> Tambah Akun Staf
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Akun pasien dibuat sendiri lewat registrasi. Di sini hanya akun staf laboratorium.
        </p>
        <form onSubmit={create} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          <label style={label}>Nama lengkap<input className="search-box" required value={form.fullName} onChange={update('fullName')} /></label>
          <label style={label}>Email<input type="email" className="search-box" required value={form.email} onChange={update('email')} /></label>
          <label style={label}>
            Peran
            <select className="search-box" value={form.role} onChange={update('role')}>
              {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label style={label}>Kata sandi awal (min. 8)<input type="password" className="search-box" required minLength={8} value={form.password} onChange={update('password')} /></label>
          <label style={label}>No. HP<input className="search-box" value={form.phoneNumber} onChange={update('phoneNumber')} /></label>
          <label style={label}>
            No. SIP/STR (wajib untuk dokter)
            <input className="search-box" value={form.licenseNumber} onChange={update('licenseNumber')} />
          </label>
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px' }}>
            {notice && (
              <span role="status" style={{ fontSize: '0.8rem', color: notice.type === 'ok' ? 'var(--teal)' : '#DC2626', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                {notice.type === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {notice.text}
              </span>
            )}
            <button type="submit" className="action-pill-btn primary" disabled={busy}>Buat Akun</button>
          </div>
        </form>
      </section>

      <section className="bottom-table-card">
        <div className="table-header-row">
          <div className="table-title">Daftar Akun Staf</div>
        </div>
        {loadError && <p role="alert" style={{ color: '#DC2626', fontSize: '0.8rem' }}>{loadError}</p>}
        <div className="casa-table-wrap">
          <table className="casa-table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Email</th>
                <th>Peran</th>
                <th>Login terakhir</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && <tr><td colSpan={6}>Belum ada akun staf.</td></tr>}
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.full_name}</td>
                  <td>{user.email}</td>
                  <td>
                    <select
                      className="search-box"
                      value={user.role}
                      disabled={busy}
                      onChange={(event) => patch(user, { role: event.target.value }, `Peran ${user.email} diubah.`)}
                      style={{ minWidth: '200px' }}
                    >
                      {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </td>
                  <td>{fmtTime(user.last_login_at)}</td>
                  <td>{user.is_active ? 'Aktif' : 'Nonaktif'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="action-pill-btn secondary"
                      disabled={busy}
                      onClick={() => patch(user, { is_active: !user.is_active }, `${user.email} ${user.is_active ? 'dinonaktifkan' : 'diaktifkan'}.`)}
                    >
                      {user.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {notice && (
          <p role="status" style={{ fontSize: '0.8rem', marginTop: '8px', color: notice.type === 'ok' ? 'var(--teal)' : '#DC2626' }}>{notice.text}</p>
        )}
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px' }}>
          Peran tidak bisa diubah untuk akun Anda sendiri, dan akun Anda tidak bisa dinonaktifkan dari sini.
          Peran {ROLE_LABEL.SUPER_ADMIN} tetap harus ada minimal satu yang aktif.
        </p>
      </section>
    </div>
  );
}

export function AuditPanel() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('');
  const [loadError, setLoadError] = useState('');

  const load = async (action) => {
    try {
      const params = action ? { action_type: action } : {};
      const { data } = await axios.get(`${API_BASE_URL}/api/admin/audit-logs`, { headers: getAuthHeader(), params: { limit: 200, ...params } });
      setLogs(data);
      setLoadError('');
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  };

  useEffect(() => {
    load('');
  }, []);

  return (
    <section className="bottom-table-card">
      <div className="table-header-row">
        <div className="table-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ScrollText size={18} color="var(--teal)" />
          <span>Log Audit</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input className="search-box" placeholder="Filter jenis aksi, mis. LOGIN_FAILED" value={filter} onChange={(event) => setFilter(event.target.value)} style={{ minWidth: '240px' }} />
          <button type="button" className="action-pill-btn secondary" onClick={() => load(filter.trim())}>Terapkan</button>
        </div>
      </div>
      {loadError && <p role="alert" style={{ color: '#DC2626', fontSize: '0.8rem' }}>{loadError}</p>}
      <div className="casa-table-wrap">
        <table className="casa-table">
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Pelaku</th>
              <th>Aksi</th>
              <th>Keterangan</th>
              <th>Hasil</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && <tr><td colSpan={5}>Belum ada catatan.</td></tr>}
            {logs.map((log) => (
              <tr key={log.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtTime(log.created_at)}</td>
                <td>{log.actor_email || '—'}<div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{log.actor_role || ''}</div></td>
                <td>{log.action_type}</td>
                <td>{log.description}</td>
                <td>{log.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
