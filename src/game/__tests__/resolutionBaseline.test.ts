import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchResolutionBaseline } from '../multiplayer.ts';

test('1080p con DPR 1 conserva la resolución nativa', () => {
  assert.equal(matchResolutionBaseline(1, 1, 1920, 1080), 1);
});

test('4K baja al presupuesto sin pasar del mínimo de nitidez', () => {
  const ratio = matchResolutionBaseline(1, 1, 3840, 2160);
  assert.ok(ratio < 0.9);
  assert.ok(ratio >= 0.75);
});

test('el presupuesto no sube la resolución por encima del tope por DPR', () => {
  assert.equal(matchResolutionBaseline(2, 8, 1280, 720), 1.2);
});

test('sin medidas fiables se usa solo el tope por DPR', () => {
  assert.equal(matchResolutionBaseline(1.5, 1, 0, 0), 1.5);
});
