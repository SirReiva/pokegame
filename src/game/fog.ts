import * as pc from 'playcanvas';
import { CONFIG, DEG } from './config';
import type { SplitRect } from './multiplayer';

/**
 * Niebla de guerra dibujada por el motor.
 *
 * Cada vista monta un quad pegado a su cámara, en su propia capa de render. El
 * quad ocupa justo el frustum (se recalcula con el aspect del viewport) y su
 * material es un `ShaderMaterial` que pinta un degradado radial con centro y
 * radios elípticos: dentro del círculo el alfa es 0 y fuera llega a
 * `fogOpacity`. Se dibuja al final de las transparencias y sin `depthTest`, así
 * que cubre el mundo de esa vista pero no el HUD de React.
 *
 * El shader trabaja en UV de pantalla (0-1). El motor le pasa el centro y los
 * radios ya normalizados desde el círculo de visión del jugador.
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

const FRAGMENT_SHADER = `
varying vec2 vUv;
uniform vec3 uFogColor;
uniform float uFogOpacity;
uniform vec2 uFogCenter;
uniform vec2 uFogRadius;
uniform float uFogFeather;

void main(void) {
  vec2 offset = (vUv - uFogCenter) / max(uFogRadius, vec2(0.0001));
  float distanceToCenter = length(offset);
  float alpha = smoothstep(1.0 - uFogFeather, 1.0, distanceToCenter) * uFogOpacity;
  gl_FragColor = vec4(uFogColor, alpha);
}
`;

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

export class FogView {
  readonly entity: pc.Entity;

  private readonly device: pc.GraphicsDevice;
  private readonly material: pc.ShaderMaterial;
  private readonly center = new Float32Array(2);
  private readonly radius = new Float32Array(2);

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
    this.material.setParameter('uFogOpacity', 0);
    this.material.setParameter('uFogFeather', CONFIG.vision.fogFeather);
    this.material.setParameter('uFogCenter', this.center);
    this.material.setParameter('uFogRadius', this.radius);
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
      this.material.setParameter('uFogOpacity', 0);
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
      this.material.setParameter('uFogOpacity', 0);
      return;
    }

    // La UV del quad tiene el origen abajo; el centro calculado viene del
    // origen superior de la pantalla.
    this.center[0] = centerX / 100;
    this.center[1] = 1 - gradientY / 100;
    this.radius[0] = radiusX / 100;
    this.radius[1] = radiusY / 100;

    this.material.setParameter('uFogCenter', this.center);
    this.material.setParameter('uFogRadius', this.radius);
    this.material.setParameter('uFogOpacity', CONFIG.vision.fogOpacity);
  }

  destroy(): void {
    this.entity.destroy();
    this.material.destroy();
  }
}
