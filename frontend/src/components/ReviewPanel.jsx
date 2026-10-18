import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Stethoscope, CheckCircle2, AlertCircle, ArrowLeft, HelpCircle, X } from 'lucide-react';
import { API_BASE_URL } from '../api.js';
import { getAuthHeader } from '../auth';
import ClinicalInterpretationAssist from './ClinicalInterpretationAssist';

function errorMessage(error) {
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length) return detail[0].msg;
  if (!error.response) return 'Tidak dapat terhubung ke server. Pastikan backend berjalan.';
  return 'Permintaan gagal. Coba lagi.';
}

const fmt = (value, unit = '') => (value === null || value === undefined ? 'Tidak tersedia' : `${value}${unit}`);
const fmtResult = (value, unit = '') => {
  if (value === null || value === undefined || value === '') return 'Tidak tersedia';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Tidak tersedia';
  return `${number.toLocaleString('id-ID', { maximumFractionDigits: 2 })}${unit}`;
};
const fmtTime = (value) => (value ? new Date(value).toLocaleString('id-ID') : '—');

function InfoTip({ label, text }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (ref.current && !ref.current.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <span className="review-info-tip" ref={ref}>
      <span>{label}</span>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-label={`Penjelasan ${label}`} aria-expanded={open}><HelpCircle size={14} /></button>
      {open && (
        <span className="review-info-popup" role="tooltip">
          <span>{text}</span>
          <button type="button" onClick={() => setOpen(false)} aria-label="Tutup penjelasan"><X size={12} /></button>
        </span>
      )}
    </span>
  );
}

const referenceStatus = (value, minimum) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'Tidak dapat dinilai';
  return Number(value) >= minimum ? 'Dalam rentang acuan' : 'Di bawah rentang acuan';
};
const numeric = (value) => (value === null || value === undefined || value === '' ? Number.NaN : Number(value));

function clinicalPatterns(detail) {
  const analysis = detail.analysis;
  if (!analysis) return { parameters: [], findings: [] };
  const summary = analysis.summary || {};
  const quality = analysis.quality || {};
  const concentration = numeric(summary.estimated_concentration);
  const volume = numeric(detail.macroscopic.volume_ml);
  const pr = numeric(analysis.pr_percentage);
  const np = numeric(analysis.np_percentage);
  const totalMotility = Number.isFinite(pr) && Number.isFinite(np) ? pr + np : null;
  const totalCount = Number.isFinite(concentration) && Number.isFinite(volume) ? concentration * volume : null;
  const trackingRate = numeric(quality.tracking_assignment_percent);
  const trackingInsufficient = summary.motility_available === false || (Number.isFinite(trackingRate) && trackingRate < 70);
  const lowConcentration = Number.isFinite(concentration) && concentration < 16;
  const lowProgressive = Number.isFinite(pr) && pr < 30;
  const lowTotalMotility = totalMotility !== null && totalMotility < 42;
  const findings = [];
  if (lowConcentration && (lowProgressive || lowTotalMotility)) findings.push('Pola kombinasi konsentrasi dan motilitas rendah');
  else {
    if (lowConcentration) findings.push('Pola konsentrasi rendah');
    if (lowProgressive || lowTotalMotility) findings.push('Pola motilitas progresif rendah');
  }
  if (Number.isFinite(np) && Number.isFinite(pr) && np > pr) findings.push('Dominan lintasan tidak progresif');
  if (trackingInsufficient) findings.push('Kualitas analisis tidak mencukupi');
  if (!findings.length) findings.push('Tidak ditemukan pola konsentrasi atau motilitas di bawah rentang acuan');
  return {
    parameters: [
      { label: 'Konsentrasi', value: Number.isFinite(concentration) ? `${concentration.toFixed(2)} juta/mL` : 'Tidak tersedia', status: referenceStatus(concentration, 16) },
      { label: 'Jumlah total', value: totalCount === null ? 'Tidak tersedia' : `${totalCount.toFixed(2)} juta/ejakulat`, status: referenceStatus(totalCount, 39) },
      { label: 'Motilitas progresif', value: Number.isFinite(pr) ? `${pr.toFixed(1)}%` : 'Tidak tersedia', status: referenceStatus(pr, 30) },
      { label: 'Motilitas total', value: totalMotility === null ? 'Tidak tersedia' : `${totalMotility.toFixed(1)}%`, status: referenceStatus(totalMotility, 42) },
    ], findings,
  };
}

