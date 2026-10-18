import { useEffect, useState } from 'react';
import axios from 'axios';
import { FileText, CheckCircle2, AlertCircle, ArrowLeft, Printer, Send, Eye } from 'lucide-react';
import { API_BASE_URL } from '../api.js';
import { getAuthHeader } from '../auth';

function errorMessage(error) {
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length) return detail[0].msg;
  if (!error.response) return 'Tidak dapat terhubung ke server. Pastikan backend berjalan.';
  return 'Permintaan gagal. Coba lagi.';
}

const fmtTime = (value) => (value ? new Date(value).toLocaleString('id-ID') : '—');
const fmtPct = (value) => (value === null || value === undefined ? 'Tidak tersedia' : `${Number(value).toFixed(1)}%`);
const fmtValue = (value, unit = '') => (value === null || value === undefined || value === '' ? '—' : `${value}${unit}`);
const genderLabel = { MALE: 'Laki-laki', FEMALE: 'Perempuan', OTHER: 'Lainnya' };

function SignaturePreview({ source }) {
  const [cropped, setCropped] = useState(source);
  useEffect(() => {
    if (!source) return;
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      let left = canvas.width; let top = canvas.height; let right = -1; let bottom = -1;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          if (pixels.data[(y * canvas.width + x) * 4 + 3] > 20) {
            left = Math.min(left, x); right = Math.max(right, x);
            top = Math.min(top, y); bottom = Math.max(bottom, y);
          }
        }
      }
      if (right < left || bottom < top) return;
      const padding = Math.max(10, Math.round((right - left) * 0.1));
      left = Math.max(0, left - padding); top = Math.max(0, top - padding);
      right = Math.min(canvas.width, right + padding); bottom = Math.min(canvas.height, bottom + padding);
      const output = document.createElement('canvas');
      output.width = right - left; output.height = bottom - top;
      output.getContext('2d').drawImage(canvas, left, top, output.width, output.height, 0, 0, output.width, output.height);
      setCropped(output.toDataURL('image/png'));
    };
    image.src = source;
  }, [source]);
  return <img src={cropped} alt="Tanda tangan dokter" />;
}

