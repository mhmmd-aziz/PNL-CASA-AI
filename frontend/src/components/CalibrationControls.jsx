import { useId } from 'react';
import { validateCalibration, formatMotion } from '../calibration';
import { analysisSummary, motionUnavailableReason, trackingSummary } from '../parameterHelp';
import ParameterHelp from './ParameterHelp';

export function CalibrationStatus({ controls }) {
  const { calibrationLoading, calibrationSaving, calibrationError, calibrationDirty, reloadCalibration } = controls;
  const validationError = calibrationLoading ? '' : validateCalibration(controls.calibration);
  const feedbackError = calibrationError || validationError;
  return (
    <div role="status" style={{ margin: '10px 0', fontSize: '0.78rem', lineHeight: 1.6, color: feedbackError ? '#DC2626' : 'var(--text-muted)' }}>
      {calibrationLoading ? 'Memuat kalibrasi dari server...' : calibrationSaving ? 'Menyimpan kalibrasi ke server...' : feedbackError || (calibrationDirty ? 'Perubahan belum disimpan. Analisis memakai nilai formulir saat ini.' : 'Konfigurasi dimuat dari server. Pastikan skala sudah diukur pada mikroskop dan resolusi rekaman yang digunakan.')}
      {calibrationError && <button type="button" className="action-pill-btn secondary" onClick={reloadCalibration} style={{ marginLeft: '8px' }}>Muat Ulang</button>}
    </div>
  );
}

export function ConfidenceField({ value, onChange, disabled = false }) {
  const id = useId();
  return (
    <div className="calibration-field">
      <label htmlFor={id}>Confidence Threshold</label>
      <ParameterHelp name="confidence" />
      <input id={id} type="number" className="search-box" value={value} min="0" max="1" step="any" disabled={disabled} onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))} />
      {(!Number.isFinite(value) || value <= 0 || value > 1) && <p role="alert" className="calibration-field-note">Isi angka lebih dari 0 dan maksimal 1.</p>}
    </div>
  );
}

export function CalibrationFields({ controls, readOnly = false, confidence, onConfidenceChange }) {
  const { calibration, updateCalibration, calibrationLoading, calibrationSaving } = controls;
  const id = useId();
  const locked = readOnly || calibrationLoading || calibrationSaving;
  const numericField = (field, label, minimum, maximum, disabled = false) => (
    <div className="calibration-field">
      <label htmlFor={`${id}-${field}`}>{label}</label>
      <ParameterHelp name={field} />
      <input id={`${id}-${field}`} type="number" className="search-box" value={calibration[field]} min={minimum} max={maximum} step="any" disabled={locked || disabled} onChange={(event) => updateCalibration(field, event.target.value === '' ? '' : Number(event.target.value))} />
    </div>
  );
  return (
    <>
      <div className="calibration-fields">
        {onConfidenceChange && <ConfidenceField value={confidence} onChange={onConfidenceChange} disabled={locked} />}
        <div className="calibration-field">
          <label htmlFor={`${id}-chamber_type`}>Tipe Bilik Hitung</label>
          <ParameterHelp name="chamber_type" />
          <select id={`${id}-chamber_type`} className="search-box" disabled={locked} value={calibration.chamber_type} onChange={(event) => updateCalibration('chamber_type', event.target.value)}>
            <option value="custom">Custom / sesuai spesifikasi preparat</option>
            <option value="makler">Makler (10 µm)</option>
            <option value="leja">Leja (20 µm)</option>
            <option value="neubauer">Improved Neubauer (100 µm)</option>
          </select>
        </div>
        {numericField('chamber_depth', 'Kedalaman Bilik (µm)', 0)}
        {numericField('pixel_scale', 'Skala Piksel (µm/px)', 0)}
        <div className="calibration-field">
          <label htmlFor={`${id}-fps_mode`}>Sumber FPS</label>
          <ParameterHelp name="fps_mode" />
          <select id={`${id}-fps_mode`} className="search-box" disabled={locked} value={calibration.fps_mode} onChange={(event) => updateCalibration('fps_mode', event.target.value)}>
            <option value="auto">Otomatis dari metadata video</option>
            <option value="manual">Manual / FPS rekaman aktual</option>
          </select>
          {calibration.fps_mode === 'auto' && <p className="calibration-field-note">FPS dibaca saat video dianalisis. Nilai manual {calibration.fps || '—'} tidak dipakai; FPS efektif ditampilkan pada hasil.</p>}
        </div>
        {calibration.fps_mode === 'manual' && numericField('fps', 'FPS Rekaman Manual', 0)}
        {numericField('dilution_factor', 'Faktor Pengenceran (1 = tanpa pengenceran)', 1)}
        {numericField('prog_speed_threshold', 'Ambang Progresif VCL (µm/s)', 0)}
        {numericField('prog_linearity_threshold', 'Ambang Kelurusan LIN (0–1)', 0, 1)}
        {numericField('immotile_speed_threshold', 'Ambang Immotil VCL (µm/s)', 0)}
      </div>
      <p style={{ marginTop: '12px', fontSize: '0.75rem', lineHeight: 1.6, color: 'var(--text-muted)' }}>
        Skala 0,8 µm/px adalah nilai awal contoh, bukan hasil kalibrasi otomatis. Ukur dengan mikrometer pada optik dan resolusi yang digunakan. Sesuaikan jika gambar di-resize. Untuk video slow-motion, gunakan FPS rekaman aktual dalam mode manual. LIN = perpindahan awal–akhir / panjang lintasan; VAP/STR/WOB dihitung sebagai estimasi dari lintasan yang diperhalus.
      </p>
      <CalibrationStatus controls={controls} />
      <ParameterHelp name="save" />
      <ParameterHelp name="reset" />
    </>
  );
}

