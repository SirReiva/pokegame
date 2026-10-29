import * as pc from 'playcanvas';
import { RAD } from './config';
import {
  createMarkerCanvas,
  MARKER_RING_CENTER_Y,
  MARKER_RING_OUTER,
  MARKER_TEXTURE_HEIGHT,
  MARKER_TEXTURE_SIZE,
  textureFromCanvas
} from './textures';

/**
 * Anillo plano bajo los pies del jugador con una flecha que señala su rumbo.
 *
 * - Vive en el suelo (no es un billboard): gira solo en Y.
 * - La flecha de la textura apunta a +Z, así que rotar el plano por el rumbo
 *   del actor la alinea con `facing` (0 = sur, 90º = este).
 * - El material es unlit y usa `alphaTest`, de modo que la silueta se recorta
 *   limpia y escribe profundidad por encima de la sombra de contacto.
 */
export class PlayerMarker {
  private readonly root: pc.Entity;
  private readonly mesh: pc.Mesh;
  private readonly material: pc.StandardMaterial;
  private readonly occlusionMaterial: pc.StandardMaterial;
  private readonly texture: pc.Texture;
  private height: number;

  constructor(
    app: pc.Application,
    diameter: number,
    height: number,
    opacity: number,
    accent: readonly [number, number, number] = [255, 224, 102]
  ) {
    const device = app.graphicsDevice;
    this.height = height;

    this.texture = textureFromCanvas(device, createMarkerCanvas(accent), {
      name: 'player-marker',
      mipmaps: false,
      minFilter: pc.FILTER_NEAREST,
      magFilter: pc.FILTER_NEAREST,
      flipY: true
    });

    this.material = new pc.StandardMaterial();
    this.material.name = 'player-marker';
    this.material.useLighting = false;
    this.material.useSkybox = false;
    this.material.useFog = false;
    this.material.diffuse = new pc.Color(0, 0, 0);
    this.material.emissive = new pc.Color(1, 1, 1);
    this.material.emissiveIntensity = 1;
    this.material.emissiveMap = this.texture;
    this.material.opacityMap = this.texture;
    this.material.opacityMapChannel = 'a';
    this.material.alphaTest = 0.5;
    // Semitransparente, pero mantiene la escritura de profundidad para no
    // pelearse con la sombra de contacto ni con el sprite.
    this.material.blendType = pc.BLEND_NORMAL;
    this.material.opacity = opacity;
    this.material.depthWrite = true;
    this.material.depthTest = true;
    this.material.cull = pc.CULLFACE_NONE;
    this.material.update();

    // Segunda pasada con la profundidad invertida: igual que la silueta del
    // cuerpo, pinta el anillo y la flecha solo donde un obstáculo los tapa,
    // para que el jugador no pierda su referencia al esconderse tras un árbol.
    this.occlusionMaterial = new pc.StandardMaterial();
    this.occlusionMaterial.name = 'player-marker-occlusion';
    this.occlusionMaterial.useLighting = false;
    this.occlusionMaterial.useSkybox = false;
    this.occlusionMaterial.useFog = false;
    this.occlusionMaterial.diffuse = new pc.Color(0, 0, 0);
    this.occlusionMaterial.emissive = new pc.Color(1, 1, 1);
    this.occlusionMaterial.emissiveIntensity = 1;
    this.occlusionMaterial.emissiveMap = this.texture;
    this.occlusionMaterial.opacityMap = this.texture;
    this.occlusionMaterial.opacityMapChannel = 'a';
    this.occlusionMaterial.alphaTest = 0.5;
    this.occlusionMaterial.blendType = pc.BLEND_NORMAL;
    this.occlusionMaterial.opacity = opacity;
    this.occlusionMaterial.depthWrite = false;
    this.occlusionMaterial.depthTest = true;
    this.occlusionMaterial.depthFunc = pc.FUNC_GREATER;
    this.occlusionMaterial.cull = pc.CULLFACE_NONE;
    this.occlusionMaterial.update();

    // Quad horizontal en XZ. Las UVs están alineadas con el mundo: V=1 cae en
    // +Z, que es hacia donde apunta la flecha dibujada en la textura. El quad
    // es más largo por delante para que la flecha alargada no se recorte y el
    // centro del anillo siga justo bajo los pies del jugador.
    const pixel = diameter / (MARKER_RING_OUTER * 2);
    const halfWidth = (MARKER_TEXTURE_SIZE / 2) * pixel;
    const behind = (MARKER_TEXTURE_HEIGHT - MARKER_RING_CENTER_Y) * pixel;
    const ahead = MARKER_RING_CENTER_Y * pixel;
    this.mesh = new pc.Mesh(device);
    this.mesh.setPositions([
      -halfWidth, 0, -behind,
      halfWidth, 0, -behind,
      halfWidth, 0, ahead,
      -halfWidth, 0, ahead
    ]);
    this.mesh.setUvs(0, [0, 0, 1, 0, 1, 1, 0, 1]);
    this.mesh.setIndices([0, 1, 2, 0, 2, 3]);
    this.mesh.update();

    this.root = new pc.Entity('player-marker');
    this.root.addComponent('render');
    const render = this.root.render!;
    render.castShadows = false;
    render.receiveShadows = false;
    const normal = new pc.MeshInstance(this.mesh, this.material);
    normal.castShadow = false;
    normal.receiveShadow = false;
    normal.drawOrder = 3;
    const occlusion = new pc.MeshInstance(this.mesh, this.occlusionMaterial);
    occlusion.castShadow = false;
    occlusion.receiveShadow = false;
    occlusion.drawOrder = 4;
    render.meshInstances = [normal, occlusion];
    this.root.setLocalPosition(0, height, 0);
    app.root.addChild(this.root);
  }

  setPosition(x: number, z: number): void {
    this.root.setPosition(x, this.height, z);
  }

  /** Altura del anillo sobre el suelo (o sobre el agua cuando el actor nada). */
  setHeight(height: number): void {
    this.height = height;
    this.root.setLocalPosition(0, height, 0);
  }

  setFacing(yaw: number): void {
    this.root.setLocalEulerAngles(0, yaw * RAD, 0);
  }

  setVisible(visible: boolean): void {
    this.root.enabled = visible;
  }

  /** Asigna el anillo a una capa de render propia del viewport. */
  setLayer(layerId: number): void {
    const render = this.root.render;
    if (render) render.layers = [layerId];
  }

  destroy(): void {
    this.root.destroy();
    this.mesh.destroy();
    this.material.destroy();
    this.occlusionMaterial.destroy();
    this.texture.destroy();
  }
}
