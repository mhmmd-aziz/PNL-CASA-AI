import { Navigate } from 'react-router-dom';
import { getRoleMode } from '../auth';

/**
 * Komponen ProtectedRoute untuk melindungi rute yang memerlukan autentikasi.
 * Jika user belum login (tidak ada role mode), akan diredirect ke /login.
 */
export default function ProtectedRoute({ element }) {
  const roleMode = getRoleMode();
  
  // Jika tidak ada role mode berarti user belum login
  if (!roleMode) {
    return <Navigate to="/login" replace />;
  }

  return element;
}
