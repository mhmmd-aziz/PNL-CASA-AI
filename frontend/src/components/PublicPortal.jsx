import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../api.js';
import {
  Activity,
  HelpCircle,
  Microscope,
  Lock,
  ArrowRight,
  Sparkles,
  Layers,
  ShieldCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
  FileCheck,
  Stethoscope,
  Users,
  ClipboardList,
  QrCode,
  ScanEye,
  Pencil,
  Send,
  FileText,
  Route,
  Crosshair,
  Sliders,
  History,
  UserCheck,
  FileSpreadsheet
} from 'lucide-react';
import { getRoleMode } from '../auth';
import '../public-portal.css';
import BrandLogos from './BrandLogos';

// Alur kerja sesuai status pemeriksaan di backend (REGISTERED -> ... -> RELEASED)
const WORKFLOW_STEPS = [
  {
    icon: ClipboardList,
    role: 'Front Office',
    title: 'Registrasi dan jadwal',
    desc: 'Data pasien dicatat dan nomor rekam medis dibuat otomatis. Jadwal dipilih per slot 15 menit (maksimal 4 pasien per slot). Jika masa pantang diisi, sistem memeriksa rentang 2 sampai 7 hari.'
  },
  {
    icon: QrCode,
    role: 'Front Office',
    title: 'Label dan serah terima',
    desc: 'Setiap sampel mendapat kode unik yang dicetak sebagai barcode dan QR. Jadwal masih bisa diubah atau dibatalkan selama sampel belum diterima laboratorium.'
  },
  {
    icon: Microscope,
    role: 'Analis',
    title: 'Penerimaan dan data makroskopis',
    desc: 'Analis menerima sampel, lalu mengisi volume, waktu likuefaksi, viskositas, pH, dan penampakan. Sampel terkunci pada analis yang menerimanya.'
  },
  {
    icon: ScanEye,
    role: 'Analis',
    title: 'Analisis video',
    desc: 'Video mikroskop diunggah dengan profil kalibrasi yang dipilih. Progres ditampilkan per frame. Hasilnya berupa video beranotasi, heatmap lintasan, dan ringkasan metrik.'
  },
  {
    icon: Pencil,
    role: 'Analis',
    title: 'Koreksi deteksi',
    desc: 'Kotak deteksi bisa dihapus, ditambah, digeser, atau ditandai bukan sperma. Lintasan diteruskan ke frame berikutnya lalu metrik dihitung ulang. Setiap revisi disimpan.'
  },
  {
    icon: Send,
    role: 'Analis',
    title: 'Kirim ke dokter',
    desc: 'Pengiriman hanya bisa dilakukan jika data makroskopis lengkap dan sudah ada analisis yang selesai.'
  },
  {
    icon: Stethoscope,
    role: 'Dokter',
    title: 'Tinjauan dan tanda tangan',
    desc: 'Dokter melihat video, heatmap, angka hasil, dan perbandingannya dengan batas acuan WHO. Hasil disetujui dengan tanda tangan dan nomor SIP, atau dikembalikan ke analis disertai alasan.'
  },
  {
    icon: FileText,
    role: 'Dokter dan pasien',
    title: 'Rilis laporan',
    desc: 'Setelah dirilis, laporan tidak bisa diubah. Pasien membuka laporannya sendiri di portal lalu mencetak atau menyimpannya sebagai PDF.'
  }
];

