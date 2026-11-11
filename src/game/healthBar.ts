/**
 * Barra de vida flotante sobre un Pokémon, con el nivel delante y una barra
 * fina de experiencia debajo.
 *
 * Se dibuja dentro de PlayCanvas, igual que los números de daño: varios quads
 * que miran a la cámara del viewport. La barra mantiene su tamaño y proporción
 * originales; el nivel va en un distintivo aparte, más grande que la barra,
 * para que el número se lea a distancia.
 */

import * as pc from 'playcanvas';
import { DEG } from './config';
import { FOG_EXCLUDED_STENCIL } from './fogStencil';
import { setTextureSource } from './textures';

/** Resolución de la barra de vida; mantiene la proporción (≈ 9:1). */
const BAR_TEXTURE_WIDTH = 256;
const BAR_TEXTURE_HEIGHT = 28;

/** Resolución de la barra de experiencia (fina, bajo la de vida). */
const XP_TEXTURE_WIDTH = 256;
const XP_TEXTURE_HEIGHT = 12;

/**
 * Resolución del distintivo de nivel (cuadrado). Se dibuja con margen de sobra
 * y se reduce con mipmaps: el badge ocupa ~20-50 px en pantalla, así que una
 * textura de 128 px evita que el número salga dentado al minificarse.
 */
const BADGE_TEXTURE_SIZE = 128;

/** Grosor del contorno y de la pista, en píxeles de la textura. */
const BORDER = 3;
const TRACK_PADDING = BORDER + 1;
const XP_BORDER = 2;
const XP_TRACK_PADDING = XP_BORDER + 1;

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

/**
 * Marca el quad para que la niebla de guerra no lo tiña. El Pokémon ya escribe
 * esténcil 1 (ver `sprite.ts`), pero la barra es una entidad aparte: sin esto
 * se oscurece con la sombra del suelo que queda detrás, aunque el Pokémon y la
 * propia barra estén a la vista.
 */
