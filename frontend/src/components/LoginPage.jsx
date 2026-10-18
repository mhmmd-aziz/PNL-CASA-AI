import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Sparkles, Info, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { loginWithServer } from '../auth';
import '../login.css';
import BrandLogos from './BrandLogos';

export default function LoginPage() {
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginError('');
    if (!credentials.email.trim() || !credentials.password) {
      setLoginError('Harap masukkan email dan kata sandi.');
      return;
    }
    setLoggingIn(true);
    const result = await loginWithServer(credentials.email, credentials.password);
    setLoggingIn(false);
    if (result.success) {
      navigate('/dashboard');
    } else {
      setLoginError(result.error);
    }
  };

  return (
    <div className="login-page-root">
      <div className="auth-shell">
        <Link to="/" className="auth-back-home">
          <ArrowLeft size={16} />
          <span>Kembali ke Beranda</span>
        </Link>

        {/* Panel kiri: form masuk untuk pasien dan staf */}
        <section className="auth-pane auth-pane-login">
          <div className="login-header">
            <div className="login-badge">
              <Sparkles size={14} />
              <span>Portal Masuk CASA-AI</span>
            </div>
            <h2 className="login-title">Masuk ke Akun Anda</h2>
            <p className="login-subtitle">
              Staf laboratorium dan pasien masuk dengan akun yang dibuat oleh Front Office.
            </p>
          </div>

          <form onSubmit={handleLogin} className="auth-login-form">
            <div className="login-form-group">
              <label htmlFor="login-email">Email</label>
              <div className="login-input-wrap">
                <Mail size={18} className="login-input-icon" />
                <input
                  id="login-email"
                  type="email"
                  className="login-input"
                  placeholder="nama@lab.id"
                  autoComplete="username"
                  value={credentials.email}
                  onChange={(e) => setCredentials((prev) => ({ ...prev, email: e.target.value }))}
                />
              </div>
            </div>

            <div className="login-form-group">
              <label htmlFor="login-password">Kata Sandi</label>
              <div className="login-input-wrap">
                <Lock size={18} className="login-input-icon" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="login-input"
                  placeholder="Masukkan kata sandi"
                  autoComplete="current-password"
                  value={credentials.password}
                  onChange={(e) => setCredentials((prev) => ({ ...prev, password: e.target.value }))}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword((prev) => !prev)}
                  title={showPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {loginError && (
              <div className="login-error-alert" role="alert">
                <AlertCircle size={16} flexShrink={0} />
                <span>{loginError}</span>
              </div>
            )}

            <button type="submit" className="btn-login-submit" disabled={loggingIn}>
              <span>{loggingIn ? 'Memverifikasi...' : 'Masuk'}</span>
              <ArrowRight size={16} />
            </button>
          </form>
        </section>

        {/* Panel kanan: informasi saja, tanpa aksi */}
        <aside className="auth-overlay">
          <div className="auth-overlay-inner">
            <BrandLogos size={48} />
            <h3>Belum punya akun?</h3>
            <p>
              Akun pasien dibuatkan oleh petugas Front Office saat pemeriksaan didaftarkan.
              Hubungi petugas di klinik atau laboratorium Anda.
            </p>
            <div className="auth-info-alert" role="status" style={{ marginTop: '18px', maxWidth: '320px' }}>
              <Info size={16} flexShrink={0} />
              <span>Laporan hanya bisa dilihat setelah dokter merilisnya.</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
