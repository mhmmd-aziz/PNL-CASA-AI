import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, X } from 'lucide-react';

const FOCUSABLE = 'a[href], button:not([disabled])';

// Tombol titik tiga + sidebar berisi tautan menu. Hanya tampil di layar kecil (diatur CSS).
export default function MobileNavMenu({ links }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      // Fokus tetap di dalam sidebar selama terbuka
      const items = [...panelRef.current.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open]);

  const goTo = (event, href) => {
    event.preventDefault();
    setOpen(false);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // Tunggu sidebar tertutup dan gulir halaman aktif kembali sebelum menggulir ke bagian tujuan
    window.setTimeout(() => {
      document.querySelector(href)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }, 60);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="pp-menu-btn"
        aria-label="Buka menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <MoreVertical size={18} />
      </button>
      {open && createPortal(
        <div className="pp-drawer-overlay" onClick={() => setOpen(false)}>
          <aside
            ref={panelRef}
            className="pp-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menu navigasi"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pp-drawer-head">
              <span>Menu</span>
              <button ref={closeRef} type="button" className="pp-drawer-close" aria-label="Tutup menu" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <nav className="pp-drawer-links">
              {links.map((link) => (
                <a key={link.href} href={link.href} onClick={(event) => goTo(event, link.href)}>{link.label}</a>
              ))}
            </nav>
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}
