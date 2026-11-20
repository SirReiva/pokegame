import * as pc from 'playcanvas';
import { type AtmosphereId } from './atmosphere';
import { yieldToBrowser } from './frameYield';
import { getActiveMap, mapRegions } from './terrain';
import { createAmbientParticles } from './render/world/ambientParticles';
import { updateButterflies } from './render/world/butterfly';
import { updateLightning } from './render/world/lightning';
import { createWorldDetailTextures } from './render/world/worldDetailTextures';
import { createWorldTextures } from './render/world/worldTextures';
import type { WorldBuildContext, WorldSection } from './render/world/context';
import { buildScene } from './render/world/sections/scene';
import { buildLights } from './render/world/sections/lights';
import { buildGround } from './render/world/sections/ground';
import { buildWater } from './render/world/sections/water';
import { buildTrees } from './render/world/sections/trees';
import { buildBarriers } from './render/world/sections/barriers';
import { buildDesertDust } from './render/world/sections/desertDust';
import { buildIce } from './render/world/sections/ice';
import { buildFire } from './render/world/sections/fire';
import { buildGrass } from './render/world/sections/grass';
import { buildFlowers } from './render/world/sections/flowers';
import { buildButterflies } from './render/world/sections/butterflies';
import { buildParamo } from './render/world/sections/paramo';
import { buildLightning } from './render/world/sections/lightning';
import { buildGhost } from './render/world/sections/ghost';
import { buildBases } from './render/world/sections/bases';
import { buildSky } from './render/world/sections/sky';
import { buildWeather } from './render/world/sections/weather';
import { buildContactShadow } from './render/world/sections/contactShadow';

export type { Collider } from './core/world';

import type { World } from './render/world/types';
import type {
  BuildWorldHooks,
  BuildWorldOptions
} from './render/world/options';

export type { World } from './render/world/types';
export type {
  BuildWorldHooks,
  BuildWorldOptions
} from './render/world/options';

/**
 * Orden de construcción del mundo. Cada sección conserva sus propios puntos de
 * cesión (el presupuesto de 8 ms lo aplica `buildWorldAsync`), así que el mapa
 * generado y el reparto del trabajo son idénticos a los del bloque original.
 */
const WORLD_SECTIONS: WorldSection[] = [
  buildScene,
  buildLights,
  buildGround,
  buildWater,
  buildTrees,
  buildBarriers,
  buildDesertDust,
  buildIce,
  buildFire,
  buildGrass,
  buildFlowers,
  buildButterflies,
  buildParamo,
  buildLightning,
  buildGhost,
  buildBases,
  buildSky,
  buildWeather,
  buildContactShadow
];

/**
 * Construye el mundo por fases. La versión síncrona (`buildWorld`) y la
 * troceada (`buildWorldAsync`) comparten estos pasos; separarlos en secciones
 * permite que la pestaña respire al cambiar de mapa.
 */
