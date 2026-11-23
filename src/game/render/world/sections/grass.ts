/** Sección del generador de mundo. */

import * as pc from 'playcanvas';
import type { WorldBuildContext } from '../context';
import {
  buildGrassCluster,
  buildInstancedFoliage,
  createWindMaterial
} from '../foliage';

export function* buildGrass(ctx: WorldBuildContext): Generator<number, void, void> {
  const { device, terrainZones } = ctx;
  yield 1;
  // --- Hierba alta ----------------------------------------------------------
  // Matas 3D de verdad: cada mata es una malla con varias briznas geométricas
  // (dos tramos y punta) y color por vértice de la base a la punta. Sin
  // texturas ni recortes: la hierba tiene volumen desde cualquier ángulo.
  //
  // Las matas se dibujan con GPU Instancing: una sola malla y un solo draw call
  // por variante y región. El viento va en el vertex shader, así que animar
  // miles de matas no toca la CPU.

  const tallGrassMaterial = createWindMaterial(ctx, 'tall-grass', '#0a1a0a', 0.06, 1.15, 8);
  const grassClusterMeshes = [0, 1, 2, 3, 4].map((variant) =>
    buildGrassCluster(device, 0x51a7 + variant * 3571, 18)
  );

  // Formato de instancia compartido por todas las matas: cuatro columnas de la
  // matriz de mundo (los mismos semánticos que usa PlayCanvas para instancing)
  // y un vec4 con fase y fuerza del viento.
  ctx.foliageInstanceFormat = new pc.VertexFormat(device, [
    { semantic: pc.SEMANTIC_ATTR11, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: pc.SEMANTIC_ATTR12, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: pc.SEMANTIC_ATTR14, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: pc.SEMANTIC_ATTR15, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: pc.SEMANTIC_ATTR13, components: 4, type: pc.TYPE_FLOAT32 }
  ]);

  yield* buildInstancedFoliage(ctx, {
    label: 'tall-grass',
    zones: terrainZones.filter((zone) => zone.terrain === 'tallGrass'),
    meshes: grassClusterMeshes,
    material: tallGrassMaterial,
    density: 3.6,
    seed: 0x9a11,
    scaleMin: 0.9,
    scaleMax: 1.45,
    strengthMin: 0.7,
    strengthMax: 1.3,
    phaseX: 0.55,
    phaseZ: 0.3,
    phaseJitter: 1.4
  });
  ctx.grassClusterMeshes = grassClusterMeshes;
}
