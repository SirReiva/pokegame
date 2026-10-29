/**
 * Números de daño flotantes dentro de PlayCanvas.
 *
 * Cada impacto crea una copia del texto en cada viewport donde se ve al
 * objetivo. El texto se dibuja en un canvas, se sube como textura y se coloca
 * en un quad vertical que mira a la cámara de esa vista. El motor anima la
 * subida, el pequeño "pop" y el fadeout; React no participa.
 */

import * as pc from 'playcanvas';
import { DEG } from './config';

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
  views: DamageNumberView[];
}

interface DamageNumberEntry {
  entity: pc.Entity;
  material: pc.StandardMaterial;
  texture: pc.Texture;
  camera: pc.CameraComponent;
  x: number;
  z: number;
  startY: number;
  rise: number;
  width: number;
  height: number;
  elapsed: number;
  duration: number;
}

interface DamageTexture {
  texture: pc.Texture;
  width: number;
  height: number;
}

const LIFETIME = 0.9;
const FADE_START = 0.45;
/** Tamaño objetivo en píxeles, independiente del viewport y del zoom. */
const TARGET_PIXELS = 38;
const TARGET_PIXELS_CRITICAL = 52;

export class DamageNumbers {
  private readonly app: pc.Application;
  private readonly device: pc.GraphicsDevice;
  private readonly quadMesh: pc.Mesh;
  private readonly entries: DamageNumberEntry[] = [];

  constructor(app: pc.Application) {
    this.app = app;
    this.device = app.graphicsDevice;
    this.quadMesh = this.createQuadMesh();

    // La malla es compartida por todos los números; la referencia persistente
    // evita que PlayCanvas la destruya al desaparecer el último MeshInstance.
    this.quadMesh.incRefCount();
  }

  private createQuadMesh(): pc.Mesh {
    const mesh = new pc.Mesh(this.device);
    // El quad crece hacia arriba desde su origen: el ancla es la base del texto.
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

  /** Genera la textura de texto con contorno y sombra. */
  private createTexture(
    label: string,
    critical: boolean,
    effectiveness: number
  ): DamageTexture {
    const fontSize = critical ? 96 : 76;
    const font = `900 ${fontSize}px "Trebuchet MS", "Segoe UI", sans-serif`;
    const paddingX = critical ? 28 : 22;

    const measureCanvas = document.createElement('canvas');
    const measure = measureCanvas.getContext('2d');
    if (!measure) throw new Error('No se pudo medir el texto de daño');
    measure.font = font;
    const textWidth = measure.measureText(label).width;

    const width = Math.max(72, Math.ceil(textWidth + paddingX * 2));
    const height = Math.ceil(fontSize * 1.38);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo dibujar el texto de daño');

    context.clearRect(0, 0, width, height);
    context.font = font;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineJoin = 'round';
    context.miterLimit = 2;
    context.lineWidth = critical ? 13 : 10;
    context.strokeStyle = 'rgba(24, 4, 9, 0.96)';
    context.shadowColor = 'rgba(255, 40, 70, 0.85)';
    context.shadowBlur = critical ? 20 : 14;

    const centerX = width / 2;
    const centerY = height / 2 + 2;
    context.strokeText(label, centerX, centerY);
    context.shadowBlur = 0;
    context.fillStyle =
      effectiveness < 1 ? '#d46a75' : critical ? '#ff2d55' : '#ff4d5a';
    context.fillText(label, centerX, centerY);

    const texture = new pc.Texture(this.device, {
      name: `damage-${label}`,
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
    texture.setSource(canvas);
    return { texture, width, height };
  }

  private createMaterial(texture: pc.Texture): pc.StandardMaterial {
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
    // Los números de daño deben leerse aunque el objetivo esté pegado a una
    // pared o bajo un árbol.
    material.depthTest = false;
    material.cull = pc.CULLFACE_NONE;
    material.update();
    return material;
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
    critical: boolean
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
    const targetPixels = critical ? TARGET_PIXELS_CRITICAL : TARGET_PIXELS;
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
    const rotation = new pc.Quat().setFromEulerAngles(0, yaw, 0);
    const tilt = new pc.Quat().setFromEulerAngles(-pitch, 0, 0);
    rotation.mul(tilt);
    entity.setRotation(rotation);
  }

  spawn(options: DamageNumberOptions): void {
    const label = options.critical
      ? `${options.amount}!`
      : `${options.amount}`;

    for (const view of options.views) {
      const { texture, width: textureWidth, height: textureHeight } =
        this.createTexture(label, options.critical, options.effectiveness);
      const material = this.createMaterial(texture);
      const entity = new pc.Entity('damage-number');
      entity.addComponent('render');
      const render = entity.render!;
      render.castShadows = false;
      render.receiveShadows = false;
      render.layers = [view.layerId];
      const instance = new pc.MeshInstance(this.quadMesh, material);
      instance.drawOrder = 10;
      render.meshInstances = [instance];
      this.app.root.addChild(entity);

      const height = this.worldHeightFor(
        view.camera,
        options.x,
        options.y,
        options.z,
        options.critical
      );
      const width = height * (textureWidth / textureHeight);
      entity.setLocalScale(width, height, 1);
      entity.setPosition(options.x, options.y, options.z);
      this.orient(entity, view.camera);

      this.entries.push({
        entity,
        material,
        texture,
        camera: view.camera,
        x: options.x,
        z: options.z,
        startY: options.y,
        rise: height * 0.55,
        width,
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
      entry.material.opacity =
        t < FADE_START ? 1 : Math.max(0, 1 - (t - FADE_START) / (1 - FADE_START));
      entry.material.update();

      entry.entity.setPosition(
        entry.x,
        entry.startY + entry.rise * t,
        entry.z
      );
      const pop =
        t < 0.18
          ? 0.82 + (t / 0.18) * 0.3
          : 1.12 - Math.min(1, (t - 0.18) / 0.82) * 0.12;
      entry.entity.setLocalScale(
        entry.width * pop,
        entry.height * pop,
        1
      );
      this.orient(entry.entity, entry.camera);

      if (entry.elapsed < entry.duration) continue;
      entry.entity.destroy();
      entry.material.destroy();
      entry.texture.destroy();
      this.entries.splice(index, 1);
    }
  }

  clear(): void {
    for (const entry of this.entries) {
      entry.entity.destroy();
      entry.material.destroy();
      entry.texture.destroy();
    }
    this.entries.length = 0;
  }

  destroy(): void {
    this.clear();
    this.quadMesh.destroy();
  }
}
