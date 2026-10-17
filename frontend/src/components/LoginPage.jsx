import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  AlertCircle,
  ShieldCheck,
  ArrowLeft,
  Sparkles,
  UserPlus,
  Info
} from 'lucide-react';
import { setRoleMode, getAccounts } from '../auth';
import '../login.css';
import BrandLogos from './BrandLogos';
import FlyingButton from './FlyingButton';

// Jeda sebelum panel bergeser, agar tombol sempat lepas landas dulu
const SWITCH_DELAY_MS = 650;

const EMPTY_REGISTRATION = { fullName: '', birthDate: '', phone: '', email: '', password: '' };

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [switching, setSwitching] = useState(false);
  const [registration, setRegistration] = useState(EMPTY_REGISTRATION);
  const [registerNotice, setRegisterNotice] = useState('');
  const switchTimer = useRef(null);

  useEffect(() => () => clearTimeout(switchTimer.current), []);

  const handleSelectRole = (roleId) => {
    if (setRoleMode(roleId)) {
      navigate('/dashboard');
    }
  };

  // Tombol terbang (trigger klik) lalu panel bergeser ke sisi lain beserta warnanya
  const handleSwitchMode = () => {
    if (switching) return;
    setSwitching(true);
    switchTimer.current = setTimeout(() => {
      setMode((prev) => (prev === 'login' ? 'register' : 'login'));
      setRegisterNotice('');
      setSwitching(false);
    }, SWITCH_DELAY_MS);
  };

  const updateRegistration = (field) => (event) => {
    setRegistration((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleRegister = (event) => {
    event.preventDefault();
    setRegisterNotice('Registrasi pasien belum tersedia: akun pasien memerlukan layanan autentikasi dan database di server. Data Anda tidak disimpan.');
  };

  const accounts = getAccounts();
  const isRegister = mode === 'register';

  return (
    <div className="login-page-root">
      {/* Main Form Center */}
      <main className="login-main-container">
        <div className={`auth-shell ${isRegister ? 'is-register' : ''}`}>
          {/* Tetap di kiri atas, tidak ikut bergeser bersama panel */}
          <Link to="/" className="auth-back-home">
            <ArrowLeft size={16} />
            <span>Kembali ke Beranda</span>
          </Link>

          {/* Panel kiri: Login (pilih peran) */}
          <section className="auth-pane auth-pane-login" aria-hidden={isRegister} inert={isRegister}>
            <div className="login-header">
              <div className="login-badge">
                <Sparkles size={14} />
                <span>Portal Masuk Tenaga Medis</span>
              </div>
              <h2 className="login-title">Autentikasi Akun</h2>
              <p className="login-subtitle">
                Pilih peran untuk mengakses instrumen analisis spermatozoa dan acuan standar WHO 6th.
              </p>
            </div>

            <div className="login-error-alert">
              <AlertCircle size={16} flexShrink={0} />
              <span>Autentikasi akun belum tersedia. Pilih mode peran untuk membuka dashboard sesuai wewenangnya.</span>
            </div>

            <div className="login-divider-wrap">
              <span>Pilih Mode Peran</span>
            </div>

            <div className="demo-accounts-grid">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="demo-account-tile"
                  onClick={() => handleSelectRole(acc.id)}
                  title={`Buka dashboard sebagai ${acc.name}`}
                >
                  <div className="demo-tile-left">
                    <div className="demo-info-text">
                      <span
                        className="demo-role-badge"
                        style={{ background: acc.badgeColor, color: acc.badgeTextColor }}
                      >
                        {acc.badge}
                      </span>
                      <div className="demo-name">{acc.name}</div>
                      <div className="demo-cred">{acc.scope}</div>
                    </div>
                  </div>
                  <button type="button" className="demo-btn-action">
                    Masuk →
                  </button>
                </div>
              ))}
            </div>

            <div className="login-security-notice">
              <ShieldCheck size={14} color="#00AFA0" />
              <span>Mode peran hanya membatasi menu yang tampil; belum ada verifikasi identitas.</span>
            </div>
          </section>

          {/* Panel kanan: Registrasi Pasien */}
          <section className="auth-pane auth-pane-register" aria-hidden={!isRegister} inert={!isRegister}>
            <div className="login-header">
              <div className="login-badge login-badge-lime">
                <UserPlus size={14} />
                <span>Registrasi Pasien</span>
              </div>
              <h2 className="login-title">Buat Akun Pasien</h2>
              <p className="login-subtitle">
                Akun pasien dipakai untuk melihat dan mengunduh laporan milik sendiri yang telah dirilis dokter.
              </p>
            </div>

            <form onSubmit={handleRegister}>
              <div className="login-form-group">
                <label htmlFor="reg-name">Nama Lengkap</label>
                <input id="reg-name" className="login-input auth-input" required autoComplete="name" value={registration.fullName} onChange={updateRegistration('fullName')} />
              </div>
              <div className="auth-form-row">
                <div className="login-form-group">
                  <label htmlFor="reg-birth">Tanggal Lahir</label>
                  <input id="reg-birth" type="date" className="login-input auth-input" required value={registration.birthDate} onChange={updateRegistration('birthDate')} />
                </div>
                <div className="login-form-group">
                  <label htmlFor="reg-phone">No. HP</label>
                  <input id="reg-phone" type="tel" className="login-input auth-input" required autoComplete="tel" value={registration.phone} onChange={updateRegistration('phone')} />
                </div>
              </div>
              <div className="login-form-group">
                <label htmlFor="reg-email">Email</label>
                <input id="reg-email" type="email" className="login-input auth-input" required autoComplete="email" value={registration.email} onChange={updateRegistration('email')} />
              </div>
              <div className="login-form-group">
                <label htmlFor="reg-password">Kata Sandi</label>
                <input id="reg-password" type="password" className="login-input auth-input" required minLength={8} autoComplete="new-password" value={registration.password} onChange={updateRegistration('password')} />
              </div>

              {registerNotice && (
                <div className="auth-info-alert" role="status">
                  <Info size={16} flexShrink={0} />
                  <span>{registerNotice}</span>
                </div>
              )}

              <button type="submit" className="btn-login-submit">
                <UserPlus size={16} />
                <span>Daftar sebagai Pasien</span>
              </button>
            </form>
          </section>

          {/* Panel warna yang bergeser menutupi salah satu sisi, berisi tombol terbang */}
          <aside className="auth-overlay">
            <div className="auth-overlay-inner">
              <BrandLogos size={48} />
              <h3>{isRegister ? 'Sudah punya akun?' : 'Pasien baru?'}</h3>
              <p>
                {isRegister
                  ? 'Kembali ke halaman masuk untuk tenaga medis dan staf laboratorium.'
                  : 'Daftarkan diri Anda untuk mengakses laporan hasil pemeriksaan yang telah dirilis.'}
              </p>
              <div className="auth-fly-zone">
                <FlyingButton
                  theme="dark"
                  size="large"
                  trigger="click"
                  carryCursor={false}
                  altitude={150}
                  hoverTime={0.6}
                  wobble={0.6}
                  buttonColor="#FFFFFF"
                  textColor={isRegister ? '#4D5A0F' : '#00776D'}
                  thrustColor={isRegister ? '#00AFA0' : '#C1D72E'}
                  onClick={handleSwitchMode}
                >
                  {isRegister ? 'Masuk' : 'Registrasi'}
                </FlyingButton>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
