import * as pc from 'playcanvas';
import { ABILITIES, MOVESETS } from './abilities';
import { CONFIG, DEG, RAD } from './config';
import { publicUrl } from './publicUrl';
import type {
  AnimationName,
  PokemonEntry,
  RequiredAnimationName,
  SpriteAnimation
} from './types';

export type SpriteTextures = Record<RequiredAnimationName, pc.Texture> & {
  faint?: pc.Texture;
  quickstrike?: pc.Texture;
  shock?: pc.Texture;
  shoot?: pc.Texture;
  charge?: pc.Texture;
  strike?: pc.Texture;
};

export interface SpriteAsset {
  entry: PokemonEntry;
  textures: SpriteTextures;
  /** Factor de reescalado aplicado a cada hoja (puede ser menor en hojas grandes). */
  textureScales: Partial<Record<AnimationName, number>>;
}

const ANIMATIONS: RequiredAnimationName[] = ['idle', 'walk', 'attack', 'hurt'];

/**
 * Animaciones con movimiento interno deliberado. No se recortan tight: usan el
 * frame completo para conservar el desplazamiento horizontal, y su movimiento
 * vertical se aplica como avance sobre el suelo (Attack, la vibración de Charge
 * y el zarpazo de Strike).
 */
const PRESERVE_FRAME_MOTION: ReadonlySet<AnimationName> = new Set([
  'attack',
  'charge',
  'strike'
]);

/**
 * Animaciones opcionales. `requiresMoveset` evita subir hojas grandes que
 * ningún Pokémon del roster usa (QuickStrike, Shock).
 */
const OPTIONAL_ANIMATIONS: ReadonlyArray<{
  name: AnimationName;
  requiresMoveset: boolean;
  logLabel?: string;
}> = [
  { name: 'faint', requiresMoveset: false },
  { name: 'quickstrike', requiresMoveset: true, logLabel: 'QuickStrike' },
  { name: 'shock', requiresMoveset: true, logLabel: 'Shock' },
  { name: 'shoot', requiresMoveset: true },
  { name: 'charge', requiresMoveset: true },
  { name: 'strike', requiresMoveset: true }
];

const OPTIONAL_LAYER_NAMES: AnimationName[] = OPTIONAL_ANIMATIONS.map(
  (animation) => animation.name
);

/** Límites para no crear texturas gigantes que la GPU no pueda subir. */
const MAX_TEXTURE_DIMENSION = 2048;
const MAX_TEXTURE_AREA = MAX_TEXTURE_DIMENSION * MAX_TEXTURE_DIMENSION;

/** Opacidad máxima de la silueta que se ve a través de los árboles. */
const SILHOUETTE_OPACITY = 0.72;
/** Color por defecto de la silueta cuando no se indica el del equipo (0-255). */
const SILHOUETTE_COLOR: readonly [number, number, number] = [255, 242, 209];
/** Por encima de las partículas y del agua, para que no la tapen. */
const SILHOUETTE_DRAW_ORDER = 4;

/**
 * Resolución de las texturas de sprite respecto a las celdas del manifiesto.
 * En modo 'smooth' la hoja se precarga a más resolución para que el filtrado
 * lineal posterior tenga un radio de suavizado de ~1 téxel, no de 1 píxel del
 * arte original.
 */
export const SPRITE_TEXTURE_SCALE =
  CONFIG.sprite.filter === 'smooth' ? CONFIG.sprite.smoothScale : 1;

/**
 * El modo `smooth` reescala la hoja para suavizar el contorno, pero una hoja
 * de ataque grande multiplicada por 3 puede superar el límite de textura de la
 * GPU. Se reduce el factor solo para esas hojas; las pequeñas siguen a máxima
 * calidad.
 */
function textureScaleFor(image: HTMLImageElement | HTMLCanvasElement): number {
  const base = SPRITE_TEXTURE_SCALE;
  let scale = base;
  while (
    scale > 1 &&
    (image.width * scale > MAX_TEXTURE_DIMENSION ||
      image.height * scale > MAX_TEXTURE_DIMENSION ||
      image.width * image.height * scale * scale > MAX_TEXTURE_AREA)
  ) {
    scale -= 1;
  }
  return scale;
}

/** ¿Alguna habilidad del moveset de este Pokémon usa esta animación? */
function movesetUsesAnimation(
  entry: PokemonEntry,
  animation: AnimationName
): boolean {
  const moveset = MOVESETS[entry.id];
  if (!moveset) return false;
  return moveset.some((id) => {
    if (!id) return false;
    const ability = ABILITIES[id];
    return (
      ability?.animation === animation ||
      ability?.windupAnimation === animation
    );
  });
}

