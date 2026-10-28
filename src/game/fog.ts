import * as pc from 'playcanvas';
import { CONFIG, DEG } from './config';
import type { SplitRect } from './multiplayer';
import { mapHalfDepth, mapHalfWidth } from './terrain';

/**
 * Niebla de guerra dibujada por el motor.
 *
 * Hay dos piezas:
 * - `FogView`: quad pegado a la cámara que sombrea fuera del círculo de visión.
 * - `FogDecal`: plano horizontal en el mundo con la sombra que proyectan las
 *   cordilleras. Al estar fijo en el mapa, esa sombra no depende de la cámara.
 */

const VERTEX_SHADER = `
attribute vec3 aPosition;
attribute vec2 aUv0;
uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;
varying vec2 vUv;

void main(void) {
  vUv = aUv0;
  gl_Position = matrix_viewProjection * matrix_model * vec4(aPosition, 1.0);
}
`;

/**
 * Variante para el decal: además de la UV del plano, pasa la posición en clip
 * space para reconstruir en el fragment el óvalo de pantalla de la vista.
 */
const DECAL_VERTEX_SHADER = `
attribute vec3 aPosition;
attribute vec2 aUv0;
uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;
varying vec2 vUv;
varying vec4 vClip;

void main(void) {
  vUv = aUv0;
  vec4 clip = matrix_viewProjection * matrix_model * vec4(aPosition, 1.0);
  vClip = clip;
  gl_Position = clip;
}
`;

const FRAGMENT_SHADER = `
varying vec2 vUv;
uniform vec3 uFogColor;
uniform float uFogOpacity;
uniform vec2 uFogCenter;
uniform vec2 uFogRadius;
uniform float uFogFeather;

void main(void) {
  vec2 offset = (vUv - uFogCenter) / max(uFogRadius, vec2(0.0001));
  float alpha = smoothstep(1.0 - uFogFeather, 1.0, length(offset)) * uFogOpacity;
  gl_FragColor = vec4(uFogColor, alpha);
}
`;

const DECAL_FRAGMENT_SHADER = `
varying vec2 vUv;
varying vec4 vClip;
uniform vec3 uFogColor;
uniform float uFogOpacity;
uniform sampler2D uFogMask;
uniform vec2 uPlayer;
uniform float uVisionRange;
uniform vec2 uMapHalfSize;
uniform vec2 uScreenCenter;
uniform vec2 uScreenRadius;
uniform float uScreenFeather;
uniform float uScreenOpacity;
uniform float uOverlap;

void main(void) {
  float mask = texture2D(uFogMask, vUv).r;
  vec2 world = (vUv * 2.0 - 1.0) * uMapHalfSize;
  float inside = 1.0 - smoothstep(uVisionRange - 0.5, uVisionRange + 0.5, distance(world, uPlayer));
  float shadow = (1.0 - mask) * inside * uFogOpacity;

  // Mismo óvalo de pantalla que dibuja FogView. Al resolverlo aquí, el decal
  // puede compensar la niebla circular y las dos capas se funden por máximo en
  // vez de sumarse (que era lo que oscurecía los bordes).
  vec2 clipUv = vClip.xy / vClip.w * 0.5 + 0.5;
  vec2 offset = (clipUv - uScreenCenter) / max(uScreenRadius, vec2(0.0001));
  float circle = smoothstep(1.0 - uScreenFeather, 1.0, length(offset)) * uScreenOpacity;
  // El solape se resuelve por máximo para no sumar dos veces el mismo color,
  // con un extra pequeño y proporcional para que la cuña siga leyéndose.
  float target = max(circle, shadow) + uOverlap * min(circle, shadow);
  float alpha = clamp(
    (target - circle) / max(1.0 - circle, 0.001),
    0.0,
    1.0
  );

  gl_FragColor = vec4(uFogColor, alpha);
}
`;

