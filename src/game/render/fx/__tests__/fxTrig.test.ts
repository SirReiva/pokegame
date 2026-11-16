import assert from 'node:assert/strict';
import { test } from 'node:test';
import { polar } from '../fxTrig';

test('polar devuelve el coseno y el seno del mismo ángulo', () => {
  for (const angle of [0, Math.PI / 6, Math.PI / 2, 2.4, -1.1, Math.PI * 1.75]) {
    const { cos, sin } = polar(angle);
    assert.equal(cos, Math.cos(angle));
    assert.equal(sin, Math.sin(angle));
  }
});

test('polar mantiene la identidad trigonométrica en el círculo unidad', () => {
  const { cos, sin } = polar(1.234);
  assert.ok(Math.abs(cos * cos + sin * sin - 1) < 1e-12);
});

test('polar no comparte estado entre llamadas', () => {
  const first = polar(0.2);
  const second = polar(1.9);
  assert.notEqual(first.cos, second.cos);
  assert.notEqual(first.sin, second.sin);
});
