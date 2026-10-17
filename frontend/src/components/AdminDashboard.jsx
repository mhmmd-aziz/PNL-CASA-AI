import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../api.js';
import {
  LayoutGrid,
  PanelLeftOpen,
  PanelLeftClose,
  ScanEye,
  Microscope,
  Users,
  ShieldCheck,
  FileText,
  Sliders,
  HelpCircle,
  LogOut,
  Sun,
  Moon,
  Search,
  Bell,
  Info,
  ChevronDown,
  Plus,
  Play,
  ArrowUpRight,
  TrendingUp,
  Activity,
  Compass,
  CheckCircle2,
  AlertCircle,
  Download,
  UploadCloud,
  X,
  Eye,
  RefreshCw,
  Cpu,
  Layers,
  Sparkles,
  Camera,
  UserCheck,
  KeyRound,
  Database,
  Check,
  Stethoscope,
  ArrowLeft,
  Home,
  Printer,
  Award,
  Mail,
  RotateCw,
  Pause,
  User,
  Clock
} from 'lucide-react';
import { ROLES, getCurrentUser, logout, loginAsRole } from '../auth';
import { useCalibration, getErrorMessage, formatMotility } from '../calibration';
import { CalibrationFields, CalibrationSummary, MotionAvailability, AnalysisInterpretation, KinematicsMetrics, TrackingQuality } from './CalibrationControls';
import ParameterHelp from './ParameterHelp';

// Initial Mock Analysis Records matching WHO 6th Criteria
const INITIAL_RECORDS = [
  {
    id: 'SMP_2026_00891',
    patientName: 'Budi Pratama (31 th)',
    clinic: 'Klinik Fertilitas Harapan',
    concentration: '48.5 M/mL',
    motilityRate: '72.4%',
    progRate: '54.2%',
    nonProgRate: '18.2%',
    status: 'Normozoospermia',
    statusType: 'normo',
    date: '24 Sep, 2026 08:30 AM',
    vcl: 58.4,
    vsl: 34.6,
    vap: 42.1,
    lin: 59.2,
    str: 82.1,
    wob: 72.0,
    alh: 3.2,
    bcf: 18.5,
    sampleVolume: '2.8 mL',
    viscosity: 'Normal',
    verifiedBy: 'Dr. Sajibur Rahman, Sp.And'
  },
  {
    id: 'SMP_2026_00892',
    patientName: 'Ahmad Fauzi (34 th)',
    clinic: 'RSIA Andrologi Sentosa',
    concentration: '12.4 M/mL',
    motilityRate: '28.5%',
    progRate: '18.0%',
    nonProgRate: '10.5%',
    status: 'Oligoasthenozoospermia',
    statusType: 'oligo',
    date: '24 Sep, 2026 07:45 AM',
    vcl: 28.2,
    vsl: 14.1,
    vap: 20.3,
    lin: 50.0,
    str: 69.4,
    wob: 72.0,
    alh: 1.8,
    bcf: 11.2,
    sampleVolume: '1.9 mL',
    viscosity: 'Tinggi',
    verifiedBy: 'Menunggu Verifikasi Dokter'
  },
  {
    id: 'SMP_2026_00893',
    patientName: 'Reza Rahardian (29 th)',
    clinic: 'Lab Biomedika Terpadu',
    concentration: '56.0 M/mL',
    motilityRate: '68.0%',
    progRate: '51.4%',
    nonProgRate: '16.6%',
    status: 'Normozoospermia',
    statusType: 'normo',
    date: '23 Sep, 2026 04:15 PM',
    vcl: 62.1,
    vsl: 38.4,
    vap: 46.5,
    lin: 61.8,
    str: 82.5,
    wob: 74.8,
    alh: 3.5,
    bcf: 20.1,
    sampleVolume: '3.4 mL',
    viscosity: 'Normal',
    verifiedBy: 'Dr. Sajibur Rahman, Sp.And'
  },
  {
    id: 'SMP_2026_00894',
    patientName: 'Hendro Wijaya (36 th)',
    clinic: 'Pusat Inseminasi Andro',
    concentration: '38.0 M/mL',
    motilityRate: '31.2%',
    progRate: '22.0%',
    nonProgRate: '9.2%',
    status: 'Asthenozoospermia',
    statusType: 'astheno',
    date: '23 Sep, 2026 01:20 PM',
    vcl: 34.5,
    vsl: 18.2,
    vap: 24.8,
    lin: 52.7,
    str: 73.3,
    wob: 71.8,
    alh: 2.1,
    bcf: 13.0,
    sampleVolume: '2.5 mL',
    viscosity: 'Normal',
    verifiedBy: 'Menunggu Verifikasi Dokter'
  },
  {
    id: 'SMP_2026_00895',
    patientName: 'Dimas Anggara (33 th)',
    clinic: 'RS Medika Prima',
    concentration: '64.2 M/mL',
    motilityRate: '75.8%',
    progRate: '58.0%',
    nonProgRate: '17.8%',
    status: 'Normozoospermia',
    statusType: 'normo',
    date: '23 Sep, 2026 10:00 AM',
    vcl: 65.4,
    vsl: 40.2,
    vap: 48.9,
    lin: 61.4,
    str: 82.2,
    wob: 74.7,
    alh: 3.8,
    bcf: 21.4,
    sampleVolume: '3.0 mL',
    viscosity: 'Normal',
    verifiedBy: 'Dr. Sajibur Rahman, Sp.And'
  }
];

// Stacked Bar Chart Data
const CHART_SESSIONS = [
  { label: '00', pr: 42, np: 20, im: 38, count: 210 },
  { label: 'Jan', pr: 55, np: 18, im: 27, count: 280 },
  { label: 'Feb', pr: 48, np: 22, im: 30, count: 240 },
  { label: 'Mar', pr: 62, np: 16, im: 22, count: 320 },
  { label: 'Apr', pr: 58, np: 19, im: 23, count: 310 },
  { label: 'May', pr: 66, np: 14, im: 20, count: 370 },
  { label: 'Jun', pr: 52, np: 24, im: 24, count: 290 },
  { label: 'Jul', pr: 59, np: 18, im: 23, count: 340 },
  { label: 'Aug', pr: 64, np: 15, im: 21, count: 390 }
];

// Role-specific navigation tabs config with dock synchronization
const ROLE_TABS = {
  admin: [
    { id: 'Overview', dock: 'dashboard', label: 'Overview Sistem & Lab', icon: LayoutGrid },
    { id: 'Analysis Lab', dock: 'analysis', label: 'Analysis Lab (AI)', icon: ScanEye },
    { id: 'Patient Records', dock: 'patients', label: 'Database Pasien', icon: Users },
    { id: 'Quality Control', dock: 'qc', label: 'Standar WHO 6th', icon: ShieldCheck },
    { id: 'Lab Reports', dock: 'reports', label: 'Laporan Medis', icon: FileText },
    { id: 'Calibration', dock: 'calibration', label: 'Kalibrasi Hardware', icon: Sliders },
    { id: 'User Management', dock: 'users', label: 'Manajemen Pengguna', icon: UserCheck },
    { id: 'Server Logs', dock: 'server', label: 'Telemetri GPU CUDA', icon: Cpu }
  ],
  dokter: [
    { id: 'Overview', dock: 'dashboard', label: 'Overview Klinis', icon: LayoutGrid },
    { id: 'Perlu Validasi', dock: 'validation', label: 'Perlu Validasi', icon: Stethoscope },
    { id: 'Patient Records', dock: 'patients', label: 'Rekam Medis Pasien', icon: Users },
    { id: 'Quality Control', dock: 'qc', label: 'Standar WHO 6th', icon: ShieldCheck },
    { id: 'Lab Reports', dock: 'reports', label: 'Laporan & Tanda Tangan', icon: FileText }
  ],
  laboran: [
    { id: 'Overview', dock: 'dashboard', label: 'Overview Laboratorium', icon: LayoutGrid },
    { id: 'Analysis Lab', dock: 'analysis', label: 'Uji Preparat Semen', icon: ScanEye },
    { id: 'Calibration', dock: 'calibration', label: 'Kalibrasi Bilik Makler', icon: Sliders },
    { id: 'Patient Records', dock: 'patients', label: 'Antrean Preparat', icon: Users },
    { id: 'Quality Control', dock: 'qc', label: 'Kendali Mutu Bilik', icon: ShieldCheck }
  ]
};

