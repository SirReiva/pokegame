import * as pc from 'playcanvas';
import { CONFIG, RAD } from './config';
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
 *
 * La malla, la textura y los dos materiales se comparten por color de equipo:
 * antes cada copia del splitscreen creaba su propio canvas y sus materiales.
 */

interface MarkerAssets {
  readonly mesh: pc.Mesh;
  readonly texture: pc.Texture;
  readonly material: pc.StandardMaterial;
  readonly occlusionMaterial: pc.StandardMaterial;
}

/** Caché por aplicación: las texturas pertenecen a su `GraphicsDevice`. */
const assetsByApp = new WeakMap<pc.AppBase, Map<string, MarkerAssets>>();

function destroyAssets(assets: MarkerAssets): void {
  assets.material.destroy();
  assets.occlusionMaterial.destroy();
  assets.texture.destroy();
  assets.mesh.destroy();
}

function createAssets(
  app: pc.AppBase,
  diameter: number,
  opacity: number,
  accent: readonly [number, number, number]
): MarkerAssets {
  const device = app.graphicsDevice;
  // El anillo es un gráfico suave, no pixel art: con `NEAREST` y sin mipmaps
  // sus bordes se vuelven un punteado que centellea al caminar. Lineal con
  // mipmaps y anisotropía lo mantiene limpio en cualquier ángulo.
  const texture = textureFromCanvas(device, createMarkerCanvas(accent), {
    name: 'player-marker',
    mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    anisotropy: CONFIG.performance.anisotropy,
    flipY: true
  });

  const material = new pc.StandardMaterial();
  material.name = 'player-marker';
  material.useLighting = false;
  material.useSkybox = false;
  material.useFog = false;
  material.diffuse = new pc.Color(0, 0, 0);
  material.emissive = new pc.Color(1, 1, 1);
  material.emissiveIntensity = 1;
  material.emissiveMap = texture;
  material.opacityMap = texture;
  material.opacityMapChannel = 'a';
  material.alphaTest = 0.5;
  // Semitransparente, pero mantiene la escritura de profundidad para no
  // pelearse con la sombra de contacto ni con el sprite.
  material.blendType = pc.BLEND_NORMAL;
  material.opacity = opacity;
  material.depthWrite = true;
  material.depthTest = true;
  material.cull = pc.CULLFACE_NONE;
  material.update();

  // Segunda pasada con la profundidad invertida: igual que la silueta del
  // cuerpo, pinta el anillo y la flecha solo donde un obstáculo los tapa,
  // para que el jugador no pierda su referencia al esconderse tras un árbol.
  const occlusionMaterial = new pc.StandardMaterial();
  occlusionMaterial.name = 'player-marker-occlusion';
  occlusionMaterial.useLighting = false;
  occlusionMaterial.useSkybox = false;
  occlusionMaterial.useFog = false;
  occlusionMaterial.diffuse = new pc.Color(0, 0, 0);
  occlusionMaterial.emissive = new pc.Color(1, 1, 1);
  occlusionMaterial.emissiveIntensity = 1;
  occlusionMaterial.emissiveMap = texture;
  occlusionMaterial.opacityMap = texture;
  occlusionMaterial.opacityMapChannel = 'a';
  occlusionMaterial.alphaTest = 0.5;
  occlusionMaterial.blendType = pc.BLEND_NORMAL;
  occlusionMaterial.opacity = opacity;
  occlusionMaterial.depthWrite = false;
  occlusionMaterial.depthTest = true;
  occlusionMaterial.depthFunc = pc.FUNC_GREATER;
  occlusionMaterial.cull = pc.CULLFACE_NONE;
  occlusionMaterial.update();

  // Quad horizontal en XZ. Las UVs están alineadas con el mundo: V=1 cae en
  // +Z, que es hacia donde apunta la flecha dibujada en la textura. El quad
  // es más largo por delante para que la flecha alargada no se recorte y el
  // centro del anillo siga justo bajo los pies del jugador.
  const pixel = diameter / (MARKER_RING_OUTER * 2);
  const halfWidth = (MARKER_TEXTURE_SIZE / 2) * pixel;
  const behind = (MARKER_TEXTURE_HEIGHT - MARKER_RING_CENTER_Y) * pixel;
  const ahead = MARKER_RING_CENTER_Y * pixel;
  const mesh = new pc.Mesh(device);
  mesh.setPositions([
    -halfWidth, 0, -behind,
    halfWidth, 0, -behind,
    halfWidth, 0, ahead,
    -halfWidth, 0, ahead
  ]);
  mesh.setUvs(0, [0, 0, 1, 0, 1, 1, 0, 1]);
  mesh.setIndices([0, 1, 2, 0, 2, 3]);
  mesh.update();
  // La caché conserva una referencia propia: al destruir los anillos de una
  // partida, PlayCanvas liberaría la malla compartida al llegar a cero y la
  // siguiente partida reutilizaría una malla ya destruida.
  mesh.incRefCount();

  return { mesh, texture, material, occlusionMaterial };
}

function assetsFor(
  app: pc.AppBase,
  diameter: number,
  opacity: number,
  accent: readonly [number, number, number]
): MarkerAssets {
  let cache = assetsByApp.get(app);
  if (!cache) {
    const created = new Map<string, MarkerAssets>();
    cache = created;
    assetsByApp.set(app, created);
    app.once('destroy', () => {
      for (const assets of created.values()) destroyAssets(assets);
      created.clear();
      assetsByApp.delete(app);
    });
  }

  const key = `${diameter}|${opacity}|${accent[0]},${accent[1]},${accent[2]}`;
  let assets = cache.get(key);
  if (!assets) {
    assets = createAssets(app, diameter, opacity, accent);
    cache.set(key, assets);
  }
  return assets;
}

export class PlayerMarker {
  private readonly root: pc.Entity;
  private height: number;

  constructor(
    app: pc.AppBase,
    diameter: number,
    height: number,
    opacity: number,
    accent: readonly [number, number, number] = [255, 224, 102]
  ) {
    this.height = height;
    const assets = assetsFor(app, diameter, opacity, accent);

    this.root = new pc.Entity('player-marker');
    this.root.addComponent('render');
    const render = this.root.render!;
    render.castShadows = false;
    render.receiveShadows = false;
    const normal = new pc.MeshInstance(assets.mesh, assets.material);
    normal.castShadows = false;
    normal.receiveShadows = false;
    normal.drawOrder = 3;
    const occlusion = new pc.MeshInstance(assets.mesh, assets.occlusionMaterial);
    occlusion.castShadows = false;
    occlusion.receiveShadows = false;
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
    // La malla, la textura y los materiales son compartidos: solo se libera la
    // entidad. La caché los destruye cuando se destruye la aplicación.
    this.root.destroy();
  }
}
