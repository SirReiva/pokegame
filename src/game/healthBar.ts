/**
 * Barra de vida flotante sobre un Pokémon, con el nivel delante.
 *
 * Se dibuja dentro de PlayCanvas, igual que los números de daño: dos quads que
 * miran a la cámara del viewport. La barra mantiene su tamaño y proporción
 * originales; el nivel va en un distintivo aparte, más grande que la barra,
 * para que el número se lea a distancia.
 */

import * as pc from 'playcanvas';
import { DEG } from './config';
import { setTextureSource } from './textures';

/** Resolución de la barra de vida; mantiene la proporción (≈ 9:1). */
const BAR_TEXTURE_WIDTH = 256;
const BAR_TEXTURE_HEIGHT = 28;

/** Resolución del distintivo de nivel (cuadrado). */
const BADGE_TEXTURE_SIZE = 96;

/** Grosor del contorno y de la pista, en píxeles de la textura. */
const BORDER = 3;
const TRACK_PADDING = BORDER + 1;

/** Colores. */
const COLORS = {
  outline: '#050806',
  track: '#1c241c',
  high: '#4ddb6b',
  mid: '#fac832',
  low: '#ef4452',
  highlight: 'rgba(255, 255, 255, 0.22)'
} as const;

/** Orden de dibujo: por debajo de los números de daño (10). */
const DRAW_ORDER = 9;

export interface HealthBarOptions {
  width: number;
  height: number;
  /** Altura local sobre el suelo donde apoya la barra. */
  y: number;
  /** Color del equipo para el distintivo de nivel. */
  accent?: readonly [number, number, number];
}

