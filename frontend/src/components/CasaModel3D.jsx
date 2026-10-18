import { useEffect, useRef, useState } from 'react';
import { PARTS } from '../casaModel/parts';
import '../casa-model-3d.css';

const PART_BY_ID = Object.fromEntries(PARTS.map((part) => [part.id, part]));

const isWideScreen = () => typeof window === 'undefined' || window.innerWidth > 880;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

// Model 3D interaktif. Panel penjelasan selalu tampil sebagai HTML; modul Three.js yang berat
// baru dimuat saat bagian ini hampir terlihat, dan animasinya dijeda saat berada di luar layar.
export default function CasaModel3D() {
  const scrollerRef = useRef(null);
  const viewerRef = useRef(null);
  const canvasRef = useRef(null);
  const barRef = useRef(null);
  const hotspotRefs = useRef({});
  const controllerRef = useRef(null);
  const progressRef = useRef(0);

  const [selectedId, setSelectedId] = useState('deteksi');
  // Di layar kecil label teks terlalu lebar, jadi bawaannya mati (titik tetap bisa diketuk)
  const [labelsOn, setLabelsOn] = useState(isWideScreen);
  const [animOn, setAnimOn] = useState(() => !prefersReducedMotion());
  const [opened, setOpened] = useState(false);
  const [status, setStatus] = useState('loading');

  const selectedRef = useRef(selectedId);
  const animRef = useRef(animOn);

  useEffect(() => {
    selectedRef.current = selectedId;
    controllerRef.current?.select(selectedId);
  }, [selectedId]);

  useEffect(() => {
    animRef.current = animOn;
    controllerRef.current?.setAnimation(animOn);
  }, [animOn]);

  // Memuat dan memasang scene saat bagian ini mendekati layar
  useEffect(() => {
    const scroller = scrollerRef.current;
    let disposed = false;
    let started = false;
    let visibility = null;

    const start = async () => {
      if (started) return;
      started = true;
      try {
        const { createCasaScene } = await import('../casaModel/scene');
        if (disposed) return;
        const controller = createCasaScene({
          canvas: canvasRef.current,
          viewer: viewerRef.current,
          hotspots: hotspotRefs.current,
          onPick: setSelectedId,
          animate: animRef.current,
        });
        controllerRef.current = controller;
        controller.select(selectedRef.current);
        controller.setProgress(progressRef.current);
        visibility = new IntersectionObserver(([entry]) => controller.setActive(entry.isIntersecting), { rootMargin: '120px 0px' });
        visibility.observe(scroller);
        setStatus('ready');
      } catch {
        if (!disposed) setStatus('unsupported');
      }
    };

    const near = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        near.disconnect();
        start();
      }
    }, { rootMargin: '900px 0px' });
    near.observe(scroller);

    return () => {
      disposed = true;
      near.disconnect();
      visibility?.disconnect();
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, []);

  // Progres gulir: 0 saat bagian ini baru mulai menempel, 1 saat hampir lepas
  useEffect(() => {
    const update = () => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const rect = scroller.getBoundingClientRect();
      const total = Math.max(1, rect.height - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -rect.top / total));
      progressRef.current = progress;
      if (barRef.current) barRef.current.style.width = `${progress * 100}%`;
      controllerRef.current?.setProgress(progress);
      setOpened(progress > 0.5);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const scrollToStage = (open) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const top = scroller.getBoundingClientRect().top + window.scrollY;
    const total = Math.max(1, scroller.offsetHeight - window.innerHeight);
    window.scrollTo({ top: open ? top + total : top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  const resetView = () => {
    controllerRef.current?.resetView();
    setSelectedId('deteksi');
    scrollToStage(false);
  };

  const part = PART_BY_ID[selectedId];

  return (
    <section className="c3d" id="model-3d" aria-label="Model 3D sistem CASA-AI">
      <div className="c3d-scroller" ref={scrollerRef}>
        <div className="c3d-stage">
          <div className="c3d-viewer" ref={viewerRef}>
            <canvas className="c3d-gl" ref={canvasRef} aria-label="Model 3D sistem CASA-AI" />
            <div className={`c3d-labels${labelsOn ? '' : ' c3d-nolabel'}`}>
              {PARTS.map((item) => (
                <div
                  key={item.id}
                  ref={(el) => { if (el) hotspotRefs.current[item.id] = el; }}
                  className={`c3d-hs${item.side === 'left' ? ' left' : ''}${selectedId === item.id ? ' on' : ''}`}
                  style={{ '--c': item.c }}
                >
                  <button type="button" className="c3d-dot" aria-label={item.name} onClick={() => setSelectedId(item.id)} />
                  <button type="button" className="c3d-tag" tabIndex={-1} onClick={() => setSelectedId(item.id)}>{item.short}</button>
                </div>
              ))}
            </div>
            {status === 'loading' && <div className="c3d-status">Memuat model 3D...</div>}
            {status === 'unsupported' && (
              <div className="c3d-status">Browser ini tidak mendukung WebGL, jadi model 3D tidak dapat ditampilkan. Penjelasan setiap bagian tetap tersedia di panel.</div>
            )}
            <div className="c3d-head">
              <h2>CASA-AI dalam 3D</h2>
              <p className="c3d-long">YOLO11n mendeteksi sperma, ByteTrack melacak lintasannya, dan rumus kinematika menghitung motilitas serta konsentrasi. Ketuk titik berwarna untuk melihat tiap bagian.</p>
              <p className="c3d-note">Model dan angka di sini adalah simulasi ilustrasi, bukan data pasien.</p>
              <div className="c3d-hint">
                <span>Gulir ke bawah untuk membuka alur analisis</span>
                <span className="c3d-bar"><i ref={barRef} /></span>
              </div>
            </div>
            <div className="c3d-controls">
              <button type="button" className={labelsOn ? 'on' : ''} aria-pressed={labelsOn} onClick={() => setLabelsOn((value) => !value)}>Label</button>
              <button type="button" className={animOn ? 'on' : ''} aria-pressed={animOn} onClick={() => setAnimOn((value) => !value)}>Animasi</button>
              <button type="button" className={opened ? 'on' : ''} onClick={() => scrollToStage(!opened)}>{opened ? 'Tutup alur analisis' : 'Buka alur analisis'}</button>
              <button type="button" onClick={resetView}>Tampilan awal</button>
            </div>
          </div>

          <aside className="c3d-panel" style={{ '--c': part.c }} aria-live="polite">
            <div className="c3d-pbody">
              <div className="c3d-orb" />
              <span className="c3d-cat">{part.cat}</span>
              <h3>{part.name}</h3>
              <p className="c3d-sub">{part.sub}</p>
              <dl className="c3d-rows">
                <dt>Fungsi</dt><dd>{part.f}</dd>
                <dt>Spesifikasi</dt><dd>{part.s}</dd>
                <dt>Posisi</dt><dd>{part.l}</dd>
                <dt>Penting</dt><dd>{part.p}</dd>
              </dl>
              <p className="c3d-desc">{part.d}</p>
            </div>
            <div className="c3d-chips">
              {PARTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={selectedId === item.id ? 'on' : ''}
                  style={{ '--c': item.c }}
                  aria-pressed={selectedId === item.id}
                  onClick={() => setSelectedId(item.id)}
                >
                  <i /><span>{item.short}</span>
                </button>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