// Menu yang tersedia untuk tiap peran di dashboard
const ROLES = {
  frontOffice: {
    label: 'Front Office',
    icon: ClipboardList,
    menus: 'Ringkasan, Registrasi Pasien, List Pasien, Pemeriksaan & Sampel, Scan QR',
    desc: 'Mendaftarkan pasien dan pemeriksaan, mengatur jadwal, dan menyerahkan sampel ke laboratorium. Front Office tidak bisa melihat atau mengubah hasil analisis.',
    points: [
      'Pasien baru otomatis mendapat akun portal dengan kata sandi sementara',
      'Peringatan jika pasien sudah dijadwalkan di hari yang sama; pemaksaan wajib disertai alasan',
      'Cetak label barcode dan QR, serta scan QR untuk membuka data sampel'
    ]
  },
  analyst: {
    label: 'Analis',
    icon: Microscope,
    menus: 'Ringkasan, Sampel Masuk, Analisis Sampel, Hasil Analisis, Standar WHO 6th',
    desc: 'Menerima sampel, mengisi data makroskopis, menjalankan analisis video, memperbaiki deteksi yang keliru, lalu mengirim hasilnya ke dokter. Analis tidak bisa menyetujui atau merilis laporan.',
    points: [
      'Parameter kalibrasi bisa diubah untuk satu analisis tanpa mengubah preset tersimpan',
      'Editor koreksi per frame dengan pratinjau sebelum disimpan',
      'Analisis gambar tunggal untuk hitung sel (tanpa motilitas, tidak terhubung ke pemeriksaan)'
    ]
  },
  physician: {
    label: 'Dokter',
    icon: Stethoscope,
    menus: 'Ringkasan, Tinjau Hasil, Hasil Analisis, Laporan & Tanda Tangan, Riwayat Laporan',
    desc: 'Meninjau hasil yang dikirim analis, menulis interpretasi klinis, menyetujui dengan tanda tangan, mengembalikan hasil untuk dikoreksi, dan merilis laporan.',
    points: [
      'Perbandingan hasil dengan batas bawah acuan WHO edisi 6 sebagai bahan pertimbangan',
      'Draf interpretasi dari AI bersifat opsional dan hanya aktif jika server dikonfigurasi',
      'Riwayat hanya berisi laporan yang ditandatangani dokter tersebut'
    ]
  },
  patient: {
    label: 'Pasien',
    icon: Users,
    menus: 'Antrean Saya, Laporan Saya, Ubah Kata Sandi',
    desc: 'Melihat jadwal dan status pemeriksaan, serta membuka laporan miliknya yang sudah dirilis dokter.',
    points: [
      'Hanya laporan milik sendiri dengan status rilis yang bisa dibuka',
      'Video mentah dan data analisis internal tidak ditampilkan',
      'Laporan bisa dicetak atau disimpan sebagai PDF dari browser'
    ]
  },
  admin: {
    label: 'Super Admin',
    icon: UserCheck,
    menus: 'Dashboard, Riwayat Laporan, Pengguna & Peran, Log Audit, Preset Kalibrasi, Standar WHO 6th',
    desc: 'Mengelola akun staf, preset kalibrasi, dan memantau operasional laboratorium. Super Admin tidak bisa menandatangani atau mengubah hasil klinis.',
    points: [
      'Dashboard volume, status, dan waktu proses per rentang tanggal, dengan ekspor PDF dan Excel',
      'Ekspor dashboard tidak memuat nama atau nomor rekam medis pasien',
      'Sistem menolak penonaktifan Super Admin aktif terakhir'
    ]
  }
};

// Ringkasan perhitungan di train model/analysis (motion, classifier, calibration)
const METRICS = [
  { name: 'VCL', how: 'Panjang lintasan dibagi durasi lintasan', unit: 'µm/s', note: 'Dipakai untuk klasifikasi' },
  { name: 'VSL', how: 'Jarak titik awal ke titik akhir dibagi durasi', unit: 'µm/s', note: '' },
  { name: 'LIN', how: 'VSL dibagi VCL', unit: '0 sampai 1', note: 'Dipakai untuk klasifikasi' },
  { name: 'VAP', how: 'Panjang lintasan setelah dua kali penghalusan posisi, dibagi durasi', unit: 'µm/s', note: 'Eksperimental' },
  { name: 'STR', how: 'VSL dibagi VAP', unit: '0 sampai 1', note: 'Eksperimental' },
  { name: 'WOB', how: 'VAP dibagi VCL', unit: '0 sampai 1', note: 'Eksperimental' },
  { name: 'ALH, BCF', how: 'Belum dihitung', unit: '-', note: 'Tidak tersedia' },
  { name: 'Jumlah sel', how: 'Median jumlah deteksi sperma per frame', unit: 'sel', note: 'Dipakai untuk konsentrasi' },
  { name: 'Konsentrasi', how: 'Jumlah sel × faktor pengenceran ÷ volume bidang pandang (lebar × tinggi piksel × skala² × kedalaman bilik)', unit: 'juta/mL', note: 'Estimasi' }
];