function ReportDocumentBody({ report, preview = false }) {
  return (
    <>
      <header className="report-document-header">
        <img src="/logos/casaai.png" alt="CASA-AI" className="report-logo" />
        <div className="report-heading-copy">
          <div className="report-kicker">CASA-AI LABORATORY REPORT</div>
          <h2>Laporan Hasil Pemeriksaan Semen</h2>
          <div className="report-number">{report.report_number}</div>
        </div>
        <div className={`report-status-stamp${preview ? ' preview' : ''}`}>
          {preview ? 'SIAP DIRILIS' : 'TELAH DIRILIS'}
        </div>
      </header>

      <div className="report-info-grid">
        <div><span>Nama pasien</span><strong>{report.patient?.full_name || '—'}</strong></div>
        <div><span>No. rekam medis</span><strong>{report.patient?.medical_record_number || '—'}</strong></div>
        <div><span>Tanggal lahir</span><strong>{report.patient?.date_of_birth || '—'}</strong></div>
        <div><span>Jenis kelamin</span><strong>{genderLabel[report.patient?.gender] || '—'}</strong></div>
        <div><span>Kode sampel</span><strong>{report.sample_code}</strong></div>
        <div><span>Tanggal pemeriksaan</span><strong>{fmtTime(report.examination_date)}</strong></div>
      </div>

      <div className="report-section">
        <h3>Hasil Pemeriksaan</h3>
        <table className="report-result-table">
          <thead><tr><th>Parameter</th><th>Hasil</th></tr></thead>
          <tbody>
            <tr><td>Volume</td><td>{fmtValue(report.macroscopic?.volume_ml, ' mL')}</td></tr>
            <tr><td>Waktu likuefaksi</td><td>{fmtValue(report.macroscopic?.liquefaction_time_min, ' menit')}</td></tr>
            <tr><td>Viskositas</td><td>{fmtValue(report.macroscopic?.viscosity)}</td></tr>
            <tr><td>pH</td><td>{fmtValue(report.macroscopic?.ph_value)}</td></tr>
            <tr><td>Penampilan</td><td>{fmtValue(report.macroscopic?.appearance)}</td></tr>
            <tr><td>Motilitas progresif (PR)</td><td>{fmtPct(report.results.pr_percentage)}</td></tr>
            <tr><td>Motilitas non-progresif (NP)</td><td>{fmtPct(report.results.np_percentage)}</td></tr>
            <tr><td>Immotil (IM)</td><td>{fmtPct(report.results.im_percentage)}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="report-section">
        <h3>Interpretasi Klinis</h3>
        <p>{report.clinical_interpretation}</p>
      </div>
      {report.recommendations && (
        <div className="report-section">
          <h3>Rekomendasi</h3>
          <p style={{ whiteSpace: 'pre-line' }}>{report.recommendations}</p>
        </div>
      )}

      <div className="report-signature-row">
        <div className="report-disclaimer">Hasil ini merupakan pemeriksaan laboratorium dan harus diinterpretasikan bersama kondisi klinis oleh dokter yang bertanggung jawab.</div>
        <div className="report-signature-box">
          <div>Dokter penanggung jawab,</div>
          {report.physician_signature ? <SignaturePreview source={report.physician_signature} /> : <div className="signature-unavailable">Tanda tangan tidak tersedia</div>}
          <strong>{report.physician_name}</strong>
          <span>{report.physician_license ? `SIP/STR: ${report.physician_license}` : ''}</span>
          <span>Ditandatangani: {fmtTime(report.signed_at)}</span>
        </div>
      </div>
      <footer className="report-footer">
        {preview
          ? `Disetujui pada ${fmtTime(report.signed_at)} • Pratinjau sebelum rilis • Belum dapat dilihat pasien`
          : `Dirilis pada ${fmtTime(report.released_at)} • Dokumen dibuat oleh CASA-AI`}
      </footer>
    </>
  );
}

