/** Sección del generador de mundo. */

import * as pc from 'playcanvas';
import {
  zoneBounds,
  zoneCenter
} from '../../../terrain';
import type { WorldBuildContext } from '../context';
import {
  buildGrassCluster,
  buildInstancedFoliage,
  createWindMaterial,
  DARK_GRASS_PALETTE
} from '../foliage';
import { buildLightningMesh, type LightningStrike } from '../lightning';
import { random } from '../random';
import { SWAMP_MIST_TILE } from '../tuning';
import { hex, standard, zoneEmitterExtents } from '../worldParts';

export function* buildLightning(ctx: WorldBuildContext): Generator<number, void, void> {
  const { device, worldRoot, created, materials, particles } = ctx;
  const swampZones = ctx.swampZones!;
  const paramoZones = ctx.paramoZones!;
  yield 1;
  // --- Páramo: rayos y chispas ----------------------------------------------
  const lightningMeshes = [0, 1, 2].map((variant) =>
    buildLightningMesh(device, 0x3f27 + variant * 7919)
  );

  const lightningZones: LightningStrike[] = [];

  for (let zoneIndex = 0; zoneIndex < paramoZones.length; zoneIndex++) {
    const zone = paramoZones[zoneIndex];
    const rand = random(0x5e91 + zoneIndex * 8353);
    const [zoneX, zoneZ] = zoneCenter(zone);

    const material = standard({
      diffuse: '#ffffff',
      specular: '#000000',
      gloss: 0,
      blend: pc.BLEND_ADDITIVE,
      depthWrite: false,
      useLighting: false,
      cull: pc.CULLFACE_NONE
    });
    material.diffuseVertexColor = true;
    material.update();
    materials.push(material);

    const bolt = new pc.Entity(`paramo-lightning-${zoneIndex}`);
    bolt.addComponent('render');
    bolt.render!.castShadows = false;
    bolt.render!.receiveShadows = false;
    bolt.render!.meshInstances = [new pc.MeshInstance(lightningMeshes[0], material)];
    bolt.enabled = false;
    worldRoot.addChild(bolt);
    created.push(bolt);

    const light = new pc.Entity(`paramo-lightning-light-${zoneIndex}`);
    light.addComponent('light', {
      type: 'omni',
      color: hex('#bfe4ff'),
      intensity: 0,
      range: 8.5,
      castShadows: false
    });
    light.setPosition(zoneX, 1.7, zoneZ);
    worldRoot.addChild(light);
    created.push(light);

    // Chispas ambientales: motas azuladas que asoman entre la hierba seca y
    // suben muy poco antes de apagarse. La densidad es baja para que no compitan
    // con los rayos ni con el polen del claro feérico.
    particles.emit(
      'sparks',
      [zoneX, 0.45, zoneZ],
      zoneEmitterExtents(zone, 1.5, 0.7),
      34,
      0x3b41 + zoneIndex * 1597
    );

    lightningZones.push({
      zone,
      rand,
      bolt,
      material,
      light,
      next: 1.4 + rand() * 2.6,
      flash: 0,
      flashDuration: 0.55,
      seed: rand() * Math.PI * 2
    });
    yield 1;
  }

  // Hierba oscura de la ciénaga: briznas casi negras que sobresalen del agua
  // turbia. Usa la misma malla que la hierba alta con una paleta apagada,
  // menos briznas y menos altura: la ciénaga debe leerse como un lodazal con
  // matas dispersas, no como un prado frondoso.
  const darkGrassMeshes = [0, 1, 2, 3].map((variant) =>
    buildGrassCluster(device, 0x4d17 + variant * 1993, 11, DARK_GRASS_PALETTE, 0.6)
  );
  const darkGrassMaterial = createWindMaterial(ctx, '#1c1408', 0.1, 0.75, 4.5);

  yield* buildInstancedFoliage(ctx, {
    label: 'swamp-grass',
    zones: swampZones,
    meshes: darkGrassMeshes,
    material: darkGrassMaterial,
    density: 1.8,
    seed: 0x7a31,
    scaleMin: 0.85,
    scaleMax: 1.25,
    strengthMin: 0.5,
    strengthMax: 0.95,
    phaseX: 0.6,
    phaseZ: 0.45,
    phaseJitter: 1.7
  });

  // Humo bajo de la ciénaga: bocanadas que nacen casi a ras del agua, suben
  // despacio y se ensanchan hasta deshacerse. El tono verdoso y la opacidad
  // baja lo separan del polvo del desierto: aquí interesa que parezca vapor
  // estancado, no una nube.
  //
  // Solo se usa en charcos pequeños. En ciénagas grandes manda la lámina
  // continua de niebla: repetir focos de partículas por todo el mapa producía
  // una nube de bocanadas sueltas que no aportaba nada sobre el manto.
  swampZones.forEach((zone, zoneIndex) => {
    const bounds = zoneBounds(zone);
    if (bounds.width > SWAMP_MIST_TILE || bounds.depth > SWAMP_MIST_TILE) return;

    const [smokeX, smokeZ] = zoneCenter(zone);
    particles.emit(
      'swampSmoke',
      [smokeX, 0.3, smokeZ],
      zoneEmitterExtents(zone, 1.75, 0.5),
      65,
      0x6a11 + zoneIndex * 2371
    );
  });
  ctx.lightningMeshes = lightningMeshes;
  ctx.lightningZones = lightningZones;
  ctx.darkGrassMeshes = darkGrassMeshes;
}
