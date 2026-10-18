import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { FlaskConical, CheckCircle2, AlertCircle, Send, HelpCircle, X } from 'lucide-react';
import { API_BASE_URL } from '../api.js';
import { getAuthHeader, getSession } from '../auth';

// Popup info saat ikon ? diklik — muncul sebagai floating card
function FieldLabel({ text, tip }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Tutup jika klik di luar popup
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '5px', position: 'relative' }} ref={ref}>
      {text}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', background: 'none', border: 'none',
          padding: 0, cursor: 'pointer', color: open ? 'var(--teal)' : 'var(--text-muted)',
          transition: 'color 0.15s', flexShrink: 0,
        }}
        aria-label={`Info tentang ${text}`}
      >
        <HelpCircle size={14} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 9999,
          background: 'var(--bg-card, #1a1a2e)', border: '1px solid var(--teal)',
          borderRadius: '10px', padding: '12px 14px', width: '260px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
          fontSize: '0.74rem', lineHeight: 1.55, color: 'var(--text-secondary)',
          animation: 'fadeInUp 0.15s ease',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
            <span style={{ fontWeight: 700, color: 'var(--teal)', fontSize: '0.78rem' }}>{text}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)', marginLeft: '8px', flexShrink: 0 }}
            >
              <X size={12} />
            </button>
          </div>
          {tip}
        </div>
      )}
    </span>
  );
}

const VISCOSITY_OPTIONS = [
  { value: 'NORMAL', label: 'Normal' },
  { value: 'INCREASED', label: 'Meningkat' },
  { value: 'DECREASED', label: 'Menurun' }
];



function errorMessage(error) {
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length) return detail[0].msg;
  if (!error.response) return 'Tidak dapat terhubung ke server. Pastikan backend berjalan.';
  return 'Permintaan gagal. Coba lagi.';
}

// Isian makroskopis sesuai nilai di database; kosong berarti belum diisi
function toForm(item) {
  return {
    volume_ml: item.volume_ml ?? '',
    liquefaction_time_min: item.liquefaction_time_min ?? '',
    viscosity: item.viscosity ?? '',
    ph_value: item.ph_value ?? '',
    appearance: item.appearance ?? '',
    macroscopic_notes: item.macroscopic_notes ?? ''
  };
}

