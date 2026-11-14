/** Rayos del páramo: malla procedural, estado y animación por frame. */

import * as pc from 'playcanvas';
import { randomPointInZone, type TerrainZone } from '../../terrain';
import { random } from './random';

export interface LightningStrike {
  zone: TerrainZone;
  rand: () => number;
  bolt: pc.Entity;
  material: pc.StandardMaterial;
  light: pc.Entity;
  next: number;
  flash: number;
  flashDuration: number;
  seed: number;
}

/**
 * Rayo de malla pura con color por vértice, sin texturas, extendido en cintas
 * cruzadas para tener volumen desde cualquier ángulo de cámara.
 */
export function buildLightningMesh(device: pc.GraphicsDevice, seed: number): pc.Mesh {
  const rand = random(seed);
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const height = 4.2;

  const push = (
    x: number,
    y: number,
    z: number,
    color: [number, number, number]
  ) => {
    positions.push(x, y, z);
    normals.push(0, 1, 0);
    colors.push(color[0], color[1], color[2], 1);
  };

  /** Convierte una polilínea en una cinta luminosa fina, sin halo. */
  const ribbon = (path: Array<[number, number, number]>, scale: number) => {
    const layers: Array<{ width: number; color: [number, number, number] }> = [
      { width: 0.014, color: [0.9, 0.96, 1] }
    ];

    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      let dx = b[0] - a[0];
      let dy = b[1] - a[1];
      let dz = b[2] - a[2];
      const length = Math.hypot(dx, dy, dz) || 1;
      dx /= length;
      dy /= length;
      dz /= length;

      // Perpendicular horizontal y su ortogonal en el plano del tramo: las
      // dos cintas se cruzan, así que el rayo se lee desde cualquier giro de
      // cámara sin convertirse en una línea de canto.
      const plen = Math.hypot(-dz, dx) || 1;
      const px = -dz / plen;
      const pz = dx / plen;
      const qx = dy * pz;
      const qy = dz * px - dx * pz;
      const qz = -dy * px;

      for (const layer of layers) {
        const w = layer.width * scale;
        for (const [ox, oy, oz] of [
          [px, 0, pz],
          [qx, qy, qz]
        ]) {
          const start = positions.length / 3;
          push(a[0] - ox * w, a[1] - oy * w, a[2] - oz * w, layer.color);
          push(a[0] + ox * w, a[1] + oy * w, a[2] + oz * w, layer.color);
          push(b[0] + ox * w, b[1] + oy * w, b[2] + oz * w, layer.color);
          push(b[0] - ox * w, b[1] - oy * w, b[2] - oz * w, layer.color);
          indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
        }
      }
    }
  };

  // Tronco principal: cae desde 4,2 u con quiebros horizontales y termina
  // exactamente en el punto de impacto, que es donde se coloca la entidad.
  const main: Array<[number, number, number]> = [];
  const steps = 12;
  let x = 0;
  let z = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (i > 0 && i < steps) {
      x += (rand() - 0.5) * 0.55;
      z += (rand() - 0.5) * 0.55;
    }
    main.push([x, height * (1 - t), z]);
  }
  main[0] = [x * 0.5, height, z * 0.5];
  main[steps] = [0, 0, 0];
  ribbon(main, 1);

  // Rama lateral: sale de un quiebro alto y muere antes de tocar el suelo, así
  // que se lee como una bifurcación del rayo y no como un segundo impacto.
  const branchRoot = main[3 + Math.floor(rand() * 4)];
  const branch: Array<[number, number, number]> = [branchRoot];
  const branchAngle = rand() * Math.PI * 2;
  let bx = branchRoot[0];
  let bz = branchRoot[2];
  const branchSteps = 4 + Math.floor(rand() * 3);
  for (let i = 1; i <= branchSteps; i++) {
    const t = i / branchSteps;
    const spread = 0.18 + rand() * 0.22;
    bx += Math.cos(branchAngle) * spread + (rand() - 0.5) * 0.18;
    bz += Math.sin(branchAngle) * spread + (rand() - 0.5) * 0.18;
    branch.push([
      bx,
      Math.max(0.35, branchRoot[1] - t * (0.9 + rand() * 0.9)),
      bz
    ]);
  }
  ribbon(branch, 0.55);

  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setColors(colors);
  mesh.setIndices(indices);
  mesh.update();
  return mesh;
}

/**
 * Cuenta atrás hasta la descarga y, mientras dura, parpadeo rápido del rayo y
 * pulso de la luz azul. Todo se apaga al terminar el destello.
 */
export function updateLightning(
  strikes: LightningStrike[],
  meshes: pc.Mesh[],
  dt: number
): void {
  for (const strike of strikes) {
    if (strike.flash > 0) {
      strike.flash = Math.max(0, strike.flash - dt);
      const progress = 1 - strike.flash / strike.flashDuration;
      const flicker = Math.sin(progress * 62 + strike.seed) > -0.25 ? 0.9 : 0.18;
      const strobe = progress < 0.12 ? 1 : flicker;
      const fade = (1 - progress) * (1 - progress);
      const power = fade * strobe;

      strike.material.opacity = power;
      strike.material.update();

      const light = strike.light.light;
      if (light) light.intensity = 2.6 * power;

      if (strike.flash === 0) {
        strike.bolt.enabled = false;
        if (light) light.intensity = 0;
      }
    } else {
      strike.next -= dt;
      if (strike.next > 0) continue;

      const [x, z] = randomPointInZone(strike.zone, strike.rand, 0.32);
      strike.bolt.setLocalPosition(x, 0, z);
      strike.bolt.setLocalEulerAngles(0, strike.rand() * 360, 0);
      const instance = strike.bolt.render!.meshInstances[0];
      if (instance) {
        instance.mesh = meshes[Math.floor(strike.rand() * meshes.length)];
      }
      strike.bolt.enabled = true;

      strike.flashDuration = 0.5 + strike.rand() * 0.18;
      strike.flash = strike.flashDuration;
      strike.seed = strike.rand() * Math.PI * 2;
      strike.material.opacity = 1;
      strike.material.update();

      strike.light.setPosition(x, 1.6, z);
      strike.next = 3.2 + strike.rand() * 5.5;
    }
  }
}
