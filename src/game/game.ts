import * as pc from 'playcanvas';
import { Actor } from './actor';
import { CameraRig } from './camera';
import { CONFIG, RAD } from './config';
import {
  IDLE_INPUT,
  Input,
  type DeviceInputSnapshot,
  type InputDeviceInfo,
  type InputFrame,
  type MenuAction
} from './input';
import {
  MAX_PLAYERS,
  TEAM_INFO,
  cameraYawForTeam,
  computeSplitLayout,
  facingToCenter,
  spawnForTeam,
  type MatchPlayerConfig,
  type PlayerMatchStats
} from './multiplayer';
import { speedForPokemon } from './roster';
import { disposeSpriteAsset, loadSpriteAsset, type SpriteAsset } from './sprite';
import { POND, TERRAINS, terrainAt, type Team } from './terrain';
import { terrainSpeedEffect, type TerrainSpeedReason } from './terrainSpeed';
import type { AnimationName, LoadingProgress, SpriteManifest } from './types';
import { buildWorld, type Collider, type World } from './world';

export interface GameCallbacks {
  onReady(manifest: SpriteManifest): void;
  onProgress(progress: LoadingProgress): void;
  onError(message: string): void;
  onDevicesChanged(devices: InputDeviceInfo[]): void;
  onMenuInput(event: { deviceId: string; action: MenuAction }): void;
  onPauseRequest(): void;
  onMatchStats(stats: PlayerMatchStats[]): void;
}

const NPC_SLOTS: Array<{ x: number; z: number }> = [
  { x: -11.2, z: 14.6 },
  { x: -15.0, z: 13.6 },
  { x: -13.6, z: 10.8 },
  { x: -10.4, z: 12.6 },
  { x: -12.4, z: 15.4 },
  { x: -15.6, z: 11.2 }
];

/** Los NPC del menú solo giran hacia la cámara cuando esta se acerca. */
const NPC_NOTICE_RADIUS = 2.4;

interface MatchPlayerState extends MatchPlayerConfig {
  types: string[];
  maxSpeed: number;
  x: number;
  z: number;
  facing: number;
  vx: number;
  vz: number;
  submerge: number;
  animation: AnimationName;
  playback: number;
  terrainMultiplier: number;
  terrainSpeedReason: TerrainSpeedReason;
  camera: CameraRig;
  /** Una copia del actor por viewport, indexada por jugador/vista. */
  copies: Actor[];
}

