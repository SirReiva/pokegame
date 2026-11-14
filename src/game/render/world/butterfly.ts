/** Mariposas del claro feérico: estado, matrices y animación. */

import * as pc from 'playcanvas';
import { randomPointInZone, type TerrainZone } from '../../terrain';

/** Lote instanciado de mariposas: cuerpo y las dos alas comparten índices. */
export interface ButterflyBatch {
  body: Float32Array;
  right: Float32Array;
  left: Float32Array;
  bodyBuffer: pc.VertexBuffer;
  rightBuffer: pc.VertexBuffer;
  leftBuffer: pc.VertexBuffer;
}

export interface Butterfly {
  batch: ButterflyBatch;
  /** Índice dentro de los buffers del lote. */
  index: number;
  zone: TerrainZone;
  rand: () => number;
  target: pc.Vec3;
  x: number;
  y: number;
  z: number;
  scale: number;
  speed: number;
  flapSpeed: number;
  phase: number;
  yaw: number;
}

/** Matriz del cuerpo: traslación + giro en Y + escala no uniforme. */
export function writeButterflyBody(
  data: Float32Array,
  offset: number,
  butterfly: Butterfly,
  yawRadians: number
): void {
  const cos = Math.cos(yawRadians);
  const sin = Math.sin(yawRadians);
  const sx = 0.05 * butterfly.scale;
  const sy = 0.05 * butterfly.scale;
  const sz = 0.16 * butterfly.scale;
  // Columnas de Ry(yaw) * diag(sx, sy, sz).
  data[offset] = cos * sx;
  data[offset + 1] = 0;
  data[offset + 2] = -sin * sx;
  data[offset + 3] = 0;
  data[offset + 4] = 0;
  data[offset + 5] = sy;
  data[offset + 6] = 0;
  data[offset + 7] = 0;
  data[offset + 8] = sin * sz;
  data[offset + 9] = 0;
  data[offset + 10] = cos * sz;
  data[offset + 11] = 0;
  data[offset + 12] = butterfly.x;
  data[offset + 13] = butterfly.y;
  data[offset + 14] = butterfly.z;
  data[offset + 15] = 1;
}

/** Matriz del ala: traslación + giro en Y + aleteo en Z + escala uniforme. */
export function writeButterflyWing(
  data: Float32Array,
  offset: number,
  butterfly: Butterfly,
  yawRadians: number,
  flapRadians: number
): void {
  const cy = Math.cos(yawRadians);
  const sy = Math.sin(yawRadians);
  const cf = Math.cos(flapRadians);
  const sf = Math.sin(flapRadians);
  const scale = butterfly.scale;
  // Columnas de Ry(yaw) * Rz(flap) * scale.
  data[offset] = cy * cf * scale;
  data[offset + 1] = sf * scale;
  data[offset + 2] = -sy * cf * scale;
  data[offset + 3] = 0;
  data[offset + 4] = -cy * sf * scale;
  data[offset + 5] = cf * scale;
  data[offset + 6] = sy * sf * scale;
  data[offset + 7] = 0;
  data[offset + 8] = sy * scale;
  data[offset + 9] = 0;
  data[offset + 10] = cy * scale;
  data[offset + 11] = 0;
  data[offset + 12] = butterfly.x;
  data[offset + 13] = butterfly.y;
  data[offset + 14] = butterfly.z;
  data[offset + 15] = 1;
}

/**
 * Vuelo y aleteo. El movimiento sigue en CPU, pero las tres mallas de todas
 * las mariposas se dibujan con instancing: solo se suben sus matrices.
 */
export function updateButterflies(
  butterflies: Butterfly[],
  batches: ButterflyBatch[],
  dt: number
): void {
  for (const butterfly of butterflies) {
    const dx = butterfly.target.x - butterfly.x;
    const dy = butterfly.target.y - butterfly.y;
    const dz = butterfly.target.z - butterfly.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance < 0.25) {
      const [tx, tz] = randomPointInZone(butterfly.zone, butterfly.rand, 0.4);
      butterfly.target.set(tx, 0.5 + butterfly.rand() * 1.0, tz);
    } else if (distance > 0.0001) {
      const step = butterfly.speed * dt;
      butterfly.x += (dx / distance) * step;
      butterfly.y += (dy / distance) * step;
      butterfly.z += (dz / distance) * step;

      const targetYaw = Math.atan2(dx, dz) * (180 / Math.PI);
      let delta = targetYaw - butterfly.yaw;
      while (delta > 180) delta -= 360;
      while (delta < -180) delta += 360;
      butterfly.yaw += delta * Math.min(1, dt * 6);
    }
    butterfly.phase += dt * butterfly.flapSpeed;
    const flap = Math.sin(butterfly.phase) * 30;
    const yawRadians = (butterfly.yaw * Math.PI) / 180;
    const flapRadians = (flap * Math.PI) / 180;
    const offset = butterfly.index * 16;
    writeButterflyBody(butterfly.batch.body, offset, butterfly, yawRadians);
    writeButterflyWing(butterfly.batch.right, offset, butterfly, yawRadians, flapRadians);
    writeButterflyWing(butterfly.batch.left, offset, butterfly, yawRadians, -flapRadians);
  }
  for (const batch of batches) {
    batch.bodyBuffer.setData(batch.body);
    batch.rightBuffer.setData(batch.right);
    batch.leftBuffer.setData(batch.left);
  }
}
