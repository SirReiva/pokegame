import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aimYawFromInput } from '../player';

/** Compara dos rumbos teniendo en cuenta el salto de −π a π. */
function assertYaw(actual: number | null, expected: number): void {
  assert.notEqual(actual, null);
  const delta = Math.atan2(
    Math.sin((actual as number) - expected),
    Math.cos((actual as number) - expected)
  );
  assert.ok(Math.abs(delta) < 1e-9, `esperado ${expected}, recibido ${actual}`);
}

test('el stick centrado no apunta y deja mandar a la mirada del cuerpo', () => {
  assert.equal(aimYawFromInput(0, 0, 0), null);
});

test('con la cámara sin girar, el stick derecho apunta en el mundo', () => {
  // La cámara mira hacia −Z con yaw 0.
  assertYaw(aimYawFromInput(0, 0, 1), Math.PI);
  assertYaw(aimYawFromInput(0, 1, 0), Math.PI / 2);
  assertYaw(aimYawFromInput(0, 0, -1), 0);
  assertYaw(aimYawFromInput(0, -1, 0), -Math.PI / 2);
});

test('el apuntado gira con la cámara', () => {
  assertYaw(aimYawFromInput(Math.PI / 2, 0, 1), -Math.PI / 2);
  assertYaw(aimYawFromInput(Math.PI / 2, 1, 0), Math.PI);
  assertYaw(aimYawFromInput(Math.PI, 0, 1), 0);
  assertYaw(aimYawFromInput(Math.PI, 1, 0), -Math.PI / 2);
});

test('la inclinación del stick solo cambia el rumbo, no la distancia', () => {
  assertYaw(aimYawFromInput(0, 0.2, 0.2), aimYawFromInput(0, 1, 1) as number);
});