function SignatureCanvas({ value, onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = 150 * ratio;
    const context = canvas.getContext('2d');
    context.scale(ratio, ratio);
    Object.assign(context, { lineWidth: 2, lineCap: 'round', lineJoin: 'round', strokeStyle: '#111827' });
  }, []);
  const point = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const start = (event) => {
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = point(event);
    const context = event.currentTarget.getContext('2d');
    context.beginPath(); context.moveTo(p.x, p.y);
  };
  const move = (event) => {
    if (!drawing.current) return;
    const p = point(event);
    const context = event.currentTarget.getContext('2d');
    context.lineTo(p.x, p.y); context.stroke();
  };
  const finish = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const source = canvasRef.current;
    const context = source.getContext('2d');
    const pixels = context.getImageData(0, 0, source.width, source.height);
    let left = source.width; let top = source.height; let right = -1; let bottom = -1;
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        if (pixels.data[(y * source.width + x) * 4 + 3] > 20) {
          left = Math.min(left, x); right = Math.max(right, x);
          top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
      }
    }
    if (right < left || bottom < top) return;
    const padding = Math.max(16, Math.round((right - left) * 0.08));
    const cropLeft = Math.max(0, left - padding);
    const cropTop = Math.max(0, top - padding);
    const cropRight = Math.min(source.width, right + padding);
    const cropBottom = Math.min(source.height, bottom + padding);
    const cropped = document.createElement('canvas');
    cropped.width = cropRight - cropLeft;
    cropped.height = cropBottom - cropTop;
    cropped.getContext('2d').drawImage(source, cropLeft, cropTop, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
    onChange(cropped.toDataURL('image/png'));
  };
  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    onChange('');
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <canvas ref={canvasRef} aria-label="Canvas tanda tangan dokter" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} style={{ width: '100%', height: '150px', background: '#fff', border: `1px solid ${value ? 'var(--teal)' : 'var(--border-subtle)'}`, borderRadius: '10px', cursor: 'crosshair', touchAction: 'none' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        <span>Gambar tanda tangan menggunakan mouse atau layar sentuh.</span>
        <button type="button" className="action-pill-btn secondary" onClick={clear}>Hapus</button>
      </div>
    </div>
  );
}

