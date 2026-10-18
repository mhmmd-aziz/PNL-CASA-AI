import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Play, Pause, ChevronLeft, ChevronRight, Trash2, AlertCircle, CheckCircle2, Plus } from 'lucide-react';
import { fabric } from 'fabric';
import { API_BASE_URL } from '../api.js';
import { getAuthHeader } from '../auth';

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;
const VIDEO_WIDTH = 960;
const VIDEO_HEIGHT = 540;

function errorMessage(error) {
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length) return detail[0].msg;
  if (!error.response) return 'Tidak dapat terhubung ke server.';
  return 'Permintaan gagal.';
}

export default function VideoAnnotationEditor({ examination, analysisRun, videoUrl, onClose }) {
  const videoRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const fabricRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [detections, setDetections] = useState({}); // { frame_index: [boxes] }
  const [corrections, setCorrections] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const [mode, setMode] = useState('view'); // view | delete | add | move
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState(null);

  // Initialize fabric canvas
  useEffect(() => {
    if (!canvasContainerRef.current) return;

    const fabricCanvas = new fabric.Canvas('annotation-canvas', {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      backgroundColor: 'transparent',
      selection: true,
    });

    fabricRef.current = fabricCanvas;

    // Handle canvas object selection
    fabricCanvas.on('object:modified', () => {
      // Update selected box after move/resize
      if (fabricCanvas.getActiveObject()) {
        const obj = fabricCanvas.getActiveObject();
        setSelectedBox({
          x: obj.left,
          y: obj.top,
          w: obj.width * obj.scaleX,
          h: obj.height * obj.scaleY,
        });
      }
    });

    return () => {
      fabricCanvas.dispose();
    };
  }, []);

  // Load video metadata
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateFrameInfo = () => {
      const fps = analysisRun?.frame_rate_fps || 30;
      const duration = video.duration || 0;
      const frames = Math.floor(duration * fps);
      setTotalFrames(frames);
    };

    video.addEventListener('loadedmetadata', updateFrameInfo);
    return () => video.removeEventListener('loadedmetadata', updateFrameInfo);
  }, [analysisRun]);

  // Load corrections history
  useEffect(() => {
    const loadCorrections = async () => {
      try {
        const { data } = await axios.get(
          `${API_BASE_URL}/api/examinations/${examination.id}/corrections`,
          { headers: getAuthHeader() }
        );
        setCorrections(data.corrections || []);
        setLoadError('');
      } catch (error) {
        setLoadError(errorMessage(error));
      }
    };

    loadCorrections();
  }, [examination.id]);

  // Load original detections dari analysis_run
  useEffect(() => {
    if (!analysisRun?.tracking_data_json) return;

    try {
      const trackingData = JSON.parse(analysisRun.tracking_data_json);
      // Asumsikan struktur: { frames: [{ frame_index: 0, detections: [...] }] }
      const detectionsMap = {};
      if (trackingData.frames) {
        trackingData.frames.forEach((frame) => {
          detectionsMap[frame.frame_index] = frame.detections || [];
        });
      }
      setDetections(detectionsMap);
    } catch (e) {
      console.error('Error parsing tracking data:', e);
    }
  }, [analysisRun]);

  // Render detections pada canvas untuk frame saat ini
  useEffect(() => {
    if (!fabricRef.current) return;

    const canvas = fabricRef.current;
    canvas.clear();

    // Draw original detections (garis putus-putus, warna merah)
    const originalDetections = detections[currentFrame] || [];
    originalDetections.forEach((det) => {
      const rect = new fabric.Rect({
        left: det.bbox.x,
        top: det.bbox.y,
        width: det.bbox.w,
        height: det.bbox.h,
        fill: false,
        stroke: '#dc2626',
        strokeWidth: 2,
        strokeDashArray: [5, 5],
        selectable: false,
        evented: false,
        label: `AI: ${det.label || 'unknown'}`,
      });
      canvas.add(rect);
    });

    // Draw koreksi yang sudah accepted (garis solid, warna biru)
    const frameCorrections = corrections.filter((c) => c.frame_index === currentFrame);
    frameCorrections.forEach((correction) => {
      if (correction.correction_type === 'DELETE') {
        // Tampilkan box yang di-delete dengan X
        if (correction.original_bbox) {
          const rect = new fabric.Rect({
            left: correction.original_bbox.x,
            top: correction.original_bbox.y,
            width: correction.original_bbox.w,
            height: correction.original_bbox.h,
            fill: false,
            stroke: '#ef4444',
            strokeWidth: 3,
            selectable: false,
            evented: false,
          });
          canvas.add(rect);

          // Add X line
          const line1 = new fabric.Line(
            [
              correction.original_bbox.x,
              correction.original_bbox.y,
              correction.original_bbox.x + correction.original_bbox.w,
              correction.original_bbox.y + correction.original_bbox.h,
            ],
            { stroke: '#ef4444', strokeWidth: 2, selectable: false, evented: false }
          );
          const line2 = new fabric.Line(
            [
              correction.original_bbox.x + correction.original_bbox.w,
              correction.original_bbox.y,
              correction.original_bbox.x,
              correction.original_bbox.y + correction.original_bbox.h,
            ],
            { stroke: '#ef4444', strokeWidth: 2, selectable: false, evented: false }
          );
          canvas.add(line1, line2);
        }
      } else if (correction.correction_type === 'ADD') {
        // Tampilkan box baru dengan solid blue
        if (correction.corrected_bbox) {
          const rect = new fabric.Rect({
            left: correction.corrected_bbox.x,
            top: correction.corrected_bbox.y,
            width: correction.corrected_bbox.w,
            height: correction.corrected_bbox.h,
            fill: false,
            stroke: '#0ea5e9',
            strokeWidth: 2,
            selectable: false,
            evented: false,
            label: `Added: ${correction.corrected_label || 'object'}`,
          });
          canvas.add(rect);
        }
      } else if (correction.correction_type === 'MOVE') {
        // Tampilkan box yang sudah di-move
        if (correction.corrected_bbox) {
          const rect = new fabric.Rect({
            left: correction.corrected_bbox.x,
            top: correction.corrected_bbox.y,
            width: correction.corrected_bbox.w,
            height: correction.corrected_bbox.h,
            fill: false,
            stroke: '#10b981',
            strokeWidth: 2,
            selectable: false,
            evented: false,
          });
          canvas.add(rect);
        }
      }
    });

    canvas.renderAll();
  }, [currentFrame, detections, corrections]);

  // Play/pause controls
  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const goToFrame = (frameNum) => {
    if (videoRef.current) {
      const fps = analysisRun?.frame_rate_fps || 30;
      videoRef.current.currentTime = frameNum / fps;
      setCurrentFrame(frameNum);
    }
  };

  const handlePrevFrame = () => goToFrame(Math.max(0, currentFrame - 1));
  const handleNextFrame = () => goToFrame(Math.min(totalFrames - 1, currentFrame + 1));

  // Canvas interaction: draw new box
  const handleCanvasMouseDown = (e) => {
    if (mode !== 'add') return;

    const canvas = fabricRef.current;
    const rect = e.target;

    if (rect && rect.label) {
      // Clicked on existing box
      return;
    }

    // Start drawing new box
    const pointer = canvas.getPointer(e.e);
    setStartPos(pointer);
    setIsDrawing(true);
  };

  const handleCanvasMouseMove = (e) => {
    if (!isDrawing || !startPos || mode !== 'add') return;

    const canvas = fabricRef.current;
    const pointer = canvas.getPointer(e.e);

    // Remove temporary rectangle if exists
    const tempRect = canvas.getObjects().find((obj) => obj.isTemp);
    if (tempRect) canvas.remove(tempRect);

    // Draw preview rectangle
    const rect = new fabric.Rect({
      left: Math.min(startPos.x, pointer.x),
      top: Math.min(startPos.y, pointer.y),
      width: Math.abs(pointer.x - startPos.x),
      height: Math.abs(pointer.y - startPos.y),
      fill: 'rgba(59, 130, 246, 0.1)',
      stroke: '#3b82f6',
      strokeWidth: 2,
      selectable: false,
      evented: false,
      isTemp: true,
    });
    canvas.add(rect);
    canvas.renderAll();
  };

  const handleCanvasMouseUp = async (e) => {
    if (!isDrawing || !startPos || mode !== 'add') {
      setIsDrawing(false);
      return;
    }

    const canvas = fabricRef.current;
    const pointer = canvas.getPointer(e.e);

    const bbox = {
      x: Math.min(startPos.x, pointer.x),
      y: Math.min(startPos.y, pointer.y),
      w: Math.abs(pointer.x - startPos.x),
      h: Math.abs(pointer.y - startPos.y),
    };

    // Validate bbox size
    if (bbox.w < 10 || bbox.h < 10) {
      setNotice({ type: 'error', text: 'Kotak terlalu kecil.' });
      setIsDrawing(false);
      setStartPos(null);
      return;
    }

    setIsDrawing(false);
    setStartPos(null);

    // Submit koreksi ADD ke backend
    await submitCorrection({
      correction_type: 'ADD',
      frame_index: currentFrame,
      corrected_bbox: bbox,
      corrected_label: 'sperm',
    });

    // Clear canvas for next action
    canvas.clear();
  };

  const submitCorrection = async (correctionData) => {
    setBusy(true);
    setNotice(null);
    try {
      const payload = {
        analysis_run_id: analysisRun.id,
        frame_index: correctionData.frame_index,
        correction_type: correctionData.correction_type,
        original_bbox: correctionData.original_bbox || null,
        original_label: correctionData.original_label || null,
        corrected_bbox: correctionData.corrected_bbox || null,
        corrected_label: correctionData.corrected_label || null,
        notes: correctionData.notes || null,
      };

      const response = await axios.post(
        `${API_BASE_URL}/api/examinations/${examination.id}/corrections`,
        payload,
        { headers: getAuthHeader() }
      );

      setNotice({ type: 'ok', text: `Koreksi ${correctionData.correction_type} tersimpan.` });

      // Refresh corrections list
      const { data } = await axios.get(
        `${API_BASE_URL}/api/examinations/${examination.id}/corrections`,
        { headers: getAuthHeader() }
      );
      setCorrections(data.corrections || []);

      // Show tracking proposal if exists
      if (response.data.tracking_proposal_json && response.data.tracking_proposal_json.proposed_frames?.length) {
        setNotice({
          type: 'info',
          text: `${response.data.tracking_proposal_json.proposed_frames.length} frame proposal diterima. Terima tracking?`,
          trackingProposal: true,
          correctionId: response.data.id,
        });
      }

      setMode('view');
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const deleteCorrection = async (correctionId) => {
    if (!window.confirm('Hapus koreksi ini?')) return;

    setBusy(true);
    try {
      await axios.delete(
        `${API_BASE_URL}/api/examinations/${examination.id}/corrections/${correctionId}`,
        { headers: getAuthHeader() }
      );

      setNotice({ type: 'ok', text: 'Koreksi dihapus.' });

      // Refresh list
      const { data } = await axios.get(
        `${API_BASE_URL}/api/examinations/${examination.id}/corrections`,
        { headers: getAuthHeader() }
      );
      setCorrections(data.corrections || []);
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const acceptTrackingProposal = async (correctionId, accepted = true) => {
    setBusy(true);
    try {
      await axios.post(
        `${API_BASE_URL}/api/examinations/${examination.id}/corrections/${correctionId}/accept-tracking`,
        { accepted },
        { headers: getAuthHeader() }
      );

      setNotice({
        type: 'ok',
        text: accepted ? 'Tracking diterima dan diterapkan.' : 'Tracking ditolak.',
      });

      // Refresh corrections list
      const { data } = await axios.get(
        `${API_BASE_URL}/api/examinations/${examination.id}/corrections`,
        { headers: getAuthHeader() }
      );
      setCorrections(data.corrections || []);
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', background: 'var(--bg-card)' }}>
      <h3>Koreksi Deteksi Sperma — {examination.sample_code}</h3>

      {loadError && (
        <p style={{ color: '#dc2626', fontSize: '0.8rem', display: 'flex', gap: '6px', alignItems: 'center' }}>
          <AlertCircle size={14} /> {loadError}
        </p>
      )}

      {notice && (
        <div style={{ fontSize: '0.8rem', display: 'flex', gap: '6px', alignItems: 'center', color: notice.type === 'ok' ? 'var(--teal)' : notice.type === 'error' ? '#dc2626' : '#f59e0b' }}>
          {notice.type === 'ok' && <CheckCircle2 size={14} />}
          {(notice.type === 'info' || notice.type === 'error') && <AlertCircle size={14} />}
          {notice.text}
          {notice.trackingProposal && notice.correctionId && (
            <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
              <button className="action-pill-btn secondary" style={{ height: '24px', fontSize: '0.7rem' }} onClick={() => acceptTrackingProposal(notice.correctionId, false)} disabled={busy}>
                Tolak
              </button>
              <button className="action-pill-btn primary" style={{ height: '24px', fontSize: '0.7rem' }} onClick={() => acceptTrackingProposal(notice.correctionId, true)} disabled={busy}>
                Terima
              </button>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '16px' }}>
        {/* Video player + Canvas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ position: 'relative', background: '#000' }}>
            <video
              ref={videoRef}
              src={videoUrl}
              style={{ width: VIDEO_WIDTH, height: VIDEO_HEIGHT, display: 'block' }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
            <div
              ref={canvasContainerRef}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: VIDEO_WIDTH,
                height: VIDEO_HEIGHT,
                cursor: mode === 'add' ? 'crosshair' : 'default',
              }}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
            >
              <canvas id="annotation-canvas" style={{ display: 'block' }} />
            </div>
          </div>

          {/* Playback controls */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.8rem' }}>
            <button className="action-pill-btn secondary" style={{ width: '32px', height: '32px', padding: 0 }} onClick={handlePlayPause}>
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button className="action-pill-btn secondary" style={{ width: '32px', height: '32px', padding: 0 }} onClick={handlePrevFrame}>
              <ChevronLeft size={14} />
            </button>
            <span style={{ flex: 1 }}>
              Frame {currentFrame + 1} / {totalFrames}
            </span>
            <button className="action-pill-btn secondary" style={{ width: '32px', height: '32px', padding: 0 }} onClick={handleNextFrame}>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Mode selector */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              className={`action-pill-btn ${mode === 'view' ? 'primary' : 'secondary'}`}
              onClick={() => setMode('view')}
              style={{ fontSize: '0.75rem', height: '28px' }}
            >
              Lihat
            </button>
            <button
              className={`action-pill-btn ${mode === 'add' ? 'primary' : 'secondary'}`}
              onClick={() => setMode('add')}
              style={{ fontSize: '0.75rem', height: '28px' }}
              disabled={busy}
            >
              <Plus size={12} /> Tambah Sperma
            </button>
            <button
              className={`action-pill-btn ${mode === 'delete' ? 'primary' : 'secondary'}`}
              onClick={() => setMode('delete')}
              style={{ fontSize: '0.75rem', height: '28px' }}
              disabled={busy}
            >
              <Trash2 size={12} /> Hapus
            </button>
          </div>
        </div>

        {/* Sidebar: Koreksi history */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '600px', overflowY: 'auto', fontSize: '0.75rem' }}>
          <div style={{ fontWeight: 700, color: 'var(--text-muted)' }}>Koreksi ({corrections.length})</div>
          {corrections.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Belum ada koreksi.</p>}
          {corrections.map((correction) => (
            <div
              key={correction.id}
              style={{
                padding: '8px',
                background: 'var(--bg-card-alt)',
                borderRadius: '8px',
                border: `1px solid ${correction.correction_type === 'DELETE' ? '#ef4444' : correction.correction_type === 'ADD' ? '#0ea5e9' : '#10b981'}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>
                  Frame {correction.frame_index}: {correction.correction_type}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                  {new Date(correction.created_at).toLocaleTimeString('id-ID')}
                </div>
              </div>
              <button
                className="action-pill-btn secondary"
                style={{ width: '24px', height: '24px', padding: 0 }}
                onClick={() => deleteCorrection(correction.id)}
                disabled={busy}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button className="action-pill-btn secondary" onClick={onClose} disabled={busy}>
          Tutup
        </button>
        <button className="action-pill-btn primary" disabled={busy || corrections.length === 0}>
          {busy ? 'Menyimpan...' : 'Selesai & Submit'}
        </button>
      </div>
    </div>
  );
}
