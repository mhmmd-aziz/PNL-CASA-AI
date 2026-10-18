import test from 'node:test';
import assert from 'node:assert/strict';
import { formatWib } from './formatTime.js';

test('SQLite time without a zone is treated as UTC and shown in WIB', () => {
  const text = formatWib('2026-10-18 03:54:02');
  assert.ok(text.includes('18/10/2026'), text);
  assert.ok(text.includes('10.54.02'), text);
  assert.ok(text.endsWith('WIB'), text);
});

test('ISO time with an explicit zone is converted, not reinterpreted', () => {
  assert.ok(formatWib('2026-10-18T03:54:02+00:00').includes('10.54.02'));
  assert.ok(formatWib('2026-10-18T03:54:02Z').includes('10.54.02'));
  assert.ok(formatWib('2026-10-18T10:54:02+07:00').includes('10.54.02'));
});

test('date rolls over to the next day in WIB', () => {
  const text = formatWib('2026-10-18 20:30:00');
  assert.ok(text.includes('19/10/2026') && text.includes('03.30.00'), text);
});

test('empty and invalid values do not throw', () => {
  assert.equal(formatWib(null), '—');
  assert.equal(formatWib(''), '—');
  assert.equal(formatWib('bukan tanggal'), 'bukan tanggal');
});