function* buildWorldSteps(
  app: pc.AppBase,
  options: BuildWorldOptions
): Generator<number, World, void> {
  const device = app.graphicsDevice;
  const map = options.map ?? getActiveMap();
  // Datos del mapa que se está construyendo, tomados de su propio objeto y no
  // del estado global: el mapa anterior puede seguir visible.
  const regions = mapRegions(map);
  const terrainZones = regions.terrain;
  const waterZones = regions.water;
  const mountains = map.mountains;
  const bases = map.respawns;
  const mapCols = map.tiles[0]?.length ?? 0;
  const HALF_X = (mapCols * map.tileSize) / 2;
  const HALF_Z = (map.tiles.length * map.tileSize) / 2;
  const colliders: WorldBuildContext['colliders'] = [];
  const created: pc.Entity[] = [];
  const materials: pc.StandardMaterial[] = [];
  const windMaterials: pc.StandardMaterial[] = [];
  const instancedFoliageBuffers: pc.VertexBuffer[] = [];
  const surfaceMeshes: pc.Mesh[] = [];
  /** Mallas de separadores: escriben esténcil 1 para que la niebla no las tiña. */
  const barrierMeshInstances: pc.MeshInstance[] = [];
  // Raíz propia: el mundo nuevo se construye fuera de la escena y solo se
  // engancha cuando está completo. Así el mapa anterior sigue visible durante
  // la construcción asíncrona y no se mezclan las dos geometrías.
  const worldRoot = new pc.Entity('world');

  // Orden transparente manual: primero las láminas de agua, después las
  // sombras de contacto y al final el anillo del jugador. Así el anillo nunca
  // queda teñido por el agua según desde donde mire la cámara.
  const worldLayer = app.scene.layers.getLayerById(pc.LAYERID_WORLD);
  if (worldLayer) worldLayer.transparentSortMode = pc.SORTMODE_MANUAL;

  yield 1;
  // --- Texturas procedurales -------------------------------------------------
  const worldTextures = yield* createWorldTextures(
    device,
    map,
    terrainZones,
    options.groundCanvas
  );

  // --- Partículas ambientales por lotes ------------------------------------
  // Antes cada foco era un `ParticleSystem` propio: una pasada de simulación y
  // un draw call por vista. Aquí todas las motas de un tipo comparten malla y
  // material, y el movimiento se resuelve en el vertex shader. Los colores,
  // tamaños y tiempos reproducen las curvas que tenía cada emisor.
  const particles = createAmbientParticles({
    dust: worldTextures.dust,
    frost: worldTextures.frost,
    ember: worldTextures.ember,
    smoke: worldTextures.smoke,
    pollen: worldTextures.pollen,
    spark: worldTextures.spark,
    wisp: worldTextures.wisp
  });

  const detailTextures = yield* createWorldDetailTextures(device);

  const ctx: WorldBuildContext = {
    app,
    device,
    map,
    terrainZones,
    waterZones,
    mountains,
    bases,
    HALF_X,
    HALF_Z,
    colliders,
    created,
    materials,
    windMaterials,
    instancedFoliageBuffers,
    surfaceMeshes,
    barrierMeshInstances,
    worldRoot,
    textures: worldTextures,
    detailTextures,
    particles
  };

  for (const section of WORLD_SECTIONS) {
    yield* section(ctx);
  }

  // Las partículas se crean antes de enganchar la raíz: así el primer frame ya
  // las dibuja y no hay un salto visible al cambiar de mapa.
  particles.build(device, worldRoot, { x: HALF_X, z: HALF_Z });

  // El mundo está completo: a partir de aquí es visible y reemplaza al anterior.
  app.root.addChild(worldRoot);

  let time = 0;

  return {
    colliders,
    bounds: { x: HALF_X, z: HALF_Z },
    waterHeight: ctx.waterHeight!,
    shadowMaterial: ctx.shadowMaterial!,
    skyMesh: ctx.skyMesh!,
    skyMaterial: ctx.skyMaterial!,
    setAtmosphere(id: AtmosphereId) {
      ctx.atmosphere!.set(id);
    },
    updateAmbient(dt: number) {
      particles.update(dt, app.scene.fog);
    },
    update(dt: number) {
      time += dt;
      ctx.atmosphere!.update(dt);

      // Parpadeo de la luz de lava: dos senos desfasados, uno lento y otro
      // rápido, para que el resplandor no parezca una bombilla fija.
      for (const ember of ctx.emberLights!) {
        const light = ember.entity.light;
        if (!light) continue;
        light.intensity =
          0.58 +
          Math.sin(time * 2.6 + ember.phase) * 0.07 +
          Math.sin(time * 6.3 + ember.phase * 1.7) * 0.035;
      }

      // El cráter de los volcanes respira con la misma cadencia cálida, pero
      // algo más intensa: es una erupción, no una costra de lava.
      for (const volcano of ctx.volcanoLights!) {
        const light = volcano.entity.light;
        if (!light) continue;
        light.intensity =
          0.92 +
          Math.sin(time * 2.2 + volcano.phase) * 0.12 +
          Math.sin(time * 5.7 + volcano.phase * 1.4) * 0.06;
      }

      // La luz del bosque umbrío respira más despacio: un pulso largo con un
      // temblor corto, como una llama fría que se aviva y se apaga.
      for (const glow of ctx.ghostLights!) {
        const light = glow.entity.light;
        if (!light) continue;
        light.intensity =
          0.42 +
          Math.sin(time * 1.6 + glow.phase) * 0.09 +
          Math.sin(time * 4.3 + glow.phase * 0.7) * 0.03;
      }

      // Dos capas de ondas en sentidos opuestos: los brillos cambian de sitio
      // y la superficie parece moverse sin desplazar la silueta del lago.
      // Hay que llamar a `update()` después de tocar los offsets: si no,
      // PlayCanvas no sube las transformadas de UV al uniform buffer y el
      // agua se queda congelada aunque los valores cambien en JS.
      // Las velocidades están en unidades de UV y las UVs de cada cuerpo de
      // agua se escalan por su tamaño en el mundo, así que la corriente se lee
      // igual en lagos grandes y pequeños.
      ctx.waterSurfaceMaterial!.diffuseMapOffset = ctx.waterSurfaceOffset!.set(
        time * 0.15,
        time * 0.22
      );
      ctx.waterSurfaceMaterial!.update();

      ctx.waterGlintMaterial!.diffuseMapOffset = ctx.waterGlintOffset!.set(
        -time * 0.26 + Math.sin(time * 0.6) * 0.05,
        time * 0.11 + Math.cos(time * 0.45) * 0.03
      );
      // Los destellos laten un poco de opacidad: una pista de movimiento más,
      // legible incluso de reojo.
      ctx.waterGlintMaterial!.opacity = 0.3 + Math.sin(time * 1.15) * 0.05;
      ctx.waterGlintMaterial!.update();

      // La ciénaga se mueve aún más despacio: el agua estancada no corre y su
      // superficie es mate, así que solo cambia el dibujo de las ondas.
      ctx.swampSurfaceMaterial!.diffuseMapOffset = ctx.swampSurfaceOffset!.set(
        -time * 0.07,
        time * 0.11
      );
      ctx.swampSurfaceMaterial!.update();

      // Las láminas de niebla/polvo de regiones grandes están desactivadas
      // por ahora; si se reactivan, solo hay que avanzar sus UVs.
      if (ctx.swampMistMaterial) {
        ctx.swampMistMaterial.diffuseMapOffset = ctx.swampMistOffset!.set(
          time * 0.008,
          time * 0.005
        );
        ctx.swampMistMaterial.update();
      }
      if (ctx.desertHazeMaterial) {
        ctx.desertHazeMaterial.diffuseMapOffset = ctx.desertHazeOffset!.set(
          time * 0.014,
          time * 0.006
        );
        ctx.desertHazeMaterial.update();
      }

      // Viento sobre la hierba instanciada: la inclinación se calcula en el
      // vertex shader con la fase de cada mata, así que solo hay que avanzar
      // el reloj de los materiales. No se recorre ninguna mata en CPU.
      for (const material of ctx.windMaterials) {
        material.setParameter('uWindTime', time);
      }

      // Rayos del páramo, árboles muertos y mariposas: cada bloque conserva el
      // orden y el consumo de azar que tenía en el generador original.
      updateLightning(ctx.lightningZones!, ctx.lightningMeshes!, dt);

      for (const tree of ctx.ghostTrees!) {
        const sway = Math.sin(time * 0.6 + tree.phase) * 1.6 * tree.strength;
        tree.entity.setLocalEulerAngles(0, tree.yaw, sway);
      }

      updateButterflies(ctx.butterflies!, ctx.butterflyBatches!, dt);
    },
    dispose() {
      ctx.atmosphere!.dispose();
      for (const entity of created) entity.destroy();
      for (const buffer of instancedFoliageBuffers) buffer.destroy();
      for (const batch of ctx.butterflyBatches!) {
        batch.bodyBuffer.destroy();
        batch.rightBuffer.destroy();
        batch.leftBuffer.destroy();
      }
      for (const material of materials) material.destroy();
      worldTextures.ground.destroy();
      worldTextures.soil.destroy();
      worldTextures.shadow.destroy();
      worldTextures.water.destroy();
      worldTextures.waterGlint.destroy();
      for (const mesh of surfaceMeshes) mesh.destroy();
      worldTextures.dust.destroy();
      worldTextures.frost.destroy();
      worldTextures.smoke.destroy();
      worldTextures.mist.destroy();
      worldTextures.ember.destroy();
      worldTextures.wisp.destroy();
      worldTextures.pollen.destroy();
      worldTextures.spark.destroy();
      detailTextures.sky.destroy();
      detailTextures.rain.destroy();
      detailTextures.bark.destroy();
      detailTextures.mountainRock.destroy();
      detailTextures.wallStone.destroy();
      detailTextures.volcanoRock.destroy();
      detailTextures.volcanoGlow.destroy();
      for (const texture of detailTextures.leaves) texture.destroy();
      ctx.cactusMesh!.destroy();
      for (const mesh of ctx.grassClusterMeshes!) mesh.destroy();
      for (const mesh of ctx.flowerClusterMeshes!) mesh.destroy();
      for (const mesh of ctx.shrubClusterMeshes!) mesh.destroy();
      for (const mesh of ctx.dryGrassMeshes!) mesh.destroy();
      for (const mesh of ctx.darkGrassMeshes!) mesh.destroy();
      for (const mesh of ctx.iceClusterMeshes!) mesh.destroy();
      for (const mesh of ctx.basaltMeshes!) mesh.destroy();
      for (const mesh of ctx.ghostTreeMeshes!) mesh.destroy();
      for (const mesh of ctx.mountainPeakMeshes!) mesh.destroy();
      for (const mesh of ctx.wallSegmentMeshes!) mesh.destroy();
      for (const mesh of ctx.volcanoMeshes!) mesh.destroy();
      ctx.butterflyBodyMesh!.destroy();
      ctx.butterflyWingRight!.destroy();
      ctx.butterflyWingLeft!.destroy();
      for (const mesh of ctx.lightningMeshes!) mesh.destroy();
      particles.destroy();
      // La raíz se destruye al final: si el mundo se canceló antes de
      // engancharse, sus entidades seguían colgando de ella.
      worldRoot.destroy();
    }
  };
}

