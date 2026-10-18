import { useEffect, useReducer, useRef, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../api';
import { getAuthHeader } from '../auth';
import { getErrorMessage } from '../calibration';
import { EMPTY_HISTORY, annotationHistory, boundedPoint, drawnBox, movedBox, resizedBox, correctionFrames, newTrackSeeds } from '../detectionEditor';
import '../detection-editor.css';

function describePropagation(propagation = []) {
  if (!propagation.length) return 'Koreksi tersimpan dan dihitung ulang. Tidak ada kotak baru yang perlu dilacak.';
  const linked = propagation.reduce((total, track) => total + track.linked_frames, 0);
  const lines = propagation.map((track) => `ID ${track.track_id ?? '-'} (${track.label === 'excluded' ? 'bukan sperma' : 'sperma'}): frame ${track.start_frame + 1} sampai ${track.end_frame + 1}, ${track.linked_frames} frame terhubung`);
  return `Koreksi tersimpan dan dihitung ulang. ${propagation.length} objek dilacak ke ${linked} frame lain. ${lines.join('; ')}.`;
}

export default function DetectionEditor({ analysisId, onSave, onPendingChange, onOpen }) {
  const [open, setOpen] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [frame, setFrame] = useState(0);
  const [loaded, setLoaded] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [history, dispatch] = useReducer(annotationHistory, EMPTY_HISTORY);
  const [selectedId, setSelectedId] = useState(null);
  const [tool, setTool] = useState('select');
  const [gesture, setGesture] = useState(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [reason, setReason] = useState('');
  const [trackInput, setTrackInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [autoTrack, setAutoTrack] = useState(false);
  const svgRef = useRef(null);
  const busy = saving || Boolean(gesture);
  const dirty = Object.keys(history.present).length > 0;
  const ready = loaded?.frame === frame && loaded?.revision === metadata?.revision && Boolean(imageUrl);
  const savedBoxes = loaded?.boxes || [];
  const editedBoxes = history.present[frame] || savedBoxes;
  const boxes = showOriginal ? loaded?.original || [] : editedBoxes;
  const selected = editedBoxes.find((box) => box.id === selectedId);

  useEffect(() => {
    onPendingChange(dirty || busy);
  }, [dirty, busy, onPendingChange]);

  useEffect(() => () => onPendingChange(false), [onPendingChange]);

  useEffect(() => {
    if (!saving) return undefined;
    const started = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [saving]);

  useEffect(() => {
    if (!dirty && !saving) return;
    const preventLeave = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', preventLeave);
    return () => window.removeEventListener('beforeunload', preventLeave);
  }, [dirty, saving]);

  useEffect(() => {
    if (!open || metadata) return;
    const controller = new AbortController();
    axios.get(`${API_BASE_URL}/api/analysis/${analysisId}/annotations`, { headers: getAuthHeader(), signal: controller.signal })
      .then(({ data }) => setMetadata(data))
      .catch((failure) => { if (!controller.signal.aborted) setError(getErrorMessage(failure)); });
    return () => controller.abort();
  }, [analysisId, open, metadata]);

  useEffect(() => {
    if (!open || !metadata) return;
    const controller = new AbortController();
    let objectUrl;
    setLoaded(null);
    setImageUrl('');
    setError('');
    setSelectedId(null);
    setGesture(null);
    Promise.all([
      axios.get(`${API_BASE_URL}/api/analysis/${analysisId}/frames/${frame}`, { headers: getAuthHeader(), signal: controller.signal }),
      axios.get(`${API_BASE_URL}/api/analysis/${analysisId}/frame-image`, { params: { frame }, headers: getAuthHeader(), responseType: 'blob', signal: controller.signal }),
    ]).then(([annotations, image]) => {
      if (controller.signal.aborted) return;
      if (annotations.data.revision !== metadata.revision) {
        setError('Versi server sudah berubah. Tutup halaman dan muat ulang hasil sebelum mengedit.');
        return;
      }
      objectUrl = URL.createObjectURL(image.data);
      setImageUrl(objectUrl);
      setLoaded(annotations.data);
    }).catch((failure) => { if (!controller.signal.aborted) setError(getErrorMessage(failure)); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [analysisId, frame, open, metadata]);

  useEffect(() => { setTrackInput(selected?.track_id?.toString() || ''); }, [selectedId, selected?.track_id]);

  const pendingSeeds = newTrackSeeds(history.present);

  const trackPending = async () => {
    const seeds = newTrackSeeds(history.present);
    if (!seeds.length) return;
    setError('');
    setPreviewing(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/analysis/${analysisId}/corrections/preview`, {
        revision: metadata.revision, reason: 'Pelacakan otomatis', frames: correctionFrames(history.present), tracks: seeds,
      }, { headers: getAuthHeader() });
      const frames = Object.fromEntries(response.data.frames.map((item) => [item.frame, item.boxes]));
      dispatch({ type: 'editMany', frames });
      setPreview(response.data.propagation);
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      setPreviewing(false);
    }
  };

  useEffect(() => {
    if (!autoTrack || previewing || busy) return;
    setAutoTrack(false);
    trackPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTrack, previewing, busy]);

  const edit = (nextBoxes) => {
    if (JSON.stringify(nextBoxes) !== JSON.stringify(editedBoxes)) {
      setPreview(null);
      dispatch({ type: 'edit', frame, boxes: nextBoxes });
    }
  };

  const pointAt = (event) => {
    const matrix = svgRef.current.getScreenCTM();
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return boundedPoint(point, metadata.width, metadata.height);
  };

  const startGesture = (event, detection = null, corner = null) => {
    if (!ready || showOriginal || saving || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const start = pointAt(event);
    svgRef.current.setPointerCapture(event.pointerId);
    if (tool === 'add') {
      setSelectedId(null);
      setGesture({ type: 'draw', start, box: drawnBox(start, start) });
    } else if (detection) {
      setSelectedId(detection.id);
      setGesture({ type: corner ? 'resize' : 'move', id: detection.id, start, original: detection.box, box: detection.box, corner });
    } else {
      setSelectedId(null);
    }
  };

  const moveGesture = (event) => {
    if (!gesture) return;
    const end = pointAt(event);
    const box = gesture.type === 'draw' ? drawnBox(gesture.start, end)
      : gesture.type === 'move' ? movedBox(gesture.original, gesture.start, end, metadata.width, metadata.height)
        : resizedBox(gesture.original, gesture.corner, end, metadata.width, metadata.height);
    setGesture({ ...gesture, box });
  };

  const finishGesture = (event) => {
    if (svgRef.current.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId);
    if (!gesture) return;
    const box = gesture.box;
    if (box[2] - box[0] >= 1 && box[3] - box[1] >= 1) {
      if (gesture.type === 'draw') {
        const id = `manual-${crypto.randomUUID()}`;
        edit([...editedBoxes, { id, box, label: 'sperm', track_id: null, confidence: null, source: 'manual' }]);
        setSelectedId(id);
        setTool('select');
        setAutoTrack(true);
      } else {
        edit(editedBoxes.map((detection) => detection.id === gesture.id ? { ...detection, box } : detection));
      }
    }
    setGesture(null);
  };

  const changeSelected = (changes) => edit(editedBoxes.map((box) => box.id === selectedId ? { ...box, ...changes } : box));
  const assignTrack = () => {
    const value = trackInput.trim() === '' ? null : Number(trackInput);
    if (value !== null && (!Number.isSafeInteger(value) || value <= 0 || editedBoxes.some((box) => box.id !== selectedId && box.label === 'sperm' && box.track_id === value))) {
      setError('ID lintasan harus bilangan bulat positif dan tidak dipakai objek lain pada frame ini.');
      return;
    }
    setError('');
    changeSelected({ track_id: value });
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setNotice(null);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/analysis/${analysisId}/corrections`, {
        revision: metadata.revision, reason: reason.trim(), frames: correctionFrames(history.present), tracks: newTrackSeeds(history.present),
      }, { headers: getAuthHeader() });
      onSave(response.data);
      dispatch({ type: 'reset' });
      setMetadata({ ...metadata, revision: response.data.revision, current_result: response.data });
      setReason('');
      setNotice({
        text: describePropagation(response.data.propagation),
        revision: response.data.revision,
        time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }),
      });
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="detection-editor" aria-label="Koreksi deteksi">
      <button type="button" className="action-pill-btn secondary" aria-expanded={open} disabled={saving} onClick={() => { setOpen(!open); if (!open) onOpen?.(); }}>
        {open ? 'Ciutkan editor koreksi' : 'Koreksi kotak deteksi'}{dirty ? ' (belum disimpan)' : ''}
      </button>
      {notice && (
        <div role="status" className="editor-notice" style={{ marginTop: '10px', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--teal-light)', border: '1px solid var(--teal)', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <strong>✓ Tersimpan sebagai revisi {notice.revision} pukul {notice.time} WIB. Hasil dan preview sudah diperbarui.</strong>
          <span>{notice.text}</span>
        </div>
      )}
      {open && <div className="detection-editor-body" onKeyDown={(event) => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || saving || gesture) return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault(); dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
        }
      }}>
        <h4>Alur koreksi</h4>
        <ol className="editor-steps">
          <li>Pilih frame yang salah dengan Sebelumnya, Berikutnya, atau geser penggeser frame.</li>
          <li>Hapus kotak yang bukan sperma, geser atau ubah ukuran kotak yang kurang pas, atau pilih Tambah kotak lalu tarik kotak pada sperma yang terlewat.</li>
          <li>Tulis alasan koreksi (minimal 3 karakter).</li>
          <li>Klik Simpan koreksi &amp; hitung ulang. Kotak yang ditambahkan atau diubah labelnya otomatis diberi ID lintasan dan dicari di frame sebelum dan sesudahnya, lalu hasil dan preview dihitung ulang.</li>
        </ol>
        <p className="editor-warning">Koreksi manual berlaku pada frame yang diedit. Pelacakan mencocokkan tampilan objek di video dan berhenti jika objek tidak ditemukan lebih dari 3 frame berturut-turut.</p>
        {!metadata && !error && <p role="status">Memuat data deteksi...</p>}
        {metadata && <>
          <div className="editor-toolbar">
            <button type="button" aria-pressed={tool === 'select'} disabled={busy || showOriginal} onClick={() => setTool('select')}>Pilih / geser</button>
            <button type="button" aria-pressed={tool === 'add'} disabled={busy || showOriginal} onClick={() => setTool('add')}>Tambah kotak</button>
            <button type="button" disabled={!selected || busy || showOriginal} onClick={() => { edit(editedBoxes.filter((box) => box.id !== selectedId)); setSelectedId(null); }}>Hapus kotak</button>
            <button type="button" disabled={!history.past.length || busy} onClick={() => dispatch({ type: 'undo' })}>Undo</button>
            <button type="button" disabled={!history.future.length || busy} onClick={() => dispatch({ type: 'redo' })}>Redo</button>
          </div>
          <div className="editor-toolbar">
            <label><input type="checkbox" checked={showOriginal} disabled={busy} onChange={(event) => setShowOriginal(event.target.checked)} /> Bandingkan kotak AI asli</label>
            <label>Zoom <select aria-label="Zoom" value={zoom} disabled={busy} onChange={(event) => setZoom(Number(event.target.value))}>{[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value}x</option>)}</select></label>
            <span>Revisi tersimpan: {metadata.revision}</span>
          </div>
          {!metadata.is_image && <div className="editor-frame-controls">
            <button type="button" disabled={frame === 0 || busy} onClick={() => setFrame(frame - 1)}>Sebelumnya</button>
            <label>Frame <input type="number" min={1} max={metadata.frame_count} value={frame + 1} disabled={busy} onChange={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= metadata.frame_count) setFrame(value - 1); }} /> / {metadata.frame_count}</label>
            <button type="button" disabled={frame >= metadata.frame_count - 1 || busy} onClick={() => setFrame(frame + 1)}>Berikutnya</button>
            <input aria-label="Pilih frame video" type="range" min={0} max={metadata.frame_count - 1} value={frame} disabled={busy} onChange={(event) => setFrame(Number(event.target.value))} />
          </div>}
          {!ready && !error && <p role="status">Memuat frame asli...</p>}
          {ready && <>
            <div className="editor-stage">
              <svg ref={svgRef} viewBox={`0 0 ${metadata.width} ${metadata.height}`} style={{ width: `${zoom * 100}%` }} aria-label={`Frame ${frame + 1}, ${boxes.length} kotak`} onPointerDown={(event) => startGesture(event)} onPointerMove={moveGesture} onPointerUp={finishGesture} onPointerCancel={() => setGesture(null)}>
                <image href={imageUrl} width={metadata.width} height={metadata.height} />
                {boxes.map((detection) => {
                  const box = gesture?.id === detection.id ? gesture.box : detection.box;
                  const active = selectedId === detection.id && !showOriginal;
                  const color = active ? '#facc15' : detection.label === 'sperm' ? '#2dd4bf' : '#f87171';
                  const handleSize = Math.max(metadata.width / 100, 6);
                  return <g key={detection.id}>
                    <rect x={box[0]} y={box[1]} width={box[2] - box[0]} height={box[3] - box[1]} fill="transparent" stroke={color} strokeWidth={active ? 3 : 2} vectorEffect="non-scaling-stroke" tabIndex={showOriginal ? -1 : 0} role="button" aria-label={`Kotak ${detection.id}, ${detection.label}, lintasan ${detection.track_id ?? 'belum ditetapkan'}`} onKeyDown={(event) => { if (!showOriginal && !busy && ['Enter', ' '].includes(event.key)) { event.preventDefault(); setSelectedId(detection.id); } }} onPointerDown={(event) => startGesture(event, detection)} />
                    <text x={box[0]} y={Math.max(handleSize * 1.5, box[1] - 4)} fill={color} fontSize={handleSize * 1.5} fontWeight={active ? 700 : 400} pointerEvents="none">{active ? 'DIPILIH · ' : ''}{detection.label === 'sperm' ? 'Sperma' : 'Dikecualikan'} {detection.track_id ?? (detection.source === 'manual' ? '(baru)' : '')}</text>
                    {active && tool === 'select' && [['top-left', box[0], box[1]], ['top-right', box[2], box[1]], ['bottom-left', box[0], box[3]], ['bottom-right', box[2], box[3]]].map(([corner, left, top]) => <rect key={corner} x={left - handleSize / 2} y={top - handleSize / 2} width={handleSize} height={handleSize} fill={color} onPointerDown={(event) => startGesture(event, detection, corner)} />)}
                  </g>;
                })}
                {gesture?.type === 'draw' && <rect x={gesture.box[0]} y={gesture.box[1]} width={gesture.box[2] - gesture.box[0]} height={gesture.box[3] - gesture.box[1]} stroke="#facc15" strokeWidth={2} fill="transparent" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
              </svg>
            </div>
            <div className="editor-toolbar">
              <label>Objek terpilih <select aria-label="Objek terpilih" value={selectedId || ''} disabled={busy || showOriginal} onChange={(event) => setSelectedId(event.target.value || null)}><option value="">Pilih kotak</option>{editedBoxes.map((box) => <option value={box.id} key={box.id}>{box.id} ({box.label}, ID {box.track_id ?? '-'})</option>)}</select></label>
              {selected && <label>Label <select aria-label="Label" value={selected.label} disabled={busy || showOriginal} onChange={(event) => { changeSelected({ label: event.target.value, track_id: null, source: 'manual' }); setAutoTrack(true); }}><option value="sperm">Sperma</option><option value="excluded">Bukan sperma / kecualikan</option></select></label>}
            </div>
            {selected && <p role="status" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
              {selected.track_id != null ? `Objek ini memiliki ID lintasan ${selected.track_id}.`
                : selected.source === 'manual' ? 'Objek ini belum punya ID. Saat disimpan akan diberi ID baru dan dicari di frame sebelum dan sesudahnya.'
                  : 'Objek ini tidak punya ID lintasan.'}
            </p>}
            {selected && !metadata.is_image && <div className="editor-toolbar">
              <label>ID lintasan (opsional)<input aria-label="ID lintasan (opsional)" type="number" min={1} step={1} value={trackInput} disabled={busy || showOriginal} onChange={(event) => setTrackInput(event.target.value)} /></label>
              <button type="button" disabled={busy || showOriginal} onClick={assignTrack}>Tetapkan ID</button>
              <p>Gunakan ID yang sama hanya jika yakin objeknya sama pada frame bersebelahan. Kosongkan untuk tidak ikut perhitungan gerak.</p>
            </div>}
            <button type="button" disabled={busy || showOriginal} onClick={() => edit(loaded.original)}>Kembalikan frame ini ke kotak AI asli</button>
          </>}
          <label className="editor-reason">Alasan koreksi<textarea maxLength={1000} value={reason} disabled={saving} onChange={(event) => setReason(event.target.value)} placeholder="Jelaskan kotak yang dihapus, ditambah, atau diperbaiki" /></label>
          <p role="status">{Object.keys(history.present).length} frame memiliki perubahan belum disimpan. Angka hasil dan preview lama belum berubah sampai perhitungan ulang selesai.</p>
          {previewing && <p role="status" className="editor-notice">Melacak objek ke frame sebelum dan sesudahnya. Mohon tunggu...</p>}
          {!previewing && pendingSeeds.length > 0 && <div className="editor-toolbar" role="status">
            <span>{pendingSeeds.length} kotak belum dilacak.</span>
            <button type="button" disabled={busy} onClick={trackPending}>Lacak objek ini</button>
          </div>}
          {!previewing && preview && <div role="status" className="editor-notice" style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {preview.length === 0 && <span>Tidak ada objek baru yang perlu dilacak.</span>}
            {preview.map((track) => <span key={track.track_id ?? track.start_frame}>
              {track.track_id == null ? 'Objek tidak dilacak (kontras terlalu rendah untuk dicocokkan).'
                : track.linked_frames === 0 ? `ID ${track.track_id}: objek tidak ditemukan di frame sekitarnya. Hanya frame ini yang berubah.`
                  : `ID ${track.track_id} (${track.label === 'excluded' ? 'bukan sperma' : 'sperma'}): terlacak di frame ${track.start_frame + 1} sampai ${track.end_frame + 1}, total ${track.linked_frames + 1} frame. Undo membatalkan, simpan untuk menyimpan revisi.`}
            </span>)}
          </div>}
          <div className="editor-toolbar">
            <button type="button" className="editor-save" disabled={!dirty || busy || reason.trim().length < 3} onClick={save}>{saving ? `Menghitung ulang... ${elapsed} dtk` : 'Simpan koreksi & hitung ulang'}</button>
            {saving && <p role="status" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Hasil dan preview sedang dihitung ulang. Proses ini bisa memakan waktu beberapa menit untuk video panjang. Jangan tutup halaman.</p>}
            {!saving && dirty && reason.trim().length < 3 && <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Isi alasan koreksi (minimal 3 karakter) untuk mengaktifkan tombol simpan.</p>}
            <button type="button" disabled={!dirty || busy} onClick={() => { if (window.confirm('Buang seluruh perubahan yang belum disimpan?')) dispatch({ type: 'reset' }); }}>Buang perubahan</button>
          </div>
        </>}
        {error && <p role="alert" className="editor-error">{error}</p>}
      </div>}
    </section>
  );
}
