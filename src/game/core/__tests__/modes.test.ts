import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultModeSettings,
  modeScoreTarget,
  normalizeModeSettings
} from '../../modes.ts';

test('defaultModeSettings devuelve los valores declarados por el modo', () => {
  const tdm = defaultModeSettings('tdm');
  assert.equal(typeof tdm.koTarget, 'number');

  const koth = defaultModeSettings('koth');
  assert.equal(koth.scoreTarget, 100);
  assert.equal(koth.zoneRadius, 4.5);
  assert.equal(koth.zoneMovement, 'static');
});

test('normalizeModeSettings conserva valores válidos y corrige el resto', () => {
  const valid = normalizeModeSettings('koth', {
    scoreTarget: 150,
    zoneRadius: 6,
    zoneMovement: 'mobile'
  });
  assert.deepEqual(valid, {
    scoreTarget: 150,
    zoneRadius: 6,
    zoneMovement: 'mobile'
  });

  const invalid = normalizeModeSettings('koth', {
    scoreTarget: 999,
    zoneRadius: 99,
    zoneMovement: 'teleport'
  });
  assert.equal(invalid.scoreTarget, 100);
  assert.equal(invalid.zoneRadius, 4.5);
  assert.equal(invalid.zoneMovement, 'static');
});

test('modeScoreTarget lee el ajuste validado', () => {
  assert.equal(modeScoreTarget('tdm', { koTarget: 30 }), 30);
  assert.equal(modeScoreTarget('koth', { scoreTarget: 150 }), 150);
  assert.ok((modeScoreTarget('tdm', undefined) ?? 0) > 0);
  assert.ok((modeScoreTarget('koth', undefined) ?? 0) > 0);
});
