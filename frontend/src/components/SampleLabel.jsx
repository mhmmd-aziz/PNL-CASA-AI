import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

function qrValue(item) {
  return JSON.stringify({
    type: 'CASA_AI_SEMEN_EXAM',
    sample_code: item.sample_code,
    medical_record_number: item.medical_record_number,
    queue_number: item.queue_number,
    collection_datetime: item.collection_datetime,
  });
}

// Contoh: Senin, 19 Oktober 2026 pukul 09.00 WIB
function formatWibLong(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date)} WIB`;
}

function formatDays(hours) {
  return (hours / 24).toLocaleString('id-ID', { maximumFractionDigits: 1 });
}

// Mencetak dua kartu dalam satu lembar: label wadah sampel dan bukti jadwal pasien.
export default function LabelPrinter({ item, onDone }) {
  const sampleQrRef = useRef(null);
  const patientQrRef = useRef(null);

  useEffect(() => {
    if (!item || !sampleQrRef.current || !patientQrRef.current) return undefined;
    const value = qrValue(item);
    let cancelled = false;
    Promise.all([
      QRCode.toCanvas(sampleQrRef.current, value, { width: 260, margin: 1, errorCorrectionLevel: 'M' }),
      QRCode.toCanvas(patientQrRef.current, value, { width: 260, margin: 1, errorCorrectionLevel: 'M' }),
    ]).then(() => {
      if (cancelled) return;
      document.body.classList.add('label-print-mode');
      const cleanup = () => document.body.classList.remove('label-print-mode');
      window.addEventListener('afterprint', cleanup, { once: true });
      window.setTimeout(() => {
        window.print();
        cleanup();
        onDone?.();
      }, 100);
    });
    return () => {
      cancelled = true;
      document.body.classList.remove('label-print-mode');
    };
  }, [item, onDone]);

  if (!item) return null;
  const jadwal = item.collection_datetime
    ? new Date(item.collection_datetime).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
    : '—';
  const hours = item.abstinence_duration_hours;
  const hasAbstinence = Boolean(item.abstinence_start_at) && hours != null;
  const lamaPantang = hours != null ? `${hours} jam (${formatDays(hours)} hari)` : 'Tidak dicatat';

  return createPortal((
    <div className="print-label" aria-hidden="true">
      <article className="print-label-card sample-label-card">
        <div className="print-card-heading">LABEL SAMPEL SEMEN</div>
        <div className="print-card-body">
          <canvas ref={sampleQrRef} className="print-card-qr" />
          <div className="print-card-data">
            <div className="print-sample-code">{item.sample_code}</div>
            <div><span>Pasien</span><strong>{item.patient_name}</strong></div>
            <div><span>No. RM</span><strong>{item.medical_record_number}</strong></div>
            <div><span>Jadwal</span><strong>{jadwal}</strong></div>
            <div><span>Antrean</span><strong>{item.queue_number || '—'}</strong></div>
          </div>
        </div>
        <div className="print-card-note">Tempelkan pada wadah sampel • Cocokkan identitas sebelum pemeriksaan</div>
      </article>

      <article className="print-label-card patient-label-card">
        <div className="print-card-heading">BUKTI JADWAL PEMERIKSAAN SEMEN</div>
        <div className="print-card-body">
          <canvas ref={patientQrRef} className="print-card-qr" />
          <div className="patient-card-columns">
            <div className="print-card-data">
              <div className="print-sample-code">{item.sample_code}</div>
              <div><span>Nama</span><strong>{item.patient_name}</strong></div>
              <div><span>No. RM</span><strong>{item.medical_record_number}</strong></div>
              <div><span>Jadwal datang</span><strong>{formatWibLong(item.collection_datetime)}</strong></div>
              <div><span>Nomor antrean</span><strong>{item.queue_number || '—'}</strong></div>
            </div>
            <div className="print-card-data">
              <div className="print-section-title">Masa pantang</div>
              <div><span>Mulai pantang</span><strong>{hasAbstinence ? formatWibLong(item.abstinence_start_at) : 'Tidak dicatat'}</strong></div>
              <div><span>Lama pantang</span><strong>{lamaPantang}</strong></div>
              <div><span>Boleh diperiksa mulai</span><strong>{item.abstinence_ready_at ? formatWibLong(item.abstinence_ready_at) : 'Tidak dicatat'}</strong></div>
            </div>
          </div>
        </div>
        <div className="print-card-instructions">
          <div className="print-section-title">Petunjuk untuk pasien</div>
          <ol>
            {hasAbstinence ? (
              <li>Jangan ejakulasi sejak {formatWibLong(item.abstinence_start_at)} sampai waktu pemeriksaan.</li>
            ) : (
              <li>Jangan ejakulasi selama 2 sampai 7 hari sebelum jadwal pemeriksaan.</li>
            )}
            <li>Datang sesuai jadwal, bawa kartu ini, lalu tunjukkan kode QR kepada petugas Front Office.</li>
            <li>Jika terjadi ejakulasi sebelum waktu pemeriksaan atau Anda tidak bisa datang, beri tahu laboratorium agar jadwal diubah. Jadwal hanya bisa diubah sebelum sampel diterima.</li>
            <li>Akun portal pasien dipakai untuk melihat antrean dan laporan setelah dirilis dokter.</li>
          </ol>
        </div>
      </article>
    </div>
  ), document.body);
}

// Preview QR hanya pada layar sukses sesaat setelah Front Office membuat jadwal.
export function SampleQr({ item, size = 132 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !item) return;
    QRCode.toCanvas(ref.current, qrValue(item), { width: size, margin: 1, errorCorrectionLevel: 'M' });
  }, [item, size]);
  return <canvas ref={ref} aria-label={`QR pemeriksaan ${item?.sample_code || ''}`} style={{ width: `${size}px`, height: `${size}px`, background: '#fff', padding: '5px', borderRadius: '10px' }} />;
}

// Barcode Code128 untuk kode sampel, digambar di layar
export function SampleBarcode({ value, height = 40 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    JsBarcode(ref.current, value, { format: 'CODE128', width: 1.4, height, displayValue: true, fontSize: 11, margin: 0 });
  }, [value, height]);
  return <svg ref={ref} aria-label={`Barcode ${value}`} />;
}
