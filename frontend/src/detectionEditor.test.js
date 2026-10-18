import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_HISTORY, annotationHistory, drawnBox, movedBox, resizedBox, boundedPoint, correctionFrames, deletionSeed, describeDeletion } from './detectionEditor.js';

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

test('deletion propagation is merged into the deleting step so one undo reverts everything', () => {
  const box = (id) => ({ id, box: [1, 2, 3, 4], label: 'sperm', track_id: null });
  const deleted = annotationHistory(structuredClone(EMPTY_HISTORY), { type: 'edit', frame: 5, boxes: [box('b')] });
  const amended = annotationHistory(deleted, { type: 'amend', frames: { 3: [box('b')], 7: [box('b')] }, pastLength: deleted.past.length });
  assert.deepEqual(Object.keys(amended.present).sort(), ['3', '5', '7']);
  assert.equal(amended.past.length, 1);
  const undone = annotationHistory(amended, { type: 'undo' });
  assert.deepEqual(undone.present, {});
  assert.deepEqual(annotationHistory(undone, { type: 'redo' }).present, amended.present);
});

test('late deletion result becomes a new undo step when another edit happened in between', () => {
  const box = (id) => ({ id, box: [1, 2, 3, 4], label: 'sperm', track_id: null });
  const deleted = annotationHistory(structuredClone(EMPTY_HISTORY), { type: 'edit', frame: 5, boxes: [box('b')] });
  const other = annotationHistory(deleted, { type: 'edit', frame: 9, boxes: [] });
  const amended = annotationHistory(other, { type: 'amend', frames: { 3: [box('b')] }, pastLength: deleted.past.length });
  assert.equal(amended.past.length, 3);
  assert.deepEqual(amended.future, []);
  assert.deepEqual(Object.keys(amended.present).sort(), ['3', '5', '9']);
  assert.deepEqual(annotationHistory(amended, { type: 'undo' }).present, other.present);
});

test('deletion seed carries frame, box and label of the removed detection', () => {
  const removed = { id: 'det-1', box: [10, 20, 30, 40], label: 'excluded', track_id: 4, confidence: 0.9, source: 'manual' };
  assert.deepEqual(deletionSeed(12, removed), { frame: 12, box: [10, 20, 30, 40], label: 'excluded' });
});

test('deletion summary explains how many other frames were affected', () => {
  const tracked = { kind: 'delete', label: 'sperm', tracked: true, start_frame: 0, end_frame: 11, linked_frames: 11 };
  assert.match(describeDeletion(tracked), /dihapus juga di 11 frame lain, frame 1 sampai 12/);
  assert.match(describeDeletion({ ...tracked, label: 'excluded' }), /bukan sperma/);
  assert.match(describeDeletion({ ...tracked, linked_frames: 0 }), /tidak ditemukan.*Hanya frame ini/);
  assert.match(describeDeletion({ ...tracked, tracked: false, linked_frames: 0 }), /kontras terlalu rendah.*Hanya frame ini/);
});
