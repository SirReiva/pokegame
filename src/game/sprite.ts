import * as pc from 'playcanvas';
import { DEG, RAD } from './config';
import type { AnimationName, PokemonEntry, SpriteAnimation } from './types';

export interface SpriteAsset {
  entry: PokemonEntry;
  textures: Record<AnimationName, pc.Texture>;
}

const ANIMATIONS: AnimationName[] = ['idle', 'walk'];

/** Opacidad máxima de la silueta que se ve a través de los árboles. */
const SILHOUETTE_OPACITY = 0.72;
/** Por encima de las partículas y del agua, para que no la tapen. */
const SILHOUETTE_DRAW_ORDER = 4;

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`No se pudo cargar ${url}`));
    image.src = url;
  });
}

function createSpriteTexture(
  device: pc.GraphicsDevice,
  image: HTMLImageElement,
  name: string
): pc.Texture {
  const texture = new pc.Texture(device, {
    name,
    width: image.width,
    height: image.height,
    format: pc.PIXELFORMAT_RGBA8,
    srgb: true,
    mipmaps: false,
    minFilter: pc.FILTER_NEAREST,
    magFilter: pc.FILTER_NEAREST,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: pc.ADDRESS_CLAMP_TO_EDGE,
    // El arte se sube del revés para que la fila 0 de la hoja quede en V=1.
    flipY: true
  });
  texture.setSource(image);
  return texture;
}

export async function loadSpriteAsset(
  device: pc.GraphicsDevice,
  entry: PokemonEntry,
  onProgress?: () => void
): Promise<SpriteAsset> {
  const [idleImage, walkImage] = await Promise.all([
    loadImage(entry.animations.idle.sheet),
    loadImage(entry.animations.walk.sheet)
  ]);

  const textures = {
    idle: createSpriteTexture(device, idleImage, `${entry.id}-idle`),
    walk: createSpriteTexture(device, walkImage, `${entry.id}-walk`)
  };

  onProgress?.();
  return { entry, textures };
}

export function disposeSpriteAsset(asset: SpriteAsset): void {
  asset.textures.idle.destroy();
  asset.textures.walk.destroy();
}

interface BillboardOptions {
  pixelScale: number;
  verticalStretch: number;
  alphaTest: number;
  /** Pinta la silueta del actor cuando un obstáculo lo tapa desde la cámara. */
  silhouette?: boolean;
}

function createSpriteMaterial(texture: pc.Texture, alphaTest: number): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.name = `sprite-${texture.name}`;
  material.useLighting = false;
  material.useSkybox = false;
  material.useFog = true;
  material.diffuse = new pc.Color(0, 0, 0);
  material.emissive = new pc.Color(1, 1, 1);
  material.emissiveIntensity = 1;
  material.emissiveMap = texture;
  material.opacityMap = texture;
  material.opacityMapChannel = 'a';
  material.opacity = 1;
  material.alphaTest = alphaTest;
  material.blendType = pc.BLEND_NONE;
  material.depthWrite = true;
  material.depthTest = true;
  material.cull = pc.CULLFACE_NONE;
  material.update();
  return material;
}

/**
 * Silueta del sprite: misma malla y mismo recorte alfa, pero sin iluminación,
 * sin niebla y con la prueba de profundidad invertida (`FUNC_GREATER`). Así
 * solo se pinta en los píxeles donde ya hay algo más cerca que el Pokémon: el
 * árbol que lo tapa. Donde el sprite se ve, la profundidad es idéntica y la
 * silueta se descarta, de modo que el Pokémon nunca queda tapado por su propio
 * contorno. Es oclusión por píxel, sin raycasts ni comprobaciones por frame.
 */
function createSilhouetteMaterial(
  texture: pc.Texture,
  alphaTest: number
): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.name = `silhouette-${texture.name}`;
  material.useLighting = false;
  material.useSkybox = false;
  material.useFog = false;
  material.diffuse = new pc.Color(0, 0, 0);
  material.emissive = new pc.Color(1, 0.95, 0.82);
  material.emissiveIntensity = 1;
  material.opacityMap = texture;
  material.opacityMapChannel = 'a';
  material.opacity = SILHOUETTE_OPACITY;
  material.alphaTest = alphaTest;
  material.blendType = pc.BLEND_NORMAL;
  material.depthWrite = false;
  material.depthTest = true;
  material.depthFunc = pc.FUNC_GREATER;
  material.cull = pc.CULLFACE_NONE;
  material.update();
  return material;
}

interface FrameLayer {
  entity: pc.Entity;
  material: pc.StandardMaterial;
  mesh: pc.Mesh;
  animation: SpriteAnimation;
  refAnchorY: number;
  silhouette: pc.MeshInstance;
  silhouetteMaterial: pc.StandardMaterial;
}

