/**
 * Estado compartido del generador de mundo.
 *
 * Las secciones de `world.ts` se ejecutan en orden y dejan aquí sus resultados:
 * entidades creadas, materiales, colliders y las piezas que necesitan el bucle
 * de actualización y la limpieza de recursos. Los campos de salida se rellenan
 * en la sección que los produce; el pipeline los consume después.
 */

import type * as pc from 'playcanvas';
import type { AtmosphereVisuals } from '../../atmosphereVisuals';
import type { BatchedParticles } from '../../batchedParticles';
import type { Collider } from '../../core/world';
import type { GameMap, MountainRange, RespawnPoint, TerrainZone } from '../../terrain';
import type { Butterfly, ButterflyBatch } from './butterfly';
import type { LightningStrike } from './lightning';
import type { WorldDetailTextures } from './worldDetailTextures';
import type { WorldTextures } from './worldTextures';

/** Sección del generador: recibe el contexto y cede el hilo como el original. */
export type WorldSection = (
  ctx: WorldBuildContext
) => Generator<number, void, void>;

export interface WorldBuildContext {
  app: pc.AppBase;
  device: pc.GraphicsDevice;
  map: GameMap;
  terrainZones: TerrainZone[];
  waterZones: TerrainZone[];
  mountains: MountainRange[];
  bases: RespawnPoint[];
  /** Media anchura del mapa en unidades de mundo. */
  HALF_X: number;
  /** Media profundidad del mapa en unidades de mundo. */
  HALF_Z: number;

  colliders: Collider[];
  created: pc.Entity[];
  materials: pc.StandardMaterial[];
  windMaterials: pc.StandardMaterial[];
  instancedFoliageBuffers: pc.VertexBuffer[];
  surfaceMeshes: pc.Mesh[];
  /** Mallas de separadores: escriben esténcil 1 para que la niebla no las tiña. */
  barrierMeshInstances: pc.MeshInstance[];
  /** Raíz propia: se engancha a la escena cuando el mundo está completo. */
  worldRoot: pc.Entity;

  textures: WorldTextures;
  detailTextures: WorldDetailTextures;
  particles: BatchedParticles;

  // --- Luces y cielo --------------------------------------------------------
  sun?: pc.Entity;
  fill?: pc.Entity;
  skyMaterial?: pc.StandardMaterial;
  skyMesh?: pc.Mesh;

  // --- Agua y clima de región ----------------------------------------------
  waterHeight?: number;
  swampZones?: TerrainZone[];
  desertZones?: TerrainZone[];
  fairyZones?: TerrainZone[];
  paramoZones?: TerrainZone[];
  waterSurfaceMaterial?: pc.StandardMaterial;
  waterGlintMaterial?: pc.StandardMaterial;
  swampSurfaceMaterial?: pc.StandardMaterial;
  swampMistMaterial?: pc.StandardMaterial | null;
  desertHazeMaterial?: pc.StandardMaterial | null;
  waterSurfaceOffset?: pc.Vec2;
  waterGlintOffset?: pc.Vec2;
  swampSurfaceOffset?: pc.Vec2;
  swampMistOffset?: pc.Vec2;
  desertHazeOffset?: pc.Vec2;

  // --- Mallas compartidas por el follaje instanciado ------------------------
  foliageInstanceFormat?: pc.VertexFormat;
  cactusMesh?: pc.Mesh;
  mountainPeakMeshes?: pc.Mesh[];
  wallSegmentMeshes?: pc.Mesh[];
  iceClusterMeshes?: pc.Mesh[];
  basaltMeshes?: pc.Mesh[];
  grassClusterMeshes?: pc.Mesh[];
  flowerClusterMeshes?: pc.Mesh[];
  shrubClusterMeshes?: pc.Mesh[];
  dryGrassMeshes?: pc.Mesh[];
  darkGrassMeshes?: pc.Mesh[];
  ghostTreeMeshes?: pc.Mesh[];

  // --- Animación por frame --------------------------------------------------
  emberLights?: Array<{ entity: pc.Entity; phase: number }>;
  ghostLights?: Array<{ entity: pc.Entity; phase: number }>;
  ghostTrees?: Array<{
    entity: pc.Entity;
    yaw: number;
    phase: number;
    strength: number;
  }>;
  butterflies?: Butterfly[];
  butterflyBatches?: ButterflyBatch[];
  butterflyBodyMesh?: pc.Mesh;
  butterflyWingRight?: pc.Mesh;
  butterflyWingLeft?: pc.Mesh;
  lightningMeshes?: pc.Mesh[];
  lightningZones?: LightningStrike[];

  // --- Resultado final ------------------------------------------------------
  atmosphere?: AtmosphereVisuals;
  shadowMaterial?: pc.StandardMaterial;
}
