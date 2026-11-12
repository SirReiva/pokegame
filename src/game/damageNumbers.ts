/**
 * Números de daño flotantes dentro de PlayCanvas.
 *
 * Cada impacto crea una copia del texto en cada viewport donde se ve al
 * objetivo. El texto no se dibuja por impacto: un atlas de glifos compartido se
 * construye una vez y cada número sólo compone quads de un mesh reutilizado,
 * tiñendo el material con el color del daño. El motor anima la subida, el
 * pequeño "pop" y el fadeout; React no participa.
 */

import * as pc from 'playcanvas';
import { DEG } from './config';
import { setTextureSource } from './textures';

export interface DamageNumberView {
  camera: pc.CameraComponent;
  layerId: number;
}

export interface DamageNumberOptions {
  x: number;
  y: number;
  z: number;
  amount: number;
  critical: boolean;
  effectiveness: number;
  /** `true` dibuja el número como curación (prefijo + y tono verde). */
  heal?: boolean;
  /** `true` añade una calavera al número: el golpe ha dejado al objetivo a 0 PV. */
  lethal?: boolean;
  /** `true` muestra la marca de inmunidad (🚫) en lugar de una cantidad. */
  immune?: boolean;
  views: DamageNumberView[];
}

const LIFETIME = 0.9;
const FADE_START = 0.45;
/** Tamaño objetivo en píxeles, independiente del viewport y del zoom. */
const TARGET_PIXELS = 30;
const TARGET_PIXELS_CRITICAL = 42;
const TARGET_PIXELS_HEAL = 26;

/**
 * Glifos máximos de un número. Los daños normales son de 1 a 4 cifras; el
 * margen cubre "!" y la calavera de los golpes mortales.
 */
const MAX_GLYPHS = 10;
const VERTEX_COUNT = MAX_GLYPHS * 4;
const INDEX_COUNT = MAX_GLYPHS * 6;
/** Entradas simultáneas como máximo; las que sobran se descartan. */
const MAX_ACTIVE_ENTRIES = 64;

/** Tamaño con el que se dibuja el atlas: se reduce al pintarlo en pantalla. */
const ATLAS_FONT_SIZE = 76;
const ATLAS_STROKE = 10;
const ATLAS_GLOW = 13;
/** Margen transparente de cada celda: deja sitio al contorno y al resplandor. */
const ATLAS_PAD = 28;
const ATLAS_CELL_HEIGHT = 104;
const ATLAS_MAX_WIDTH = 1024;

/** Calavera que marca un golpe mortal. */
const SKULL = '💀';
/** Marca que indica que el tipo del objetivo anula la habilidad. */
const IMMUNE = '🚫';
/** Glifos que forman parte del atlas. */
const GLYPHS = `0123456789+!${SKULL}${IMMUNE} `;
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

/** Estrategias de etiqueta: curación, crítico y daño normal. */
const LABELS: Record<
  'heal' | 'critical' | 'normal',
  (amount: number) => string
> = {
  heal: (amount) => `+${amount}`,
  critical: (amount) => `${amount}!`,
  normal: (amount) => `${amount}`
};

/** Estrategias de color de relleno del número. */
const FILL_COLORS: Record<
  'heal' | 'weak' | 'critical' | 'normal' | 'immune',
  string
> = {
  heal: '#6dff8e',
  weak: '#d46a75',
  critical: '#ff2d55',
  normal: '#ff4d5a',
  immune: '#e6e9ff'
};

/** Estrategias de resplandor: curación verde, daño rojo o inmunidad azul. */
const GLOW_COLORS: Record<'heal' | 'damage' | 'immune', string> = {
  heal: 'rgba(60, 255, 120, 0.9)',
  damage: 'rgba(255, 40, 70, 0.85)',
  immune: 'rgba(150, 180, 255, 0.9)'
};

function labelFor(options: DamageNumberOptions): string {
  if (options.immune) return IMMUNE;
  if (options.heal) return LABELS.heal(options.amount);
  const base = options.critical
    ? LABELS.critical(options.amount)
    : LABELS.normal(options.amount);
  return options.lethal ? `${base} ${SKULL}` : base;
}

