import { useEffect, useState } from 'react';
import axios from 'axios';
import { ListOrdered, CalendarClock, UserCircle } from 'lucide-react';
import { API_BASE_URL } from '../api.js';
import { getAuthHeader } from '../auth';
import { SampleBarcode } from './SampleLabel';

function errorMessage(error) {
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (!error.response) return 'Tidak dapat terhubung ke server. Pastikan backend berjalan.';
  return 'Permintaan gagal. Coba lagi.';
}

const GENDER_TEXT = { MALE: 'Laki-laki', FEMALE: 'Perempuan', OTHER: 'Lainnya' };
const fmtDate = (value) => (value ? new Date(`${value}T12:00:00+07:00`).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—');
const fmtSchedule = (value) => (value ? new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

function Field({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: '0.86rem', fontWeight: 600 }}>{value || '—'}</div>
    </div>
  );
}

export default function PatientQueuePanel() {
  const [profile, setProfile] = useState(null);
  const [items, setItems] = useState([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/examinations/mine`, { headers: getAuthHeader() })
      .then(({ data }) => {
        setProfile(data.profile);
        setItems(data.items);
        setLoadError('');
      })
      .catch((error) => setLoadError(errorMessage(error)));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <section className="card-box" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <UserCircle size={20} color="var(--teal)" /> Data Pribadi
        </h3>
        {profile ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
            <Field label="Nama lengkap" value={profile.full_name} />
            <Field label="No. Rekam Medis" value={profile.medical_record_number} />
            <Field label="Tanggal lahir" value={fmtDate(profile.date_of_birth)} />
            <Field label="Jenis kelamin" value={GENDER_TEXT[profile.gender]} />
            <Field label="No. HP" value={profile.phone_number} />
            <Field label="Email" value={profile.email} />
          </div>
        ) : (
          !loadError && <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>Data pribadi belum tersedia.</p>
        )}
        {loadError && <p role="alert" style={{ color: '#DC2626', fontSize: '0.8rem' }}>{loadError}</p>}
      </section>

      <section className="bottom-table-card">
        <div className="table-header-row">
          <div className="table-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ListOrdered size={18} color="var(--teal)" />
            <span>Jadwal dan Status Pemeriksaan</span>
          </div>
        </div>

        {items.length === 0 && !loadError && (
          <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
            Belum ada pemeriksaan terjadwal untuk Anda. Tanyakan jadwal kepada petugas Front Office.
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '14px' }}>
          {items.map((item) => (
            <article key={item.id} className="card-box" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Nomor antrean</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--teal)', lineHeight: 1.1 }}>{item.queue_number || '—'}</div>
                </div>
                <span className="badge-pro" style={{ background: 'var(--teal-subtle)', color: 'var(--teal)' }}>{item.status_label}</span>
              </div>

              <div style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CalendarClock size={14} /> {fmtSchedule(item.scheduled_at)}
              </div>

              <div style={{ fontSize: '0.8rem' }}>
                <strong>Pantang makan/minum:</strong>{' '}
                {item.abstinence_duration_hours != null ? `${item.abstinence_duration_hours} jam` : 'Tidak ada catatan'}
                {item.ready_at && <div style={{ color: 'var(--text-muted)', marginTop: '4px' }}>Siap diperiksa mulai {fmtSchedule(item.ready_at)}</div>}
              </div>

              <SampleBarcode value={item.sample_code} height={36} />
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