function angleLerp(current: number, target: number, t: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * Math.min(1, Math.max(0, t));
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Orquestador del motor. React nunca toca la escena: pide empezar/terminar una
 * partida y recibe eventos de entrada y telemetría por callbacks.
 *
 * Multijugador local:
 * - 1-8 jugadores, un teclado y varios mandos.
 * - Dos equipos con base propia.
 * - Una cámara por jugador y una copia de cada actor por viewport: el billboard
 *   y la fila de 8 direcciones dependen de la cámara, así que compartir actores
 *   entre vistas haría que mirasen mal desde los otros ángulos.
 */
export class Game {
  private readonly callbacks: GameCallbacks;
  private readonly app: pc.Application;
  private readonly world: World;
  private readonly input: Input;
  private readonly menuCamera: CameraRig;

  private readonly baseCameraLayers: number[];

  private manifest: SpriteManifest | null = null;
  private readonly assets = new Map<string, SpriteAsset>();

  /** Pokémon de exposición en la base azul mientras se eligen equipos. */
  private menuNpcs: Actor[] = [];

  private matchPlayers: MatchPlayerState[] = [];
  private viewLayers: pc.Layer[] = [];

  private ready = false;
  private mode: 'menu' | 'match' = 'menu';
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
    this.menuCamera = new CameraRig(this.app, CONFIG.world.spawn);
    this.input = new Input(canvas);

    // Las sombras del mundo son estáticas (los actores no proyectan sombra
    // direccional). Renderizarlas una sola vez evita repetir el pase por cada
    // viewport del splitscreen.
    const sun = this.app.root.findByName('sun') as pc.Entity | null;
    if (sun?.light) sun.light.shadowUpdateMode = pc.SHADOWUPDATE_THISFRAME;

    this.baseCameraLayers = ['World', 'Depth', 'Skybox', 'UI', 'Immediate']
      .map((name) => this.app.scene.layers.getLayerByName(name)?.id)
      .filter((id): id is number => id !== undefined);

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

      this.buildMenuCast();
      this.ready = true;
      this.mode = 'menu';
      this.menuCamera.setEnabled(true);
      this.callbacks.onReady(manifest);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido al cargar';
      this.callbacks.onError(message);
    }
  }

  private buildMenuCast(): void {
    const manifest = this.manifest;
    if (!manifest) return;

    for (const npc of this.menuNpcs) npc.destroy();
    this.menuNpcs = [];

    manifest.pokemon.forEach((entry, index) => {
      const asset = this.assets.get(entry.id);
      if (!asset) return;
      const slot = NPC_SLOTS[index % NPC_SLOTS.length];
      const homeFacing = Math.atan2(-slot.x, -slot.z);
      const npc = new Actor(this.app, asset, this.world.shadowMaterial, slot, homeFacing);
      npc.play('idle');
      this.menuNpcs.push(npc);
    });
  }

  /** Empieza una partida con los jugadores ya elegidos en React. */
  startMatch(configs: MatchPlayerConfig[]): void {
    if (!this.ready || configs.length === 0) return;
    this.clearMatch();

    const valid = configs
      .filter((config) => this.assets.has(config.pokemonId))
      .slice(0, MAX_PLAYERS);
    if (valid.length === 0) return;

    this.mode = 'match';
    this.paused = false;
    this.statsTimer = 0;
    this.fps = 0;
    this.menuCamera.setEnabled(false);
    for (const npc of this.menuNpcs) npc.setVisible(false);
    this.app.graphicsDevice.maxPixelRatio = Math.min(
      window.devicePixelRatio || 1,
      valid.length > 4 ? 1.2 : 1.5
    );

    const layout = computeSplitLayout(valid.length);
    const teamIndex: Record<Team, number> = { blue: 0, red: 0 };

    valid.forEach((config, index) => {
      const asset = this.assets.get(config.pokemonId);
      if (!asset) return;

      const spawn = spawnForTeam(config.team, teamIndex[config.team]++);
      const facing = facingToCenter(config.team);

      const layer = new pc.Layer({ name: `match-view-${index + 1}` });
      const layerComposition = this.app.scene.layers;
      const worldLayer = layerComposition.getLayerByName('World');
      // El cuerpo del sprite es opaco (alphaTest): debe ir antes de las
      // transparencias del mundo (agua, partículas) para que el agua pueda
      // taparle las piernas al sumergirse. El anillo y la sombra son
      // transparentes y van al final, por encima del agua.
      const worldTransparent = worldLayer ? layerComposition.getTransparentIndex(worldLayer) : -1;
      layerComposition.insertOpaque(
        layer,
        worldTransparent >= 0 ? worldTransparent : layerComposition.layerList.length
      );
      layerComposition.pushTransparent(layer);
      this.viewLayers.push(layer);

      const camera = new CameraRig(this.app, spawn);
      camera.setViewport(layout[index]);
      camera.setLayers([...this.baseCameraLayers, layer.id]);
      camera.yaw = cameraYawForTeam(config.team);
      camera.distance = CONFIG.camera.distance * (valid.length > 2 ? 1.12 : 1);
      camera.setEnabled(true);

      this.matchPlayers.push({
        ...config,
        types: asset.entry.types,
        maxSpeed: speedForPokemon(config.pokemonId),
        x: spawn.x,
        z: spawn.z,
        facing,
        vx: 0,
        vz: 0,
        submerge: 0,
        animation: 'idle',
        playback: 1,
        terrainMultiplier: 1,
        terrainSpeedReason: 'neutral',
        camera,
        copies: []
      });
    });

    // Rejilla N x N: cada jugador tiene una copia visible en cada viewport.
    this.matchPlayers.forEach((player, playerIndex) => {
      const asset = this.assets.get(player.pokemonId);
      if (!asset) return;
      this.matchPlayers.forEach((_, viewIndex) => {
        const copy = new Actor(
          this.app,
          asset,
          this.world.shadowMaterial,
          { x: player.x, z: player.z },
          player.facing,
          true,
          viewIndex === playerIndex,
          TEAM_INFO[player.team].accent
        );
        const layer = this.viewLayers[viewIndex];
        if (layer) copy.setLayer(layer.id);
        copy.play('idle');
        player.copies.push(copy);
      });
    });

    // El mapa es estático, pero el encuadre de las sombras depende de la
    // cámara. Rehorneamos una vez al empezar para que las bases de ambos
    // equipos queden cubiertas por el mapa de sombras del primer viewport.
    const sun = this.app.root.findByName('sun') as pc.Entity | null;
    if (sun?.light) sun.light.shadowUpdateMode = pc.SHADOWUPDATE_THISFRAME;

    this.callbacks.onMatchStats([]);
  }

  /** Vuelve al menú de selección y destruye la partida actual. */
  endMatch(): void {
    this.clearMatch();
    this.mode = 'menu';
    this.paused = false;
    this.statsTimer = 0;
    this.app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    this.menuCamera.setEnabled(true);
    for (const npc of this.menuNpcs) npc.setVisible(true);
    const sun = this.app.root.findByName('sun') as pc.Entity | null;
    if (sun?.light) sun.light.shadowUpdateMode = pc.SHADOWUPDATE_THISFRAME;
    this.callbacks.onMatchStats([]);
  }

  private clearMatch(): void {
    for (const player of this.matchPlayers) {
      for (const copy of player.copies) copy.destroy();
      player.copies = [];
      player.camera.dispose();
    }
    for (const layer of this.viewLayers) this.app.scene.layers.remove(layer);
    this.matchPlayers = [];
    this.viewLayers = [];
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused) return;
    for (const player of this.matchPlayers) {
      player.vx = 0;
      player.vz = 0;
      player.animation = 'idle';
      player.playback = 1;
      for (const copy of player.copies) copy.play('idle');
    }
  }

  private onUpdate = (dt: number): void => {
    if (this.disposed) return;
    const frameDt = Math.min(dt, 0.05);
    const frame = this.input.poll();

    if (frame.changed) this.callbacks.onDevicesChanged(frame.devices);

    this.fps =
      this.fps === 0
        ? 1 / Math.max(frameDt, 0.0001)
        : this.fps * 0.92 + (1 / Math.max(frameDt, 0.0001)) * 0.08;

    if (!this.ready) {
      this.world.update(frameDt);
      return;
    }

    const wasPaused = this.paused;

    // En menús y en pausa, React recibe las acciones de borde. Durante la
    // partida activa el motor las consume para pausar/movernos.
    if (this.mode === 'menu' || this.paused) {
      for (const event of frame.actions) this.callbacks.onMenuInput(event);
    }

    if (this.mode === 'menu') {
      this.updateMenu(frameDt);
      return;
    }

    if (this.paused) {
      this.world.update(frameDt);
      return;
    }

    // Si se acaba de reanudar con B/Esc, el mismo frame conserva el borde de
    // cancelar y volvería a pausar. Saltamos un frame de simulación.
    if (wasPaused) {
      this.world.update(frameDt);
      return;
    }

    this.updateMatch(frameDt, frame);
  };

  private updateMenu(dt: number): void {
    this.menuCamera.yaw += CONFIG.camera.attractSpeed * dt;
    this.menuCamera.update(dt, CONFIG.world.spawn, 0, 0);

    for (const npc of this.menuNpcs) {
      const dx = this.menuCamera.position.x - npc.position.x;
      const dz = this.menuCamera.position.z - npc.position.z;
      const distance = Math.hypot(dx, dz);
      const targetFacing =
        distance < NPC_NOTICE_RADIUS ? Math.atan2(dx, dz) : npc.homeFacing;
      const turn = distance < NPC_NOTICE_RADIUS ? 4.5 : 1.2;
      npc.setFacing(angleLerp(npc.facing, targetFacing, 1 - Math.exp(-turn * dt)));
      npc.play('idle');
      npc.update(dt, this.menuCamera.position);
    }

    this.world.update(dt);
  }

  private updateMatch(dt: number, frame: InputFrame): void {
    // Start/Escape/B pausan la partida. El coste de comprobarlo antes de mover
    // es despreciable y evita un frame de movimiento fantasma.
    for (const player of this.matchPlayers) {
      const snapshot = frame.snapshots.get(player.deviceId) ?? IDLE_INPUT;
      if (snapshot.startPressed || snapshot.cancel) {
        this.setPaused(true);
        this.callbacks.onPauseRequest();
        return;
      }
    }

    for (const player of this.matchPlayers) {
      this.stepPlayer(
        player,
        frame.snapshots.get(player.deviceId) ?? IDLE_INPUT,
        dt
      );
    }

    // Primero las cámaras ya están actualizadas; cada copia se orienta hacia
    // la cámara del viewport que la va a dibujar.
    this.matchPlayers.forEach((cameraOwner, viewIndex) => {
      const cameraPosition = cameraOwner.camera.position;
      this.matchPlayers.forEach((player) => {
        const copy = player.copies[viewIndex];
        if (!copy) return;
        copy.setPosition(player.x, player.z);
        copy.setFacing(player.facing);
        copy.play(player.animation);
        copy.setPlayback(player.playback);
        copy.setSubmerge(player.submerge, POND.surfaceHeight);
        copy.update(dt, cameraPosition);
      });
    });

    this.world.update(dt);

    this.statsTimer += dt;
    if (this.statsTimer >= 0.25) {
      this.statsTimer = 0;
      const stats: PlayerMatchStats[] = this.matchPlayers.map((player, index) => {
        const own = player.copies[index] ?? player.copies[0];
        const row = own?.billboard.currentRow ?? 0;
        const terrainId = terrainAt(player.x, player.z);
        const terrain = TERRAINS[terrainId];
        return {
          slot: player.slot,
          name: player.name,
          team: player.team,
          pokemonId: player.pokemonId,
          fps: Math.round(this.fps),
          yaw: player.camera.yaw * RAD,
          row,
          direction: this.manifest?.directions[row] ?? 'S',
          facing: ((player.facing * RAD) % 360 + 360) % 360,
          speed: Math.hypot(player.vx, player.vz),
          x: player.x,
          z: player.z,
          gamepad: player.deviceKind === 'gamepad',
          animation: player.animation,
          terrain: terrainId,
          terrainName: terrain.name,
          terrainType: terrain.type,
          terrainSpeedMultiplier: player.terrainMultiplier,
          terrainSpeedReason: player.terrainSpeedReason
        };
      });
      this.callbacks.onMatchStats(stats);
    }
  }

  private stepPlayer(player: MatchPlayerState, input: DeviceInputSnapshot, dt: number): void {
    const yaw = player.camera.yaw;
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    const desiredX = rightX * input.moveX + forwardX * input.moveY;
    const desiredZ = rightZ * input.moveX + forwardZ * input.moveY;
    const magnitude = Math.hypot(desiredX, desiredZ);

    const terrainEffect = terrainSpeedEffect(terrainAt(player.x, player.z), player.types);
    player.terrainMultiplier = terrainEffect.multiplier;
    player.terrainSpeedReason = terrainEffect.reason;
    const maxSpeed =
      player.maxSpeed *
      terrainEffect.multiplier *
      (input.run ? CONFIG.player.runMultiplier : 1);

    const targetVX = magnitude > 0.001 ? (desiredX / Math.max(magnitude, 1)) * maxSpeed : 0;
    const targetVZ = magnitude > 0.001 ? (desiredZ / Math.max(magnitude, 1)) * maxSpeed : 0;

    const rate =
      (magnitude > 0.01 ? CONFIG.player.acceleration : CONFIG.player.deceleration) * dt;
    player.vx += clamp(targetVX - player.vx, -rate, rate);
    player.vz += clamp(targetVZ - player.vz, -rate, rate);

    const resolved = this.resolvePosition(
      player,
      player.x + player.vx * dt,
      player.z + player.vz * dt
    );
    player.x = resolved.x;
    player.z = resolved.z;

    const speed = Math.hypot(player.vx, player.vz);
    if (speed > CONFIG.player.minFacingSpeed) {
      const targetFacing = Math.atan2(player.vx, player.vz);
      player.facing = angleLerp(
        player.facing,
        targetFacing,
        1 - Math.exp(-CONFIG.player.turnLerp * dt)
      );
    }

    if (speed > CONFIG.player.minFacingSpeed) {
      player.animation = 'walk';
      player.playback = clamp(
        speed / CONFIG.sprite.walkRateRefSpeed,
        CONFIG.sprite.walkRateMin,
        CONFIG.sprite.walkRateMax
      );
    } else {
      player.animation = 'idle';
      player.playback = 1;
    }

    const waterTerrain = terrainAt(player.x, player.z);
    const targetSubmerge =
      waterTerrain === 'waterHigh'
        ? CONFIG.player.submergeDeep
        : waterTerrain === 'waterLow' || waterTerrain === 'poison'
          ? CONFIG.player.submergeShallow
          : 0;
    player.submerge +=
      (targetSubmerge - player.submerge) * (1 - Math.exp(-CONFIG.player.submergeLerp * dt));
    if (player.submerge < 0.0005) player.submerge = 0;

    player.camera.addYaw(input.pointerYaw);
    if (input.wheel !== 0) {
      player.camera.addZoom(-input.wheel * CONFIG.camera.wheelStep);
    }
    player.camera.update(dt, player, input.cameraX, input.zoom);
  }

  private resolvePosition(
    self: MatchPlayerState,
    x: number,
    z: number
  ): { x: number; z: number } {
    const radius = CONFIG.player.radius;
    const colliders: Collider[] = this.world.colliders;
    let px = x;
    let pz = z;

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

      // Aguas profundas: solo los Pokémon de tipo Agua pueden entrar.
      if (!self.types.includes('Water')) {
        const dx = px - POND.x;
        const dz = pz - POND.z;
        const distance = Math.hypot(dx, dz);
        const minimum = POND.deepRadius + radius;
        if (distance < minimum) {
          if (distance < 0.0001) {
            px += minimum;
          } else {
            px = POND.x + (dx / distance) * minimum;
            pz = POND.z + (dz / distance) * minimum;
          }
          pushed = true;
        }
      }

      // Colisión entre jugadores (los NPC del menú están ocultos en partida).
      for (const other of this.matchPlayers) {
        if (other === self) continue;
        const dx = px - other.x;
        const dz = pz - other.z;
        const distance = Math.hypot(dx, dz);
        const minimum = radius * 2;
        if (distance < minimum) {
          if (distance < 0.0001) {
            px += minimum;
          } else {
            px = other.x + (dx / distance) * minimum;
            pz = other.z + (dz / distance) * minimum;
          }
          pushed = true;
        }
      }

      if (!pushed) break;
    }

    const bounds = this.world.bounds;
    return {
      x: clamp(px, -bounds, bounds),
      z: clamp(pz, -bounds, bounds)
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.app.off('update', this.onUpdate);
    this.input.dispose();
    this.clearMatch();
    for (const npc of this.menuNpcs) npc.destroy();
    this.menuNpcs = [];
    this.menuCamera.dispose();
    for (const asset of this.assets.values()) disposeSpriteAsset(asset);
    this.assets.clear();
    this.world.dispose();
    this.app.destroy();
  }
}