function fillFor(
  critical: boolean,
  effectiveness: number,
  heal: boolean,
  immune: boolean
): string {
  const key = immune
    ? 'immune'
    : heal
      ? 'heal'
      : effectiveness < 1
        ? 'weak'
        : critical
          ? 'critical'
          : 'normal';
  return FILL_COLORS[key];
}

/** Glifo del atlas: celda, margen y avance, todo en píxeles. */
interface AtlasGlyph {
  char: string;
  x: number;
  y: number;
  width: number;
  advance: number;
  pad: number;
}

interface DamageAtlas {
  texture: pc.Texture;
  glyphs: Map<string, AtlasGlyph>;
  cellHeight: number;
  width: number;
  height: number;
}

/** Mesh, material y entidad reutilizables por un número activo. */
interface DamageSlot {
  entity: pc.Entity;
  instance: pc.MeshInstance;
  mesh: pc.Mesh;
  material: pc.StandardMaterial;
  positions: Float32Array;
  uvs: Float32Array;
  active: boolean;
}

interface DamageNumberEntry {
  slot: DamageSlot;
  camera: pc.CameraComponent;
  x: number;
  z: number;
  startY: number;
  rise: number;
  height: number;
  elapsed: number;
  duration: number;
}

/** Colores de emisión por estilo; se comparten entre materiales. */
const TINT_CACHE = new Map<string, pc.Color>();

/**
 * Cuaterniones reutilizados por `orient`. Se llama una vez por entrada y vista
 * en cada frame; crear dos `pc.Quat` ahí generaba cientos de objetos por frame
 * en partidas de 8 vistas.
 */
const ORIENT_ROTATION = new pc.Quat();
const ORIENT_TILT = new pc.Quat();

function tintFor(css: string): pc.Color {
  const cached = TINT_CACHE.get(css);
  if (cached) return cached;
  const hex = parseInt(css.slice(1), 16);
  const color = new pc.Color(
    ((hex >> 16) & 255) / 255,
    ((hex >> 8) & 255) / 255,
    (hex & 255) / 255
  );
  TINT_CACHE.set(css, color);
  return color;
}

const WHITE_TINT = new pc.Color(1, 1, 1);

/**
 * Dibuja una sola vez todos los glifos en blanco sobre un canvas. El color
 * final se aplica al material (`emissive`), así que un único atlas sirve para
 * daño, crítico, curación y debilidad.
 */
function createDamageAtlas(device: pc.GraphicsDevice): DamageAtlas {
  const measureCanvas = document.createElement('canvas');
  const measure = measureCanvas.getContext('2d');
  if (!measure) throw new Error('No se pudo medir el atlas de daño');

  const numberFont = `900 ${ATLAS_FONT_SIZE}px "Trebuchet MS", "Segoe UI", sans-serif`;
  const emojiFont = `${ATLAS_FONT_SIZE}px ${EMOJI_FONT}`;

  const glyphs = new Map<string, AtlasGlyph>();
  let penX = 0;
  let rowY = 0;
  let atlasWidth = 0;
  for (const char of GLYPHS) {
    const emoji = char === SKULL || char === IMMUNE;
    measure.font = emoji ? emojiFont : numberFont;
    const advance = Math.max(2, Math.ceil(measure.measureText(char).width));
    const width = advance + ATLAS_PAD * 2;
    // Reparto por filas: cada celda lleva su propio margen para el resplandor.
    if (penX > 0 && penX + width > ATLAS_MAX_WIDTH) {
      penX = 0;
      rowY += ATLAS_CELL_HEIGHT;
    }
    glyphs.set(char, { char, x: penX, y: rowY, width, advance, pad: ATLAS_PAD });
    penX += width;
    if (penX > atlasWidth) atlasWidth = penX;
  }
  const atlasHeight = rowY + ATLAS_CELL_HEIGHT;

  const canvas = document.createElement('canvas');
  canvas.width = atlasWidth;
  canvas.height = atlasHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo dibujar el atlas de daño');

  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.miterLimit = 2;
  for (const glyph of glyphs.values()) {
    if (glyph.char === ' ') continue;
    const emoji = glyph.char === SKULL || glyph.char === IMMUNE;
    const centerY = glyph.y + ATLAS_CELL_HEIGHT / 2;
    const x = glyph.x + glyph.pad;
    context.font = emoji ? emojiFont : numberFont;
    // El resplandor va en blanco para que el tinte del material lo coloree. La
    // inmunidad se dibuja ya en azul y se pinta sin tinte.
    context.shadowColor =
      glyph.char === IMMUNE ? GLOW_COLORS.immune : 'rgba(255, 255, 255, 0.9)';
    context.shadowBlur = ATLAS_GLOW;
    if (!emoji) {
      context.lineWidth = ATLAS_STROKE;
      context.strokeStyle = 'rgba(24, 4, 9, 0.96)';
      context.strokeText(glyph.char, x, centerY);
    }
    context.fillStyle = '#ffffff';
    context.fillText(glyph.char, x, centerY);
  }
  context.shadowBlur = 0;

  const texture = new pc.Texture(device, {
    name: 'damage-numbers-atlas',
    width: atlasWidth,
    height: atlasHeight,
    format: pc.PIXELFORMAT_RGBA8,
    srgb: true,
    // Sin mipmaps: al ser un atlas, los niveles bajos mezclarían celdas
    // vecinas y el resplandor de un glifo se vería en el de al lado.
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: pc.ADDRESS_CLAMP_TO_EDGE,
    // El canvas se sube igual que las hojas de sprite: la fila superior queda
    // en V=1, que es el borde superior del quad.
    flipY: true
  });
  setTextureSource(texture, canvas);

  return {
    texture,
    glyphs,
    cellHeight: ATLAS_CELL_HEIGHT,
    width: atlasWidth,
    height: atlasHeight
  };
}

