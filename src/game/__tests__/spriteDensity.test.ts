import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spriteDensityScale } from '../spriteDensity.ts';

const desktop = {
  cssHeight: 1080,
  devicePixelRatio: 1,
  maxScale: 4
};

test('una o dos vistas conservan la escala completa', () => {
  assert.equal(spriteDensityScale({ ...desktop, humanCount: 1 }), 4);
  assert.equal(spriteDensityScale({ ...desktop, humanCount: 2 }), 4);
});

test('cuatro vistas bajan a ×2', () => {
  assert.equal(spriteDensityScale({ ...desktop, humanCount: 4 }), 2);
});

test('ocho vistas bajan a ×2 en 1080p, también con DPR alto', () => {
  assert.equal(spriteDensityScale({ ...desktop, humanCount: 8 }), 2);
  assert.equal(
    spriteDensityScale({ ...desktop, humanCount: 8, devicePixelRatio: 2 }),
    2
  );
});

test('ocho vistas en una ventana pequeña bajan a ×1', () => {
  assert.equal(
    spriteDensityScale({ ...desktop, humanCount: 8, cssHeight: 720 }),
    1
  );
});

test('el techo del modo de filtrado manda por encima de la densidad', () => {
  assert.equal(
    spriteDensityScale({ ...desktop, humanCount: 1, maxScale: 2 }),
    2
  );
  assert.equal(
    spriteDensityScale({ ...desktop, humanCount: 1, maxScale: 1 }),
    1
  );
});

test('nunca baja de ×1 ni pasa de ×4', () => {
  const tiny = spriteDensityScale({
    ...desktop,
    humanCount: 8,
    cssHeight: 200,
    devicePixelRatio: 1
  });
  assert.equal(tiny, 1);

  const huge = spriteDensityScale({
    ...desktop,
    humanCount: 1,
    cssHeight: 2160
  });
  assert.equal(huge, 4);
});

test('la densidad no crece al añadir vistas', () => {
  const scales = [1, 2, 3, 4, 5, 6, 7, 8].map((humanCount) =>
    spriteDensityScale({ ...desktop, humanCount })
  );
  for (let index = 1; index < scales.length; index++) {
    assert.ok(
      scales[index] <= scales[index - 1],
      `subió de ${scales[index - 1]} a ${scales[index]}`
    );
  }
});

test('sin altura fiable devuelve el techo del modo de filtrado', () => {
  assert.equal(
    spriteDensityScale({ ...desktop, humanCount: 8, cssHeight: 0 }),
    4
  );
});
