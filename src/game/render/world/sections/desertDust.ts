/** Sección del generador de mundo. */

import * as pc from 'playcanvas';
import { zoneArea, zoneCenter } from '../../../terrain';
import type { WorldBuildContext } from '../context';
import { addSurface, buildSurfaceMesh } from '../surfaces';
import { LARGE_REGION_WEATHER } from '../tuning';
import { standard, zoneEmitterExtents } from '../worldParts';

export function* buildDesertDust(ctx: WorldBuildContext): Generator<number, void, void> {
  const { materials, particles } = ctx;
  const { mist: mistTexture } = ctx.textures;
  const desertZones = ctx.desertZones!;
  const DESERT_LARGE_AREA = 400;
  const DESERT_DUST_MAX_PARTICLES = 90;
  const DESERT_DUST_MIN_PARTICLES = 8;
  yield 1;
  // --- Polvo del desierto --------------------------------------------------
  // Bruma continua para desiertos grandes: misma técnica que la niebla de la
  // ciénaga, teñida de arena. Un único emisor de partículas sobre un mapa
  // entero se pierde, así que en zonas grandes manda esta lámina y las
  // partículas quedan reservadas a los claros pequeños.
  const desertHazeMaterial = LARGE_REGION_WEATHER
    ? standard({
        name: 'desert-haze',
        diffuse: '#d8c08e',
        diffuseMap: mistTexture,
        specular: '#000000',
        gloss: 0,
        opacity: 0.5,
        blend: pc.BLEND_NORMAL,
        depthWrite: false,
        cull: pc.CULLFACE_NONE,
        useLighting: false
      })
    : null;
  if (desertHazeMaterial) {
    materials.push(desertHazeMaterial);
    for (const zone of desertZones) {
      if (!('points' in zone) || zoneArea(zone) <= DESERT_LARGE_AREA) continue;
      const mesh = buildSurfaceMesh(ctx, zone.points, 0.45, 18);
      if (mesh) addSurface(ctx, mesh, desertHazeMaterial, 2, 'desert-haze');
    }
  }

  // Partículas suaves en suspensión sobre toda la zona: nacen repartidas en una
  // caja baja, derivan despacio con el viento y crecen y se desvanecen. Se
  // acumulan en el lote `dust` y se dibujan con un solo draw call.
  desertZones.forEach((zone, zoneIndex) => {
    const area = zoneArea(zone);
    if (area > DESERT_LARGE_AREA) return;

    // En claros muy pequeños 90 partículas se amontonan: la cantidad escala
    // con el área (90 al llegar a DESERT_LARGE_AREA) hasta un mínimo de 8.
    const numParticles = Math.max(
      DESERT_DUST_MIN_PARTICLES,
      Math.min(
        DESERT_DUST_MAX_PARTICLES,
        Math.round((area / DESERT_LARGE_AREA) * DESERT_DUST_MAX_PARTICLES)
      )
    );

    const [dustX, dustZ] = zoneCenter(zone);
    particles.emit(
      'dust',
      [dustX, 0.8, dustZ],
      zoneEmitterExtents(zone, 2.0, 1.5),
      numParticles,
      0x3c7d + zoneIndex * 4211
    );
  });
  ctx.desertHazeMaterial = desertHazeMaterial;
}
