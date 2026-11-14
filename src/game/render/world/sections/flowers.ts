/** Sección del generador de mundo. */

import * as pc from 'playcanvas';
import { zoneCenter } from '../../../terrain';
import type { WorldBuildContext } from '../context';
import { buildInstancedFoliage, createWindMaterial } from '../foliage';
import { random } from '../random';
import { zoneEmitterExtents } from '../worldParts';

export function* buildFlowers(ctx: WorldBuildContext): Generator<number, void, void> {
  const { device, terrainZones, particles } = ctx;
  yield 1;
  // --- Claro feérico: flores 3D ---------------------------------------------
  // Misma técnica que la hierba alta, pero con flores: cada mata es una malla
  // de tallos, hojas y corolas de 5-6 pétalos con el corazón amarillo. Todo va
  // por color de vértice, sin texturas ni recortes alfa, así que las flores
  // tienen volumen desde cualquier ángulo. También van instanciadas y con el
  // viento resuelto en el vertex shader.
  const flowerMaterial = createWindMaterial(ctx, '#3a2a33', 0.18, 1.05, 5);

  /** Corolas: rosa, lila, blanco, amarillo pálido, rosa fuerte y azul cielo. */
  const BLOOM_COLORS: Array<[number, number, number]> = [
    [0.96, 0.62, 0.77],
    [0.87, 0.76, 0.97],
    [0.99, 0.97, 1],
    [1, 0.89, 0.55],
    [0.93, 0.47, 0.64],
    [0.68, 0.82, 0.99]
  ];
  const STEM_BASE: [number, number, number] = [0.09, 0.2, 0.08];
  const STEM_TOP: [number, number, number] = [0.23, 0.44, 0.16];
  const LEAF_COLOR: [number, number, number] = [0.2, 0.4, 0.14];
  const HEART_COLOR: [number, number, number] = [1, 0.82, 0.36];

  const buildFlowerCluster = (seed: number, flowerCount: number): pc.Mesh => {
    const rand = random(seed);
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const push = (
      x: number,
      y: number,
      z: number,
      nx: number,
      ny: number,
      nz: number,
      color: [number, number, number]
    ) => {
      positions.push(x, y, z);
      normals.push(nx, ny, nz);
      colors.push(color[0], color[1], color[2], 1);
    };

    /** Dos triángulos por cuadrilátero, en el orden en que se empujaron. */
    const quad = (start: number) => {
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    };

    for (let f = 0; f < flowerCount; f++) {
      const fx = (rand() - 0.5) * 0.62;
      const fz = (rand() - 0.5) * 0.62;
      const height = 0.26 + rand() * 0.34;
      const leanAngle = rand() * Math.PI * 2;
      const lean = 0.02 + rand() * 0.08;
      const tipX = fx + Math.cos(leanAngle) * lean;
      const tipZ = fz + Math.sin(leanAngle) * lean;

      // Tallo: dos cintas verticales cruzadas para que tenga volumen.
      const stemWidth = 0.013 + rand() * 0.008;
      for (let cross = 0; cross < 2; cross++) {
        const across = leanAngle + cross * (Math.PI / 2);
        const wx = Math.cos(across) * stemWidth;
        const wz = Math.sin(across) * stemWidth;
        const nx = -Math.sin(across);
        const nz = Math.cos(across);
        const start = positions.length / 3;
        push(fx - wx, 0, fz - wz, nx, 0, nz, STEM_BASE);
        push(fx + wx, 0, fz + wz, nx, 0, nz, STEM_BASE);
        push(tipX - wx * 0.7, height, tipZ - wz * 0.7, nx, 0, nz, STEM_TOP);
        push(tipX + wx * 0.7, height, tipZ + wz * 0.7, nx, 0, nz, STEM_TOP);
        quad(start);
      }

      // Tres hojas a media altura, casi horizontales y con la punta levantada.
      for (let leaf = 0; leaf < 3; leaf++) {
        const leafAngle = rand() * Math.PI * 2;
        const leafHeight = height * (0.28 + leaf * 0.18 + rand() * 0.1);
        const cx = fx + (tipX - fx) * (leafHeight / height);
        const cz = fz + (tipZ - fz) * (leafHeight / height);
        const dx = Math.cos(leafAngle);
        const dz = Math.sin(leafAngle);
        const px = -dz;
        const pz = dx;
        const reach = 0.05 + rand() * 0.05;
        const lift = 0.02 + rand() * 0.025;
        const start = positions.length / 3;
        push(cx - px * 0.006, leafHeight, cz - pz * 0.006, 0, 1, 0, LEAF_COLOR);
        push(cx + px * 0.006, leafHeight, cz + pz * 0.006, 0, 1, 0, LEAF_COLOR);
        push(
          cx + dx * reach + px * 0.022,
          leafHeight + lift,
          cz + dz * reach + pz * 0.022,
          0,
          1,
          0,
          LEAF_COLOR
        );
        push(
          cx + dx * reach - px * 0.022,
          leafHeight + lift,
          cz + dz * reach - pz * 0.022,
          0,
          1,
          0,
          LEAF_COLOR
        );
        quad(start);
      }

      // Corola: pétalos repartidos en abanico alrededor del extremo del tallo.
      const bloom = BLOOM_COLORS[Math.floor(rand() * BLOOM_COLORS.length)];
      const petals = 5 + Math.floor(rand() * 2);
      const petalLength = 0.07 + rand() * 0.04;
      const rotation = rand() * Math.PI * 2;
      for (let p = 0; p < petals; p++) {
        const angle = rotation + (p / petals) * Math.PI * 2;
        const dx = Math.cos(angle);
        const dz = Math.sin(angle);
        const px = -dz;
        const pz = dx;
        const tint = 0.88 + rand() * 0.18;
        const color: [number, number, number] = [
          bloom[0] * tint,
          bloom[1] * tint,
          bloom[2] * tint
        ];
        const ix = tipX + dx * 0.018;
        const iz = tipZ + dz * 0.018;
        const ox = tipX + dx * (0.018 + petalLength);
        const oz = tipZ + dz * (0.018 + petalLength);
        const innerWidth = 0.007;
        const outerWidth = 0.02 + rand() * 0.012;
        const lift = 0.01 + rand() * 0.012;
        const start = positions.length / 3;
        push(ix - px * innerWidth, height, iz - pz * innerWidth, 0, 1, 0, color);
        push(ix + px * innerWidth, height, iz + pz * innerWidth, 0, 1, 0, color);
        push(
          ox + px * outerWidth,
          height + lift,
          oz + pz * outerWidth,
          0,
          1,
          0,
          color
        );
        push(
          ox - px * outerWidth,
          height + lift,
          oz - pz * outerWidth,
          0,
          1,
          0,
          color
        );
        quad(start);
      }

      // Corazón de la flor, un rombo plano por encima de los pétalos.
      const heartY = height + 0.016;
      const heart = 0.026;
      const start = positions.length / 3;
      push(tipX - heart, heartY, tipZ, 0, 1, 0, HEART_COLOR);
      push(tipX, heartY, tipZ - heart, 0, 1, 0, HEART_COLOR);
      push(tipX + heart, heartY, tipZ, 0, 1, 0, HEART_COLOR);
      push(tipX, heartY, tipZ + heart, 0, 1, 0, HEART_COLOR);
      quad(start);
    }

    const mesh = new pc.Mesh(device);
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setColors(colors);
    mesh.setIndices(indices);
    mesh.update();
    return mesh;
  };

  const flowerClusterMeshes = [0, 1, 2, 3, 4].map((variant) =>
    buildFlowerCluster(0x2f7a + variant * 4129, 7)
  );

  const fairyZones = terrainZones.filter((zone) => zone.terrain === 'fairy');
  yield* buildInstancedFoliage(ctx, {
    label: 'fairy-flowers',
    zones: fairyZones,
    meshes: flowerClusterMeshes,
    material: flowerMaterial,
    density: 2.6,
    seed: 0x4f1e,
    scaleMin: 0.95,
    scaleMax: 1.5,
    strengthMin: 0.45,
    strengthMax: 0.8,
    phaseX: 0.5,
    phaseZ: 0.35,
    phaseJitter: 1.6
  });

  // Polen del claro feérico: motas doradas diminutas que flotan entre las
  // flores, derivan despacio y titilan. Aditivas y pequeñas, para que se lean
  // como polen mágico y no como chispas ni como polvo.
  fairyZones.forEach((zone, zoneIndex) => {
    const [pollenX, pollenZ] = zoneCenter(zone);
    particles.emit(
      'pollen',
      [pollenX, 0.65, pollenZ],
      zoneEmitterExtents(zone, 1.7, 1.1),
      64,
      0x4f1e + zoneIndex * 2749
    );
  });
  ctx.flowerClusterMeshes = flowerClusterMeshes;
  ctx.fairyZones = fairyZones;
}
