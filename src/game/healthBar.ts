/**
 * Barra de vida flotante sobre un Pokémon.
 *
 * Se dibuja dentro de PlayCanvas, igual que los números de daño: un único quad
 * con una textura de canvas que contiene el contorno, la pista y el relleno.
 * Usar una sola pieza evita que las capas se tapen entre sí según el ángulo de
 * la cámara. La barra mira siempre a la cámara del viewport que la dibuja y se
 * escala con la altura del sprite.
 */

import * as pc from 'playcanvas';
import { DEG } from './config';

/** Resolución de la textura; mantiene la proporción de la barra (≈ 9:1). */
const TEXTURE_WIDTH = 256;
const TEXTURE_HEIGHT = 28;

/** Grosor del contorno y de la pista, en píxeles de la textura. */
const BORDER = 3;
const TRACK_PADDING = BORDER + 1;

/** Colores de la barra. */
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
}

/** Quad unitario centrado en X y apoyado en Y=0. */
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

function colorFor(fraction: number): string {
  if (fraction > 0.5) return COLORS.high;
  if (fraction > 0.25) return COLORS.mid;
  return COLORS.low;
}

export class HealthBar {
  private readonly root: pc.Entity;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly texture: pc.Texture;
  private readonly material: pc.StandardMaterial;
  private readonly mesh: pc.Mesh;

  private fraction = 1;

  constructor(app: pc.Application, parent: pc.Entity, options: HealthBarOptions) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = TEXTURE_WIDTH;
    this.canvas.height = TEXTURE_HEIGHT;
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('No se pudo dibujar la barra de vida');
    this.context = context;

    this.mesh = createQuadMesh(app.graphicsDevice);
    this.texture = new pc.Texture(app.graphicsDevice, {
      name: 'health-bar',
      width: TEXTURE_WIDTH,
      height: TEXTURE_HEIGHT,
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

    this.material = new pc.StandardMaterial();
    this.material.useLighting = false;
    this.material.useSkybox = false;
    this.material.useFog = false;
    this.material.diffuse = new pc.Color(0, 0, 0);
    this.material.emissive = new pc.Color(1, 1, 1);
    this.material.emissiveMap = this.texture;
    this.material.opacityMap = this.texture;
    this.material.opacityMapChannel = 'a';
    this.material.opacity = 1;
    this.material.alphaTest = 0;
    this.material.blendType = pc.BLEND_NORMAL;
    this.material.depthWrite = false;
    // La barra debe leerse aunque el Pokémon esté pegado a un árbol o al agua.
    this.material.depthTest = false;
    this.material.cull = pc.CULLFACE_NONE;
    this.material.update();

    this.root = new pc.Entity('health-bar');
    this.root.addComponent('render');
    const render = this.root.render!;
    render.castShadows = false;
    render.receiveShadows = false;
    const instance = new pc.MeshInstance(this.mesh, this.material);
    instance.drawOrder = DRAW_ORDER;
    render.meshInstances = [instance];

    parent.addChild(this.root);
    this.root.setLocalPosition(0, options.y, 0);
    this.root.setLocalScale(options.width, options.height, 1);

    this.draw();
    this.texture.setSource(this.canvas);
  }

  /** `fraction` va de 0 (KO) a 1 (vida completa); a 0 la barra se oculta. */
  setFraction(fraction: number): void {
    const next = pc.math.clamp(fraction, 0, 1);
    if (next === this.fraction) return;
    this.fraction = next;
    this.root.enabled = next > 0;
    this.draw();
    this.texture.setSource(this.canvas);
  }

  /** Redibuja el contorno, la pista y la porción de vida en el canvas. */
  private draw(): void {
    const context = this.context;
    context.clearRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);

    context.fillStyle = COLORS.outline;
    context.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);

    context.fillStyle = COLORS.track;
    context.fillRect(
      BORDER,
      BORDER,
      TEXTURE_WIDTH - BORDER * 2,
      TEXTURE_HEIGHT - BORDER * 2
    );

    if (this.fraction <= 0) return;

    const innerHeight = TEXTURE_HEIGHT - TRACK_PADDING * 2;
    const maxWidth = TEXTURE_WIDTH - TRACK_PADDING * 2;
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
    const render = this.root.render;
    if (render) render.layers = [layerId];
  }

  destroy(): void {
    this.root.destroy();
    this.material.destroy();
    this.texture.destroy();
    this.mesh.destroy();
  }
}