export class DamageNumbers {
  private readonly app: pc.AppBase;
  private readonly device: pc.GraphicsDevice;
  private readonly atlas: DamageAtlas;
  private readonly slots: DamageSlot[] = [];
  private readonly entries: DamageNumberEntry[] = [];

  constructor(app: pc.AppBase) {
    this.app = app;
    this.device = app.graphicsDevice;
    this.atlas = createDamageAtlas(this.device);
  }

  private createSlot(): DamageSlot {
    const mesh = new pc.Mesh(this.device);
    // Se reserva el tamaño máximo de una vez: así el buffer de vértices nunca
    // se reasigna al cambiar de número.
    mesh.clear(true, true, VERTEX_COUNT, INDEX_COUNT);
    const positions = new Float32Array(VERTEX_COUNT * 3);
    const uvs = new Float32Array(VERTEX_COUNT * 2);
    mesh.setPositions(positions, 3, VERTEX_COUNT);
    mesh.setUvs(0, uvs, 2, VERTEX_COUNT);
    const normals = new Float32Array(VERTEX_COUNT * 3);
    for (let vertex = 0; vertex < VERTEX_COUNT; vertex++) normals[vertex * 3 + 2] = 1;
    mesh.setNormals(normals, 3, VERTEX_COUNT);
    // `setIndices` sólo acepta (datos, nº de índices): el formato lo deduce del
    // tamaño del buffer de vértices. Pasar aquí el formato dejaba la malla con
    // un único índice y no se dibujaba ningún triángulo.
    mesh.setIndices(this.buildIndices());
    mesh.update();

    const material = new pc.StandardMaterial();
    material.useLighting = false;
    material.useSkybox = false;
    material.useFog = false;
    material.diffuse = new pc.Color(0, 0, 0);
    material.emissive = WHITE_TINT;
    material.emissiveMap = this.atlas.texture;
    material.opacityMap = this.atlas.texture;
    material.opacityMapChannel = 'a';
    material.opacity = 1;
    material.alphaTest = 0;
    material.blendType = pc.BLEND_NORMAL;
    material.depthWrite = false;
    // Los números de daño deben leerse aunque el objetivo esté pegado a una
    // pared o bajo un árbol.
    material.depthTest = false;
    material.cull = pc.CULLFACE_NONE;
    material.update();

    const instance = new pc.MeshInstance(mesh, material);
    instance.drawOrder = 10;

    const entity = new pc.Entity('damage-number');
    entity.addComponent('render');
    const render = entity.render;
    if (render) {
      render.castShadows = false;
      render.receiveShadows = false;
      render.meshInstances = [instance];
    }
    entity.enabled = false;
    this.app.root.addChild(entity);

    return { entity, instance, mesh, material, positions, uvs, active: false };
  }

