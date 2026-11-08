import * as pc from 'playcanvas';
import { RAD } from './config';
import {
  createDeathMarkerCanvas,
  paintDeathMarkerCanvas,
  textureFromCanvas
} from './textures';

/** Diámetro de la marca de KO en unidades de mundo. */
const MARKER_DIAMETER = 1.05;
/** Orden de dibujo dentro del pase transparente, por encima de las sombras. */
const MARKER_DRAW_ORDER = 3;

/**
 * Marca plana que queda en el suelo donde cayó un Pokémon.
 *
 * - Vive en el suelo; se gira en Y para que el retrato de la especie quede de
 *   pie desde la cámara de su vista.
 * - Es una copia por viewport, asignada a la capa de su vista, igual que las
 *   copias de los actores. El juego decide cuándo se ve cada una.
 * - El material es unlit, con `alphaTest`, para que la silueta se recorte
 *   limpia sobre el terreno sin escribir profundidad.
 */
export class DeathMarker {
  /** Punto del mundo que marca; lo usa el juego para resolver la niebla. */
  readonly x: number;
  readonly z: number;

  private readonly root: pc.Entity;
  private readonly mesh: pc.Mesh;
  private readonly material: pc.StandardMaterial;
  private readonly texture: pc.Texture;
  private readonly canvas: HTMLCanvasElement;
  private readonly portrait: HTMLImageElement | null;
  /** Último segundo pintado en el centro; evita redibujar cada frame. */
  private countdownSeconds: number | null = null;
  private visible = true;

  constructor(
    app: pc.AppBase,
    x: number,
    z: number,
    y: number,
    portrait: HTMLImageElement | null = null
  ) {
    this.x = x;
    this.z = z;
    this.portrait = portrait;

    this.canvas = createDeathMarkerCanvas(portrait);
    this.texture = textureFromCanvas(
      app.graphicsDevice,
      this.canvas,
      {
        name: 'death-marker',
        mipmaps: false,
        minFilter: pc.FILTER_NEAREST,
        magFilter: pc.FILTER_NEAREST,
        flipY: true
      }
    );

    this.material = new pc.StandardMaterial();
    this.material.name = 'death-marker';
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
    this.material.blendType = pc.BLEND_NORMAL;
    this.material.opacity = 0.9;
    // Un decal no debe tapar otros transparentes ni escribir profundidad: el
    // suelo y las sombras ya están resueltos antes por `drawOrder`.
    this.material.depthWrite = false;
    this.material.depthTest = true;
    this.material.cull = pc.CULLFACE_NONE;
    this.material.update();

    const half = MARKER_DIAMETER / 2;
    this.mesh = new pc.Mesh(app.graphicsDevice);
    this.mesh.setPositions([
      -half, 0, -half,
      half, 0, -half,
      half, 0, half,
      -half, 0, half
    ]);
    this.mesh.setUvs(0, [0, 0, 1, 0, 1, 1, 0, 1]);
    this.mesh.setIndices([0, 1, 2, 0, 2, 3]);
    this.mesh.update();

    this.root = new pc.Entity('death-marker');
    this.root.addComponent('render');
    const render = this.root.render!;
    render.castShadows = false;
    render.receiveShadows = false;
    const instance = new pc.MeshInstance(this.mesh, this.material);
    instance.castShadow = false;
    instance.receiveShadow = false;
    instance.drawOrder = MARKER_DRAW_ORDER;
    render.meshInstances = [instance];
    this.root.setPosition(x, y, z);
    app.root.addChild(this.root);
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.root.enabled = visible;
  }

  /**
   * Pinta en el centro los segundos que faltan para reaparecer. Solo se
   * redibuja cuando cambia el segundo mostrado.
   */
  setRespawnCountdown(seconds: number): void {
    const shown = Math.max(0, Math.ceil(seconds));
    if (shown === this.countdownSeconds) return;
    this.countdownSeconds = shown;
    paintDeathMarkerCanvas(this.canvas, this.portrait, shown);
    this.texture.upload();
  }

  /**
   * Orienta el retrato para que quede de pie desde la cámara de su vista. El
   * aro es simétrico, así que girar todo el decal no cambia su lectura.
   */
  faceCamera(position: pc.Vec3): void {
    const dx = position.x - this.x;
    const dz = position.z - this.z;
    // La parte superior de la textura apunta a +Z local; debe mirar en
    // dirección contraria a la cámara para que el retrato no salga invertido.
    this.root.setLocalEulerAngles(0, Math.atan2(-dx, -dz) * RAD, 0);
  }

  /** Asigna la marca a una capa de render propia del viewport. */
  setLayer(layerId: number): void {
    const render = this.root.render;
    if (render) render.layers = [layerId];
  }

  destroy(): void {
    this.root.destroy();
    this.mesh.destroy();
    this.material.destroy();
    this.texture.destroy();
  }
}
