import test from 'node:test';
import assert from 'node:assert/strict';
import {
  exportFileName,
  formatBucket,
  hasAnyActivity,
  niceMax,
  presetRange,
  todayWib,
  validateRange,
  xLabelIndexes,
  yTicks
} from './opsDashboard.js';

test('todayWib follows UTC+7, not the browser timezone', () => {
  assert.equal(todayWib(Date.parse('2026-10-17T16:59:00Z')), '2026-10-17');
  assert.equal(todayWib(Date.parse('2026-10-17T17:00:00Z')), '2026-10-18');
});

test('presets produce inclusive ranges ending today', () => {
  assert.deepEqual(presetRange('7d', '2026-10-18'), { start: '2026-10-12', end: '2026-10-18' });
  assert.deepEqual(presetRange('30d', '2026-10-18'), { start: '2026-09-19', end: '2026-10-18' });
  assert.deepEqual(presetRange('90d', '2026-03-01'), { start: '2025-12-02', end: '2026-03-01' });
  assert.deepEqual(presetRange('month', '2026-10-18'), { start: '2026-10-01', end: '2026-10-18' });
  assert.deepEqual(presetRange('year', '2026-10-18'), { start: '2026-01-01', end: '2026-10-18' });
  assert.throws(() => presetRange('nope', '2026-10-18'));
});

test('validateRange accepts any custom range up to five years', () => {
  assert.equal(validateRange('2026-10-18', '2026-10-18'), '');
  assert.equal(validateRange('2022-01-01', '2026-10-18'), '');
  assert.equal(validateRange('', '2026-10-18'), 'Isi tanggal awal dan akhir.');
  assert.equal(validateRange('2026-10-18', '2026-10-01'), 'Tanggal akhir tidak boleh sebelum tanggal awal.');
  assert.equal(validateRange('2019-01-01', '2026-10-18'), 'Rentang tanggal maksimal 5 tahun.');
  assert.equal(validateRange('2026-13-40', '2026-10-18'), 'Tanggal tidak valid.');
});

test('niceMax rounds up to clean axis maxima', () => {
  assert.equal(niceMax(0), 4);
  assert.equal(niceMax(1), 4);
  assert.equal(niceMax(7), 10);
  assert.equal(niceMax(23), 25);
  assert.equal(niceMax(180), 200);
  assert.equal(niceMax(1200), 2000);
});

test('yTicks spans zero to the nice maximum', () => {
  assert.deepEqual(yTicks(7), [0, 2.5, 5, 7.5, 10]);
  assert.deepEqual(yTicks(0), [0, 1, 2, 3, 4]);
});

test('xLabelIndexes thins labels and always keeps the last point', () => {
  assert.deepEqual(xLabelIndexes(0), []);
  assert.deepEqual(xLabelIndexes(4), [0, 1, 2, 3]);
  const many = xLabelIndexes(90);
  assert.ok(many.length <= 6);
  assert.equal(many[0], 0);
  assert.equal(many[many.length - 1], 89);
  for (let i = 1; i < many.length; i += 1) assert.ok(many[i] > many[i - 1]);
});

test('formatBucket renders Indonesian day and month labels', () => {
  assert.equal(formatBucket('2026-10-05', 'day'), '5 Okt');
  assert.equal(formatBucket('2026-05', 'month'), 'Mei 2026');
});

test('exportFileName mirrors the backend attachment name', () => {
  assert.equal(exportFileName('2026-10-01', '2026-10-31', 'xlsx'), 'laporan-casa-ai_2026-10-01_2026-10-31.xlsx');
});

test('hasAnyActivity separates empty ranges from quiet ones', () => {
  assert.equal(hasAnyActivity(null), false);
  const empty = { summary: { registered: 0, analyzed: 0, released: 0 }, security: { audit_events: 0 } };
  assert.equal(hasAnyActivity(empty), false);
  assert.equal(hasAnyActivity({ ...empty, security: { audit_events: 3 } }), true);
});
