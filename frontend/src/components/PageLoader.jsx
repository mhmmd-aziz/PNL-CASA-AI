import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Lama minimal loading tampil agar animasi logo sempat terlihat
const MIN_VISIBLE_MS = 700;

// Mengendalikan overlay #app-loader di index.html: tampil saat refresh
// (sudah terlihat sejak HTML dimuat) dan setiap kali pindah halaman.
export default function PageLoader() {
  const { pathname } = useLocation();

  useEffect(() => {
    const loader = document.getElementById('app-loader');
    if (!loader) return undefined;
    loader.classList.add('is-visible');
    const timer = setTimeout(() => loader.classList.remove('is-visible'), MIN_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [pathname]);

  return null;
}
