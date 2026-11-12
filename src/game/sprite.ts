import * as pc from 'playcanvas';
import {
  ABILITIES,
  COMMON_ABILITIES,
  COMMON_ANIMATION_OVERRIDES,
  MOVESETS
} from './abilities';
import { resolveAnimationName } from './animationTimeline';
import { CONFIG, DEG, RAD } from './config';
import { FOG_EXCLUDED_STENCIL } from './fogStencil';
import { publicUrl } from './publicUrl';
import { defaultSkinFor } from './skins';
import { FALLBACK_SPRITE_BUDGET_MB } from './spriteBudget';
import { setTextureSource } from './textures';
import type {
  AnimationName,
  PokemonEntry,
  PokemonSkin,
  RequiredAnimationName,
  ResolvedAnimation,
  SpriteAnimation
} from './types';

/**
 * Imagen ya decodificada. Se usa `ImageBitmap` (y no `HTMLImageElement`)
 * porque WebGPU solo sube a textura bitmaps, canvas y vídeo:
 * `texture.setSource(HTMLImageElement)` se ignora en ese backend.
 */
export type LoadedImage = ImageBitmap;

export type SpriteTextures = Record<RequiredAnimationName, pc.Texture> & {
  faint?: pc.Texture;
  quickstrike?: pc.Texture;
  shock?: pc.Texture;
  shoot?: pc.Texture;
  charge?: pc.Texture;
  strike?: pc.Texture;
  twirl?: pc.Texture;
  shake?: pc.Texture;
  punch?: pc.Texture;
  hop?: pc.Texture;
};

export interface SpriteAsset {
  entry: PokemonEntry;
  /** Aspecto cargado: incluye las animaciones ya recortadas para el motor. */
  skin: PokemonSkin;
  textures: SpriteTextures;
  /** Factor de reescalado aplicado a cada hoja (puede ser menor en hojas grandes). */
  textureScales: Partial<Record<AnimationName, number>>;
  /** Retrato del aspecto, ya cargado para la marca de KO del suelo. */
  portrait: LoadedImage | null;
}

const ANIMATIONS: RequiredAnimationName[] = ['idle', 'walk', 'attack', 'hurt'];

/**
 * Animaciones con movimiento interno deliberado. No se recortan tight: usan el
 * frame completo para conservar el desplazamiento horizontal, y su movimiento
 * vertical se aplica como avance sobre el suelo (Attack, la vibración de Charge,
 * el zarpazo de Strike, el giro de Twirl, la embestida de Punch y el disparo de
 * Shoot).
 */
