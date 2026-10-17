import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import PublicPortal from './components/PublicPortal';
import AdminDashboard from './components/AdminDashboard';
import LoginPage from './components/LoginPage';
import PageLoader from './components/PageLoader';

export default function App() {
  return (
    <BrowserRouter>
      <PageLoader />
      <Routes>
        {/* Halaman Beranda Utama / Public Portal */}
        <Route path="/" element={<PublicPortal />} />
        
        {/* Halaman Login Autentikasi Staf Medis & Lab */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/masuk" element={<Navigate to="/login" replace />} />
        
        {/* Halaman Dashboard Medis / Admin */}
        <Route path="/dashboard" element={<AdminDashboard />} />
        
        {/* Antisipasi typo yang disebutkan user (/dasboard) & alias (/admin) */}
        <Route path="/dasboard" element={<Navigate to="/dashboard" replace />} />
        <Route path="/admin" element={<Navigate to="/dashboard" replace />} />
        
        {/* Fallback ke beranda jika rute tidak ditemukan */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}