export default function AdminDashboard({ onSwitchToPublic }) {
  const navigate = useNavigate();
  const handleGoHome = () => {
    if (onSwitchToPublic) {
      onSwitchToPublic();
    } else {
      navigate('/');
    }
  };

  // Auth User & Role State (admin | dokter | laboran)
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser() || ROLES.dokter);
  const [currentRole, setCurrentRole] = useState(() => (currentUser ? currentUser.role || currentUser.id : 'dokter'));

  // Dynamic sample records with doctor approval capability
  const [records, setRecords] = useState(INITIAL_RECORDS);
  const pendingValidationCount = records.filter((r) => r.verifiedBy === 'Menunggu Verifikasi Dokter').length;

  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      setCurrentUser(user);
      setCurrentRole(user.role || user.id);
    } else {
      // Jika belum terautentikasi, arahkan ke halaman login
      navigate('/login');
    }
  }, [navigate]);

  const handleRoleChange = (roleId) => {
    const res = loginAsRole(roleId);
    if (res.success) {
      setCurrentRole(roleId);
      setCurrentUser(res.user);
      setActiveTab('Overview');
      setActiveDock('dashboard');
      setShowRoleModal(false);
    }
  };

  const handleApproveSample = (sampleId) => {
    setRecords((prev) =>
      prev.map((r) =>
        r.id === sampleId ? { ...r, verifiedBy: currentRoleObj.user } : r
      )
    );
    if (selectedRecord && selectedRecord.id === sampleId) {
      setSelectedRecord((prev) => ({ ...prev, verifiedBy: currentRoleObj.user }));
    }
    alert(`[VALIDASI DOKTER SUKSES] Hasil analisa sampel #${sampleId} telah disahkan dan ditandatangani secara digital oleh ${currentRoleObj.user}.`);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Navigation & Theme
  const [activeTab, setActiveTab] = useState('Overview');
  const [activeDock, setActiveDock] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Synchronized navigation between dock and capsule tabs
  const navigateTo = (tabId, dockId) => {
    setActiveTab(tabId);
    if (dockId) {
      setActiveDock(dockId);
    } else {
      const tabsForRole = ROLE_TABS[currentRole] || ROLE_TABS.dokter;
      const found = tabsForRole.find((t) => t.id === tabId);
      if (found) setActiveDock(found.dock);
    }
  };

  // State for Lab Reports & Certification Suite
  const [selectedReportId, setSelectedReportId] = useState('SMP_2026_00891');

  // State for Quality Control Checklist
  const [qcChecks, setQcChecks] = useState({
    grid: true,
    temp: true,
    liquefaction: true,
    chamber: true,
    debris: false
  });
  const handleToggleQcCheck = (key) => {
    setQcChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // State for Calibration feedback
  const [calibSaved, setCalibSaved] = useState(false);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedRecords, setSelectedRecords] = useState([]);

  // Modals
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCalibModal, setShowCalibModal] = useState(false);
  const [showGuidelinesModal, setShowGuidelinesModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);

  const [confThres, setConfThres] = useState(0.25);
  const calibrationControls = useCalibration();
  const { calibration, resetCalibration, saveCalibration, appendCalibration, calibrationReady, calibrationSaving, calibrationDirty } = calibrationControls;
  const { pixel_scale: pixelScale, fps, chamber_depth: chamberDepth, dilution_factor: dilutionFactor } = calibration;

  const handleSaveCalibration = async (closeModal = false) => {
    setCalibSaved(false);
    try {
      await saveCalibration();
      setCalibSaved(true);
      if (closeModal) setShowCalibModal(false);
    } catch {
      setCalibSaved(false);
    }
  };

  // File Upload & AI Execution state
  const [uploadFile, setUploadFile] = useState(null);
  const [isImageUpload, setIsImageUpload] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [progressStatus, setProgressStatus] = useState({ stage: 'idle', percent: 0, msg: '' });
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisError, setAnalysisError] = useState(null);
  const [activeResultTab, setActiveResultTab] = useState('annotated');

  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);

  // Toggle Theme
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [isDarkMode]);

  // Trajectory simulation animation in Detail Modal
  useEffect(() => {
    if (!showDetailModal || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const particles = Array.from({ length: 45 }, () => {
      const type = Math.random() > 0.35 ? 'pr' : Math.random() > 0.4 ? 'np' : 'im';
      return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: type === 'pr' ? (Math.random() - 0.5) * 4 + 2 : type === 'np' ? (Math.random() - 0.5) * 1.5 : (Math.random() - 0.5) * 0.2,
        vy: type === 'pr' ? (Math.random() - 0.5) * 2 : type === 'np' ? (Math.random() - 0.5) * 1.5 : (Math.random() - 0.5) * 0.2,
        history: [],
        type,
        color: type === 'pr' ? '#00AFA0' : type === 'np' ? '#C1D72E' : '#64748B'
      };
    });

    const render = () => {
      ctx.fillStyle = 'rgba(11, 15, 23, 0.25)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        p.history.push({ x: p.x, y: p.y });
        if (p.history.length > 20) p.history.shift();

        if (p.history.length > 1) {
          ctx.beginPath();
          ctx.moveTo(p.history[0].x, p.history[0].y);
          for (let i = 1; i < p.history.length; i++) {
            ctx.lineTo(p.history[i].x, p.history[i].y);
          }
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.type === 'pr' ? 1.8 : 1.2;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.type === 'pr' ? 2.5 : 2, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = p.type === 'pr' ? 6 : 2;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [showDetailModal]);

  // Filter records
  const filteredRecords = records.filter((rec) => {
    const matchesSearch =
      rec.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rec.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rec.clinic.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rec.status.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'PENDING' && rec.verifiedBy === 'Menunggu Verifikasi Dokter') ||
      (statusFilter === 'NORMO' && rec.statusType === 'normo') ||
      (statusFilter === 'ASTHENO' && rec.statusType === 'astheno') ||
      (statusFilter === 'OLIGO' && rec.statusType === 'oligo');

    const matchesValidationTab =
      activeTab !== 'Perlu Validasi' || rec.verifiedBy === 'Menunggu Verifikasi Dokter';

    return matchesSearch && matchesStatus && matchesValidationTab;
  });

  const handleFileDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer ? e.dataTransfer.files[0] : e.target.files[0];
    if (file) {
      setUploadFile(file);
      setIsImageUpload(file.type.startsWith('image/'));
      setAnalysisResult(null);
      setAnalysisError(null);
    }
  };

  const handleExecuteAnalysis = async () => {
    if (!uploadFile) {
      setAnalysisError('Silakan pilih atau jatuhkan file video mikroskopik terlebih dahulu.');
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
    }

    try {
      if (isImageUpload) {
        setProgressStatus({ stage: 'processing', percent: 60, msg: 'Menganalisis gambar sperma dengan YOLOv11...' });
        const res = await axios.post(endpoint, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        setAnalysisResult({
          data: res.data.data,
          video_url: `${API_BASE_URL}${res.data.video_url}`,
          heatmap_url: null,
          isImage: true
        });
        setProgressStatus({ stage: 'completed', percent: 100, msg: 'Analisis selesai!' });
      } else {
        const submitRes = await axios.post(endpoint, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        const { task_id } = submitRes.data;
        if (!task_id) throw new Error('Gagal menginisiasi task inferensi pada server.');

        let polling = true;
        while (polling) {
          await new Promise((r) => setTimeout(r, 1800));
          const progRes = await axios.get(`${API_BASE_URL}/api/progress/${task_id}`);

          if (progRes.data.status === 'completed') {
            polling = false;
            const finalRes = progRes.data.result;
            if (finalRes.success) {
              setAnalysisResult({
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

  const handleLoadDemo = () => {
    setAnalysisLoading(true);
    setAnalysisError(null);
    setProgressStatus({ stage: 'processing', percent: 30, msg: 'Memuat sampel video mikroskopik Makler Chamber...' });

    setTimeout(() => {
      setProgressStatus({ stage: 'processing', percent: 75, msg: 'ByteTrack melacak lintasan sel sperma (45 tracks)...' });
      setTimeout(() => {
        setAnalysisResult({
          isImage: false,
          isDemo: true,
          video_url: null,
          heatmap_url: null,
          data: {
            summary: {
              total_sperm: 52,
              estimated_concentration: 48.6,
              progressive_percent: 58.4,
              non_progressive_percent: 16.2,
              immotile_percent: 25.4,
              motility_available: true,
            },
            motion: {
              average_speed: 58.4,
              average_straight_line_speed: 34.6,
              average_linearity: 34.6 / 58.4,
            },
          }
        });
        setProgressStatus({ stage: 'completed', percent: 100, msg: 'Sampel demo berhasil dimuat!' });
        setAnalysisLoading(false);
      }, 700);
    }, 600);
  };

  const toggleSelectRecord = (id) => {
    setSelectedRecords((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  };

  const currentRoleObj = ROLES[currentRole] || ROLES.dokter;
  const selectedReport = records.find((r) => r.id === selectedReportId) || records[0];

  const handleSaveAnalysisToRecords = () => {
    if (!analysisResult) return;
    if (analysisResult.isDemo) {
      setAnalysisError('Data simulasi tidak dapat disimpan sebagai hasil pemeriksaan. Jalankan inferensi pada sampel aktual.');
      return;
    }
    const newId = `SMP_2026_00${Math.floor(896 + Math.random() * 90)}`;
    const summary = analysisResult.data?.summary;
    const motion = analysisResult.data?.motion;
    const motilityAvailable = summary?.motility_available !== false;
    const newRecord = {
      id: newId,
      patientName: 'Pasien Analisis Baru',
      clinic: 'Lab Biomedika Andrologi',
      concentration: `${(summary?.estimated_concentration ?? 0).toFixed(2)} M/mL`,
      motilityRate: motilityAvailable ? `${((summary?.progressive_percent ?? 0) + (summary?.non_progressive_percent ?? 0)).toFixed(1)}%` : 'N/A',
      progRate: formatMotility(analysisResult.data, 'progressive_percent'),
      nonProgRate: formatMotility(analysisResult.data, 'non_progressive_percent'),
      status: 'Menunggu Validasi',
      statusType: 'pending',
      date: new Date().toLocaleString('id-ID'),
      vcl: motilityAvailable ? motion?.average_speed ?? 'N/A' : 'N/A',
      vsl: motilityAvailable ? motion?.average_straight_line_speed ?? 'N/A' : 'N/A',
      lin: motilityAvailable && Number.isFinite(motion?.average_linearity) ? (motion.average_linearity * 100).toFixed(1) : 'N/A',
      vap: motilityAvailable && Number.isFinite(motion?.average_path_speed) ? motion.average_path_speed : null,
      str: motilityAvailable && Number.isFinite(motion?.average_straightness) ? Number((motion.average_straightness * 100).toFixed(1)) : null,
      wob: motilityAvailable && Number.isFinite(motion?.average_wobble) ? Number((motion.average_wobble * 100).toFixed(1)) : null,
      analysisSummary: summary,
      quality: analysisResult.data?.quality,
      analysisMethod: analysisResult.data?.analysis_method,
      alh: 'N/A',
      bcf: 'N/A',
      calibration: analysisResult.data?.calibration,
      sampleVolume: 'Belum diisi',
      viscosity: 'Belum diisi',
      verifiedBy: 'Menunggu Verifikasi Dokter'
    };
    setRecords((prev) => [newRecord, ...prev]);
    alert(`[SUKSES] Sampel #${newId} berhasil dikirim ke antrean rekam medis dan menunggu validasi Dokter Spesialis!`);
    navigateTo('Patient Records', 'patients');
  };

  return (
    <div className="dashboard-wrapper">
      {/* ─── 1. Left Vertical Dock Sidebar (Unified Modern Dock) ─── */}
      <aside className={`dock-sidebar ${isSidebarOpen ? 'is-expanded' : ''}`} aria-label="Navigasi dashboard">
        <div className="dock-panel">
          <button
            type="button"
            className="dock-btn dock-toggle"
            aria-expanded={isSidebarOpen}
            aria-controls="dashboard-navigation dashboard-utilities"
            aria-label={isSidebarOpen ? 'Tutup navigasi' : 'Buka navigasi'}
            title={isSidebarOpen ? 'Tutup navigasi' : 'Buka navigasi'}
            onClick={() => setIsSidebarOpen((isOpen) => !isOpen)}
          >
            {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
            <span className="dock-label">Tutup navigasi</span>
          </button>
          {/* Top: Brand Logo / Quick Identity */}
          <div 
            className="dock-brand-btn" 
            title="CASA-AI Medical Portal"
            onClick={() => {
              setActiveDock('dashboard');
              setActiveTab('Overview');
            }}
          >
            <Microscope size={22} />
          </div>

          <div className="dock-divider" />

          {/* Main Navigation Items Tailored per Role */}
          <nav className="dock-nav-group" id="dashboard-navigation" aria-label="Menu utama">
            {/* 1. Dashboard / Overview (All Roles) */}
            <button
              className={`dock-btn ${activeDock === 'dashboard' ? 'active' : ''}`}
              title={currentRole === 'dokter' ? "Overview Klinis Dokter" : currentRole === 'laboran' ? "Overview Laboratorium" : "Overview Dashboard"}
              data-tooltip={currentRole === 'dokter' ? "Dashboard Klinis" : currentRole === 'laboran' ? "Dashboard Lab" : "Overview Sistem"}
              onClick={() => navigateTo('Overview', 'dashboard')}
            >
              <LayoutGrid size={20} />
              <span className="dock-label">{currentRole === 'dokter' ? "Dashboard Klinis" : currentRole === 'laboran' ? "Dashboard Lab" : "Overview Sistem"}</span>
            </button>

            {/* 2. DOKTER ONLY: Antrean Validasi Klinis (Perlu Tindakan) */}
            {currentRole === 'dokter' && (
              <button
                className={`dock-btn ${pendingValidationCount > 0 ? 'has-indicator' : ''} ${activeDock === 'validation' ? 'active' : ''}`}
                title="Antrean Validasi Klinis Pasien (Perlu Tindakan Dokter)"
                data-tooltip={`Validasi Diagnosa (${pendingValidationCount})`}
                onClick={() => navigateTo('Perlu Validasi', 'validation')}
              >
                <Stethoscope size={20} color="var(--teal)" />
              <span className="dock-label">{`Validasi Diagnosa (${pendingValidationCount})`}</span>
              </button>
            )}

            {/* 3. LABORAN & ADMIN ONLY: Laboratorium Analisis Semen AI */}
            {currentRole !== 'dokter' && (
              <button
                className={`dock-btn ${activeDock === 'analysis' ? 'active' : ''}`}
                title="Laboratorium Analisis AI & Inferensi Video"
                data-tooltip="Laboratorium Analisis"
                onClick={() => navigateTo('Analysis Lab', 'analysis')}
              >
                <ScanEye size={20} />
              <span className="dock-label">Laboratorium Analisis</span>
              </button>
            )}

            {/* 4. LABORAN ONLY: Kalibrasi Bilik Makler & Optik */}
            {currentRole === 'laboran' && (
              <button
                className={`dock-btn ${activeDock === 'calibration' ? 'active' : ''}`}
                title="Kalibrasi Bilik Hitung Makler & Mikroskop"
                data-tooltip="Kalibrasi Mikroskop"
                onClick={() => navigateTo('Calibration', 'calibration')}
              >
                <Sliders size={20} />
              <span className="dock-label">Kalibrasi Mikroskop</span>
              </button>
            )}

            {/* 5. Patient Records (All Roles) */}
            <button
              className={`dock-btn ${activeDock === 'patients' ? 'active' : ''}`}
              title={currentRole === 'dokter' ? "Rekam Medis Pasien" : currentRole === 'laboran' ? "Antrean Preparat Semen" : "Database Pasien"}
              data-tooltip={currentRole === 'laboran' ? "Antrean Preparat" : "Rekam Medis Pasien"}
              onClick={() => navigateTo('Patient Records', 'patients')}
            >
              <Users size={20} />
              <span className="dock-label">{currentRole === 'laboran' ? "Antrean Preparat" : "Rekam Medis Pasien"}</span>
            </button>

            {/* 6. WHO Quality Control (All Roles) */}
            <button
              className={`dock-btn ${activeDock === 'qc' ? 'active' : ''}`}
              title="WHO 6th Quality Control & Panduan Standar"
              data-tooltip="Kendali Mutu WHO"
              onClick={() => navigateTo('Quality Control', 'qc')}
            >
              <ShieldCheck size={20} />
              <span className="dock-label">Kendali Mutu WHO</span>
            </button>

            {/* 7. DOKTER & ADMIN ONLY: Lab Reports & Digital Signature (STRICTLY HIDDEN FOR LABORAN) */}
            {currentRole !== 'laboran' && (
              <button
                className={`dock-btn ${activeDock === 'reports' ? 'active' : ''}`}
                title={currentRole === 'dokter' ? "Laporan & Tanda Tangan Medis" : "Laporan Hasil Lab"}
                data-tooltip={currentRole === 'dokter' ? "Laporan Medis" : "Laporan Hasil Lab"}
                onClick={() => navigateTo('Lab Reports', 'reports')}
              >
                <FileText size={20} />
              <span className="dock-label">{currentRole === 'dokter' ? "Laporan Medis" : "Laporan Hasil Lab"}</span>
              </button>
            )}

            {/* 8. ADMIN ONLY: Microscope Hardware Calibration */}
            {currentRole === 'admin' && (
              <button
                className={`dock-btn ${activeDock === 'calibration' ? 'active' : ''}`}
                title="Microscope Hardware & Chamber Calibration"
                data-tooltip="Kalibrasi Hardware"
                onClick={() => navigateTo('Calibration', 'calibration')}
              >
                <Sliders size={20} />
              <span className="dock-label">Kalibrasi Hardware</span>
              </button>
            )}

            {/* 9. ADMIN ONLY: User & Staff Management */}
            {currentRole === 'admin' && (
              <button
                className={`dock-btn ${activeDock === 'users' ? 'active' : ''}`}
                title="Kelola Akun Staf & Pengguna (Admin Only)"
                data-tooltip="Kelola Pengguna"
                onClick={() => navigateTo('User Management', 'users')}
              >
                <UserCheck size={20} color="var(--teal)" />
              <span className="dock-label">Kelola Pengguna</span>
              </button>
            )}

            {/* 10. ADMIN ONLY: Server GPU Telemetry & Audit Logs */}
            {currentRole === 'admin' && (
              <button
                className={`dock-btn ${activeDock === 'server' ? 'active' : ''}`}
                title="Telemetri Server GPU & Audit Log (Admin Only)"
                data-tooltip="Telemetri Server"
                onClick={() => navigateTo('Server Logs', 'server')}
              >
                <Cpu size={20} color="#C1D72E" />
              <span className="dock-label">Telemetri Server</span>
              </button>
            )}
          </nav>

          {/* Spacer */}
          <div className="dock-spacer" />

          {/* Bottom Utility Actions */}
          <div className="dock-bottom-group" id="dashboard-utilities">
            <div className="dock-divider" />

            <button
              className="dock-btn"
              title="Kembali ke Beranda Utama (/)"
              data-tooltip="Beranda Utama (/)"
              onClick={handleGoHome}
              style={{ color: 'var(--teal)' }}
            >
              <Home size={19} />
              <span className="dock-label">Beranda Utama (/)</span>
            </button>

            <button
              className="dock-btn"
              title={isDarkMode ? 'Beralih ke Mode Terang (Default)' : 'Beralih ke Mode Gelap'}
              data-tooltip={isDarkMode ? 'Mode Terang' : 'Mode Gelap'}
              onClick={() => setIsDarkMode(!isDarkMode)}
            >
              {isDarkMode ? <Sun size={19} color="#C1D72E" /> : <Moon size={19} color="#00AFA0" />}
              <span className="dock-label">{isDarkMode ? 'Mode Terang' : 'Mode Gelap'}</span>
            </button>

            <button
              className="dock-btn"
              title="Ganti Peran (Admin / Dokter Spesialis / Analis Mikroskop)"
              data-tooltip="Ganti Peran Medis"
              onClick={() => setShowRoleModal(true)}
            >
              <KeyRound size={19} />
              <span className="dock-label">Ganti Peran Medis</span>
            </button>

            <button
              className="dock-btn"
              title="Panduan Standar WHO 6th"
              data-tooltip="Panduan Standar WHO"
              onClick={() => setShowGuidelinesModal(true)}
            >
              <HelpCircle size={19} />
              <span className="dock-label">Panduan Standar WHO</span>
            </button>

            <button
              className="dock-btn"
              title="Keluar / Logout Akun"
              data-tooltip="Keluar Akun"
              onClick={handleLogout}
              style={{ color: '#EF4444' }}
            >
              <LogOut size={19} />
              <span className="dock-label">Keluar Akun</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ─── 2. Main Dashboard Surface ─── */}
      <main className="dashboard-surface">
        {/* Top Navbar */}
        <header className="top-navbar">
          {/* Brand Logo */}
          <div className="brand-group">
            <div className="brand-logo">
              <Microscope size={24} />
            </div>
            <div className="brand-text">
              <h1>
                CASA<span style={{ color: 'var(--teal)' }}>-AI</span>
                <span className="badge-pro">Portal Medis</span>
              </h1>
              <p>Computer Assisted Sperm Analysis</p>
            </div>
          </div>

          {/* Center Capsule Tabs Tailored per Role */}
          <nav className="center-nav-pill">
            {(ROLE_TABS[currentRole] || ROLE_TABS.dokter).map((t) => {
              const TabIcon = t.icon;
              const label = t.id === 'Perlu Validasi' ? `Perlu Validasi (${pendingValidationCount})` : t.label;
              return (
                <button
                  key={t.id}
                  className={`nav-tab-btn ${activeTab === t.id ? 'active' : ''}`}
                  onClick={() => navigateTo(t.id, t.dock)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  {TabIcon && <TabIcon size={14} flexShrink={0} />}
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Action Icons & Role Switcher */}
          <div className="right-actions">
            {/* Quick Home / Public Portal Button */}
            <button
              className="action-pill-btn secondary"
              style={{ padding: '5px 10px', fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}
              onClick={handleGoHome}
              title="Kembali ke Beranda Utama (/)"
            >
              <ArrowLeft size={13} color="var(--teal)" />
              <span>Beranda</span>
            </button>

            <button
              className="icon-action-btn"
              title="Pencarian Cepat"
              onClick={() => {
                const el = document.getElementById('tableSearchInput');
                if (el) el.focus();
              }}
            >
              <Search size={16} />
            </button>

            <button
              className="icon-action-btn"
              title="Notifikasi Laboratorium"
              onClick={() => alert(`[${currentRoleObj.badge}] Semua koneksi hardware dan pipeline inference normal.`)}
            >
              <Bell size={16} />
            </button>

            {/* Role & Doctor Profile Pill */}
            <div
              className="doctor-profile-pill"
              onClick={() => setShowRoleModal(true)}
              title={`Peran saat ini: ${currentRoleObj.name} (${currentRoleObj.user}). Klik untuk beralih peran.`}
            >
              <img
                src={
                  currentRole === 'dokter'
                    ? 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=100&auto=format&fit=crop&q=80'
                    : currentRole === 'laboran'
                    ? 'https://images.unsplash.com/photo-1594824813576-431871ad2bfd?w=100&auto=format&fit=crop&q=80'
                    : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'
                }
                alt="Avatar"
                className="doctor-avatar"
              />
              <div className="doctor-info">
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span className="doctor-name" title={currentRoleObj.user}>{currentRoleObj.user}</span>
                  <span
                    className="badge-pro"
                    style={{
                      background: currentRoleObj.badgeColor,
                      color: currentRoleObj.badgeTextColor || '#FFFFFF',
                      fontSize: '0.58rem',
                      padding: '1px 5px',
                      flexShrink: 0
                    }}
                  >
                    {currentRoleObj.badge}
                  </span>
                </div>
                <span className="doctor-role" title={currentRoleObj.name}>{currentRoleObj.name}</span>
              </div>
              <ChevronDown size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            </div>

            {/* Quick Logout Button */}
            <button
              className="icon-action-btn"
              title="Keluar / Logout Akun"
              onClick={handleLogout}
              style={{ color: '#EF4444' }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* Hero Greeting Section */}
        <section className="hero-greeting">
          <div className="greeting-text">
            <h2>Selamat datang, {currentRoleObj.user.split(',')[0]}</h2>
            <p>
              {currentRole === 'admin' && 'Akses Administrator Sistem: Kelola pengguna & staf, audit log keamanan sistem, pemantauan beban server GPU CUDA, dan arsip database.'}
              {currentRole === 'dokter' && 'Akses Dokter Spesialis Andrologi: Validasi klinis kinematika CASA WHO 6th edition, pengesahan diagnosa medis, dan penandatanganan hasil lab.'}
              {currentRole === 'laboran' && 'Akses Tenaga Medis / Analis Mikroskop: Pengambilan citra/video preparat, kalibrasi bilik hitung Makler/Leja, dan eksekusi inferensi AI.'}
            </p>
          </div>

          <div className="hero-quick-stats">
            <div className="live-indicator-pill">
              <span className="pulse-dot"></span>
              <span>
                {currentRole === 'admin'
                  ? 'Server Telemetry: NVIDIA GTX 1650 (CUDA 12.4 • 14ms) • Audit Trail Aktif'
                  : currentRole === 'dokter'
                  ? 'Protokol WHO 6th • Otoritas Validasi Klinis & Tanda Tangan Digital'
                  : `Profil ${calibration.chamber_type} • ${chamberDepth} µm • ${calibration.fps_mode === 'auto' ? 'FPS metadata video' : `${fps} FPS manual`}`}
              </span>
            </div>
          </div>
        </section>

        {/* Doctor's Priority Validation Alert */}
        {currentRole === 'dokter' && pendingValidationCount > 0 && (
          <div
            style={{
              margin: '0 0 20px 0',
              padding: '14px 20px',
              borderRadius: 'var(--radius-lg)',
              background: 'linear-gradient(135deg, rgba(0, 175, 160, 0.12), rgba(193, 215, 46, 0.12))',
              border: '1.5px solid var(--teal)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              boxShadow: '0 4px 16px rgba(0, 175, 160, 0.08)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                <Stethoscope size={20} />
              </div>
              <div>
                <strong style={{ fontSize: '0.94rem', color: 'var(--text-primary)', display: 'block' }}>
                  Perhatian Dokter: Ada {pendingValidationCount} Sampel Semen Menunggu Pengesahan Anda
                </strong>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Analis laboratorium telah menyelesaikan uji mikroskop. Validasi diagnosa klinis WHO 6th dan sahkan dengan tanda tangan digital.
                </span>
              </div>
            </div>
            <button
              className="action-pill-btn primary"
              style={{ whiteSpace: 'nowrap' }}
              onClick={() => setActiveTab('Perlu Validasi')}
            >
              <CheckCircle2 size={15} />
              <span>Buka Antrean Validasi ({pendingValidationCount}) →</span>
            </button>
          </div>
        )}

        {/* ─── 1. DEDICATED VIEW: OVERVIEW / DASHBOARD ─── */}
        {activeTab === 'Overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Top 3-Column Grid */}
            <section className="dashboard-grid-top">
              {/* Column 1: Left Stack */}
              <div className="left-stack-col">
                {/* Top Card: Overall Motility Index */}
                <div className="card-box">
                  <div className="balance-card-header">
                    <span>{currentRole === 'dokter' ? 'Indeks Motilitas Klinis' : currentRole === 'laboran' ? 'Indeks Motilitas Preparat' : 'Overall Motility Index'}</span>
                    <div className="currency-badge">
                      <Activity size={12} color="var(--teal)" />
                      <span>WHO 6th</span>
                    </div>
                  </div>

                  <div className="balance-amount">78.4%</div>

                  <div className="growth-badge lime-accent">
                    <ArrowUpRight size={13} />
                    <span>+5.2% vs WHO threshold</span>
                  </div>

                  {/* Action Buttons Tailored per Role - Single Line Always */}
                  <div className="balance-actions" style={{ display: 'flex', gap: '8px', width: '100%', marginBottom: '20px' }}>
                    {currentRole === 'dokter' ? (
                      <>
                        <button
                          className="action-pill-btn primary"
                          style={{ background: 'var(--teal)', whiteSpace: 'nowrap', flex: 1, padding: '9px 12px', fontSize: '0.8rem' }}
                          onClick={() => navigateTo('Perlu Validasi', 'validation')}
                        >
                          <Stethoscope size={15} flexShrink={0} />
                          <span>Sahkan ({pendingValidationCount})</span>
                        </button>
                        <button
                          className="action-pill-btn secondary"
                          style={{ whiteSpace: 'nowrap', flex: 1, padding: '9px 12px', fontSize: '0.8rem' }}
                          onClick={() => navigateTo('Patient Records', 'patients')}
                        >
                          <Users size={15} flexShrink={0} />
                          <span>Tinjau Pasien</span>
                        </button>
                      </>
                    ) : currentRole === 'laboran' ? (
                      <>
                        <button
                          className="action-pill-btn primary"
                          style={{ whiteSpace: 'nowrap', flex: 1, padding: '9px 12px', fontSize: '0.8rem' }}
                          onClick={() => navigateTo('Analysis Lab', 'analysis')}
                        >
                          <Plus size={15} flexShrink={0} />
                          <span>Uji Preparat</span>
                        </button>
                        <button
                          className="action-pill-btn secondary"
                          style={{ whiteSpace: 'nowrap', flex: 1, padding: '9px 12px', fontSize: '0.8rem' }}
                          onClick={() => navigateTo('Calibration', 'calibration')}
                        >
                          <Sliders size={15} flexShrink={0} />
                          <span>Kalibrasi</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="action-pill-btn primary"
                          style={{ whiteSpace: 'nowrap', flex: 1, padding: '9px 8px', fontSize: '0.76rem' }}
                          onClick={() => navigateTo('Analysis Lab', 'analysis')}
                        >
                          <Plus size={14} flexShrink={0} />
                          <span>Analisis</span>
                        </button>
                        <button
                          className="action-pill-btn secondary"
                          style={{ whiteSpace: 'nowrap', flex: 1, padding: '9px 8px', fontSize: '0.76rem' }}
                          onClick={() => navigateTo('Calibration', 'calibration')}
                        >
                          <Sliders size={14} flexShrink={0} />
                          <span>Kalibrasi</span>
                        </button>
                        <button
                          className="action-pill-btn secondary"
                          style={{ whiteSpace: 'nowrap', flex: 1, padding: '9px 8px', fontSize: '0.76rem' }}
                          onClick={() => navigateTo('User Management', 'users')}
                        >
                          <UserCheck size={14} flexShrink={0} />
                          <span>Staf</span>
                        </button>
                      </>
                    )}
                  </div>

                  {/* Subsets breakdown - Replaced Initials with Clean Icons */}
                  <div className="subsets-header">
                    Motility Subsets <span>| Total 3 classes</span>
                  </div>
                  <div className="subsets-row">
                    <div className="subset-tile" title="Progressive Motility (PR)">
                      <div className="subset-badge-icon">
                        <TrendingUp size={13} strokeWidth={2.5} color="#FFFFFF" />
                      </div>
                      <div className="subset-value">54.2%</div>
                      <div className="subset-label">Progressive (PR)</div>
                      <div className="subset-status">Normal</div>
                    </div>

                    <div className="subset-tile" title="Non-Progressive Motility (NP)">
                      <div className="subset-badge-icon">
                        <RotateCw size={13} strokeWidth={2.5} color="#121F0E" />
                      </div>
                      <div className="subset-value">18.6%</div>
                      <div className="subset-label">Non-Prog (NP)</div>
                      <div className="subset-status">Active</div>
                    </div>

                    <div className="subset-tile" title="Immotile (IM)">
                      <div className="subset-badge-icon">
                        <Pause size={13} strokeWidth={2.5} color="#FFFFFF" />
                      </div>
                      <div className="subset-value">27.2%</div>
                      <div className="subset-label">Immotile (IM)</div>
                      <div className="subset-status warn">Low</div>
                    </div>
                  </div>
                </div>

                {/* Mid Card: Processing Limit / Progress */}
                <div className="card-box">
                  <div className="limit-card-header">
                    {currentRole === 'dokter' ? 'Progres Validasi Pasien Hari Ini' : 'Target Pemeriksaan Laboratorium'}
                  </div>
                  <div className="limit-progress-bar-container">
                    <div className="limit-progress-bar-fill" style={{ width: currentRole === 'dokter' ? '60%' : '70%' }}></div>
                  </div>
                  <div className="limit-details">
                    {currentRole === 'dokter' ? (
                      <>
                        <span><strong>3 dari 5 pasien</strong> telah disahkan</span>
                        <span style={{ color: '#D97706' }}>{pendingValidationCount} menunggu</span>
                      </>
                    ) : (
                      <>
                        <span><strong>42 samples</strong> analyzed</span>
                        <span>Target: 60 / day</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Bottom Card: Role-specific Widget */}
                {currentRole === 'dokter' ? (
                  <div className="card-box">
                    <div className="mycards-header">
                      <h4>
                        <Stethoscope size={16} color="var(--teal)" />
                        Distribusi Diagnosa Pasien (Klinis)
                      </h4>
                      <span className="badge-pro" style={{ background: 'var(--teal-subtle)', color: 'var(--teal)', fontSize: '0.62rem' }}>
                        WHO 6th Manual
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Normozoospermia (Normal)</span>
                        <strong style={{ color: 'var(--teal)' }}>60% (3 Pasien)</strong>
                      </div>
                      <div style={{ width: '100%', height: '6px', background: 'var(--bg-subtle)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: '60%', height: '100%', background: 'var(--teal)' }}></div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', marginTop: '4px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Astheno / Oligo (Abnormal)</span>
                        <strong style={{ color: '#D97706' }}>40% (2 Pasien)</strong>
                      </div>
                      <div style={{ width: '100%', height: '6px', background: 'var(--bg-subtle)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: '40%', height: '100%', background: '#D97706' }}></div>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                        Antrean verifikasi dokter: <strong style={{ color: pendingValidationCount > 0 ? '#EF4444' : '#10B981' }}>{pendingValidationCount} Pasien</strong>
                      </div>
                    </div>
                  </div>
                ) : currentRole === 'admin' ? (
                  <div className="card-box">
                    <div className="mycards-header">
                      <h4>
                        <Cpu size={16} color="var(--teal)" />
                        Server GPU & Hardware
                      </h4>
                      <button className="btn-add-card" onClick={() => navigateTo('Server Logs', 'server')}>
                        Detail Log →
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', marginTop: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>GPU Acceleration</span>
                        <strong style={{ color: 'var(--teal)' }}>NVIDIA GTX 1650</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>VRAM Usage</span>
                        <strong>1.84 GB / 4.00 GB (46%)</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Inference Latency</span>
                        <strong style={{ color: 'var(--lime-dark)' }}>14.2 ms (70+ FPS)</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Status Sistem</span>
                        <span className="badge-pro" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981', fontSize: '0.66rem' }}>🟢 Normal 99.8%</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="card-box">
                    <div className="mycards-header">
                      <h4>
                        <Layers size={16} color="var(--teal)" />
                        Bilik Hitung & AI Pipeline
                      </h4>
                      <button
                        className="btn-add-card"
                        onClick={() => navigateTo('Calibration', 'calibration')}
                      >
                        + Kalibrasi
                      </button>
                    </div>

                    <div className="mycards-carousel">
                      <div
                        className="phys-card dark"
                        onClick={() => navigateTo('Calibration', 'calibration')}
                        title="Klik untuk kalibrasi kamar hitung"
                      >
                        <div className="card-top-row">
                          <span className="card-pill-tag">Makler 10µm</span>
                          <div className="card-chip"></div>
                        </div>
                        <div>
                          <div className="card-title-slot">Kamar Hitung #1</div>
                          <div style={{ fontSize: '0.64rem', opacity: 0.7 }}>Kalibrasi: {pixelScale} µm/px</div>
                        </div>
                        <div className="card-meta-row">
                          <span>30 FPS</span>
                          <span>ACTIVE</span>
                        </div>
                      </div>

                      <div
                        className="phys-card teal"
                        onClick={() => navigateTo('Analysis Lab', 'analysis')}
                        title="Model YOLOv11 + ByteTrack siap inferensi"
                      >
                        <div className="card-top-row">
                          <span className="card-pill-tag" style={{ background: 'rgba(0,0,0,0.2)' }}>
                            YOLOv11-CASA
                          </span>
                          <Sparkles size={16} color="var(--lime)" />
                        </div>
                        <div>
                          <div className="card-title-slot">CUDA Pipeline</div>
                          <div style={{ fontSize: '0.64rem', opacity: 0.85 }}>ByteTrack Multi-Object</div>
                        </div>
                        <div className="card-meta-row">
                          <span>mAP 98.4%</span>
                          <span>READY</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Column 2: Center 4 Kinematics Tiles */}
              <div className="stats-center-col">
                <div className="stat-tile primary-accent">
                  <div className="stat-header">
                    <span>Mean VCL (Curvilinear)</span>
                    <div className="stat-icon-bubble">
                      <Activity size={18} />
                    </div>
                  </div>
                  <div className="stat-value">58.4 <span style={{ fontSize: '1rem', fontWeight: 500 }}>µm/s</span></div>
                  <div className="stat-trend lime">
                    <ArrowUpRight size={13} />
                    <span>↑ 8.2% Normal Grade A</span>
                  </div>
                </div>

                <div className="stat-tile">
                  <div className="stat-header">
                    <span>Sperm Concentration</span>
                    <div className="stat-icon-bubble">
                      <Microscope size={18} color="var(--teal)" />
                    </div>
                  </div>
                  <div className="stat-value">48.2 <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-muted)' }}>M/mL</span></div>
                  <div className="stat-trend">
                    <span>WHO Ref: ≥ 15 M/mL</span>
                  </div>
                </div>

                <div className="stat-tile">
                  <div className="stat-header">
                    <span>Mean VSL (Straight-line)</span>
                    <div className="stat-icon-bubble">
                      <TrendingUp size={18} color="var(--teal)" />
                    </div>
                  </div>
                  <div className="stat-value">34.8 <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-muted)' }}>µm/s</span></div>
                  <div className="stat-trend">
                    <ArrowUpRight size={13} />
                    <span>↑ 5.1% High Linearity</span>
                  </div>
                </div>

                <div className="stat-tile">
                  <div className="stat-header">
                    <span>Mean Linearity (LIN)</span>
                    <div className="stat-icon-bubble">
                      <Compass size={18} color="var(--teal)" />
                    </div>
                  </div>
                  <div className="stat-value">64.5%</div>
                  <div className="stat-trend lime">
                    <ArrowUpRight size={13} />
                    <span>↑ 3.8% VSL/VCL Ratio</span>
                  </div>
                </div>
              </div>

              {/* Column 3: Motility Spectrum Chart */}
              <div className="chart-col">
                <div className="chart-card">
                  <div>
                    <div className="chart-header">
                      <div>
                        <h3>Motility Spectrum</h3>
                        <p>Progression distribution across sessions</p>
                      </div>
                      <span className="badge-pro" style={{ background: 'var(--teal-light)', color: 'var(--teal)', whiteSpace: 'nowrap' }}>
                        Session Log
                      </span>
                    </div>

                    <div className="chart-legend">
                      <div className="legend-item">
                        <span className="legend-color teal"></span>
                        <span>PR (Prog)</span>
                      </div>
                      <div className="legend-item">
                        <span className="legend-color lime"></span>
                        <span>NP (Non-P)</span>
                      </div>
                      <div className="legend-item">
                        <span className="legend-color dark"></span>
                        <span>IM (Immotile)</span>
                      </div>
                    </div>
                  </div>

                  <div className="chart-bars-wrap">
                    {CHART_SESSIONS.map((sess, idx) => (
                      <div
                        key={idx}
                        className="chart-col-bar"
                        title={`${sess.label}: PR ${sess.pr}%, NP ${sess.np}%, IM ${sess.im}% (${sess.count} cells)`}
                      >
                        <div className="bar-stack" style={{ height: `${Math.round((sess.count / 400) * 150)}px` }}>
                          <div className="bar-segment im" style={{ height: `${sess.im}%` }}></div>
                          <div className="bar-segment np" style={{ height: `${sess.np}%` }}></div>
                          <div className="bar-segment pr" style={{ height: `${sess.pr}%` }}></div>
                        </div>
                        <span className="bar-month-label">{sess.label}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', paddingTop: '10px', borderTop: '1px dashed var(--border-subtle)' }}>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      Total Teranalisis: <strong style={{ color: 'var(--text-primary)' }}>2,740 sel</strong>
                    </span>
                    <button
                      className="filter-btn"
                      style={{ padding: '4px 10px', fontSize: '0.74rem' }}
                      onClick={() => alert('Log analisis sesi laboratorium terunduh sebagai CSV.')}
                    >
                      <Download size={13} />
                      Export
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Compact Recent Analysis Records Section */}
            <section className="bottom-table-card">
              <div className="table-header-row">
                <div>
                  <div className="table-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Activity size={18} color="var(--teal)" />
                    <span>Aktivitas Uji Preparat Semen Terkini</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    4 sampel terbaru dari total {records.length} rekaman di laboratorium
                  </div>
                </div>
                <button
                  className="action-pill-btn secondary"
                  onClick={() => navigateTo('Patient Records', 'patients')}
                >
                  <Users size={14} />
                  <span>Buka Seluruh Database ({records.length}) →</span>
                </button>
              </div>

              <div className="casa-table-wrap">
                <table className="casa-table">
                  <thead>
                    <tr>
                      <th>Sample ID</th>
                      <th>Pasien & Asal Faskes</th>
                      <th>Konsentrasi</th>
                      <th>Motilitas (PR+NP)</th>
                      <th>Diagnosis WHO 6th</th>
                      <th>Waktu Analisis</th>
                      <th>Status Verifikasi</th>
                      <th style={{ textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.slice(0, 4).map((rec) => (
                      <tr key={rec.id} onClick={() => { setSelectedRecord(rec); setShowDetailModal(true); }}>
                        <td className="sample-id-cell">
                          <span style={{ color: 'var(--teal)' }}>#</span>{rec.id}
                        </td>
                        <td>
                          <strong>{rec.patientName}</strong>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{rec.clinic}</div>
                        </td>
                        <td><strong>{rec.concentration}</strong></td>
                        <td>
                          <strong>{rec.motilityRate}</strong>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '6px' }}>(PR: {rec.progRate})</span>
                        </td>
                        <td>
                          <span className={`status-badge ${rec.statusType}`}>{rec.status}</span>
                        </td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{rec.date}</td>
                        <td>
                          {rec.verifiedBy.includes('Dr.') ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--teal)', fontWeight: 600, fontSize: '0.74rem' }}>
                              <Check size={13} /> {rec.verifiedBy}
                            </span>
                          ) : (
                            <span className="badge-pro" style={{ background: '#FEF3C7', color: '#D97706', fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={11} /> Menunggu Dokter
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                          <button
                            className="more-btn"
                            title="Inspeksi Trajektori"
                            onClick={() => { setSelectedRecord(rec); setShowDetailModal(true); }}
                          >
                            <Eye size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* ─── 2. DEDICATED VIEW: DOKTER - ANTREAN VALIDASI KLINIS ─── */}
        {activeTab === 'Perlu Validasi' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <section className="bottom-table-card">
              <div className="table-header-row">
                <div>
                  <div className="table-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Stethoscope size={20} color="var(--teal)" />
                    <span>Workstation Validasi Klinis Dokter Spesialis Andrologi</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Otoritas Medis: Tinjau motilitas sel WHO 6th edition, tetapkan diagnosis akhir, dan bubuhkan tanda tangan digital resmi.
                  </div>
                </div>
                <span className="badge-pro" style={{ background: pendingValidationCount > 0 ? '#FEF3C7' : 'var(--teal-subtle)', color: pendingValidationCount > 0 ? '#D97706' : 'var(--teal)', fontSize: '0.8rem', padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  {pendingValidationCount > 0 ? (
                    <>
                      <AlertCircle size={14} />
                      <span>{pendingValidationCount} Sampel Menunggu Validasi Anda</span>
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Seluruh Sampel Telah Disahkan</span>
                    </>
                  )}
                </span>
              </div>

              <div className="casa-table-wrap">
                <table className="casa-table">
                  <thead>
                    <tr>
                      <th>Sample ID</th>
                      <th>Pasien & Asal Faskes</th>
                      <th>Konsentrasi</th>
                      <th>Motilitas (PR+NP)</th>
                      <th>Diagnosis Sementara</th>
                      <th>Tanggal Masuk</th>
                      <th>Status Validasi</th>
                      <th style={{ textAlign: 'right' }}>Aksi Pengesahan Medis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.filter(r => r.verifiedBy === 'Menunggu Verifikasi Dokter').length === 0 ? (
                      <tr>
                        <td colSpan="8" style={{ textAlign: 'center', padding: '42px', color: 'var(--text-muted)' }}>
                          <CheckCircle2 size={38} color="var(--teal)" style={{ margin: '0 auto 10px' }} />
                          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            Semua Sampel Telah Divalidasi!
                          </div>
                          <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>
                            Tidak ada antrean sampel yang memerlukan pengesahan dokter saat ini.
                          </div>
                        </td>
                      </tr>
                    ) : (
                      records.filter(r => r.verifiedBy === 'Menunggu Verifikasi Dokter').map((rec) => (
                        <tr key={rec.id} onClick={() => { setSelectedRecord(rec); setShowDetailModal(true); }}>
                          <td className="sample-id-cell">
                            <span style={{ color: 'var(--teal)' }}>#</span>{rec.id}
                          </td>
                          <td>
                            <strong>{rec.patientName}</strong>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{rec.clinic}</div>
                          </td>
                          <td><strong>{rec.concentration}</strong></td>
                          <td>
                            <strong>{rec.motilityRate}</strong>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>PR: {rec.progRate} • NP: {rec.nonProgRate}</div>
                          </td>
                          <td>
                            <span className={`status-badge ${rec.statusType}`}>{rec.status}</span>
                          </td>
                          <td style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{rec.date}</td>
                          <td>
                            <span className="badge-pro" style={{ background: '#FEF3C7', color: '#D97706', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={12} /> Menunggu Pengesahan
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                              <button
                                className="action-pill-btn primary"
                                style={{ padding: '6px 12px', fontSize: '0.76rem', background: 'var(--teal)', display: 'flex', alignItems: 'center', gap: '5px' }}
                                onClick={() => handleApproveSample(rec.id)}
                              >
                                <Stethoscope size={14} />
                                <span>Sahkan & Ttd</span>
                              </button>
                              <button
                                className="more-btn"
                                title="Inspeksi Trajektori"
                                onClick={() => { setSelectedRecord(rec); setShowDetailModal(true); }}
                              >
                                <Eye size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Approved Samples History */}
            <section className="bottom-table-card">
              <div className="table-header-row">
                <div className="table-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={18} color="var(--teal)" />
                  <span>Riwayat Sampel yang Telah Disahkan oleh {currentRoleObj.user}</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Total {records.filter(r => r.verifiedBy.includes('Dr.')).length} sampel sah
                </span>
              </div>
              <div className="casa-table-wrap">
                <table className="casa-table">
                  <thead>
                    <tr>
                      <th>Sample ID</th>
                      <th>Pasien</th>
                      <th>Konsentrasi</th>
                      <th>Motilitas</th>
                      <th>Diagnosis Final</th>
                      <th>Waktu Verifikasi</th>
                      <th>Pengesah Digital</th>
                      <th style={{ textAlign: 'right' }}>Laporan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.filter(r => r.verifiedBy.includes('Dr.')).map((rec) => (
                      <tr key={rec.id}>
                        <td className="sample-id-cell"><span style={{ color: 'var(--teal)' }}>#</span>{rec.id}</td>
                        <td><strong>{rec.patientName}</strong></td>
                        <td>{rec.concentration}</td>
                        <td>{rec.motilityRate}</td>
                        <td><span className={`status-badge ${rec.statusType}`}>{rec.status}</span></td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{rec.date}</td>
                        <td style={{ color: 'var(--teal)', fontWeight: 600, fontSize: '0.75rem' }}>✓ {rec.verifiedBy}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="action-pill-btn secondary"
                            style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                            onClick={() => {
                              setSelectedReportId(rec.id);
                              navigateTo('Lab Reports', 'reports');
                            }}
                          >
                            <FileText size={12} />
                            <span>Buka Laporan</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* ─── 3. DEDICATED VIEW: LABORATORIUM ANALISIS SEMEN (AI) ─── */}
        {activeTab === 'Analysis Lab' && (
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

                <div style={{ marginTop: '12px', marginBottom: '16px' }}>
                  <button
                    className="action-pill-btn secondary"
                    style={{ width: '100%', justifyContent: 'center', padding: '8px' }}
                    onClick={handleLoadDemo}
                    disabled={analysisLoading}
                  >
                    <Play size={14} color="var(--teal)" />
                    <span>Muat Data Simulasi (Demo)</span>
                  </button>
                  <ParameterHelp name="demo" />
                </div>

                <h4 style={{ fontSize: '0.94rem', fontWeight: 700, marginBottom: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                  2. Konfigurasi Parameter Analisis
                </h4>
                <CalibrationFields controls={calibrationControls} confidence={confThres} onConfidenceChange={setConfThres} readOnly={analysisLoading} />
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
                      Unggah rekaman preparat untuk menjalankan analisis. Tombol demo hanya menampilkan data simulasi agar Anda dapat mencoba antarmuka.
                    </p>
                    <button className="action-pill-btn primary" onClick={handleLoadDemo}>
                      <Play size={14} />
                      <span>Muat Sampel Demo Langsung</span>
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                      <div>
                        <h4 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Hasil Analisis Kinematika</h4>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                          {analysisResult.isDemo ? 'Data simulasi, bukan hasil inferensi' : 'Inferensi selesai'} • {analysisResult.data?.summary?.total_sperm ?? 0} {analysisResult.data?.summary?.count_method === 'median_detections_per_frame' ? 'median deteksi per frame' : 'deteksi'} • Kedalaman {analysisResult.data?.calibration?.chamber_depth ?? 'N/A'} µm
                        </span>
                      </div>
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

                    {/* Media Display */}
                    {analysisResult.video_url ? (
                      <div style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', background: '#000', marginBottom: '16px' }}>
                        {activeResultTab === 'annotated' ? (
                          <>{analysisResult.isImage ? <img src={analysisResult.video_url} alt="Hasil deteksi citra" style={{ width: '100%', maxHeight: '280px', objectFit: 'contain' }} /> : (<video src={analysisResult.video_url} controls autoPlay loop style={{ width: '100%', maxHeight: '280px', display: 'block' }} />)}</>
                        ) : (
                          <img src={analysisResult.heatmap_url} alt="Heatmap" style={{ width: '100%', maxHeight: '280px', objectFit: 'contain' }} />
                        )}
                      </div>
                    ) : (
                      <div style={{ padding: '16px', background: 'var(--bg-card-alt)', borderRadius: 'var(--radius-md)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <CheckCircle2 size={32} color="var(--teal)" flexShrink={0} />
                        <div>
                          <strong style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>Simulasi Lintasan Spermatozoa Berhasil Dihitung</strong>
                          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                            ByteTrack berhasil merekonstruksi trajektori kinematika curvilinear (VCL) dan straight-line (VSL).
                          </div>
                        </div>
                      </div>
                    )}

                    <CalibrationSummary data={analysisResult.data} />
                    {/* Motility Subsets Breakdown */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
                      <div className="stat-tile" style={{ minHeight: 'auto', padding: '12px' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Konsentrasi</span>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                          {(analysisResult.data?.summary?.estimated_concentration ?? 0).toFixed(2)} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>M/mL</span>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--teal-subtle)', padding: '14px 18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--teal-light)' }}>
                      <AnalysisInterpretation data={analysisResult.data} />
                      <button
                        className="action-pill-btn primary"
                        style={{ background: 'var(--teal)', whiteSpace: 'nowrap' }}
                        onClick={handleSaveAnalysisToRecords}
                      >
                        <CheckCircle2 size={15} />
                        <span>Simpan ke Rekam Medis Pasien →</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── 4. DEDICATED VIEW: MASTER PATIENT RECORDS DATABASE ─── */}
        {activeTab === 'Patient Records' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* KPI Badges at Top */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
              <div className="card-box" style={{ padding: '14px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Total Rekam Pasien</span>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>{records.length}</div>
                <span style={{ fontSize: '0.68rem', color: 'var(--teal)' }}>Database Terpadu</span>
              </div>
              <div className="card-box" style={{ padding: '14px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Normozoospermia</span>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--teal)', marginTop: '2px' }}>
                  {records.filter(r => r.statusType === 'normo').length}
                </div>
                <span style={{ fontSize: '0.68rem', color: 'var(--teal)' }}>Hasil Normal</span>
              </div>
              <div className="card-box" style={{ padding: '14px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Asthenozoospermia</span>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#D97706', marginTop: '2px' }}>
                  {records.filter(r => r.statusType === 'astheno').length}
                </div>
                <span style={{ fontSize: '0.68rem', color: '#D97706' }}>Motilitas Rendah</span>
              </div>
              <div className="card-box" style={{ padding: '14px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Oligozoospermia</span>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#EF4444', marginTop: '2px' }}>
                  {records.filter(r => r.statusType === 'oligo').length}
                </div>
                <span style={{ fontSize: '0.68rem', color: '#EF4444' }}>Konsentrasi Rendah</span>
              </div>
              <div className="card-box" style={{ padding: '14px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Perlu Validasi Dokter</span>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: pendingValidationCount > 0 ? '#D97706' : '#10B981', marginTop: '2px' }}>
                  {pendingValidationCount}
                </div>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Antrean Medis</span>
              </div>
            </div>

            {/* Master Records Table Card */}
            <section className="bottom-table-card">
              <div className="table-header-row">
                <div>
                  <div className="table-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Users size={18} color="var(--teal)" />
                    <span>
                      {currentRole === 'dokter'
                        ? 'Master Rekam Medis Pasien (Otoritas Validasi Klinis)'
                        : currentRole === 'laboran'
                        ? 'Antrean Preparat & Rekam Medis Semen'
                        : 'Master Database Rekam Medis Pasien'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Pencarian dan peninjauan riwayat analisis semen seluruh pasien terdaftar
                  </div>
                </div>

                <div className="table-controls">
                  <div className="search-box">
                    <Search size={16} color="var(--text-muted)" />
                    <input
                      id="tableSearchInput"
                      type="text"
                      placeholder="Cari ID sampel, pasien, atau klinik..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && <X size={14} style={{ cursor: 'pointer' }} onClick={() => setSearchQuery('')} />}
                  </div>

                  <select
                    className="filter-btn"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="ALL">Semua Diagnosis</option>
                    {currentRole === 'dokter' && <option value="PENDING">Perlu Validasi Dokter</option>}
                    <option value="NORMO">Normozoospermia</option>
                    <option value="ASTHENO">Asthenozoospermia</option>
                    <option value="OLIGO">Oligozoospermia</option>
                  </select>

                  {currentRole === 'dokter' ? (
                    <button
                      className="action-pill-btn primary"
                      style={{ padding: '8px 14px', fontSize: '0.8rem', background: statusFilter === 'PENDING' ? '#0F172A' : 'var(--teal)' }}
                      onClick={() => setStatusFilter(statusFilter === 'PENDING' ? 'ALL' : 'PENDING')}
                    >
                      <Stethoscope size={14} />
                      <span>{statusFilter === 'PENDING' ? 'Lihat Semua' : `Perlu Validasi (${pendingValidationCount})`}</span>
                    </button>
                  ) : currentRole === 'laboran' ? (
                    <button
                      className="action-pill-btn primary"
                      style={{ padding: '8px 16px', fontSize: '0.8rem' }}
                      onClick={() => navigateTo('Analysis Lab', 'analysis')}
                    >
                      <Plus size={14} />
                      <span>+ Uji Preparat Baru</span>
                    </button>
                  ) : (
                    <button
                      className="action-pill-btn secondary"
                      style={{ padding: '8px 14px', fontSize: '0.8rem' }}
                      onClick={() => alert(`Data ${records.length} rekam pasien berhasil diekspor ke CSV.`)}
                    >
                      <Download size={14} />
                      <span>Ekspor CSV</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Table */}
              <div className="casa-table-wrap">
                <table className="casa-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>
                        <input
                          type="checkbox"
                          checked={selectedRecords.length === filteredRecords.length && filteredRecords.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedRecords(filteredRecords.map((r) => r.id));
                            else setSelectedRecords([]);
                          }}
                        />
                      </th>
                      <th>Sample ID</th>
                      <th>Pasien & Asal Faskes</th>
                      <th>Konsentrasi</th>
                      <th>Motilitas (PR+NP)</th>
                      <th>WHO 6th Status</th>
                      <th>Tanggal Masuk</th>
                      <th>Verifikasi Dokter</th>
                      <th style={{ textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.length === 0 ? (
                      <tr>
                        <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                          Tidak ada sampel yang cocok dengan pencarian "{searchQuery}".
                        </td>
                      </tr>
                    ) : (
                      filteredRecords.map((rec) => (
                        <tr
                          key={rec.id}
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            setSelectedRecord(rec);
                            setShowDetailModal(true);
                          }}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedRecords.includes(rec.id)}
                              onChange={() => toggleSelectRecord(rec.id)}
                            />
                          </td>

                          <td className="sample-id-cell">
                            <span style={{ color: 'var(--teal)' }}>#</span>{rec.id}
                          </td>

                          <td>
                            <div className="patient-cell">
                              <div className="patient-badge-icon">
                                <User size={15} />
                              </div>
                              <div className="patient-details">
                                <strong>{rec.patientName}</strong>
                                <span>{rec.clinic}</span>
                              </div>
                            </div>
                          </td>

                          <td><strong>{rec.concentration}</strong></td>

                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <strong>{rec.motilityRate}</strong>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>(PR: {rec.progRate})</span>
                            </div>
                          </td>

                          <td>
                            <span className={`status-badge ${rec.statusType}`}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'currentColor' }}></span>
                              {rec.status}
                            </span>
                          </td>

                          <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{rec.date}</td>

                          <td style={{ fontSize: '0.74rem' }}>
                            {rec.verifiedBy.includes('Dr.') ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--teal)', fontWeight: 600 }}>
                                <Check size={13} /> {rec.verifiedBy}
                              </span>
                            ) : (
                              <span className="badge-pro" style={{ background: '#FEF3C7', color: '#D97706', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <Clock size={11} /> Menunggu Dokter
                              </span>
                            )}
                          </td>

                          <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                              {currentRole === 'dokter' && rec.verifiedBy === 'Menunggu Verifikasi Dokter' && (
                                <button
                                  className="action-pill-btn primary"
                                  style={{ padding: '4px 10px', fontSize: '0.72rem', background: 'var(--teal)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                  onClick={() => handleApproveSample(rec.id)}
                                  title="Sahkan diagnosa medis secara digital"
                                >
                                  <Stethoscope size={13} />
                                  <span>Sahkan</span>
                                </button>
                              )}

                              {currentRole !== 'laboran' && (
                                <button
                                  className="action-pill-btn secondary"
                                  style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                                  title="Buka Lembar Laporan Pasien"
                                  onClick={() => {
                                    setSelectedReportId(rec.id);
                                    navigateTo('Lab Reports', 'reports');
                                  }}
                                >
                                  <FileText size={13} />
                                </button>
                              )}

                              <button
                                className="more-btn"
                                title="Inspeksi Detail Kinematika"
                                onClick={() => {
                                  setSelectedRecord(rec);
                                  setShowDetailModal(true);
                                }}
                              >
                                <Eye size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* ─── 5. DEDICATED VIEW: STANDAR WHO 6th & KENDALI MUTU (QC) ─── */}
        {activeTab === 'Quality Control' && (
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
              <div style={{ display: 'flex', gap: '8px' }}>
                <span className="badge-pro" style={{ background: 'var(--teal-subtle)', color: 'var(--teal)' }}>
                  ISO 15189:2022
                </span>
                <span className="badge-pro" style={{ background: 'var(--lime-light)', color: 'var(--lime-dark)' }}>
                  Makler 10µm Verified
                </span>
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
                <button
                  className="filter-btn"
                  onClick={() => alert('Panduan nilai acuan WHO 6th berhasil diekspor sebagai PDF.')}
                >
                  <Download size={13} />
                  <span>Unduh Panduan PDF</span>
                </button>
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
        {activeTab === 'Lab Reports' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Top Selector Bar */}
            <div className="card-box" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <FileText size={20} color="var(--teal)" />
                <div>
                  <strong style={{ fontSize: '0.94rem' }}>Pilih Sampel Rekam Medis:</strong>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Penerbitan surat keterangan hasil analisis semen</div>
                </div>
                <select
                  className="filter-btn"
                  style={{ minWidth: '240px', padding: '6px 12px', fontWeight: 600 }}
                  value={selectedReportId}
                  onChange={(e) => setSelectedReportId(e.target.value)}
                >
                  {records.map((r) => (
                    <option key={r.id} value={r.id}>
                      #{r.id} - {r.patientName} ({r.status})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="action-pill-btn secondary"
                  onClick={() => window.print()}
                >
                  <Printer size={15} />
                  <span>Cetak Laporan</span>
                </button>
                <button
                  className="action-pill-btn secondary"
                  onClick={() => alert(`Laporan PDF resmi untuk ${selectedReport.patientName} (#${selectedReport.id}) berhasil diunduh.`)}
                >
                  <Download size={15} />
                  <span>Unduh PDF</span>
                </button>
                <button
                  className="action-pill-btn primary"
                  style={{ background: 'var(--teal)' }}
                  onClick={() => alert(`Laporan resmi berhasil dikirim ke email pasien terdaftar.`)}
                >
                  <Mail size={15} />
                  <span>Kirim Email Pasien</span>
                </button>
              </div>
            </div>

            {/* Printable Clinical Report Sheet Preview */}
            <div
              className="card-box"
              style={{
                padding: '36px 40px',
                maxWidth: '820px',
                margin: '0 auto',
                width: '100%',
                background: '#FFFFFF',
                color: '#111827',
                border: '1px solid #E2E8F0',
                boxShadow: '0 8px 30px rgba(0,0,0,0.08)'
              }}
            >
              {/* Header Letterhead */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #00AFA0', paddingBottom: '16px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, #00AFA0, #00877A)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                    <Microscope size={26} />
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.3px' }}>
                      LABORATORIUM ANDROLOGI & FERTILITAS CASA-AI
                    </h2>
                    <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#64748B' }}>
                      Ringkasan analisis berbantuan AI • Memerlukan validasi laboratorium
                    </p>
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.72rem', color: '#64748B' }}>
                  <div>No. Dokumen: <strong>LAB-CASA/{selectedReport.id.replace('SMP_2026_', '')}</strong></div>
                  <div>Tanggal Cetak: <strong>{new Date().toLocaleDateString('id-ID')}</strong></div>
                </div>
              </div>

              {/* Title */}
              <div style={{ textAlign: 'center', margin: '14px 0 20px' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#00AFA0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  SURAT KETERANGAN HASIL ANALISIS SPERMA (SEMEN ANALYSIS REPORT)
                </h3>
              </div>

              {/* Patient & Specimen Info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', background: '#F8FAFC', padding: '14px 18px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.8rem' }}>
                <div>
                  <div style={{ marginBottom: '4px' }}>Nama Pasien: <strong>{selectedReport.patientName}</strong></div>
                  <div style={{ marginBottom: '4px' }}>No. Rekam Medis: <strong>RM-{selectedReport.id.replace('SMP_2026_', '')}</strong></div>
                  <div>Faskes Pengirim: <strong>{selectedReport.clinic}</strong></div>
                </div>
                <div>
                  <div style={{ marginBottom: '4px' }}>Waktu Pemeriksaan: <strong>{selectedReport.date}</strong></div>
                  <div style={{ marginBottom: '4px' }}>Metode Uji: <strong>{selectedReport.calibration ? `${selectedReport.calibration.chamber_type} (${selectedReport.calibration.chamber_depth} µm) • ${selectedReport.calibration.fps ?? 'N/A'} FPS` : 'Kalibrasi tidak tercatat'}</strong></div>
                  <div>Suhu Pemeriksaan: <strong>Belum tercatat</strong></div>
                </div>
              </div>

              {/* Section 1: Macroscopic Semen Evaluation */}
              <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>
                I. EVALUASI MAKROSKOPIS SEMEN
              </h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', marginBottom: '18px' }}>
                <thead>
                  <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #CBD5E1' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left' }}>Parameter Makroskopis</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left' }}>Hasil Pengukuran</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left' }}>Nilai Rujukan Standar WHO 6th</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right' }}>Evaluasi</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '6px 10px' }}>Volume Ejakulat</td>
                    <td style={{ padding: '6px 10px' }}><strong>{selectedReport.sampleVolume}</strong></td>
                    <td style={{ padding: '6px 10px' }}>≥ 1.4 mL</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>Evaluasi manual</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '6px 10px' }}>Warna & Bau</td>
                    <td style={{ padding: '6px 10px' }}>Belum tercatat</td>
                    <td style={{ padding: '6px 10px' }}>Putih keabuan homogen</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>Belum dinilai</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '6px 10px' }}>Likuefaksi (37°C)</td>
                    <td style={{ padding: '6px 10px' }}>Belum tercatat</td>
                    <td style={{ padding: '6px 10px' }}>Lengkap dalam &lt; 60 menit</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>Belum dinilai</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '6px 10px' }}>Viskositas & pH</td>
                    <td style={{ padding: '6px 10px' }}>{selectedReport.viscosity}, pH belum tercatat</td>
                    <td style={{ padding: '6px 10px' }}>Normal (&lt; 2 cm), pH ≥ 7.2</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>Evaluasi manual</td>
                  </tr>
                </tbody>
              </table>

              {/* Section 2: Microscopic CASA AI Evaluation */}
              <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>
                II. EVALUASI MIKROSKOPIS & KINEMATIKA CASA-AI
              </h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', marginBottom: '20px' }}>
                <thead>
                  <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #CBD5E1' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left' }}>Parameter Kinematika CASA</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left' }}>Hasil Pengukuran AI</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left' }}>Rujukan / Ambang Analisis</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right' }}>Kategori</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '6px 10px' }}>Konsentrasi Spermatozoa</td>
                    <td style={{ padding: '6px 10px' }}><strong>{selectedReport.concentration}</strong></td>
                    <td style={{ padding: '6px 10px' }}>≥ 16 Juta / mL</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                      {Number.isFinite(parseFloat(selectedReport.concentration)) ? 'Perlu validasi' : 'Tidak dapat dinilai'}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '6px 10px' }}>Motilitas Progresif (PR)</td>
                    <td style={{ padding: '6px 10px' }}><strong>{selectedReport.progRate}</strong></td>
                    <td style={{ padding: '6px 10px' }}>≥ 30%</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                      {Number.isFinite(parseFloat(selectedReport.progRate)) ? 'Perlu validasi' : 'Tidak dapat dinilai'}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '6px 10px' }}>Motilitas Total (PR + NP)</td>
                    <td style={{ padding: '6px 10px' }}><strong>{selectedReport.motilityRate}</strong></td>
                    <td style={{ padding: '6px 10px' }}>≥ 42%</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                      {Number.isFinite(parseFloat(selectedReport.motilityRate)) ? 'Perlu validasi' : 'Tidak dapat dinilai'}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '6px 10px' }}>Mean Curvilinear Velocity (VCL)</td>
                    <td style={{ padding: '6px 10px' }}>{selectedReport.vcl} µm/s</td>
                    <td style={{ padding: '6px 10px' }}>Ambang PR: {selectedReport.calibration?.prog_speed_threshold ?? 'N/A'} µm/s</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>{Number.isFinite(Number(selectedReport.vcl)) ? 'Metrik lintasan' : 'Tidak dapat dinilai'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '6px 10px' }}>Mean Straight-line Velocity (VSL)</td>
                    <td style={{ padding: '6px 10px' }}>{selectedReport.vsl} µm/s</td>
                    <td style={{ padding: '6px 10px' }}>Tidak ditetapkan</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>{Number.isFinite(Number(selectedReport.vsl)) ? 'Metrik lintasan' : 'Tidak dapat dinilai'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '6px 10px' }}>Linearity Index (LIN = VSL/VCL)</td>
                    <td style={{ padding: '6px 10px' }}>{selectedReport.lin}%</td>
                    <td style={{ padding: '6px 10px' }}>Ambang PR: {Number.isFinite(selectedReport.calibration?.prog_linearity_threshold) ? `${selectedReport.calibration.prog_linearity_threshold * 100}%` : 'N/A'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>{Number.isFinite(Number(selectedReport.lin)) ? 'Metrik lintasan' : 'Tidak dapat dinilai'}</td>
                  </tr>
                </tbody>
              </table>

              <TrackingQuality data={{ summary: selectedReport.analysisSummary, quality: selectedReport.quality }} />
              <div style={{ fontSize: '0.78rem', margin: '12px 0' }}>
                Estimasi dari lintasan: VAP {Number.isFinite(selectedReport.vap) ? `${selectedReport.vap.toFixed(1)} µm/s` : 'tidak tersedia'} · STR {Number.isFinite(selectedReport.str) ? `${selectedReport.str.toFixed(1)}%` : 'tidak tersedia'} · WOB {Number.isFinite(selectedReport.wob) ? `${selectedReport.wob.toFixed(1)}%` : 'tidak tersedia'}.<br />
                {selectedReport.analysisMethod?.vap_method && `Metode VAP: rata-rata tetangga berbobot waktu, ${selectedReport.analysisMethod.smoothing_passes} kali, titik ujung tetap. Rasio dirata-rata per lintasan; pembagi nol dikecualikan.`}
              </div>

              {/* Diagnosis Conclusion Box */}
              <div style={{ background: '#F0FDFA', border: '1.5px solid #00AFA0', borderRadius: '8px', padding: '14px 18px', marginBottom: '22px' }}>
                <div style={{ fontSize: '0.74rem', color: '#0F766E', fontWeight: 700, textTransform: 'uppercase' }}>
                  STATUS VALIDASI HASIL
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                  {selectedReport.status}
                </div>
                <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: '4px' }}>
                  {selectedReport.statusType === 'pending'
                    ? 'Hasil analisis belum divalidasi. Parameter yang tidak tersedia tidak dapat digunakan untuk kesimpulan medis.'
                    : 'Interpretasi hasil memerlukan penilaian tenaga medis dengan mempertimbangkan data pemeriksaan lengkap.'}
                </div>
              </div>

              {/* Doctor Signature & Stamp Box */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '10px' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748B', maxWidth: '280px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#00AFA0', fontWeight: 700, marginBottom: '4px' }}>
                    <Award size={14} /> Ringkasan Hasil Analisis
                  </div>
                  Dokumen ini dihasilkan oleh sistem CASA-AI. Status validasi mengikuti catatan pemeriksaan.
                </div>

                <div style={{ textAlign: 'center', minWidth: '220px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '8px' }}>
                    Status pemeriksaan<br />Penanggung jawab sesuai catatan
                  </div>
                  {/* Digital Signature Seal */}
                  <div style={{ border: '1px dashed #00AFA0', borderRadius: '6px', padding: '8px 12px', background: '#F0FDFA', display: 'inline-block', marginBottom: '6px' }}>
                    <div style={{ fontSize: '0.66rem', color: '#00AFA0', fontWeight: 800, letterSpacing: '0.5px' }}>
                      CATATAN VALIDASI
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0F172A' }}>
                      {selectedReport.verifiedBy || 'Belum tercatat'}
                    </div>
                    <div style={{ fontSize: '0.64rem', color: '#64748B' }}>
                      ID Pemeriksaan: {selectedReport.id}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── 7. DEDICATED VIEW: LABORAN & ADMIN - KALIBRASI HARDWARE & BILIK ─── */}
        {activeTab === 'Calibration' && (
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

            {/* Role advisory banner */}
            <div style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              background: currentRole === 'laboran' ? 'var(--lime-light)' : 'var(--teal-subtle)',
              border: `1px solid ${currentRole === 'laboran' ? 'var(--lime-dark)' : 'var(--teal-light)'}`,
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <Microscope size={20} color={currentRole === 'laboran' ? 'var(--lime-dark)' : 'var(--teal)'} flexShrink={0} />
              <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                <strong>{currentRole === 'laboran' ? 'Wewenang Analis Mikroskop:' : 'Akses Administrator Sistem:'}</strong> Anda berwenang mengatur kalibrasi mikrometer bilik hitung, framerate kamera mikroskop, dan batas cutoff motilitas progresif.
              </div>
            </div>

            {/* 2-Column Calibration Workspace */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {/* Left Column: Sliders Form */}
              <div className="card-box" style={{ padding: '22px' }}>
                <h4 style={{ fontSize: '0.96rem', fontWeight: 700, marginBottom: '16px' }}>
                  Parameter Optik & Komputasi
                </h4>

                <CalibrationFields controls={calibrationControls} readOnly={currentRole === 'dokter'} />
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button className="action-pill-btn secondary" onClick={resetCalibration} disabled={currentRole === 'dokter' || calibrationControls.calibrationLoading || calibrationSaving}>
                    Reset Default
                  </button>
                  <button className="action-pill-btn primary" onClick={() => handleSaveCalibration()} disabled={currentRole === 'dokter' || !calibrationReady || calibrationSaving}>
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
        {activeTab === 'User Management' && (
          <section className="bottom-table-card" style={{ marginBottom: '24px' }}>
            <div className="table-header-row">
              <div>
                <div className="table-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <UserCheck size={20} color="var(--teal)" />
                  <span>Manajemen Akun Staf & Hak Akses Laboratorium</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Akses Khusus Administrator Sistem: Kelola pengguna, peran medis, dan pengawasan wewenang RBAC.
                </div>
              </div>
              <button
                className="action-pill-btn primary"
                onClick={() => alert('Form pendaftaran staf medis baru siap ditambahkan ke database.')}
              >
                <Plus size={15} />
                <span>+ Daftarkan Pengguna Baru</span>
              </button>
            </div>

            <div className="casa-table-wrap">
              <table className="casa-table">
                <thead>
                  <tr>
                    <th>Staf Medis / Pengguna</th>
                    <th>Peran (Role)</th>
                    <th>Username & Email</th>
                    <th>Cakupan Hak Akses</th>
                    <th>Status Akun</th>
                    <th style={{ textAlign: 'right' }}>Aksi Kelola</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(ROLES).map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <img src={r.avatar} alt={r.name} style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }} />
                          <div>
                            <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>{r.user}</strong>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{r.name}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge-pro" style={{ background: r.badgeColor, color: r.badgeTextColor || '#fff', fontSize: '0.64rem' }}>
                          {r.badge}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}><strong>{r.username}</strong></div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{r.email}</div>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{r.scope}</span>
                      </td>
                      <td>
                        <span className="badge-pro" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981', fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Check size={11} /> Aktif (Online)
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button
                            className="action-pill-btn secondary"
                            style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                            onClick={() => {
                              handleRoleChange(r.id);
                              alert(`Beralih simulasi peran ke ${r.user}.`);
                            }}
                          >
                            Masuk Akun
                          </button>
                          <button
                            className="action-pill-btn secondary"
                            style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                            onClick={() => alert(`Tautan reset sandi untuk ${r.username} berhasil dikirim ke ${r.email}.`)}
                          >
                            Reset
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ─── 9. DEDICATED VIEW: ADMIN - SERVER GPU CUDA & AUDIT LOGS ─── */}
        {activeTab === 'Server Logs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
              <div className="card-box" style={{ padding: '16px' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>GPU ACCELERATOR</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--teal)', marginTop: '4px' }}>NVIDIA GTX 1650</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>CUDA 12.4 • Driver 552.22</div>
              </div>
              <div className="card-box" style={{ padding: '16px' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>VRAM ALLOCATION</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>1.84 / 4.00 GB</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--lime-dark)', marginTop: '2px' }}>46% Digunakan • Optimal</div>
              </div>
              <div className="card-box" style={{ padding: '16px' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>INFERENCE LATENCY</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--teal)', marginTop: '4px' }}>14.2 ms / frame</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>70.4 FPS (YOLOv11-Nano)</div>
              </div>
              <div className="card-box" style={{ padding: '16px' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>SYSTEM AVAILABILITY</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#10B981', marginTop: '4px' }}>99.8% Uptime</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>0 Packet Loss • Watchdog OK</div>
              </div>
            </div>

            <section className="bottom-table-card">
              <div className="table-header-row">
                <div>
                  <div className="table-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Database size={18} color="var(--teal)" />
                    <span>Real-time System Audit Trail & Security Log</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Riwayat aktivitas komputasi AI, pengesahan klinis dokter, dan otentikasi pengguna
                  </div>
                </div>
                <button
                  className="filter-btn"
                  onClick={() => alert('Log audit server berhasil diekspor ke file CSV/JSON.')}
                >
                  <Download size={14} />
                  <span>Ekspor Log Audit</span>
                </button>
              </div>

              <div className="casa-table-wrap">
                <table className="casa-table">
                  <thead>
                    <tr>
                      <th style={{ width: '110px' }}>Waktu</th>
                      <th style={{ width: '120px' }}>Level</th>
                      <th style={{ width: '180px' }}>Staf / Pengguna</th>
                      <th>Deskripsi Aktivitas</th>
                      <th style={{ textAlign: 'right' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>22:58:12</td>
                      <td><span className="badge-pro" style={{ background: 'rgba(0,175,160,0.15)', color: 'var(--teal)' }}>CLINICAL</span></td>
                      <td><strong>Dr. Sajibur Rahman</strong></td>
                      <td>Validasi klinis WHO 6th & penandatanganan hasil sampel #SMP_2026_00891</td>
                      <td style={{ textAlign: 'right', color: '#10B981', fontWeight: 600 }}>SUCCESS</td>
                    </tr>
                    <tr>
                      <td style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>22:45:01</td>
                      <td><span className="badge-pro" style={{ background: 'rgba(193,215,46,0.15)', color: 'var(--lime-dark)' }}>LAB INFERENCE</span></td>
                      <td><strong>Nurul Hidayati</strong></td>
                      <td>Inferensi video mikroskop 1080p 30 FPS kamar Makler 10µm (mAP 98.4%)</td>
                      <td style={{ textAlign: 'right', color: '#10B981', fontWeight: 600 }}>COMPLETED</td>
                    </tr>
                    <tr>
                      <td style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>22:30:19</td>
                      <td><span className="badge-pro" style={{ background: 'rgba(15,23,42,0.15)', color: 'var(--text-primary)' }}>DATABASE</span></td>
                      <td><strong>Bambang Pratama</strong></td>
                      <td>Ekspor agregat data rekam medis laboratorium ke format CSV</td>
                      <td style={{ textAlign: 'right', color: '#10B981', fontWeight: 600 }}>SUCCESS</td>
                    </tr>
                    <tr>
                      <td style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>22:15:00</td>
                      <td><span className="badge-pro" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>SYSTEM</span></td>
                      <td><strong>GPU CUDA Engine</strong></td>
                      <td>Hardware Watchdog: Suhu GPU 52°C, VRAM 46%, Pipeline stabil</td>
                      <td style={{ textAlign: 'right', color: '#10B981', fontWeight: 600 }}>HEALTHY</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* ─── MODAL 0: Role Selection & RBAC Matrix ─── */}
      {showRoleModal && (
        <div className="modal-backdrop" onClick={() => setShowRoleModal(false)}>
          <div className="modal-content-panel" style={{ maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <KeyRound size={20} color="var(--teal)" />
                Manajemen Peran & Hak Akses (RBAC)
              </h3>
              <button className="modal-close-btn" onClick={() => setShowRoleModal(false)}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Pilih peran staf medis di bawah ini untuk menguji batasan dan wewenang fitur pada sistem CASA-AI:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              {Object.values(ROLES).map((r) => {
                const isActive = currentRole === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => handleRoleChange(r.id)}
                    className="subset-tile"
                    style={{
                      textAlign: 'left',
                      padding: '16px',
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-md)',
                      borderColor: isActive ? 'var(--teal)' : 'var(--border)',
                      borderWidth: isActive ? '2px' : '1px',
                      background: isActive ? 'var(--teal-subtle)' : 'var(--bg-card-alt)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <img
                          src={r.avatar}
                          alt={r.name}
                          style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            border: `2px solid ${isActive ? 'var(--teal)' : 'var(--border)'}`
                          }}
                        />
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <strong style={{ fontSize: '0.96rem', color: 'var(--text-primary)' }}>
                              {r.user}
                            </strong>
                            <span
                              className="badge-pro"
                              style={{
                                background: r.badgeColor,
                                color: r.badgeTextColor || '#FFFFFF',
                                fontSize: '0.62rem',
                                padding: '2px 6px'
                              }}
                            >
                              {r.badge}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            {r.name} • User: <strong>{r.username}</strong>
                          </div>
                        </div>
                      </div>

                      {isActive ? (
                        <span
                          className="badge-pro"
                          style={{
                            background: 'var(--teal)',
                            color: '#FFFFFF',
                            fontSize: '0.7rem',
                            padding: '3px 8px',
                            borderRadius: '12px'
                          }}
                        >
                          ✓ Sedang Aktif
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="action-pill-btn secondary"
                          style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRoleChange(r.id);
                          }}
                        >
                          Beralih Peran
                        </button>
                      )}
                    </div>

                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                      {r.description}
                    </p>

                    {/* Features breakdown */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                      <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--teal)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={12} /> Hak Akses / Otoritas:
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                          {r.allowedFeatures.map((f, idx) => (
                            <li key={idx} style={{ marginBottom: '2px' }}>{f}</li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#D97706', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <AlertCircle size={12} /> Pembatasan Wewenang:
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {r.restrictedFeatures.map((f, idx) => (
                            <li key={idx} style={{ marginBottom: '2px' }}>{f}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="action-pill-btn primary" onClick={() => setShowRoleModal(false)}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 1: Real-time CASA-AI Video/Image Analysis ─── */}
      {showAnalysisModal && (
        <div className="modal-backdrop" onClick={() => setShowAnalysisModal(false)}>
          <div className="modal-content-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <ScanEye size={22} color="var(--teal)" />
                Laboratorium Analisis Semen (CASA-AI)
              </h3>
              <button className="modal-close-btn" onClick={() => setShowAnalysisModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div
              className="dropzone-box"
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
              <div className="dropzone-icon">
                <UploadCloud size={26} />
              </div>
              <h4 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '6px' }}>
                {uploadFile ? uploadFile.name : 'Jatuhkan rekaman video mikroskopis atau gambar di sini'}
              </h4>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Mendukung video Makler Chamber (.webm, .mp4, .avi) atau mikrograf (.png, .jpg)
              </p>
              {uploadFile && (
                <div style={{ marginTop: '10px' }}>
                  <span className="badge-pro" style={{ background: 'var(--lime-light)', color: 'var(--lime-dark)' }}>
                    File Terpilih: {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
              )}
            </div>

            <CalibrationFields controls={calibrationControls} confidence={confThres} onConfidenceChange={setConfThres} readOnly={analysisLoading} />
            <ParameterHelp name="analyze" />
            <ParameterHelp name="demo" />

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', alignItems: 'center' }}>
              <button
                className="action-pill-btn secondary"
                onClick={handleLoadDemo}
                disabled={analysisLoading}
              >
                <Play size={15} color="var(--teal)" />
                <span>Muat Sampel Demo</span>
              </button>

              <button
                className="action-pill-btn primary"
                onClick={handleExecuteAnalysis}
                disabled={analysisLoading || !uploadFile || !calibrationReady || calibrationSaving}
                style={{ opacity: analysisLoading || !uploadFile ? 0.6 : 1 }}
              >
                {analysisLoading ? <RefreshCw size={15} className="spin" /> : <Sparkles size={15} />}
                <span>{analysisLoading ? 'Memproses analisis...' : 'Jalankan Analisis AI'}</span>
              </button>
            </div>

            {analysisError && (
              <div
                style={{
                  marginTop: '16px',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#DC2626',
                  fontSize: '0.84rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <AlertCircle size={16} />
                <span>{analysisError}</span>
              </div>
            )}

            {analysisLoading && (
              <div className="analysis-progress-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 700 }}>
                  <span>{progressStatus.msg}</span>
                  <span style={{ color: 'var(--teal)' }}>{progressStatus.percent}%</span>
                </div>
                <div className="analysis-progress-bar">
                  <div
                    className="analysis-progress-bar-fill"
                    style={{ width: `${progressStatus.percent}%` }}
                  ></div>
                </div>
              </div>
            )}

            {analysisResult && (
              <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Hasil Analisis Kinematika CASA</h4>
                  <div className="center-nav-pill" style={{ padding: '3px' }}>
                    <button
                      className={`nav-tab-btn ${activeResultTab === 'annotated' ? 'active' : ''}`}
                      onClick={() => setActiveResultTab('annotated')}
                    >
                      Annotated Media
                    </button>
                    {analysisResult.heatmap_url && (
                      <button
                        className={`nav-tab-btn ${activeResultTab === 'heatmap' ? 'active' : ''}`}
                        onClick={() => setActiveResultTab('heatmap')}
                      >
                        Movement Heatmap
                      </button>
                    )}
                  </div>
                </div>

                {analysisResult.video_url ? (
                  <div style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: '#000', marginBottom: '18px' }}>
                    {activeResultTab === 'annotated' ? (
                      <>{analysisResult.isImage ? <img src={analysisResult.video_url} alt="Hasil deteksi citra" style={{ width: '100%', maxHeight: '280px', objectFit: 'contain' }} /> : (<video
                        src={analysisResult.video_url}
                        controls
                        autoPlay
                        loop
                        style={{ width: '100%', maxHeight: '360px', display: 'block' }}
                      />)}</>
                    ) : (
                      <img
                        src={analysisResult.heatmap_url}
                        alt="Heatmap"
                        style={{ width: '100%', maxHeight: '360px', objectFit: 'contain' }}
                      />
                    )}
                  </div>
                ) : (
                  <div style={{ padding: '16px', background: 'var(--bg-card-alt)', borderRadius: 'var(--radius-md)', marginBottom: '18px', textAlign: 'center' }}>
                    <CheckCircle2 size={32} color="var(--teal)" style={{ margin: '0 auto 8px' }} />
                    <div style={{ fontWeight: 700 }}>Data Pelacakan Demo Berhasil Dihitung</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Total 52 sel sperma terdeteksi dan dianalisis lintas 90 frame.
                    </div>
                  </div>
                )}

                <CalibrationSummary data={analysisResult.data} />
                <KinematicsMetrics data={analysisResult.data} />
                <MotionAvailability data={analysisResult.data} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  <div className="stat-tile" style={{ minHeight: 'auto', padding: '14px' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Progressive Motility (PR)</span>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--teal)' }}>
                      {formatMotility(analysisResult.data, 'progressive_percent')}
                    </div>
                  </div>

                  <div className="stat-tile" style={{ minHeight: 'auto', padding: '14px' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Non-Progressive (NP)</span>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--lime-dark)' }}>
                      {formatMotility(analysisResult.data, 'non_progressive_percent')}
                    </div>
                  </div>

                  <div className="stat-tile" style={{ minHeight: 'auto', padding: '14px' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Immotile (IM)</span>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-secondary)' }}>
                      {formatMotility(analysisResult.data, 'immotile_percent')}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL 2: Sample Detail Inspection & Trajectory Simulation ─── */}
      {showDetailModal && selectedRecord && (
        <div className="modal-backdrop" onClick={() => setShowDetailModal(false)}>
          <div className="modal-content-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>
                  <Microscope size={22} color="var(--teal)" />
                  Laporan Hasil Analisis #{selectedRecord.id}
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Pasien: <strong>{selectedRecord.patientName}</strong> • {selectedRecord.clinic}
                </p>
              </div>
              <button className="modal-close-btn" onClick={() => setShowDetailModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  Simulasi Lintasan Trajektori Sel (ByteTrack Visualizer)
                </span>
                <span className="badge-pro" style={{ background: 'var(--teal-light)', color: 'var(--teal)' }}>
                  Live Kinematics
                </span>
              </div>
              <canvas
                ref={canvasRef}
                width={740}
                height={240}
                className="trajectory-canvas"
              />
              <div style={{ display: 'flex', gap: '14px', marginTop: '8px', fontSize: '0.74rem', fontWeight: 700 }}>
                <span style={{ color: 'var(--teal)' }}>● Progressive (VCL ≥ {selectedRecord.calibration?.prog_speed_threshold ?? 'N/A'} µm/s, LIN ≥ {selectedRecord.calibration?.prog_linearity_threshold ?? 'N/A'})</span>
                <span style={{ color: 'var(--lime)' }}>● Non-Progressive (Gerak Lokal)</span>
                <span style={{ color: '#94A3B8' }}>● Immotile</span>
              </div>
            </div>

            <h4 style={{ fontSize: '0.96rem', fontWeight: 800, marginBottom: '12px', color: 'var(--text-primary)' }}>
              Parameter Kinematika CASA
            </h4>
            <ParameterHelp name="unavailable" />
            <ParameterHelp name="motion_method" />
            <TrackingQuality data={{ summary: selectedRecord.analysisSummary, quality: selectedRecord.quality }} />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '10px',
                marginBottom: '20px'
              }}
            >
              <div className="subset-tile" style={{ padding: '12px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>VCL (Curvilinear)</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--teal)' }}>{selectedRecord.vcl} µm/s</div>
                <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>Kecepatan total</div>
              </div>

              <div className="subset-tile" style={{ padding: '12px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>VSL (Straight Line)</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--teal)' }}>{selectedRecord.vsl} µm/s</div>
                <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>Kecepatan garis lurus</div>
              </div>

              <div className="subset-tile" style={{ padding: '12px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>VAP (Estimasi)</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{Number.isFinite(selectedRecord.vap) ? `${selectedRecord.vap.toFixed(1)} µm/s` : 'Tidak tersedia'}</div>
                <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>Jalur rata-rata</div>
              </div>

              <div className="subset-tile" style={{ padding: '12px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>LIN (Linearity)</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--lime-dark)' }}>{selectedRecord.lin}%</div>
                <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>VSL / VCL</div>
              </div>

              <div className="subset-tile" style={{ padding: '12px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>STR (Estimasi)</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{Number.isFinite(selectedRecord.str) ? `${selectedRecord.str.toFixed(1)}%` : 'Tidak tersedia'}</div>
                <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>VSL / VAP</div>
              </div>

              <div className="subset-tile" style={{ padding: '12px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>WOB (Estimasi)</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{Number.isFinite(selectedRecord.wob) ? `${selectedRecord.wob.toFixed(1)}%` : 'Tidak tersedia'}</div>
                <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>VAP / VCL</div>
              </div>

              <div className="subset-tile" style={{ padding: '12px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>ALH (Lateral Head)</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{Number.isFinite(selectedRecord.alh) ? `${selectedRecord.alh} µm` : 'Belum dihitung'}</div>
                <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>Amplitudo lateral</div>
              </div>

              <div className="subset-tile" style={{ padding: '12px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>BCF (Beat Cross)</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{Number.isFinite(selectedRecord.bcf) ? `${selectedRecord.bcf} Hz` : 'Belum dihitung'}</div>
                <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>Frekuensi ketukan</div>
              </div>
            </div>

            <div
              style={{
                padding: '16px 20px',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--teal-subtle)',
                border: '1px solid var(--teal-light)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
              }}
            >
              <div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                  DIAGNOSIS LABORATORIUM (WHO 6th EDITION)
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {selectedRecord.status}
                </div>
              </div>
              <span className={`status-badge ${selectedRecord.statusType}`} style={{ fontSize: '0.86rem', padding: '6px 14px' }}>
                {selectedRecord.status}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                Status Verifikasi: <strong style={{ color: 'var(--teal)' }}>{selectedRecord.verifiedBy}</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {currentRole === 'dokter' && (
                  <button
                    className="action-pill-btn secondary"
                    onClick={() => {
                      handleApproveSample(selectedRecord.id);
                    }}
                  >
                    <Stethoscope size={15} color="var(--teal)" />
                    <span>Sahkan Diagnosa Medis (Digital Sign)</span>
                  </button>
                )}
                {currentRole === 'laboran' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-subtle)', padding: '6px 12px', borderRadius: 'var(--radius-sm)' }}>
                    <Info size={14} color="var(--teal)" />
                    <span>Menunggu Pengesahan Dokter Spesialis</span>
                  </div>
                )}
                {currentRole === 'admin' && (
                  <button
                    className="action-pill-btn secondary"
                    onClick={() => alert(`[ADMIN SISTEM] Log audit data sampel #${selectedRecord.id} telah diverifikasi pada database.`)}
                  >
                    <Database size={15} color="var(--teal)" />
                    <span>Audit Data Record</span>
                  </button>
                )}
                <button
                  className="action-pill-btn secondary"
                  onClick={() => alert(`Laporan PDF untuk ${selectedRecord.id} berhasil diunduh.`)}
                >
                  <Download size={15} />
                  <span>Unduh PDF</span>
                </button>
                <button
                  className="action-pill-btn primary"
                  onClick={() => setShowDetailModal(false)}
                >
                  <span>Tutup</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: Microscope Optical Calibration Settings ─── */}
      {showCalibModal && (
        <div className="modal-backdrop" onClick={() => setShowCalibModal(false)}>
          <div className="modal-content-panel" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Sliders size={20} color="var(--teal)" />
                Kalibrasi Optik & Mikroskop
              </h3>
              <button className="modal-close-btn" onClick={() => setShowCalibModal(false)}>
                <X size={18} />
              </button>
            </div>

            {/* Role Advisory Banner for Calibration */}
            <div style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              background: currentRole === 'laboran' ? 'var(--lime-light)' : currentRole === 'dokter' ? '#FEF3C7' : 'var(--teal-subtle)',
              border: `1px solid ${currentRole === 'laboran' ? 'var(--lime-dark)' : currentRole === 'dokter' ? '#F59E0B' : 'var(--teal-light)'}`,
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '0.78rem'
            }}>
              {currentRole === 'laboran' && (
                <>
                  <Microscope size={18} color="var(--lime-dark)" flexShrink={0} />
                  <span style={{ color: '#121F0E' }}>
                    <strong>Otoritas Analis Mikroskop:</strong> Anda berwenang mengatur parameter fisik optik, kalibrasi kamar Makler (10µm), dan framerate kamera untuk inferensi.
                  </span>
                </>
              )}
              {currentRole === 'dokter' && (
                <>
                  <Info size={18} color="#D97706" flexShrink={0} />
                  <span style={{ color: '#92400E' }}>
                    <strong>Akses Dokter Spesialis (Read-Only):</strong> Parameter optik dikalibrasi oleh Analis Laboratorium. Anda meninjau nilai acuan untuk validasi klinis.
                  </span>
                </>
              )}
              {currentRole === 'admin' && (
                <>
                  <ShieldCheck size={18} color="var(--teal)" flexShrink={0} />
                  <span style={{ color: 'var(--text-primary)' }}>
                    <strong>Akses Admin Sistem:</strong> Pengaturan parameter komputasi inference pipeline dan threshold deteksi sperma.
                  </span>
                </>
              )}
            </div>

            <CalibrationFields controls={calibrationControls} readOnly={currentRole === 'dokter'} />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                className="action-pill-btn secondary"
                onClick={resetCalibration}
                disabled={currentRole === 'dokter' || calibrationControls.calibrationLoading || calibrationSaving}
              >
                Reset Default
              </button>
              <button
                className="action-pill-btn primary"
                onClick={() => handleSaveCalibration(true)}
                disabled={currentRole === 'dokter' || !calibrationReady || calibrationSaving}
              >
                {calibrationSaving ? 'Menyimpan...' : 'Simpan Kalibrasi ke Server'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 4: WHO 6th Edition Guidelines Reference ─── */}
      {showGuidelinesModal && (
        <div className="modal-backdrop" onClick={() => setShowGuidelinesModal(false)}>
          <div className="modal-content-panel" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <ShieldCheck size={22} color="var(--teal)" />
                Nilai Rujukan Standar WHO Manual ke-6 (2021)
              </h3>
              <button className="modal-close-btn" onClick={() => setShowGuidelinesModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
              <p>
                Sistem CASA-AI menggunakan parameter acuan resmi dari <em>WHO Laboratory Manual for the Examination and Processing of Human Semen (6th Edition)</em> untuk interpretasi klinis:
              </p>

              <div className="subset-tile" style={{ textAlign: 'left', padding: '14px' }}>
                <strong style={{ color: 'var(--teal)', display: 'block', marginBottom: '4px' }}>
                  1. Konsentrasi Sperma (Sperm Concentration)
                </strong>
                <span>Batas rujukan normal: <strong>≥ 15 Juta / mL</strong> (atau ≥ 39 Juta per ejakulat).</span>
              </div>

              <div className="subset-tile" style={{ textAlign: 'left', padding: '14px' }}>
                <strong style={{ color: 'var(--teal)', display: 'block', marginBottom: '4px' }}>
                  2. Motilitas Total (PR + NP)
                </strong>
                <span>Batas rujukan normal: <strong>≥ 42%</strong> dari total sel sperma harus motil.</span>
              </div>

              <div className="subset-tile" style={{ textAlign: 'left', padding: '14px' }}>
                <strong style={{ color: 'var(--lime-dark)', display: 'block', marginBottom: '4px' }}>
                  3. Motilitas Progresif (PR)
                </strong>
                <span>Batas rujukan normal: <strong>≥ 30%</strong> (sperma bergerak aktif maju lurus atau dalam lingkaran besar).</span>
              </div>

              <div className="subset-tile" style={{ textAlign: 'left', padding: '14px' }}>
                <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                  4. Kategori Diagnostik Klinis
                </strong>
                <ul style={{ paddingLeft: '20px', marginTop: '6px', lineHeight: 1.6 }}>
                  <li><strong>Normozoospermia</strong>: Seluruh parameter (konsentrasi, motilitas, morfologi) memenuhi batas normal.</li>
                  <li><strong>Asthenozoospermia</strong>: Motilitas progresif &lt; 30% atau total motilitas &lt; 42%.</li>
                  <li><strong>Oligozoospermia</strong>: Konsentrasi sperma &lt; 15 juta/mL.</li>
                </ul>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="action-pill-btn primary" onClick={() => setShowGuidelinesModal(false)}>
                Saya Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