// Nilai di backend/clinical_interpretation.py (WHO_LOWER_LIMITS)
const WHO_REFERENCES = [
  { param: 'Volume', limit: '1,4 mL', source: 'Diisi analis' },
  { param: 'Konsentrasi', limit: '16 juta/mL', source: 'Estimasi dari video' },
  { param: 'Jumlah total', limit: '39 juta per ejakulat', source: 'Konsentrasi × volume' },
  { param: 'Motilitas total (PR + NP)', limit: '42%', source: 'Dari video' },
  { param: 'Motilitas progresif (PR)', limit: '30%', source: 'Dari video, memakai ambang aplikasi' },
  { param: 'pH', limit: '7,2', source: 'Diisi analis' }
];

const FAQS = [
  {
    q: 'Apakah hasil CASA-AI merupakan diagnosis?',
    a: 'Bukan. Sistem menghasilkan estimasi dari video. Hasil diperiksa analis, lalu dokter menulis interpretasi dan memutuskan apakah laporan disetujui. Laporan tidak terbit tanpa persetujuan dokter.'
  },
  {
    q: 'Bagaimana sistem menentukan sperma progresif, non-progresif, dan imotil?',
    a: 'Setiap lintasan memakai satu segmen berurutan terpanjang dengan minimal 15 pengamatan. Lintasan masuk progresif (PR) jika VCL dan LIN keduanya mencapai ambang, imotil (IM) jika VCL di bawah ambang imotil, dan selain itu non-progresif (NP). Ambang bawaan adalah VCL 25 µm/s, LIN 0,8, dan imotil 5 µm/s. Ambang ini bisa diubah dan belum divalidasi secara klinis.'
  },
  {
    q: 'Mengapa kalibrasi harus diisi dengan benar?',
    a: 'Kecepatan dan konsentrasi bergantung pada skala piksel (µm/px), FPS, kedalaman bilik, dan faktor pengenceran. Skala piksel harus diukur dengan mikrometer pada mikroskop dan resolusi yang dipakai. Nilai bawaan hanya contoh. Pilihan bilik yang tersedia adalah Makler 10 µm, Leja 20 µm, Improved Neubauer 100 µm, atau kedalaman custom. Nilai yang dipakai disimpan bersama setiap hasil.'
  },
  {
    q: 'Video seperti apa yang bisa dianalisis?',
    a: 'File video dibaca dengan OpenCV dan sudah diuji dengan MP4 dan AVI. FPS diambil dari metadata video. Jika metadata tidak tersedia atau tidak sesuai, misalnya pada video slow motion, isi FPS secara manual. Analisis gambar tunggal hanya menghasilkan hitungan sel tanpa motilitas.'
  },
  {
    q: 'Apa yang terjadi jika analisis gagal?',
    a: 'Analis melihat pesan kesalahan dan sistem tidak menyimpan angka pengganti. Sampel belum bisa dikirim ke dokter sampai ada analisis yang selesai. Jika bobot model tidak ditemukan atau file kalibrasi rusak, analisis langsung ditolak dengan pesan yang jelas.'
  },
  {
    q: 'Bagaimana pasien mendapatkan akun?',
    a: 'Akun pasien dibuat oleh Front Office saat pemeriksaan pertama didaftarkan. Kata sandi sementara hanya ditampilkan sekali dan bisa diganti pasien setelah masuk.'
  },
  {
    q: 'Apakah hasil bisa diubah setelah laporan dirilis?',
    a: 'Tidak. Sebelum laporan disetujui, dokter bisa mengembalikan hasil ke analis. Analisis ulang membuat hasil baru dan hasil lama tetap tersimpan. Setelah dirilis, laporan dan data pemeriksaannya terkunci.'
  }
];

