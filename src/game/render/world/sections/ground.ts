/** Sección del generador de mundo. */

import type { WorldBuildContext } from '../context';
import { part, standard } from '../worldParts';

export function* buildGround(ctx: WorldBuildContext): Generator<number, void, void> {
  const { worldRoot, created, materials, HALF_X, HALF_Z } = ctx;
  const { ground: groundTexture, soil: soilTexture } = ctx.textures;
  yield 1;
  // --- Suelo ---------------------------------------------------------------
  const grassMaterial = standard({
    diffuseMap: groundTexture,
    specular: '#000000',
    gloss: 0.05
  });
  const soilMaterial = standard({
    diffuse: '#a9855e',
    diffuseMap: soilTexture,
    tiling: [6, 6],
    specular: '#000000',
    gloss: 0.02
  });
  materials.push(grassMaterial, soilMaterial);

  const slab = part(worldRoot, 'box', soilMaterial, {
    position: [0, -0.55, 0],
    scale: [HALF_X * 2, 1.1, HALF_Z * 2]
  });
  slab.render!.castShadows = false;
  created.push(slab);

  const ground = part(worldRoot, 'plane', grassMaterial, {
    position: [0, 0.001, 0],
    scale: [HALF_X * 2, 1, HALF_Z * 2]
  });
  ground.render!.castShadows = false;
  ground.render!.receiveShadows = true;
  created.push(ground);

  // Falda exterior: la cámara puede salir de los límites del mapa al mirar
  // desde una base. Un plano grande bajo el suelo evita que se vea el vacío y
  // deja que la niebla de la escena lo funda con el horizonte.
  const outerGroundMaterial = standard({
    diffuse: '#7fbf5b',
    specular: '#000000',
    gloss: 0.02
  });
  materials.push(outerGroundMaterial);
  const outerGround = part(worldRoot, 'plane', outerGroundMaterial, {
    position: [0, -0.04, 0],
    scale: [HALF_X * 2 + 140, 1, HALF_Z * 2 + 140]
  });
  outerGround.render!.castShadows = false;
  outerGround.render!.receiveShadows = false;
  created.push(outerGround);
}
