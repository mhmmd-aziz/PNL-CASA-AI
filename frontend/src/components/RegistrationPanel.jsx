import { useState } from 'react';
import axios from 'axios';
import { UserPlus, CheckCircle2, AlertCircle } from 'lucide-react';
import { API_BASE_URL } from '../api.js';
import { getAuthHeader } from '../auth';

const EMPTY_FORM = { fullName: '', birthDate: '', phone: '', email: '' };

function errorMessage(error) {
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length) return detail[0].msg;
  if (!error.response) return 'Tidak dapat terhubung ke server. Pastikan backend berjalan.';
  return 'Pendaftaran gagal. Coba lagi.';
}

const label = { display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', fontWeight: 600 };
const hint = { fontWeight: 400, fontSize: '0.72rem', color: 'var(--text-muted)' };

// Registrasi pasien baru: data pribadi dan akun portal. Jadwal pemeriksaan dibuat dari List Pasien.
export default function RegistrationPanel() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [registered, setRegistered] = useState(null);

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setNotice(null);
    setRegistered(null);
    setSubmitting(true);
    try {
      const { data } = await axios.post(
        `${API_BASE_URL}/api/patients`,
        {
          full_name: form.fullName.trim(),
          birth_date: form.birthDate,
          phone: form.phone.trim() || null,
          email: form.email.trim()
        },
        { headers: getAuthHeader() }
      );
      setRegistered(data);
      setForm(EMPTY_FORM);
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="card-box" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <UserPlus size={20} color="var(--teal)" />
          Registrasi Pasien Baru
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
          Isi data pasien. Nomor rekam medis dan akun portal dibuat otomatis. Jadwal pemeriksaan dibuat dari tab List Pasien.
        </p>
      </div>

      <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        <label style={label}>
          Nama lengkap
          <input className="search-box" value={form.fullName} onChange={update('fullName')} required />
        </label>
        <label style={label}>
          Tanggal lahir
          <input type="date" className="search-box" value={form.birthDate} onChange={update('birthDate')} required />
        </label>
        <label style={label}>
          No. HP
          <input className="search-box" value={form.phone} onChange={update('phone')} />
        </label>
        <label style={label}>
          Email (untuk masuk ke portal)
          <input type="email" className="search-box" value={form.email} onChange={update('email')} required autoComplete="off" />
          <span style={hint}>Kata sandi sementara dibuat otomatis dan ditampilkan setelah disimpan.</span>
        </label>

        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px' }}>
          {notice && (
            <span role="alert" style={{ color: '#DC2626', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px', marginRight: 'auto' }}>
              <AlertCircle size={14} /> {notice.text}
            </span>
          )}
          <button type="submit" className="action-pill-btn primary" disabled={submitting}>
            {submitting ? 'Menyimpan...' : 'Daftarkan Pasien'}
          </button>
        </div>
      </form>

      {registered && (
        <div role="status" style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--teal-subtle)', border: '1px solid var(--teal-light)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.84rem' }}>
            <CheckCircle2 size={22} color="var(--teal)" />
            <span>
              <strong>{registered.full_name}</strong> terdaftar dengan No. RM <strong>{registered.medical_record_number}</strong>.
            </span>
          </div>
          {registered.portal_account && (
            <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'rgba(245, 158, 11, 0.14)', border: '1px solid #F59E0B', fontSize: '0.8rem' }}>
              <strong>Akun portal dibuat.</strong> Serahkan data ini ke pasien. Kata sandi hanya ditampilkan sekali.
              <div style={{ marginTop: '6px' }}>Email: <strong>{registered.portal_account.email}</strong></div>
              <div>Kata sandi sementara: <strong style={{ fontFamily: 'monospace' }}>{registered.portal_account.temporary_password}</strong></div>
            </div>
          )}
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Untuk menjadwalkan pemeriksaan, buka tab <strong>List Pasien</strong> lalu klik <strong>Jadwalkan pemeriksaan</strong>.
          </div>
        </div>
      )}
    </section>
  );
}
