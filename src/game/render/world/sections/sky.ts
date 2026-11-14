/** Sección del generador de mundo. */

import * as pc from 'playcanvas';
import type { WorldBuildContext } from '../context';

export function* buildSky(ctx: WorldBuildContext): Generator<number, void, void> {
  const { worldRoot, created, materials } = ctx;
  const { sky: skyTexture } = ctx.detailTextures;
  yield 1;
  // --- Cielo ---------------------------------------------------------------
  const skyMaterial = new pc.StandardMaterial();
  skyMaterial.useLighting = false;
  skyMaterial.useSkybox = false;
  skyMaterial.useFog = false;
  skyMaterial.diffuse = new pc.Color(0, 0, 0);
  skyMaterial.emissive = new pc.Color(1, 1, 1);
  skyMaterial.emissiveMap = skyTexture;
  skyMaterial.cull = pc.CULLFACE_FRONT;
  skyMaterial.depthWrite = false;
  skyMaterial.update();
  materials.push(skyMaterial);

  const sky = new pc.Entity('sky');
  sky.addComponent('render', { type: 'sphere' });
  sky.render!.material = skyMaterial;
  sky.render!.castShadows = false;
  sky.render!.receiveShadows = false;
  // La esfera original queda como cielo del menú. Las cámaras de partida usan
  // una copia pegada a cada cámara para poder recortar el plano lejano sin
  // dejar un agujero en el cielo.
  sky.render!.layers = [pc.LAYERID_SKYBOX];
  sky.setLocalScale(460, 460, 460);
  worldRoot.addChild(sky);
  created.push(sky);
  const skyMesh = sky.render!.meshInstances[0].mesh!;
  ctx.skyMaterial = skyMaterial;
  ctx.skyMesh = skyMesh;
}
