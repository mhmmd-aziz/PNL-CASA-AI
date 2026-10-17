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
  Compass,
  Zap,
  TrendingUp,
  Award,
  Layers,
  ShieldCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  FileCheck,
  Stethoscope,
  Users,
  Flame,
  FileSpreadsheet
} from 'lucide-react';
import { getRoleMode } from '../auth';
import '../public-portal.css';
import BrandLogos from './BrandLogos';

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

  // Tabbed Showcase State
  const [activeShowcaseTab, setActiveShowcaseTab] = useState('motility');

  // FAQ Accordion State
  const [openFaq, setOpenFaq] = useState(0);

  const toggleFaq = (idx) => {
    setOpenFaq(openFaq === idx ? null : idx);
  };

  // Content data for showcase tab
  const showcaseData = {
    motility: {
      title: "Klasifikasi Motilitas Progresif & Non-Progresif Sesuai WHO 6th",
      desc: "Algoritma AI melacak koordinat trajektori kepala sperma frame-by-frame dengan akurasi tinggi, membedakan gerakan translasi aktif progresif (PR), pergerakan di tempat non-progresif (NP), dan spermatozoa tidak bergerak (IM).",
      points: [
        "Deteksi kecepatan curvilinear (VCL) & straight-line (VSL) real-time",
        "Ambang batas terkalibrasi: PR jika VCL dan LIN sesuai ambang konfigurasi analisis",
        "Mengeliminasi bias subjektivitas visual mikroskop manual laboratorium"
      ],
      tag: "WHO 6th Motility Criteria",
      icon: TrendingUp
    },
    makler: {
      title: "Kalibrasi Standar Bilik Hitung Makler (10µm) & Leja Chamber (20µm)",
      desc: "Menghitung konsentrasi spermatozoa per mililiter dengan volume monolayer presisi tinggi. Menjaga sperma tetap bergerak dalam bidang fokus horizontal 20µm tanpa tumpang tindih vertikal.",
      points: [
        "Kompensasi faktor pengenceran sampel otomatis (1x hingga 20x)",
        "Skala piksel harus diukur dengan mikrometer untuk optik dan resolusi aktual",
        "Integrasi formula kalkulasi standar WHO untuk densitas juta/mL"
      ],
      tag: "Makler Chamber 10µm Depth",
      icon: Microscope
    },
    kinematics: {
      title: "Analisis Kinematika Biomekanika Sperma Mendalam (9+ Metrik)",
      desc: "Memberikan parameter kuantitatif yang tidak mungkin dihitung mata telanjang: Curvilinear Velocity (VCL), Straight-Line Velocity (VSL), dan Linearitas (LIN). VAP, STR, dan WOB tersedia sebagai estimasi dari lintasan yang diperhalus. ALH dan BCF belum dihitung.",
      points: [
        "Indikator kunci evaluasi kapasitasi & hiperaktivasi untuk program IVF",
        "Frekuensi kepakan flagela (Beat Cross Frequency / BCF)",
        "Peta panas lintasan pergerakan (heatmap) seluruh spermatozoa sampel"
      ],
      tag: "Full CASA Kinematics Suite",
      icon: Activity
    },
    certification: {
      title: "Sertifikasi Digital & Integrasi Rekam Medis Pasien Terverifikasi",
      desc: "Hasil analisis dapat langsung disinkronkan ke rekam medis pasien di dashboard dokter spesialis andrologi untuk validasi klinis, tanda tangan digital, kendali mutu laboratorium, dan ekspor PDF resmi.",
      points: [
        "Akses berjenjang: Dokter Spesialis, Analis Lab, dan Superadmin",
        "Laporan resmi siap cetak format PDF sesuai akreditasi rumah sakit",
        "Penyimpanan berkas video dan citra mikroskop dengan enkripsi AES-256"
      ],
      tag: "ISO 15189 & PERANDI Ready",
      icon: ShieldCheck
    }
  };

  const activeTabContent = showcaseData[activeShowcaseTab];

  // FAQ data
  const faqs = [
    {
      q: "Apa perbedaan utama standar WHO 6th Edition (2021) dibanding edisi ke-5 (2010)?",
      a: "WHO 6th Edition memperbarui nilai batas bawah rujukan (persentil ke-5) berdasarkan data global populasi pria subur. Total motilitas (PR + NP) dinaikkan menjadi ≥ 42% (sebelumnya 40%), motilitas progresif (PR) disesuaikan menjadi ≥ 30% (sebelumnya 32%), dan volume ejakulat batas bawah disesuaikan ke 1.4 mL. Selain itu, WHO 6th menekankan standarisasi instrumen CASA untuk meminimalkan variasi antar-laboratorium."
    },
    {
      q: "Mengapa bilik hitung Makler 10µm dianjurkan untuk analisis motilitas CASA?",
      a: "Bilik Makler memiliki kedalaman celah 10 µm. Pilih kedalaman sesuai spesifikasi bilik yang benar-benar digunakan. Kedalaman ini memastikan spermatozoa berada dalam satu lapisan monolayer yang seragam sehingga kamera mikroskop dapat memfokuskan seluruh sel tanpa ada spermatozoa yang tersembunyi di lapisan atas atau bawah, serta memungkinkan pergerakan alami flagela tanpa hambatan gesekan cover glass konvensional."
    },
    {
      q: "Bagaimana kecerdasan buatan (AI) membedakan sperma motil progresif dan non-progresif?",
      a: "Sistem mendeteksi kepala sperma menggunakan YOLOv11 dan melacak vektor posisinya dari frame ke frame menggunakan ByteTrack. Dari koordinat tersebut dihitung kecepatan lintasan (VCL) dan rasio kelurusan (LIN). Kategori Progresif (PR) menggunakan kedua ambang pada konfigurasi analisis, bukan ambang universal yang telah divalidasi klinis. Jika bergerak namun di bawah ambang kecepatan atau lintasan melingkar kecil, diklasifikasikan sebagai Non-Progresif (NP)."
    },
    {
      q: "Format rekaman video mikroskop apa saja yang didukung oleh platform ini?",
      a: "Platform mendukung file rekaman video MP4, AVI, MOV, dan WebM yang diambil langsung dari kamera mikroskop digital (misalnya C-Mount microscope camera). Untuk hasil analisis optimal, disarankan resolusi minimal 720p pada 30 hingga 60 frame per detik (FPS) dengan pembesaran lensa 10x atau 20x fase kontras."
    },
    {
      q: "Apakah keamanan data pasien dan rekaman video laboratorium terjamin?",
      a: "Ya, seluruh transmisi data diamankan dengan enkripsi TLS/HTTPS dan disimpan sesuai standar kepatuhan privasi medis internasional (ISO 15189 & HIPAA guidelines). Rekaman video dan citra mikroskopis hanya dapat diakses oleh staf medis laboratorium dan dokter penanggung jawab yang terotentikasi."
    }
  ];

  return (
    <div className="public-portal-scope">
      
      {/* ─── MAIN HERO CONTAINER (Dark Rounded Card with Integrated Header) ─── */}
      <div className="hero-outer-wrapper">
        <section className="home-hero-dark-card" id="hero">
          
          {/* Integrated Navbar inside Hero Card */}
          <header className="hero-internal-nav">
            <div className="hero-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <BrandLogos size={34} />
              <div className="hero-brand-text">
                <span className="brand-name">CASA<span className="brand-dot">·</span>AI</span>
                <span className="brand-badge-tag">PRO CLINICAL</span>
              </div>
            </div>

            <nav className="hero-nav-menu">
              <a href="#hero">Beranda</a>
              <a href="#showcase">Fitur Unggulan</a>
              <a href="#bento-section">Teknologi</a>
              <a href="#who-standard">Standar WHO 6th</a>
              <a href="#faq-section">FAQ</a>
            </nav>

            <div className="hero-nav-action">
              <button 
                onClick={handleGoToDashboard}
                className="hero-login-pill-btn"
                title={getRoleMode() ? 'Buka Dashboard Medis' : "Masuk ke Dashboard Staf Medis"}
              >
                <Lock size={14} />
                <span>{getRoleMode() ? 'Dashboard Medis' : 'Login Staf Medis'}</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </header>

          {/* Hero Main Content (2 Columns on Desktop) */}
          <div className="hero-main-content">
            
            {/* Left Column: Headlines & Call to Action */}
            <div className="hero-left-col">
              <div className="hero-eyebrow-pill">
                <Sparkles size={14} color="#C1D72E" />
                <span>AI-Assisted Semen Analysis System</span>
              </div>

              <h1 className="hero-headline">
                Analisis Kualitas & Motilitas Sperma dengan <span className="highlight-lime">CASA-AI Pro</span>
              </h1>

              <p className="hero-description">
                Platform komputasi andrologi berbasis Deep Learning (YOLOv11 & ByteTrack) untuk deteksi presisi tinggi, estimasi bilik Makler 10µm, serta kuantifikasi kinematika motilitas mikro (PR, NP, IM) sesuai pedoman WHO 6th Edition.
              </p>

              {/* Quick Specs Highlight Bar */}
              <div className="hero-micro-specs">
                <div className="spec-item">
                  <span className="spec-val">WHO 6th</span>
                  <span className="spec-lbl">Batas Rujukan 2021</span>
                </div>
              </div>
            </div>

            {/* Right Column: Feature Cards Grid (No Images) */}
            <div className="hero-right-col">
              <div className="hero-feature-cards-grid">
                
                <div className="hero-feature-card">
                  <div className="hero-fc-icon"><Zap size={22} color="#C1D72E" /></div>
                  <h4>Deteksi Cepat & Akurat</h4>
                  <p>Inferensi &lt; 5 detik dengan YOLOv11 head detection dan tracking trajektori ByteTrack</p>
                </div>

                <div className="hero-feature-card">
                  <div className="hero-fc-icon"><Microscope size={22} color="#00AFA0" /></div>
                  <h4>Bilik Makler 10µm</h4>
                  <p>Estimasi konsentrasi juta/mL terkalibrasi standar bilik hitung laboratorium</p>
                </div>

                <div className="hero-feature-card">
                  <div className="hero-fc-icon"><Award size={22} color="#C1D72E" /></div>
                  <h4>WHO 6th Edition (2021)</h4>
                  <p>Batas persentil ke-5 rujukan evaluasi semen laboratorium andrologi global</p>
                </div>

                <div className="hero-feature-card">
                  <div className="hero-fc-icon"><ShieldCheck size={22} color="#00AFA0" /></div>
                  <h4>ISO 15189 & Enkripsi</h4>
                  <p>Keamanan data medis AES-256 dan kepatuhan standar akreditasi rumah sakit</p>
                </div>

              </div>

              {/* Quick Trust Stats Strip */}
              <div className="hero-trust-stats-strip">
                <div className="trust-stat-item">
                  <div className="trust-stat-icon"><Activity size={18} color="#C1D72E" /></div>
                  <div className="trust-stat-info">
                    <span className="trust-stat-val">9+ Metrik</span>
                    <span className="trust-stat-lbl">Parameter Kinematika CASA</span>
                  </div>
                </div>
                <div className="trust-stat-divider" />
                <div className="trust-stat-item">
                  <div className="trust-stat-icon"><Cpu size={18} color="#00AFA0" /></div>
                  <div className="trust-stat-info">
                    <span className="trust-stat-val">&lt; 5 Detik</span>
                    <span className="trust-stat-lbl">Analisis Per Sampel Video</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

        </section>
      </div>

      {/* ─── 2. TABBED SHOWCASE SECTION (Equivalent to Financial Freedom with Xenon) ─── */}
      <section className="clean-white-section" id="showcase">
        <div className="section-container">
          
          <div className="section-header-center">
            <span className="section-pill-tag">
              <Activity size={14} color="#00AFA0" />
              <span>PRESISI & FLEKSIBILITAS ANALISIS</span>
            </span>
            <h2 className="section-heading-large">
              Presisi Klinis & Fleksibilitas Analisis dengan <span className="text-teal">CASA-AI Pro</span>
            </h2>
            <p className="section-subheading-max">
              Dirancang khusus untuk memenuhi standar ketat laboratorium andrologi modern, klinik fertilitas reproduksi berbantu (IVF), dan rumah sakit rujukan spesialis.
            </p>
          </div>

          {/* Capsule Switcher Tabs */}
          <div className="capsule-tabs-container">
            <button 
              className={`capsule-tab-btn ${activeShowcaseTab === 'motility' ? 'active' : ''}`}
              onClick={() => setActiveShowcaseTab('motility')}
            >
              <TrendingUp size={16} />
              <span>Motilitas WHO (PR / NP / IM)</span>
            </button>

            <button 
              className={`capsule-tab-btn ${activeShowcaseTab === 'makler' ? 'active' : ''}`}
              onClick={() => setActiveShowcaseTab('makler')}
            >
              <Microscope size={16} />
              <span>Kamar Hitung Makler 10µm</span>
            </button>

            <button 
              className={`capsule-tab-btn ${activeShowcaseTab === 'kinematics' ? 'active' : ''}`}
              onClick={() => setActiveShowcaseTab('kinematics')}
            >
              <Compass size={16} />
              <span>Kinematika CASA (VCL / VSL)</span>
            </button>

            <button 
              className={`capsule-tab-btn ${activeShowcaseTab === 'certification' ? 'active' : ''}`}
              onClick={() => setActiveShowcaseTab('certification')}
            >
              <ShieldCheck size={16} />
              <span>Sertifikasi & Validasi Medis</span>
            </button>
          </div>

          {/* Active Tab Content Card */}
          <div className="tab-showcase-card tab-showcase-full">
            <div className="tab-card-full">
              <div className="tab-card-top-row">
                <div className="tab-card-icon-box">
                  {(() => { const Icon = activeTabContent.icon; return <Icon size={28} color="#00AFA0" />; })()}
                </div>
                <span className="card-badge-small">{activeTabContent.tag}</span>
              </div>
              <h3 className="tab-card-title">{activeTabContent.title}</h3>
              <p className="tab-card-desc">{activeTabContent.desc}</p>

              <div className="benefits-checklist benefits-checklist-row">
                {activeTabContent.points.map((pt, idx) => (
                  <div key={idx} className="benefit-item">
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

      {/* ─── 3. BENTO GRID (Empower with Cutting-Edge Features) ─── */}
      <section className="clean-white-section" id="bento-section">
        <div className="section-container">
          
          <div className="section-header-center">
            <span className="section-pill-tag">
              <Zap size={14} color="#00AFA0" />
              <span>KOMPUTASI VISI MODERN</span>
            </span>
            <h2 className="section-heading-large">
              Keunggulan Komparatif <span className="text-teal">Teknologi CASA-AI</span>
            </h2>
            <p className="section-subheading-max">
              Arsitektur deep learning multi-tahap menggabungkan pendeteksi kontur kepala spermatozoa dengan algoritma pelacakan gerak mikro real-time.
            </p>
          </div>

          <div className="bento-grid">
            
            {/* Bento Card 1: Expert Advice and Support (Large Left 2-row card) */}
            <div className="bento-card bento-card-large">
              <div className="bento-card-header">
                <span className="bento-pill">Spesialis Andrologi</span>
                <h3>Validasi Klinis Dokter Spesialis & Konsultasi</h3>
                <p>
                  Hasil komputasi otomatis disinkronkan langsung ke dashboard dokter spesialis untuk verifikasi diagnosis, penambahan catatan resep, dan tanda tangan medis digital.
                </p>
              </div>
              <div className="bento-icon-visual">
                <div className="bento-icon-row">
                  <div className="bento-icon-circle"><Stethoscope size={24} color="#00AFA0" /></div>
                  <div className="bento-icon-circle"><FileCheck size={24} color="#C1D72E" /></div>
                  <div className="bento-icon-circle"><Users size={24} color="#00AFA0" /></div>
                </div>
                <div className="bento-icon-labels">
                  <span>Diagnosis</span>
                  <span>Validasi</span>
                  <span>Pasien</span>
                </div>
              </div>
            </div>

            {/* Bento Card 2: Quick Approval Process / GPU Gauge (Top Right) */}
            <div className="bento-card bento-card-gauge">
              <div className="gauge-header">
                <span className="bento-pill">Akselerasi AI</span>
                <h3>Inferensi Ultracepat 14.2ms GPU</h3>
                <p>Didukung optimasi TensorRT & FP16 untuk pemrosesan 60 FPS tanpa jeda pada workstation medis.</p>
              </div>

              {/* Speedometer Gauge Visual */}
              <div className="speedometer-visual-box">
                <div className="speed-arc-wrap">
                  <div className="speed-arc-bg" />
                  <div className="speed-needle" />
                  <div className="speed-center-point" />
                </div>
                <div className="speed-metrics-row">
                  <span className="metric-tag">0 ms</span>
                  <span className="metric-curr">14.2 ms / frame</span>
                  <span className="metric-tag">60 FPS</span>
                </div>
              </div>
            </div>

            {/* Bento Card 3: Standard Chambers (Bottom Middle) */}
            <div className="bento-card bento-card-chamber">
              <div className="bento-card-header">
                <span className="bento-pill">Preparasi Laboratorik</span>
                <h3>Standarisasi Bilik Makler & Leja</h3>
                <p>Formula kalibrasi volume terintegrasi untuk kedalaman 10µm dan 20µm dengan kompensasi pengenceran.</p>
              </div>
              <div className="bento-icon-visual">
                <div className="bento-icon-row">
                  <div className="bento-icon-circle"><Microscope size={24} color="#00AFA0" /></div>
                  <div className="bento-icon-circle"><Layers size={24} color="#C1D72E" /></div>
                </div>
                <div className="bento-icon-labels">
                  <span>Makler 10µm</span>
                  <span>Leja Chamber</span>
                </div>
              </div>
            </div>

            {/* Bento Card 4: Dark Privacy Card (Bottom Right - Exactly matches reference dark card) */}
            <div className="bento-card bento-card-dark">
              <div className="bento-dark-badge">
                <ShieldCheck size={18} color="#C1D72E" />
                <span>Kepatuhan Medis Global</span>
              </div>
              <h3 className="bento-dark-title">Privasi & Keamanan Data Medis (ISO 15189)</h3>
              <p className="bento-dark-desc">
                Seluruh data video dan rekam medis semen dienkripsi dengan standar AES-256 tingkat perbankan dan rumah sakit. Menjaga kerahasiaan identitas pasien sesuai etika bioetika reproduksi.
              </p>
              <div className="bento-dark-footer">
                <span className="compliance-tag">ISO 15189 Certified</span>
                <span className="compliance-tag">HIPAA Compliant</span>
                <span className="compliance-tag">TLS 1.3 Encryption</span>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* ─── 5. WHO 6TH EDITION (2021) REFERENCE TABLE & SAMPLE PREP ─── */}
      <section className="clean-white-section" id="who-standard">
        <div className="section-container">
          
          <div className="section-header-center">
            <span className="section-pill-tag">
              <FileSpreadsheet size={14} color="#00AFA0" />
              <span>PEDOMAN LABORATORIK WHO</span>
            </span>
            <h2 className="section-heading-large">
              Standar Nilai Rujukan Semen <span className="text-teal">WHO 6th Edition (2021)</span>
            </h2>
            <p className="section-subheading-max">
              Komparasi batas persentil ke-5 (*5th percentile lower reference limits*) antara panduan WHO 2010 dan edisi termutakhir WHO 2021.
            </p>
          </div>

          {/* Clean Medical Table */}
          <div className="who-table-card">
            <div className="table-responsive">
              <table className="medical-reference-table">
                <thead>
                  <tr>
                    <th>Parameter Analisis</th>
                    <th>Satuan Pengukuran</th>
                    <th>WHO 5th (2010)</th>
                    <th className="highlight-col">WHO 6th (2021)</th>
                    <th>Kategori Klinis Jika Rendah</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="param-name">Volume Ejakulat</td>
                    <td>Mililiter (mL)</td>
                    <td>≥ 1.5 mL</td>
                    <td className="highlight-cell">≥ 1.4 mL</td>
                    <td><span className="diagnosis-pill">Hypospermia</span></td>
                  </tr>
                  <tr>
                    <td className="param-name">Konsentrasi Sperma</td>
                    <td>Juta / mL (× 10⁶)</td>
                    <td>≥ 15 × 10⁶</td>
                    <td className="highlight-cell">≥ 16 × 10⁶</td>
                    <td><span className="diagnosis-pill">Oligozoospermia</span></td>
                  </tr>
                  <tr>
                    <td className="param-name">Total Hitung Sperma</td>
                    <td>Juta per ejakulat</td>
                    <td>≥ 39 × 10⁶</td>
                    <td className="highlight-cell">≥ 39 × 10⁶</td>
                    <td><span className="diagnosis-pill">Oligozoospermia Absolut</span></td>
                  </tr>
                  <tr>
                    <td className="param-name">Motilitas Total (PR + NP)</td>
                    <td>Persentase (%)</td>
                    <td>≥ 40 %</td>
                    <td className="highlight-cell">≥ 42 %</td>
                    <td><span className="diagnosis-pill">Asthenozoospermia</span></td>
                  </tr>
                  <tr>
                    <td className="param-name">Motilitas Progresif (PR)</td>
                    <td>Persentase (%)</td>
                    <td>≥ 32 %</td>
                    <td className="highlight-cell">≥ 30 %</td>
                    <td><span className="diagnosis-pill">Asthenozoospermia Progresif</span></td>
                  </tr>
                  <tr>
                    <td className="param-name">Morfologi Normal (Tygerberg)</td>
                    <td>Persentase (%)</td>
                    <td>≥ 4 %</td>
                    <td className="highlight-cell">≥ 4 %</td>
                    <td><span className="diagnosis-pill">Teratozoospermia</span></td>
                  </tr>
                  <tr>
                    <td className="param-name">Vitalitas (Membran Utuh)</td>
                    <td>Persentase (%)</td>
                    <td>≥ 58 %</td>
                    <td className="highlight-cell">≥ 54 %</td>
                    <td><span className="diagnosis-pill">Necrozoospermia</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 4-Step Sample Preparation Protocol */}
          <div className="protocol-container">
            <h3 className="protocol-title">Protokol Preparasi Sampel Pra-Analisis CASA</h3>
            <div className="protocol-grid">
              
              <div className="protocol-card">
                <div className="protocol-badge">01</div>
                <Clock size={20} color="#00AFA0" />
                <h4>Waktu Abstinensia</h4>
                <p>Pasien diinstruksikan berpuasa ejakulasi selama 2 hingga 7 hari sebelum pengambilan sampel untuk stabilitas volume & konsentrasi.</p>
              </div>

              <div className="protocol-card">
                <div className="protocol-badge">02</div>
                <Flame size={20} color="#00AFA0" />
                <h4>Inkubasi Likuefaksi</h4>
                <p>Sampel diinkubasi pada suhu 37°C selama 30–60 menit hingga mencair sempurna dan viskositas homogen.</p>
              </div>

              <div className="protocol-card">
                <div className="protocol-badge">03</div>
                <Microscope size={20} color="#00AFA0" />
                <h4>Pemuatan Bilik Makler</h4>
                <p>Teteskan 10 µL spesimen ke bilik Makler 10µm tanpa gelembung udara untuk pembentukan lapisan sel monolayer.</p>
              </div>

              <div className="protocol-card">
                <div className="protocol-badge">04</div>
                <Cpu size={20} color="#00AFA0" />
                <h4>Akuisisi & Analisis AI</h4>
                <p>Perekaman bidang pandang mikroskop fase kontras pada 30–60 FPS dan inferensi otomatis dalam hitungan detik.</p>
              </div>

            </div>
          </div>

        </div>
      </section>

      {/* ─── 8. INTERACTIVE FAQ ACCORDION ─── */}
      <section className="clean-white-section" id="faq-section">
        <div className="section-container" style={{ maxWidth: '860px' }}>
          
          <div className="section-header-center">
            <span className="section-pill-tag">
              <HelpCircle size={14} color="#00AFA0" />
              <span>PERTANYAAN UMUM</span>
            </span>
            <h2 className="section-heading-large">
              Frequently Asked Questions (FAQ)
            </h2>
            <p className="section-subheading-max">
              Informasi lengkap seputar metodologi analisis semen berbasis AI, pedoman WHO 6th, dan prosedur teknis laboratorium.
            </p>
          </div>

          <div className="faq-accordion-list">
            {faqs.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={idx} className={`faq-item-card ${isOpen ? 'open' : ''}`}>
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



      {/* ─── 10. MODERN CLINIC FOOTER ─── */}
      <footer className="portal-modern-footer">
        <div className="footer-inner-content">
          <div className="footer-columns-grid">
            
            {/* Col 1: Brand & Desc */}
            <div className="footer-brand-col">
              <div className="footer-brand-row" style={{ marginBottom: '14px' }}>
                <div className="hero-brand-icon">
                  <Microscope size={20} color="#061019" />
                </div>
                <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#0f172a' }}>CASA<span style={{ color: '#00AFA0' }}>·</span>AI</span>
              </div>
              <p className="footer-desc-text">
                Platform Computer-Assisted Semen Analysis generasi baru berbasis Deep Learning untuk standarisasi evaluasi kualitas semen sesuai panduan World Health Organization (WHO) 6th Edition.
              </p>
              <div className="footer-contact-hints">
                <span>📍 Laboratorium Rekayasa Biomedika & Andrologi</span>
                <span>📧 support@casa-ai.clinical.id</span>
              </div>
            </div>

            {/* Col 2: Navigation */}
            <div className="footer-links-col">
              <h4>Navigasi</h4>
              <ul>
                <li><a href="#hero">Beranda Utama</a></li>
                <li><a href="#showcase">Fitur Analisis</a></li>
                <li><a href="#who-standard">Standar Rujukan WHO 6th</a></li>
                <li><a href="#faq-section">FAQ</a></li>
              </ul>
            </div>

            {/* Col 3: Portal Roles */}
            <div className="footer-links-col">
              <h4>Akses Khusus Staf</h4>
              <ul>
                <li><a href="/login" onClick={(e) => { e.preventDefault(); handleGoToDashboard(); }}>Portal Dokter Spesialis (Sp.And)</a></li>
                <li><a href="/login" onClick={(e) => { e.preventDefault(); handleGoToDashboard(); }}>Portal Analis Lab Mikroskop</a></li>
                <li><a href="/login" onClick={(e) => { e.preventDefault(); handleGoToDashboard(); }}>Konsol Superadmin Medis</a></li>
                <li><a href={`${API_BASE_URL}/docs`} target="_blank" rel="noreferrer">FastAPI Docs (Swagger)</a></li>
              </ul>
            </div>

            {/* Col 4: Medical Disclaimer */}
            <div className="footer-links-col">
              <h4>Pemberitahuan Medis</h4>
              <p className="footer-disclaimer-note">
                Sistem CASA-AI merupakan instrumen alat bantu komputasi diagnostik laboratorium. Keputusan diagnosis fertilitas, interpretasi patologis, dan rencana terapi klinis wajib ditetapkan oleh dokter spesialis andrologi atau patologi klinik berlisensi.
              </p>
            </div>

          </div>

          {/* Bottom Bar */}
          <div className="footer-bottom-flex">
            <div className="footer-copyright">
              © 2026 CASA-AI Pro Clinical Platform. Hak Cipta Dilindungi Undang-Undang.
            </div>
            <div className="footer-compliance-badges">
              <span>WHO 6th Edition (2021)</span>
              <span>ISO 15189 Compliant</span>
              <span>AES-256 Encrypted</span>
            </div>
          </div>
        </div>
      </footer>

      {/* ─── CALIBRATION MODAL ─── */}

    </div>
  );
}
