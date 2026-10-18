import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../api.js';
import {
  LayoutGrid,
  LayoutDashboard,
  History,
  ClipboardList,
  ScanEye,
  Microscope,
  Users,
  ShieldCheck,
  FileText,
  Sliders,
  LogOut,
  Sun,
  Moon,
  Compass,
  CheckCircle2,
  AlertCircle,
  UploadCloud,
  RefreshCw,
  Cpu,
  Sparkles,
  Camera,
  UserCheck,
  Check,
  Stethoscope,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  ListOrdered,
  QrCode,
  KeyRound,
} from 'lucide-react';
import { ROLES, getRoleMode, hasPermission, logout, getAuthHeader } from '../auth';
import { createAnalysisRecord, formatMeasurement } from '../analysisRecords';
import { useCalibration, getErrorMessage, formatMotility } from '../calibration';
import { CalibrationFields, ConfidenceField, CalibrationSummary, MotionAvailability, AnalysisInterpretation, KinematicsMetrics } from './CalibrationControls';
import ParameterHelp from './ParameterHelp';
import DetectionEditor from './DetectionEditor';
import BrandLogos from './BrandLogos';
import RegistrationPanel from './RegistrationPanel';
import SampleQueuePanel, { LinkedSampleSelect } from './SampleQueuePanel';
import ReviewPanel from './ReviewPanel';
import { ReleaseReportsPanel, MyReportsPanel, PhysicianReportHistoryPanel, AdminReportHistoryPanel } from './ReportsPanel';
import { UsersPanel, AuditPanel } from './AdminPanels';
import OpsDashboardPanel from './OpsDashboardPanel';
import PatientQueuePanel from './PatientQueuePanel';
import ChangePasswordPanel from './ChangePasswordPanel';
import { TodaySchedule, QueuePanel, SamplesPanel } from './FrontOfficeViews';
import PatientListPanel from './PatientListPanel';
import FrontOfficeScanner from './FrontOfficeScanner';
import { AnalysisRecords, DashboardOverview } from './DashboardDataViews';

// Metadata menu; daftar menu yang tampil per peran ada di ROLES[peran].tabs (auth.js)
const TAB_META = {
  'Dashboard': { label: 'Dashboard', icon: LayoutDashboard },
  'Report History': { label: 'Riwayat Laporan', icon: History },
  'Registration': { label: 'Registrasi Pasien', icon: ClipboardList },
  'Queue': { label: 'List Pasien', icon: Users },
  'Samples': { label: 'Pemeriksaan & Sampel', icon: ClipboardList },
  'Scan QR': { label: 'Scan QR', icon: QrCode },
  'Overview': { label: 'Ringkasan', icon: LayoutGrid },
  'Incoming Samples': { label: 'Sampel Masuk', icon: Microscope },
  'Analysis Lab': { label: 'Analisis Sampel', icon: ScanEye },
  'Perlu Validasi': { label: 'Tinjau Hasil', icon: Stethoscope },
  'Patient Records': { label: 'Hasil Analisis', icon: Users },
  'Lab Reports': { label: 'Laporan & Tanda Tangan', icon: FileText },
  'My Queue': { label: 'Antrean Saya', icon: ListOrdered },
  'My Reports': { label: 'Laporan Saya', icon: FileText },
  'Account Settings': { label: 'Ubah Kata Sandi', icon: KeyRound },
  'Quality Control': { label: 'Standar WHO 6th', icon: ShieldCheck },
  'Calibration': { label: 'Preset Kalibrasi', icon: Sliders },
  'User Management': { label: 'Pengguna & Peran', icon: UserCheck },
  'Server Logs': { label: 'Log Audit', icon: Cpu }
};

const DOCK_EXPANDED_KEY = 'casa_ai_dock_expanded';

