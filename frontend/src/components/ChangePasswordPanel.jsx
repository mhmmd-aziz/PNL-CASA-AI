import { useState } from 'react';
import axios from 'axios';
import { KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';
import { API_BASE_URL } from '../api.js';
import { getAuthHeader } from '../auth';

function errorMessage(error) {
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length) return detail[0].msg;
  if (!error.response) return 'Tidak dapat terhubung ke server. Pastikan backend berjalan.';
  return 'Permintaan gagal. Coba lagi.';
}

const label = { display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', fontWeight: 600 };

export default function ChangePasswordPanel() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setNotice(null);
    if (form.next !== form.confirm) {
      setNotice({ type: 'error', text: 'Konfirmasi kata sandi baru tidak sama.' });
      return;
    }
    setBusy(true);
    try {
      await axios.post(`${API_BASE_URL}/api/auth/change-password`, {
        current_password: form.current, new_password: form.next,
      }, { headers: getAuthHeader() });
      setForm({ current: '', next: '', confirm: '' });
      setNotice({ type: 'ok', text: 'Kata sandi berhasil diubah. Gunakan kata sandi baru saat masuk berikutnya.' });
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bottom-table-card fo-panel" style={{ maxWidth: '520px' }}>
      <div className="table-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <KeyRound size={18} color="var(--teal)" />
        <span>Ubah Kata Sandi</span>
      </div>
      <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
        Kata sandi hanya mengubah akun Anda sendiri. Minimal 8 karakter.
      </p>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <label style={label}>Kata sandi saat ini<input type="password" className="search-box" required autoComplete="current-password" value={form.current} onChange={update('current')} /></label>
        <label style={label}>Kata sandi baru<input type="password" className="search-box" required minLength={8} autoComplete="new-password" value={form.next} onChange={update('next')} /></label>
        <label style={label}>Ulangi kata sandi baru<input type="password" className="search-box" required minLength={8} autoComplete="new-password" value={form.confirm} onChange={update('confirm')} /></label>
        {notice && (
          <p role={notice.type === 'ok' ? 'status' : 'alert'} style={{ fontSize: '0.8rem', color: notice.type === 'ok' ? 'var(--teal)' : '#DC2626', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {notice.type === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {notice.text}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="action-pill-btn primary" disabled={busy}>{busy ? 'Menyimpan...' : 'Ubah Kata Sandi'}</button>
        </div>
      </form>
    </section>
  );
}
