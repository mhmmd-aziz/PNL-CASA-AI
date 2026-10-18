export const EMPTY_HISTORY = { past: [], present: {}, future: [] };

export function annotationHistory(state, action) {
  if (action.type === 'reset') return EMPTY_HISTORY;
  if (action.type === 'undo' && state.past.length) {
    return { past: state.past.slice(0, -1), present: state.past.at(-1), future: [state.present, ...state.future] };
  }
  if (action.type === 'redo' && state.future.length) {
    return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) };
  }
  if (action.type === 'edit') {
    const present = { ...state.present, [action.frame]: action.boxes };
    return { past: [...state.past, state.present], present, future: [] };
  }
  if (action.type === 'editMany') {
    const present = { ...state.present, ...action.frames };
    return { past: [...state.past, state.present], present, future: [] };
  }
  return state;
}

export function boundedPoint(point, width, height) {
  return { x: Math.min(width, Math.max(0, point.x)), y: Math.min(height, Math.max(0, point.y)) };
}

export function drawnBox(start, end) {
  return [Math.min(start.x, end.x), Math.min(start.y, end.y), Math.max(start.x, end.x), Math.max(start.y, end.y)];
}

export function movedBox(box, start, end, width, height) {
  const deltaX = Math.min(width - box[2], Math.max(-box[0], end.x - start.x));
  const deltaY = Math.min(height - box[3], Math.max(-box[1], end.y - start.y));
  return [box[0] + deltaX, box[1] + deltaY, box[2] + deltaX, box[3] + deltaY];
}

export function resizedBox(box, corner, point, width, height) {
  const end = boundedPoint(point, width, height);
  const opposite = { x: corner.includes('left') ? box[2] : box[0], y: corner.includes('top') ? box[3] : box[1] };
  return drawnBox(opposite, end);
}

export function correctionFrames(edits) {
  return Object.entries(edits).map(([frame, boxes]) => ({
    frame: Number(frame),
    boxes: boxes.map(({ id, box, label, track_id }) => ({ id, box, label, track_id: track_id ?? null })),
  }));
}

// Kotak manual (baru atau diubah labelnya) tanpa ID lintasan; server melacaknya ke frame lain
export function newTrackSeeds(edits) {
  return Object.entries(edits).flatMap(([frame, boxes]) => boxes
    .filter((box) => box.source === 'manual' && box.track_id == null)
    .map((box) => ({ frame: Number(frame), box_id: box.id })));
}
