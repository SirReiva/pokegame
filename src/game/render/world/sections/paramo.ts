/** Sección del generador de mundo. */

import * as pc from 'playcanvas';
import type { WorldBuildContext } from '../context';
import {
  buildGrassCluster,
  buildInstancedFoliage,
  createWindMaterial,
  DRY_GRASS_PALETTE
} from '../foliage';
import { random } from '../random';

export function* buildParamo(ctx: WorldBuildContext): Generator<number, void, void> {
  const { device, terrainZones } = ctx;
  yield 1;
  // --- Páramo: frailejones y hierba seca 3D --------------------------------
  // Misma idea que la hierba y las flores, pero con la silueta del frailejón
  // (tronco leñoso corto y roseta de hojas lanceoladas plateadas) y matas de
  // hierba seca entre ellos. El color va por vértice, sin texturas ni recortes,
  // así que las plantas tienen volumen desde cualquier ángulo. También van
  // instanciadas y con el viento resuelto en el vertex shader.
  const paramoPlantMaterial = createWindMaterial(ctx, '#1c1408', 0.1, 0.85, 2);

  const TRUNK_BASE: [number, number, number] = [0.14, 0.11, 0.08];
  const TRUNK_TOP: [number, number, number] = [0.22, 0.18, 0.12];
  const LEAF_BASE: [number, number, number] = [0.4, 0.46, 0.34];
  const LEAF_INNER: [number, number, number] = [0.47, 0.53, 0.4];
  const LEAF_TIP: [number, number, number] = [0.85, 0.9, 0.8];
  const LEAF_BUD: [number, number, number] = [0.58, 0.66, 0.48];
  const SKIRT_BASE: [number, number, number] = [0.33, 0.27, 0.16];
  const SKIRT_TIP: [number, number, number] = [0.52, 0.44, 0.27];

  const buildShrubCluster = (seed: number, plants: number): pc.Mesh => {
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

    const quad = (start: number) => {
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    };

    /** Tronco leñoso: columna facetada, irregular y de color oscuro. */
    const trunk = (
      baseX: number,
      baseZ: number,
      height: number,
      radius: number,
      leanX: number,
      leanZ: number
    ) => {
      const sides = 7;
      const bands = 3;
      const rings: Array<Array<[number, number, number]>> = [];
      for (let b = 0; b <= bands; b++) {
        const t = b / bands;
        const cx = baseX + leanX * t;
        const cz = baseZ + leanZ * t;
        const ringRadius = radius * (1 - 0.3 * t);
        const ring: Array<[number, number, number]> = [];
        for (let s = 0; s < sides; s++) {
          const angle = (s / sides) * Math.PI * 2;
          const wobble = 0.9 + rand() * 0.2;
          ring.push([
            cx + Math.cos(angle) * ringRadius * wobble,
            height * t,
            cz + Math.sin(angle) * ringRadius * wobble
          ]);
        }
        rings.push(ring);
      }

      for (let b = 0; b < bands; b++) {
        for (let s = 0; s < sides; s++) {
          const next = (s + 1) % sides;
          const a = rings[b][s];
          const bPoint = rings[b][next];
          const c = rings[b + 1][next];
          const d = rings[b + 1][s];
          const ux = bPoint[0] - a[0];
          const uy = bPoint[1] - a[1];
          const uz = bPoint[2] - a[2];
          const vx = d[0] - a[0];
          const vy = d[1] - a[1];
          const vz = d[2] - a[2];
          let nx = uy * vz - uz * vy;
          let ny = uz * vx - ux * vz;
          let nz = ux * vy - uy * vx;
          const normalLength = Math.hypot(nx, ny, nz) || 1;
          nx /= normalLength;
          ny /= normalLength;
          nz /= normalLength;

          const t = (b + 0.5) / bands;
          const tint = 0.85 + rand() * 0.3;
          const color: [number, number, number] = [
            (TRUNK_BASE[0] + (TRUNK_TOP[0] - TRUNK_BASE[0]) * t) * tint,
            (TRUNK_BASE[1] + (TRUNK_TOP[1] - TRUNK_BASE[1]) * t) * tint,
            (TRUNK_BASE[2] + (TRUNK_TOP[2] - TRUNK_BASE[2]) * t) * tint
          ];

          const start = positions.length / 3;
          push(a[0], a[1], a[2], nx, ny, nz, color);
          push(bPoint[0], bPoint[1], bPoint[2], nx, ny, nz, color);
          push(c[0], c[1], c[2], nx, ny, nz, color);
          push(d[0], d[1], d[2], nx, ny, nz, color);
          quad(start);
        }
      }

      // Tapa superior, casi siempre tapada por la roseta.
      const topX = baseX + leanX;
      const topZ = baseZ + leanZ;
      for (let s = 0; s < sides; s++) {
        const next = (s + 1) % sides;
        const start = positions.length / 3;
        push(topX, height, topZ, 0, 1, 0, TRUNK_TOP);
        push(rings[bands][s][0], rings[bands][s][1], rings[bands][s][2], 0, 1, 0, TRUNK_TOP);
        push(
          rings[bands][next][0],
          rings[bands][next][1],
          rings[bands][next][2],
          0,
          1,
          0,
          TRUNK_TOP
        );
        indices.push(start, start + 1, start + 2);
      }
    };

    /** Hoja de la roseta: lanceolada, con codo y punta afilada. */
    const rosetteLeaf = (
      x: number,
      y: number,
      z: number,
      angle: number,
      elevation: number,
      length: number,
      width: number,
      colorIn: [number, number, number],
      colorTip: [number, number, number]
    ) => {
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      const sx = -dz;
      const sz = dx;
      const cosE = Math.cos(elevation);
      const dirX = dx * cosE;
      const dirY = Math.sin(elevation);
      const dirZ = dz * cosE;

      // Normal mixta: la del plano de la hoja, sesgada hacia arriba para que
      // la roseta blanca reciba luz de cielo.
      let nx = -sz * dirY;
      let ny = sz * dirX - sx * dirZ;
      let nz = sx * dirY;
      const normalLength = Math.hypot(nx, ny, nz) || 1;
      nx = (nx / normalLength) * 0.45;
      ny = (ny / normalLength) * 0.45 + 0.8;
      nz = (nz / normalLength) * 0.45;
      const blend = Math.hypot(nx, ny, nz) || 1;
      nx /= blend;
      ny /= blend;
      nz /= blend;

      const tint = 0.94 + rand() * 0.1;
      const inner: [number, number, number] = [
        colorIn[0] * tint,
        colorIn[1] * tint,
        colorIn[2] * tint
      ];
      const tip: [number, number, number] = [
        colorTip[0] * tint,
        colorTip[1] * tint,
        colorTip[2] * tint
      ];

      const midX = x + dirX * length * 0.55;
      const midY = y + dirY * length * 0.55;
      const midZ = z + dirZ * length * 0.55;
      const tipX = x + dirX * length;
      const tipY = y + dirY * length;
      const tipZ = z + dirZ * length;

      const start = positions.length / 3;
      push(x - sx * width, y, z - sz * width, nx, ny, nz, inner);
      push(x + sx * width, y, z + sz * width, nx, ny, nz, inner);
      push(midX - sx * width * 0.85, midY, midZ - sz * width * 0.85, nx, ny, nz, tip);
      push(midX + sx * width * 0.85, midY, midZ + sz * width * 0.85, nx, ny, nz, tip);
      push(tipX, tipY, tipZ, nx, ny, nz, tip);
      indices.push(
        start,
        start + 1,
        start + 2,
        start + 1,
        start + 3,
        start + 2,
        start + 2,
        start + 3,
        start + 4
      );
    };

    /** Roseta de frailejón: dos coronas, brote central y faldón seco. */
    const rosette = (x: number, y: number, z: number, scale: number) => {
      const outer = 11 + Math.floor(rand() * 3);
      for (let i = 0; i < outer; i++) {
        const angle = (i / outer) * Math.PI * 2 + rand() * 0.12;
        const reach = 0.03;
        rosetteLeaf(
          x + Math.cos(angle) * reach,
          y,
          z + Math.sin(angle) * reach,
          angle,
          0.12 + rand() * 0.35,
          (0.19 + rand() * 0.1) * scale,
          0.024 + rand() * 0.008,
          LEAF_BASE,
          LEAF_TIP
        );
      }

      const inner = 8 + Math.floor(rand() * 2);
      for (let i = 0; i < inner; i++) {
        const angle = (i / inner) * Math.PI * 2 + 0.35 + rand() * 0.15;
        rosetteLeaf(
          x,
          y,
          z,
          angle,
          0.5 + rand() * 0.45,
          (0.15 + rand() * 0.07) * scale,
          0.022 + rand() * 0.007,
          LEAF_INNER,
          LEAF_TIP
        );
      }

      const bud = 5;
      for (let i = 0; i < bud; i++) {
        const angle = (i / bud) * Math.PI * 2 + rand() * 0.3;
        rosetteLeaf(
          x,
          y + 0.005,
          z,
          angle,
          1.05 + rand() * 0.35,
          (0.07 + rand() * 0.05) * scale,
          0.014,
          LEAF_BUD,
          LEAF_TIP
        );
      }

      const skirt = 6 + Math.floor(rand() * 3);
      for (let i = 0; i < skirt; i++) {
        const angle = (i / skirt) * Math.PI * 2 + rand() * 0.2;
        rosetteLeaf(
          x,
          y - 0.02,
          z,
          angle,
          -0.2 - rand() * 0.5,
          (0.11 + rand() * 0.08) * scale,
          0.018,
          SKIRT_BASE,
          SKIRT_TIP
        );
      }
    };

    // Plantas del páramo: uno o dos frailejones por mata. Tronco leñoso corto
    // y roseta de hojas plateadas: la silueta es vertical, de frailejón, no de
    // arbusto redondeado ni de manojo de briznas.
    for (let p = 0; p < plants; p++) {
      const angle = rand() * Math.PI * 2;
      const offset = p === 0 ? 0 : 0.1 + rand() * 0.12;
      const x = Math.cos(angle) * offset;
      const z = Math.sin(angle) * offset;
      const height = 0.3 + rand() * 0.34;
      const radius = 0.055 + rand() * 0.028;
      const leanAngle = rand() * Math.PI * 2;
      const lean = 0.02 + rand() * 0.06;
      const leanX = Math.cos(leanAngle) * lean;
      const leanZ = Math.sin(leanAngle) * lean;
      trunk(x, z, height, radius, leanX, leanZ);
      rosette(x + leanX, height + 0.005, z + leanZ, 0.9 + rand() * 0.25);
    }

    const mesh = new pc.Mesh(device);
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setColors(colors);
    mesh.setIndices(indices);
    mesh.update();
    return mesh;
  };

  const shrubClusterMeshes = [0, 1, 2, 3, 4].map((variant) =>
    buildShrubCluster(0x63c1 + variant * 3301, 1 + (variant % 2))
  );

  const paramoZones = terrainZones.filter((zone) => zone.terrain === 'electric');
  yield* buildInstancedFoliage(ctx, {
    label: 'paramo-frailejon',
    zones: paramoZones,
    meshes: shrubClusterMeshes,
    material: paramoPlantMaterial,
    density: 1.2,
    seed: 0xd0b5,
    scaleMin: 0.9,
    scaleMax: 1.15,
    strengthMin: 0.5,
    strengthMax: 0.9,
    phaseX: 0.42,
    phaseZ: 0.31,
    phaseJitter: 1.5
  });

  // Hierba seca del páramo: briznas cortas y pajizas que llenan los huecos
  // entre los frailejones. Reutiliza la malla de la hierba alta con otra paleta
  // y menos altura, así que tiene el mismo volumen y la misma técnica.
  const dryGrassMeshes = [0, 1, 2, 3].map((variant) =>
    buildGrassCluster(device, 0x8c3f + variant * 2749, 14, DRY_GRASS_PALETTE, 0.55)
  );
  const dryGrassMaterial = createWindMaterial(ctx, '#1c1408', 0.1, 0.95, 6);

  yield* buildInstancedFoliage(ctx, {
    label: 'paramo-dry-grass',
    zones: paramoZones,
    meshes: dryGrassMeshes,
    material: dryGrassMaterial,
    density: 2.6,
    seed: 0xb17c,
    scaleMin: 0.85,
    scaleMax: 1.3,
    strengthMin: 0.55,
    strengthMax: 1,
    phaseX: 0.55,
    phaseZ: 0.4,
    phaseJitter: 1.6
  });
  ctx.shrubClusterMeshes = shrubClusterMeshes;
  ctx.dryGrassMeshes = dryGrassMeshes;
  ctx.paramoZones = paramoZones;
}
