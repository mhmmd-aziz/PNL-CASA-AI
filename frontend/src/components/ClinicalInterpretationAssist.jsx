import { useEffect, useState } from 'react';
import axios from 'axios';
import { ShieldCheck, Sparkles, AlertCircle } from 'lucide-react';
import { API_BASE_URL } from '../api.js';
import { getAuthHeader } from '../auth';

const STATUS_STYLE = {
  below: { label: 'Di bawah acuan', color: '#DC2626' },
  within: { label: 'Dalam acuan', color: 'var(--teal)' },
  unavailable: { label: 'Tidak tersedia', color: 'var(--text-muted)' },
};

function errorMessage(error) {
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (!error.response) return 'Tidak dapat terhubung ke server.';
  return 'Permintaan gagal. Coba lagi.';
}

function formatValue(item) {
  if (item.value == null) return '—';
  return `${item.value.toFixed(2)} ${item.unit}`.trim();
}

// Aturan WHO (otomatis, deterministik) dan draf rekomendasi AI (on-demand). Hasil hanya masuk ke kolom
// interpretasi setelah dokter menerapkannya, dan tetap dapat diubah sebelum disetujui.
export default function ClinicalInterpretationAssist({ examinationId, currentInterpretation, onApply }) {
  const [who, setWho] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiDraft, setAiDraft] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setWho(null);
    setAiDraft(null);
    setNotice(null);
    setLoadError('');
    axios.get(`${API_BASE_URL}/api/review/${examinationId}/interpretation`, { headers: getAuthHeader() })
      .then(({ data }) => { if (!cancelled) setWho(data); })
      .catch((error) => { if (!cancelled) setLoadError(errorMessage(error)); });
    return () => { cancelled = true; };
  }, [examinationId]);

  const confirmReplace = () => !currentInterpretation?.trim() || window.confirm('Ganti isi interpretasi dan rekomendasi yang sudah diketik?');

  const applyWho = () => {
    if (!who || !confirmReplace()) return;
    onApply({
      interpretation: who.summary_text.slice(0, 2000),
      recommendations: who.recommendations.join(' ').slice(0, 2000),
    });
    setNotice({ type: 'ok', text: 'Teks aturan WHO dimasukkan. Anda dapat mengubahnya sebelum menyetujui.' });
  };

  const requestAi = async () => {
    setAiBusy(true);
    setNotice(null);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/api/review/${examinationId}/interpretation/ai`, null, { headers: getAuthHeader() });
      setAiDraft(data);
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error) });
    } finally {
      setAiBusy(false);
    }
  };

  const applyAi = () => {
    if (!aiDraft || !confirmReplace()) return;
    onApply({ interpretation: aiDraft.interpretation.slice(0, 2000), recommendations: (aiDraft.recommendations || '').slice(0, 2000) });
    setNotice({ type: 'ok', text: 'Draf AI dimasukkan. Periksa dan ubah sebelum menyetujui.' });
  };

  if (loadError) return <p role="alert" style={{ color: '#DC2626', fontSize: '0.8rem' }}>{loadError}</p>;
  if (!who) return <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Memuat acuan WHO…</p>;

  return (
    <section aria-label="Interpretasi acuan WHO" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-card-alt)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 700 }}>
        <ShieldCheck size={16} color="var(--teal)" /> Interpretasi acuan WHO
        <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: '0.7rem', color: 'var(--text-muted)' }}>{who.reference_version}</span>
      </div>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{who.reference_note}</p>

      <table className="casa-table" style={{ fontSize: '0.78rem' }}>
        <thead>
          <tr><th>Parameter</th><th>Nilai</th><th>Batas bawah WHO</th><th>Status</th></tr>
        </thead>
        <tbody>
          {who.findings.map((item) => (
            <tr key={item.key}>
              <td>{item.label}{item.caveat && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{item.caveat}</div>}</td>
              <td>{formatValue(item)}</td>
              <td>{item.reference_lower_limit} {item.unit}</td>
              <td style={{ color: STATUS_STYLE[item.status].color, fontWeight: 700 }}>{STATUS_STYLE[item.status].label}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {who.pattern_notes.length > 0 && (
        <div style={{ fontSize: '0.8rem' }}><strong>Pola:</strong> {who.pattern_notes.join(' ')}</div>
      )}
      {who.context_notes.length > 0 && (
        <div style={{ fontSize: '0.8rem' }}>
          <strong>Catatan pra-analitik dan mutu:</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: '18px' }}>
            {who.context_notes.map((note) => (
              <li key={note.text}>{note.text} <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>({note.source})</span></li>
            ))}
          </ul>
        </div>
      )}
      <div style={{ fontSize: '0.8rem' }}>
        <strong>Saran aturan:</strong>
        <ul style={{ margin: '4px 0 0', paddingLeft: '18px' }}>
          {who.recommendations.map((text) => <li key={text}>{text}</li>)}
        </ul>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" className="action-pill-btn primary" onClick={applyWho}>Pakai teks aturan WHO</button>
        {who.ai_configured && (
          <button type="button" className="action-pill-btn secondary" onClick={requestAi} disabled={aiBusy}>
            <Sparkles size={13} /> {aiBusy ? 'Membuat draf AI…' : 'Buat draf rekomendasi AI'}
          </button>
        )}
      </div>
      {!who.ai_configured && (
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Draf AI belum diaktifkan di server. Gunakan teks aturan WHO di atas.</p>
      )}

      {aiDraft && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--teal)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--teal)' }}>
            Draf AI ({aiDraft.model}) — belum diverifikasi · heatmap {aiDraft.heatmap_used ? 'ikut dibaca' : 'tidak tersedia'}
          </div>
          <div style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>{aiDraft.interpretation}</div>
          {aiDraft.recommendations && <div style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}><strong>Rekomendasi:</strong> {aiDraft.recommendations}</div>}
          {aiDraft.patient_summary && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem' }}>
              <strong>Kesimpulan untuk pasien (setelah Anda validasi):</strong>
              <div style={{ whiteSpace: 'pre-wrap' }}>{aiDraft.patient_summary}</div>
              <div><button type="button" className="action-pill-btn secondary" onClick={() => navigator.clipboard?.writeText(aiDraft.patient_summary)}>Salin kesimpulan pasien</button></div>
            </div>
          )}
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{aiDraft.disclaimer}</div>
          <div><button type="button" className="action-pill-btn primary" onClick={applyAi}>Pakai draf AI</button></div>
        </div>
      )}

      {notice && (
        <p role="status" style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px', color: notice.type === 'ok' ? 'var(--teal)' : '#DC2626' }}>
          {notice.type === 'error' && <AlertCircle size={14} />} {notice.text}
        </p>
      )}
      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{who.disclaimer}</p>
    </section>
  );
}