/** Construye el mundo de una vez. Para tests y como respaldo. */
export function buildWorld(
  app: pc.AppBase,
  options: BuildWorldOptions = {}
): World {
  const steps = buildWorldSteps(app, options);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/**
 * Construye el mundo por secciones, cediendo el hilo entre ellas. En un mapa de
 * estrés como `perf-256` el mundo tarda más que el propio suelo, así que sin
 * esto el cambio de mapa seguía congelando la pestaña.
 */
export async function buildWorldAsync(
  app: pc.AppBase,
  options: BuildWorldOptions = {},
  hooks: BuildWorldHooks = {}
): Promise<World | null> {
  const steps = buildWorldSteps(app, options);
  // Progreso estimado por tiempo: el generador cede muchísimas veces dentro de
  // las secciones pesadas, así que contar cesiones haría que la barra llegara al
  // 99 % en el primer instante.
  const startedAt = performance.now();
  let frameStart = startedAt;
  let step = steps.next();

  while (!step.done) {
    const now = performance.now();
    if (now - frameStart >= BUILD_WORLD_BUDGET_MS) {
      hooks.onProgress?.(
        Math.min(0.99, (now - startedAt) / BUILD_WORLD_ESTIMATE_MS)
      );
      await yieldToBrowser();
      frameStart = performance.now();
    }
    step = steps.next();
  }

  hooks.onProgress?.(1);
  const world = step.value;
  if (hooks.isCancelled?.()) {
    // No se abandona a media construcción: quedarían entidades y texturas
    // sueltas. Se termina y se descarta el mundo completo.
    world.dispose();
    return null;
  }
  return world;
}

/**
 * Tiempo de construcción antes de ceder el hilo. Cada sección del mundo puede
 * ser más corta o más larga; este presupuesto deja que el navegador pinte entre
 * secciones sin alargar demasiado la carga.
 */
const BUILD_WORLD_BUDGET_MS = 8;
/** Duración aproximada de la construcción en `perf-256`, solo para la barra. */
const BUILD_WORLD_ESTIMATE_MS = 1400;
