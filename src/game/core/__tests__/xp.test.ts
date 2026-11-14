import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  levelFromXp,
  xpForLevel,
  xpStatus,
  xpToNext,
  XP_MAX_LEVEL
} from '../../xp.ts';

test('xpForLevel reproduce los umbrales acumulados', () => {
  assert.equal(xpForLevel(1), 0);
  assert.equal(xpForLevel(2), 40);
  assert.equal(xpForLevel(3), 100);
  assert.equal(xpForLevel(XP_MAX_LEVEL), 1080);
});

test('levelFromXp respeta los límites de nivel', () => {
  assert.equal(levelFromXp(0), 1);
  assert.equal(levelFromXp(39), 1);
  assert.equal(levelFromXp(40), 2);
  assert.equal(levelFromXp(99), 2);
  assert.equal(levelFromXp(100), 3);
  assert.equal(levelFromXp(999_999), XP_MAX_LEVEL);
  assert.equal(levelFromXp(Number.NaN), 1);
});

test('xpStatus reparte la XP dentro del nivel', () => {
  const start = xpStatus(0);
  assert.equal(start.level, 1);
  assert.equal(start.toNext, 40);
  assert.equal(start.progress, 0);

  const half = xpStatus(20);
  assert.equal(half.level, 1);
  assert.equal(half.intoLevel, 20);
  assert.equal(half.progress, 0.5);

  const maxed = xpStatus(1_000_000);
  assert.equal(maxed.level, XP_MAX_LEVEL);
  assert.equal(maxed.maxed, true);
  assert.equal(maxed.toNext, 0);
  assert.equal(maxed.progress, 1);
});

test('xpToNext no crece por encima del nivel máximo', () => {
  assert.equal(xpToNext(1), 40);
  assert.equal(xpToNext(2), 60);
  assert.equal(xpToNext(XP_MAX_LEVEL), 0);
  assert.equal(xpToNext(XP_MAX_LEVEL + 5), 0);
});
