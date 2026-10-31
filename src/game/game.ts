import * as pc from 'playcanvas';
import {
  ABILITIES,
  ABILITY_SLOTS,
  MOVESETS,
  type AbilityDef,
  type AbilitySlot,
  type BuffStat,
  type SlowSpec
} from './abilities';
import {
  ABILITY_EXECUTORS,
  type AbilityExecutorDeps
} from './abilityExecutors';
import { Actor } from './actor';
import { CameraRig } from './camera';
import {
  KO_TARGET,
  angleDelta,
  closestPointOnCollider,
  computeDamage,
  pointBlockedByColliders,
  pointSegmentDistance,
  rollAccuracy,
  rollCritical,
  rollRandomFactor,
  segmentBlockedByColliders
} from './combat';
import { CombatFx } from './combatFx';
import { CONFIG, DEG, RAD } from './config';
import { DamageNumbers, type DamageNumberView } from './damageNumbers';
import { applyHealSelf, CAST_EFFECTS } from './effects';
import { FogDecal, FogView, createFogDecalMesh, createFogMesh, type SightOccluder } from './fog';
import {
  IDLE_INPUT,
  Input,
  type DeviceInputSnapshot,
  type InputDeviceInfo,
  type InputFrame,
  type MenuAction
} from './input';
import { loadMap, loadMapIndex, type MapIndexEntry } from './map';
import type {
  ActiveAoe,
  MatchPlayerState,
  PendingMeleeHit,
  Projectile
} from './matchState';
import {
  MAX_PLAYERS,
  TEAM_INFO,
  cameraYawForTeam,
  computeSplitLayout,
  facingToCenter,
  spawnForTeam,
  syncTeamsWithMap,
  type MatchEndResult,
  type MatchPlayerConfig,
  type PlayerMatchStats
} from './multiplayer';
import { baseStatsFor, combatStatsFor } from './pokedex';
import { speedForPokemon } from './roster';
import { disposeSpriteAsset, loadSpriteAsset, type SpriteAsset } from './sprite';
import {
  TERRAINS,
  getActiveMap,
  resolveDeepWater,
  setActiveMap,
  terrainAt,
  type GameMap,
  type Team
} from './terrain';
import { terrainSpeedEffect } from './terrainSpeed';
import type { AnimationName, LoadingProgress, SpriteManifest } from './types';
import {
  effectiveVisionRange,
  isTargetVisible,
  terrainConcealment,
  visionForPokemon
} from './vision';
import { buildWorld, type Collider, type World } from './world';

export interface GameCallbacks {
  onReady(manifest: SpriteManifest, maps: MapIndexEntry[], activeMapId: string): void;
  onProgress(progress: LoadingProgress): void;
  onError(message: string): void;
  onDevicesChanged(devices: InputDeviceInfo[]): void;
  onMenuInput(event: { deviceId: string; action: MenuAction }): void;
  onPauseRequest(): void;
  onMatchStats(stats: PlayerMatchStats[]): void;
  onMatchEnd(result: MatchEndResult): void;
}

export interface GameOptions {
  /** Mapa que se carga al montar `/play`. */
  mapId?: string;
  /** Manifiesto ya descargado por la sesión, para no pedirlo dos veces. */
  manifest?: SpriteManifest;
}