  /** Dos triángulos por glifo, en el mismo orden en todos los slots. */
  private buildIndices(): Uint16Array {
    const indices = new Uint16Array(INDEX_COUNT);
    for (let glyph = 0; glyph < MAX_GLYPHS; glyph++) {
      const vertex = glyph * 4;
      const offset = glyph * 6;
      indices[offset] = vertex;
      indices[offset + 1] = vertex + 1;
      indices[offset + 2] = vertex + 2;
      indices[offset + 3] = vertex;
      indices[offset + 4] = vertex + 2;
      indices[offset + 5] = vertex + 3;
    }
    return indices;
  }

  private acquireSlot(): DamageSlot | null {
    for (const slot of this.slots) {
      if (slot.active) continue;
      slot.active = true;
      slot.entity.enabled = true;
      return slot;
    }
    if (this.slots.length >= MAX_ACTIVE_ENTRIES) return null;
    const slot = this.createSlot();
    slot.active = true;
    slot.entity.enabled = true;
    this.slots.push(slot);
    return slot;
  }

  private release(slot: DamageSlot): void {
    slot.active = false;
    slot.entity.enabled = false;
  }

  /** Compone los quads del texto en el mesh del slot. */
  private writeGeometry(slot: DamageSlot, glyphs: readonly AtlasGlyph[]): void {
    const { positions, uvs } = slot;
    const cell = this.atlas.cellHeight;
    positions.fill(0);
    uvs.fill(0);

    // El ancho se centra en el origen: el quad ya no es fijo, cada número
    // necesita su propia geometría.
    let width = 0;
    for (const glyph of glyphs) width += glyph.advance / cell;
    const center = width / 2;

    let pen = 0;
    for (let index = 0; index < glyphs.length; index++) {
      const glyph = glyphs[index];
      const left = pen - glyph.pad / cell - center;
      const right = left + glyph.width / cell;
      const u0 = glyph.x / this.atlas.width;
      const u1 = (glyph.x + glyph.width) / this.atlas.width;
      const v1 = 1 - glyph.y / this.atlas.height;
      const v0 = 1 - (glyph.y + cell) / this.atlas.height;

      const p = index * 12;
      positions[p] = left;
      positions[p + 1] = 0;
      positions[p + 2] = 0;
      positions[p + 3] = right;
      positions[p + 4] = 0;
      positions[p + 5] = 0;
      positions[p + 6] = right;
      positions[p + 7] = 1;
      positions[p + 8] = 0;
      positions[p + 9] = left;
      positions[p + 10] = 1;
      positions[p + 11] = 0;

      const q = index * 8;
      uvs[q] = u0;
      uvs[q + 1] = v0;
      uvs[q + 2] = u1;
      uvs[q + 3] = v0;
      uvs[q + 4] = u1;
      uvs[q + 5] = v1;
      uvs[q + 6] = u0;
      uvs[q + 7] = v1;

      pen += glyph.advance / cell;
    }

    slot.mesh.setPositions(positions, 3, VERTEX_COUNT);
    slot.mesh.setUvs(0, uvs, 2, VERTEX_COUNT);
    slot.mesh.update();
  }

  /**
   * Altura en unidades de mundo que produce un tamaño legible en pantalla.
   * Tiene en cuenta el FOV, la distancia a la cámara y la altura del viewport.
   */
  private worldHeightFor(
    camera: pc.CameraComponent,
    x: number,
    y: number,
    z: number,
    critical: boolean,
    heal: boolean
  ): number {
    const { height: canvasHeight } = this.device.clientRect;
    const viewportHeight = Math.max(1, camera.rect.w * Math.max(1, canvasHeight));
    const cameraPosition = camera.entity.getPosition();
    const distance = Math.max(
      0.1,
      Math.hypot(x - cameraPosition.x, y - cameraPosition.y, z - cameraPosition.z)
    );
    const visibleHeight = 2 * Math.tan((camera.fov * DEG) / 2) * distance;
    const worldPerPixel = visibleHeight / viewportHeight;
    const targetPixels = heal
      ? TARGET_PIXELS_HEAL
      : critical
        ? TARGET_PIXELS_CRITICAL
        : TARGET_PIXELS;
    return pc.math.clamp(targetPixels * worldPerPixel, 0.16, 3);
  }

