import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CALIBRATION, validateCalibration, formatMotility, formatMotion, getErrorMessage } from './calibration.js';

test('default calibration and zero classification thresholds are accepted', () => {
  assert.equal(validateCalibration(DEFAULT_CALIBRATION), '');
  assert.equal(validateCalibration({ ...DEFAULT_CALIBRATION, prog_linearity_threshold: 0, immotile_speed_threshold: 0 }), '');
});

test('invalid numeric inputs and incompatible presets are rejected', () => {
  for (const override of [{ pixel_scale: '' }, { fps: NaN }, { dilution_factor: .5 }, { prog_linearity_threshold: 1.1 }, { immotile_speed_threshold: 26 }, { chamber_type: 'makler', chamber_depth: 20 }]) {
    assert.notEqual(validateCalibration({ ...DEFAULT_CALIBRATION, ...override }), '');
  }
});

test('unavailable motility and motion stay N/A even with zero placeholders', () => {
  const data = { summary: { motility_available: false, progressive_percent: 0 }, motion: { average_speed: 0 } };
  assert.equal(formatMotility(data, 'progressive_percent'), 'N/A');
  assert.equal(formatMotion(data, 'average_speed'), 'N/A');
});

test('measured zero remains a valid result and LIN converts to percent', () => {
  const data = { summary: { motility_available: true, progressive_percent: 0 }, motion: { average_speed: 0, average_linearity: .8 } };
  assert.equal(formatMotility(data, 'progressive_percent'), '0.0%');
  assert.equal(formatMotion(data, 'average_speed'), '0.0');
  assert.equal(formatMotion(data, 'average_linearity', 100), '80.0');
});

test('API validation errors are readable', () => {
  assert.equal(getErrorMessage({ response: { data: { detail: [{ msg: 'Skala salah' }, { msg: 'FPS salah' }] } } }), 'Skala salah; FPS salah');
});
