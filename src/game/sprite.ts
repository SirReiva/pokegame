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
import { spriteOutlineWidth } from './spriteDetail';
import { applySpriteShading } from './spriteOutline';
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

/**
 * Orden en el que se crean las capas de un billboard. Las básicas primero para
 * que el cuerpo aparezca cuanto antes al arrancar una partida.
 */
export const BILLBOARD_ANIMATION_ORDER: AnimationName[] = [
  ...ANIMATIONS,
  ...OPTIONAL_ANIMATIONS.map((animation) => animation.name)
];

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
 * Constante de tiempo (s) del gris del KO. Es un suavizado exponencial: a los
 * ~3× este valor el cuerpo ya está prácticamente gris, así que acompaña al clip
 * `faint` (que dura del orden de medio segundo) sin retrasarse.
 */
const DESATURATION_SECONDS = 0.08;

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
  if (width <= 0 || height <= 0) return full;
  // `width`/`height` son de una celda; la hoja tiene una celda por frame.
  return {
    width: width * animation.columns,
    height: height * animation.rows
  };
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
 * - Las pequeñas suben hasta `smoothScale` (4 por defecto), o hasta el techo de
 *   densidad que permita el tamaño real de la vista (`maxScale`).
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
  budgetMB: number,
  maxScale: number
): Map<AnimationName, number> {
  const maxDimension = device.maxTextureSize;
  const budget = Math.max(1, budgetMB) * 1024 * 1024;
  // Techo común: ni más del que necesita la vista, ni más del que permite el
  // modo de filtrado.
  const ceiling = Math.max(
    1,
    Math.min(SPRITE_TEXTURE_SCALE, Math.round(maxScale))
  );
  const items = sheets.map(({ name, animation }) => {
    const { width, height } = sheetSizeFor(name, animation);
    let scale = ceiling;
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
  const usesScript = (
    script: readonly { clip: AnimationName }[] | null | undefined
  ): boolean => script?.some((step) => step.clip === animation) ?? false;
  const uses = (ability: {
    animation?: AnimationName | null;
    startupAnimation?: AnimationName | null;
    presentation?: readonly { clip: AnimationName }[] | null;
    presentationBySpecies?: Readonly<
      Record<string, readonly { clip: AnimationName }[]>
    > | null;
  } | null) =>
    ability?.animation === animation ||
    ability?.startupAnimation === animation ||
    usesScript(ability?.presentation) ||
    usesScript(ability?.presentationBySpecies?.[entry.id]);
  if (moveset?.some((id) => (id ? uses(ABILITIES[id]) : false))) return true;
  // El instinto común (Impulso usa QuickStrike) también necesita su hoja,
  // incluidos los overrides de animación por Pokémon.
  if (Object.values(COMMON_ABILITIES).some((ability) => uses(ability))) return true;
  return Object.values(COMMON_ANIMATION_OVERRIDES[entry.id] ?? {}).includes(
    animation
  );
}

/** Recorte común de todas las filas de una animación, en píxeles del arte. */
interface TightInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

/**
 * Calcula el recorte tight a partir del manifiesto. Devuelve `null` cuando la
 * animación debe usar el frame completo (filas sin metadatos).
 *
 * `left/right/top/bottom` son distancias desde el ancla hasta el píxel más
 * extremo (inclusive), así que el arte ocupa `left + right + 1` columnas: sin
 * el +1 se recortaba la última columna/fila visible de cada frame (el hocico
 * en las direcciones que miran a la derecha).
 */
function tightInsetsFor(animation: SpriteAnimation): TightInsets | null {
  const rows = animation.contentRows;
  if (!rows || rows.length !== animation.rows) return null;

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

  const width = left + right + 1;
  const height = top + bottom + 1;
  return width > 0 && height > 0
    ? { left, right, top, bottom, width, height }
    : null;
}

/**
 * Permisos simultáneos para componer hojas. Cada hoja reserva su canvas y su
 * bitmap final, que a ×4 pueden ser decenas de MB; con las 8 especies de una
 * partida cargando a la vez el pico se disparaba y el GC provocaba tirones
 * durante la pantalla de carga. La descarga de las imágenes sigue siendo
 * paralela: el límite solo cubre el trabajo de CPU/GPU.
 */
const SHEET_SLOTS = 2;
let sheetSlotsInUse = 0;
const sheetSlotWaiters: Array<() => void> = [];

async function withSheetSlot<T>(task: () => Promise<T>): Promise<T> {
  while (sheetSlotsInUse >= SHEET_SLOTS) {
    await new Promise<void>((resolve) => sheetSlotWaiters.push(resolve));
  }
  sheetSlotsInUse += 1;
  try {
    return await task();
  } finally {
    sheetSlotsInUse -= 1;
    sheetSlotWaiters.shift()?.();
  }
}

/** Hoja definitiva lista para subir a la GPU. */
interface PreparedSheet {
  /** Bitmap final; si `owned`, se cierra automáticamente tras la subida. */
  source: LoadedImage;
  /** Metadatos recalculados cuando se aplicó el recorte tight. */
  animation: SpriteAnimation;
  /**
   * Escala realmente horneada en el bitmap. Normalmente coincide con la
   * planificada; el camino de reserva sin canvas no puede escalar y devuelve 1.
   */
  scale: number;
  /** El bitmap ya viene volteado y la textura no debe repetir el volteo. */
  flipped: boolean;
  /** `true` si la fuente es temporal y nadie más la va a usar. */
  owned: boolean;
}

/**
 * Genera la hoja definitiva en **una sola pasada** de `drawImage`: recorte
 * tight, escalado nearest y volteo vertical (la fila 0 tiene que quedar en
 * V=1, ver `applyFrame`).
 *
 * Antes se encadenaban hasta tres canvas completos por hoja (tight, upscale y
 * flip); sus picos de memoria se sumaban al cargar varias especies en paralelo.
 * Ahora solo existe el canvas final y el `ImageBitmap` que lo sube.
 */
async function prepareSpriteSheet(
  image: LoadedImage,
  name: AnimationName,
  animation: SpriteAnimation,
  scale: number
): Promise<PreparedSheet> {
  const insets = PRESERVE_FRAME_MOTION.has(name)
    ? null
    : tightInsetsFor(animation);
  // `insets` mide una celda; el canvas contiene todas las columnas y filas.
  const cellWidth = insets ? insets.width : animation.frameWidth;
  const cellHeight = insets ? insets.height : animation.frameHeight;
  const width = Math.max(
    1,
    Math.round(cellWidth * animation.columns * scale)
  );
  const height = Math.max(
    1,
    Math.round(cellHeight * animation.rows * scale)
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    // Sin canvas no se puede voltear a mano: se devuelve el bitmap original y
    // `createSpriteTexture` deja que `setTextureSource` haga el volteo.
    return { source: image, animation, scale: 1, flipped: false, owned: false };
  }

  context.imageSmoothingEnabled = false;
  // Volteo vertical del lienzo completo: el bitmap final ya sale con la
  // orientación que espera el motor, sin un canvas intermedio.
  context.translate(0, height);
  context.scale(1, -1);

  if (insets) {
    for (let row = 0; row < animation.rows; row++) {
      const content = animation.contentRows?.[row];
      if (!content) continue;
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
        context.drawImage(
          image,
          cropX,
          cropY,
          cropWidth,
          cropHeight,
          (column * insets.width + (insets.left - content.left)) * scale,
          (row * insets.height + (insets.top - content.top)) * scale,
          cropWidth * scale,
          cropHeight * scale
        );
      }
    }
  } else {
    context.drawImage(image, 0, 0, width, height);
  }

  const bitmap = await createImageBitmap(canvas);
  // El canvas puede ocupar decenas de MB: se libera en el acto.
  canvas.width = 0;
  canvas.height = 0;

  if (!insets) {
    return { source: bitmap, animation, scale, flipped: true, owned: true };
  }

  const anchors = Array.from(
    { length: animation.columns * animation.rows },
    () => ({ x: insets.left, y: insets.top })
  );
  const bottoms = animation.bottoms.map((bottom, index) =>
    bottom < 0 ? -1 : bottom - animation.anchors[index].y + insets.top
  );

  return {
    source: bitmap,
    animation: {
      ...animation,
      frameWidth: insets.width,
      frameHeight: insets.height,
      anchors,
      bottoms,
      content: undefined,
      contentRows: undefined
    },
    scale,
    flipped: true,
    owned: true
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
 * Sube la hoja ya compuesta (`prepareSpriteSheet`) a una textura.
 *
 * La fuente se marca para liberarse después de la subida: PlayCanvas cierra el
 * `ImageBitmap` en cuanto la GPU tiene su copia. Sin esto, las 8 especies de una
 * partida de 8 vistas retenían a la vez todas las hojas de CPU además de las de
 * GPU. Si el dispositivo se pierde, estas texturas no pueden re-subirse desde
 * CPU; es el precio de no retener ~100 MB durante toda la partida.
 */
function createSpriteTexture(
  device: pc.GraphicsDevice,
  sheet: PreparedSheet,
  name: string
): pc.Texture {
  const mode = CONFIG.sprite.filter;
  // NEAREST mantiene los bloques del píxel art. 'smooth' y 'linear' interpolan;
  // la diferencia es que 'smooth' lo hace sobre una textura de más resolución.
  const filter = mode === 'nearest' ? pc.FILTER_NEAREST : pc.FILTER_LINEAR;
  const texture = new pc.Texture(device, {
    name,
    width: sheet.source.width,
    height: sheet.source.height,
    format: pc.PIXELFORMAT_RGBA8,
    srgb: true,
    mipmaps: false,
    minFilter: filter,
    magFilter: filter,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: pc.ADDRESS_CLAMP_TO_EDGE,
    // `prepareSpriteSheet` ya entrega la hoja volteada para que la fila 0 de la
    // hoja quede en V=1. Solo el camino de reserva (sin canvas) pide `flipY`
    // manual en `setTextureSource`.
    flipY: !sheet.flipped
  });
  setTextureSource(texture, sheet.source);
  if (sheet.owned) texture.setReleaseSourceAfterUpload();
  return texture;
}

export async function loadSpriteAsset(
  device: pc.GraphicsDevice,
  entry: PokemonEntry,
  skin: PokemonSkin = defaultSkinFor(entry),
  budgetMB: number = CONFIG.sprite.textureBudgetMB > 0
    ? CONFIG.sprite.textureBudgetMB
    : FALLBACK_SPRITE_BUDGET_MB,
  /**
   * Techo de escala según lo que ocupa el sprite en la vista más pequeña de la
   * partida. `SPRITE_TEXTURE_SCALE` (el valor por defecto) mantiene el
   * comportamiento de una sola vista.
   */
  maxScale: number = SPRITE_TEXTURE_SCALE
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
  const scales = planTextureScales(device, sheets, budgetMB, maxScale);

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

  const createFor = async (
    name: AnimationName,
    image: LoadedImage,
    animation: SpriteAnimation
  ) => {
    // Charge conserva su vibración interna: se usa el frame completo y un
    // ancla fija, porque el recorte tight recentraría cada frame.
    const insets = PRESERVE_FRAME_MOTION.has(name)
      ? null
      : tightInsetsFor(animation);
    // La escala planificada se recorta solo si el tamaño real (por ejemplo,
    // tras un fallback a frame completo) no cabe en la GPU.
    const width =
      (insets ? insets.width : animation.frameWidth) * animation.columns;
    const height =
      (insets ? insets.height : animation.frameHeight) * animation.rows;
    const scale = clampTextureScale(
      device,
      width,
      height,
      scales.get(name) ?? 1
    );
    const sheet = await withSheetSlot(() =>
      prepareSpriteSheet(image, name, animation, scale)
    );
    if (sheet.animation !== animation) animations[name] = sheet.animation;
    textures[name] = createSpriteTexture(
      device,
      sheet,
      `${entry.id}-${skin.id}-${name}`
    );
    // La escala que leen las UV es la que de verdad se horneó en el bitmap.
    textureScales[name] = sheet.scale;
    // El bitmap de origen ya no hace falta: se cierra antes de pedir la
    // siguiente hoja para no acumular todas las decodificaciones.
    if (sheet.source !== image) image.close();
  };

  for (let index = 0; index < ANIMATIONS.length; index++) {
    const name = ANIMATIONS[index];
    await createFor(name, images[index], animations[name]);
  }

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
    await createFor(optional.name, image, animation);
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
  const geometry = billboardGeometryByAsset.get(asset);
  if (geometry) {
    for (const mesh of geometry.values()) mesh.destroy();
    geometry.clear();
    billboardGeometryByAsset.delete(asset);
  }
}

/**
 * Las mallas de un billboard solo dependen del sprite y de la animación, no de
 * la cámara ni del viewport. Antes cada copia del splitscreen creaba su propia
 * malla por animación; ahora todas las copias comparten la misma.
 */
const billboardGeometryByAsset = new WeakMap<
  SpriteAsset,
  Map<AnimationName, pc.Mesh>
>();

function billboardGeometry(
  device: pc.GraphicsDevice,
  asset: SpriteAsset,
  name: AnimationName,
  animation: SpriteAnimation,
  options: BillboardOptions
): pc.Mesh {
  let byAnimation = billboardGeometryByAsset.get(asset);
  if (!byAnimation) {
    byAnimation = new Map();
    billboardGeometryByAsset.set(asset, byAnimation);
  }
  const cached = byAnimation.get(name);
  if (cached) return cached;

  const sx = options.pixelScale;
  const sy = options.pixelScale * options.verticalStretch;
  const refAnchorY = animation.anchors[0]?.y ?? animation.frameHeight * 0.75;
  const content = animation.content;
  // Si el manifiesto trae el recorte de contenido, el plano se ajusta al
  // arte real alrededor del ancla. Si no, se usa el frame completo.
  const left = (content?.left ?? animation.frameWidth / 2) * sx;
  const right = (content?.right ?? animation.frameWidth / 2) * sx;
  const top = (content?.top ?? refAnchorY) * sy;
  const bottom = -(content?.bottom ?? (animation.frameHeight - refAnchorY)) * sy;

  const mesh = new pc.Mesh(device);
  mesh.setPositions([
    -left, bottom, 0,
    right, bottom, 0,
    right, top, 0,
    -left, top, 0
  ]);
  mesh.setUvs(0, [0, 0, 1, 0, 1, 1, 0, 1]);
  mesh.setIndices([0, 1, 2, 0, 2, 3]);
  mesh.update();
  // La caché conserva una referencia: al destruir las copias de una partida,
  // PlayCanvas no debe liberar la malla compartida.
  mesh.incRefCount();

  byAnimation.set(name, mesh);
  return mesh;
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
  /** Grosor del contorno, en píxeles del arte. */
  outlineWidth?: number;
  /**
   * No crea la capa de `idle` al construir el actor; `Game` las calienta por
   * tandas durante la cuenta atrás. Evita congelar la pantalla al empezar una
   * partida de 8 jugadores.
   */
  deferLayers?: boolean;
}

function createSpriteMaterial(
  texture: pc.Texture,
  alphaTest: number,
  outlineColor: readonly [number, number, number] | null
): pc.StandardMaterial {
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
  // El borde de equipo y el gris del KO viajan en este mismo material:
  // `alphaTestPS` dilata el alfa (solo si hay borde) y `emissivePS` tiñe los
  // píxeles que añade la dilatación y desatura el cuerpo al morir.
  applySpriteShading(material, outlineColor);
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
  /** Último `uDesaturate` subido a este material, para no repetir el uniform. */
  desaturation: number;
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
  private readonly asset: SpriteAsset;
  private readonly layers = new Map<AnimationName, FrameLayer>();
  private readonly options: BillboardOptions;

  private animation: AnimationName = 'idle';
  private frame = 0;
  private row = 0;
  private elapsed = 0;
  private playback = 1;
  /** Gris del KO actual y objetivo: 0 = color, 1 = escala de grises. */
  private desaturation = 0;
  private desaturationTarget = 0;
  /** Si es `false`, el clip se detiene en su último frame en vez de repetirse. */
  private loop = true;
  /**
   * Modo manual: el frame lo fija la simulación (plan de casteo) y el billboard
   * no avanza su propio reloj. Las copias de todas las vistas dibujan el mismo
   * frame, sin desfases.
   */
  private manual = false;
  private facingYaw = 0;
  /** Capa de render del viewport; se aplica también a las capas creadas después. */
  private layerId: number | null = null;
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
  /** UVs reutilizadas al cambiar de frame; asignar Vec2 nuevos generaba GC. */
  private readonly uvTiling = new pc.Vec2();
  private readonly uvOffset = new pc.Vec2();
  /** Paso de la dilatación del contorno, en UV; depende del recorte del frame. */
  private readonly outlineStep = new Float32Array(2);
  /** Celda de la hoja donde puede muestrear el contorno, ya con la V de PlayCanvas. */
  private readonly outlineMin = new Float32Array(2);
  private readonly outlineMax = new Float32Array(2);

  constructor(app: pc.AppBase, asset: SpriteAsset, options: BillboardOptions) {
    this.options = options;
    this.device = app.graphicsDevice;
    this.asset = asset;
    this.root = new pc.Entity(`actor-${asset.entry.id}`);
    this.pivot = new pc.Entity('sprite-billboard');
    this.root.addChild(this.pivot);
    app.root.addChild(this.root);

    // Las capas se crean al primer uso. Un actor recién nacido solo necesita
    // `idle`: montar todas las animaciones (y sus materiales) por cada copia
    // del splitscreen era el grueso del coste de arrancar una partida.
    this.row = this.computeRow(new pc.Vec3(0, 0, 10));
    if (!options.deferLayers) this.play('idle', true);
  }

  /**
   * Crea una capa concreta si falta y devuelve `true`. `Game` la llama por
   * tandas para repartir el coste de las animaciones entre frames.
   */
  prewarmStep(name: AnimationName): boolean {
    if (!this.hasAnimation(name) || this.layers.has(name)) return false;
    this.ensureLayer(name);
    return true;
  }

  /** `true` si el aspecto trae hoja y metadatos para esa animación. */
  private hasAnimation(name: AnimationName): boolean {
    return !!this.asset.skin.animations[name] && !!this.asset.textures[name];
  }

  /** Crea la capa de una animación la primera vez que se necesita. */
  private ensureLayer(name: AnimationName): FrameLayer | null {
    const existing = this.layers.get(name);
    if (existing) {
      // Una capa precalentada puede venir de antes de morir: al reactivarla hay
      // que ponerla al día para que el gris no salte un frame.
      this.applyDesaturation(existing);
      return existing;
    }
    const animation = this.asset.skin.animations[name];
    const texture = this.asset.textures[name];
    if (!animation || !texture) return null;
    const layer = this.createLayer(
      name,
      animation,
      texture,
      this.asset.textureScales[name] ?? SPRITE_TEXTURE_SCALE
    );
    this.layers.set(name, layer);
    layer.entity.enabled = name === this.animation;
    if (this.layerId !== null) {
      const render = layer.entity.render;
      if (render) render.layers = [this.layerId];
    }
    return layer;
  }

  private createLayer(
    name: AnimationName,
    animation: SpriteAnimation,
    texture: pc.Texture,
    textureScale: number
  ): FrameLayer {
    const refAnchorY = animation.anchors[0]?.y ?? animation.frameHeight * 0.75;

    // Malla compartida por todas las copias de este sprite y animación.
    const mesh = billboardGeometry(
      this.device,
      this.asset,
      name,
      animation,
      this.options
    );

    const material = createSpriteMaterial(
      texture,
      this.options.alphaTest,
      this.options.outlineColor ?? null
    );
    // Una capa creada a mitad del KO nace ya con el gris que toque.
    material.setParameter('uDesaturate', this.desaturation);
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
    render.meshInstances = [instance, silhouette];

    return {
      entity,
      material,
      mesh,
      animation,
      refAnchorY,
      textureScale,
      desaturation: this.desaturation,
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
    this.layerId = layerId;
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
   * Pide el gris del KO (0 = color, 1 = escala de grises). La caída se interpola
   * en `update()`, así que se puede llamar cada frame: repetir el mismo objetivo
   * no hace trabajo. Al revivir se recupera el color de golpe, para que el
   * Pokémon reaparezca vivo y no con un parpadeo gris.
   */
  setDesaturation(target: number): void {
    this.desaturationTarget = Math.min(1, Math.max(0, target));
    if (this.desaturationTarget >= this.desaturation) return;
    this.desaturation = this.desaturationTarget;
    const layer = this.layers.get(this.animation);
    if (layer) this.applyDesaturation(layer);
  }

  /** Sube el gris actual al material de una capa si aún no lo tenía. */
  private applyDesaturation(layer: FrameLayer): void {
    if (layer.desaturation === this.desaturation) return;
    layer.desaturation = this.desaturation;
    layer.material.setParameter('uDesaturate', this.desaturation);
  }

  private stepDesaturation(dt: number): void {
    if (this.desaturation === this.desaturationTarget) return;
    const blend = 1 - Math.exp(-dt / DESATURATION_SECONDS);
    const next =
      this.desaturation + (this.desaturationTarget - this.desaturation) * blend;
    // Se cierra en el objetivo: así el uniform deja de subirse cada frame.
    this.desaturation =
      Math.abs(this.desaturationTarget - next) < 0.004
        ? this.desaturationTarget
        : next;
    const layer = this.layers.get(this.animation);
    if (layer) this.applyDesaturation(layer);
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
    const layer = this.ensureLayer(resolved);
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
      this.hasAnimation(candidate)
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
    this.ensureLayer(resolved);
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
    // Ancho y alto del arte en píxeles originales: es la unidad del grosor del
    // contorno, para que no dependa de la escala a la que se subió la hoja.
    const artWidth = content
      ? content.left + content.right + 1
      : animation.frameWidth;
    const artHeight = content
      ? content.top + content.bottom + 1
      : animation.frameHeight;

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

    const uvTiling = this.uvTiling.set(du, dv);
    const uvOffset = this.uvOffset.set(u0, v0);
    layer.material.emissiveMapTiling = uvTiling;
    layer.material.emissiveMapOffset = uvOffset;
    layer.material.opacityMapTiling = uvTiling;
    layer.material.opacityMapOffset = uvOffset;

    // La silueta reutiliza la misma celda de la hoja para que su recorte
    // coincida píxel a píxel con el sprite visible.
    layer.silhouetteMaterial.opacityMapTiling = uvTiling;
    layer.silhouetteMaterial.opacityMapOffset = uvOffset;

    // El contorno vive en el material del cuerpo: basta con indicarle cuánto es
    // un píxel de arte en UV para que la dilatación mida lo mismo en todas las
    // animaciones, tengan el recorte que tengan. Los límites evitan muestrear
    // frames vecinos de la hoja. PlayCanvas transforma la V como
    // `1 - offset - tiling`, así que los límites van ya volteados.
    if (this.options.outlineColor) {
      const width =
        this.options.outlineWidth ?? spriteOutlineWidth(this.asset, 0);
      this.outlineStep[0] = (du * width) / Math.max(1, artWidth);
      this.outlineStep[1] = (dv * width) / Math.max(1, artHeight);
      this.outlineMin[0] = u0;
      this.outlineMin[1] = 1 - v0 - dv;
      this.outlineMax[0] = u0 + du;
      this.outlineMax[1] = 1 - v0;
      layer.material.setParameter('uOutlineStep', this.outlineStep);
      layer.material.setParameter('uOutlineMin', this.outlineMin);
      layer.material.setParameter('uOutlineMax', this.outlineMax);
    }

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

    // 4. Gris del KO (interpolado; sin trabajo si ya está en el objetivo).
    this.stepDesaturation(dt);

    // 5. Billboard: solo giro en Y, se mantiene de pie.
    const dx = cameraPosition.x - this.root.getPosition().x;
    const dz = cameraPosition.z - this.root.getPosition().z;
    this.pivot.setLocalEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);

    // 6. Avance visual sobre el suelo para el movimiento interno vertical.
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
      // La malla es compartida por todas las copias del sprite y la libera
      // `disposeSpriteAsset`; aquí solo se destruyen los materiales, que sí son
      // exclusivos de esta copia.
      layer.material.destroy();
      layer.silhouetteMaterial.destroy();
    }
    this.layers.clear();
  }
}