export default function AdminDashboard({ onSwitchToPublic }) {
  const navigate = useNavigate();
  const handleGoHome = () => {
    if (onSwitchToPublic) {
      onSwitchToPublic();
    } else {
      navigate('/');
    }
  };

  // Peran dipilih saat login; untuk berganti peran, keluar lalu pilih peran lain
  const [currentRole] = useState(() => getRoleMode());
  const currentRoleObj = ROLES[currentRole];
  const roleTabs = currentRoleObj?.tabs ?? [];
  const can = (permission) => hasPermission(currentRole, permission);

  // Hasil analisis aktual yang disimpan dalam sesi halaman ini
  const [records, setRecords] = useState([]);

  useEffect(() => {
    if (!currentRoleObj) {
      // Jika belum memilih peran, arahkan ke halaman login
      navigate('/login');
    }
  }, [currentRoleObj, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Navigation & Theme
  const [activeTab, setActiveTab] = useState(() => roleTabs[0]);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      return window.localStorage.getItem('casa_ai_dark_mode') === 'true';
    } catch {
      return false;
    }
  });
  // Sidebar bisa dibuka (ikon + nama menu) atau diciutkan (ikon saja); pilihan diingat per browser
  const [dockExpanded, setDockExpanded] = useState(() => {
    try {
      return window.localStorage.getItem(DOCK_EXPANDED_KEY) !== 'false';
    } catch {
      return true;
    }
  });
  const toggleDock = () => {
    setDockExpanded((prev) => {
      try {
        window.localStorage.setItem(DOCK_EXPANDED_KEY, String(!prev));
      } catch {
        // abaikan bila penyimpanan browser tidak tersedia
      }
      return !prev;
    });
  };

  const navigateTo = (tabId) => {
    if (correctionPending) {
      setAnalysisError('Simpan atau buang perubahan koreksi sebelum pindah halaman.');
      return;
    }
    if (roleTabs.includes(tabId)) setActiveTab(tabId);
  };

  // State for Quality Control Checklist
  const [qcChecks, setQcChecks] = useState({
    grid: false,
    temp: false,
    liquefaction: false,
    chamber: false,
    debris: false
  });
  const handleToggleQcCheck = (key) => {
    setQcChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // State for Calibration feedback
  const [calibSaved, setCalibSaved] = useState(false);

  // Modals

  const [confThres, setConfThres] = useState(0.25);
  const calibrationControls = useCalibration();
  const { calibration, resetCalibration, saveCalibration, appendCalibration, calibrationReady, calibrationSaving, calibrationDirty } = calibrationControls;
  const { pixel_scale: pixelScale, chamber_depth: chamberDepth, dilution_factor: dilutionFactor } = calibration;

  const handleSaveCalibration = async () => {
    setCalibSaved(false);
    try {
      await saveCalibration();
      setCalibSaved(true);
    } catch {
      setCalibSaved(false);
    }
  };

  // File Upload & AI Execution state
  const [uploadFile, setUploadFile] = useState(null);
  const [linkedExamId, setLinkedExamId] = useState(null);
  const [isImageUpload, setIsImageUpload] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [progressStatus, setProgressStatus] = useState({ stage: 'idle', percent: 0, msg: '' });
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisError, setAnalysisError] = useState(null);
  const [activeResultTab, setActiveResultTab] = useState('annotated');
  const [correctionPending, setCorrectionPending] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const previewRef = useRef(null);

  const fileInputRef = useRef(null);

  // Toggle Theme
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    // Save preference to localStorage
    try {
      window.localStorage.setItem('casa_ai_dark_mode', String(isDarkMode));
    } catch {
      // Ignore localStorage errors
    }
  }, [isDarkMode]);

  const handleFileDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer ? e.dataTransfer.files[0] : e.target.files[0];
    if (file) {
      if (correctionPending) {
        setAnalysisError('Simpan atau buang koreksi sebelum mengganti file.');
        return;
      }
      setUploadFile(file);
      setIsImageUpload(file.type.startsWith('image/'));
      setAnalysisResult(null);
      setAnalysisError(null);
    }
  };

  const handleExecuteAnalysis = async () => {
    if (correctionPending) {
      setAnalysisError('Simpan atau buang koreksi sebelum menjalankan analisis baru.');
      return;
    }
    if (!uploadFile) {
      setAnalysisError('Silakan pilih atau jatuhkan file video mikroskopik terlebih dahulu.');
      return;
    }

    if (isImageUpload && linkedExamId) {
      setAnalysisError('Analisis citra belum bisa dikaitkan ke sampel. Pilih video, atau kosongkan pilihan sampel.');
      return;
    }

    const formData = new FormData();
    try {
      appendCalibration(formData, confThres);
    } catch (error) {
      setAnalysisError(getErrorMessage(error));
      return;
    }
    setAnalysisLoading(true);
    setAnalysisError(null);
    setProgressStatus({ stage: 'uploading', percent: 15, msg: 'Mengunggah file ke backend CASA-AI...' });

    const endpoint = `${API_BASE_URL}/api/${isImageUpload ? 'analyze_image' : 'analyze'}`;

    if (isImageUpload) {
      formData.append('image', uploadFile);
    } else {
      formData.append('video', uploadFile);
      if (linkedExamId) formData.append('examination_id', String(linkedExamId));
    }

    try {
      if (isImageUpload) {
        setProgressStatus({ stage: 'processing', percent: 60, msg: 'Menganalisis gambar sperma dengan YOLOv11...' });
        const res = await axios.post(endpoint, formData, {
          headers: { 'Content-Type': 'multipart/form-data', ...getAuthHeader() }
        });
        setAnalysisResult({
          analysis_id: res.data.analysis_id,
          revision: res.data.revision,
          data: res.data.data,
          video_url: `${API_BASE_URL}${res.data.video_url}`,
          heatmap_url: null,
          isImage: true
        });
        setProgressStatus({ stage: 'completed', percent: 100, msg: 'Analisis selesai!' });
      } else {
        const submitRes = await axios.post(endpoint, formData, {
          headers: { 'Content-Type': 'multipart/form-data', ...getAuthHeader() }
        });

        const { task_id } = submitRes.data;
        if (!task_id) throw new Error('Gagal menginisiasi task inferensi pada server.');

        let polling = true;
        while (polling) {
          await new Promise((r) => setTimeout(r, 1800));
          const progRes = await axios.get(`${API_BASE_URL}/api/progress/${task_id}`, { headers: getAuthHeader() });

          if (progRes.data.status === 'completed') {
            polling = false;
            const finalRes = progRes.data.result;
            if (finalRes.success) {
              setAnalysisResult({
                analysis_id: finalRes.analysis_id,
                revision: finalRes.revision,
                data: finalRes.data,
                video_url: `${API_BASE_URL}${finalRes.video_url}`,
                heatmap_url: `${API_BASE_URL}${finalRes.heatmap_url}`,
                isImage: false
              });
              setProgressStatus({ stage: 'completed', percent: 100, msg: 'Analisis pelacakan video selesai!' });
            } else {
              throw new Error(finalRes.error || 'Terjadi kesalahan pemrosesan pada pipeline model.');
            }
          } else if (progRes.data.status === 'processing') {
            const frame = progRes.data.frame || 1;
            const total = progRes.data.total_frames || 100;
            const pct = Math.min(95, Math.max(20, Math.round((frame / total) * 100)));
            setProgressStatus({
              stage: 'processing',
              percent: pct,
              msg: `ByteTrack melacak frame ${frame} dari ${total}...`
            });
          }
        }
      }
    } catch (err) {
      console.error(err);
      setAnalysisError(getErrorMessage(err));
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleSendToDoctor = async () => {
    if (correctionPending) {
      setAnalysisError('Hitung ulang atau buang koreksi sebelum menggunakan hasil.');
      return;
    }
    if (!linkedExamId) {
      setAnalysisError('Kaitkan hasil ke sampel terlebih dahulu (pilih sampel di "Kaitkan hasil ke sampel") agar bisa dikirim ke dokter.');
      return;
    }
    try {
      await axios.post(`${API_BASE_URL}/api/analysis/${analysisResult.analysis_id}/attach`, { examination_id: linkedExamId }, { headers: getAuthHeader() });
      await axios.post(`${API_BASE_URL}/api/examinations/${linkedExamId}/submit`, null, { headers: getAuthHeader() });
    } catch (error) {
      setAnalysisError(getErrorMessage(error));
      return;
    }
    try {
      const record = createAnalysisRecord(analysisResult, { sourceFile: uploadFile?.name });
      setRecords((prev) => [record, ...prev]);
    } catch {
      // catatan lokal hanya untuk tampilan; status di server sudah dikirim
    }
    setAnalysisError(null);
    setLinkedExamId(null);
    navigateTo('Patient Records');
  };

  if (!currentRoleObj) return null;

  return (
    <div className="dashboard-wrapper">
      {/* ─── 1. Left Vertical Dock Sidebar (Unified Modern Dock) ─── */}
      <aside className={`dock-sidebar ${dockExpanded ? 'expanded' : ''}`}>
        <div className="dock-panel">
          {/* Top: Brand Logo + tombol buka/ciutkan sidebar */}
          <div className="dock-header" title="CASA-AI Medical Portal" onClick={() => navigateTo(roleTabs[0])}>
            <BrandLogos size={30} />
            <span className="dock-brand-label">Menu {currentRoleObj.badge}</span>
          </div>

          <button
            className="dock-btn dock-toggle-btn"
            title={dockExpanded ? 'Sembunyikan nama menu' : 'Tampilkan nama menu'}
            data-tooltip="Tampilkan nama menu"
            aria-expanded={dockExpanded}
            onClick={toggleDock}
          >
            {dockExpanded ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
            <span className="dock-btn-label">Sembunyikan</span>
          </button>

          <div className="dock-divider" />

          {/* Main Navigation Items Tailored per Role */}
          <div className="dock-nav-group">
            {roleTabs.map((tabId) => {
              const { label, icon: TabIcon } = TAB_META[tabId];
              return (
                <button
                  key={tabId}
                  className={`dock-btn ${activeTab === tabId ? 'active' : ''}`}
                  title={label}
                  data-tooltip={label}
                  onClick={() => navigateTo(tabId)}
                >
                  <TabIcon size={20} />
                  <span className="dock-btn-label">{label}</span>
                </button>
              );
            })}
          </div>

          {/* Spacer */}
          <div className="dock-spacer" />

          {/* Bottom Utility Actions */}
          <div className="dock-bottom-group">
            <div className="dock-divider" />

            <button
              className="dock-btn"
              title="Kembali ke Beranda Utama (/)"
              data-tooltip="Beranda Utama"
              onClick={handleGoHome}
              style={{ color: 'var(--teal)' }}
            >
              <Home size={19} />
              <span className="dock-btn-label">Beranda Utama</span>
            </button>

            <button
              className="dock-btn"
              title={isDarkMode ? 'Beralih ke Mode Terang (Default)' : 'Beralih ke Mode Gelap'}
              data-tooltip={isDarkMode ? 'Mode Terang' : 'Mode Gelap'}
              onClick={() => setIsDarkMode(!isDarkMode)}
            >
              {isDarkMode ? <Sun size={19} color="#C1D72E" /> : <Moon size={19} color="#00AFA0" />}
              <span className="dock-btn-label">{isDarkMode ? 'Mode Terang' : 'Mode Gelap'}</span>
            </button>

            <button
              className="dock-btn"
              title="Keluar / Logout Akun"
              data-tooltip="Keluar Akun"
              onClick={handleLogout}
              style={{ color: '#EF4444' }}
            >
              <LogOut size={19} />
              <span className="dock-btn-label">Keluar</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ─── 2. Main Dashboard Surface ─── */}
      <main className="dashboard-surface">
        {/* Hero Greeting Section */}
        <section className="hero-greeting">
          <div className="greeting-text">
            <h2>{currentRoleObj.name}</h2>
            <p>{currentRoleObj.description}</p>
          </div>

          <div className="hero-quick-stats">
            <div className="live-indicator-pill">
              <span className="pulse-dot"></span>
              <span>{currentRoleObj.scope}</span>
            </div>
          </div>
        </section>

        {/* Batasan wewenang peran */}
        <p style={{ margin: '0 0 16px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          Batasan: {currentRoleObj.restrictedFeatures.join(' • ')}. Pembatasan menu ini belum diterapkan di server.
        </p>

        {/* ─── FRONT OFFICE: REGISTRASI PASIEN & SERAH TERIMA SAMPEL ─── */}
        {roleTabs.includes(activeTab) && activeTab === 'Registration' && <RegistrationPanel />}
        {roleTabs.includes(activeTab) && activeTab === 'Queue' && <PatientListPanel />}
        {roleTabs.includes(activeTab) && activeTab === 'Samples' && <SamplesPanel />}
        {roleTabs.includes(activeTab) && activeTab === 'Scan QR' && <FrontOfficeScanner />}

        {/* ─── PASIEN: LAPORAN MILIK SENDIRI ─── */}
        {roleTabs.includes(activeTab) && activeTab === 'My Queue' && <PatientQueuePanel />}
        {roleTabs.includes(activeTab) && activeTab === 'My Reports' && <MyReportsPanel />}
        {roleTabs.includes(activeTab) && activeTab === 'Account Settings' && <ChangePasswordPanel />}

        {/* ─── 1. DEDICATED VIEW: OVERVIEW / DASHBOARD ─── */}
        {roleTabs.includes(activeTab) && activeTab === 'Overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {currentRole === 'frontoffice' && <QueuePanel />}
            {(currentRole === 'frontoffice' || currentRole === 'analis') && <TodaySchedule />}
            {currentRole !== 'frontoffice' && (
              <>
                <DashboardOverview
                  records={records}
                  onAnalyze={can('runAnalysis') ? () => navigateTo('Analysis Lab') : undefined}
                />
                <AnalysisRecords records={records} title="Hasil analisis terbaru" />
              </>
            )}
          </div>
        )}

        {/* ─── 2. DEDICATED VIEW: DOKTER - ANTREAN VALIDASI KLINIS ─── */}
        {roleTabs.includes(activeTab) && activeTab === 'Perlu Validasi' && <ReviewPanel />}

        {/* ─── ANALIS: ANTREAN SAMPEL MASUK ─── */}
        {roleTabs.includes(activeTab) && activeTab === 'Incoming Samples' && (
          <SampleQueuePanel locked={correctionPending} onAnalyze={(item) => { setLinkedExamId(item.id); navigateTo('Analysis Lab'); }} />
        )}

        {/* ─── 3. DEDICATED VIEW: LABORATORIUM ANALISIS SEMEN (AI) ─── */}
        {roleTabs.includes(activeTab) && activeTab === 'Analysis Lab' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ScanEye size={24} color="var(--teal)" />
                  Laboratorium Analisis Semen AI (CASA Workspace)
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Model Deteksi Kepala Spermatozoa (YOLOv11-Nano) & Pelacakan Kinematika Multi-Objek (ByteTrack)
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span className="badge-pro" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Camera size={13} /> Sumber: unggahan video / citra
                </span>
                <span className="badge-pro" style={{ background: 'var(--teal-subtle)', color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={13} /> Deteksi YOLO + pelacakan ByteTrack
                </span>
              </div>
            </div>

            {/* 2-Column Lab Workspace */}
            <div className="analysis-workspace">
              {/* Left Column: Upload & Parameter Sliders */}
              <div className="card-box" style={{ padding: '20px' }}>
                <h4 style={{ fontSize: '0.94rem', fontWeight: 700, marginBottom: '12px' }}>
                  1. Input Media & Bilik Preparat
                </h4>

                {/* Dropzone */}
                <div
                  className="dropzone-box"
                  style={{ minHeight: '160px', padding: '20px 14px' }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*,image/*"
                    style={{ display: 'none' }}
                    onChange={handleFileDrop}
                  />
                  <div className="dropzone-icon" style={{ width: '44px', height: '44px' }}>
                    <UploadCloud size={22} />
                  </div>
                  <strong style={{ fontSize: '0.88rem', display: 'block', marginTop: '6px' }}>
                    {uploadFile ? uploadFile.name : 'Jatuhkan file video mikroskop di sini'}
                  </strong>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Mendukung .mp4, .webm, .avi atau citra mikrograf .jpg/.png
                  </span>
                  {uploadFile && (
                    <div style={{ marginTop: '8px' }}>
                      <span className="badge-pro" style={{ background: 'var(--lime-light)', color: 'var(--lime-dark)', fontSize: '0.68rem' }}>
                        {(uploadFile.size / 1024 / 1024).toFixed(2)} MB • Terpilih
                      </span>
                    </div>
                  )}
                </div>

                {currentRole === 'analis' && (
                  <LinkedSampleSelect value={linkedExamId} onChange={setLinkedExamId} disabled={analysisLoading} />
                )}

                <h4 style={{ fontSize: '0.94rem', fontWeight: 700, marginBottom: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                  2. Konfigurasi Parameter Analisis
                </h4>
                <ConfidenceField value={confThres} onChange={setConfThres} disabled={analysisLoading} />
                <p className="calibration-field-note">Preset kalibrasi dikunci oleh Super Admin / Kepala Laboratorium.</p>
                <CalibrationFields controls={calibrationControls} readOnly={analysisLoading || !can('editCalibration')} />
                <ParameterHelp name="analyze" />

                <button
                  className="action-pill-btn primary"
                  style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
                  onClick={handleExecuteAnalysis}
                  disabled={analysisLoading || !uploadFile || !calibrationReady || calibrationSaving}
                >
                  {analysisLoading ? <RefreshCw size={16} className="spin" /> : <Sparkles size={16} />}
                  <span>{analysisLoading ? 'Menjalankan Inferensi...' : 'Jalankan Analisis AI Sekarang'}</span>
                </button>

                {analysisLoading && (
                  <div className="analysis-progress-box" style={{ marginTop: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700 }}>
                      <span>{progressStatus.msg}</span>
                      <span style={{ color: 'var(--teal)' }}>{progressStatus.percent}%</span>
                    </div>
                    <div className="analysis-progress-bar">
                      <div className="analysis-progress-bar-fill" style={{ width: `${progressStatus.percent}%` }}></div>
                    </div>
                  </div>
                )}

                {analysisError && (
                  <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'rgba(239, 68, 68, 0.1)', color: '#DC2626', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertCircle size={14} />
                    <span>{analysisError}</span>
                  </div>
                )}
              </div>

              {/* Right Column: Visualizer & Results */}
              <div className="card-box" style={{ padding: '20px' }}>
                {!analysisResult ? (
                  <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Microscope size={48} color="var(--teal)" style={{ margin: '0 auto 14px', opacity: 0.8 }} />
                    <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                      Ruang Analisis Siap Digunakan
                    </h4>
                    <p style={{ fontSize: '0.84rem', maxWidth: '420px', margin: '0 auto 18px' }}>
                      Unggah rekaman atau citra preparat, lalu jalankan analisis untuk menampilkan hasil di sini.
                    </p>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                      <div>
                        <h4 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Hasil Analisis Kinematika</h4>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                          Inferensi selesai • {analysisResult.data?.summary?.total_sperm ?? 'N/A'} {analysisResult.data?.summary?.count_method === 'median_detections_per_frame' ? 'median deteksi per frame' : 'deteksi'} • Kedalaman {analysisResult.data?.calibration?.chamber_depth ?? 'N/A'} µm
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button className="action-pill-btn primary" style={{ fontSize: '0.75rem', height: '28px', padding: '0 12px' }} onClick={() => {
                          // Find dan click DetectionEditor button
                          setTimeout(() => {
                            const detectionEditorBtn = document.querySelector('[aria-label*="Koreksi kotak"] button, .detection-editor-toggle');
                            if (!detectionEditorBtn) {
                              // Fallback: find by text content
                              const allButtons = Array.from(document.querySelectorAll('button'));
                              const btn = allButtons.find(b => b.textContent?.includes('Koreksi kotak deteksi'));
                              btn?.click();
                            } else {
                              detectionEditorBtn.click();
                            }
                          }, 0);
                        }}>
                          ✏️ Koreksi Deteksi
                        </button>
                        <div className="center-nav-pill" style={{ padding: '2px' }}>
                          <button
                            className={`nav-tab-btn ${activeResultTab === 'annotated' ? 'active' : ''}`}
                            style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                            onClick={() => setActiveResultTab('annotated')}
                          >
                            Media Pelacakan
                          </button>
                          {analysisResult.heatmap_url && (
                            <button
                              className={`nav-tab-btn ${activeResultTab === 'heatmap' ? 'active' : ''}`}
                              style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                              onClick={() => setActiveResultTab('heatmap')}
                            >
                              Peta Panas (Heatmap)
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Media Display */}
                    {analysisResult.video_url ? (
                      <div style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', background: '#000', marginBottom: '16px' }}>
                        {activeResultTab === 'annotated' ? (
                          <>{analysisResult.isImage ? <img src={analysisResult.video_url} alt="Hasil deteksi citra" style={{ width: '100%', maxHeight: '280px', objectFit: 'contain' }} /> : (<>
                            <video key={`${analysisResult.analysis_id}-${analysisResult.revision ?? 0}`} ref={previewRef} src={analysisResult.video_url} controls onError={() => setPreviewFailed(true)} onLoadedData={() => setPreviewFailed(false)} style={{ width: '100%', maxHeight: '280px', display: 'block' }} />
                            {previewFailed && <p role="alert" style={{ padding: '8px 12px', fontSize: '0.75rem', color: '#FCA5A5' }}>Preview hasil tidak dapat dimuat. Coba muat ulang halaman atau simpan koreksi lagi.</p>}
                          </>)}</>
                        ) : (
                          <img src={analysisResult.heatmap_url} alt="Heatmap" style={{ width: '100%', maxHeight: '280px', objectFit: 'contain' }} />
                        )}
                      </div>
                    ) : (
                      <div style={{ padding: '16px', background: 'var(--bg-card-alt)', borderRadius: 'var(--radius-md)', marginBottom: '16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Media hasil tidak tersedia.
                      </div>
                    )}

                    {analysisResult.analysis_id ? (
                      <DetectionEditor
                        key={analysisResult.analysis_id}
                        analysisId={analysisResult.analysis_id}
                        onPendingChange={setCorrectionPending}
                        onOpen={() => previewRef.current?.pause()}
                        onSave={(result) => {
                          setPreviewFailed(false);
                          setAnalysisResult((previous) => ({ ...previous, ...result, video_url: `${API_BASE_URL}${result.video_url}`, heatmap_url: result.heatmap_url ? `${API_BASE_URL}${result.heatmap_url}` : null }));
                          setActiveResultTab('annotated');
                          setAnalysisError(null);
                        }}
                      />
                    ) : <p>Hasil lama belum menyimpan kotak yang bisa diedit. Jalankan analisis ulang untuk menggunakan koreksi.</p>}
                    {correctionPending && <p role="status">Ada koreksi belum diterapkan. Simpan dan hitung ulang sebelum menggunakan hasil ini.</p>}
                    <CalibrationSummary data={analysisResult.data} />
                    {/* Motility Subsets Breakdown */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
                      <div className="stat-tile" style={{ minHeight: 'auto', padding: '12px' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Konsentrasi</span>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                          {formatMeasurement(analysisResult.data?.summary?.estimated_concentration, 'M/mL', 2)}
                        </div>
                      </div>

                      <div className="stat-tile" style={{ minHeight: 'auto', padding: '12px' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--teal)' }}>Progressive (PR)</span>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--teal)' }}>
                          {formatMotility(analysisResult.data, 'progressive_percent')}
                        </div>
                      </div>

                      <div className="stat-tile" style={{ minHeight: 'auto', padding: '12px' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--lime-dark)' }}>Non-Prog (NP)</span>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--lime-dark)' }}>
                          {formatMotility(analysisResult.data, 'non_progressive_percent')}
                        </div>
                      </div>

                      <div className="stat-tile" style={{ minHeight: 'auto', padding: '12px' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Immotile (IM)</span>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-secondary)' }}>
                          {formatMotility(analysisResult.data, 'immotile_percent')}
                        </div>
                      </div>
                    </div>

                    <KinematicsMetrics data={analysisResult.data} />

                    <MotionAvailability data={analysisResult.data} />

                    {/* Save to records action */}
                      <div className="analysis-review-action">
                        <AnalysisInterpretation data={analysisResult.data} />
                        <button
                          type="button"
                          className="action-pill-btn primary analysis-review-submit"
                          disabled={correctionPending}
                          onClick={handleSendToDoctor}
                        >
                          <CheckCircle2 size={20} />
                        <span>Kirim untuk Ditinjau Dokter →</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── 4. DEDICATED VIEW: MASTER PATIENT RECORDS DATABASE ─── */}
        {roleTabs.includes(activeTab) && activeTab === 'Patient Records' && (
          <>
            <AnalysisRecords records={records} title="Rekam hasil analisis sesi ini" />
          </>
        )}

        {/* ─── 5. DEDICATED VIEW: STANDAR WHO 6th & KENDALI MUTU (QC) ─── */}
        {roleTabs.includes(activeTab) && activeTab === 'Quality Control' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={24} color="var(--teal)" />
                  Kendali Mutu & Standar Acuan WHO Manual ke-6 (2021)
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Pusat verifikasi kalibrasi bilik preparat dan batas persentil ke-5 (5th percentile lower reference limits)
                </p>
              </div>
            </div>

            {/* Top 3 Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
              <div className="card-box" style={{ padding: '16px' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>STANDAR ACUAN RESMI</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--teal)', marginTop: '4px' }}>WHO Manual 6th Edition (2021)</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>Acuan global pemeriksaan semen manusia</div>
              </div>
              <div className="card-box" style={{ padding: '16px' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>VERIFIKASI BILIK HITUNG</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>{calibration.chamber_type} • {chamberDepth} µm</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--lime-dark)', marginTop: '2px' }}>Verifikasi optik dan bilik tetap memerlukan pemeriksaan fisik</div>
              </div>
              <div className="card-box" style={{ padding: '16px' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>KENDALI MUTU HARIAN</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#10B981', marginTop: '4px' }}>
                  {Object.values(qcChecks).filter(Boolean).length} / 5 Indikator Lolos
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>Pemeriksaan harian laboratorium aktif</div>
              </div>
            </div>

            {/* Reference Table */}
            <section className="bottom-table-card">
              <div className="table-header-row">
                <div>
                  <div className="table-title">Nilai Batas Rujukan Bawah WHO 6th vs WHO 5th</div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Parameter persentil ke-5 populasi pria subur (95% CI)
                  </div>
                </div>
              </div>

              <div className="casa-table-wrap">
                <table className="casa-table">
                  <thead>
                    <tr>
                      <th>Parameter Evaluasi</th>
                      <th>WHO 5th Edition (2010)</th>
                      <th>WHO 6th Edition (2021)</th>
                      <th>Metode Pemeriksaan</th>
                      <th>Status Klinis</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Volume Semen</strong></td>
                      <td>1.5 mL</td>
                      <td><strong style={{ color: 'var(--teal)' }}>1.4 mL</strong> (1.3 - 1.5)</td>
                      <td>Pipet volumetrik / timbangan analitik</td>
                      <td><span className="badge-pro" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>STANDAR</span></td>
                    </tr>
                    <tr>
                      <td><strong>Konsentrasi Sperma</strong></td>
                      <td>15 Juta / mL</td>
                      <td><strong style={{ color: 'var(--teal)' }}>16 Juta / mL</strong> (15 - 18)</td>
                      <td>Bilik Makler 10µm / CASA YOLOv11</td>
                      <td><span className="badge-pro" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>STANDAR</span></td>
                    </tr>
                    <tr>
                      <td><strong>Total Jumlah Sperma</strong></td>
                      <td>39 Juta / ejakulat</td>
                      <td><strong style={{ color: 'var(--teal)' }}>39 Juta / ejakulat</strong> (35 - 40)</td>
                      <td>Konsentrasi × Volume total</td>
                      <td><span className="badge-pro" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>STANDAR</span></td>
                    </tr>
                    <tr>
                      <td><strong>Motilitas Total (PR + NP)</strong></td>
                      <td>40%</td>
                      <td><strong style={{ color: 'var(--teal)' }}>42%</strong> (40 - 43)</td>
                      <td>Pelacakan otomatis ByteTrack</td>
                      <td><span className="badge-pro" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>STANDAR</span></td>
                    </tr>
                    <tr>
                      <td><strong>Motilitas Progresif (PR)</strong></td>
                      <td>32%</td>
                      <td><strong style={{ color: 'var(--lime-dark)' }}>30%</strong> (29 - 31)</td>
                      <td>Kecepatan VCL ≥ 25 µm/s & LIN ≥ 0.5</td>
                      <td><span className="badge-pro" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>STANDAR</span></td>
                    </tr>
                    <tr>
                      <td><strong>Vitalitas (Sel Hidup)</strong></td>
                      <td>58%</td>
                      <td><strong style={{ color: 'var(--teal)' }}>54%</strong> (50 - 56)</td>
                      <td>Pewarnaan Eosin-Nigrosin / HOS Test</td>
                      <td><span className="badge-pro" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>STANDAR</span></td>
                    </tr>
                    <tr>
                      <td><strong>Morfologi Normal</strong></td>
                      <td>4%</td>
                      <td><strong style={{ color: 'var(--teal)' }}>4%</strong> (3.9 - 4.5)</td>
                      <td>Kriteria ketat Tygerberg / Papanicolaou</td>
                      <td><span className="badge-pro" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>STANDAR</span></td>
                    </tr>
                    <tr>
                      <td><strong>pH Semen</strong></td>
                      <td>≥ 7.2</td>
                      <td><strong style={{ color: 'var(--teal)' }}>≥ 7.2</strong></td>
                      <td>Kertas indikator pH rentang 6.0 - 10.0</td>
                      <td><span className="badge-pro" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>STANDAR</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Interactive Daily Chamber QC Checklist */}
            <section className="bottom-table-card">
              <div className="table-header-row">
                <div>
                  <div className="table-title">Daftar Periksa Kendali Mutu Harian (Daily QC Checklist)</div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Verifikasi fisik mikroskop dan bilik hitung sebelum pengujian pasien
                  </div>
                </div>
                <span className="badge-pro" style={{ background: 'var(--teal-subtle)', color: 'var(--teal)' }}>
                  ISO 15189 Form QC-04
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                {[
                  { id: 'grid', label: 'Kalibrasi Grid Makler Chamber (100 kotak @ 0.1 x 0.1 mm) terverifikasi dengan mikrometer objektif' },
                  { id: 'temp', label: 'Pemanas Meja Benda (Heated Stage) Mikroskop stabil pada suhu 37.0°C ± 0.5°C' },
                  { id: 'liquefaction', label: 'Inkubasi likuefaksi sampel semen lengkap (30 - 60 menit) sebelum preparasi bilik hitung' },
                  { id: 'chamber', label: 'Cincin interferensi Newton terlihat merata pada kaca penutup (memastikan ketebalan tepat 20 µm)' },
                  { id: 'debris', label: 'Pemeriksaan blanko visual: Tidak ada partikel debu / kristal yang mengganggu pelacakan sel sperma' }
                ].map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleToggleQcCheck(item.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      borderRadius: 'var(--radius-md)',
                      background: qcChecks[item.id] ? 'var(--teal-subtle)' : 'var(--bg-card-alt)',
                      border: `1px solid ${qcChecks[item.id] ? 'var(--teal-light)' : 'var(--border)'}`,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={qcChecks[item.id]}
                      onChange={() => {}}
                      style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                    />
                    <span style={{ fontSize: '0.84rem', color: 'var(--text-primary)', fontWeight: qcChecks[item.id] ? 600 : 400 }}>
                      {item.label}
                    </span>
                    {qcChecks[item.id] && (
                      <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--teal)', fontWeight: 700 }}>
                        ✓ Lolos Verifikasi
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ─── 6. DEDICATED VIEW: DOKTER & ADMIN - LAPORAN HASIL LAB & SERTIFIKASI ─── */}
        {roleTabs.includes(activeTab) && activeTab === 'Lab Reports' && <ReleaseReportsPanel />}

        {/* ─── 7. DEDICATED VIEW: LABORAN & ADMIN - KALIBRASI HARDWARE & BILIK ─── */}
        {roleTabs.includes(activeTab) && activeTab === 'Calibration' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sliders size={24} color="var(--teal)" />
                  Kalibrasi Analisis Mikroskop & Bilik Hitung
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Konfigurasi parameter analisis tersimpan di server; tidak mengubah perangkat keras mikroskop secara langsung
                </p>
              </div>
              {calibSaved && !calibrationDirty && (
                <span className="badge-pro" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Check size={14} /> Konfigurasi Berhasil Disimpan
                </span>
              )}
            </div>

            <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--teal-subtle)', border: '1px solid var(--teal-light)', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
              <strong>Wewenang Super Admin / Kepala Laboratorium:</strong> preset yang disimpan di sini dipakai analis saat menjalankan analisis.
            </div>

            {/* 2-Column Calibration Workspace */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {/* Left Column: Sliders Form */}
              <div className="card-box" style={{ padding: '22px' }}>
                <h4 style={{ fontSize: '0.96rem', fontWeight: 700, marginBottom: '16px' }}>
                  Parameter Optik & Komputasi
                </h4>

                <CalibrationFields controls={calibrationControls} readOnly={!can('editCalibration')} />
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button className="action-pill-btn secondary" onClick={resetCalibration} disabled={!can('editCalibration') || calibrationControls.calibrationLoading || calibrationSaving}>
                    Reset Default
                  </button>
                  <button className="action-pill-btn primary" onClick={() => handleSaveCalibration()} disabled={!can('editCalibration') || !calibrationReady || calibrationSaving}>
                    <Check size={15} />
                    {calibrationSaving ? 'Menyimpan...' : 'Simpan Konfigurasi ke Server'}
                  </button>
                </div>
              </div>

              {/* Right Column: Visual Chamber Grid Preview */}
              <div className="card-box" style={{ padding: '22px' }}>
                <h4 style={{ fontSize: '0.96rem', fontWeight: 700, marginBottom: '14px' }}>
                  Ilustrasi Grid Bilik (bukan alat pengukuran skala)
                </h4>

                <div
                  style={{
                    width: '100%',
                    height: '240px',
                    background: '#0B0F17',
                    borderRadius: 'var(--radius-md)',
                    border: '1.5px solid var(--border)',
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(10, 1fr)',
                    gridTemplateRows: 'repeat(10, 1fr)'
                  }}
                >
                  {Array.from({ length: 100 }).map((_, i) => (
                    <div
                      key={i}
                      style={{
                        borderRight: '1px solid rgba(0, 175, 160, 0.25)',
                        borderBottom: '1px solid rgba(0, 175, 160, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {i === 44 && (
                        <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#00AFA0', boxShadow: '0 0 6px #00AFA0' }} />
                      )}
                      {i === 55 && (
                        <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#C1D72E', boxShadow: '0 0 6px #C1D72E' }} />
                      )}
                    </div>
                  ))}
                  {/* Scale Indicator */}
                  <div style={{ position: 'absolute', bottom: '8px', right: '12px', background: 'rgba(0,0,0,0.7)', padding: '3px 8px', borderRadius: '4px', fontSize: '0.68rem', color: '#00AFA0', fontWeight: 700 }}>
                    Skala masukan: {pixelScale} µm/px • Kedalaman: {chamberDepth} µm
                  </div>
                </div>

                <div style={{ marginTop: '16px', background: 'var(--bg-card-alt)', padding: '14px', borderRadius: 'var(--radius-md)', fontSize: '0.78rem' }}>
                  <div style={{ fontWeight: 700, color: 'var(--teal)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Compass size={15} />
                    <span>Rumus Konsentrasi Berdasarkan Bidang Pandang:</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    Volume = lebar (px) × tinggi (px) × {pixelScale}² × {chamberDepth} µm³.<br />
                    Konsentrasi (juta/mL) = jumlah median sel per frame × {dilutionFactor} × 10⁶ / volume (µm³).<br />
                    Skala harus diukur dari citra mikrometer, bukan dari ilustrasi grid ini.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── 8. DEDICATED VIEW: ADMIN - USER & STAFF MANAGEMENT ─── */}
        {roleTabs.includes(activeTab) && activeTab === 'Dashboard' && <OpsDashboardPanel />}
        {roleTabs.includes(activeTab) && activeTab === 'Report History' && (
          currentRoleObj.id === 'superadmin' ? <AdminReportHistoryPanel /> : <PhysicianReportHistoryPanel />
        )}
        {roleTabs.includes(activeTab) && activeTab === 'User Management' && <UsersPanel />}

        {/* ─── 9. DEDICATED VIEW: ADMIN - SERVER GPU CUDA & AUDIT LOGS ─── */}
        {roleTabs.includes(activeTab) && activeTab === 'Server Logs' && <AuditPanel />}
      </main>

    </div>
  );
}
