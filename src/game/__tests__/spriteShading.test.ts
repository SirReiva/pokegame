import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as pc from 'playcanvas';
import { applySpriteShading } from '../spriteOutline.ts';

function chunks(material: pc.StandardMaterial, language: 'glsl' | 'wgsl') {
  const code =
    language === 'glsl'
      ? pc.SHADERLANGUAGE_GLSL
      : pc.SHADERLANGUAGE_WGSL;
  return material.getShaderChunks(code);
}

/**
 * El gris del KO y el contorno comparten `emissivePS`: si una variante pisara a
 * la otra, el borde de equipo o la desaturación desaparecerían sin error.
 */
test('el sprite sin contorno desatura y no paga la dilatación de alfa', () => {
  const material = new pc.StandardMaterial();
  applySpriteShading(material, null);

  for (const language of ['glsl', 'wgsl'] as const) {
    const map = chunks(material, language);
    const emissive = map.get('emissivePS') ?? '';
    assert.match(emissive, /uDesaturate/);
    assert.doesNotMatch(emissive, /uOutlineColor|pcOutlineRim/);
    // Sin borde no se sustituye `alphaTestPS`: se mantiene el recorte barato
    // de una sola muestra.
    assert.equal(map.get('alphaTestPS'), undefined);
  }
});

test('el sprite con contorno desatura el cuerpo y conserva el borde de color', () => {
  const material = new pc.StandardMaterial();
  applySpriteShading(material, [255, 0, 0]);

  for (const language of ['glsl', 'wgsl'] as const) {
    const map = chunks(material, language);
    const emissive = map.get('emissivePS') ?? '';
    assert.match(emissive, /uDesaturate/);
    assert.match(emissive, /uOutlineColor/);
    // El tinte del contorno se aplica después del gris: el borde sigue siendo
    // del color del equipo, no gris.
    const desaturatedAt = emissive.indexOf('luminance');
    const outlineAt = emissive.indexOf('pcOutlineRim');
    assert.ok(desaturatedAt >= 0 && desaturatedAt < outlineAt);
    assert.ok(map.get('alphaTestPS'));
  }
});
