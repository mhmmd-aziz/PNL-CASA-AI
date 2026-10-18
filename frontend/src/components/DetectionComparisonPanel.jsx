import { useState, useEffect } from 'react';
import { Eye, AlertCircle } from 'lucide-react';

/**
 * Panel untuk dokter review: bandingkan deteksi AI awal vs koreksi analyst
 *
 * Props:
 * - examination: examination data
 * - analysisRun: analysis_run data dengan tracking_data
 * - corrections: list koreksi yang sudah accepted
 */
export default function DetectionComparisonPanel({ _examination, analysisRun, corrections }) {
  const [showOriginal, setShowOriginal] = useState(true);
  const [showCorrected, setShowCorrected] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!analysisRun || !corrections) {
      setLoadError('Data tidak lengkap untuk tampilan perbandingan.');
    }
  }, [analysisRun, corrections]);

  if (loadError) {
    return (
      <div style={{ padding: '16px', color: '#dc2626', fontSize: '0.8rem', display: 'flex', gap: '6px', alignItems: 'center' }}>
        <AlertCircle size={14} /> {loadError}
      </div>
    );
  }

  // Calculate statistics
  const originalDetectionCount = analysisRun?.raw_detections_count || 0;
  const correctionSummary = {
    deleted: corrections.filter((c) => c.correction_type === 'DELETE').length,
    added: corrections.filter((c) => c.correction_type === 'ADD').length,
    moved: corrections.filter((c) => c.correction_type === 'MOVE').length,
  };
  const correctedDetectionCount = originalDetectionCount - correctionSummary.deleted + correctionSummary.added;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', background: 'var(--bg-card)' }}>
      <div style={{ fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Eye size={16} color="var(--teal)" /> Perbandingan Deteksi: AI vs Koreksi Analyst
      </div>

      {/* Toggle visibility */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showOriginal}
            onChange={(e) => setShowOriginal(e.target.checked)}
          />
          Deteksi AI awal
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showCorrected}
            onChange={(e) => setShowCorrected(e.target.checked)}
          />
          Hasil koreksi analyst
        </label>
      </div>

      {/* Comparison stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
        {showOriginal && (
          <div style={{ padding: '12px', background: 'var(--bg-card-alt)', borderRadius: '8px', border: '1px solid rgba(220, 38, 38, 0.2)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Deteksi AI</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#dc2626' }}>{originalDetectionCount}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>deteksi awal</div>
          </div>
        )}

        {correctionSummary.deleted > 0 && (
          <div style={{ padding: '12px', background: 'var(--bg-card-alt)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Dihapus</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ef4444' }}>-{correctionSummary.deleted}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>false positives</div>
          </div>
        )}

        {correctionSummary.added > 0 && (
          <div style={{ padding: '12px', background: 'var(--bg-card-alt)', borderRadius: '8px', border: '1px solid rgba(14, 165, 233, 0.3)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Ditambah</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0ea5e9' }}>+{correctionSummary.added}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>deteksi baru</div>
          </div>
        )}

        {correctionSummary.moved > 0 && (
          <div style={{ padding: '12px', background: 'var(--bg-card-alt)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Digeser</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#10b981' }}>{correctionSummary.moved}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>box adjustment</div>
          </div>
        )}

        {showCorrected && (
          <div style={{ padding: '12px', background: 'var(--bg-card-alt)', borderRadius: '8px', border: '1px solid rgba(0, 175, 160, 0.2)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Hasil Akhir</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--teal)' }}>{correctedDetectionCount}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>deteksi terkoreksi</div>
          </div>
        )}
      </div>

      {/* Correction details */}
      {corrections.length > 0 && (
        <div style={{ fontSize: '0.8rem' }}>
          <div style={{ fontWeight: 700, marginBottom: '8px', color: 'var(--text-muted)' }}>Ringkasan Koreksi ({corrections.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '300px', overflowY: 'auto' }}>
            {corrections.slice(0, 20).map((corr) => (
              <div
                key={corr.id}
                style={{
                  padding: '8px',
                  background: 'var(--bg-card-alt)',
                  borderRadius: '6px',
                  borderLeft: `3px solid ${
                    corr.correction_type === 'DELETE' ? '#ef4444' : corr.correction_type === 'ADD' ? '#0ea5e9' : '#10b981'
                  }`,
                  fontSize: '0.75rem',
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  Frame {corr.frame_index}: {corr.correction_type}
                </div>
                {corr.notes && <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>{corr.notes}</div>}
              </div>
            ))}
            {corrections.length > 20 && (
              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>... dan {corrections.length - 20} koreksi lainnya</div>
            )}
          </div>
        </div>
      )}

      {/* Recommendations */}
      <div style={{ padding: '12px', background: 'rgba(0, 175, 160, 0.05)', borderRadius: '8px', border: '1px solid var(--teal-light)', fontSize: '0.8rem' }}>
        <div style={{ fontWeight: 700, color: 'var(--teal)', marginBottom: '6px' }}>✓ Verifikasi Analyst</div>
        <ul style={{ margin: '0', paddingLeft: '20px', color: 'var(--text-secondary)' }}>
          <li>Analyst telah meninjau deteksi AI dan melakukan koreksi manual</li>
          <li>{correctionSummary.added} deteksi yang terlewat telah ditambahkan</li>
          <li>{correctionSummary.deleted} false positives telah dihapus</li>
          <li>Hasil final: {correctedDetectionCount} deteksi siap untuk analisis motility</li>
        </ul>
      </div>
    </div>
  );
}