// Dokter: laporan yang sudah disetujui dan siap dirilis ke pasien
export function ReleaseReportsPanel() {
  const [items, setItems] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [previewReport, setPreviewReport] = useState(null);
  const [previewLoadingId, setPreviewLoadingId] = useState(null);

  const load = async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/reports/approved`, { headers: getAuthHeader() });
      setItems(data);
      setLoadError('');
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openPreview = async (id) => {
    setNotice(null);
    setPreviewLoadingId(id);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/reports/approved/${id}`, { headers: getAuthHeader() });
      setPreviewReport(data);
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error) });
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const release = async (item) => {
    setNotice(null);
    setBusy(true);
    try {
      await axios.post(`${API_BASE_URL}/api/reports/${item.id}/release`, null, { headers: getAuthHeader() });
      setNotice({ type: 'ok', text: `Laporan ${item.report_number} dirilis. Pasien sekarang dapat melihatnya.` });
      if (previewReport?.id === item.id) setPreviewReport(null);
      await load();
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  if (previewReport) {
    return (
      <section className="card-box report-print-area medical-report report-preview-page">
        <div className="no-print report-preview-toolbar">
          <button type="button" className="action-pill-btn secondary" disabled={busy} onClick={() => { setPreviewReport(null); setNotice(null); }}>
            <ArrowLeft size={14} /> Kembali
          </button>
          <button type="button" className="action-pill-btn primary" disabled={busy} onClick={() => release(previewReport)}>
            <Send size={14} /> {busy ? 'Merilis...' : 'Rilis Laporan'}
          </button>
        </div>
        <div className="no-print report-preview-notice">
          <Eye size={16} />
          <span>Periksa identitas pasien, hasil, interpretasi, dan tanda tangan. Laporan belum dapat dilihat pasien sebelum Anda menekan <strong>Rilis Laporan</strong>.</span>
        </div>
        {notice && (
          <p role="alert" className={`no-print report-action-notice ${notice.type}`}>
            {notice.type === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {notice.text}
          </p>
        )}
        <ReportDocumentBody report={previewReport} preview />
      </section>
    );
  }

  return (
    <section className="bottom-table-card">
      <div className="table-header-row">
        <div>
          <div className="table-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Send size={18} color="var(--teal)" />
            <span>Laporan Siap Dirilis</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            Laporan yang sudah Anda setujui dan tandatangani. Setelah dirilis, pasien dapat melihatnya.
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
              <th>No. Laporan</th>
              <th>Kode Sampel</th>
              <th>Disetujui</th>
              <th>Dokter</th>
              <th style={{ textAlign: 'right' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={5}>Tidak ada laporan yang menunggu dirilis.</td></tr>}
            {items.map((item) => (
              <tr key={item.id}>
                <td className="sample-id-cell">{item.report_number}</td>
                <td>{item.sample_code}</td>
                <td>{fmtTime(item.approved_at)}</td>
                <td>{item.physician_name}</td>
                <td style={{ textAlign: 'right' }}>
                  <button type="button" className="action-pill-btn secondary" disabled={busy || previewLoadingId !== null} onClick={() => openPreview(item.id)}>
                    <Eye size={14} /> {previewLoadingId === item.id ? 'Memuat...' : 'Preview laporan'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const printReport = () => {
  document.body.classList.add('report-print-mode');
  const cleanup = () => document.body.classList.remove('report-print-mode');
  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
  window.setTimeout(cleanup, 1000);
};

const historyStatusLabel = { APPROVED: 'Disetujui, belum dirilis', RELEASED: 'Dirilis' };

// Dokter: riwayat laporan yang ia setujui sendiri
export function PhysicianReportHistoryPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [openReport, setOpenReport] = useState(null);
  const [openingId, setOpeningId] = useState(null);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/reports/history/physician`, { headers: getAuthHeader() })
      .then(({ data }) => { setItems(data); setLoadError(''); })
      .catch((error) => setLoadError(errorMessage(error)))
      .finally(() => setLoading(false));
  }, []);

  const open = async (id) => {
    setOpeningId(id);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/reports/history/physician/${id}`, { headers: getAuthHeader() });
      setOpenReport(data);
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setOpeningId(null);
    }
  };

  if (openReport) {
    return (
      <section className="card-box report-print-area medical-report">
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button type="button" className="action-pill-btn secondary" onClick={() => setOpenReport(null)}>
            <ArrowLeft size={14} /> Kembali
          </button>
          <button type="button" className="action-pill-btn primary" onClick={printReport}>
            <Printer size={14} /> Cetak / Simpan PDF
          </button>
        </div>
        <ReportDocumentBody report={openReport} preview={openReport.status !== 'RELEASED'} />
      </section>
    );
  }

  return (
    <section className="bottom-table-card">
      <div className="table-header-row">
        <div>
          <div className="table-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} color="var(--teal)" />
            <span>Riwayat Laporan Saya</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            Laporan yang Anda setujui dan tandatangani. Laporan dokter lain tidak ditampilkan.
          </div>
        </div>
      </div>
      {loadError && <p role="alert" style={{ color: '#DC2626', fontSize: '0.8rem' }}>{loadError}</p>}
      <div className="casa-table-wrap">
        <table className="casa-table">
          <thead>
            <tr>
              <th>No. Laporan</th>
              <th>Pasien</th>
              <th>Kode Sampel</th>
              <th>Status</th>
              <th>Disetujui</th>
              <th>Dirilis</th>
              <th style={{ textAlign: 'right' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7}>Memuat riwayat…</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={7}>Belum ada laporan yang Anda setujui.</td></tr>}
            {items.map((item) => (
              <tr key={item.id}>
                <td className="sample-id-cell">{item.report_number}</td>
                <td>{item.patient_name}<div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.medical_record_number}</div></td>
                <td>{item.sample_code}</td>
                <td>{historyStatusLabel[item.status] || item.status}</td>
                <td>{fmtTime(item.approved_at)}</td>
                <td>{fmtTime(item.released_at)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button type="button" className="action-pill-btn secondary" disabled={openingId !== null} onClick={() => open(item.id)}>
                    <Eye size={14} /> {openingId === item.id ? 'Memuat...' : 'Lihat'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// Super Admin: riwayat laporan yang dirilis, hanya data administratif (tanpa identitas pasien dan isi klinis)
export function AdminReportHistoryPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/reports/history/admin`, { headers: getAuthHeader() })
      .then(({ data }) => { setItems(data); setLoadError(''); })
      .catch((error) => setLoadError(errorMessage(error)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="bottom-table-card">
      <div className="table-header-row">
        <div>
          <div className="table-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} color="var(--teal)" />
            <span>Riwayat Laporan Dirilis</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            Data administratif laporan yang sudah dirilis. Identitas pasien dan isi klinis hanya dapat dilihat dokter dan pasien.
          </div>
        </div>
      </div>
      {loadError && <p role="alert" style={{ color: '#DC2626', fontSize: '0.8rem' }}>{loadError}</p>}
      <div className="casa-table-wrap">
        <table className="casa-table">
          <thead>
            <tr>
              <th>No. Laporan</th>
              <th>Versi</th>
              <th>Kode Sampel</th>
              <th>Dokter Penyetuju</th>
              <th>Dirilis Oleh</th>
              <th>Disetujui</th>
              <th>Dirilis</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7}>Memuat riwayat…</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={7}>Belum ada laporan yang dirilis.</td></tr>}
            {items.map((item) => (
              <tr key={item.id}>
                <td className="sample-id-cell">{item.report_number}</td>
                <td>{item.report_version}</td>
                <td>{item.sample_code}</td>
                <td>{item.physician_name || '—'}</td>
                <td>{item.released_by_name || '—'}</td>
                <td>{fmtTime(item.approved_at)}</td>
                <td>{fmtTime(item.released_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// Pasien: daftar laporan miliknya yang sudah dirilis
export function MyReportsPanel() {
  const [reports, setReports] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [openReport, setOpenReport] = useState(null);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/reports/mine`, { headers: getAuthHeader() })
      .then(({ data }) => {
        setReports(data);
        setLoadError('');
      })
      .catch((error) => setLoadError(errorMessage(error)));
  }, []);

  const open = async (id) => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/reports/mine/${id}`, { headers: getAuthHeader() });
      setOpenReport(data);
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  };

  const printReport = () => {
    document.body.classList.add('report-print-mode');
    const cleanup = () => document.body.classList.remove('report-print-mode');
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1000);
  };

  if (openReport) {
    return (
      <section className="card-box report-print-area medical-report">
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button type="button" className="action-pill-btn secondary" onClick={() => setOpenReport(null)}>
            <ArrowLeft size={14} /> Kembali
          </button>
          <button type="button" className="action-pill-btn primary" onClick={printReport}>
            <Printer size={14} /> Cetak / Simpan PDF
          </button>
        </div>

        <ReportDocumentBody report={openReport} />
      </section>
    );
  }

  return (
    <section className="bottom-table-card">
      <div className="table-header-row">
        <div className="table-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={18} color="var(--teal)" />
          <span>Laporan Saya</span>
        </div>
      </div>
      {loadError && <p role="alert" style={{ color: '#DC2626', fontSize: '0.8rem' }}>{loadError}</p>}
      <div className="casa-table-wrap">
        <table className="casa-table">
          <thead>
            <tr>
              <th>No. Laporan</th>
              <th>Tanggal Pemeriksaan</th>
              <th>Dirilis</th>
              <th style={{ textAlign: 'right' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 && <tr><td colSpan={4}>Belum ada laporan yang dirilis untuk Anda.</td></tr>}
            {reports.map((report) => (
              <tr key={report.id}>
                <td className="sample-id-cell">{report.report_number}</td>
                <td>{fmtTime(report.examination_date)}</td>
                <td>{fmtTime(report.released_at)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button type="button" className="action-pill-btn secondary" onClick={() => open(report.id)}>Lihat</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
