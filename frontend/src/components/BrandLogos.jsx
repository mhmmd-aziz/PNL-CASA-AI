import pnlLogo from '../assets/logo-pnl.png';
import infestLogo from '../assets/logo-infest.png';
import casaLogo from '../assets/logo-casaai.png';

// Deretan logo navbar: PNL, INFEST, lalu CASA-AI
const LOGOS = [
  { src: pnlLogo, alt: 'Politeknik Negeri Lhokseumawe' },
  { src: infestLogo, alt: 'INFEST' },
  { src: casaLogo, alt: 'CASA-AI' },
];

export default function BrandLogos({ size = 36 }) {
  return (
    <div className="brand-logos" style={{ '--brand-logo-size': `${size}px` }}>
      {LOGOS.map((logo) => (
        <img key={logo.alt} src={logo.src} alt={logo.alt} title={logo.alt} className="brand-logos-img" />
      ))}
    </div>
  );
}