/**
 * Genera una hoja recortada por dirección. Cada frame original puede tener
 * mucho espacio vacío (QuickStrike es el caso extremo); aquí se copia solo el
 * arte alrededor del ancla a una celda pequeña y se recoloca el ancla en una
 * posición fija. El renderizador puede seguir usando el frame completo, pero
 * ahora el plano está centrado en el personaje.
 */
function buildTightSheet(
  image: HTMLImageElement,
  animation: SpriteAnimation
): { canvas: HTMLCanvasElement; animation: SpriteAnimation } | null {
  const rows = animation.contentRows;
  if (!rows || rows.length !== animation.rows) return null;
  if (rows.some((content) => content === null)) return null;

  let left = 0;
  let right = 0;
  let top = 0;
  let bottom = 0;
  for (const content of rows) {
    if (!content) return null;
    left = Math.max(left, content.left);
    right = Math.max(right, content.right);
    top = Math.max(top, content.top);
    bottom = Math.max(bottom, content.bottom);
  }

  // `left/right/top/bottom` son distancias desde el ancla hasta el píxel más
  // extremo (inclusive), así que el arte ocupa `left + right + 1` columnas: sin
  // el +1 se recortaba la última columna/fila visible de cada frame (el hocico
  // en las direcciones que miran a la derecha).
  const width = left + right + 1;
  const height = top + bottom + 1;
  if (width <= 0 || height <= 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width * animation.columns;
  canvas.height = height * animation.rows;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.imageSmoothingEnabled = false;

  for (let row = 0; row < animation.rows; row++) {
    const content = rows[row];
    if (!content) return null;
    for (let column = 0; column < animation.columns; column++) {
      const index = row * animation.columns + column;
      const anchor = animation.anchors[index];
      // Coordenadas absolutas dentro de la hoja original: hay que sumar la
      // celda de la columna y la fila, no solo el recorte local del frame.
      const cropX =
        column * animation.frameWidth + anchor.x - content.left;
      const cropY =
        row * animation.frameHeight + anchor.y - content.top;
      const cropWidth = content.left + content.right + 1;
      const cropHeight = content.top + content.bottom + 1;
      const destX = column * width + (left - content.left);
      const destY = row * height + (top - content.top);
      context.drawImage(
        image,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        destX,
        destY,
        cropWidth,
        cropHeight
      );
    }
  }

  const anchors = Array.from(
    { length: animation.columns * animation.rows },
    () => ({ x: left, y: top })
  );
  const bottoms = animation.bottoms.map((bottom, index) =>
    bottom < 0 ? -1 : bottom - animation.anchors[index].y + top
  );

  return {
    canvas,
    animation: {
      ...animation,
      frameWidth: width,
      frameHeight: height,
      anchors,
      bottoms,
      content: undefined,
      contentRows: undefined
    }
  };
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  // El manifiesto puede traer rutas absolutas (`/sprites/...`); se adaptan al
  // `base` para que funcionen también bajo el subdirectorio de GitHub Pages.
  const resolved = publicUrl(url);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`No se pudo cargar ${resolved}`));
    image.src = resolved;
  });
}

/**
 * Amplía la hoja duplicando téxeles (sin interpolar). El LINEAR posterior
 * solo suaviza las fronteras entre téxeles distintos, así que el contorno
 * queda antialiaseado pero el interior conserva los bloques del píxel art.
 */
function upscaleSheet(
  image: HTMLImageElement | HTMLCanvasElement,
  factor: number
): HTMLCanvasElement | HTMLImageElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * factor);
  canvas.height = Math.round(image.height * factor);
  const ctx = canvas.getContext('2d');
  if (!ctx) return image;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function createSpriteTexture(
  device: pc.GraphicsDevice,
  image: HTMLImageElement | HTMLCanvasElement,
  name: string,
  scale: number
): pc.Texture {
  const mode = CONFIG.sprite.filter;
  const source = mode === 'smooth' && scale > 1 ? upscaleSheet(image, scale) : image;
  // NEAREST mantiene los bloques del píxel art. 'smooth' y 'linear' interpolan;
  // la diferencia es que 'smooth' lo hace sobre una textura de más resolución.
  const filter = mode === 'nearest' ? pc.FILTER_NEAREST : pc.FILTER_LINEAR;
  const texture = new pc.Texture(device, {
    name,
    width: source.width,
    height: source.height,
    format: pc.PIXELFORMAT_RGBA8,
    srgb: true,
    mipmaps: false,
    minFilter: filter,
    magFilter: filter,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: pc.ADDRESS_CLAMP_TO_EDGE,
    // El arte se sube del revés para que la fila 0 de la hoja quede en V=1.
    flipY: true
  });
  texture.setSource(source);
  return texture;
}