function excludeFromFog(instance: pc.MeshInstance, device: pc.GraphicsDevice): void {
  if (!device.supportsStencil) return;
  instance.stencilFront = FOG_EXCLUDED_STENCIL;
  instance.stencilBack = FOG_EXCLUDED_STENCIL;
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
    // Los textos y las barras se ven más pequeños que su textura: sin mipmaps
    // el muestreo lineal aliasea los bordes (el nivel salía dentado).
    mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
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
  // Recorta los píxeles transparentes del canvas: con `alphaTest` en 0 el quad
  // entero escribiría esténcil —incluidas las esquinas redondeadas del
  // distintivo— y la niebla dejaría un hueco rectangular a su alrededor.
  material.alphaTest = 0.05;
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

  private readonly xpCanvas: HTMLCanvasElement;
  private readonly xpContext: CanvasRenderingContext2D;
  private readonly xpTexture: pc.Texture;
  private readonly xpMaterial: pc.StandardMaterial;
  private readonly xpRender: pc.RenderComponent;

  private readonly badgeRoot: pc.Entity;
  private readonly badgeCanvas: HTMLCanvasElement;
  private readonly badgeContext: CanvasRenderingContext2D;
  private readonly badgeTexture: pc.Texture;
  private readonly badgeMaterial: pc.StandardMaterial;
  private readonly accent: string;
  private readonly badgeTextColor: string;

  private fraction = 1;
  private xpFraction = 0;
  /** Armadura de casteo restante respecto a la vida máxima (0-1). */
  private armorFraction = 0;
  private level = 1;

  constructor(app: pc.AppBase, parent: pc.Entity, options: HealthBarOptions) {
    const device = app.graphicsDevice;
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

    const xpCanvas = document.createElement('canvas');
    xpCanvas.width = XP_TEXTURE_WIDTH;
    xpCanvas.height = XP_TEXTURE_HEIGHT;
    const xpContext = xpCanvas.getContext('2d');
    if (!xpContext) throw new Error('No se pudo dibujar la experiencia');
    this.xpCanvas = xpCanvas;
    this.xpContext = xpContext;

    const accent = options.accent ?? [255, 224, 102];
    this.accent = `rgb(${accent[0]}, ${accent[1]}, ${accent[2]})`;
    // Texto oscuro sobre acentos claros y blanco sobre los oscuros: así el
    // nivel se lee también en equipos morados, azules o verdes.
    const luminance =
      (accent[0] * 299 + accent[1] * 587 + accent[2] * 114) / 1000;
    this.badgeTextColor = luminance >= 150 ? COLORS.outline : '#ffffff';

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

    this.xpTexture = createTexture(
      app.graphicsDevice,
      'xp-bar',
      XP_TEXTURE_WIDTH,
      XP_TEXTURE_HEIGHT
    );
    this.xpMaterial = createMaterial(this.xpTexture);

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
    excludeFromFog(barInstance, device);
    barRender.meshInstances = [barInstance];
    barRoot.setLocalScale(options.width, options.height, 1);
    this.root.addChild(barRoot);
    this.barRender = barRender;

    // El distintivo es un cuadrado aparte para que no herede la altura tan
    // pequeña de la barra. Se centra verticalmente con ella y queda a su
    // izquierda, que es lo que se ve como "delante" desde la cámara.
    const badgeSize = pc.math.clamp(options.width * 0.58, 0.36, 0.5);
    const gap = badgeSize * 0.15;
    this.badgeRoot = new pc.Entity('level-badge');
    this.badgeRoot.addComponent('render');
    const badgeRender = this.badgeRoot.render!;
    badgeRender.castShadows = false;
    badgeRender.receiveShadows = false;
    const badgeInstance = new pc.MeshInstance(this.mesh, this.badgeMaterial);
    badgeInstance.drawOrder = DRAW_ORDER;
    excludeFromFog(badgeInstance, device);
    badgeRender.meshInstances = [badgeInstance];
    this.badgeRoot.setLocalScale(badgeSize, badgeSize, 1);
    this.badgeRoot.setLocalPosition(
      -options.width / 2 - gap - badgeSize / 2,
      options.height / 2 - badgeSize / 2,
      0
    );
    this.root.addChild(this.badgeRoot);

    // La barra de experiencia se ancla justo debajo de la de vida, un poco más
    // estrecha para que se lea como un subrayado del propio Pokémon.
    const xpWidth = options.width * 0.86;
    const xpHeight = Math.max(0.03, options.height * 0.3);
    const xpGap = Math.max(0.012, options.height * 0.2);
    const xpRoot = new pc.Entity('xp-bar');
    xpRoot.addComponent('render');
    const xpRender = xpRoot.render!;
    xpRender.castShadows = false;
    xpRender.receiveShadows = false;
    const xpInstance = new pc.MeshInstance(this.mesh, this.xpMaterial);
    xpInstance.drawOrder = DRAW_ORDER;
    excludeFromFog(xpInstance, device);
    xpRender.meshInstances = [xpInstance];
    xpRoot.setLocalScale(xpWidth, xpHeight, 1);
    xpRoot.setLocalPosition(0, -xpGap - xpHeight, 0);
    this.root.addChild(xpRoot);
    this.xpRender = xpRender;

    this.drawBar();
    this.drawBadge();
    this.drawXpBar();
    setTextureSource(this.barTexture, this.barCanvas);
    setTextureSource(this.badgeTexture, this.badgeCanvas);
    setTextureSource(this.xpTexture, this.xpCanvas);
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

  /** `fraction` va de 0 (recién subido de nivel) a 1 (siguiente nivel). */
  setXpFraction(fraction: number): void {
    const next = pc.math.clamp(fraction, 0, 1);
    if (next === this.xpFraction) return;
    this.xpFraction = next;
    this.drawXpBar();
    setTextureSource(this.xpTexture, this.xpCanvas);
  }

  /**
   * Armadura de casteo restante como fracción de la vida máxima. El ancho de
   * la franja metálica representa el daño que aún puede absorber el
   * lanzamiento; 0 la oculta.
   */
  setArmorFraction(fraction: number): void {
    const next = pc.math.clamp(fraction, 0, 1);
    if (next === this.armorFraction) return;
    this.armorFraction = next;
    this.drawBar();
    setTextureSource(this.barTexture, this.barCanvas);
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

    this.drawArmorBand(context, innerHeight, maxWidth, width);
  }

  /**
   * Franja metálica de la armadura de casteo sobre la propia barra de vida.
   * Se alinea a la derecha con el tramo verde de la vida actual y comparte su
   * altura; su ancho es la armadura restante respecto a la vida máxima. Si la
   * armadura supera la vida actual, se recorta contra el borde izquierdo del
   * tramo para no salirse de la barra.
   */
  private drawArmorBand(
    context: CanvasRenderingContext2D,
    innerHeight: number,
    maxWidth: number,
    hpWidth: number
  ): void {
    if (this.armorFraction <= 0) return;

    const armorWidth = Math.max(2, Math.round(maxWidth * this.armorFraction));
    const width = Math.min(armorWidth, hpWidth);
    const x = TRACK_PADDING + hpWidth - width;
    const y = TRACK_PADDING;
    const height = innerHeight;

    const gradient = context.createLinearGradient(0, y, 0, y + height);
    gradient.addColorStop(0, '#eef6fd');
    gradient.addColorStop(0.42, '#a9bccd');
    gradient.addColorStop(1, '#5f7285');
    context.fillStyle = gradient;
    context.fillRect(x, y, width, height);

    // Rayado diagonal para que la franja se lea como metal.
    context.save();
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();
    context.strokeStyle = 'rgba(20, 30, 40, 0.3)';
    context.lineWidth = 1;
    for (let offset = -height; offset < width + height; offset += 5) {
      context.beginPath();
      context.moveTo(x + offset, y + height);
      context.lineTo(x + offset + height, y);
      context.stroke();
    }
    context.restore();

    context.fillStyle = 'rgba(255, 255, 255, 0.6)';
    context.fillRect(x, y, width, 1);
    context.fillStyle = 'rgba(5, 8, 6, 0.45)';
    context.fillRect(x, y, 1, height);
    context.fillStyle = 'rgba(255, 255, 255, 0.85)';
    context.fillRect(x + width - 1, y, 1, height);
    context.fillStyle = 'rgba(5, 8, 6, 0.5)';
    context.fillRect(x, y + height - 1, width, 1);
  }

  /** Redibuja el contorno, la pista y la porción de experiencia. */
  private drawXpBar(): void {
    const context = this.xpContext;
    context.clearRect(0, 0, XP_TEXTURE_WIDTH, XP_TEXTURE_HEIGHT);

    context.fillStyle = COLORS.outline;
    context.fillRect(0, 0, XP_TEXTURE_WIDTH, XP_TEXTURE_HEIGHT);

    context.fillStyle = COLORS.track;
    context.fillRect(
      XP_BORDER,
      XP_BORDER,
      XP_TEXTURE_WIDTH - XP_BORDER * 2,
      XP_TEXTURE_HEIGHT - XP_BORDER * 2
    );

    if (this.xpFraction <= 0) return;

    const innerHeight = XP_TEXTURE_HEIGHT - XP_TRACK_PADDING * 2;
    const maxWidth = XP_TEXTURE_WIDTH - XP_TRACK_PADDING * 2;
    const width = Math.max(1, Math.round(maxWidth * this.xpFraction));

    context.fillStyle = this.accent;
    context.fillRect(XP_TRACK_PADDING, XP_TRACK_PADDING, width, innerHeight);
    // Brillo superior para que el relleno no parezca plano.
    context.fillStyle = COLORS.highlight;
    context.fillRect(
      XP_TRACK_PADDING,
      XP_TRACK_PADDING,
      width,
      Math.max(1, Math.round(innerHeight * 0.35))
    );
  }

  /** Redibuja el distintivo con el número de nivel. */
  private drawBadge(): void {
    const context = this.badgeContext;
    const size = BADGE_TEXTURE_SIZE;
    // Todo se dibuja relativo a los 96 px originales para no reajustar a mano
    // el borde ni el radio al cambiar la resolución de la textura.
    const scale = size / 96;
    context.clearRect(0, 0, size, size);

    roundedRect(
      context,
      3 * scale,
      3 * scale,
      size - 6 * scale,
      size - 6 * scale,
      18 * scale
    );
    context.fillStyle = this.accent;
    context.fill();
    context.lineWidth = 5 * scale;
    context.strokeStyle = COLORS.outline;
    context.stroke();

    const label = String(this.level);
    // El 10 es el único nivel de dos cifras: se mide y se encoge para que no
    // toque el borde del distintivo.
    const maxTextWidth = size * 0.74;
    let fontSize = size * 0.82;
    const font = (px: number) =>
      `900 ${px}px ui-monospace, "Cascadia Mono", monospace`;
    context.font = font(fontSize);
    const measured = context.measureText(label).width;
    if (measured > maxTextWidth) {
      fontSize = Math.floor((fontSize * maxTextWidth) / measured);
      context.font = font(fontSize);
    }

    const centerX = size / 2;
    const centerY = size / 2 + size * 0.02;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineJoin = 'round';
    if (this.badgeTextColor === '#ffffff') {
      context.lineWidth = Math.max(1, size * 0.035);
      context.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      context.strokeText(label, centerX, centerY);
    }
    context.fillStyle = this.badgeTextColor;
    context.fillText(label, centerX, centerY);
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
    this.xpRender.layers = [layerId];
    const badgeRender = this.badgeRoot.render;
    if (badgeRender) badgeRender.layers = [layerId];
  }

  destroy(): void {
    this.root.destroy();
    this.barMaterial.destroy();
    this.barTexture.destroy();
    this.xpMaterial.destroy();
    this.xpTexture.destroy();
    this.badgeMaterial.destroy();
    this.badgeTexture.destroy();
    this.mesh.destroy();
  }
}
