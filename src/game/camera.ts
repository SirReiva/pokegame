import * as pc from 'playcanvas';
import { CONFIG, DEG } from './config';
import type { SplitRect } from './multiplayer';

/** Cámara orbital a 45º con seguimiento suave del objetivo. */
export class CameraRig {
  readonly entity: pc.Entity;

  yaw = 0;
  distance: number = CONFIG.camera.distance;

  private readonly pitch = CONFIG.camera.pitch * DEG;
  private readonly lookAt = new pc.Vec3();
  private readonly desired = new pc.Vec3();
  private initialized = false;

  constructor(app: pc.Application, start: { x: number; z: number }) {
    this.entity = new pc.Entity('camera');
    this.entity.addComponent('camera', {
      clearColor: new pc.Color(CONFIG.fog.color[0], CONFIG.fog.color[1], CONFIG.fog.color[2]),
      clearColorBuffer: true,
      clearStencilBuffer: true,
      fov: CONFIG.camera.fov,
      nearClip: CONFIG.camera.near,
      farClip: CONFIG.camera.far,
      priority: 0
    });
    app.root.addChild(this.entity);
    this.desired.set(start.x, CONFIG.camera.heightOffset, start.z);
    this.lookAt.copy(this.desired);
    this.apply();
  }

  /** Viewport normalizado (origen abajo-izquierda, como PlayCanvas). */
  setViewport(rect: SplitRect): void {
    const camera = this.entity.camera;
    if (!camera) return;
    camera.rect = new pc.Vec4(rect.x, rect.y, rect.w, rect.h);
    // El aspect ratio se recalcula con el rect para que cada vista no se deforme.
    camera.aspectRatioMode = pc.ASPECT_AUTO;
  }

  /** Capas que renderiza esta cámara (mundo + capa propia del jugador). */
  setLayers(layerIds: number[]): void {
    const camera = this.entity.camera;
    if (camera) camera.layers = layerIds;
  }

  setEnabled(enabled: boolean): void {
    const camera = this.entity.camera;
    if (camera) camera.enabled = enabled;
  }

  setFarClip(far: number): void {
    const camera = this.entity.camera;
    if (camera) camera.farClip = far;
  }

  /** Giro directo (ratón) en radianes. */
  addYaw(delta: number): void {
    this.yaw += delta;
  }

  addZoom(delta: number): void {
    this.distance = pc.math.clamp(
      this.distance + delta,
      CONFIG.camera.minDistance,
      CONFIG.camera.maxDistance
    );
  }

  update(dt: number, target: { x: number; z: number }, yawInput: number, zoomInput: number): void {
    this.yaw -= yawInput * CONFIG.camera.stickSpeed * dt;
    this.distance = pc.math.clamp(
      this.distance - zoomInput * 9 * dt,
      CONFIG.camera.minDistance,
      CONFIG.camera.maxDistance
    );

    this.desired.set(target.x, CONFIG.camera.heightOffset, target.z);
    if (!this.initialized) {
      this.lookAt.copy(this.desired);
      this.initialized = true;
    } else {
      const t = 1 - Math.exp(-CONFIG.camera.followLerp * dt);
      this.lookAt.lerp(this.lookAt, this.desired, t);
    }
    this.apply();
  }

  private apply(): void {
    const horizontal = Math.cos(this.pitch) * this.distance;
    const height = Math.sin(this.pitch) * this.distance;
    this.entity.setPosition(
      this.lookAt.x + Math.sin(this.yaw) * horizontal,
      this.lookAt.y + height,
      this.lookAt.z + Math.cos(this.yaw) * horizontal
    );
    this.entity.lookAt(this.lookAt, pc.Vec3.UP);
  }

  get position(): pc.Vec3 {
    return this.entity.getPosition();
  }

  dispose(): void {
    this.entity.destroy();
  }
}