export async function loadSpriteAsset(
  device: pc.GraphicsDevice,
  entry: PokemonEntry,
  onProgress?: () => void
): Promise<SpriteAsset> {
  // El recorte tight reemplaza las celdas de cada animación. Se trabaja sobre
  // una copia: el manifiesto lo comparten la partida, las recargas de HMR y
  // cualquier remontaje, y mutarlo hacía que la segunda carga aplicara el
  // recorte ya recortado sobre la hoja original (sprite pequeño y desalineado).
  const animations = { ...entry.animations };
  const images = await Promise.all(
    ANIMATIONS.map((name) => loadImage(animations[name].sheet))
  );

  const textures = {} as SpriteTextures;
  const textureScales: Partial<Record<AnimationName, number>> = {};

  const createFor = (
    name: AnimationName,
    image: HTMLImageElement,
    animation: SpriteAnimation
  ) => {
    // Charge conserva su vibración interna: se usa el frame completo y un
    // ancla fija, porque el recorte tight recentraría cada frame.
    const tight = PRESERVE_FRAME_MOTION.has(name)
      ? null
      : buildTightSheet(image, animation);
    if (tight) animations[name] = tight.animation;
    const source = tight?.canvas ?? image;
    const scale = textureScaleFor(source);
    textures[name] = createSpriteTexture(
      device,
      source,
      `${entry.id}-${name}`,
      scale
    );
    textureScales[name] = scale;
  };

  ANIMATIONS.forEach((name, index) =>
    createFor(name, images[index], animations[name])
  );

  // Faint es opcional para el KO. QuickStrike y Shock solo se cargan si el
  // moveset del Pokémon realmente los usa; así no se suben hojas grandes que
  // nadie usa.
  for (const optional of OPTIONAL_ANIMATIONS) {
    const animation = animations[optional.name];
    if (!animation) continue;
    if (
      optional.requiresMoveset &&
      !movesetUsesAnimation(entry, optional.name)
    ) {
      continue;
    }
    const image = await loadImage(animation.sheet);
    createFor(optional.name, image, animation);
    if (optional.logLabel) {
      console.info(`[sprite] ${optional.logLabel} cargado para ${entry.id}`);
    }
  }

  onProgress?.();
  return {
    entry: { ...entry, animations },
    textures,
    textureScales
  };
}

export function disposeSpriteAsset(asset: SpriteAsset): void {
  for (const texture of Object.values(asset.textures)) texture?.destroy();
}

