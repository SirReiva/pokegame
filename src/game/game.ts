import * as pc from 'playcanvas';
import { Actor } from './actor';
import { CameraRig } from './camera';
import { CONFIG, RAD } from './config';
import { Input, type InputSnapshot } from './input';
import { disposeSpriteAsset, loadSpriteAsset, type SpriteAsset } from './sprite';
import type { GameStats, LoadingProgress, SpriteManifest } from './types';
import { buildWorld, type Collider, type World } from './world';

export interface GameCallbacks {
  onReady(manifest: SpriteManifest): void;
  onProgress(progress: LoadingProgress): void;
  onStats(stats: GameStats): void;
  onError(message: string): void;
  onMenuRequest(): void;
}

const IDLE_INPUT: InputSnapshot = {
  moveX: 0,
  moveY: 0,
  cameraX: 0,
  zoom: 0,
  wheel: 0,
  run: false,
  pointerYaw: 0,
  gamepad: false,
  startPressed: false
};

const NPC_SLOTS: Array<{ x: number; z: number }> = [
  { x: 3.7, z: 0.2 },
  { x: 2.5, z: 2.4 },
  { x: 2.5, z: -2.6 },
  { x: -2.6, z: -2.5 },
  { x: -3.7, z: 0.1 }
];

/** El jugador empieza mirando al este: no de cara a la cámara inicial. */
const PLAYER_START_FACING = Math.PI / 2;

/** Los NPC solo giran hacia el jugador cuando lo tienen cerca. */
const NPC_NOTICE_RADIUS = 2.4;

