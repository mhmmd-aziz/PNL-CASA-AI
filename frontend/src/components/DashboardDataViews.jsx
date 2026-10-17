import { useState } from 'react';
import { CalibrationSummary, KinematicsMetrics, MotionAvailability, TrackingQuality } from './CalibrationControls';
import { formatMotility } from '../calibration';
import { exportAnalysisRecords, formatMeasurement } from '../analysisRecords';

export function EmptyData({ title, children }) {
  return <section className="card-box" role="status"><h3>{title}</h3><div>{children}</div></section>;
}

export function DashboardOverview({ records, onAnalyze }) {
  return (
    <section className="card-box">
      <h3>Ringkasan hasil aktual</h3>
      <p>Hasil analisis disimpan dalam sesi halaman ini saja, belum terhubung ke database pasien.</p>
      <p><strong>{records.length}</strong> hasil analisis tersimpan dalam sesi ini.</p>
      {!records.length && <p>Belum ada hasil. Unggah citra atau video mikroskop dan jalankan analisis terlebih dahulu.</p>}
      {onAnalyze && <button className="action-pill-btn primary" onClick={onAnalyze}>Buka laboratorium analisis</button>}
    </section>
  );
}

export function AnalysisRecords({ records, title = 'Hasil analisis sesi ini' }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const selected = records.find((record) => record.id === selectedId);
  const filtered = records.filter((record) => [record.id, record.patientName, record.clinic, record.sourceFile]
    .some((value) => value?.toLowerCase().includes(query.toLowerCase())));
  return (
    <section className="bottom-table-card">
      <div className="table-header-row">
        <div><h3>{title}</h3><p>Data dari unggahan aktual. Belum tersimpan ke server dan belum divalidasi secara klinis.</p></div>
        <button className="action-pill-btn secondary" disabled={!records.length} onClick={() => exportAnalysisRecords(records)}>Unduh JSON</button>
      </div>
      <div className="search-box">
        <input aria-label="Cari hasil analisis" placeholder="Cari ID, pasien, klinik, atau nama file" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      {!records.length ? <EmptyData title="Belum ada data">Jalankan analisis pada file Anda untuk menampilkan hasil di sini.</EmptyData> : (
        <div className="casa-table-wrap">
          <table className="casa-table">
            <thead><tr><th>File / Sampel</th><th>Pasien</th><th>Klinik</th><th>Waktu analisis</th><th>Konsentrasi</th><th>Motilitas progresif</th><th>Detail</th></tr></thead>
            <tbody>
              {filtered.map((record) => <tr key={record.id}>
                <td>{record.sourceFile || record.id}</td><td>{record.patientName || 'Belum diisi'}</td><td>{record.clinic || 'Belum diisi'}</td>
                <td>{new Date(record.createdAt).toLocaleString('id-ID')}</td>
                <td>{formatMeasurement(record.data.summary.estimated_concentration, 'M/mL', 2)}</td>
                <td>{formatMotility(record.data, 'progressive_percent')}</td>
                <td><button className="action-pill-btn secondary" onClick={() => setSelectedId(record.id)}>Lihat hasil</button></td>
              </tr>)}
              {!filtered.length && <tr><td colSpan={7}>Tidak ada hasil yang sesuai pencarian.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelectedId(null)}>
          <section className="modal-content-panel" role="dialog" aria-modal="true" aria-label="Detail hasil analisis" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header"><h3>{selected.sourceFile || selected.id}</h3><button className="action-pill-btn secondary" onClick={() => setSelectedId(null)}>Tutup</button></div>
            <p>Pasien: {selected.patientName || 'Belum diisi'} | Klinik: {selected.clinic || 'Belum diisi'}</p>
            {selected.videoUrl ? (selected.isImage
              ? <img src={selected.videoUrl} alt="Hasil deteksi dari unggahan" style={{ width: '100%' }} />
              : <video src={selected.videoUrl} controls style={{ width: '100%' }} />)
              : <p>Media hasil tidak tersedia.</p>}
            <CalibrationSummary data={selected.data} />
            <KinematicsMetrics data={selected.data} />
            <MotionAvailability data={selected.data} />
            <TrackingQuality data={selected.data} />
            <button className="action-pill-btn secondary" onClick={() => exportAnalysisRecords([selected])}>Unduh hasil JSON</button>
          </section>
        </div>
      )}
    </section>
  );
}
