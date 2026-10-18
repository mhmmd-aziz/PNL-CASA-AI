import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_HISTORY, annotationHistory, drawnBox, movedBox, resizedBox, boundedPoint, correctionFrames } from './detectionEditor.js';

test('undo and redo restore edits across frames without mutating originals', () => {
  const first = [{ id: 'first', box: [1, 2, 3, 4], label: 'sperm', track_id: null }];
  const initial = structuredClone(EMPTY_HISTORY);
  const added = annotationHistory(initial, { type: 'edit', frame: 0, boxes: first });
  const removed = annotationHistory(added, { type: 'edit', frame: 2, boxes: [] });
  const undo = annotationHistory(removed, { type: 'undo' });
  assert.deepEqual(undo.present, { 0: first });
  assert.deepEqual(annotationHistory(undo, { type: 'redo' }).present, removed.present);
  assert.deepEqual(initial, EMPTY_HISTORY);
  assert.deepEqual(annotationHistory(undo, { type: 'edit', frame: 3, boxes: first }).future, []);
  assert.deepEqual(annotationHistory(removed, { type: 'reset' }), EMPTY_HISTORY);
});

test('drawing and resizing support reversed drags and clamp to source dimensions', () => {
  assert.deepEqual(drawnBox({ x: 20, y: 30 }, { x: 5, y: 10 }), [5, 10, 20, 30]);
  assert.deepEqual(boundedPoint({ x: -5, y: 200 }, 100, 80), { x: 0, y: 80 });
  assert.deepEqual(resizedBox([10, 10, 30, 30], 'bottom-right', { x: 200, y: 90 }, 100, 80), [10, 10, 100, 80]);
  assert.deepEqual(resizedBox([10, 10, 30, 30], 'top-left', { x: -20, y: -20 }, 100, 80), [0, 0, 30, 30]);
});

test('moving against image boundaries preserves box dimensions', () => {
  assert.deepEqual(movedBox([10, 10, 30, 30], { x: 20, y: 20 }, { x: 500, y: 500 }, 100, 80), [80, 60, 100, 80]);
  assert.deepEqual(movedBox([10, 10, 30, 30], { x: 20, y: 20 }, { x: -20, y: -20 }, 100, 80), [0, 0, 20, 20]);
});

test('payload never sends fake confidence or changes other frames', () => {
  const frames = correctionFrames({ 12: [{ id: 'new', box: [1, 2, 3, 4], label: 'excluded', source: 'manual', confidence: .99 }] });
  assert.deepEqual(frames, [{ frame: 12, boxes: [{ id: 'new', box: [1, 2, 3, 4], label: 'excluded', track_id: null }] }]);
});