interface BillboardOptions {
  pixelScale: number;
  verticalStretch: number;
  alphaTest: number;
  /** Pinta la silueta del actor cuando un obstáculo lo tapa desde la cámara. */
  silhouette?: boolean;
  /** Color de esa silueta, en 0-255. Por defecto, el tono cálido de siempre. */
  silhouetteColor?: readonly [number, number, number];
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
  // Con MSAA activo, alpha-to-coverage reparte la cobertura del contorno entre
  // las muestras del píxel en lugar de recortarlo en seco.
  material.alphaToCoverage = CONFIG.sprite.alphaToCoverage;
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
  alphaTest: number,
  color: readonly [number, number, number]
): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.name = `silhouette-${texture.name}`;
  material.useLighting = false;
  material.useSkybox = false;
  material.useFog = false;
  material.diffuse = new pc.Color(0, 0, 0);
  material.emissive = new pc.Color(color[0] / 255, color[1] / 255, color[2] / 255);
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
  textureScale: number;
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
  /** Si es `false`, el clip se detiene en su último frame en vez de repetirse. */
  private loop = true;
  private facingYaw = 0;
  private lastAppliedFrame = -1;
  private lastAppliedRow = -1;
  private lastAppliedAnimation: AnimationName | null = null;
  private warnedMissingQuickstrike = false;
  /**
   * Desplazamiento visual sobre el suelo (unidades de mundo) para animaciones
   * con movimiento interno. Se aplica a favor de la cámara para que el envite
   * vertical no se entierre bajo el terreno.
   */
  private motionOffset = 0;

  constructor(app: pc.Application, asset: SpriteAsset, options: BillboardOptions) {
    this.options = options;
    this.device = app.graphicsDevice;
    this.root = new pc.Entity(`actor-${asset.entry.id}`);
    this.pivot = new pc.Entity('sprite-billboard');
    this.root.addChild(this.pivot);
    app.root.addChild(this.root);

    for (const name of ANIMATIONS) {
      this.layers.set(
        name,
        this.createLayer(
          name,
          asset.entry.animations[name],
          asset.textures[name],
          asset.textureScales[name] ?? SPRITE_TEXTURE_SCALE
        )
      );
    }
    for (const name of OPTIONAL_LAYER_NAMES) {
      const animation = asset.entry.animations[name];
      const texture = asset.textures[name];
      if (!animation || !texture) continue;
      this.layers.set(
        name,
        this.createLayer(
          name,
          animation,
          texture,
          asset.textureScales[name] ?? SPRITE_TEXTURE_SCALE
        )
      );
    }

    this.row = this.computeRow(new pc.Vec3(0, 0, 10));
    this.play('idle', true);
  }

  private createLayer(
    name: AnimationName,
    animation: SpriteAnimation,
    texture: pc.Texture,
    textureScale: number
  ): FrameLayer {
    const sx = this.options.pixelScale;
    const sy = this.options.pixelScale * this.options.verticalStretch;
    const refAnchorY = animation.anchors[0]?.y ?? animation.frameHeight * 0.75;
    const content = animation.content;
    // Si el manifiesto trae el recorte de contenido, el plano se ajusta al
    // arte real alrededor del ancla. Si no, se usa el frame completo.
    const left = (content?.left ?? animation.frameWidth / 2) * sx;
    const right = (content?.right ?? animation.frameWidth / 2) * sx;
    const top = (content?.top ?? refAnchorY) * sy;
    const bottom = -(content?.bottom ?? (animation.frameHeight - refAnchorY)) * sy;

    const mesh = new pc.Mesh(this.device);
    mesh.setPositions([
      -left, bottom, 0,
      right, bottom, 0,
      right, top, 0,
      -left, top, 0
    ]);
    mesh.setUvs(0, [0, 0, 1, 0, 1, 1, 0, 1]);
    mesh.setIndices([0, 1, 2, 0, 2, 3]);
    mesh.update();

    const material = createSpriteMaterial(texture, this.options.alphaTest);
    const silhouetteMaterial = createSilhouetteMaterial(
      texture,
      this.options.alphaTest,
      this.options.silhouetteColor ?? SILHOUETTE_COLOR
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
      textureScale,
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

  /** Mueve todas las capas del billboard a una capa de render de viewport. */
  setLayer(layerId: number): void {
    for (const layer of this.layers.values()) {
      const render = layer.entity.render;
      if (render) render.layers = [layerId];
    }
  }

  setFacing(yaw: number): void {
    this.facingYaw = yaw;
  }

  setPlayback(rate: number): void {
    this.playback = rate;
  }

  /**
   * Activa o desactiva la repetición del clip actual. Al cambiar de animación
   * vuelve a `true`; el motor lo desactiva solo durante preparaciones `once`.
   */
  setLoop(loop: boolean): void {
    this.loop = loop;
  }

  /**
   * Resuelve la animación disponible más cercana. `faint` cae a `hurt` y
   * `quickstrike` a `attack` cuando la especie no tiene esa hoja.
   */
  private resolveAnimation(name: AnimationName): AnimationName {
    if (this.layers.has(name)) return name;
    const fallbacks: AnimationName[] =
      name === 'faint'
        ? ['hurt', 'idle']
        : name === 'quickstrike' ||
            name === 'shock' ||
            name === 'shoot' ||
            name === 'charge' ||
            name === 'strike'
          ? ['attack', 'idle']
          : ['idle'];
    let resolved: AnimationName = 'idle';
    for (const fallback of fallbacks) {
      if (!this.layers.has(fallback)) continue;
      resolved = fallback;
      break;
    }
    if (name === 'quickstrike' && !this.warnedMissingQuickstrike) {
      this.warnedMissingQuickstrike = true;
      console.warn(
        `[sprite] QuickStrike no disponible para ${this.root.name}; usando ${resolved}`
      );
    }
    return resolved;
  }

  play(name: AnimationName, restart = false): void {
    const resolved = this.resolveAnimation(name);
    if (restart && resolved === 'quickstrike') {
      console.info(`[sprite] QuickStrike play en ${this.root.name}`);
    }
    if (this.animation === resolved && !restart) return;
    this.animation = resolved;
    this.frame = 0;
    this.elapsed = 0;
    this.playback = 1;
    this.loop = true;
    this.lastAppliedFrame = -1;
    this.lastAppliedRow = -1;
    for (const [key, layer] of this.layers) {
      layer.entity.enabled = key === resolved;
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
    const frameAnchor = animation.anchors[index] ?? {
      x: animation.frameWidth / 2,
      y: layer.refAnchorY
    };
    const preserveMotion = PRESERVE_FRAME_MOTION.has(this.animation);
    const reference =
      animation.anchors[this.row * animation.columns] ?? frameAnchor;
    // Con movimiento preservado se conserva el desplazamiento horizontal dentro
    // del frame, pero el vertical se convierte en un avance sobre el suelo: si
    // bajara el dibujo, esos píxeles quedarían por debajo del terreno.
    const anchor = preserveMotion
      ? { x: reference.x, y: frameAnchor.y }
      : frameAnchor;
    this.motionOffset = preserveMotion
      ? ((frameAnchor.y - reference.y) * this.options.pixelScale) /
        Math.max(0.2, Math.sin(CONFIG.camera.pitch * DEG))
      : 0;
    // El suelo es opaco: los píxeles que el arte dibuja por debajo del ancla
    // (una pata delantera, la cola, el borde del cuerpo) quedarían enterrados y
    // el sprite parecería cortado. Subimos solo esos frames lo justo para que
    // su píxel visible más bajo apoye en el ancla. Los frames que no llegan al
    // suelo no se tocan, así que se conserva el "bob" de la animación.
    const bottom = animation.bottoms?.[index] ?? -1;
    const lift = bottom >= 0 ? Math.max(0, bottom - anchor.y) : 0;

    const sx = this.options.pixelScale;
    const sy = this.options.pixelScale * this.options.verticalStretch;
    const scale = layer.textureScale;
    const frameWidth = animation.frameWidth * scale;
    const frameHeight = animation.frameHeight * scale;
    const sheetWidth = frameWidth * animation.columns;
    const sheetHeight = frameHeight * animation.rows;
    const content = animation.content;

    let u0: number;
    let v0: number;
    let du: number;
    let dv: number;

    if (content) {
      // Recorte tight alrededor del ancla: el plano deja de ser el frame
      // completo (con mucho espacio vacío) y el personaje queda centrado.
      const cropLeft = anchor.x - content.left;
      const cropTop = anchor.y - content.top;
      const cropWidth = content.left + content.right + 1;
      const cropHeight = content.top + content.bottom + 1;
      layer.entity.setLocalPosition(0, lift * sy, 0);
      u0 = (cropLeft * scale + 0.5) / sheetWidth;
      v0 = (cropTop * scale + 0.5) / sheetHeight;
      du = (cropWidth * scale - 1) / sheetWidth;
      dv = (cropHeight * scale - 1) / sheetHeight;
    } else {
      const offsetX = (animation.frameWidth / 2 - anchor.x) * sx;
      const offsetY = (anchor.y - layer.refAnchorY + lift) * sy;
      layer.entity.setLocalPosition(offsetX, offsetY, 0);
      u0 = (this.frame * frameWidth + 0.5) / sheetWidth;
      // PlayCanvas mide el offset V desde la parte superior de la textura, no
      // desde abajo. Por eso la fila se compensa con `1 - tiling - offset`.
      v0 = (this.row * frameHeight + 0.5) / sheetHeight;
      du = (frameWidth - 1) / sheetWidth;
      dv = (frameHeight - 1) / sheetHeight;
    }

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
    const lastFrame = animation.columns - 1;
    let guard = 0;
    while (guard++ < 32) {
      const ticks = animation.durations[this.frame] ?? 6;
      const duration = Math.max(1 / 120, ticks / 60);
      if (this.elapsed < duration) break;
      if (!this.loop && this.frame >= lastFrame) {
        // Clip de una sola pasada: se queda en el último frame.
        this.elapsed = duration;
        break;
      }
      this.elapsed -= duration;
      this.frame = this.loop ? (this.frame + 1) % animation.columns : this.frame + 1;
    }

    // 2. Dirección según cámara.
    this.row = this.computeRow(cameraPosition);

    // 3. Aplicar frame/dirección.
    this.applyFrame();

    // 4. Billboard: solo giro en Y, se mantiene de pie.
    const dx = cameraPosition.x - this.root.getPosition().x;
    const dz = cameraPosition.z - this.root.getPosition().z;
    this.pivot.setLocalEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);

    // 5. Avance visual sobre el suelo para el movimiento interno vertical.
    const distance = Math.hypot(dx, dz) || 1;
    this.pivot.setLocalPosition(
      (dx / distance) * this.motionOffset,
      0,
      (dz / distance) * this.motionOffset
    );
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