/**
 * Billboard vertical de un sprite de 8 direcciones.
 *
 * - El actor conserva un rumbo propio (`facing`); NO mira siempre a cámara.
 * - El plano solo gira en Y para quedar de pie frente a la cámara.
 * - La fila visible se elige por el ángulo entre el rumbo del actor y la
 *   cámara, usando el eje "derecha de pantalla".
 * - El ancla de suelo de cada frame (`-Shadow.png`) se coloca en el origen.
 */
export class SpriteBillboard {
  readonly root: pc.Entity;

  private readonly pivot: pc.Entity;
  private readonly device: pc.GraphicsDevice;
  private readonly layers = new Map<AnimationName, FrameLayer>();
  private readonly options: BillboardOptions;

  private animation: AnimationName = 'idle';
  private frame = 0;
  private row = 0;
  private elapsed = 0;
  private playback = 1;
  private facingYaw = 0;
  private lastAppliedFrame = -1;
  private lastAppliedRow = -1;
  private lastAppliedAnimation: AnimationName | null = null;

  constructor(app: pc.Application, asset: SpriteAsset, options: BillboardOptions) {
    this.options = options;
    this.device = app.graphicsDevice;
    this.root = new pc.Entity(`actor-${asset.entry.id}`);
    this.pivot = new pc.Entity('sprite-billboard');
    this.root.addChild(this.pivot);
    app.root.addChild(this.root);

    for (const name of ANIMATIONS) {
      this.layers.set(name, this.createLayer(asset, name));
    }

    this.row = this.computeRow(new pc.Vec3(0, 0, 10));
    this.play('idle', true);
  }

  private createLayer(asset: SpriteAsset, name: AnimationName): FrameLayer {
    const animation = asset.entry.animations[name];
    const sx = this.options.pixelScale;
    const sy = this.options.pixelScale * this.options.verticalStretch;
    const halfWidth = animation.frameWidth / 2;
    const refAnchorY = animation.anchors[0]?.y ?? animation.frameHeight * 0.75;
    const top = refAnchorY * sy;
    const bottom = -(animation.frameHeight - refAnchorY) * sy;

    const mesh = new pc.Mesh(this.device);
    mesh.setPositions([
      -halfWidth * sx, bottom, 0,
      (animation.frameWidth - halfWidth) * sx, bottom, 0,
      (animation.frameWidth - halfWidth) * sx, top, 0,
      -halfWidth * sx, top, 0
    ]);
    mesh.setUvs(0, [0, 0, 1, 0, 1, 1, 0, 1]);
    mesh.setIndices([0, 1, 2, 0, 2, 3]);
    mesh.update();

    const material = createSpriteMaterial(asset.textures[name], this.options.alphaTest);
    const silhouetteMaterial = createSilhouetteMaterial(
      asset.textures[name],
      this.options.alphaTest
    );
    const entity = new pc.Entity(`sprite-${name}`);
    entity.addComponent('render');
    this.pivot.addChild(entity);
    const render = entity.render!;
    render.castShadows = false;
    render.receiveShadows = false;
    const instance = new pc.MeshInstance(mesh, material);
    const silhouette = new pc.MeshInstance(mesh, silhouetteMaterial);
    silhouette.castShadow = false;
    silhouette.receiveShadow = false;
    silhouette.drawOrder = SILHOUETTE_DRAW_ORDER;
    // La silueta se descarta sola donde el sprite está a la vista; basta con
    // tenerla activa. Solo el jugador la lleva, para no llenar la base de
    // contornos pálidos cuando los NPC quedan detrás de un árbol.
    silhouette.visible = this.options.silhouette === true;
    render.meshInstances = [instance, silhouette];

    return {
      entity,
      material,
      mesh,
      animation,
      refAnchorY,
      silhouette,
      silhouetteMaterial
    };
  }

  get currentAnimation(): AnimationName {
    return this.animation;
  }

  get currentRow(): number {
    return this.row;
  }

  setVisible(visible: boolean): void {
    this.root.enabled = visible;
  }

  setFacing(yaw: number): void {
    this.facingYaw = yaw;
  }

  setPlayback(rate: number): void {
    this.playback = rate;
  }

  play(name: AnimationName, restart = false): void {
    if (this.animation === name && !restart) return;
    this.animation = name;
    this.frame = 0;
    this.elapsed = 0;
    this.playback = 1;
    this.lastAppliedFrame = -1;
    this.lastAppliedRow = -1;
    for (const [key, layer] of this.layers) {
      layer.entity.enabled = key === name;
    }
    if (this.lastAppliedAnimation !== null) {
      this.applyFrame(true);
    }
  }

  private computeRow(cameraPosition: pc.Vec3): number {
    const dx = cameraPosition.x - this.root.getPosition().x;
    const dz = cameraPosition.z - this.root.getPosition().z;
    const length = Math.hypot(dx, dz);
    if (length < 0.0001) return this.row;
    const toCamX = dx / length;
    const toCamZ = dz / length;
    // Eje "derecha de pantalla" para una cámara con el horizonte nivelado.
    const rightX = toCamZ;
    const rightZ = -toCamX;
    const fx = Math.sin(this.facingYaw);
    const fz = Math.cos(this.facingYaw);
    const angle = Math.atan2(fx * rightX + fz * rightZ, fx * toCamX + fz * toCamZ) * RAD;
    let row = Math.round(angle / 45);
    row = ((row % 8) + 8) % 8;
    return row;
  }