function angleLerp(current: number, target: number, t: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * Math.min(1, Math.max(0, t));
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Orquestador del motor. React solo habla con esta clase: crear, elegir
 * Pokémon, abrir/cerrar menú y recibir estadísticas.
 */
export class Game {
  private readonly callbacks: GameCallbacks;
  private readonly app: pc.Application;
  private readonly world: World;
  private readonly camera: CameraRig;
  private readonly input: Input;

  private manifest: SpriteManifest | null = null;
  private readonly assets = new Map<string, SpriteAsset>();

  private player: Actor | null = null;
  private npcs: Actor[] = [];
  private selectedId: string | null = null;

  private velocity = new pc.Vec3();
  private playerFacing = 0;
  private phase: 'loading' | 'ready' | 'playing' = 'loading';
  private menuOpen = true;
  private paused = false;
  private disposed = false;

  private statsTimer = 0;
  private fps = 0;

  constructor(canvas: HTMLCanvasElement, callbacks: GameCallbacks) {
    this.callbacks = callbacks;

    this.app = new pc.Application(canvas, {
      graphicsDeviceOptions: {
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: false
      }
    });
    this.app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);

    this.world = buildWorld(this.app);
    this.camera = new CameraRig(this.app, CONFIG.world.spawn);
    this.input = new Input(canvas);

    this.app.on('update', this.onUpdate);
    this.app.start();
  }

  async init(): Promise<void> {
    try {
      this.callbacks.onProgress({ loaded: 0, total: 12, label: 'Leyendo el manifiesto de sprites' });
      const response = await fetch(`${import.meta.env.BASE_URL}sprites/manifest.json`);
      if (!response.ok) {
        throw new Error(`No se pudo cargar el manifiesto (HTTP ${response.status})`);
      }
      const manifest = (await response.json()) as SpriteManifest;
      this.manifest = manifest;

      const total = manifest.pokemon.length * 2;
      let loaded = 0;
      this.callbacks.onProgress({ loaded, total, label: 'Cargando sprites' });

      await Promise.all(
        manifest.pokemon.map(async (entry) => {
          const asset = await loadSpriteAsset(this.app.graphicsDevice, entry);
          this.assets.set(entry.id, asset);
          loaded += 2;
          this.callbacks.onProgress({
            loaded,
            total,
            label: `${entry.name} listo`
          });
        })
      );

      if (this.disposed) return;

      this.applyRoster(manifest.pokemon[0].id);
      this.phase = 'ready';
      this.menuOpen = true;
      this.callbacks.onReady(manifest);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido al cargar';
      this.callbacks.onError(message);
    }
  }

  private applyRoster(selectedId: string): void {
    const manifest = this.manifest;
    if (!manifest) return;

    this.player?.destroy();
    this.player = null;
    for (const npc of this.npcs) npc.destroy();
    this.npcs = [];

    const selected = manifest.pokemon.find((entry) => entry.id === selectedId) ?? manifest.pokemon[0];
    const others = manifest.pokemon.filter((entry) => entry.id !== selected.id);

    const playerAsset = this.assets.get(selected.id);
    if (!playerAsset) return;

    this.player = new Actor(
      this.app,
      playerAsset,
      this.world.shadowMaterial,
      CONFIG.world.spawn,
      PLAYER_START_FACING,
      true
    );
    this.player.play('idle');
    this.playerFacing = PLAYER_START_FACING;
    this.velocity.set(0, 0, 0);

    others.forEach((entry, index) => {
      const asset = this.assets.get(entry.id);
      if (!asset) return;
      const slot = NPC_SLOTS[index % NPC_SLOTS.length];
      const homeFacing = Math.atan2(-slot.x, -slot.z);
      const npc = new Actor(this.app, asset, this.world.shadowMaterial, slot, homeFacing);
      npc.play('idle');
      this.npcs.push(npc);
    });

    this.selectedId = selected.id;
  }

  selectPokemon(id: string): void {
    if (id !== this.selectedId) {
      this.applyRoster(id);
    }
    this.phase = 'playing';
    this.menuOpen = false;
  }

  setMenuOpen(open: boolean): void {
    this.menuOpen = open;
    if (open) {
      this.velocity.set(0, 0, 0);
      this.player?.play('idle');
    }
  }

  /** Congela la entrada mientras hay un modal abierto, sin mover la cámara. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      this.velocity.set(0, 0, 0);
      this.player?.play('idle');
    }
  }

  private onUpdate = (dt: number): void => {
    if (this.disposed) return;
    const frameDt = Math.min(dt, 0.05);
    const snapshot = this.input.sample();

    if (snapshot.startPressed) {
      this.callbacks.onMenuRequest();
    }

    const input = this.menuOpen || this.paused ? IDLE_INPUT : snapshot;
    const player = this.player;
    const target = player ? player.position : CONFIG.world.spawn;

    // La cámara se actualiza antes que los sprites para que el billboard y la
    // fila de dirección usen la posición actual.
    if (this.menuOpen || this.phase !== 'playing') {
      this.camera.yaw += CONFIG.camera.attractSpeed * frameDt;
    }
    this.camera.addYaw(input.pointerYaw);
    if (input.wheel !== 0) {
      this.camera.addZoom(-input.wheel * CONFIG.camera.wheelStep);
    }
    this.camera.update(frameDt, target, input.cameraX, input.zoom);

    if (this.phase === 'playing' && !this.menuOpen && !this.paused) {
      this.updatePlayer(frameDt, input);
    }

    if (player) {
      this.updateNpcs(frameDt);
      player.update(frameDt, this.camera.position);
    }

    this.world.update(frameDt);

    this.fps = this.fps === 0 ? 1 / Math.max(frameDt, 0.0001) : this.fps * 0.92 + (1 / Math.max(frameDt, 0.0001)) * 0.08;
    this.statsTimer += frameDt;
    if (
      this.statsTimer >= 0.2 &&
      this.manifest &&
      player &&
      this.phase === 'playing' &&
      !this.menuOpen &&
      !this.paused
    ) {
      this.statsTimer = 0;
      const row = player.billboard.currentRow;
      const stats: GameStats = {
        fps: Math.round(this.fps),
        yaw: this.camera.yaw * RAD,
        distance: this.camera.distance,
        row,
        direction: this.manifest.directions[row] ?? 'S',
        facing: ((player.facing * RAD) % 360 + 360) % 360,
        speed: Math.hypot(this.velocity.x, this.velocity.z),
        x: player.position.x,
        z: player.position.z,
        gamepad: this.input.hasGamepad,
        animation: player.billboard.currentAnimation
      };
      this.callbacks.onStats(stats);
    }
  };

  private updatePlayer(dt: number, input: InputSnapshot): void {
    const player = this.player;
    if (!player) return;

    const yaw = this.camera.yaw;
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    const desiredX = rightX * input.moveX + forwardX * input.moveY;
    const desiredZ = rightZ * input.moveX + forwardZ * input.moveY;
    const magnitude = Math.hypot(desiredX, desiredZ);
    const maxSpeed = CONFIG.player.speed * (input.run ? CONFIG.player.runMultiplier : 1);

    const targetVX = magnitude > 0.001 ? (desiredX / Math.max(magnitude, 1)) * maxSpeed : 0;
    const targetVZ = magnitude > 0.001 ? (desiredZ / Math.max(magnitude, 1)) * maxSpeed : 0;

    const rate = (magnitude > 0.01 ? CONFIG.player.acceleration : CONFIG.player.deceleration) * dt;
    this.velocity.x += clamp(targetVX - this.velocity.x, -rate, rate);
    this.velocity.z += clamp(targetVZ - this.velocity.z, -rate, rate);

    const resolved = this.resolvePosition(
      player.position.x + this.velocity.x * dt,
      player.position.z + this.velocity.z * dt
    );
    player.setPosition(resolved.x, resolved.z);

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed > CONFIG.player.minFacingSpeed) {
      const targetFacing = Math.atan2(this.velocity.x, this.velocity.z);
      this.playerFacing = angleLerp(this.playerFacing, targetFacing, 1 - Math.exp(-CONFIG.player.turnLerp * dt));
    }
    player.setFacing(this.playerFacing);

    if (speed > CONFIG.player.minFacingSpeed) {
      player.play('walk');
      player.setPlayback(
        clamp(
          speed / CONFIG.sprite.walkRateRefSpeed,
          CONFIG.sprite.walkRateMin,
          CONFIG.sprite.walkRateMax
        )
      );
    } else {
      player.play('idle');
    }
  }

  private resolvePosition(x: number, z: number): { x: number; z: number } {
    const radius = CONFIG.player.radius;
    const colliders: Collider[] = this.world.colliders;
    let px = x;
    let pz = z;
    let collided = false;

    for (let iteration = 0; iteration < 4; iteration++) {
      let pushed = false;

      for (const collider of colliders) {
        if (collider.type === 'circle') {
          const dx = px - collider.x;
          const dz = pz - collider.z;
          const distance = Math.hypot(dx, dz);
          const minimum = collider.radius + radius;
          if (distance < minimum) {
            if (distance < 0.0001) {
              px += minimum;
            } else {
              px = collider.x + (dx / distance) * minimum;
              pz = collider.z + (dz / distance) * minimum;
            }
            pushed = true;
          }
        } else {
          const dx = collider.bx - collider.ax;
          const dz = collider.bz - collider.az;
          const lengthSq = dx * dx + dz * dz;
          let t = lengthSq > 0 ? ((px - collider.ax) * dx + (pz - collider.az) * dz) / lengthSq : 0;
          t = clamp(t, 0, 1);
          const closestX = collider.ax + dx * t;
          const closestZ = collider.az + dz * t;
          const ox = px - closestX;
          const oz = pz - closestZ;
          const distance = Math.hypot(ox, oz);
          const minimum = collider.radius + radius;
          if (distance < minimum) {
            if (distance < 0.0001) {
              px += minimum;
            } else {
              px = closestX + (ox / distance) * minimum;
              pz = closestZ + (oz / distance) * minimum;
            }
            pushed = true;
          }
        }
      }

      for (const npc of this.npcs) {
        const dx = px - npc.position.x;
        const dz = pz - npc.position.z;
        const distance = Math.hypot(dx, dz);
        const minimum = 0.5 + radius;
        if (distance < minimum) {
          if (distance < 0.0001) {
            px += minimum;
          } else {
            px = npc.position.x + (dx / distance) * minimum;
            pz = npc.position.z + (dz / distance) * minimum;
          }
          pushed = true;
        }
      }

      collided = collided || pushed;
      if (!pushed) break;
    }

    const bounds = this.world.bounds;
    return {
      x: clamp(px, -bounds, bounds),
      z: clamp(pz, -bounds, bounds)
    };
  }

  private updateNpcs(dt: number): void {
    const player = this.player;
    if (!player) return;
    for (const npc of this.npcs) {
      const dx = player.position.x - npc.position.x;
      const dz = player.position.z - npc.position.z;
      const distance = Math.hypot(dx, dz);

      // Cada NPC conserva su rumbo de reposo. Solo se gira hacia el jugador
      // cuando lo tiene cerca, y vuelve a su orientación al alejarse.
      const targetFacing =
        distance < NPC_NOTICE_RADIUS ? Math.atan2(dx, dz) : npc.homeFacing;
      const turn = distance < NPC_NOTICE_RADIUS ? 4.5 : 1.2;
      npc.setFacing(angleLerp(npc.facing, targetFacing, 1 - Math.exp(-turn * dt)));
      npc.play('idle');
      npc.update(dt, this.camera.position);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.app.off('update', this.onUpdate);
    this.input.dispose();
    this.player?.destroy();
    for (const npc of this.npcs) npc.destroy();
    this.player = null;
    this.npcs = [];
    for (const asset of this.assets.values()) disposeSpriteAsset(asset);
    this.assets.clear();
    this.world.dispose();
    this.app.destroy();
  }
}
