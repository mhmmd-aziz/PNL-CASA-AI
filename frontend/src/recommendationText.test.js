import test from 'node:test';
import assert from 'node:assert/strict';
import { numberedList } from './recommendationText.js';

test('recommendations become a numbered list with one item per line', () => {
  assert.equal(numberedList(['Satu.', 'Dua.']), '1. Satu.\n2. Dua.');
  assert.equal(numberedList([]), '');
});