/** Quad unitario apoyado en Y=0. */
function createQuadMesh(device: pc.GraphicsDevice): pc.Mesh {
  const mesh = new pc.Mesh(device);
  mesh.setPositions([
    -0.5, 0, 0,
    0.5, 0, 0,
    0.5, 1, 0,
    -0.5, 1, 0
  ]);
  mesh.setUvs(0, [0, 0, 1, 0, 1, 1, 0, 1]);
  mesh.setNormals([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  mesh.setIndices([0, 1, 2, 0, 2, 3]);
  mesh.update();
  return mesh;
}

function createTexture(
  device: pc.GraphicsDevice,
  name: string,
  width: number,
  height: number
): pc.Texture {
  return new pc.Texture(device, {
    name,
    width,
    height,
    format: pc.PIXELFORMAT_RGBA8,
    srgb: true,
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: pc.ADDRESS_CLAMP_TO_EDGE,
    // El canvas se sube igual que las hojas de sprite: la fila superior queda
    // en V=1, que es el borde superior del quad.
    flipY: true
  });
}

function createMaterial(texture: pc.Texture): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  material.useSkybox = false;
  material.useFog = false;
  material.diffuse = new pc.Color(0, 0, 0);
  material.emissive = new pc.Color(1, 1, 1);
  material.emissiveMap = texture;
  material.opacityMap = texture;
  material.opacityMapChannel = 'a';
  material.opacity = 1;
  material.alphaTest = 0;
  material.blendType = pc.BLEND_NORMAL;
  material.depthWrite = false;
  // Debe leerse aunque el Pokémon esté pegado a un árbol o al agua.
  material.depthTest = false;
  material.cull = pc.CULLFACE_NONE;
  material.update();
  return material;
}

function colorFor(fraction: number): string {
  if (fraction > 0.5) return COLORS.high;
  if (fraction > 0.25) return COLORS.mid;
  return COLORS.low;
}

/** Rectángulo redondeado compatible con el canvas 2D. */
function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

export class HealthBar {
  private readonly root: pc.Entity;
  private readonly mesh: pc.Mesh;

  private readonly barCanvas: HTMLCanvasElement;
  private readonly barContext: CanvasRenderingContext2D;
  private readonly barTexture: pc.Texture;
  private readonly barMaterial: pc.StandardMaterial;
  private readonly barRender: pc.RenderComponent;

  private readonly badgeRoot: pc.Entity;
  private readonly badgeCanvas: HTMLCanvasElement;
  private readonly badgeContext: CanvasRenderingContext2D;
  private readonly badgeTexture: pc.Texture;
  private readonly badgeMaterial: pc.StandardMaterial;
  private readonly accent: string;

  private fraction = 1;
  private level = 1;

  constructor(app: pc.AppBase, parent: pc.Entity, options: HealthBarOptions) {
    this.mesh = createQuadMesh(app.graphicsDevice);

    const barCanvas = document.createElement('canvas');
    barCanvas.width = BAR_TEXTURE_WIDTH;
    barCanvas.height = BAR_TEXTURE_HEIGHT;
    const barContext = barCanvas.getContext('2d');
    if (!barContext) throw new Error('No se pudo dibujar la barra de vida');
    this.barCanvas = barCanvas;
    this.barContext = barContext;

    const badgeCanvas = document.createElement('canvas');
    badgeCanvas.width = BADGE_TEXTURE_SIZE;
    badgeCanvas.height = BADGE_TEXTURE_SIZE;
    const badgeContext = badgeCanvas.getContext('2d');
    if (!badgeContext) throw new Error('No se pudo dibujar el nivel');
    this.badgeCanvas = badgeCanvas;
    this.badgeContext = badgeContext;

    const accent = options.accent ?? [255, 224, 102];
    this.accent = `rgb(${accent[0]}, ${accent[1]}, ${accent[2]})`;

    this.barTexture = createTexture(
      app.graphicsDevice,
      'health-bar',
      BAR_TEXTURE_WIDTH,
      BAR_TEXTURE_HEIGHT
    );
    this.barMaterial = createMaterial(this.barTexture);

    this.badgeTexture = createTexture(
      app.graphicsDevice,
      'level-badge',
      BADGE_TEXTURE_SIZE,
      BADGE_TEXTURE_SIZE
    );
    this.badgeMaterial = createMaterial(this.badgeTexture);

    this.root = new pc.Entity('health-bar');
    parent.addChild(this.root);
    this.root.setLocalPosition(0, options.y, 0);

    const barRoot = new pc.Entity('health-bar-fill');
    barRoot.addComponent('render');
    const barRender = barRoot.render!;
    barRender.castShadows = false;
    barRender.receiveShadows = false;
    const barInstance = new pc.MeshInstance(this.mesh, this.barMaterial);
    barInstance.drawOrder = DRAW_ORDER;
    barRender.meshInstances = [barInstance];
    barRoot.setLocalScale(options.width, options.height, 1);
    this.root.addChild(barRoot);
    this.barRender = barRender;

    // El distintivo es un cuadrado aparte para que no herede la altura tan
    // pequeña de la barra. Se centra verticalmente con ella y queda a su
    // izquierda, que es lo que se ve como "delante" desde la cámara.
    const badgeSize = pc.math.clamp(options.width * 0.5, 0.32, 0.46);
    const gap = badgeSize * 0.15;
    this.badgeRoot = new pc.Entity('level-badge');
    this.badgeRoot.addComponent('render');
    const badgeRender = this.badgeRoot.render!;
    badgeRender.castShadows = false;
    badgeRender.receiveShadows = false;
    const badgeInstance = new pc.MeshInstance(this.mesh, this.badgeMaterial);
    badgeInstance.drawOrder = DRAW_ORDER;
    badgeRender.meshInstances = [badgeInstance];
    this.badgeRoot.setLocalScale(badgeSize, badgeSize, 1);
    this.badgeRoot.setLocalPosition(
      -options.width / 2 - gap - badgeSize / 2,
      options.height / 2 - badgeSize / 2,
      0
    );
    this.root.addChild(this.badgeRoot);

    this.drawBar();
    this.drawBadge();
    setTextureSource(this.barTexture, this.barCanvas);
    setTextureSource(this.badgeTexture, this.badgeCanvas);
  }

  /** `fraction` va de 0 (KO) a 1 (vida completa); a 0 todo se oculta. */
  setFraction(fraction: number): void {
    const next = pc.math.clamp(fraction, 0, 1);
    if (next === this.fraction) return;
    this.fraction = next;
    this.root.enabled = next > 0;
    this.drawBar();
    setTextureSource(this.barTexture, this.barCanvas);
  }

  /** Nivel 1-10 que se muestra delante de la barra. */
  setLevel(level: number): void {
    const next = Math.max(1, Math.min(10, Math.floor(level)));
    if (next === this.level) return;
    this.level = next;
    this.drawBadge();
    setTextureSource(this.badgeTexture, this.badgeCanvas);
  }

  /** Redibuja el contorno, la pista y la porción de vida. */
  private drawBar(): void {
    const context = this.barContext;
    context.clearRect(0, 0, BAR_TEXTURE_WIDTH, BAR_TEXTURE_HEIGHT);

    context.fillStyle = COLORS.outline;
    context.fillRect(0, 0, BAR_TEXTURE_WIDTH, BAR_TEXTURE_HEIGHT);

    context.fillStyle = COLORS.track;
    context.fillRect(
      BORDER,
      BORDER,
      BAR_TEXTURE_WIDTH - BORDER * 2,
      BAR_TEXTURE_HEIGHT - BORDER * 2
    );

    if (this.fraction <= 0) return;

    const innerHeight = BAR_TEXTURE_HEIGHT - TRACK_PADDING * 2;
    const maxWidth = BAR_TEXTURE_WIDTH - TRACK_PADDING * 2;
    // Con vida casi agotada se deja un sliver visible en vez de desaparecer.
    const width = Math.max(2, Math.round(maxWidth * this.fraction));

    context.fillStyle = colorFor(this.fraction);
    context.fillRect(TRACK_PADDING, TRACK_PADDING, width, innerHeight);
    // Brillo superior para que el relleno no parezca plano.
    context.fillStyle = COLORS.highlight;
    context.fillRect(
      TRACK_PADDING,
      TRACK_PADDING,
      width,
      Math.max(1, Math.round(innerHeight * 0.18))
    );
  }

  /** Redibuja el distintivo con el número de nivel. */
  private drawBadge(): void {
    const context = this.badgeContext;
    const size = BADGE_TEXTURE_SIZE;
    context.clearRect(0, 0, size, size);

    roundedRect(context, 3, 3, size - 6, size - 6, 18);
    context.fillStyle = this.accent;
    context.fill();
    context.lineWidth = 5;
    context.strokeStyle = COLORS.outline;
    context.stroke();

    context.fillStyle = COLORS.outline;
    context.font = 'bold 72px ui-monospace, "Cascadia Mono", monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(this.level), size / 2, size / 2 + 2);
  }

  /** Orienta la barra para que su cara mire a la cámara de su viewport. */
  update(cameraPosition: pc.Vec3): void {
    if (!this.root.enabled) return;
    const position = this.root.getPosition();
    const dx = cameraPosition.x - position.x;
    const dy = cameraPosition.y - position.y;
    const dz = cameraPosition.z - position.z;
    const yaw = Math.atan2(dx, dz) / DEG;
    const pitch = Math.atan2(dy, Math.hypot(dx, dz)) / DEG;
    const rotation = new pc.Quat().setFromEulerAngles(0, yaw, 0);
    const tilt = new pc.Quat().setFromEulerAngles(-pitch, 0, 0);
    rotation.mul(tilt);
    this.root.setLocalRotation(rotation);
  }

  /** Capa de render exclusiva del viewport que debe ver esta copia. */
  setLayer(layerId: number): void {
    this.barRender.layers = [layerId];
    const badgeRender = this.badgeRoot.render;
    if (badgeRender) badgeRender.layers = [layerId];
  }

  destroy(): void {
    this.root.destroy();
    this.barMaterial.destroy();
    this.barTexture.destroy();
    this.badgeMaterial.destroy();
    this.badgeTexture.destroy();
    this.mesh.destroy();
  }
}
