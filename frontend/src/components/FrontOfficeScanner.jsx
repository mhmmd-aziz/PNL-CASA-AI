import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Camera, CameraOff, QrCode, Search, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { API_BASE_URL } from '../api.js';
import { getAuthHeader } from '../auth';

function message(error) {
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (!error.response) return 'Tidak dapat terhubung ke server.';
  return 'Data pemeriksaan tidak ditemukan.';
}

function sampleCodeFrom(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  try {
    const payload = JSON.parse(text);
    if (typeof payload.sample_code === 'string') return payload.sample_code.trim();
  } catch {
    // QR lama dapat hanya berisi kode sampel, bukan JSON.
  }
  try {
    const url = new URL(text);
    const value = url.searchParams.get('sample_code');
    if (value) return value.trim();
  } catch {
    // Bukan URL; lanjutkan sebagai kode biasa.
  }
  const match = text.match(/(?:SMP|CASA)-[A-Z0-9-]+/i);
  return (match?.[0] || text).toUpperCase();
}

const dateTime = (value) => value
  ? new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'long', timeStyle: 'short' })
  : '—';

export default function FrontOfficeScanner() {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const readerRef = useRef(null);
  const handledRef = useRef(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [result, setResult] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const stopCamera = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    if (videoRef.current?.srcObject) {
      for (const track of videoRef.current.srcObject.getTracks()) track.stop();
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
  };

  useEffect(() => () => {
    controlsRef.current?.stop();
    readerRef.current?.reset?.();
  }, []);

  const lookup = async (raw) => {
    const code = sampleCodeFrom(raw);
    if (!code) {
      setNotice({ type: 'error', text: 'Masukkan atau pindai kode sampel terlebih dahulu.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/examinations`, { headers: getAuthHeader() });
      const found = data.find((item) => item.sample_code?.toUpperCase() === code.toUpperCase());
      if (!found) throw new Error('NOT_FOUND');
      setResult(found);
      setManualCode(found.sample_code);
      setNotice({ type: 'ok', text: 'Data pemeriksaan ditemukan.' });
      stopCamera();
    } catch (error) {
      setResult(null);
      setNotice({ type: 'error', text: error.message === 'NOT_FOUND' ? `Kode sampel ${code} tidak ditemukan.` : message(error) });
      handledRef.current = false;
    } finally {
      setBusy(false);
    }
  };

  const startCamera = async () => {
    setNotice(null);
    setResult(null);
    handledRef.current = false;
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 250 });
      readerRef.current = reader;
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (scanResult) => {
        if (!scanResult || handledRef.current) return;
        handledRef.current = true;
        lookup(scanResult.getText());
      });
      controlsRef.current = controls;
      setCameraOn(true);
    } catch {
      setCameraOn(false);
      setNotice({ type: 'error', text: 'Kamera tidak dapat dibuka. Izinkan akses kamera atau gunakan pencarian kode manual.' });
    }
  };

  const reset = () => {
    stopCamera();
    handledRef.current = false;
    setResult(null);
    setManualCode('');
    setNotice(null);
  };

  return (
    <section className="bottom-table-card fo-scanner-panel">
      <div className="table-header-row">
        <div>
          <div className="table-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><QrCode size={19} color="var(--teal)" /> Scan QR Pemeriksaan</div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Pindai QR pada label sampel atau bukti jadwal pasien untuk mencari data pemeriksaan.</div>
        </div>
        {result && <button type="button" className="action-pill-btn secondary" onClick={reset}><RefreshCw size={14} /> Scan data lain</button>}
      </div>

      <div className="scanner-layout">
        <div className="scanner-camera-card">
          <div className={`scanner-video-wrap ${cameraOn ? 'active' : ''}`}>
            <video ref={videoRef} muted playsInline />
            {!cameraOn && <div className="scanner-placeholder"><Camera size={42} /><span>Kamera belum diaktifkan</span></div>}
            {cameraOn && <div className="scanner-frame" aria-hidden="true" />}
          </div>
          <div className="scanner-camera-actions">
            {!cameraOn ? (
              <button type="button" className="action-pill-btn primary" onClick={startCamera}><Camera size={16} /> Aktifkan Kamera</button>
            ) : (
              <button type="button" className="action-pill-btn secondary" onClick={stopCamera}><CameraOff size={16} /> Matikan Kamera</button>
            )}
          </div>
          <form className="scanner-manual" onSubmit={(event) => { event.preventDefault(); lookup(manualCode); }}>
            <label htmlFor="manual-sample-code">Atau masukkan kode sampel</label>
            <div><input id="manual-sample-code" className="search-box" placeholder="Contoh: SMP-20261017-A58843" value={manualCode} onChange={(event) => setManualCode(event.target.value)} /><button type="submit" className="action-pill-btn secondary" disabled={busy}><Search size={15} /> Cari</button></div>
          </form>
        </div>

        <div className="scanner-result-card">
          {!result ? (
            <div className="scanner-empty"><QrCode size={38} /><strong>Belum ada data dipindai</strong><span>Arahkan kamera ke QR sampai kode terbaca otomatis.</span></div>
          ) : (
            <>
              <div className="scanner-result-title"><CheckCircle2 size={18} /> Data Pemeriksaan</div>
              <div className="scanner-result-code">{result.sample_code}</div>
              <dl>
                <div><dt>Pasien</dt><dd>{result.patient_name}</dd></div>
                <div><dt>No. RM</dt><dd>{result.medical_record_number}</dd></div>
                <div><dt>Jadwal</dt><dd>{dateTime(result.collection_datetime)} WIB</dd></div>
                <div><dt>Antrean</dt><dd>{result.queue_number || '—'}</dd></div>
                <div><dt>Status</dt><dd>{result.status_label}</dd></div>
              </dl>
            </>
          )}
        </div>
      </div>

      {notice && <p role="status" className={`scanner-notice ${notice.type}`}>{notice.type === 'ok' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}{notice.text}</p>}
    </section>
  );
}
