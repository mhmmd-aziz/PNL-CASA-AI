import test from 'node:test';
import assert from 'node:assert/strict';
import { analysisSummary, motionUnavailableReason, trackingSummary } from './parameterHelp.js';

test('summary uses actual PR, including the reported 11.3% case', () => {
  const summary = analysisSummary({ summary: { motility_available: true, progressive_percent: 11.3 } });
  assert.equal(summary, 'Motilitas progresif (PR) terukur: 11.3%');
  assert.doesNotMatch(summary, /Normozoospermia|30%/);
});

test('zero PR is a valid measurement, not missing data', () => {
  assert.match(analysisSummary({ summary: { motility_available: true, progressive_percent: 0 } }), /0\.0%/);
});

test('unavailable measurements do not become a diagnosis or measured zero', () => {
  assert.equal(analysisSummary({ summary: { motility_available: false, progressive_percent: 0 } }), 'Motilitas tidak dapat dinilai dari media ini');
  assert.equal(analysisSummary({}), 'Hasil motilitas belum tersedia');
});

test('missing metric explanation distinguishes image, short tracks and unsupported metrics', () => {
  assert.match(motionUnavailableReason({ summary: { is_image: true, motility_available: false } }), /Citra tunggal/);
  assert.match(motionUnavailableReason({ summary: { motility_available: false } }), /15 titik/);
  assert.match(motionUnavailableReason({ summary: { motility_available: true } }), /Jalankan analisis ulang/);
  assert.match(motionUnavailableReason({ summary: { motility_available: true }, motion: { average_path_speed: 0 } }), /pembaginya nol/);
});

test('detection median is distinguished from the motility denominator', () => {
  const message = trackingSummary({ summary: { count_method: 'median_detections_per_frame', total_sperm: 28.5, motility_denominator: 24 } });
  assert.match(message, /Median 28.5 deteksi per frame/);
  assert.match(message, /24 ID lintasan valid/);
});

test('image counts and legacy results do not invent a tracking denominator', () => {
  assert.match(trackingSummary({ summary: { count_method: 'single_image_detections', total_sperm: 31 } }), /citra tunggal; motilitas tidak dinilai/);
  assert.equal(trackingSummary({ summary: { total_sperm: 31 } }), '');
});
