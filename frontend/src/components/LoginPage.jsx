import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Microscope, 
  Lock, 
  User, 
  ArrowRight, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  ShieldCheck, 
  ArrowLeft,
  Sparkles
} from 'lucide-react';
import { login, loginAsRole, getAccounts } from '../auth';
import '../login.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!identifier.trim() || !password.trim()) {
      setErrorMsg('Harap masukkan username/email dan password.');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      const result = login(identifier, password);
      setIsLoading(false);
      if (result.success) {
        navigate('/dashboard');
      } else {
        setErrorMsg(result.error);
      }
    }, 300);
  };

  const handleQuickLogin = (roleId) => {
    setErrorMsg('');
    const res = loginAsRole(roleId);
    if (res.success) {
      navigate('/dashboard');
    }
  };

  const accounts = getAccounts();

  return (
    <div className="login-page-root">
      {/* Top Navbar */}
      <header className="login-top-bar">
        <Link to="/" className="login-brand-link">
          <div className="login-brand-icon">
            <Microscope size={22} />
          </div>
          <div className="login-brand-titles">
            <h1>CASA<span>-AI</span></h1>
            <p>Sperm Analysis Platform</p>
          </div>
        </Link>

        <Link to="/" className="login-back-home">
          <ArrowLeft size={16} />
          <span>Kembali ke Beranda Utama</span>
        </Link>
      </header>

      {/* Main Form Center */}
      <main className="login-main-container">
        <div className="login-card">
          <div className="login-header">
            <div className="login-badge">
              <Sparkles size={14} />
              <span>Portal Masuk Tenaga Medis</span>
            </div>
            <h2 className="login-title">Autentikasi Akun</h2>
            <p className="login-subtitle">
              Masuk untuk mengakses instrumen analisis spermatozoa, rekam medis pasien, dan validasi standar WHO 6th.
            </p>
          </div>

          {errorMsg && (
            <div className="login-error-alert">
              <AlertCircle size={16} flexShrink={0} />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="login-form-group">
              <label htmlFor="identifier">Username atau Email Lab</label>
              <div className="login-input-wrap">
                <User size={18} className="login-input-icon" />
                <input
                  id="identifier"
                  type="text"
                  className="login-input"
                  placeholder="Contoh: dokter atau admin@casa.lab"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="login-form-group">
              <label htmlFor="password">Kata Sandi</label>
              <div className="login-input-wrap">
                <Lock size={18} className="login-input-icon" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="login-input"
                  placeholder="Masukkan password Anda"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" className="btn-login-submit" disabled={isLoading}>
              <span>{isLoading ? 'Memverifikasi...' : 'Masuk ke Dashboard'}</span>
              <ArrowRight size={16} />
            </button>
          </form>

          {/* Quick Demo Access Header */}
          <div className="login-divider-wrap">
            <span>Atau Akses Cepat Akun Demo (1-Klik)</span>
          </div>

          {/* 3 Role Quick Login Cards */}
          <div className="demo-accounts-grid">
            {accounts.map((acc) => (
              <div 
                key={acc.id} 
                className="demo-account-tile"
                onClick={() => handleQuickLogin(acc.id)}
                title={`Login cepat sebagai ${acc.name}`}
              >
                <div className="demo-tile-left">
                  <img src={acc.avatar} alt={acc.name} className="demo-avatar" />
                  <div className="demo-info-text">
                    <span 
                      className="demo-role-badge" 
                      style={{ background: acc.badgeColor, color: acc.badgeTextColor }}
                    >
                      {acc.badge}
                    </span>
                    <div className="demo-name">{acc.user}</div>
                    <div className="demo-cred">
                      User: <strong>{acc.username}</strong> • Pass: <strong>{acc.password}</strong>
                    </div>
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
            <span>Sistem terlindungi enkripsi otorisasi berbasis peran (RBAC).</span>
          </div>
        </div>
      </main>
    </div>
  );
}
