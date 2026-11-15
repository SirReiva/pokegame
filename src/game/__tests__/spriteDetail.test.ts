import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSmallViewport,
  spriteOutlineWidth,
  type SpriteOutlineSource
} from '../spriteDetail.ts';
import { viewportHeightPx } from '../multiplayer.ts';
import { CONFIG } from '../config.ts';

/** Aspecto mínimo: solo el `idle` que mira el cálculo del contorno. */
function assetWithHeight(height: number): SpriteOutlineSource {
  return {
    skin: {
      animations: {
        idle: { frameHeight: height, content: null }
      }
    }
  } as unknown as SpriteOutlineSource;
}

test('el alto de viewport reparte el canvas entre las filas del layout', () => {
  // Dos vistas se reparten en columnas (una sola fila): mismo alto.
  assert.equal(viewportHeightPx(1080, 1, 1), 1080);
  assert.equal(viewportHeightPx(1080, 1, 2), 1080);
  // Ocho vistas van en dos filas de cuatro: la mitad de alto cada una.
  assert.equal(viewportHeightPx(1080, 1, 8), 540);
});

test('el alto de viewport aplica el mismo tope de DPR que la partida', () => {
  // Con más de 4 vistas el DPR se limita a `manyViews` (1,2).
  const many = viewportHeightPx(1080, 3, 8);
  assert.equal(many, 1080 * CONFIG.performance.matchPixelRatio.manyViews * 0.5);
  // Con 1 vista el tope es `default` (1,5), así que un DPR de 2 recorta.
  assert.equal(viewportHeightPx(1080, 2, 1), 1080 * CONFIG.performance.matchPixelRatio.default);
});

test('sin altura fiable no hay viewport que medir', () => {
  assert.equal(viewportHeightPx(0, 1, 8), 0);
  assert.equal(viewportHeightPx(Number.NaN, 1, 8), 0);
});

test('el detalle reducido se activa solo por debajo del umbral', () => {
  const threshold = CONFIG.sprite.smallViewportPx;
  assert.equal(isSmallViewport(threshold), false);
  assert.equal(isSmallViewport(threshold - 1), true);
  assert.equal(isSmallViewport(0), false);
});

test('el contorno crece con el sprite y tiene un mínimo', () => {
  const small = spriteOutlineWidth(assetWithHeight(40), 1080);
  const large = spriteOutlineWidth(assetWithHeight(120), 1080);
  assert.ok(small > 0);
  assert.ok(large > small);
  // Por debajo del mínimo todas las especies diminutas comparten grosor.
  assert.equal(
    spriteOutlineWidth(assetWithHeight(4), 1080),
    spriteOutlineWidth(assetWithHeight(10), 1080)
  );
});

test('en viewports pequeños el contorno se engorda', () => {
  const asset = assetWithHeight(80);
  const normal = spriteOutlineWidth(asset, 1080);
  const tiny = spriteOutlineWidth(asset, CONFIG.sprite.smallViewportPx - 1);
  assert.ok(tiny > normal);
  assert.ok(tiny / normal < 1.5);
});

test('sin altura de viewport se usa el grosor normal', () => {
  const asset = assetWithHeight(80);
  assert.equal(
    spriteOutlineWidth(asset, 0),
    spriteOutlineWidth(asset, 1080)
  );
});
