import { useEffect, useState } from 'react';
import { Lock, ArrowRight } from 'lucide-react';
import BrandLogos from './BrandLogos';
import MobileNavMenu from './MobileNavMenu';
import { NAV_LINKS } from '../landingNav.js';

// Di atas batas ini navbar hero yang tampil; navbar melayang hanya muncul setelahnya
const SHOW_AFTER = 80;
const MIN_DELTA = 6;

// Navbar melayang: muncul saat gulir ke atas, hilang saat gulir ke bawah
export default function FloatingNav({ loggedIn, onLogin }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;

    const update = () => {
      ticking = false;
      const y = window.scrollY;
      const delta = y - lastY;
      if (Math.abs(delta) < MIN_DELTA) return;
      lastY = y;
      if (y < SHOW_AFTER || delta > 0) {
        setVisible(false);
        return;
      }
      // Saat panggung 3D menempel di layar, navbar tidak boleh menutupi model
      const stage = document.querySelector('.c3d-scroller');
      if (stage) {
        const rect = stage.getBoundingClientRect();
        if (rect.top <= 0 && rect.bottom >= window.innerHeight) {
          setVisible(false);
          return;
        }
      }
      setVisible(true);
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`pp-float-nav${visible ? ' visible' : ''}`} aria-hidden={!visible}>
      <div className="pp-float-inner">
        <div className="hero-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <BrandLogos size={30} />
          <div className="hero-brand-text">
            <span className="brand-name">CASA<span className="brand-dot">·</span>AI</span>
          </div>
        </div>

        <nav className="hero-nav-menu">
          {NAV_LINKS.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
        </nav>

        <div className="hero-nav-action">
          <button type="button" onClick={onLogin} className="hero-login-pill-btn">
            <Lock size={14} />
            <span>{loggedIn ? 'Dashboard' : 'Masuk'}</span>
            <ArrowRight size={14} />
          </button>
          <MobileNavMenu links={NAV_LINKS} />
        </div>
      </div>
    </header>
  );
}