const PRESERVE_FRAME_MOTION: ReadonlySet<AnimationName> = new Set([
  'attack',
  'charge',
  'strike',
  'twirl',
  'punch',
  'shoot'
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
  { name: 'strike', requiresMoveset: true },
  { name: 'twirl', requiresMoveset: true },
  { name: 'shake', requiresMoveset: true },
  { name: 'punch', requiresMoveset: true },
  { name: 'hop', requiresMoveset: true, logLabel: 'Hop' }
];

const OPTIONAL_LAYER_NAMES: AnimationName[] = OPTIONAL_ANIMATIONS.map(
  (animation) => animation.name
);

/**
 * Devuelve el clip que realmente se dibuja para `name` en este aspecto. Es la
 * pieza que comparten el billboard y el plan de casteo para leer los
 * `HitFrame` del clip resuelto (no del nombre pedido).
 */
export function resolveAnimationClip(
  asset: SpriteAsset | null,
  name: AnimationName
): ResolvedAnimation | null {
  if (!asset) return null;
  const resolved = resolveAnimationName(
    name,
    (candidate) => asset.textures[candidate] !== undefined
  );
  const animation = asset.skin.animations[resolved];
  return animation ? { name: resolved, animation } : null;
}

/** Bytes por píxel de una textura RGBA8. */
const BYTES_PER_PIXEL = 4;

/** Opacidad máxima de la silueta que se ve a través de los árboles. */
const SILHOUETTE_OPACITY = 0.72;
/** Color por defecto de la silueta cuando no se indica el del equipo (0-255). */
const SILHOUETTE_COLOR: readonly [number, number, number] = [255, 242, 209];
/** Por encima de las partículas y del agua, para que no la tapen. */
const SILHOUETTE_DRAW_ORDER = 4;

/**
 * Contorno de equipo de los Pokémon ajenos. El grosor es proporcional al
 * tamaño del sprite, con un mínimo en unidades de mundo para que las especies
 * pequeñas también se distingan.
 */
const OUTLINE_SCALE = 0.06;
const OUTLINE_MIN_GROW = 0.04;
/**
 * El contorno vive un poco por detrás del cuerpo en el plano del billboard.
 * Así el cuerpo lo tapa por dentro pase lo que pase con el orden de dibujado:
 * solo se ve el borde que sobresale de la silueta.
 */
const OUTLINE_DEPTH = 0.035;
const OUTLINE_DRAW_ORDER = -1;

/**
 * Resolución de las texturas de sprite respecto a las celdas del manifiesto.
 * En modo 'smooth' la hoja se precarga a más resolución para que el filtrado
 * lineal posterior tenga un radio de suavizado de ~1 téxel, no de 1 píxel del
 * arte original.
 */
export const SPRITE_TEXTURE_SCALE =
  CONFIG.sprite.filter === 'smooth' ? CONFIG.sprite.smoothScale : 1;

/**
 * Dimensiones que tendrá la hoja al subirla a la GPU: el recorte tight si el
 * motor lo va a aplicar, o el frame completo de lo contrario. Se calcula desde
 * el manifiesto (sin decodificar la imagen) para repartir la escala de todas
 * las animaciones antes de crearlas.
 */
function sheetSizeFor(
  name: AnimationName,
  animation: SpriteAnimation
): { width: number; height: number } {
  const full = {
    width: animation.frameWidth * animation.columns,
    height: animation.frameHeight * animation.rows
  };
  const rows = animation.contentRows;
  if (
    PRESERVE_FRAME_MOTION.has(name) ||
    !rows ||
    rows.length !== animation.rows
  ) {
    return full;
  }

  let left = 0;
  let right = 0;
  let top = 0;
  let bottom = 0;
  for (const content of rows) {
    if (!content) return full;
    left = Math.max(left, content.left);
    right = Math.max(right, content.right);
    top = Math.max(top, content.top);
    bottom = Math.max(bottom, content.bottom);
  }

  const width = left + right + 1;
  const height = top + bottom + 1;
  return width > 0 && height > 0 ? { width, height } : full;
}

/** Bytes que ocuparía una hoja con esta escala. */
function textureBytes(width: number, height: number, scale: number): number {
  return width * scale * height * scale * BYTES_PER_PIXEL;
}

/**
 * Prioridad para conservar resolución cuando el presupuesto aprieta. Menor =
 * más importante: primero se reduce QuickStrike/Shock/Hop y al final idle,
 * walk, attack y hurt.
 */
const SCALE_PRIORITY: Partial<Record<AnimationName, number>> = {
  idle: 0,
  walk: 0,
  attack: 1,
  hurt: 1,
  faint: 2,
  shoot: 2,
  charge: 2,
  strike: 2,
  punch: 2,
  twirl: 2,
  shake: 2,
  quickstrike: 3,
  shock: 3,
  hop: 3
};

function scalePriority(name: AnimationName): number {
  return SCALE_PRIORITY[name] ?? 2;
}

/**
 * Reparte la escala de todas las hojas de un Pokémon.
 *
 * - Las pequeñas suben a `smoothScale` (4 por defecto).
 * - Ninguna pasa del límite real de la GPU (`device.maxTextureSize`).
 * - Si la suma supera el presupuesto (fijado en `textureBudgetMB` o detectado
 *   automáticamente), se reducen primero las hojas de menor prioridad
 *   (QuickStrike, Shock, Hop) y, dentro de la misma prioridad, las más grandes. Nunca se baja de ×2 mientras haya margen. Así las hojas
 *   gigantes dejan de caer a ×1, que era lo que las hacía verse borrosas con
 *   el filtrado lineal, sin sacrificar idle/walk/attack.
 */
function planTextureScales(
  device: pc.GraphicsDevice,
  sheets: ReadonlyArray<{ name: AnimationName; animation: SpriteAnimation }>,
  budgetMB: number
): Map<AnimationName, number> {
  const maxDimension = device.maxTextureSize;
  const budget = Math.max(1, budgetMB) * 1024 * 1024;
  const items = sheets.map(({ name, animation }) => {
    const { width, height } = sheetSizeFor(name, animation);
    let scale = SPRITE_TEXTURE_SCALE;
    while (
      scale > 1 &&
      (width * scale > maxDimension || height * scale > maxDimension)
    ) {
      scale -= 1;
    }
    return { name, width, height, scale };
  });

  const totalBytes = () =>
    items.reduce(
      (sum, item) => sum + textureBytes(item.width, item.height, item.scale),
      0
    );

  const reduceLargest = (minScale: number): void => {
    while (totalBytes() > budget) {
      let largest: (typeof items)[number] | null = null;
      for (const item of items) {
        if (item.scale <= minScale) continue;
        if (!largest) {
          largest = item;
          continue;
        }
        const priority = scalePriority(item.name);
        const largestPriority = scalePriority(largest.name);
        if (
          priority > largestPriority ||
          (priority === largestPriority &&
            textureBytes(item.width, item.height, item.scale) >
              textureBytes(largest.width, largest.height, largest.scale))
        ) {
          largest = item;
        }
      }
      if (!largest) return;
      largest.scale -= 1;
    }
  };

  // Primero se conserva un mínimo de ×2 en todas; solo si aun así no cabe se
  // permite bajar alguna a ×1.
  reduceLargest(2);
  reduceLargest(1);

  return new Map(items.map((item) => [item.name, item.scale]));
}

/** Recorta la escala si la imagen real no encaja en el límite de la GPU. */
function clampTextureScale(
  device: pc.GraphicsDevice,
  width: number,
  height: number,
  scale: number
): number {
  let result = scale;
  while (
    result > 1 &&
    (width * result > device.maxTextureSize ||
      height * result > device.maxTextureSize)
  ) {
    result -= 1;
  }
  return result;
}

/** ¿Alguna habilidad del moveset de este Pokémon usa esta animación? */
function movesetUsesAnimation(
  entry: PokemonEntry,
  animation: AnimationName
): boolean {
  const moveset = MOVESETS[entry.id];
  const uses = (ability: { animation?: AnimationName | null; startupAnimation?: AnimationName | null } | null) =>
    ability?.animation === animation || ability?.startupAnimation === animation;
  if (moveset?.some((id) => (id ? uses(ABILITIES[id]) : false))) return true;
  // El instinto común (Impulso usa QuickStrike) también necesita su hoja,
  // incluidos los overrides de animación por Pokémon.
  if (Object.values(COMMON_ABILITIES).some((ability) => uses(ability))) return true;
  return Object.values(COMMON_ANIMATION_OVERRIDES[entry.id] ?? {}).includes(
    animation
  );
}

/**
 * Genera una hoja recortada por dirección. Cada frame original puede tener
 * mucho espacio vacío (QuickStrike es el caso extremo); aquí se copia solo el
 * arte alrededor del ancla a una celda pequeña y se recoloca el ancla en una
 * posición fija. El renderizador puede seguir usando el frame completo, pero
 * ahora el plano está centrado en el personaje.
 */
function buildTightSheet(
  image: LoadedImage,
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

export async function loadImage(url: string): Promise<LoadedImage> {
  // El manifiesto puede traer rutas absolutas (`/sprites/...`); se adaptan al
  // `base` para que funcionen también bajo el subdirectorio de GitHub Pages.
  const resolved = publicUrl(url);
  const response = await fetch(resolved);
  if (!response.ok) {
    throw new Error(`No se pudo cargar ${resolved} (HTTP ${response.status})`);
  }
  // `ImageBitmap` es el único formato de imagen que WebGPU sube directamente
  // con `copyExternalImageToTexture`; además decodifica fuera del hilo principal.
  return createImageBitmap(await response.blob());
}

/**
 * Amplía la hoja duplicando téxeles (sin interpolar). El LINEAR posterior
 * solo suaviza las fronteras entre téxeles distintos, así que el contorno
 * queda antialiaseado pero el interior conserva los bloques del píxel art.
 */
function upscaleSheet(
  image: LoadedImage | HTMLCanvasElement,
  factor: number
): HTMLCanvasElement | LoadedImage {
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
  image: LoadedImage | HTMLCanvasElement,
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
  setTextureSource(texture, source);
  return texture;
}

export async function loadSpriteAsset(
  device: pc.GraphicsDevice,
  entry: PokemonEntry,
  skin: PokemonSkin = defaultSkinFor(entry),
  budgetMB: number = CONFIG.sprite.textureBudgetMB > 0
    ? CONFIG.sprite.textureBudgetMB
    : FALLBACK_SPRITE_BUDGET_MB
): Promise<SpriteAsset> {
  // El recorte tight reemplaza las celdas de cada animación. Se trabaja sobre
  // una copia: el manifiesto lo comparten la partida, las recargas de HMR y
  // cualquier remontaje, y mutarlo hacía que la segunda carga aplicara el
  // recorte ya recortado sobre la hoja original (sprite pequeño y desalineado).
  const animations = { ...skin.animations };

  // La escala se decide antes de cargar las imágenes: así el presupuesto se
  // reparte entre todas las hojas del Pokémon (también las opcionales) y las
  // grandes no dependen del orden en que se vayan encontrando.
  const sheets: Array<{ name: AnimationName; animation: SpriteAnimation }> =
    ANIMATIONS.map((name) => ({ name, animation: animations[name] }));
  for (const optional of OPTIONAL_ANIMATIONS) {
    const animation = animations[optional.name];
    if (!animation) continue;
    if (
      optional.requiresMoveset &&
      !movesetUsesAnimation(entry, optional.name)
    ) {
      continue;
    }
    sheets.push({ name: optional.name, animation });
  }
  const scales = planTextureScales(device, sheets, budgetMB);

  const [images, portrait] = await Promise.all([
    Promise.all(ANIMATIONS.map((name) => loadImage(animations[name].sheet))),
    // El retrato es opcional: si falta, la marca de KO cae a la X dibujada.
    loadImage(skin.portrait).catch((error) => {
      console.warn(
        `[sprite] No se pudo cargar el retrato de ${entry.id} (${skin.id}); la marca de KO usará la X.`,
        error
      );
      return null;
    })
  ]);

  const textures = {} as SpriteTextures;
  const textureScales: Partial<Record<AnimationName, number>> = {};

  const createFor = (
    name: AnimationName,
    image: LoadedImage,
    animation: SpriteAnimation
  ) => {
    // Charge conserva su vibración interna: se usa el frame completo y un
    // ancla fija, porque el recorte tight recentraría cada frame.
    const tight = PRESERVE_FRAME_MOTION.has(name)
      ? null
      : buildTightSheet(image, animation);
    if (tight) animations[name] = tight.animation;
    const source = tight?.canvas ?? image;
    // La escala planificada se recorta solo si la imagen real (por ejemplo,
    // tras un fallback a frame completo) no cabe en la GPU.
    const scale = clampTextureScale(
      device,
      source.width,
      source.height,
      scales.get(name) ?? 1
    );
    textures[name] = createSpriteTexture(
      device,
      source,
      `${entry.id}-${skin.id}-${name}`,
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

  return {
    entry,
    skin: { ...skin, animations },
    textures,
    textureScales,
    portrait
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
  /**
   * Color del contorno de equipo, en 0-255. Solo lo llevan las copias de los
   * Pokémon que no controla el jugador de ese viewport; `null` lo desactiva.
   */
  outlineColor?: readonly [number, number, number] | null;
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

/**
 * Contorno de equipo: una silueta sólida del mismo sprite, dibujada un poco
 * más grande y por detrás del cuerpo. Comparte el recorte alfa y la celda de la
 * hoja, pero no escribe profundidad para no competir con el sprite real.
 */
function createOutlineMaterial(
  texture: pc.Texture,
  alphaTest: number,
  color: readonly [number, number, number]
): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.name = `outline-${texture.name}`;
  material.useLighting = false;
  material.useSkybox = false;
  material.useFog = true;
  material.diffuse = new pc.Color(0, 0, 0);
  material.emissive = new pc.Color(color[0] / 255, color[1] / 255, color[2] / 255);
  material.emissiveIntensity = 1;
  material.opacityMap = texture;
  material.opacityMapChannel = 'a';
  material.opacity = 1;
  material.alphaTest = alphaTest;
  material.alphaToCoverage = CONFIG.sprite.alphaToCoverage;
  material.blendType = pc.BLEND_NONE;
  material.depthWrite = false;
  material.depthTest = true;
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
  outline: pc.MeshInstance | null;
  outlineMesh: pc.Mesh | null;
  outlineMaterial: pc.StandardMaterial | null;
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
  /**
   * Modo manual: el frame lo fija la simulación (plan de casteo) y el billboard
   * no avanza su propio reloj. Las copias de todas las vistas dibujan el mismo
   * frame, sin desfases.
   */
  private manual = false;
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

  constructor(app: pc.AppBase, asset: SpriteAsset, options: BillboardOptions) {
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
          asset.skin.animations[name],
          asset.textures[name],
          asset.textureScales[name] ?? SPRITE_TEXTURE_SCALE
        )
      );
    }
    for (const name of OPTIONAL_LAYER_NAMES) {
      const animation = asset.skin.animations[name];
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

    // Contorno de equipo: mismo recorte de la hoja, un poco más grande y un
    // poco por detrás del cuerpo. Al compartir la entidad, sigue el lift de los
    // frames y el giro del billboard sin trabajo extra.
    const outlineColor = this.options.outlineColor;
    let outlineMesh: pc.Mesh | null = null;
    let outlineMaterial: pc.StandardMaterial | null = null;
    let outline: pc.MeshInstance | null = null;
    if (outlineColor) {
      const growX = Math.max(OUTLINE_MIN_GROW, (left + right) * OUTLINE_SCALE);
      const growY = Math.max(OUTLINE_MIN_GROW, (top - bottom) * OUTLINE_SCALE);
      outlineMesh = new pc.Mesh(this.device);
      outlineMesh.setPositions([
        -(left + growX), bottom - growY, -OUTLINE_DEPTH,
        right + growX, bottom - growY, -OUTLINE_DEPTH,
        right + growX, top + growY, -OUTLINE_DEPTH,
        -(left + growX), top + growY, -OUTLINE_DEPTH
      ]);
      outlineMesh.setUvs(0, [0, 0, 1, 0, 1, 1, 0, 1]);
      outlineMesh.setIndices([0, 1, 2, 0, 2, 3]);
      outlineMesh.update();
      outlineMaterial = createOutlineMaterial(
        texture,
        this.options.alphaTest,
        outlineColor
      );
      outline = new pc.MeshInstance(outlineMesh, outlineMaterial);
      outline.castShadows = false;
      outline.receiveShadows = false;
      outline.drawOrder = OUTLINE_DRAW_ORDER;
      if (this.device.supportsStencil) {
        outline.stencilFront = FOG_EXCLUDED_STENCIL;
        outline.stencilBack = FOG_EXCLUDED_STENCIL;
      }
    }

    const entity = new pc.Entity(`sprite-${name}`);
    entity.addComponent('render');
    this.pivot.addChild(entity);
    const render = entity.render!;
    render.castShadows = false;
    render.receiveShadows = false;
    const instance = new pc.MeshInstance(mesh, material);
    const silhouette = new pc.MeshInstance(mesh, silhouetteMaterial);
    silhouette.castShadows = false;
    silhouette.receiveShadows = false;
    silhouette.drawOrder = SILHOUETTE_DRAW_ORDER;
    // Excluye el sprite de la niebla de guerra: si no, la mitad superior de un
    // Pokémon alto se oscurece con la sombra del suelo que queda detrás de su
    // cabeza. La silueta de oclusión también se marca para que no pierda
    // contraste bajo la niebla (ver `fogStencil.ts`).
    if (this.device.supportsStencil) {
      instance.stencilFront = FOG_EXCLUDED_STENCIL;
      instance.stencilBack = FOG_EXCLUDED_STENCIL;
      silhouette.stencilFront = FOG_EXCLUDED_STENCIL;
      silhouette.stencilBack = FOG_EXCLUDED_STENCIL;
    }
    // La silueta se descarta sola donde el sprite está a la vista; basta con
    // tenerla activa. Solo el jugador la lleva, para no llenar la base de
    // contornos pálidos cuando los NPC quedan detrás de un árbol.
    silhouette.visible = this.options.silhouette === true;
    render.meshInstances = outline
      ? [instance, outline, silhouette]
      : [instance, silhouette];

    return {
      entity,
      material,
      mesh,
      animation,
      refAnchorY,
      textureScale,
      silhouette,
      silhouetteMaterial,
      outline,
      outlineMesh,
      outlineMaterial
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

  get currentFrame(): number {
    return this.frame;
  }

  /**
   * Fija un frame concreto desde la simulación. Desactiva el avance automático
   * hasta llamar a `clearManual()`.
   */
  setManualFrame(name: AnimationName, frame: number): void {
    const resolved = this.resolveAnimation(name);
    const layer = this.layers.get(resolved);
    if (!layer) return;
    if (this.animation !== resolved) {
      this.animation = resolved;
      this.elapsed = 0;
      for (const [key, candidate] of this.layers) {
        candidate.entity.enabled = key === resolved;
      }
    }
    this.manual = true;
    this.loop = false;
    const maxFrame = Math.max(0, layer.animation.columns - 1);
    this.frame = Math.max(0, Math.min(maxFrame, Math.round(frame)));
    this.lastAppliedFrame = -1;
    this.applyFrame();
  }

  /** Vuelve al reloj automático (idle, walk, hurt...). */
  clearManual(): void {
    this.manual = false;
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
    const resolved = resolveAnimationName(name, (candidate) =>
      this.layers.has(candidate)
    );
    if (
      name === 'quickstrike' &&
      resolved !== 'quickstrike' &&
      !this.warnedMissingQuickstrike
    ) {
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

    // El contorno usa la misma celda: si no, el borde se quedaría con la pose
    // del primer frame.
    if (layer.outlineMaterial) {
      layer.outlineMaterial.opacityMapTiling = new pc.Vec2(du, dv);
      layer.outlineMaterial.opacityMapOffset = new pc.Vec2(u0, v0);
    }

    // PlayCanvas solo recalcula uniforms y variantes de shader al llamar a
    // update(). Sin esta llamada, la celda visible se queda congelada en la
    // primera que se aplicó: la animación no avanza y la dirección nunca cambia.
    layer.material.update();
    if (layer.silhouette.visible) layer.silhouetteMaterial.update();
    layer.outlineMaterial?.update();
  }

  update(dt: number, cameraPosition: pc.Vec3): void {
    if (!this.root.enabled) return;

    const layer = this.layers.get(this.animation);
    if (!layer) return;

    // 1. Animación. En modo manual el frame lo fija la simulación.
    if (!this.manual) {
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
      layer.outlineMesh?.destroy();
      layer.outlineMaterial?.destroy();
    }
    this.layers.clear();
  }
}
