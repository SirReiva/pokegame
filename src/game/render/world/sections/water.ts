/** Sección del generador de mundo. */

import * as pc from 'playcanvas';
import { zoneBounds } from '../../../terrain';
import type { WorldBuildContext } from '../context';
import { addSurface, buildSurfaceMesh } from '../surfaces';
import { LARGE_REGION_WEATHER, SWAMP_MIST_TILE } from '../tuning';
import { hex, standard } from '../worldParts';

export function* buildWater(ctx: WorldBuildContext): Generator<number, void, void> {
  const { map, terrainZones, waterZones, materials } = ctx;
  const {
    water: waterTexture,
    waterGlint: waterGlintTexture,
    mist: mistTexture
  } = ctx.textures;
  yield 1;
  // --- Agua ----------------------------------------------------------------
  // Cada cuerpo de agua se construye con una malla plana triangulada a partir
  // de las celdas waterLow/waterHigh. Encima van dos capas translúcidas con
  // las UVs animadas en direcciones distintas.
  const makeWaterMaterial = (
    name: string,
    map: pc.Texture,
    opacity: number,
    tint = '#d9f6ff',
    glow = '#0f3b4d'
  ): pc.StandardMaterial => {
    const material = standard({
      name,
      diffuse: tint,
      diffuseMap: map,
      specular: '#ffffff',
      gloss: 0.9,
      opacity,
      blend: pc.BLEND_NORMAL,
      depthWrite: false,
      cull: pc.CULLFACE_NONE
    });
    material.emissive = hex(glow);
    material.update();
    materials.push(material);
    return material;
  };

  const waterSurfaceMaterial = makeWaterMaterial('water-surface', waterTexture, 0.42);
  const waterGlintMaterial = makeWaterMaterial('water-glint', waterGlintTexture, 0.3);
  // Offsets reutilizados: `update()` se llama cada frame y asignar un Vec2
  // nuevo por material generaba basura constante en el hilo principal.
  const waterSurfaceOffset = new pc.Vec2();
  const waterGlintOffset = new pc.Vec2();
  const swampSurfaceOffset = new pc.Vec2();
  const swampMistOffset = new pc.Vec2();
  const desertHazeOffset = new pc.Vec2();
  const waterHeight = map.waterHeight;

  for (const zone of waterZones) {
    if (!('points' in zone)) continue;
    const base = buildSurfaceMesh(ctx, zone.points, waterHeight, 3.4);
    if (!base) continue;
    const glint = buildSurfaceMesh(ctx, zone.points, waterHeight + 0.004, 3.0);
    addSurface(ctx, base, waterSurfaceMaterial, 0, 'water-surface');
    if (glint) addSurface(ctx, glint, waterGlintMaterial, 1, 'water-glint');
  }

  yield 1;
  // --- Ciénaga -------------------------------------------------------------
  // La ciénaga comparte la superficie plana, pero es mate y se mueve despacio.
  const swampZones = terrainZones.filter((zone) => zone.terrain === 'poison');
  const swampSurfaceMaterial = standard({
    name: 'swamp-surface',
    diffuse: '#4c5a3c',
    diffuseMap: waterTexture,
    tiling: [1.15, 1.05],
    specular: '#000000',
    gloss: 0,
    opacity: 0.42,
    blend: pc.BLEND_NORMAL,
    depthWrite: false,
    cull: pc.CULLFACE_NONE,
    emissive: '#0a1007'
  });
  materials.push(swampSurfaceMaterial);

  for (const zone of swampZones) {
    if (!('points' in zone)) continue;
    const mesh = buildSurfaceMesh(ctx, zone.points, waterHeight, 2.8);
    if (mesh) addSurface(ctx, mesh, swampSurfaceMaterial, 0, 'swamp-surface');
  }

  // Lámina de niebla baja para ciénagas grandes. De momento está desactivada
  // (`LARGE_REGION_WEATHER`): las zonas grandes se quedan sin efecto y los
  // charcos pequeños siguen usando sus bocanadas.
  const swampMistMaterial = LARGE_REGION_WEATHER
    ? standard({
        name: 'swamp-mist',
        diffuse: '#e4f2dc',
        diffuseMap: mistTexture,
        specular: '#000000',
        gloss: 0,
        opacity: 0.55,
        blend: pc.BLEND_NORMAL,
        depthWrite: false,
        cull: pc.CULLFACE_NONE,
        useLighting: false
      })
    : null;
  if (swampMistMaterial) {
    materials.push(swampMistMaterial);
    for (const zone of swampZones) {
      if (!('points' in zone)) continue;
      const bounds = zoneBounds(zone);
      if (bounds.width <= SWAMP_MIST_TILE && bounds.depth <= SWAMP_MIST_TILE) continue;
      const mesh = buildSurfaceMesh(ctx, zone.points, waterHeight + 0.15, 16);
      if (mesh) addSurface(ctx, mesh, swampMistMaterial, 2, 'swamp-mist');
    }
  }

  // El agua profunda no es un collider fijo: depende del tipo del jugador y se
  // resuelve en `Game.resolvePosition` consultando las celdas de la rejilla.
  ctx.waterHeight = waterHeight;
  ctx.swampZones = swampZones;
  ctx.waterSurfaceMaterial = waterSurfaceMaterial;
  ctx.waterGlintMaterial = waterGlintMaterial;
  ctx.swampSurfaceMaterial = swampSurfaceMaterial;
  ctx.swampMistMaterial = swampMistMaterial;
  ctx.waterSurfaceOffset = waterSurfaceOffset;
  ctx.waterGlintOffset = waterGlintOffset;
  ctx.swampSurfaceOffset = swampSurfaceOffset;
  ctx.swampMistOffset = swampMistOffset;
  ctx.desertHazeOffset = desertHazeOffset;
}