export default function ReviewPanel() {
  const [queue, setQueue] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [interpretation, setInterpretation] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [sign, setSign] = useState(false);
  const [signature, setSignature] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [mediaTab, setMediaTab] = useState('video');
  const [mediaError, setMediaError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const loadQueue = async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/review/queue`, { headers: getAuthHeader() });
      setQueue(data);
      setLoadError('');
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const openDetail = async (id) => {
    setNotice(null);
    setSelectedId(id);
    setInterpretation('');
    setRecommendations('');
    setSign(false);
    setSignature('');
    setReturnReason('');
    setMediaTab('video');
    setMediaError('');
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/review/${id}`, { headers: getAuthHeader() });
      setDetail(data);
      setMediaTab(data.analysis?.video_url ? 'video' : 'heatmap');
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error) });
    }
  };

  const close = () => {
    setSelectedId(null);
    setDetail(null);
    setNotice(null);
    loadQueue();
  };

  const approve = async (event) => {
    event.preventDefault();
    setNotice(null);
    if (interpretation.trim().length < 10) {
      setNotice({ type: 'error', text: 'Interpretasi klinis wajib diisi minimal 10 karakter.' });
      return;
    }
    if (!signature) {
      setNotice({ type: 'error', text: 'Gambar tanda tangan dokter pada canvas terlebih dahulu.' });
      return;
    }
    if (!sign) {
      setNotice({ type: 'error', text: 'Centang pernyataan persetujuan dan pengesahan tanda tangan.' });
      return;
    }
    setBusy(true);
    try {
      const { data } = await axios.post(
        `${API_BASE_URL}/api/review/${selectedId}/approve`,
        { clinical_interpretation: interpretation, recommendations: recommendations || null, sign, signature_png: signature },
        { headers: getAuthHeader() }
      );
      setNotice({ type: 'ok', text: `Disetujui dan ditandatangani. Nomor laporan: ${data.report_number}` });
      setDetail(null);
      setSelectedId(null);
      loadQueue();
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const giveBack = async () => {
    setNotice(null);
    setBusy(true);
    try {
      await axios.post(`${API_BASE_URL}/api/review/${selectedId}/return`, { reason: returnReason }, { headers: getAuthHeader() });
      setNotice({ type: 'ok', text: 'Sampel dikembalikan ke analis untuk diperbaiki.' });
      setDetail(null);
      setSelectedId(null);
      loadQueue();
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const label = { display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', fontWeight: 600 };

  if (selectedId && detail) {
    const a = detail.analysis;
    const patterns = clinicalPatterns(detail);
    return (
      <section className="card-box" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button type="button" className="action-pill-btn secondary" onClick={close}>
            <ArrowLeft size={14} /> Kembali ke antrean
          </button>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{detail.sample_code}</span>
        </div>

        <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>
          {detail.patient.full_name} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>• {detail.patient.medical_record_number}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', fontSize: '0.8rem' }}>
          <div><strong>Pengambilan:</strong> {fmtTime(detail.collection_datetime)}</div>
          <div><strong>Masa pantang:</strong> {fmt(detail.abstinence_duration_hours, ' jam')}</div>
          <div><strong>Volume:</strong> {fmt(detail.macroscopic.volume_ml, ' mL')}</div>
          <div><strong>Likuefaksi:</strong> {fmt(detail.macroscopic.liquefaction_time_min, ' menit')}</div>
          <div><strong>Viskositas:</strong> {fmt(detail.macroscopic.viscosity)}</div>
          <div><strong>pH:</strong> {fmt(detail.macroscopic.ph_value)}</div>
          <div><strong>Warna:</strong> {fmt(detail.macroscopic.appearance)}</div>
          <div><strong>Catatan:</strong> {fmt(detail.macroscopic.notes)}</div>
        </div>

        {a ? (
          <div style={{ padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-card-alt)', fontSize: '0.8rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '8px' }}>Hasil analisis terakhir ({fmtTime(a.completed_at)})</div>
            {(a.video_url || a.heatmap_url) && (
              <div style={{ marginBottom: '14px' }}>
                <div className="center-nav-pill" style={{ padding: '2px', width: 'fit-content', marginBottom: '8px' }}>
                  {a.video_url && (
                    <button type="button" className={`nav-tab-btn ${mediaTab === 'video' ? 'active' : ''}`} onClick={() => { setMediaTab('video'); setMediaError(''); }}>
                      Video Analisis
                    </button>
                  )}
                  {a.heatmap_url && (
                    <button type="button" className={`nav-tab-btn ${mediaTab === 'heatmap' ? 'active' : ''}`} onClick={() => { setMediaTab('heatmap'); setMediaError(''); }}>
                      Heatmap
                    </button>
                  )}
                </div>
                <div style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', background: '#000' }}>
                  {mediaTab === 'heatmap' && a.heatmap_url ? (
                    <img src={`${API_BASE_URL}${a.heatmap_url}`} alt="Heatmap hasil analisis" onError={() => setMediaError('Heatmap tidak dapat dimuat. Muat ulang halaman untuk memperbarui tautan.')} style={{ width: '100%', maxHeight: '420px', objectFit: 'contain', display: 'block' }} />
                  ) : a.video_url ? (
                    <video src={`${API_BASE_URL}${a.video_url}`} controls preload="metadata" onError={() => setMediaError('Video tidak dapat dimuat. Muat ulang halaman untuk memperbarui tautan.')} style={{ width: '100%', maxHeight: '420px', display: 'block' }} />
                  ) : (
                    <div style={{ padding: '16px', color: 'var(--text-muted)' }}>Video analisis tidak tersedia.</div>
                  )}
                </div>
                {mediaError &&<p role="alert" style={{ color: '#DC2626', marginBottom: 0 }}>{mediaError}</p>}
              </div>
            )}
            {!a.video_url && !a.heatmap_url && <p style={{ color: 'var(--text-muted)' }}>Preview video dan heatmap tidak tersedia untuk analisis ini.</p>}
            {a.manual_correction && <p role="status">Koreksi manual revisi {a.manual_correction.revision} oleh analis #{a.manual_correction.actor_id}; {a.manual_correction.changed_frames.length} frame. Alasan: {a.manual_correction.reason}. Hasil AI asli tersimpan terpisah.</p>}
            <div className="review-result-summary">
              <div className="review-result-heading">Parameter motilitas dan pergerakan</div>
              <div className="review-result-grid">
                <div className="review-result-metric metric-pr">
                  <span>Motilitas progresif (PR)</span>
                  <strong>{fmtResult(a.pr_percentage, '%')}</strong>
                </div>
                <div className="review-result-metric metric-np">
                  <span>Motilitas non-progresif (NP)</span>
                  <strong>{fmtResult(a.np_percentage, '%')}</strong>
                </div>
                <div className="review-result-metric metric-im">
                  <span>Immotil (IM)</span>
                  <strong>{fmtResult(a.im_percentage, '%')}</strong>
                </div>
                <div className="review-result-metric metric-speed">
                  <span>Kecepatan rata-rata</span>
                  <strong>{fmtResult(a.avg_speed_um_s, ' µm/s')}</strong>
                </div>
                <div className="review-result-metric metric-linearity">
                  <span>Linearitas</span>
                  <strong>{fmtResult(a.avg_linearity)}</strong>
                </div>
                <div className="review-result-metric metric-count">
                  <span>Jumlah sel (median)</span>
                  <strong>{fmtResult(a.summary?.total_sperm)}</strong>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: '0.8rem', color: '#DC2626' }}>Tidak ada hasil analisis yang selesai untuk sampel ini.</p>
        )}

        {a && (
          <section style={{ padding: '14px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div style={{ fontWeight: 800, marginBottom: '3px' }}>Ringkasan Pola Temuan</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Acuan distribusi WHO 2021; bukan penetapan subur atau tidak subur.</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '10px' }}>
              {patterns.parameters.map((parameter) => (
                <div key={parameter.label} style={{ padding: '10px', borderRadius: '10px', background: 'var(--bg-card-alt)', fontSize: '0.76rem' }}>
                  <div style={{ color: 'var(--text-muted)' }}>{parameter.label}</div>
                  <strong style={{ display: 'block', fontSize: '0.88rem', margin: '3px 0' }}>{parameter.value}</strong>
                  <span style={{ color: parameter.status === 'Dalam rentang acuan' ? 'var(--teal)' : parameter.status === 'Di bawah rentang acuan' ? '#D97706' : 'var(--text-muted)', fontWeight: 700 }}>{parameter.status}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '0.8rem' }}>
              <strong>Temuan berbantuan AI:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: '20px' }}>{patterns.findings.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          </section>
        )}

        {notice && (
          <p role="alert" style={{ fontSize: '0.8rem', color: notice.type === 'ok' ? 'var(--teal)' : '#DC2626', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {notice.type === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {notice.text}
          </p>
        )}

        <ClinicalInterpretationAssist
          examinationId={selectedId}
          currentInterpretation={interpretation}
          onApply={({ interpretation: nextInterpretation, recommendations: nextRecommendations }) => {
            setInterpretation(nextInterpretation);
            setRecommendations(nextRecommendations);
          }}
        />
        <form onSubmit={approve} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={label}>
            <InfoTip
              label="Interpretasi klinis"
              text="Kesimpulan profesional dokter setelah menghubungkan hasil makroskopis, parameter AI, video/heatmap, mutu pemeriksaan, dan kondisi klinis pasien. Tuliskan arti temuan serta keterbatasannya; jangan hanya menyalin angka atau menetapkan subur/tidak subur dari satu pemeriksaan."
            />
            <textarea aria-label="Interpretasi klinis" className="search-box review-textarea" rows={3} maxLength={2000} value={interpretation} onChange={(e) => setInterpretation(e.target.value)} />
          </div>
          <div style={label}>
            <label htmlFor="review-recommendations">Rekomendasi (opsional)</label>
            <textarea
              id="review-recommendations"
              name="recommendations"
              className="search-box review-textarea"
              rows={2}
              maxLength={2000}
              placeholder="Tuliskan rekomendasi untuk pasien bila diperlukan"
              value={recommendations}
              onChange={(event) => setRecommendations(event.target.value)}
            />
          </div>
          <div style={label}>
            Tanda tangan dokter
            <SignatureCanvas value={signature} onChange={setSignature} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
            <input type="checkbox" checked={sign} onChange={(e) => setSign(e.target.checked)} />
            Saya telah meninjau hasil, menyetujui laporan, dan mengesahkan tanda tangan di atas.
          </label>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            Kelengkapan: interpretasi {interpretation.trim().length >= 10 ? '✓' : 'belum'} · tanda tangan {signature ? '✓' : 'belum'} · pengesahan {sign ? '✓' : 'belum'}
          </div>
          {notice && (
            <p role="alert" style={{ margin: 0, fontSize: '0.8rem', color: notice.type === 'ok' ? 'var(--teal)' : '#DC2626', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {notice.type === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {notice.text}
            </p>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="action-pill-btn primary" disabled={busy || !a}>
              {busy ? 'Menyimpan...' : 'Setujui & Tanda Tangan'}
            </button>
          </div>
        </form>

        <div style={{ borderTop: '1px dashed var(--border-subtle)', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={label}>
            <label htmlFor="review-return-reason">Kembalikan ke analis (alasan wajib, minimal 10 karakter)</label>
            <textarea id="review-return-reason" className="search-box review-textarea" rows={2} maxLength={500} value={returnReason} onChange={(e) => setReturnReason(e.target.value)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="action-pill-btn secondary" disabled={busy || returnReason.trim().length < 10} onClick={giveBack}>
              Kembalikan untuk Diperbaiki
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bottom-table-card">
      <div className="table-header-row">
        <div>
          <div className="table-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Stethoscope size={18} color="var(--teal)" />
            <span>Antrean Tinjauan Dokter</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            Sampel yang dikirim analis dan menunggu interpretasi serta tanda tangan Anda.
          </div>
        </div>
      </div>

      {loadError && <p role="alert" style={{ color: '#DC2626', fontSize: '0.8rem' }}>{loadError}</p>}
      {notice && (
        <p role="status" style={{ fontSize: '0.8rem', color: notice.type === 'ok' ? 'var(--teal)' : '#DC2626' }}>{notice.text}</p>
      )}

      <div className="casa-table-wrap">
        <table className="casa-table">
          <thead>
            <tr>
              <th>Kode Sampel</th>
              <th>Pasien</th>
              <th>No. RM</th>
              <th>Pengambilan</th>
              <th style={{ textAlign: 'right' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {queue.length === 0 && <tr><td colSpan={5}>Tidak ada sampel yang menunggu tinjauan.</td></tr>}
            {queue.map((item) => (
              <tr key={item.id}>
                <td className="sample-id-cell">{item.sample_code}</td>
                <td>{item.patient_name}</td>
                <td>{item.medical_record_number}</td>
                <td>{fmtTime(item.collection_datetime)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button type="button" className="action-pill-btn primary" onClick={() => openDetail(item.id)}>Tinjau</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
