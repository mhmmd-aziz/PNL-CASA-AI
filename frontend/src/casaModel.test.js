import test from 'node:test';
import assert from 'node:assert/strict';
import { PARTS, STAGE_TITLES, SIM_THRESHOLDS } from './casaModel/parts.js';
import { DEFAULT_CALIBRATION, CHAMBER_DEPTHS } from './calibration.js';

const TEXT_FIELDS = ['name', 'short', 'cat', 'sub', 'f', 's', 'l', 'p', 'd'];
const byId = Object.fromEntries(PARTS.map((part) => [part.id, part]));
const comma = (value) => String(value).replace('.', ',');

test('every part has an unique id, a known kind, and non-empty text', () => {
  assert.equal(new Set(PARTS.map((part) => part.id)).size, PARTS.length);
  for (const part of PARTS) {
    assert.ok(['obj', 'stage', 'pivot'].includes(part.kind), part.id);
    assert.match(part.c, /^#[0-9A-Fa-f]{6}$/, part.id);
    for (const field of TEXT_FIELDS) {
      assert.equal(typeof part[field], 'string', `${part.id}.${field}`);
      assert.ok(part[field].trim().length > 0, `${part.id}.${field}`);
    }
  }
});

test('analysis stages are numbered 0..5 and have a screen title each', () => {
  const stages = PARTS.filter((part) => part.kind === 'stage').map((part) => part.stage).sort();
  assert.deepEqual(stages, [0, 1, 2, 3, 4, 5]);
  assert.equal(STAGE_TITLES.length, 6);
});

test('text contains no emoji and no claims the application does not make', () => {
  const banned = [/cluster/i, /debris/i, /VISEM/i, /DeepSORT/i, /TMSC/i, /normozoospermia/i, /oligozoospermia/i, /asthenozoospermia/i, /ISO 15189/i, /HIPAA/i, /AES-256/i, /multi-FOV/i, /leukosit/i];
  for (const part of PARTS) {
    const text = TEXT_FIELDS.map((field) => part[field]).join(' ');
    assert.doesNotMatch(text, /\p{Extended_Pictographic}/u, part.id);
    for (const pattern of banned) assert.doesNotMatch(text, pattern, `${part.id} ${pattern}`);
  }
});

test('simulation thresholds equal the application defaults', () => {
  assert.equal(SIM_THRESHOLDS.progSpeed, DEFAULT_CALIBRATION.prog_speed_threshold);
  assert.equal(SIM_THRESHOLDS.progLinearity, DEFAULT_CALIBRATION.prog_linearity_threshold);
  assert.equal(SIM_THRESHOLDS.immotileSpeed, DEFAULT_CALIBRATION.immotile_speed_threshold);
  assert.equal(SIM_THRESHOLDS.minObservations, 15);
});

test('motility and chamber text quote the real defaults', () => {
  const motility = byId.motilitas.p;
  assert.ok(motility.includes(`VCL ≥ ${DEFAULT_CALIBRATION.prog_speed_threshold} µm/s`));
  assert.ok(motility.includes(`LIN ≥ ${comma(DEFAULT_CALIBRATION.prog_linearity_threshold)}`));
  assert.ok(motility.includes(`VCL < ${DEFAULT_CALIBRATION.immotile_speed_threshold} µm/s`));
  assert.ok(byId.lacak.s.includes(`${SIM_THRESHOLDS.minObservations} pengamatan`));
  assert.ok(byId.stage.s.includes(`Makler ${CHAMBER_DEPTHS.makler} µm`));
  assert.ok(byId.stage.s.includes(`Leja ${CHAMBER_DEPTHS.leja} µm`));
  assert.ok(byId.stage.s.includes(`Improved Neubauer ${CHAMBER_DEPTHS.neubauer} µm`));
});

test('object parts have anchors and offsets, and the 3D cell model is fully described', () => {
  for (const part of PARTS.filter((item) => item.kind === 'obj')) {
    assert.equal(part.a.length, 3, `${part.id}.a`);
    assert.equal(part.off.length, 3, `${part.id}.off`);
  }
  const cell = byId.sel;
  assert.equal(cell.model, true);
  assert.equal(cell.pos.length, 3);
  for (const field of ['length', 'tilt', 'endScale']) assert.equal(typeof cell[field], 'number', field);
  assert.ok(cell.length > 0 && cell.endScale > 0 && cell.endScale <= 1);
});