export default function PublicPortal({ onSwitchToDashboard }) {
  const navigate = useNavigate();

  const handleGoToDashboard = () => {
    if (getRoleMode()) {
      if (onSwitchToDashboard) {
        onSwitchToDashboard();
      } else {
        navigate('/dashboard');
      }
    } else {
      navigate('/login');
    }
  };

  const [activeRole, setActiveRole] = useState('frontOffice');
  const [openFaq, setOpenFaq] = useState(0);

  const toggleFaq = (idx) => {
    setOpenFaq(openFaq === idx ? null : idx);
  };

  const role = ROLES[activeRole];
  const RoleIcon = role.icon;

  return (
    <div className="public-portal-scope">

      {/* ─── HERO ─── */}
      <div className="hero-outer-wrapper">
        <section className="home-hero-dark-card" id="hero">

          <header className="hero-internal-nav">
            <div className="hero-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <BrandLogos size={34} />
              <div className="hero-brand-text">
                <span className="brand-name">CASA<span className="brand-dot">·</span>AI</span>
                <span className="brand-badge-tag">LAB ANDROLOGI</span>
              </div>
            </div>

            <nav className="hero-nav-menu">
              <a href="#alur">Alur Kerja</a>
              <a href="#peran">Peran</a>
              <a href="#analisis">Cara Kerja Analisis</a>
              <a href="#keamanan">Keamanan</a>
              <a href="#faq-section">FAQ</a>
            </nav>

            <div className="hero-nav-action">
              <button
                onClick={handleGoToDashboard}
                className="hero-login-pill-btn"
                title={getRoleMode() ? 'Buka Dashboard' : 'Masuk untuk staf laboratorium dan pasien'}
              >
                <Lock size={14} />
                <span>{getRoleMode() ? 'Dashboard' : 'Masuk'}</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </header>

          <div className="hero-main-content">

            <div className="hero-left-col">
              <div className="hero-eyebrow-pill">
                <Sparkles size={14} color="#C1D72E" />
                <span>Computer-Assisted Sperm Analysis</span>
              </div>

              <h1 className="hero-headline">
                Analisis motilitas sperma dari video mikroskop dengan <span className="highlight-lime">CASA-AI</span>
              </h1>

              <p className="hero-description">
                CASA-AI mendeteksi dan melacak sperma pada video mikroskop, menghitung kecepatan dan kelurusan geraknya, lalu mengelompokkannya menjadi progresif, non-progresif, dan imotil. Hasil diperiksa analis dan disetujui dokter sebelum laporan sampai ke pasien.
              </p>

              <div className="hero-cta-group">
                <button className="btn-cta-lime" onClick={handleGoToDashboard}>
                  <span>{getRoleMode() ? 'Buka Dashboard' : 'Masuk'}</span>
                  <ArrowRight size={16} />
                </button>
                <a className="btn-cta-glass" href="#alur">
                  <Route size={16} />
                  <span>Lihat alur kerja</span>
                </a>
              </div>
            </div>

            <div className="hero-right-col">
              <div className="hero-feature-cards-grid">

                <div className="hero-feature-card">
                  <div className="hero-fc-icon"><Crosshair size={22} color="#C1D72E" /></div>
                  <h4>Deteksi dan pelacakan</h4>
                  <p>Model YOLO11n yang dilatih pada dataset sperma mendeteksi sel di setiap frame. ByteTrack menyambungkan deteksi antarframe menjadi lintasan.</p>
                </div>

                <div className="hero-feature-card">
                  <div className="hero-fc-icon"><Sliders size={22} color="#00AFA0" /></div>
                  <h4>Kalibrasi tercatat</h4>
                  <p>Skala µm/px, FPS, kedalaman bilik, dan faktor pengenceran disimpan bersama setiap hasil analisis.</p>
                </div>

                <div className="hero-feature-card">
                  <div className="hero-fc-icon"><Pencil size={22} color="#C1D72E" /></div>
                  <h4>Koreksi oleh analis</h4>
                  <p>Deteksi yang keliru bisa dihapus atau diperbaiki per frame, lalu metrik dihitung ulang.</p>
                </div>

                <div className="hero-feature-card">
                  <div className="hero-fc-icon"><FileCheck size={22} color="#00AFA0" /></div>
                  <h4>Persetujuan dokter</h4>
                  <p>Laporan terbit setelah dokter menyetujui dan menandatanganinya. Laporan yang sudah dirilis tidak bisa diubah.</p>
                </div>

              </div>

              <div className="hero-trust-stats-strip">
                <div className="trust-stat-item">
                  <div className="trust-stat-icon"><Activity size={18} color="#C1D72E" /></div>
                  <div className="trust-stat-info">
                    <span className="trust-stat-val">6 metrik gerak</span>
                    <span className="trust-stat-lbl">VCL, VSL, LIN, VAP, STR, WOB</span>
                  </div>
                </div>
                <div className="trust-stat-divider" />
                <div className="trust-stat-item">
                  <div className="trust-stat-icon"><Users size={18} color="#00AFA0" /></div>
                  <div className="trust-stat-info">
                    <span className="trust-stat-val">5 peran</span>
                    <span className="trust-stat-lbl">Front Office, analis, dokter, pasien, admin</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

        </section>
      </div>

      {/* ─── ALUR KERJA ─── */}
      <section className="clean-white-section" id="alur">
        <div className="section-container">

          <div className="section-header-center">
            <span className="section-pill-tag">
              <Route size={14} color="#00AFA0" />
              <span>ALUR KERJA</span>
            </span>
            <h2 className="section-heading-large">
              Dari registrasi sampai <span className="text-teal">laporan dirilis</span>
            </h2>
            <p className="section-subheading-max">
              Setiap pemeriksaan melewati status Terdaftar, Diproses, Menunggu Tinjauan, Disetujui, dan Dirilis. Server menolak perpindahan status yang melompati urutan, dan setiap langkah dicatat dengan nama pelaku serta waktunya.
            </p>
          </div>

          <div className="protocol-grid">
            {WORKFLOW_STEPS.map((step, idx) => {
              const StepIcon = step.icon;
              return (
                <div key={step.title} className="protocol-card">
                  <div className="protocol-badge">{String(idx + 1).padStart(2, '0')}</div>
                  <StepIcon size={20} color="#00AFA0" />
                  <h4>{step.title}</h4>
                  <p><strong>{step.role}.</strong> {step.desc}</p>
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* ─── PERAN ─── */}
      <section className="clean-white-section" id="peran">
        <div className="section-container">

          <div className="section-header-center">
            <span className="section-pill-tag">
              <Users size={14} color="#00AFA0" />
              <span>PERAN DAN HAK AKSES</span>
            </span>
            <h2 className="section-heading-large">
              Setiap akun hanya melihat <span className="text-teal">bagian tugasnya</span>
            </h2>
            <p className="section-subheading-max">
              Hak akses diperiksa di server untuk setiap permintaan, tidak hanya dengan menyembunyikan tombol di tampilan.
            </p>
          </div>

          <div className="capsule-tabs-container">
            {Object.entries(ROLES).map(([key, item]) => {
              const TabIcon = item.icon;
              return (
                <button
                  key={key}
                  className={`capsule-tab-btn ${activeRole === key ? 'active' : ''}`}
                  onClick={() => setActiveRole(key)}
                >
                  <TabIcon size={16} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="tab-showcase-card tab-showcase-full">
            <div className="tab-card-full">
              <div className="tab-card-top-row">
                <div className="tab-card-icon-box">
                  <RoleIcon size={28} color="#00AFA0" />
                </div>
                <span className="card-badge-small">Menu: {role.menus}</span>
              </div>
              <h3 className="tab-card-title">{role.label}</h3>
              <p className="tab-card-desc">{role.desc}</p>

              <div className="benefits-checklist benefits-checklist-row">
                {role.points.map((pt) => (
                  <div key={pt} className="benefit-item">
                    <div className="benefit-check-icon">
                      <Check size={14} color="#00AFA0" strokeWidth={3} />
                    </div>
                    <span>{pt}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ─── CARA KERJA ANALISIS ─── */}
      <section className="clean-white-section" id="analisis">
        <div className="section-container">

          <div className="section-header-center">
            <span className="section-pill-tag">
              <Cpu size={14} color="#00AFA0" />
              <span>CARA KERJA ANALISIS</span>
            </span>
            <h2 className="section-heading-large">
              Dari frame video menjadi <span className="text-teal">angka motilitas</span>
            </h2>
            <p className="section-subheading-max">
              Model hanya bertugas mendeteksi dan melacak sel. Semua angka setelah itu dihitung dengan rumus tetap dari lintasan dan nilai kalibrasi, sehingga hasilnya dapat ditelusuri dan diulang.
            </p>
          </div>

          <div className="protocol-container">
            <div className="protocol-grid">
              <div className="protocol-card">
                <div className="protocol-badge">01</div>
                <Crosshair size={20} color="#00AFA0" />
                <h4>Deteksi</h4>
                <p>Setiap frame diproses model YOLO11n untuk menemukan posisi setiap sperma.</p>
              </div>
              <div className="protocol-card">
                <div className="protocol-badge">02</div>
                <Route size={20} color="#00AFA0" />
                <h4>Pelacakan</h4>
                <p>ByteTrack memberi ID yang sama untuk sel yang sama di frame berikutnya, sehingga terbentuk lintasan per sel.</p>
              </div>
              <div className="protocol-card">
                <div className="protocol-badge">03</div>
                <Layers size={20} color="#00AFA0" />
                <h4>Seleksi lintasan</h4>
                <p>Untuk setiap ID diambil satu segmen berurutan terpanjang dengan minimal 15 pengamatan. Frame yang terputus tidak disambung.</p>
              </div>
              <div className="protocol-card">
                <div className="protocol-badge">04</div>
                <Activity size={20} color="#00AFA0" />
                <h4>Perhitungan dan klasifikasi</h4>
                <p>Jarak piksel dikalikan skala µm/px dan waktu dihitung dari FPS. Lintasan lalu dikelompokkan menjadi PR, NP, atau IM berdasarkan ambang yang berlaku.</p>
              </div>
            </div>
          </div>

          <div className="who-table-card">
            <div className="table-responsive">
              <table className="medical-reference-table">
                <thead>
                  <tr>
                    <th>Metrik</th>
                    <th>Cara dihitung</th>
                    <th>Satuan</th>
                    <th className="highlight-col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {METRICS.map((metric) => (
                    <tr key={metric.name}>
                      <td className="param-name">{metric.name}</td>
                      <td>{metric.how}</td>
                      <td>{metric.unit}</td>
                      <td className="highlight-cell">{metric.note || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="protocol-container">
            <h3 className="protocol-title">Aturan klasifikasi bawaan (dapat diatur)</h3>
            <div className="protocol-grid protocol-grid-3">
              <div className="protocol-card">
                <h4>Progresif (PR)</h4>
                <p>VCL minimal 25 µm/s dan LIN minimal 0,8.</p>
              </div>
              <div className="protocol-card">
                <h4>Non-progresif (NP)</h4>
                <p>Bergerak, tetapi tidak memenuhi syarat PR.</p>
              </div>
              <div className="protocol-card">
                <h4>Imotil (IM)</h4>
                <p>VCL di bawah 5 µm/s.</p>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ─── ACUAN WHO ─── */}
      <section className="clean-white-section" id="acuan">
        <div className="section-container">

          <div className="section-header-center">
            <span className="section-pill-tag">
              <FileSpreadsheet size={14} color="#00AFA0" />
              <span>PEMBANDING UNTUK DOKTER</span>
            </span>
            <h2 className="section-heading-large">
              Batas bawah acuan <span className="text-teal">WHO edisi 6 (2021)</span>
            </h2>
            <p className="section-subheading-max">
              Saat meninjau hasil, dokter melihat perbandingan angka sampel dengan batas bawah acuan (persentil ke-5) di bawah ini. Nilai acuan ini belum diverifikasi oleh ahli laboratorium dan hanya menjadi pembanding, bukan kesimpulan.
            </p>
          </div>

          <div className="who-table-card">
            <div className="table-responsive">
              <table className="medical-reference-table">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th className="highlight-col">Batas bawah acuan</th>
                    <th>Sumber nilai di CASA-AI</th>
                  </tr>
                </thead>
                <tbody>
                  {WHO_REFERENCES.map((item) => (
                    <tr key={item.param}>
                      <td className="param-name">{item.param}</td>
                      <td className="highlight-cell">{item.limit}</td>
                      <td>{item.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </section>

      {/* ─── KEAMANAN ─── */}
      <section className="clean-white-section" id="keamanan">
        <div className="section-container">

          <div className="section-header-center">
            <span className="section-pill-tag">
              <ShieldCheck size={14} color="#00AFA0" />
              <span>KEAMANAN DAN JEJAK AUDIT</span>
            </span>
            <h2 className="section-heading-large">
              Data pasien dan rekaman <span className="text-teal">dibatasi per peran</span>
            </h2>
          </div>

          <div className="bento-grid">

            <div className="bento-card bento-card-large">
              <div className="bento-card-header">
                <span className="bento-pill">Akses</span>
                <h3>Akun, sesi, dan berkas</h3>
              </div>
              <div className="benefits-checklist">
                {[
                  'Kata sandi disimpan sebagai hash PBKDF2-SHA256 dengan salt',
                  'Sesi berlaku 8 jam. Token disimpan dalam bentuk hash, dan logout langsung mencabutnya',
                  'Pesan login gagal sama untuk email yang salah dan kata sandi yang salah',
                  'Video dan heatmap hasil hanya dibuka lewat tautan bertanda tangan yang berlaku 15 menit untuk analis atau dokter',
                  'Nama berkas unggahan diganti ID acak, bukan nama asli dari pengguna',
                  'Pasien hanya melihat laporan miliknya sendiri yang sudah dirilis'
                ].map((item) => (
                  <div key={item} className="benefit-item">
                    <div className="benefit-check-icon">
                      <Check size={14} color="#00AFA0" strokeWidth={3} />
                    </div>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bento-card">
              <div className="bento-card-header">
                <span className="bento-pill">Audit</span>
                <h3>Setiap tindakan penting tercatat</h3>
                <p>
                  Log audit mencatat login berhasil maupun gagal, registrasi, pemaksaan jadwal, penerimaan sampel, pengiriman ke dokter, persetujuan, pengembalian, rilis laporan, dan perubahan akun. Setiap catatan menyimpan pelaku, peran, waktu, dan target. Super Admin bisa menyaring log berdasarkan jenis tindakan.
                </p>
              </div>
              <div className="bento-icon-visual">
                <div className="bento-icon-row">
                  <div className="bento-icon-circle"><History size={24} color="#00AFA0" /></div>
                  <div className="bento-icon-circle"><UserCheck size={24} color="#C1D72E" /></div>
                </div>
              </div>
            </div>

            <div className="bento-card bento-card-dark">
              <div className="bento-dark-badge">
                <HelpCircle size={18} color="#C1D72E" />
                <span>Batasan saat ini</span>
              </div>
              <h3 className="bento-dark-title">Alat bantu laboratorium, bukan alat diagnosis</h3>
              <p className="bento-dark-desc">
                Akurasi model belum divalidasi secara klinis pada data independen. ALH dan BCF belum dihitung. Satu ID lintasan belum tentu sama dengan satu sel, karena ID bisa berganti di tengah video. Konsentrasi masih berupa estimasi yang bergantung pada kalibrasi.
              </p>
              <div className="bento-dark-footer">
                <span className="compliance-tag">Perlu tinjauan dokter</span>
                <span className="compliance-tag">Ambang dapat diatur</span>
                <span className="compliance-tag">Estimasi</span>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="clean-white-section" id="faq-section">
        <div className="section-container" style={{ maxWidth: '860px' }}>

          <div className="section-header-center">
            <span className="section-pill-tag">
              <HelpCircle size={14} color="#00AFA0" />
              <span>PERTANYAAN UMUM</span>
            </span>
            <h2 className="section-heading-large">
              Pertanyaan yang sering diajukan
            </h2>
          </div>

          <div className="faq-accordion-list">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={faq.q} className={`faq-item-card ${isOpen ? 'open' : ''}`}>
                  <button
                    className="faq-question-btn"
                    onClick={() => toggleFaq(idx)}
                    aria-expanded={isOpen}
                  >
                    <span className="faq-q-text">{faq.q}</span>
                    <span className="faq-icon-wrap">
                      {isOpen ? <ChevronUp size={18} color="#00AFA0" /> : <ChevronDown size={18} color="#64748b" />}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="faq-answer-body">
                      <p>{faq.a}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="portal-modern-footer">
        <div className="footer-inner-content">
          <div className="footer-columns-grid">

            <div className="footer-brand-col">
              <div className="footer-brand-row" style={{ marginBottom: '14px' }}>
                <div className="hero-brand-icon">
                  <Microscope size={20} color="#061019" />
                </div>
                <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#0f172a' }}>CASA<span style={{ color: '#00AFA0' }}>·</span>AI</span>
              </div>
              <p className="footer-desc-text">
                Aplikasi pendukung laboratorium untuk analisis motilitas sperma dari video mikroskop, dengan tinjauan analis dan persetujuan dokter sebelum laporan dirilis.
              </p>
            </div>

            <div className="footer-links-col">
              <h4>Navigasi</h4>
              <ul>
                <li><a href="#alur">Alur kerja</a></li>
                <li><a href="#peran">Peran dan hak akses</a></li>
                <li><a href="#analisis">Cara kerja analisis</a></li>
                <li><a href="#acuan">Acuan WHO</a></li>
                <li><a href="#faq-section">FAQ</a></li>
              </ul>
            </div>

            <div className="footer-links-col">
              <h4>Akses</h4>
              <ul>
                <li><a href="/login" onClick={(e) => { e.preventDefault(); handleGoToDashboard(); }}>Masuk staf dan pasien</a></li>
                <li><a href={`${API_BASE_URL}/docs`} target="_blank" rel="noreferrer">Dokumentasi API</a></li>
              </ul>
            </div>

            <div className="footer-links-col">
              <h4>Pemberitahuan</h4>
              <p className="footer-disclaimer-note">
                Hasil CASA-AI adalah estimasi dan bukan diagnosis. Interpretasi klinis dan keputusan terapi ditetapkan oleh dokter penanggung jawab.
              </p>
            </div>

          </div>

          <div className="footer-bottom-flex">
            <div className="footer-copyright">
              © 2026 CASA-AI
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
