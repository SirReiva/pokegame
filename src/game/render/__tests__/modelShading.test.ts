import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as pc from 'playcanvas';
import {
  applyModelShading,
  DesaturationState
} from '../modelShading.ts';

test('desatura los materiales de modelo en GLSL y WGSL', () => {
  const material = new pc.StandardMaterial();
  applyModelShading(material);

  for (const language of [pc.SHADERLANGUAGE_GLSL, pc.SHADERLANGUAGE_WGSL]) {
    const emissive = material.getShaderChunks(language).get('emissivePS') ?? '';
    assert.match(emissive, /uDesaturate/);
    assert.match(emissive, /litArgs_albedo/);
    assert.match(emissive, /emissionLuminance/);
  }
  const parameter = material.getParameter('uDesaturate') as { data?: unknown };
  assert.equal(parameter.data, 0);
});

test('ignora materiales que no son StandardMaterial', () => {
  const material = new pc.ShaderMaterial();
  assert.doesNotThrow(() => applyModelShading(material));
  assert.equal(material.getParameter('uDesaturate'), undefined);
});

test('no vuelve a modificar un material ya configurado', () => {
  const material = new pc.StandardMaterial();
  applyModelShading(material);
  const original = material.getShaderChunks(pc.SHADERLANGUAGE_GLSL).get('emissivePS');

  applyModelShading(material);

  assert.equal(material.getShaderChunks(pc.SHADERLANGUAGE_GLSL).get('emissivePS'), original);
});

test('el gris del KO se interpola y el respawn restaura el color de golpe', () => {
  const state = new DesaturationState();

  // Morir solo fija el objetivo: el clip `faint` se ve apagarse.
  assert.equal(state.request(1), false);
  assert.equal(state.value, 0);
  assert.equal(state.step(1 / 60), true);
  assert.ok(state.value > 0 && state.value < 1);

  // Revivir vuelve al color en el mismo frame, sin un frame gris.
  assert.equal(state.request(0), true);
  assert.equal(state.value, 0);
  assert.equal(state.step(1 / 60), false);
});

test('el gris converge al objetivo y deja de subir el uniform', () => {
  const state = new DesaturationState();
  state.request(1);
  for (let i = 0; i < 120; i++) state.step(1 / 60);

  assert.equal(state.value, 1);
  assert.equal(state.step(1 / 60), false);
  assert.equal(state.request(1), false);
});

test('el objetivo se recorta a [0, 1]', () => {
  const state = new DesaturationState();
  state.request(4);
  for (let i = 0; i < 120; i++) state.step(1 / 60);
  assert.equal(state.value, 1);

  state.request(-2);
  assert.equal(state.value, 0);
});
