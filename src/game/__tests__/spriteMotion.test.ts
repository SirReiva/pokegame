import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rowGroundMotion } from '../spriteMotion.ts';

const CAMERA = { toCamX: 0, toCamZ: 1 };

function motion(
  row: number,
  pixelX: number,
  pixelY: number
): { x: number; z: number } {
  return rowGroundMotion({
    ...CAMERA,
    row,
    pixelX,
    pixelY,
    pixelScale: 1,
    verticalScale: 1
  });
}

function close(actual: number, expected: number): void {
  assert.ok(
    Math.abs(actual - expected) < 1e-6,
    `${actual} != ${expected}`
  );
}

function assertMotion(
  row: number,
  pixelX: number,
  pixelY: number,
  expectedX: number,
  expectedZ: number
): void {
  const result = motion(row, pixelX, pixelY);
  close(result.x, expectedX);
  close(result.z, expectedZ);
}

test('la sombra sigue las 8 direcciones de la fila visible', () => {
  // row 0: hacia la cámara; row 2: derecha; row 4: fondo; row 6: izquierda.
  assertMotion(0, 0, 10, 0, 10);
  assertMotion(2, 10, 0, 10, 0);
  assertMotion(4, 0, -10, 0, -10);
  assertMotion(6, -10, 0, -10, 0);

  // Diagonales.
  assertMotion(1, 10, 10, 10, 10);
  assertMotion(3, 10, -10, 10, -10);
  assertMotion(5, -10, -10, -10, -10);
  assertMotion(7, -10, 10, -10, 10);
});

test('la dirección se ajusta a la fila aunque el delta sea solo horizontal', () => {
  // En una fila diagonal, el desplazamiento no se cuela como lateral puro:
  // se proyecta sobre la diagonal de 45 grados.
  const diagonal = motion(1, 10, 0);
  close(diagonal.x, 5);
  close(diagonal.z, 5);
});

test('el avance puede ser negativo', () => {
  assertMotion(0, 0, -10, 0, -10);
});
