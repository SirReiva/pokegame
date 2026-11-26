import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as pc from 'playcanvas';
import { applyModelShading } from '../modelShading.ts';

test('desatura los materiales de modelo en GLSL y WGSL', () => {
  const material = new pc.StandardMaterial();
  applyModelShading(material);

  for (const language of [pc.SHADERLANGUAGE_GLSL, pc.SHADERLANGUAGE_WGSL]) {
    const emissive = material.getShaderChunks(language).get('emissivePS') ?? '';
    assert.match(emissive, /uDesaturate/);
    assert.match(emissive, /litArgs_albedo/);
    assert.match(emissive, /emissionLuminance/);
  }
  assert.ok(material.getParameter('uDesaturate'));
});

test('no vuelve a modificar un material ya configurado', () => {
  const material = new pc.StandardMaterial();
  applyModelShading(material);
  const original = material.getShaderChunks(pc.SHADERLANGUAGE_GLSL).get('emissivePS');

  applyModelShading(material);

  assert.equal(material.getShaderChunks(pc.SHADERLANGUAGE_GLSL).get('emissivePS'), original);
});
