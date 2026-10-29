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
}

export interface PendingMeleeHit {
  attacker: MatchPlayerState;
  target: MatchPlayerState;
  def: AbilityDef;
}

export interface PlayerDash {
  def: AbilityDef;
  elapsed: number;
  duration: number;
  dirX: number;
  dirZ: number;
  speed: number;
  /** Velocidad de la animación para que dure lo mismo que el desplazamiento. */
  playback: number;
  trailTimer: number;
  hit: Set<MatchPlayerState>;
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
  actionAnimation: AnimationName;
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
  /** Segundos restantes de ralentización. */
  slowTimer: number;
  /** Multiplicador de velocidad mientras dure la ralentización (1 = normal). */
  slowMultiplier: number;
  /** Ids de las cuatro habilidades; `null` deja el hueco vacío. */
  abilityIds: (string | null)[];
}
