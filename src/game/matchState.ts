/**
 * Estado mutable de una partida: jugadores, proyectiles, áreas y golpes
 * pendientes. Se separa de `Game` para que los ejecutores de habilidades y los
 * subsistemas de combate compartan tipos sin importar el orquestador.
 */

import type { AbilityDef, BuffStat } from './abilities';
import type { Actor } from './actor';
import type { CameraRig } from './camera';
import type { EffectHandle, TelegraphHandle } from './combatFx';
import type { MatchPlayerConfig, SplitRect } from './multiplayer';
import type { CombatStats } from './pokedex';
import type { TerrainId } from './terrain';
import type { TerrainSpeedReason } from './terrainSpeed';
import type { AnimationName } from './types';
import type { Concealment } from './vision';

export interface ActiveBuff {
  stat: BuffStat;
  multiplier: number;
  duration: number;
}

/**
 * Seguimiento de la curación por impacto de un mismo lanzamiento. Lo comparten
 * todos los golpes de la habilidad (varios objetivos, varios ticks o impactos
 * de un dash) para que `healOnHit` cure una sola vez aunque alcance a más de un
 * rival.
 */
export interface HealOnHitToken {
  healed: boolean;
}

/**
 * Ralentización activa con su propio tiempo restante. Se guardan por separado
 * para que un slow débil no alargue uno fuerte y para que los ticks de una
 * misma habilidad no renueven la duración una y otra vez.
 */
export interface SlowEffect {
  /** Lanzador y habilidad que la aplicaron; los ticks de un área comparten la clave. */
  source: string;
  multiplier: number;
  remaining: number;
}

export interface Projectile {
  owner: MatchPlayerState;
  def: AbilityDef;
  x: number;
  z: number;
  vx: number;
  vz: number;
  traveled: number;
  pierce: number;
  hit: Set<MatchPlayerState>;
  visual: EffectHandle;
  /** Curación por impacto del lanzamiento; `undefined` si no la tiene. */
  healToken?: HealOnHitToken;
}

export interface PendingMeleeHit {
  attacker: MatchPlayerState;
  target: MatchPlayerState;
  def: AbilityDef;
  healToken?: HealOnHitToken;
}

/**
 * Habilidad instantánea cuya ejecución se difiere al final del frame, después
 * de que todos los jugadores hayan tenido su turno. Así el daño, el stun y la
 * cancelación de una habilidad no dependen del orden de `matchPlayers`.
 */
export interface QueuedCast {
  player: MatchPlayerState;
  def: AbilityDef;
  targetX?: number;
  targetZ?: number;
}

/**
 * Golpe de dash detectado durante el desplazamiento. El daño se aplica en la
 * fase común de resolución para que un dash no tumbe al rival antes de que
 * este haya podido actuar.
 */
export interface PendingInstantHit {
  attacker: MatchPlayerState;
  target: MatchPlayerState;
  def: AbilityDef;
  healToken?: HealOnHitToken;
}

export interface PlayerDash {
  def: AbilityDef;
  elapsed: number;
  duration: number;
  dirX: number;
  dirZ: number;
  speed: number;
  /** Distancia total del dash, ya recortada por obstáculos al lanzarlo. */
  distance: number;
  /** Distancia recorrida; nunca supera `distance`. */
  traveled: number;
  /** Velocidad de la animación para que dure lo mismo que el desplazamiento. */
  playback: number;
  trailTimer: number;
  hit: Set<MatchPlayerState>;
  /** Curación por impacto del lanzamiento; `undefined` si no la tiene. */
  healToken?: HealOnHitToken;
}

export interface PendingCast {
  def: AbilityDef;
  slotIndex: number;
  elapsed: number;
  windup: number;
  /** Marca en el suelo de las habilidades de área; `null` en las demás. */
  marker: TelegraphHandle | null;
  /** Centro del área fijado al empezar el lanzamiento. */
  targetX: number;
  targetZ: number;
}

/** Área persistente que aplica daño periódico mientras el rival siga dentro. */
export interface ActiveAoe {
  owner: MatchPlayerState;
  def: AbilityDef;
  x: number;
  z: number;
  radius: number;
  elapsed: number;
  duration: number;
  tickInterval: number;
  /** Segundos restantes hasta el próximo golpe. */
  tickTimer: number;
  /** Curación por impacto del lanzamiento; `undefined` si no la tiene. */
  healToken?: HealOnHitToken;
}

export interface MatchPlayerState extends MatchPlayerConfig {
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
  terrain: TerrainId;
  terrainMultiplier: number;
  terrainSpeedReason: TerrainSpeedReason;
  visionRange: number;
  concealment: Concealment;
  /** Nº de rivales vivos que te ven ahora mismo (se recalcula cada frame). */
  enemiesSeeing: number;
  camera: CameraRig;
  /** Una copia del actor por viewport, indexada por jugador/vista. */
  copies: Actor[];
  /** Rectángulo normalizado de esta vista, para proyectar la niebla. */
  viewport: SplitRect;

  /** Punto de reaparición del equipo. */
  spawn: { x: number; z: number };
  /** Stats finales a nivel 50 (HP, ataque, defensa...). */
  combat: CombatStats;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Segundos restantes hasta reaparecer. */
  respawnTimer: number;
  /** Segundos restantes de invulnerabilidad tras reaparecer. */
  invulnerableTimer: number;
  /** Bloqueo breve que impide moverse y atacar tras recibir un golpe. */
  stunTimer: number;
  /** Tiempo restante de la animación de daño. */
  hurtTimer: number;
  /** Tiempo restante de la animación de ataque. */
  actionTimer: number;
  /** Velocidad del clip de ataque; las melee lo escalan a `moveLock`. */
  actionPlayback: number;
  /** Tiempo restante en el que el input no puede mover al jugador. */
  moveLockTimer: number;
  /**
   * Animación del ataque en curso. `null` cuando la habilidad no define
   * ninguna, en cuyo caso se mantiene la animación de reposo o caminar.
   */
  actionAnimation: AnimationName | null;
  /**
   * Mantiene el último frame de `actionAnimation` durante el lanzamiento en
   * vez de reiniciar el clip. Se activa cuando la preparación ya reprodujo esa
   * misma animación: así no se ve dos veces seguidas.
   */
  actionHold: boolean;
  /**
   * Recuperación global tras lanzar una habilidad no melee. Mientras sea > 0
   * no se puede lanzar ninguna otra, sea del hueco que sea.
   */
  castLockTimer: number;
  /** Desplazamiento activo (dash) o `null` si no se está desplazando. */
  dash: PlayerDash | null;
  /** Habilidad en preparación (windup) o `null`. */
  pendingCast: PendingCast | null;
  /** Tiempo que el cuerpo sigue visible tras un KO. */
  deathFade: number;
  kills: number;
  deaths: number;
  /** Enfriamiento restante de cada habilidad, en segundos. */
  cooldowns: number[];
  buffs: ActiveBuff[];
  /** Ralentizaciones activas, cada una con su propio tiempo restante. */
  slowEffects: SlowEffect[];
  /**
   * Multiplicador de velocidad de la ralentización dominante (1 = normal). Se
   * recalcula a partir de `slowEffects`; no se asigna a mano.
   */
  slowMultiplier: number;
  /** Ids de las cuatro habilidades; `null` deja el hueco vacío. */
  abilityIds: (string | null)[];
}