// Pilihan sampel yang sedang diproses analis; hanya sampel yang sudah ada data makroskopis (volume_ml)
export function LinkedSampleSelect({ value, onChange, disabled = false }) {
  const myId = getSession()?.user?.id;
  const [allOptions, setAllOptions] = useState([]);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/examinations`, { headers: getAuthHeader() })
      .then(({ data }) => setAllOptions(data.filter((item) => item.status === 'IN_PROGRESS' && item.current_analyst_id === myId)))
      .catch(() => setAllOptions([]));
  }, [myId]);

  // Hanya tampilkan sampel yang sudah punya data makroskopis (volume_ml tidak null)
  const options = allOptions.filter((item) => item.volume_ml != null);
  // Sampel yang sudah diterima tapi belum diisi makroskopis
  const pendingMacro = allOptions.filter((item) => item.volume_ml == null);

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', fontWeight: 600, marginBottom: '14px' }}>
      Kaitkan hasil ke sampel (opsional, untuk video)
      <select className="search-box" value={value ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}>
        <option value="">— tanpa sampel (hanya tampilan) —</option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>{item.sample_code} • {item.patient_name}</option>
        ))}
      </select>
      {pendingMacro.length > 0 && (
        <span style={{ fontWeight: 400, fontSize: '0.72rem', color: '#D97706', display: 'flex', alignItems: 'center', gap: '4px' }}>
          ⚠ {pendingMacro.length} sampel ({pendingMacro.map(i => i.sample_code).join(', ')}) belum bisa dikaitkan — isi data makroskopis di tab <strong>Hasil Analisis</strong> terlebih dahulu.
        </span>
      )}
      {pendingMacro.length === 0 && (
        <span style={{ fontWeight: 400, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Sampel harus sudah diterima dan data makroskopisnya terisi. Hasil yang dikaitkan tersimpan ke pemeriksaan.
        </span>
      )}
    </label>
  );
}

const LEFT_ANALYST_QUEUE = ['PENDING_REVIEW', 'APPROVED', 'RELEASED'];

export default function SampleQueuePanel({ onAnalyze, locked = false }) {
  const myId = getSession()?.user?.id;
  const [items, setItems] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  // Sampel yang sudah dikirim ke dokter, disetujui, atau dirilis tidak lagi menjadi tugas analis
  const queueItems = items.filter((item) => !LEFT_ANALYST_QUEUE.includes(item.status));

  const loadList = async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/examinations`, { headers: getAuthHeader() });
      setItems(data);
      setLoadError('');
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  };

  useEffect(() => {
    loadList();
  }, []);

  const receive = async (item) => {
    setNotice(null);
    setBusy(true);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/api/examinations/${item.id}/receive`, null, { headers: getAuthHeader() });
      setNotice({ type: 'ok', text: `Sampel ${item.sample_code} diterima.` });
      setOpenId(item.id);
      setForm(toForm(data));
      await loadList();
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const open = (item) => {
    setNotice(null);
    setOpenId(item.id);
    setForm(toForm(item));
  };

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const save = async (event) => {
    event.preventDefault();
    setNotice(null);
    const volume = form.volume_ml === '' ? null : Number(form.volume_ml);
    const ph = form.ph_value === '' ? null : Number(form.ph_value);
    if (volume === null || !(volume > 0 && volume <= 20)) {
      setNotice({ type: 'error', text: 'Volume wajib diisi, lebih dari 0 dan maksimal 20 mL.' });
      return;
    }
    if (ph !== null && !(ph >= 0 && ph <= 14)) {
      setNotice({ type: 'error', text: 'pH harus di antara 0 dan 14.' });
      return;
    }
    const payload = {
      volume_ml: form.volume_ml === '' ? null : Number(form.volume_ml),
      liquefaction_time_min: form.liquefaction_time_min === '' ? null : Number(form.liquefaction_time_min),
      viscosity: form.viscosity || null,
      ph_value: form.ph_value === '' ? null : Number(form.ph_value),
      appearance: form.appearance.trim() || null,
      macroscopic_notes: form.macroscopic_notes.trim() || null
    };
    setBusy(true);
    try {
      await axios.put(`${API_BASE_URL}/api/examinations/${openId}/macroscopic`, payload, { headers: getAuthHeader() });
      setNotice({ type: 'ok', text: 'Data makroskopis tersimpan.' });
      await loadList();
      setOpenId(null);
      setForm(null);
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const fieldStyle = { display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', fontWeight: 600 };
  const openItem = items.find((item) => item.id === openId);

  const submit = async (item) => {
    setNotice(null);
    setBusy(true);
    try {
      await axios.post(`${API_BASE_URL}/api/examinations/${item.id}/submit`, null, { headers: getAuthHeader() });
      setNotice({ type: 'ok', text: `Sampel ${item.sample_code} dikirim ke dokter.` });
      setOpenId(null);
      setForm(null);
      await loadList();
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bottom-table-card fo-panel" style={{ marginBottom: '20px' }}>
      <div className="table-header-row">
        <div>
          <div className="table-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FlaskConical size={18} color="var(--teal)" />
            <span>Antrean Sampel</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            Terima sampel dari Front Office, lalu isi data makroskopisnya.
          </div>
        </div>
      </div>

      {loadError && <p role="alert" style={{ color: '#DC2626', fontSize: '0.8rem' }}>{loadError}</p>}
      {notice && (
        <p role="status" style={{ fontSize: '0.8rem', color: notice.type === 'ok' ? 'var(--teal)' : '#DC2626', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {notice.type === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {notice.text}
        </p>
      )}

      <div className="casa-table-wrap">
        <table className="casa-table">
          <thead>
            <tr>
              <th>Kode Sampel</th>
              <th>Pasien</th>
              <th>Pengambilan</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {queueItems.length === 0 && <tr><td colSpan={5}>Belum ada sampel di antrean.</td></tr>}
            {queueItems.map((item) => {
              const mine = item.current_analyst_id === myId;
              const macroscopicDone = item.volume_ml != null;
              const analysisDone = item.has_completed_analysis === true;
              let workflowStatus = item.status_label;
              if (item.status === 'IN_PROGRESS' && mine) {
                if (!macroscopicDone) workflowStatus = 'Menunggu makroskopis';
                else if (!analysisDone) workflowStatus = 'Menunggu analisis';
                else workflowStatus = 'Siap dikirim ke dokter';
              } else if (item.status === 'PENDING_REVIEW') {
                workflowStatus = 'Menunggu review dokter';
              }
              return (
                <tr key={item.id}>
                  <td className="sample-id-cell">{item.sample_code}</td>
                  <td>{item.patient_name}<div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.medical_record_number}</div></td>
                  <td>{item.collection_datetime ? new Date(item.collection_datetime).toLocaleString('id-ID') : '—'}</td>
                  <td>{workflowStatus}</td>
                  <td>
                    {(item.status === 'REGISTERED' || (item.status === 'IN_PROGRESS' && !item.current_analyst_id)) && (
                      <button type="button" className="action-pill-btn primary" disabled={busy} onClick={() => receive(item)}>
                        {item.status === 'REGISTERED' ? 'Terima Sampel' : 'Ambil untuk Analisis'}
                      </button>
                    )}
                    {item.status === 'IN_PROGRESS' && mine && (
                      <div className="sample-actions">
                        {!macroscopicDone && (
                          <button type="button" className="action-pill-btn secondary" onClick={() => open(item)}>
                            Isi Makroskopis
                          </button>
                        )}
                        {macroscopicDone && !analysisDone && (
                          <button type="button" className="action-pill-btn primary" onClick={() => onAnalyze?.(item)}>
                            Analisis
                          </button>
                        )}
                        {macroscopicDone && analysisDone && (
                          <button type="button" className="action-pill-btn secondary wide" disabled={busy || locked} title={locked ? 'Tunggu hitung ulang koreksi selesai' : undefined} onClick={() => submit(item)}>
                            <Send size={12} /> Kirim ke Dokter
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openItem && form && openItem.status === 'IN_PROGRESS' && (
        <div className="modal-backdrop" onClick={() => { if (!busy) { setOpenId(null); setForm(null); } }}>
          <div className="modal-content-panel macroscopic-modal" role="dialog" aria-modal="true" aria-label={`Data makroskopis ${openItem.sample_code}`} onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Data Makroskopis</h3>
                <span className="sample-id-cell" style={{ fontSize: '0.76rem' }}>{openItem.sample_code} • {openItem.patient_name}</span>
              </div>
              <button type="button" className="modal-close-btn" disabled={busy} onClick={() => { setOpenId(null); setForm(null); }} aria-label="Tutup"><X size={18} /></button>
            </div>
            <form onSubmit={save} className="macroscopic-form">
              <div className="macroscopic-form-intro">
                Isi hasil pemeriksaan fisik sampel sebelum menjalankan analisis video.
              </div>
              <label style={fieldStyle}>
                <FieldLabel
                  text="Volume (mL)"
                  tip="Diukur manual menggunakan pipet atau tabung berskala segera setelah sampel cair (likuefaksi). Normal: ≥1.4 mL (WHO 2021). Wajib diisi — digunakan untuk menghitung estimasi konsentrasi sperma total."
                />
                <input type="number" step="any" min="0" max="20" className="search-box" value={form.volume_ml} onChange={update('volume_ml')} />
              </label>
              <label style={fieldStyle}>
                <FieldLabel
                  text="Waktu likuefaksi (menit)"
                  tip="Diukur dengan stopwatch: catat berapa menit sejak ejakulasi hingga sampel benar-benar mencair dan tidak menggumpal. Normal: ≤60 menit. Jika >60 menit dianggap tidak likuefaksi sempurna."
                />
                <input type="number" min="0" max="180" className="search-box" value={form.liquefaction_time_min} onChange={update('liquefaction_time_min')} />
              </label>
              <label style={fieldStyle}>
                <FieldLabel
                  text="Viskositas"
                  tip="Dinilai visual/fisik: angkat sedikit sampel dengan pipet lalu biarkan tetes jatuh. Normal: tetes putus dalam ≤2 cm. Meningkat = tetes memanjang >2 cm atau seperti gel. Menurun = terlalu encer."
                />
                <select className="search-box" value={form.viscosity} onChange={update('viscosity')}>
                  <option value="">— pilih —</option>
                  {VISCOSITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label style={fieldStyle}>
                <FieldLabel
                  text="pH"
                  tip="Diukur menggunakan kertas lakmus / pH meter khusus semen. Celupkan ke sampel, baca hasilnya. Normal: 7.2–8.0 (WHO 2021). pH <7.0 bisa indikasi obstruksi. Ukur dalam 30 menit setelah likuefaksi."
                />
                <input type="number" step="any" min="0" max="14" className="search-box" value={form.ph_value} onChange={update('ph_value')} />
              </label>
              <label style={fieldStyle}>
                <FieldLabel
                  text="Warna / penampilan"
                  tip="Observasi visual langsung oleh analis. Normal: putih keabuan atau putih susu, opak, homogen. Tulis apa yang terlihat, contoh: 'putih keruh', 'kuning', 'kemerahan (ada darah)', 'transparan/encer'."
                />
                <input className="search-box" maxLength={100} value={form.appearance} onChange={update('appearance')} />
              </label>
              <label style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
                <FieldLabel
                  text="Catatan"
                  tip="Keterangan tambahan yang relevan secara klinis: kondisi sampel saat diterima, ketidaknormalan yang diamati, catatan pengumpulan, atau hal lain yang perlu diketahui dokter saat mereview hasil."
                />
                <textarea className="search-box" rows={3} maxLength={1000} value={form.macroscopic_notes} onChange={update('macroscopic_notes')} />
              </label>
              <div className="macroscopic-form-actions">
                {notice && (
                  <span role="status" style={{ marginRight: 'auto', fontSize: '0.8rem', fontWeight: 600, color: notice.type === 'ok' ? 'var(--teal)' : '#DC2626', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    {notice.type === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {notice.text}
                  </span>
                )}
                <button type="button" className="action-pill-btn secondary" disabled={busy} onClick={() => { setOpenId(null); setForm(null); }}>Batal</button>
                <button type="submit" className="action-pill-btn primary" disabled={busy}>
                  {busy ? 'Menyimpan...' : 'Simpan Data Makroskopis'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