export function MotionValue({ data, field, multiplier = 1, unit = '' }) {
  const value = formatMotion(data, field, multiplier);
  return value === 'N/A' ? 'Tidak tersedia' : `${value}${unit}`;
}

export function MotionAvailability({ data }) {
  return <div className="calibration-field-note">
    {motionUnavailableReason(data)}
    <ParameterHelp name="unavailable" />
  </div>;
}

export function KinematicsMetrics({ data, extendedOnly = false }) {
  const metrics = [
    ['VCL (Curvilinear)', 'average_speed', 1, ' µm/s'],
    ['VSL (Straight-line)', 'average_straight_line_speed', 1, ' µm/s'],
    ['VAP (Estimasi)', 'average_path_speed', 1, ' µm/s'],
    ['LIN (Linearity)', 'average_linearity', 100, '%'],
    ['STR (Estimasi)', 'average_straightness', 100, '%'],
    ['WOB (Estimasi)', 'average_wobble', 100, '%'],
  ];
  return <>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', margin: '14px 0' }}>
      {metrics.filter(([, field]) => !extendedOnly || ['average_path_speed', 'average_straightness', 'average_wobble'].includes(field)).map(([label, field, multiplier, unit]) => <div key={field} className="subset-tile" style={{ padding: '10px' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{label}</span>
        <strong style={{ fontSize: '1rem', display: 'block', color: 'var(--teal)' }}><MotionValue data={data} field={field} multiplier={multiplier} unit={unit} /></strong>
      </div>)}
    </div>
    <ParameterHelp name="motion_method" />
  </>;
}

export function TrackingQuality({ data }) {
  const description = trackingSummary(data);
  if (!description) return null;
  const quality = data?.quality;
  return <div style={{ marginTop: '10px', fontSize: '0.76rem', lineHeight: 1.7 }}>
    <strong>Dasar hitungan:</strong> {description}
    {quality && <>
      <div>{quality.valid_track_ids} dari {quality.total_track_ids} ID dipakai; {quality.excluded_track_ids} tidak memiliki segmen yang cukup. {quality.tracks_with_gaps} ID memiliki jeda frame.</div>
      <div>Minimum {quality.minimum_track_observations} pengamatan berurutan; hanya segmen kontinu terpanjang per ID yang dinilai.</div>
      {Number.isFinite(quality.tracking_assignment_percent) && <div>Deteksi yang mendapat ID tracking: {quality.tracking_assignment_percent.toFixed(1)}% dari seluruh deteksi antarframe. Ini bukan skor akurasi.</div>}
      <div>ID tracking dapat terputus atau tertukar; jumlah lintasan bukan jaminan jumlah sel unik.</div>
    </>}
  </div>;
}

export function AnalysisInterpretation({ data }) {
  return <div>
    <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)', display: 'block' }}>{analysisSummary(data)}</strong>
    <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
      Kategori gerak mengikuti ambang pada snapshot kalibrasi. Hasil ini belum menentukan diagnosis; kirim untuk penilaian dokter.
    </span>
  </div>;
}

export function CalibrationSummary({ data }) {
  const calibration = data?.calibration;
  if (!calibration) return null;
  return (
    <div style={{ margin: '12px 0', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '0.76rem', lineHeight: 1.7 }}>
      <strong>Kalibrasi yang dipakai analisis:</strong> {calibration.pixel_scale} µm/px · Bilik {calibration.chamber_type} / {calibration.chamber_depth} µm · Pengenceran {calibration.dilution_factor}×<br />
      {calibration.fps === null ? 'FPS: tidak berlaku untuk citra tunggal' : `FPS: ${calibration.fps} (${calibration.fps_source === 'video_metadata' ? 'metadata video' : 'manual'})`} · Resolusi {calibration.frame_width}×{calibration.frame_height} px<br />
      Ambang PR: VCL ≥ {calibration.prog_speed_threshold} µm/s dan LIN ≥ {calibration.prog_linearity_threshold}; IM: VCL &lt; {calibration.immotile_speed_threshold} µm/s.
      {data.summary?.motility_available === false && <div>Motilitas tidak dapat dinilai dari citra tunggal atau tanpa lintasan yang cukup panjang. Angka 0 bukan berarti semua sel diam.</div>}
      <TrackingQuality data={data} />
    </div>
  );
}