/** Oclusor de visión que proyecta sombra sobre el terreno. */
export interface SightOccluder {
  x: number;
  z: number;
  radius: number;
  /** Extremos del tramo de cresta, para el caso de jugador pegado. */
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

/**
 * Óvalo de visión ya proyectado a UV de la vista. Lo calcula `FogView` y lo
 * consume `FogDecal` para que ambas capas de niebla compartan el mismo borde.
 */
export interface ScreenFog {
  center: Float32Array;
  radius: Float32Array;
  feather: number;
  opacity: number;
}

const MASK_SIZE = 192;
const MAX_OCCLUDERS = 24;
const SHADOW_LENGTH = 40;
/** Extensión de la banda cuando el jugador está pegado a la cresta. */
const INSIDE_EDGE_EXTENSION = 0.05;

/**
 * El quad se dibuja un 2 % más grande que el frustum para no dejar una costura
 * de un píxel en los bordes del viewport. Las UV se amplían lo mismo para que
 * el borde de la pantalla siga correspondiendo exactamente a 0-1.
 */
const QUAD_MARGIN = 1.02;
const UV_MARGIN = 0.01;

/** Quad unitario en el plano XY, con UV de pantalla. */
export function createFogMesh(device: pc.GraphicsDevice): pc.Mesh {
  const mesh = new pc.Mesh(device);
  mesh.setPositions([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  mesh.setUvs(0, [
    -UV_MARGIN, -UV_MARGIN,
    1 + UV_MARGIN, -UV_MARGIN,
    1 + UV_MARGIN, 1 + UV_MARGIN,
    -UV_MARGIN, 1 + UV_MARGIN
  ]);
  mesh.setIndices([0, 1, 2, 0, 2, 3]);
  mesh.update();
  return mesh;
}

/** Plano horizontal de mapa completo para el decal de sombra. */
export function createFogDecalMesh(device: pc.GraphicsDevice): pc.Mesh {
  const mesh = new pc.Mesh(device);
  mesh.setPositions([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]);
  mesh.setUvs(0, [0, 0, 1, 0, 1, 1, 0, 1]);
  mesh.setIndices([0, 1, 2, 0, 2, 3]);
  mesh.update();
  return mesh;
}

/** Niebla de pantalla de una vista: círculo de visión y sombreado exterior. */
export class FogView {
  readonly entity: pc.Entity;

  /** Óvalo de visión en UV de la vista; lo comparte el decal de cordillera. */
  readonly screenFog: ScreenFog = {
    center: new Float32Array(2),
    radius: new Float32Array(2),
    feather: CONFIG.vision.fogFeather,
    opacity: 0
  };

  private readonly device: pc.GraphicsDevice;
  private readonly material: pc.ShaderMaterial;

  /** Vectores reutilizados para proyectar el círculo de visión a pantalla. */
  private readonly worldPoints = {
    center: new pc.Vec3(),
    left: new pc.Vec3(),
    right: new pc.Vec3(),
    near: new pc.Vec3(),
    far: new pc.Vec3()
  };
  private readonly screenPoints = {
    center: new pc.Vec3(),
    left: new pc.Vec3(),
    right: new pc.Vec3(),
    near: new pc.Vec3(),
    far: new pc.Vec3()
  };

  constructor(
    device: pc.GraphicsDevice,
    mesh: pc.Mesh,
    cameraEntity: pc.Entity,
    layerId: number,
    index: number
  ) {
    this.device = device;

    this.material = new pc.ShaderMaterial({
      uniqueName: 'fog-of-war',
      vertexGLSL: VERTEX_SHADER,
      fragmentGLSL: FRAGMENT_SHADER,
      attributes: {
        aPosition: pc.SEMANTIC_POSITION,
        aUv0: pc.SEMANTIC_TEXCOORD0
      }
    });
    this.material.blendType = pc.BLEND_NORMAL;
    this.material.depthTest = false;
    this.material.depthWrite = false;
    this.material.cull = pc.CULLFACE_NONE;
    this.material.setParameter('uFogColor', new Float32Array(CONFIG.vision.fogColor));
    this.material.setParameter('uFogOpacity', this.screenFog.opacity);
    this.material.setParameter('uFogFeather', this.screenFog.feather);
    this.material.setParameter('uFogCenter', this.screenFog.center);
    this.material.setParameter('uFogRadius', this.screenFog.radius);
    this.material.update();

    const instance = new pc.MeshInstance(mesh, this.material);
    instance.castShadow = false;
    instance.receiveShadow = false;
    instance.drawOrder = 1000;

    this.entity = new pc.Entity(`fog-view-${index + 1}`);
    this.entity.addComponent('render');
    const render = this.entity.render!;
    render.meshInstances = [instance];
    render.castShadows = false;
    render.receiveShadows = false;
    render.layers = [layerId];
    cameraEntity.addChild(this.entity);
  }

  /**
   * Recoloca el quad para cubrir el viewport y le pasa al shader el centro y
   * los radios proyectados del círculo de visión. Se proyectan el centro, los
   * extremos horizontales y los extremos cercano/lejano del círculo en el
   * suelo; el centro vertical del óvalo es el punto medio entre estos dos
   * últimos porque la perspectiva hace que el lado cercano ocupe más pantalla.
   */
  update(
    camera: pc.CameraComponent,
    viewport: SplitRect,
    yaw: number,
    x: number,
    z: number,
    visionRange: number
  ): void {
    const { width: canvasWidth, height: canvasHeight } = this.device.clientRect;
    const rectWidth = viewport.w * canvasWidth;
    const rectHeight = viewport.h * canvasHeight;
    if (rectWidth <= 0 || rectHeight <= 0) {
      this.setOpacity(0);
      return;
    }

    // Quad en espacio de cámara: cubre exactamente el frustum a esta distancia.
    const aspect = rectWidth / rectHeight;
    const distance = camera.nearClip + 0.05;
    const halfHeight = Math.tan((camera.fov * DEG) / 2) * distance * QUAD_MARGIN;
    const halfWidth = halfHeight * aspect;
    this.entity.setLocalPosition(0, 0, -distance);
    this.entity.setLocalScale(halfWidth, halfHeight, 1);

    const rectLeft = viewport.x * canvasWidth;
    const rectTop = (1 - viewport.y - viewport.h) * canvasHeight;

    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const world = this.worldPoints;
    const screen = this.screenPoints;

    const center = camera.worldToScreen(world.center.set(x, 0, z), screen.center);
    const left = camera.worldToScreen(
      world.left.set(x - rightX * visionRange, 0, z - rightZ * visionRange),
      screen.left
    );
    const right = camera.worldToScreen(
      world.right.set(x + rightX * visionRange, 0, z + rightZ * visionRange),
      screen.right
    );
    // `forward` apunta hacia el fondo del mapa (lejos de la cámara).
    const far = camera.worldToScreen(
      world.far.set(x + forwardX * visionRange, 0, z + forwardZ * visionRange),
      screen.far
    );

    // El extremo cercano puede quedar por debajo del encuadre, pero se puede
    // proyectar mientras esté delante del plano de cámara. Solo se descarta si
    // queda detrás; en ese caso el óvalo se prolonga hasta el borde inferior.
    const cameraPosition = camera.entity.getPosition();
    const cameraDepth = (x - cameraPosition.x) * forwardX + (z - cameraPosition.z) * forwardZ;
    const pitch = CONFIG.camera.pitch * DEG;
    const nearDepth3D = cameraDepth * Math.cos(pitch) + cameraPosition.y * Math.sin(pitch);
    const nearInFront = nearDepth3D > camera.nearClip;
    const near = nearInFront
      ? camera.worldToScreen(
          world.near.set(x - forwardX * visionRange, 0, z - forwardZ * visionRange),
          screen.near
        )
      : null;

    const toX = (screenX: number) => ((screenX - rectLeft) / rectWidth) * 100;
    const toY = (screenY: number) => ((screenY - rectTop) / rectHeight) * 100;
    const clampPct = (value: number) => Math.min(400, Math.max(1, value));

    const centerX = toX(center.x);
    const centerY = toY(center.y);
    const radiusX = clampPct(Math.abs(toX(right.x) - toX(left.x)) * 0.5);
    const rawFarY = toY(far.y);
    const rawNearY = near ? toY(near.y) : 160;
    // Acotar los extremos un poco más allá del panel evita que un punto muy
    // lejano empuje el centro del degradado fuera del lienzo y oscurezca todo.
    const farY = Math.max(Math.min(rawFarY, 160), -20);
    const nearY = Math.max(Math.min(rawNearY, 160), -20);
    const topY = Math.min(farY, nearY);
    const bottomY = Math.max(farY, nearY);
    const radiusY = clampPct((bottomY - topY) * 0.5);
    const gradientY = (topY + bottomY) * 0.5;

    if (
      !Number.isFinite(centerX) ||
      !Number.isFinite(centerY) ||
      !Number.isFinite(radiusX) ||
      !Number.isFinite(radiusY) ||
      !Number.isFinite(gradientY)
    ) {
      this.setOpacity(0);
      return;
    }

    // La UV del quad tiene el origen abajo; el centro calculado viene del
    // origen superior de la pantalla.
    this.screenFog.center[0] = centerX / 100;
    this.screenFog.center[1] = 1 - gradientY / 100;
    this.screenFog.radius[0] = radiusX / 100;
    this.screenFog.radius[1] = radiusY / 100;

    this.material.setParameter('uFogCenter', this.screenFog.center);
    this.material.setParameter('uFogRadius', this.screenFog.radius);
    this.setOpacity(CONFIG.vision.fogOpacity);
  }

  private setOpacity(value: number): void {
    this.screenFog.opacity = value;
    this.material.setParameter('uFogOpacity', value);
  }

  destroy(): void {
    this.entity.destroy();
    this.material.destroy();
  }
}

/**
 * Sombra de cordillera fija en el mundo. La máscara se dibuja en coordenadas
 * XZ del mapa y el plano vive en la capa de la vista; la cámara solo lo mira,
 * no lo deforma. Al estar sobre el suelo y con depth test, la propia montaña,
 * los árboles y los actores lo tapan y conservan su iluminación.
 */
export class FogDecal {
  readonly entity: pc.Entity;

  private readonly material: pc.ShaderMaterial;
  private readonly occluders: readonly SightOccluder[];
  private readonly maskCanvas: HTMLCanvasElement;
  private readonly maskContext: CanvasRenderingContext2D;
  private readonly maskTexture: pc.Texture;
  private readonly player = new Float32Array(2);
  private readonly screenCenter = new Float32Array(2);
  private readonly screenRadius = new Float32Array(2);
  private screenFeather: number = CONFIG.vision.fogFeather;
  private screenOpacity = 0;
  private lastX = Number.NaN;
  private lastZ = Number.NaN;
  private lastVision = Number.NaN;

  constructor(
    device: pc.GraphicsDevice,
    root: pc.Entity,
    mesh: pc.Mesh,
    layerId: number,
    index: number,
    occluders: readonly SightOccluder[]
  ) {
    this.occluders = occluders;

    this.maskCanvas = document.createElement('canvas');
    this.maskCanvas.width = MASK_SIZE;
    this.maskCanvas.height = MASK_SIZE;
    const context = this.maskCanvas.getContext('2d');
    if (!context) throw new Error('No se pudo crear el contexto 2D de la niebla');
    this.maskContext = context;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, MASK_SIZE, MASK_SIZE);

    this.maskTexture = new pc.Texture(device, {
      name: `fog-decal-mask-${index + 1}`,
      width: MASK_SIZE,
      height: MASK_SIZE,
      format: pc.PIXELFORMAT_RGBA8,
      mipmaps: false,
      minFilter: pc.FILTER_LINEAR,
      magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_CLAMP_TO_EDGE,
      addressV: pc.ADDRESS_CLAMP_TO_EDGE,
      srgb: false
    });
    this.maskTexture.setSource(this.maskCanvas);

    this.material = new pc.ShaderMaterial({
      uniqueName: 'fog-of-war-decal',
      vertexGLSL: DECAL_VERTEX_SHADER,
      fragmentGLSL: DECAL_FRAGMENT_SHADER,
      attributes: {
        aPosition: pc.SEMANTIC_POSITION,
        aUv0: pc.SEMANTIC_TEXCOORD0
      }
    });
    this.material.blendType = pc.BLEND_NORMAL;
    this.material.depthTest = true;
    this.material.depthWrite = false;
    this.material.cull = pc.CULLFACE_NONE;
    this.material.setParameter('uFogColor', new Float32Array(CONFIG.vision.fogColor));
    this.material.setParameter('uFogOpacity', CONFIG.vision.fogOpacity);
    this.material.setParameter('uFogMask', this.maskTexture);
    this.material.setParameter('uPlayer', this.player);
    this.material.setParameter('uVisionRange', 0);
    this.material.setParameter('uMapHalfSize', new Float32Array([mapHalfWidth(), mapHalfDepth()]));
    this.material.setParameter('uScreenCenter', this.screenCenter);
    this.material.setParameter('uScreenRadius', this.screenRadius);
    this.material.setParameter('uScreenFeather', this.screenFeather);
    this.material.setParameter('uScreenOpacity', this.screenOpacity);
    this.material.setParameter('uOverlap', CONFIG.vision.mountainOverlap);
    this.material.update();

    const instance = new pc.MeshInstance(mesh, this.material);
    instance.castShadow = false;
    instance.receiveShadow = false;
    instance.drawOrder = 1;

    this.entity = new pc.Entity(`fog-decal-${index + 1}`);
    this.entity.setPosition(0, 0.02, 0);
    const halfX = mapHalfWidth();
    const halfZ = mapHalfDepth();
    this.entity.setLocalScale(halfX, 1, halfZ);
    this.entity.addComponent('render');
    const render = this.entity.render!;
    render.meshInstances = [instance];
    render.castShadows = false;
    render.receiveShadows = false;
    render.layers = [layerId];
    root.addChild(this.entity);
  }

  /**
   * @param screen Óvalo de la niebla circular de esta vista. Se sincroniza en
   * cada frame porque depende de la cámara; la máscara de la sombra, en cambio,
   * solo se redibuja cuando cambia el jugador o su rango.
   */
  update(
    playerX: number,
    playerZ: number,
    visionRange: number,
    screen: ScreenFog | null
  ): void {
    this.syncScreenFog(screen);

    if (
      playerX === this.lastX &&
      playerZ === this.lastZ &&
      visionRange === this.lastVision
    ) {
      return;
    }
    this.lastX = playerX;
    this.lastZ = playerZ;
    this.lastVision = visionRange;

    this.player[0] = playerX;
    this.player[1] = playerZ;
    this.material.setParameter('uPlayer', this.player);
    this.material.setParameter('uVisionRange', visionRange);
    this.updateMask(playerX, playerZ, visionRange);
  }

  private syncScreenFog(screen: ScreenFog | null): void {
    if (screen) {
      this.screenCenter[0] = screen.center[0];
      this.screenCenter[1] = screen.center[1];
      this.screenRadius[0] = screen.radius[0];
      this.screenRadius[1] = screen.radius[1];
      this.screenFeather = screen.feather;
      this.screenOpacity = screen.opacity;
    } else {
      this.screenOpacity = 0;
    }
    this.material.setParameter('uScreenCenter', this.screenCenter);
    this.material.setParameter('uScreenRadius', this.screenRadius);
    this.material.setParameter('uScreenFeather', this.screenFeather);
    this.material.setParameter('uScreenOpacity', this.screenOpacity);
  }

  private updateMask(playerX: number, playerZ: number, visionRange: number): void {
    const context = this.maskContext;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, MASK_SIZE, MASK_SIZE);
    context.fillStyle = '#000';

    const halfX = mapHalfWidth();
    const halfZ = mapHalfDepth();
    const toCanvasX = (x: number) => ((x + halfX) / (halfX * 2)) * MASK_SIZE;
    const toCanvasY = (z: number) => ((z + halfZ) / (halfZ * 2)) * MASK_SIZE;

    const candidates: Array<SightOccluder & { distance: number }> = [];
    for (const occluder of this.occluders) {
      const distance = Math.hypot(occluder.x - playerX, occluder.z - playerZ);
      if (distance > visionRange + occluder.radius + 2) continue;
      candidates.push({ ...occluder, distance });
    }

    candidates.sort((a, b) => a.distance - b.distance);
    const selected = candidates.slice(0, MAX_OCCLUDERS);

    for (const occluder of selected) {
      if (occluder.distance <= occluder.radius + 0.01) {
        // Jugador pegado a la cresta: banda sobre el lado opuesto del tramo.
        const segmentX = occluder.bx - occluder.ax;
        const segmentZ = occluder.bz - occluder.az;
        const segmentLength = Math.hypot(segmentX, segmentZ);
        if (segmentLength < 0.0001) continue;

        const dirX = segmentX / segmentLength;
        const dirZ = segmentZ / segmentLength;
        let normalX = -dirZ;
        let normalZ = dirX;
        if (
          (playerX - occluder.ax) * normalX + (playerZ - occluder.az) * normalZ >
          0
        ) {
          normalX = -normalX;
          normalZ = -normalZ;
        }

        // Extensión corta en los extremos: la justa para cubrir el tramo sin
        // que la sombra se escape por delante del final de la cresta.
        const ext = INSIDE_EDGE_EXTENSION;
        const farX = normalX * SHADOW_LENGTH;
        const farZ = normalZ * SHADOW_LENGTH;
        const ax = occluder.ax - dirX * ext;
        const az = occluder.az - dirZ * ext;
        const bx = occluder.bx + dirX * ext;
        const bz = occluder.bz + dirZ * ext;

        context.beginPath();
        context.moveTo(toCanvasX(ax), toCanvasY(az));
        context.lineTo(toCanvasX(bx), toCanvasY(bz));
        context.lineTo(toCanvasX(bx + farX), toCanvasY(bz + farZ));
        context.lineTo(toCanvasX(ax + farX), toCanvasY(az + farZ));
        context.closePath();
        context.fill();
        continue;
      }

      const dx = occluder.x - playerX;
      const dz = occluder.z - playerZ;
      const angle = Math.atan2(dz, dx);
      const halfAngle = Math.asin(Math.min(1, occluder.radius / occluder.distance));
      const tangentDistance = Math.sqrt(
        occluder.distance * occluder.distance - occluder.radius * occluder.radius
      );

      const a1 = angle - halfAngle;
      const a2 = angle + halfAngle;
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      const c2 = Math.cos(a2);
      const s2 = Math.sin(a2);

      // Cuña tangente: arranca en los puntos de tangencia y se abre hacia el
      // lado opuesto al jugador. La montaña tapa el borde de arranque.
      const t1x = playerX + c1 * tangentDistance;
      const t1z = playerZ + s1 * tangentDistance;
      const t2x = playerX + c2 * tangentDistance;
      const t2z = playerZ + s2 * tangentDistance;

      context.beginPath();
      context.moveTo(toCanvasX(t1x), toCanvasY(t1z));
      context.lineTo(toCanvasX(t1x + c1 * SHADOW_LENGTH), toCanvasY(t1z + s1 * SHADOW_LENGTH));
      context.lineTo(toCanvasX(t2x + c2 * SHADOW_LENGTH), toCanvasY(t2z + s2 * SHADOW_LENGTH));
      context.lineTo(toCanvasX(t2x), toCanvasY(t2z));
      context.closePath();
      context.fill();
    }

    this.maskTexture.upload();
  }

  destroy(): void {
    this.entity.destroy();
    this.material.destroy();
    this.maskTexture.destroy();
  }
}
