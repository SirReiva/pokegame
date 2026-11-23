/** Sección del generador de mundo. */

import * as pc from 'playcanvas';
import { FOG_EXCLUDED_STENCIL } from '../../../fogStencil';
import type { WorldBuildContext } from '../context';

export function* buildContactShadow(ctx: WorldBuildContext): Generator<number, void, void> {
  const { device, materials, barrierMeshInstances } = ctx;
  const { shadow: shadowTexture } = ctx.textures;
  yield 1;
  // --- Sombra de contacto --------------------------------------------------
  const shadowMaterial = new pc.StandardMaterial();
  shadowMaterial.name = 'contact-shadow';
  shadowMaterial.useLighting = false;
  shadowMaterial.useSkybox = false;
  shadowMaterial.useFog = false;
  shadowMaterial.diffuse = new pc.Color(0, 0, 0);
  shadowMaterial.emissive = new pc.Color(0, 0, 0);
  shadowMaterial.opacityMap = shadowTexture;
  shadowMaterial.opacityMapChannel = 'a';
  shadowMaterial.opacity = 1;
  shadowMaterial.blendType = pc.BLEND_NORMAL;
  shadowMaterial.depthWrite = false;
  shadowMaterial.depthTest = true;
  shadowMaterial.cull = pc.CULLFACE_NONE;
  shadowMaterial.update();
  materials.push(shadowMaterial);

  // La niebla de guerra se apoya en el suelo que queda detrás de cada píxel;
  // sin esta marca, la cara de una cordillera vista de frente heredaba la
  // sombra de su propia ladera. `FogView` solo pinta donde el esténcil es 0.
  if (device.supportsStencil) {
    for (const instance of barrierMeshInstances) {
      instance.stencilFront = FOG_EXCLUDED_STENCIL;
      instance.stencilBack = FOG_EXCLUDED_STENCIL;
    }
  }
  ctx.shadowMaterial = shadowMaterial;
}