  /** Orienta el quad para que su cara mire a la cámara de su viewport. */
  private orient(entity: pc.Entity, camera: pc.CameraComponent): void {
    const position = entity.getPosition();
    const cameraPosition = camera.entity.getPosition();
    const dx = cameraPosition.x - position.x;
    const dy = cameraPosition.y - position.y;
    const dz = cameraPosition.z - position.z;
    const yaw = Math.atan2(dx, dz) / DEG;
    // La inclinación se calcula con la elevación real de la cámara respecto al
    // número; así el quad mira exactamente a esa cámara, no a un ángulo fijo.
    const pitch = Math.atan2(dy, Math.hypot(dx, dz)) / DEG;
    const rotation = ORIENT_ROTATION.setFromEulerAngles(0, yaw, 0);
    const tilt = ORIENT_TILT.setFromEulerAngles(-pitch, 0, 0);
    rotation.mul(tilt);
    entity.setRotation(rotation);
  }

  spawn(options: DamageNumberOptions): void {
    const label = labelFor(options);
    const glyphs: AtlasGlyph[] = [];
    for (const char of label) {
      const glyph = this.atlas.glyphs.get(char);
      if (!glyph) continue;
      glyphs.push(glyph);
      if (glyphs.length === MAX_GLYPHS) break;
    }
    if (glyphs.length === 0) return;

    const tint = options.immune
      ? WHITE_TINT
      : tintFor(fillFor(options.critical, options.effectiveness, options.heal ?? false, false));

    for (const view of options.views) {
      const slot = this.acquireSlot();
      if (!slot) break;

      this.writeGeometry(slot, glyphs);
      const height = this.worldHeightFor(
        view.camera,
        options.x,
        options.y,
        options.z,
        options.critical,
        options.heal ?? false
      );

      slot.material.emissive = tint;
      slot.material.opacity = 1;
      slot.material.update();

      const render = slot.entity.render;
      if (render) render.layers = [view.layerId];

      const entity = slot.entity;
      entity.setPosition(options.x, options.y, options.z);
      entity.setLocalScale(height, height, 1);
      this.orient(entity, view.camera);

      this.entries.push({
        slot,
        camera: view.camera,
        x: options.x,
        z: options.z,
        startY: options.y,
        // El ancho del texto ya está en la geometría; la subida escala con la
        // altura para que los números grandes suban más.
        rise: height * 0.55,
        height,
        elapsed: 0,
        duration: LIFETIME
      });
    }
  }

  update(dt: number): void {
    for (let index = this.entries.length - 1; index >= 0; index--) {
      const entry = this.entries[index];
      entry.elapsed += dt;
      const t = Math.min(1, entry.elapsed / entry.duration);

      // Mantiene el texto legible un momento y después se desvanece.
      entry.slot.material.opacity =
        t < FADE_START ? 1 : Math.max(0, 1 - (t - FADE_START) / (1 - FADE_START));
      entry.slot.material.update();

      const entity = entry.slot.entity;
      entity.setPosition(entry.x, entry.startY + entry.rise * t, entry.z);
      const pop =
        t < 0.18
          ? 0.82 + (t / 0.18) * 0.3
          : 1.12 - Math.min(1, (t - 0.18) / 0.82) * 0.12;
      const scale = entry.height * pop;
      entity.setLocalScale(scale, scale, 1);
      this.orient(entity, entry.camera);

      if (entry.elapsed < entry.duration) continue;
      this.release(entry.slot);
      this.entries.splice(index, 1);
    }
  }

  clear(): void {
    for (const entry of this.entries) this.release(entry.slot);
    this.entries.length = 0;
  }

  destroy(): void {
    this.clear();
    for (const slot of this.slots) {
      slot.entity.destroy();
      slot.material.destroy();
      slot.mesh.destroy();
    }
    this.slots.length = 0;
    this.atlas.texture.destroy();
  }
}
