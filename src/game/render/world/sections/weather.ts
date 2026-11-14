/** Sección del generador de mundo. */

import { createAtmosphereVisuals } from '../../../atmosphereVisuals';
import type { WorldBuildContext } from '../context';

export function* buildWeather(ctx: WorldBuildContext): Generator<number, void, void> {
  const { app, device, HALF_X, HALF_Z } = ctx;
  const sun = ctx.sun!;
  const fill = ctx.fill!;
  const skyMaterial = ctx.skyMaterial!;
  const { rain: rainTexture } = ctx.detailTextures;
  const {
    dust: dustTexture,
    frost: frostTexture,
    mist: mistTexture,
    pollen: pollenTexture
  } = ctx.textures;
  yield 1;
  // --- Clima ---------------------------------------------------------------
  // El mundo se construye siempre despejado; la partida sortea su clima al
  // arrancar y llama a `setAtmosphere`. La capa visual reutiliza la textura de
  // lluvia y las partículas procedurales que ya usa el terreno.
  const atmosphere = createAtmosphereVisuals({
    app,
    device,
    bounds: { x: HALF_X, z: HALF_Z },
    sun,
    fill,
    skyMaterial,
    textures: {
      rain: rainTexture,
      dust: dustTexture,
      frost: frostTexture,
      mist: mistTexture,
      pollen: pollenTexture
    }
  });
  ctx.atmosphere = atmosphere;
}
