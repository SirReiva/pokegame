import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateMaterialIfChanged } from '../render/fx/materialUpdates.ts';

/** Material mínimo: solo los campos que anima el runtime de efectos. */
function makeMaterial() {
  const material = {
    opacity: 1,
    emissive: { r: 1, g: 1, b: 1 },
    emissiveIntensity: 1,
    updates: 0,
    update(): void {
      material.updates++;
    }
  };
  return material;
}

test('un material sin cambios no se vuelve a subir', () => {
  const material = makeMaterial();

  assert.equal(updateMaterialIfChanged(material), true);
  assert.equal(updateMaterialIfChanged(material), false);
  assert.equal(updateMaterialIfChanged(material), false);
  assert.equal(material.updates, 1);
});

test('la opacidad animada sube el material solo cuando cambia de verdad', () => {
  const material = makeMaterial();

  material.opacity = 0.5;
  assert.equal(updateMaterialIfChanged(material), true);
  // Asignar el mismo valor no debe repetir el trabajo.
  material.opacity = 0.5;
  assert.equal(updateMaterialIfChanged(material), false);
  material.opacity = 0.25;
  assert.equal(updateMaterialIfChanged(material), true);
  assert.equal(material.updates, 2);
});

test('el tinte emisivo también dispara la actualización', () => {
  const material = makeMaterial();

  updateMaterialIfChanged(material);
  material.emissive.r = 0.2;
  assert.equal(updateMaterialIfChanged(material), true);
  material.emissive.g = 0.3;
  assert.equal(updateMaterialIfChanged(material), true);
  material.emissive.b = 0.4;
  assert.equal(updateMaterialIfChanged(material), true);
  assert.equal(updateMaterialIfChanged(material), false);
  assert.equal(material.updates, 4);
});

test('la intensidad emisiva se sigue igual', () => {
  const material = makeMaterial();

  updateMaterialIfChanged(material);
  material.emissiveIntensity = 1.2;
  assert.equal(updateMaterialIfChanged(material), true);
  assert.equal(updateMaterialIfChanged(material), false);
  assert.equal(material.updates, 2);
});

test('cada material lleva su propio seguimiento', () => {
  const first = makeMaterial();
  const second = makeMaterial();

  updateMaterialIfChanged(first);
  updateMaterialIfChanged(second);
  first.opacity = 0.4;
  assert.equal(updateMaterialIfChanged(first), true);
  assert.equal(updateMaterialIfChanged(second), false);
  assert.equal(first.updates, 2);
  assert.equal(second.updates, 1);
});