/** Cuánto se ensancha el radio de colisión de las cuñas de sombra. */
const MOUNTAIN_SHADOW_RADIUS = 1.05;

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
  private readonly options: GameOptions;
  private readonly app: pc.Application;
  private readonly input: Input;

  /**
   * El mundo y la cámara de menú se crean en `init`, después de cargar el JSON
   * del mapa, y se reconstruyen al cambiar de mapa.
   */
  private world!: World;
  private menuCamera!: CameraRig;
  private mapIndex: MapIndexEntry[] = [];
  private activeMapId = '';

  private readonly baseCameraLayers: number[];

  private manifest: SpriteManifest | null = null;
  private readonly assets = new Map<string, SpriteAsset>();

  private matchPlayers: MatchPlayerState[] = [];
  private viewLayers: pc.Layer[] = [];
  /** Proyectiles activos de todas las vistas. */
  private projectiles: Projectile[] = [];
  /** Áreas persistentes con daño periódico. */
  private activeAoes: ActiveAoe[] = [];
  /** Golpes melee del frame actual, resueltos después de mover a todos. */
  private pendingMeleeHits: PendingMeleeHit[] = [];
  /** Marcador de la partida; gana el primero que llegue a `KO_TARGET`. */
  private teamScores: Record<Team, number> = { blue: 0, red: 0 };
  private matchOver = false;
  private winner: Team | null = null;
  private readonly combatFx: CombatFx;
  private readonly damageNumbers: DamageNumbers;
  /** Quads de niebla, uno por vista. */
  private fogViews: FogView[] = [];
  /** Malla compartida por todas las vistas; se crea en la primera partida. */
  private fogMesh: pc.Mesh | null = null;
  /** Decals de sombra de cordillera en el suelo, uno por vista. */
  private fogDecals: FogDecal[] = [];
  private fogDecalMesh: pc.Mesh | null = null;
  /** Tramos de cordillera que proyectan sombra dentro de la niebla. */
  private sightOccluders: SightOccluder[] = [];

  private ready = false;
  private mode: 'menu' | 'match' = 'menu';
  private paused = false;
  private disposed = false;

  private statsTimer = 0;
  private fps = 0;

  constructor(canvas: HTMLCanvasElement, callbacks: GameCallbacks, options: GameOptions = {}) {
    this.callbacks = callbacks;
    this.options = options;

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

    this.input = new Input(canvas);

    this.baseCameraLayers = ['World', 'Depth', 'Skybox', 'UI', 'Immediate']
      .map((name) => this.app.scene.layers.getLayerByName(name)?.id)
      .filter((id): id is number => id !== undefined);

    const worldLayerId =
      this.app.scene.layers.getLayerByName('World')?.id ?? pc.LAYERID_WORLD;
    this.combatFx = new CombatFx(this.app, worldLayerId);
    this.damageNumbers = new DamageNumbers(this.app);

    this.app.on('update', this.onUpdate);
    this.app.start();
  }

  async init(): Promise<void> {
    try {
      this.callbacks.onProgress({ loaded: 0, total: 13, label: 'Cargando mapas' });
      this.mapIndex = await loadMapIndex();
      const requested =
        this.options.mapId ?? new URLSearchParams(window.location.search).get('map');
      const entry =
        this.mapIndex.find((candidate) => candidate.id === requested) ?? this.mapIndex[0];
      const map = await loadMap(entry);
      this.applyMap(map);

      let manifest = this.options.manifest ?? null;
      if (!manifest) {
        this.callbacks.onProgress({
          loaded: 0,
          total: 12,
          label: 'Leyendo el manifiesto de sprites'
        });
        const response = await fetch(
          `${import.meta.env.BASE_URL}sprites/manifest.json?v=${Date.now()}`
        );
        if (!response.ok) {
          throw new Error(`No se pudo cargar el manifiesto (HTTP ${response.status})`);
        }
        manifest = (await response.json()) as SpriteManifest;
      }
      this.manifest = manifest;

      const total = manifest.pokemon.length * 4;
      let loaded = 0;
      this.callbacks.onProgress({ loaded, total, label: 'Cargando sprites' });

      await Promise.all(
        manifest.pokemon.map(async (entry) => {
          const asset = await loadSpriteAsset(this.app.graphicsDevice, entry);
          this.assets.set(entry.id, asset);
          loaded += 4;
          this.callbacks.onProgress({
            loaded,
            total,
            label: `${entry.name} listo`
          });
        })
      );

      if (this.disposed) return;

      this.ready = true;
      this.mode = 'menu';
      this.menuCamera.setEnabled(true);
      this.callbacks.onReady(manifest, this.mapIndex, this.activeMapId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido al cargar';
      this.callbacks.onError(message);
    }
  }

  /** Cambia el mapa activo. Solo se permite desde el menú. */
  async selectMap(id: string): Promise<boolean> {
    if (!this.ready || this.mode !== 'menu' || id === this.activeMapId) return false;
    const entry = this.mapIndex.find((candidate) => candidate.id === id);
    if (!entry) throw new Error(`No existe el mapa "${id}"`);
    const map = await loadMap(entry);
    this.applyMap(map);
    this.menuCamera.setEnabled(true);
    return true;
  }

  /**
   * Reemplaza el mundo actual por el mapa indicado. Se usa al arrancar y al
   * cambiar de mapa; destruye la partida anterior para no dejar entidades ni
   * materiales del mapa anterior.
   */
  private applyMap(map: GameMap): void {
    this.clearMatch();
    this.menuCamera?.dispose();
    this.world?.dispose();

    setActiveMap(map);
    syncTeamsWithMap();
    this.world = buildWorld(this.app);
    this.activeMapId = map.id;
    this.rebuildSightOccluders();
    this.menuCamera = new CameraRig(this.app, map.spawn);
    this.refreshSunShadows();
  }

  /**
   * Rehornea el shadow map del sol cuando hay sombras activas. El mapa es
   * estático y los actores no proyectan sombra direccional, así que basta con
   * renderizarlas una vez por encuadre de cámara en vez de repetir el pase por
   * cada viewport del splitscreen. Sin sombras activas no hace nada.
   */
  private refreshSunShadows(): void {
    if (!CONFIG.sun.shadows) return;
    const sun = this.app.root.findByName('sun') as pc.Entity | null;
    if (sun?.light) sun.light.shadowUpdateMode = pc.SHADOWUPDATE_THISFRAME;
  }

  private rebuildSightOccluders(): void {
    this.sightOccluders = this.world.colliders.flatMap<SightOccluder>((collider) => {
      if (collider.type !== 'segment' || collider.sightRadius === undefined) return [];
      return [
        {
          x: (collider.ax + collider.bx) / 2,
          z: (collider.az + collider.bz) / 2,
          // Un poco más ancho que el radio de colisión del tramo para cubrir
          // el volumen visible de los picos, sin abrir la cuña de más.
          radius: collider.radius * MOUNTAIN_SHADOW_RADIUS,
          ax: collider.ax,
          az: collider.az,
          bx: collider.bx,
          bz: collider.bz
        }
      ];
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
    this.app.graphicsDevice.maxPixelRatio = Math.min(
      window.devicePixelRatio || 1,
      valid.length > 4 ? 1.2 : 1.5
    );

    const layout = computeSplitLayout(valid.length);
    const teamIndex: Record<Team, number> = { blue: 0, red: 0 };

    valid.forEach((config, index) => {
      const asset = this.assets.get(config.pokemonId);
      if (!asset) return;

      const indexInTeam = teamIndex[config.team];
      const spawn = spawnForTeam(config.team, indexInTeam);
      teamIndex[config.team] += 1;
      const facing = facingToCenter(config.team);
      const terrain = terrainAt(spawn.x, spawn.z);
      const combat = combatStatsFor(baseStatsFor(config.pokemonId));
      const moveset = MOVESETS[config.pokemonId] ?? [null, null, null, null];

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
        terrain,
        terrainMultiplier: 1,
        terrainSpeedReason: 'neutral',
        visionRange: visionForPokemon(config.pokemonId),
        concealment: terrainConcealment(terrain, asset.entry.types),
        enemiesSeeing: 0,
        camera,
        copies: [],
        viewport: layout[index],
        spawn,
        combat,
        hp: combat.hp,
        maxHp: combat.hp,
        alive: true,
        respawnTimer: 0,
        invulnerableTimer: 0,
        stunTimer: 0,
        hurtTimer: 0,
        actionTimer: 0,
        actionPlayback: 1,
        moveLockTimer: 0,
        actionAnimation: null,
        dash: null,
        pendingCast: null,
        deathFade: 0,
        kills: 0,
        deaths: 0,
        cooldowns: [0, 0, 0, 0],
        buffs: [],
        slowTimer: 0,
        slowMultiplier: 1,
        abilityIds: [...moveset]
      });

      this.fogViews.push(
        new FogView(this.app.graphicsDevice, this.ensureFogMesh(), camera.entity, layer.id, index)
      );
      this.fogDecals.push(
        new FogDecal(
          this.app.graphicsDevice,
          this.app.root,
          this.ensureFogDecalMesh(),
          layer.id,
          index,
          this.sightOccluders
        )
      );
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

    // Con sombras del sol activas, el encuadre depende de la cámara: se
    // rehornean al empezar para cubrir las bases de ambos equipos.
    this.refreshSunShadows();

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
    this.refreshSunShadows();
    this.callbacks.onMatchStats([]);
  }

  private clearMatch(): void {
    for (const projectile of this.projectiles) projectile.visual.destroy();
    this.projectiles = [];
    this.activeAoes = [];
    this.pendingMeleeHits = [];
    this.combatFx.clear();
    this.damageNumbers.clear();
    this.teamScores = { blue: 0, red: 0 };
    this.matchOver = false;
    this.winner = null;

    for (const fog of this.fogViews) fog.destroy();
    this.fogViews = [];
    for (const decal of this.fogDecals) decal.destroy();
    this.fogDecals = [];

    for (const player of this.matchPlayers) {
      for (const copy of player.copies) copy.destroy();
      player.copies = [];
      player.camera.dispose();
    }
    for (const layer of this.viewLayers) this.app.scene.layers.remove(layer);
    this.matchPlayers = [];
    this.viewLayers = [];
  }

  /**
   * Quad unitario compartido por todas las vistas. Cada `FogView` crea su
   * propia instancia y su propio material; lo único compartido es la malla.
   */
  private ensureFogMesh(): pc.Mesh {
    if (!this.fogMesh) this.fogMesh = createFogMesh(this.app.graphicsDevice);
    return this.fogMesh;
  }

  /** Plano horizontal compartido por los decals de sombra. */
  private ensureFogDecalMesh(): pc.Mesh {
    if (!this.fogDecalMesh) this.fogDecalMesh = createFogDecalMesh(this.app.graphicsDevice);
    return this.fogDecalMesh;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused) return;
    for (const player of this.matchPlayers) {
      player.vx = 0;
      player.vz = 0;
      // Un jugador KO conserva su faint; un dash o un hitstun tampoco se
      // interrumpen visualmente al pausar.
      if (
        !player.alive ||
        player.dash !== null ||
        player.pendingCast !== null ||
        player.stunTimer > 0 ||
        player.hurtTimer > 0
      ) {
        continue;
      }
      player.animation = 'idle';
      player.playback = 1;
      for (const copy of player.copies) copy.play('idle');
    }
  }

  private onUpdate = (dt: number): void => {
    if (this.disposed || !this.world) return;
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

    // Con la partida terminada se deja respirar al mundo y a los efectos, pero
    // no se simulan jugadores ni habilidades.
    if (this.matchOver) {
      this.world.update(frameDt);
      this.combatFx.update(frameDt);
      this.damageNumbers.update(frameDt);
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
    this.menuCamera.update(dt, getActiveMap().spawn, 0, 0);
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

    this.resolveMeleeHits();
    this.updateProjectiles(dt);
    this.updateActiveAoes(dt);

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
        // Solo la animación de preparación `once` deja de repetirse. El resto
        // (andar, reposo, clips en bucle) debe seguir avanzando: sin esto, un
        // windup móvil sin animación propia, como Giro Fuego, dejaba el caminar
        // congelado en su último frame para siempre.
        const pendingDef = player.pendingCast?.def;
        const windupClip = pendingDef
          ? pendingDef.windupAnimation ?? pendingDef.animation
          : null;
        copy.setLoop(
          windupClip === null ||
            player.animation !== windupClip ||
            pendingDef?.windupAnimationMode === 'loop'
        );
        copy.setPlayback(player.playback);
        copy.setSubmerge(player.submerge, this.world.waterHeight);
        copy.setHealth(player.alive ? player.hp / player.maxHp : 0);
        copy.update(dt, cameraPosition);
      });
    });

    // La niebla se resuelve después de mover a todos: cada copia se oculta en
    // las vistas que no la ven y cada cámara recibe su círculo de visión.
    this.updateVision();

    this.world.update(dt);
    this.combatFx.update(dt);
    this.damageNumbers.update(dt);

    this.statsTimer += dt;
    if (this.statsTimer >= 0.25) {
      this.statsTimer = 0;
      this.emitMatchStats();
    }
  }

  private stepPlayer(player: MatchPlayerState, input: DeviceInputSnapshot, dt: number): void {
    // Temporizadores de combate: corren también mientras el jugador está KO.
    for (let index = 0; index < player.cooldowns.length; index++) {
      player.cooldowns[index] = Math.max(0, player.cooldowns[index] - dt);
    }
    for (const buff of player.buffs) buff.duration -= dt;
    player.buffs = player.buffs.filter((buff) => buff.duration > 0);
    if (player.slowTimer > 0) {
      player.slowTimer = Math.max(0, player.slowTimer - dt);
      if (player.slowTimer === 0) player.slowMultiplier = 1;
    }
    if (player.invulnerableTimer > 0) {
      player.invulnerableTimer = Math.max(0, player.invulnerableTimer - dt);
    }
    if (player.stunTimer > 0) {
      player.stunTimer = Math.max(0, player.stunTimer - dt);
    }
    if (player.hurtTimer > 0) player.hurtTimer = Math.max(0, player.hurtTimer - dt);
    if (player.actionTimer > 0) player.actionTimer = Math.max(0, player.actionTimer - dt);
    if (player.moveLockTimer > 0) {
      player.moveLockTimer = Math.max(0, player.moveLockTimer - dt);
    }
    if (player.deathFade > 0) player.deathFade = Math.max(0, player.deathFade - dt);

    if (!player.alive) {
      player.vx = 0;
      player.vz = 0;
      player.respawnTimer = Math.max(0, player.respawnTimer - dt);
      if (player.respawnTimer <= 0) this.respawnPlayer(player);
      this.updateCamera(player, input, dt);
      return;
    }

    // Hitstun: bloquea movimiento y habilidades, pero deja girar la cámara.
    if (player.stunTimer > 0) {
      player.vx = 0;
      player.vz = 0;
      player.animation = 'hurt';
      player.playback = 1;
      const terrain = terrainAt(player.x, player.z);
      player.terrain = terrain;
      player.concealment = terrainConcealment(terrain, player.types);
      this.updateCamera(player, input, dt);
      return;
    }

    // Una habilidad con preparación bloquea movimiento y otras habilidades
    // mientras se reproduce su animación.
    if (this.stepPendingCast(player, input, dt)) return;

    // Un dash consume el frame: no se mezcla con el movimiento normal.
    if (this.stepDash(player, input, dt)) return;

    const yaw = player.camera.yaw;
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    // El bloqueo de las melee ignora el input de movimiento, pero deja girar la
    // cámara y lanzar otras habilidades.
    const moveX = player.moveLockTimer > 0 ? 0 : input.moveX;
    const moveY = player.moveLockTimer > 0 ? 0 : input.moveY;
    const desiredX = rightX * moveX + forwardX * moveY;
    const desiredZ = rightZ * moveX + forwardZ * moveY;
    const magnitude = Math.hypot(desiredX, desiredZ);

    const terrainEffect = terrainSpeedEffect(
      terrainAt(player.x, player.z),
      player.types
    );
    player.terrainMultiplier = terrainEffect.multiplier;
    player.terrainSpeedReason = terrainEffect.reason;
    const maxSpeed =
      player.maxSpeed *
      terrainEffect.multiplier *
      (input.run ? CONFIG.player.runMultiplier : 1) *
      this.buffMultiplier(player, 'speed') *
      player.slowMultiplier;

    const targetSpeed = maxSpeed * Math.min(1, magnitude);
    const currentSpeed = Math.hypot(player.vx, player.vz);

    if (magnitude > 0.001) {
      // El rumbo de avance gira hacia la entrada en vez de interpolar cada eje
      // por separado. Al mezclar `vx` y `vz` la inercia lateral sobrevive al
      // giro y el Pokémon derrapa: sigue desplazándose hacia el lado anterior
      // mientras ya mira hacia el nuevo. Girando el vector se conserva la
      // rapidez y el cuerpo traza un arco corto.
      const dirX = desiredX / magnitude;
      const dirZ = desiredZ / magnitude;
      // De entrada se apunta a la dirección exacta pedida. Solo se sustituye
      // por un rumbo intermedio si hace falta girar poco a poco.
      let headingX = dirX;
      let headingZ = dirZ;

      if (currentSpeed > 0.0001) {
        const currentX = player.vx / currentSpeed;
        const currentZ = player.vz / currentSpeed;
        const dot = clamp(currentX * dirX + currentZ * dirZ, -1, 1);
        const angle = Math.acos(dot);
        const maxStep = CONFIG.player.turnRate * dt;
        // Los giros casi opuestos se invierten en seco: girar el vector poco a
        // poco los desviaba hacia un lado trazando un arco en vez de volver.
        const snap = angle > CONFIG.player.turnSnapAngle * DEG;
        if (!snap && angle > maxStep) {
          const side = currentX * dirZ - currentZ * dirX >= 0 ? 1 : -1;
          const cos = Math.cos(maxStep);
          const sin = Math.sin(maxStep) * side;
          const nextX = currentX * cos - currentZ * sin;
          const nextZ = currentX * sin + currentZ * cos;
          headingX = nextX;
          headingZ = nextZ;
        }
      }

      const rate =
        (targetSpeed >= currentSpeed
          ? CONFIG.player.acceleration
          : CONFIG.player.deceleration) * dt;
      const nextSpeed =
        currentSpeed + clamp(targetSpeed - currentSpeed, -rate, rate);
      player.vx = headingX * nextSpeed;
      player.vz = headingZ * nextSpeed;
    } else if (currentSpeed > 0.0001) {
      // Sin entrada se frena en línea recta, conservando el rumbo.
      const nextSpeed = Math.max(0, currentSpeed - CONFIG.player.deceleration * dt);
      const scale = nextSpeed / currentSpeed;
      player.vx *= scale;
      player.vz *= scale;
    } else {
      player.vx = 0;
      player.vz = 0;
    }

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

    // Prioridad de animación: daño > ataque > andar > reposo. Durante un
    // windup móvil, andar tiene prioridad sobre el ataque para no deslizar.
    if (player.hurtTimer > 0) {
      player.animation = 'hurt';
      player.playback = 1;
    } else if (
      player.actionTimer > 0 &&
      player.actionAnimation !== null &&
      !(
        player.pendingCast?.def.moveWhileWindup &&
        speed > CONFIG.player.minFacingSpeed
      )
    ) {
      player.animation = player.actionAnimation;
      player.playback = player.actionPlayback;
    } else if (speed > CONFIG.player.minFacingSpeed) {
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

    const terrain = terrainAt(player.x, player.z);
    player.terrain = terrain;
    player.concealment = terrainConcealment(terrain, player.types);
    const targetSubmerge =
      terrain === 'waterHigh'
        ? CONFIG.player.submergeDeep
        : terrain === 'waterLow' || terrain === 'poison'
          ? CONFIG.player.submergeShallow
          : 0;
    player.submerge +=
      (targetSubmerge - player.submerge) * (1 - Math.exp(-CONFIG.player.submergeLerp * dt));
    if (player.submerge < 0.0005) player.submerge = 0;

    // Las habilidades se lanzan después de mover y girar: así salen siempre en
    // la dirección real a la que apunta el Pokémon en este frame.
    if (input.ability1) this.castAbility(player, 0);
    if (input.ability2) this.castAbility(player, 1);
    if (input.ability3) this.castAbility(player, 2);
    if (input.ability4) this.castAbility(player, 3);

    this.updateCamera(player, input, dt);
  }

  private updateCamera(
    player: MatchPlayerState,
    input: DeviceInputSnapshot,
    dt: number
  ): void {
    player.camera.addYaw(input.pointerYaw);
    if (input.wheel !== 0) {
      player.camera.addZoom(-input.wheel * CONFIG.camera.wheelStep);
    }
    player.camera.update(dt, player, input.cameraX, input.zoom);
  }

  /**
   * Avanza un dash activo. El desplazamiento se reparte durante la animación
   * (QuickStrike) para que se vea el salto, en vez de teletransportar al actor.
   * Devuelve `true` si este frame lo ha consumido el dash.
   */
  /** Ajusta la velocidad de la animación a la duración real del dash. */
  private animationPlaybackFor(
    player: MatchPlayerState,
    animation: AnimationName,
    duration: number
  ): number {
    const asset = this.assets.get(player.pokemonId);
    const clip =
      asset?.entry.animations[animation] ?? asset?.entry.animations.attack;
    const naturalDuration = clip
      ? clip.durations.reduce((total, ticks) => total + ticks, 0) / 60
      : duration;
    return naturalDuration > 0
      ? naturalDuration / Math.max(0.05, duration)
      : 1;
  }

  /**
   * Avanza una habilidad en preparación. El efecto (proyectil, haz, melee...)
   * no se ejecuta hasta que termina `windup`; durante ese tiempo el Pokémon
   * está quieto y reproduce la animación de la habilidad.
   */
  private stepPendingCast(
    player: MatchPlayerState,
    input: DeviceInputSnapshot,
    dt: number
  ): boolean {
    const pending = player.pendingCast;
    if (!pending) return false;

    pending.elapsed += dt;
    // Las habilidades marcadas con `moveWhileWindup` dejan seguir moviéndose;
    // el centro del área ya está fijado y la marca permanece en el suelo.
    const movable = pending.def.moveWhileWindup;
    if (!movable) {
      player.vx = 0;
      player.vz = 0;
      // La preparación puede tener su propia animación (por ejemplo, Shoot);
      // si no, se reutiliza la de lanzamiento. Si la habilidad no define
      // ninguna, se mantiene el reposo en vez de inventar una pose.
      const animation = pending.def.windupAnimation ?? pending.def.animation;
      if (animation === null) {
        player.animation = 'idle';
        player.playback = 1;
      } else {
        player.animation = animation;
        // `once`: el clip dura exactamente lo que la preparación; `loop`: velocidad
        // fija y repetición hasta que termine el windup.
        player.playback =
          pending.def.windupAnimationMode === 'loop'
            ? Math.max(0.05, pending.def.windupAnimationSpeed)
            : this.animationPlaybackFor(player, animation, pending.windup);
      }
    } else {
      // Mantén la pose de lanzamiento mientras el Pokémon esté quieto; al
      // andar, la animación de caminar tiene prioridad.
      player.actionTimer = Math.max(player.actionTimer, 0.05);
    }

    const terrain = terrainAt(player.x, player.z);
    player.terrain = terrain;
    player.concealment = terrainConcealment(terrain, player.types);

    if (pending.elapsed >= pending.windup) {
      this.cancelPendingCast(player);
      this.executeAbility(
        player,
        pending.def,
        pending.targetX,
        pending.targetZ
      );
    }

    if (!movable) {
      this.updateCamera(player, input, dt);
      return true;
    }
    return false;
  }

  private stepDash(
    player: MatchPlayerState,
    input: DeviceInputSnapshot,
    dt: number
  ): boolean {
    const dash = player.dash;
    if (!dash) return false;

    const previousX = player.x;
    const previousZ = player.z;
    dash.elapsed += dt;

    const next = this.dashPosition(
      player,
      player.x,
      player.z,
      dash.dirX,
      dash.dirZ,
      dash.speed * dt
    );
    player.x = next.x;
    player.z = next.z;
    const moved = Math.hypot(player.x - previousX, player.z - previousZ);

    for (const target of this.matchPlayers) {
      if (dash.hit.has(target) || !this.canHit(player, target)) continue;
      const distance = pointSegmentDistance(
        target.x,
        target.z,
        previousX,
        previousZ,
        player.x,
        player.z
      );
      if (distance <= Math.max(0.5, dash.def.radius) + CONFIG.player.radius) {
        dash.hit.add(target);
        this.applyAbilityDamage(player, target, dash.def);
      }
    }

    dash.trailTimer -= dt;
    if (moved > 0.01 && dash.trailTimer <= 0) {
      this.combatFx.spawnDash(
        previousX,
        previousZ,
        player.x,
        player.z,
        dash.def.color
      );
      dash.trailTimer = 0.04;
    }

    if (dash.def.animation !== null) {
      player.animation = dash.def.animation;
      player.playback = dash.playback;
    }
    player.vx = dash.dirX * dash.speed;
    player.vz = dash.dirZ * dash.speed;

    const terrain = terrainAt(player.x, player.z);
    player.terrain = terrain;
    player.concealment = terrainConcealment(terrain, player.types);
    const targetSubmerge =
      terrain === 'waterHigh'
        ? CONFIG.player.submergeDeep
        : terrain === 'waterLow' || terrain === 'poison'
          ? CONFIG.player.submergeShallow
          : 0;
    player.submerge +=
      (targetSubmerge - player.submerge) *
      (1 - Math.exp(-CONFIG.player.submergeLerp * dt));
    if (player.submerge < 0.0005) player.submerge = 0;

    // Si un obstáculo dinámico detiene el avance, el dash termina en el acto
    // en vez de quedarse reproduciendo la animación en el sitio.
    const expected = dash.speed * dt;
    if (dash.elapsed > dt && expected > 0.001 && moved < expected * 0.2) {
      player.dash = null;
      player.vx = 0;
      player.vz = 0;
      player.actionTimer = 0;
      this.updateCamera(player, input, dt);
      return true;
    }

    if (dash.elapsed >= dash.duration) {
      player.dash = null;
      player.vx = 0;
      player.vz = 0;
      player.actionTimer = 0;
    }

    this.updateCamera(player, input, dt);
    return true;
  }

  private buffMultiplier(player: MatchPlayerState, stat: BuffStat): number {
    let multiplier = 1;
    for (const buff of player.buffs) {
      if (buff.stat === stat) multiplier *= buff.multiplier;
    }
    return multiplier;
  }

  /** Reaparece en el punto de origen del equipo, con 2 s de invulnerabilidad. */
  private respawnPlayer(player: MatchPlayerState): void {
    const resolved = this.resolvePosition(player, player.spawn.x, player.spawn.z);
    player.x = resolved.x;
    player.z = resolved.z;
    player.facing = facingToCenter(player.team);
    player.vx = 0;
    player.vz = 0;
    player.hp = player.maxHp;
    player.alive = true;
    player.respawnTimer = 0;
    player.invulnerableTimer = CONFIG.combat.invulnerabilitySeconds;
    player.stunTimer = 0;
    player.hurtTimer = 0;
    player.actionTimer = 0;
    player.actionPlayback = 1;
    player.moveLockTimer = 0;
    player.dash = null;
    this.cancelPendingCast(player);
    player.deathFade = 0;
    player.cooldowns = [0, 0, 0, 0];
    player.buffs = [];
    player.slowTimer = 0;
    player.slowMultiplier = 1;
    player.animation = 'idle';
    player.playback = 1;
    player.terrain = terrainAt(player.x, player.z);
    player.concealment = terrainConcealment(player.terrain, player.types);
    player.submerge = 0;
    this.combatFx.spawnBuff(player.x, player.z, [255, 255, 255], 1.1);
  }

  /** Cancela una habilidad en preparación y retira su marca de área. */
  private cancelPendingCast(player: MatchPlayerState): void {
    player.pendingCast?.marker?.destroy();
    player.pendingCast = null;
  }

  private castAbility(player: MatchPlayerState, slotIndex: number): void {
    if (!player.alive || this.matchOver) return;
    if (player.pendingCast || player.dash) return;
    const abilityId = player.abilityIds[slotIndex];
    if (!abilityId) return;
    const def = ABILITIES[abilityId];
    if (!def) return;
    if (player.cooldowns[slotIndex] > 0.0001) return;

    player.cooldowns[slotIndex] = def.cooldown;
    // Solo las habilidades con animación propia ocupan el canal de acción;
    // sin animación el Pokémon conserva su reposo o su caminar.
    player.actionTimer = def.animation === null ? 0 : def.animationTime;
    player.actionPlayback = 1;
    player.actionAnimation = def.animation;
    if (def.animation !== null) player.animation = def.animation;
    player.playback = 1;
    player.vx = 0;
    player.vz = 0;

    if (def.windup > 0) {
      // La pose inicial de la preparación también usa su animación propia, así
      // no hay un frame con la animación de lanzamiento antes del windup.
      const windupAnimation = def.windupAnimation ?? def.animation;
      if (windupAnimation !== null) {
        player.animation = windupAnimation;
        player.playback =
          def.windupAnimationMode === 'loop'
            ? Math.max(0.05, def.windupAnimationSpeed)
            : this.animationPlaybackFor(
                player,
                windupAnimation,
                def.windup
              );
      } else {
        player.animation = 'idle';
        player.playback = 1;
      }
      const dirX = Math.sin(player.facing);
      const dirZ = Math.cos(player.facing);
      const targetX = player.x + dirX * def.range;
      const targetZ = player.z + dirZ * def.range;
      // Las habilidades de área fijan su centro al empezar el retardo y
      // muestran la marca en el suelo hasta el impacto.
      const marker =
        def.shape === 'aoe'
          ? this.combatFx.spawnAoeTelegraph(
              targetX,
              targetZ,
              def.radius,
              def.color,
              def.windup
            )
          : null;
      player.pendingCast = {
        def,
        slotIndex,
        elapsed: 0,
        windup: def.windup,
        marker,
        targetX,
        targetZ
      };
      return;
    }

    this.executeAbility(player, def);
  }

  /** Ejecuta el efecto de una habilidad cuando termina su preparación. */
  private executeAbility(
    player: MatchPlayerState,
    def: AbilityDef,
    targetX?: number,
    targetZ?: number
  ): void {
    // El lock y el clip de ataque empiezan cuando la habilidad se ejecuta de
    // verdad (tras el windup, si lo tiene). En las melee ambos duran lo mismo.
    player.moveLockTimer = Math.max(player.moveLockTimer, def.moveLock);
    if (def.shape === 'melee' && def.animation !== null) {
      player.actionTimer = def.animationTime;
      player.actionPlayback = this.animationPlaybackFor(
        player,
        def.animation,
        def.animationTime
      );
      player.animation = def.animation;
      player.playback = player.actionPlayback;
    }

    CAST_EFFECTS({
      player,
      def,
      combatFx: this.combatFx,
      showHealPopup: (target, amount) => this.showHealPopup(target, amount)
    });

    const deps: AbilityExecutorDeps = {
      combatFx: this.combatFx,
      world: this.world,
      matchPlayers: this.matchPlayers,
      canHit: (attacker, target) => this.canHit(attacker, target),
      applyAbilityDamage: (attacker, target, ability, options) =>
        this.applyAbilityDamage(attacker, target, ability, options),
      radialDamageMultiplier: (ability, distance, radius) =>
        this.radialDamageMultiplier(ability, distance, radius),
      dashPosition: (source, x, z, dirX, dirZ, distance) =>
        this.dashPosition(source, x, z, dirX, dirZ, distance),
      animationPlaybackFor: (source, animation, duration) =>
        this.animationPlaybackFor(source, animation, duration),
      addProjectile: (projectile) => this.projectiles.push(projectile),
      addActiveAoe: (aoe) => this.activeAoes.push(aoe),
      addPendingMeleeHit: (hit) => this.pendingMeleeHits.push(hit),
      healOnHit: (attacker, ability) =>
        applyHealSelf(attacker, ability, this.combatFx, (target, amount) =>
          this.showHealPopup(target, amount)
        )
    };

    ABILITY_EXECUTORS[def.shape](player, def, deps, targetX, targetZ);
    this.applySelfDamage(player, def);
  }

  /**
   * Coste de vida de habilidades como Explosión. Se aplica después del efecto
   * para que el golpe salga aunque el lanzador se quede al borde de la muerte,
   * y nunca le quita la última vida: como mínimo conserva 1 PV.
   */
  private applySelfDamage(
    player: MatchPlayerState,
    def: AbilityDef
  ): void {
    if (def.selfDamage <= 0 || !player.alive) return;
    const raw = Math.round(player.maxHp * def.selfDamage);
    const amount = Math.min(raw, Math.max(0, player.hp - 1));
    if (amount <= 0) return;
    player.hp -= amount;
    player.hurtTimer = Math.max(player.hurtTimer, 0.25);
    this.showDamagePopup(player, amount, false, 1);
  }

  private canHit(attacker: MatchPlayerState, target: MatchPlayerState): boolean {
    return (
      target !== attacker &&
      target.alive &&
      target.team !== attacker.team &&
      target.invulnerableTimer <= 0
    );
  }

  /** Aplica (o refresca) la ralentización de una habilidad de estado. */
  private applySlow(
    target: MatchPlayerState,
    slow: SlowSpec,
    color: readonly [number, number, number]
  ): void {
    target.slowTimer = Math.max(target.slowTimer, slow.duration);
    target.slowMultiplier = Math.min(target.slowMultiplier, slow.multiplier);
    this.combatFx.spawnBuff(target.x, target.z, color, 0.95);
  }

  /**
   * Multiplicador de daño por distancia al centro en habilidades de área.
   * Sin `radialDamage` devuelve 1. Con él, el centro hace el 100 % y el borde
   * `radialMinDamage` (0 % por defecto), con interpolación lineal.
   */
  private radialDamageMultiplier(
    def: AbilityDef,
    distance: number,
    radius: number
  ): number {
    if (!def.radialDamage) return 1;
    const t = Math.min(1, Math.max(0, distance / Math.max(0.001, radius)));
    const min = Math.min(1, Math.max(0, def.radialMinDamage));
    return 1 - (1 - min) * t;
  }

  private applyAbilityDamage(
    attacker: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef,
    options: { power?: number; control?: boolean } = {}
  ): void {
    const power = options.power ?? def.power;
    const damaging = power > 0 && def.category !== 'status';
    if (!rollAccuracy(def.accuracy)) return;

    // La ralentización se aplica aunque la habilidad no haga daño (Paralizador).
    if (def.slow && target.alive) {
      this.applySlow(target, def.slow, def.color);
    }
    if (!damaging) return;

    const critical = rollCritical();
    const category = def.category === 'physical' ? 'physical' : 'special';
    const physical = category === 'physical';
    const result = computeDamage({
      moveType: def.type,
      category,
      power,
      attacker: attacker.combat,
      defender: target.combat,
      attackerTypes: attacker.types,
      defenderTypes: target.types,
      attackMultiplier: this.buffMultiplier(attacker, physical ? 'attack' : 'spAttack'),
      defenseMultiplier: this.buffMultiplier(target, physical ? 'defense' : 'spDefense'),
      critical,
      randomFactor: rollRandomFactor()
    });

    this.combatFx.spawnImpact(
      target.x,
      target.z,
      def.color,
      result.effectiveness,
      def.impactStyle
    );
    this.showDamagePopup(target, result.damage, result.critical, result.effectiveness);

    // Los ticks de un área no controlan al objetivo: solo restan vida y
    // muestran el impacto. Los golpes normales sí cancelan dash/preparación.
    const control = options.control ?? true;
    if (control) {
      target.actionTimer = 0;
      target.moveLockTimer = 0;
      target.dash = null;
      this.cancelPendingCast(target);
    }

    if (result.damage <= 0) return;
    target.hp = Math.max(0, target.hp - result.damage);
    target.hurtTimer = Math.max(target.hurtTimer, control ? 0.35 : 0.2);
    if (control) {
      target.stunTimer = Math.max(target.stunTimer, CONFIG.combat.hitstunSeconds);
      if (def.knockback > 0) {
        this.applyKnockback(target, attacker.x, attacker.z, def.knockback);
      }
    }
    if (target.hp <= 0) this.knockOut(target, attacker);
  }

  /**
   * Crea un número de daño en cada viewport donde se ve al objetivo. El texto,
   * el quad y la animación los gestiona `DamageNumbers` dentro de PlayCanvas.
   */
  private showDamagePopup(
    target: MatchPlayerState,
    amount: number,
    critical: boolean,
    effectiveness: number
  ): void {
    this.spawnNumberPopup(target, {
      amount,
      critical,
      effectiveness,
      heal: false
    });
  }

  /** Número de curación flotante, con el mismo sistema que el daño. */
  private showHealPopup(target: MatchPlayerState, amount: number): void {
    this.spawnNumberPopup(target, {
      amount,
      critical: false,
      effectiveness: 1,
      heal: true
    });
  }

  private spawnNumberPopup(
    target: MatchPlayerState,
    options: {
      amount: number;
      critical: boolean;
      effectiveness: number;
      heal: boolean;
    }
  ): void {
    const asset = this.assets.get(target.pokemonId);
    if (!asset) return;

    const idle = asset.entry.animations.idle;
    const anchorY = idle.anchors[0]?.y ?? idle.frameHeight * 0.75;
    const worldY =
      0.04 +
      anchorY * CONFIG.sprite.pixelScale * CONFIG.sprite.verticalStretch +
      0.2;

    const views: DamageNumberView[] = [];
    this.matchPlayers.forEach((viewer, viewIndex) => {
      const copy = target.copies[viewIndex];
      const camera = viewer.camera.entity.camera;
      const layer = this.viewLayers[viewIndex];
      if (!copy?.isVisible || !camera || !layer) return;
      views.push({ camera, layerId: layer.id });
    });

    if (views.length === 0) return;
    this.damageNumbers.spawn({
      x: target.x,
      y: worldY,
      z: target.z,
      amount: options.amount,
      critical: options.critical,
      effectiveness: options.effectiveness,
      heal: options.heal,
      views
    });
  }

  private knockOut(target: MatchPlayerState, killer: MatchPlayerState): void {
    if (!target.alive) return;
    const entry = this.assets.get(target.pokemonId)?.entry;
    const deathAnimation = entry?.animations.faint ?? entry?.animations.hurt;
    const deathDuration = deathAnimation
      ? deathAnimation.durations.reduce((total, ticks) => total + ticks, 0) / 60
      : 0.7;

    target.alive = false;
    target.hp = 0;
    target.deaths += 1;
    target.respawnTimer = CONFIG.combat.respawnSeconds;
    target.deathFade = Math.max(0.45, deathDuration);
    target.hurtTimer = 0;
    target.actionTimer = 0;
    target.moveLockTimer = 0;
    target.dash = null;
    this.cancelPendingCast(target);
    target.vx = 0;
    target.vz = 0;
    target.buffs = [];
    target.slowTimer = 0;
    target.slowMultiplier = 1;
    target.animation = entry?.animations.faint ? 'faint' : 'hurt';
    target.playback = 1;
    for (const copy of target.copies) copy.play(target.animation, true);

    if (killer.team !== target.team) {
      killer.kills += 1;
      this.teamScores[killer.team] += 1;
      if (this.teamScores[killer.team] >= KO_TARGET) {
        this.matchOver = true;
        this.winner = killer.team;
        const result: MatchEndResult = {
          winner: killer.team,
          blueScore: this.teamScores.blue,
          redScore: this.teamScores.red
        };
        this.callbacks.onMatchEnd(result);
      }
    }
    this.emitMatchStats();
  }

  private updateProjectiles(dt: number): void {
    for (let index = this.projectiles.length - 1; index >= 0; index--) {
      const projectile = this.projectiles[index];
      projectile.x += projectile.vx * dt;
      projectile.z += projectile.vz * dt;
      projectile.traveled += Math.hypot(projectile.vx, projectile.vz) * dt;
      projectile.visual.setPosition(projectile.x, projectile.z);
      projectile.visual.update(dt);
      const bounds = this.world.bounds;
      if (
        Math.abs(projectile.x) > bounds.x ||
        Math.abs(projectile.z) > bounds.z ||
        this.projectileBlocked(projectile) ||
        projectile.traveled >= projectile.def.range
      ) {
        this.removeProjectile(index);
        continue;
      }

      let removed = false;
      for (const target of this.matchPlayers) {
        if (!this.canHit(projectile.owner, target)) continue;
        if (projectile.hit.has(target)) continue;
        const distance = Math.hypot(
          target.x - projectile.x,
          target.z - projectile.z
        );
        if (distance > CONFIG.player.radius + projectile.def.radius) continue;

        projectile.hit.add(target);
        this.applyAbilityDamage(projectile.owner, target, projectile.def);
        if (projectile.pierce > 0) {
          projectile.pierce -= 1;
        } else {
          this.removeProjectile(index);
          removed = true;
          break;
        }
      }
      if (removed) continue;
    }
  }

  /**
   * Avanza las áreas persistentes y golpea en cada tick a los enemigos que
   * sigan dentro. En modo `overTime`, `power` se interpreta como daño por
   * segundo, así que cada tick usa `power × aoeTickInterval`.
   */
  private updateActiveAoes(dt: number): void {
    for (let index = this.activeAoes.length - 1; index >= 0; index--) {
      const aoe = this.activeAoes[index];
      aoe.elapsed += dt;
      aoe.tickTimer -= dt;
      // El primer tick cae al aparecer el área (tickTimer empieza en 0).
      let guard = 0;
      while (
        aoe.tickTimer <= 0 &&
        aoe.elapsed < aoe.duration &&
        guard < 8
      ) {
        guard += 1;
        this.tickAoe(aoe);
        aoe.tickTimer += aoe.tickInterval;
      }
      if (aoe.elapsed >= aoe.duration) {
        this.activeAoes.splice(index, 1);
      }
    }
  }

  private tickAoe(aoe: ActiveAoe): void {
    const basePower = aoe.def.power * aoe.tickInterval;
    if (basePower <= 0) return;
    for (const target of this.matchPlayers) {
      if (!this.canHit(aoe.owner, target)) continue;
      const distance = Math.hypot(target.x - aoe.x, target.z - aoe.z);
      if (distance > aoe.radius + CONFIG.player.radius) continue;
      const radial = this.radialDamageMultiplier(
        aoe.def,
        distance,
        aoe.radius
      );
      this.applyAbilityDamage(aoe.owner, target, aoe.def, {
        power: basePower * radial,
        control: false
      });
    }
  }

  private meleePairKey(a: MatchPlayerState, b: MatchPlayerState): string {
    return a.slot < b.slot ? `${a.slot}-${b.slot}` : `${b.slot}-${a.slot}`;
  }

  /**
   * Resuelve los golpes melee del frame. Si dos rivales se golpean mutuamente,
   * se produce un choque: ninguno recibe daño, ambos reciben un stun corto y
   * retroceden. Así dos Placajes simultáneos no se intercambian gratis.
   */
  private resolveMeleeHits(): void {
    if (this.pendingMeleeHits.length === 0) return;
    const hits = this.pendingMeleeHits;
    this.pendingMeleeHits = [];
    const clashPairs = new Set<string>();

    for (const hit of hits) {
      const key = this.meleePairKey(hit.attacker, hit.target);
      if (clashPairs.has(key)) continue;
      const reverse = hits.some(
        (other) =>
          other.attacker === hit.target && other.target === hit.attacker
      );
      if (!reverse) continue;

      clashPairs.add(key);
      const midpointX = (hit.attacker.x + hit.target.x) / 2;
      const midpointZ = (hit.attacker.z + hit.target.z) / 2;
      this.combatFx.spawnHit(midpointX, midpointZ, [255, 240, 170], 2);

      for (const player of [hit.attacker, hit.target]) {
        player.stunTimer = Math.max(
          player.stunTimer,
          CONFIG.combat.clashStunSeconds
        );
        player.hurtTimer = Math.max(player.hurtTimer, 0.35);
        player.actionTimer = 0;
        player.moveLockTimer = 0;
        player.dash = null;
        this.cancelPendingCast(player);
        player.vx = 0;
        player.vz = 0;
        player.animation = 'hurt';
        player.playback = 1;
      }

      this.applyKnockback(
        hit.attacker,
        hit.target.x,
        hit.target.z,
        CONFIG.combat.clashKnockback
      );
      this.applyKnockback(
        hit.target,
        hit.attacker.x,
        hit.attacker.z,
        CONFIG.combat.clashKnockback
      );
    }

    for (const hit of hits) {
      if (clashPairs.has(this.meleePairKey(hit.attacker, hit.target))) continue;
      if (!hit.attacker.alive || !this.canHit(hit.attacker, hit.target)) continue;

      // El objetivo puede haberse movido en este mismo frame (dash, empuje de
      // otro golpe...). Se vuelve a validar el cono antes de aplicar el daño.
      const dx = hit.target.x - hit.attacker.x;
      const dz = hit.target.z - hit.attacker.z;
      const distance = Math.hypot(dx, dz);
      if (distance > hit.def.range + CONFIG.player.radius) continue;
      if (distance >= 0.001) {
        const delta = Math.abs(
          angleDelta(Math.atan2(dx, dz), hit.attacker.facing)
        );
        if (delta > hit.def.halfAngle * DEG) continue;
      }

      this.applyAbilityDamage(hit.attacker, hit.target, hit.def);
    }
  }

  /** Empuja al objetivo en dirección opuesta al atacante. */
  private applyKnockback(
    target: MatchPlayerState,
    fromX: number,
    fromZ: number,
    distance: number
  ): void {
    if (distance <= 0) return;
    const dx = target.x - fromX;
    const dz = target.z - fromZ;
    const length = Math.hypot(dx, dz);
    if (length < 0.0001) return;
    const resolved = this.dashPosition(
      target,
      target.x,
      target.z,
      dx / length,
      dz / length,
      distance
    );
    target.x = resolved.x;
    target.z = resolved.z;
  }

  private projectileBlocked(projectile: Projectile): boolean {
    return pointBlockedByColliders(
      projectile.x,
      projectile.z,
      this.world.colliders,
      Math.max(0.05, projectile.def.radius)
    );
  }

  private removeProjectile(index: number): void {
    const projectile = this.projectiles[index];
    if (!projectile) return;
    projectile.visual.destroy();
    this.projectiles.splice(index, 1);
  }

  private emitMatchStats(): void {
    const stats: PlayerMatchStats[] = this.matchPlayers.map((player, index) => {
      const own = player.copies[index] ?? player.copies[0];
      const row = own?.billboard.currentRow ?? 0;
      const terrain = TERRAINS[player.terrain];
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
        terrain: player.terrain,
        terrainName: terrain.name,
        terrainType: terrain.type,
        terrainSpeedMultiplier: player.terrainMultiplier,
        terrainSpeedReason: player.terrainSpeedReason,
        visionRange: player.visionRange,
        detectionRange: effectiveVisionRange(player.visionRange, player.concealment.value),
        concealment: player.concealment.value,
        concealmentBase: player.concealment.base,
        concealmentMultiplier: player.concealment.multiplier,
        concealmentReason: player.concealment.reason,
        enemiesSeeing: player.enemiesSeeing,
        discovered: player.alive && player.enemiesSeeing > 0,
        hp: player.hp,
        maxHp: player.maxHp,
        alive: player.alive,
        respawnIn: player.respawnTimer,
        invulnerable: player.invulnerableTimer > 0,
        kills: player.kills,
        deaths: player.deaths,
        abilities: player.abilityIds.map((id, abilityIndex) => {
          const def = id ? ABILITIES[id] : null;
          return {
            slot: ABILITY_SLOTS[abilityIndex] as AbilitySlot,
            id: id ?? '',
            name: def?.name ?? 'Sin asignar',
            type: def?.type ?? '',
            category: def?.category ?? 'status',
            cooldown: player.cooldowns[abilityIndex] ?? 0,
            duration: def?.cooldown ?? 0
          };
        }),
        blueScore: this.teamScores.blue,
        redScore: this.teamScores.red,
        winner: this.winner
      };
    });
    this.callbacks.onMatchStats(stats);
  }

  /**
   * Resuelve la niebla de cada vista: oculta las copias que no se ven y coloca
   * el degradado fuera del círculo de visión. La ocultación del objetivo se
   * calcula con el terreno que pisa, no con el del observador.
   */
  private updateVision(): void {
    const colliders = this.world.colliders;
    for (const player of this.matchPlayers) player.enemiesSeeing = 0;

    this.matchPlayers.forEach((observer, viewIndex) => {
      const fog = this.fogViews[viewIndex];
      const camera = observer.camera.entity.camera;
      if (fog && camera) {
        fog.update(
          camera,
          observer.viewport,
          observer.camera.yaw,
          observer.x,
          observer.z,
          observer.visionRange
        );
      }

      const decal = this.fogDecals[viewIndex];
      if (decal) {
        const screenFog = fog && camera ? fog.screenFog : null;
        decal.update(observer.x, observer.z, observer.visionRange, screenFog);
      }

      for (const target of this.matchPlayers) {
        const copy = target.copies[viewIndex];
        if (!copy) continue;
        // Un KO deja ver la animación de daño un instante; después el cuerpo
        // desaparece hasta reaparecer.
        if (!target.alive && target.deathFade <= 0) {
          copy.setVisible(false);
          continue;
        }
        if (target === observer) {
          copy.setVisible(true);
          continue;
        }
        const visible = isTargetVisible(
          observer,
          target,
          target.concealment.value,
          colliders,
          copy.isVisible
        );
        copy.setVisible(visible);
        // Un rival vivo que te ve te deja "descubierto" para su equipo.
        if (visible && observer.alive && target.alive && observer.team !== target.team) {
          target.enemiesSeeing += 1;
        }
      }
    });
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
        const closest = closestPointOnCollider(collider, px, pz);
        const dx = px - closest.x;
        const dz = pz - closest.z;
        const distance = Math.hypot(dx, dz);
        const minimum = collider.radius + radius;
        if (distance < minimum) {
          if (distance < 0.0001) {
            px += minimum;
          } else {
            px = closest.x + (dx / distance) * minimum;
            pz = closest.z + (dz / distance) * minimum;
          }
          pushed = true;
        }
      }

      // Aguas profundas: solo los Pokémon de tipo Agua pueden entrar.
      if (!self.types.includes('Water')) {
        const resolved = resolveDeepWater(px, pz, radius);
        if (resolved[0] !== px || resolved[1] !== pz) {
          px = resolved[0];
          pz = resolved[1];
          pushed = true;
        }
      }

      // Colisión entre jugadores vivos; un KO no bloquea el paso.
      for (const other of this.matchPlayers) {
        if (other === self || !other.alive) continue;
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
      x: clamp(px, -bounds.x, bounds.x),
      z: clamp(pz, -bounds.z, bounds.z)
    };
  }

  /**
   * Avanza un dash en pasos pequeños comprobando colisiones en cada tramo.
   *
   * Resolver solo el destino final permitiría que un dash de 4,5 u saltase al
   * otro lado de un separador fino. Aquí cada paso comprueba el segmento
   * recorrido: si un separador, árbol o muro lo bloquea, el dash se detiene en
   * el último punto seguro.
   */
  private dashPosition(
    self: MatchPlayerState,
    startX: number,
    startZ: number,
    dirX: number,
    dirZ: number,
    distance: number
  ): { x: number; z: number } {
    const stepLength = 0.15;
    const steps = Math.max(1, Math.ceil(distance / stepLength));
    const stepX = (dirX * distance) / steps;
    const stepZ = (dirZ * distance) / steps;
    const stepSize = Math.hypot(stepX, stepZ);
    const colliders = this.world.colliders;
    let x = startX;
    let z = startZ;

    for (let index = 0; index < steps; index++) {
      const targetX = x + stepX;
      const targetZ = z + stepZ;
      if (
        segmentBlockedByColliders(
          x,
          z,
          targetX,
          targetZ,
          colliders,
          CONFIG.player.radius
        )
      ) {
        break;
      }

      const next = this.resolvePosition(self, targetX, targetZ);
      const moved = Math.hypot(next.x - x, next.z - z);
      // También frena si el paso se queda atascado contra otro jugador, un
      // límite del mapa o un agua profunda.
      if (moved < stepSize * 0.35) break;
      x = next.x;
      z = next.z;
    }

    return { x, z };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.app.off('update', this.onUpdate);
    this.input.dispose();
    this.clearMatch();
    this.combatFx.destroy();
    this.damageNumbers.destroy();
    this.fogMesh?.destroy();
    this.fogMesh = null;
    this.fogDecalMesh?.destroy();
    this.fogDecalMesh = null;
    this.menuCamera?.dispose();
    for (const asset of this.assets.values()) disposeSpriteAsset(asset);
    this.assets.clear();
    this.world?.dispose();
    this.app.destroy();
  }
}
