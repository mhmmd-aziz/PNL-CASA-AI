import { useNavigate, Link } from 'react-router-dom';
import { 
  Microscope, 
  AlertCircle, 
  ShieldCheck, 
  ArrowLeft,
  Sparkles
} from 'lucide-react';
import { setRoleMode, getAccounts } from '../auth';
import '../login.css';

export default function LoginPage() {
  const navigate = useNavigate();

  const handleSelectRole = (roleId) => {
    if (setRoleMode(roleId)) {
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
        </div>
      </main>
    </div>
  );
}