  private applyFrame(force = false): void {
    const layer = this.layers.get(this.animation);
    if (!layer) return;
    if (
      !force &&
      this.lastAppliedAnimation === this.animation &&
      this.lastAppliedFrame === this.frame &&
      this.lastAppliedRow === this.row
    ) {
      return;
    }
    this.lastAppliedAnimation = this.animation;
    this.lastAppliedFrame = this.frame;
    this.lastAppliedRow = this.row;

    const animation = layer.animation;
    const index = this.row * animation.columns + this.frame;
    const anchor = animation.anchors[index] ?? {
      x: animation.frameWidth / 2,
      y: layer.refAnchorY
    };
    // El suelo es opaco: los píxeles que el arte dibuja por debajo del ancla
    // (una pata delantera, la cola, el borde del cuerpo) quedarían enterrados y
    // el sprite parecería cortado. Subimos solo esos frames lo justo para que
    // su píxel visible más bajo apoye en el ancla. Los frames que no llegan al
    // suelo no se tocan, así que se conserva el "bob" de la animación.
    const bottom = animation.bottoms?.[index] ?? -1;
    const lift = bottom >= 0 ? Math.max(0, bottom - anchor.y) : 0;

    const sx = this.options.pixelScale;
    const sy = this.options.pixelScale * this.options.verticalStretch;
    const offsetX = (animation.frameWidth / 2 - anchor.x) * sx;
    const offsetY = (anchor.y - layer.refAnchorY + lift) * sy;
    layer.entity.setLocalPosition(offsetX, offsetY, 0);

    // UVs con medio téxel de margen para no sangrar frames vecinos.
    const sheetWidth = animation.frameWidth * animation.columns;
    const sheetHeight = animation.frameHeight * animation.rows;
    const u0 = (this.frame * animation.frameWidth + 0.5) / sheetWidth;
    // PlayCanvas mide el offset V desde la parte superior de la textura, no
    // desde abajo. Por eso la fila se compensa con `1 - tiling - offset` dentro
    // del shader. Si usáramos la V "clásica" (1 - fila) veríamos la fila
    // espejada de la hoja.
    const v0 = (this.row * animation.frameHeight + 0.5) / sheetHeight;
    const du = (animation.frameWidth - 1) / sheetWidth;
    const dv = (animation.frameHeight - 1) / sheetHeight;

    layer.material.emissiveMapTiling = new pc.Vec2(du, dv);
    layer.material.emissiveMapOffset = new pc.Vec2(u0, v0);
    layer.material.opacityMapTiling = new pc.Vec2(du, dv);
    layer.material.opacityMapOffset = new pc.Vec2(u0, v0);

    // La silueta reutiliza la misma celda de la hoja para que su recorte
    // coincida píxel a píxel con el sprite visible.
    layer.silhouetteMaterial.opacityMapTiling = new pc.Vec2(du, dv);
    layer.silhouetteMaterial.opacityMapOffset = new pc.Vec2(u0, v0);

    // PlayCanvas solo recalcula uniforms y variantes de shader al llamar a
    // update(). Sin esta llamada, la celda visible se queda congelada en la
    // primera que se aplicó: la animación no avanza y la dirección nunca cambia.
    layer.material.update();
    if (layer.silhouette.visible) layer.silhouetteMaterial.update();
  }

  update(dt: number, cameraPosition: pc.Vec3): void {
    if (!this.root.enabled) return;

    const layer = this.layers.get(this.animation);
    if (!layer) return;

    // 1. Animación.
    const animation = layer.animation;
    this.elapsed += dt * Math.max(0.05, this.playback);
    let guard = 0;
    while (guard++ < 32) {
      const ticks = animation.durations[this.frame] ?? 6;
      const duration = Math.max(1 / 120, ticks / 60);
      if (this.elapsed < duration) break;
      this.elapsed -= duration;
      this.frame = (this.frame + 1) % animation.columns;
    }

    // 2. Dirección según cámara.
    this.row = this.computeRow(cameraPosition);

    // 3. Aplicar frame/dirección.
    this.applyFrame();

    // 4. Billboard: solo giro en Y, se mantiene de pie.
    const dx = cameraPosition.x - this.root.getPosition().x;
    const dz = cameraPosition.z - this.root.getPosition().z;
    this.pivot.setLocalEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
  }

  destroy(): void {
    this.root.destroy();
    for (const layer of this.layers.values()) {
      layer.mesh.destroy();
      layer.material.destroy();
      layer.silhouetteMaterial.destroy();
    }
    this.layers.clear();
  }
}
