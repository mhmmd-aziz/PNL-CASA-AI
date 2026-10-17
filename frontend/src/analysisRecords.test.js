import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalysisRecord, formatMeasurement } from './analysisRecords.js';

const actualResult = { data: { summary: { estimated_concentration: 0, motility_available: false } }, isImage: true };

test('missing measurements stay unavailable while measured zero remains zero', () => {
  for (const value of [undefined, null, NaN, Infinity, '12']) {
    assert.equal(formatMeasurement(value, 'M/mL'), 'Tidak tersedia');
  }
  assert.equal(formatMeasurement(0, 'M/mL', 2), '0.00 M/mL');
});

test('records contain only supplied patient metadata and actual inference values', () => {
  const record = createAnalysisRecord(actualResult);
  assert.equal(record.patientName, null);
  assert.equal(record.clinic, null);
  assert.equal(record.sourceFile, null);
  assert.equal(record.videoUrl, null);
  assert.deepEqual(record.data, actualResult.data);
  assert.notEqual(record.data, actualResult.data);
  assert.equal(record.verifiedBy, undefined);
  assert.ok(Number.isFinite(Date.parse(record.createdAt)));
  const second = createAnalysisRecord(actualResult, { patientName: '  Input pasien  ', clinic: '  ', sourceFile: 'upload.png' });
  assert.equal(second.patientName, 'Input pasien');
  assert.equal(second.clinic, null);
  assert.equal(second.sourceFile, 'upload.png');
  assert.notEqual(record.id, second.id);
});

test('demo and missing inference results cannot become patient records', () => {
  for (const result of [null, {}, { data: {} }, { ...actualResult, isDemo: true }, { ...actualResult, is_demo: true }]) {
    assert.throws(() => createAnalysisRecord(result), /inferensi aktual/);
  }
});
