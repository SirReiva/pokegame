/**
 * Contratos de la IA.
 *
 * Tipos compartidos entre el controlador, el motor y los módulos de decisión.
 * No contienen lógica ni dependen de PlayCanvas.
 */

import type { AoeAbilityDef } from '../abilities';
import type { AoeCircle } from '../aoeGeometry';
import type { AtmosphereId } from '../atmosphere';
import type { Team } from '../core/team';
import type { MatchPlayerState } from '../matchState';
import type { Vec2 } from './math';

/** Vector horizontal usado por la navegación y el apuntado. */
export type { Vec2 } from './math';

/** Foco compartido por los bots de un mismo equipo. */
export interface BotFocus {
  slot: number | null;
  /** Reloj del bot en el que caduca el foco. */
  until: number;
}

/** Reclamación temporal de una poción por parte de un bot. */
export interface BotPickupClaim {
  slot: number;
  until: number;
  /** Puntuación con la que se reclamó; sirve para arbitrar reclamaciones. */
  priority: number;
}

/** Petición de ayuda de un aliado bajo de vida y perseguido. */
export interface BotHelpCall {
  slot: number;
  x: number;
  z: number;
  hpFraction: number;
  until: number;
}

/** Reclamación de un aliado caído que otro bot va a revivir. */
export interface BotReviveClaim {
  slot: number;
  until: number;
}

/** Zona de patrulla reservada por un bot para repartir el mapa. */
export interface BotPatrolClaim {
  x: number;
  z: number;
  until: number;
}

/** Daño que otro bot ya prevé aplicar a un objetivo, para no sobrematar. */
export interface BotDamageCommitment {
  attackerSlot: number;
  targetSlot: number;
  amount: number;
  until: number;
}

export type BotEngageCall = 'engage' | 'retreat' | 'group';

/** Pizarra compartida por los bots de un equipo. */
export interface TeamBlackboard {
  focus: BotFocus;
  /** Última posición vista de cada rival, compartida por el equipo. */
  lastSeen: Map<number, { x: number; z: number; at: number }>;
  aliveAllies: number;
  aliveEnemies: number;
  pickupClaims: Map<number, BotPickupClaim>;
  reviveClaims: Map<number, BotReviveClaim>;
  patrolClaims: Map<number, BotPatrolClaim>;
  engageCall: BotEngageCall;
  committedDamage: Map<string, BotDamageCommitment>;
  help: BotHelpCall | null;
}

export type BotSquad = Record<Team, TeamBlackboard>;

/** Peligro ya lanzado que el bot debe esquivar aunque no haya windup rival. */
export interface BotHazard {
  kind: 'projectile' | 'aoe';
  x: number;
  z: number;
  /** Radio propio del peligro; el bot suma después su propio `hitRadius`. */
  radius: number;
  /** Geometría del área: `circle` o `cone`. */
  shape?: AoeAbilityDef['aoeShape'];
  /** Dirección unitaria del cono. */
  dirX?: number;
  dirZ?: number;
  /** Semiángulo del cono en radianes. */
  halfAngle?: number;
  /**
   * Círculos de un área circular compuesta, ya resueltos en coordenadas de
   * mundo. El array y sus objetos se reutilizan entre pasos. Si falta, el
   * peligro es un único círculo de radio `radius`.
   */
  circles?: AoeCircle[];
  vx?: number;
  vz?: number;
  /** Segundos que el peligro seguirá activo. */
  remaining?: number;
  /** Modo de reparto del área (`once` o `overtime-*`). */
  mode?: AoeAbilityDef['aoeDamageMode'];
  /**
   * Temporizadores por objetivo de un área `overtime-target`, indexados por
   * slot. El bot consulta el suyo para saber cuánto falta para el próximo tick.
   */
  targetTimers?: ReadonlyMap<number, { tickTimer: number }>;
  ownerTeam: MatchPlayerState['team'];
}

/**
 * Vista táctica del equipo que el motor calcula una sola vez por frame.
 */
export interface BotWorldView {
  /** Slots de actores visibles para el equipo en este frame. */
  readonly visibleSlots: ReadonlySet<number>;
  /** Clima activo, para estimar daño, velocidad y visión. */
  readonly atmosphere: AtmosphereId;
  /** Zona que el modo obliga a disputar (Rey de la colina). */
  readonly objective?: { x: number; z: number; radius: number };
}

/**
 * `BotWorldView` con campos reasignables. El motor guarda una instancia por
 * equipo y actualiza sus campos en cada paso, en vez de asignar cuatro objetos
 * nuevos por paso.
 */
export type MutableBotWorldView = {
  -readonly [K in keyof BotWorldView]: BotWorldView[K];
};

/** Amenaza inmediata creada por el windup visible de un rival. */
export interface IncomingThreat {
  source: MatchPlayerState;
  /** Segundos que faltan para que la habilidad rival se ejecute. */
  remaining: number;
  /** Dirección recomendada para salir del área/línea de peligro. */
  evade: Vec2;
  /** Cuanto más alto, más urgente es responder. */
  severity: number;
}

/** Habilidad elegida para cortar el windup rival y dónde hay que apuntar. */
export interface InterruptPlan {
  slot: number;
  /** Posición proyectada del rival cuando el golpe llegue. */
  aim: Vec2;
}

/** Dirección para salir del peligro ya lanzado más urgente. */
export interface HazardEvasion {
  direction: Vec2;
  /** Cuanto más alto, más prioridad tiene frente a otros peligros. */
  severity: number;
}

/** Posición prevista del rival cuando la habilidad pueda impactar. */
export interface TargetPrediction {
  x: number;
  z: number;
  /** Tiempo total previsto: windup más vuelo del proyectil. */
  time: number;
  /** Distancia desde el bot hasta la posición prevista. */
  distance: number;
}

/** Amenazas listas del rival, usadas para ajustar la distancia de combate. */
export interface EnemyThreatProfile {
  /** Alcance del melee peligroso listo, o 0. */
  meleeReach: number;
  /** Hay un haz listo y su alcance. */
  beamReady: boolean;
  beamRange: number;
  /** Alguna habilidad ofensiva lista. */
  anyReady: boolean;
  /** Una habilidad grande o de control está lista. */
  keyReady: boolean;
}

/** Resultado de evaluar la pelea actual como un intercambio de daño. */
export interface FightAssessment {
  /** Segundos estimados para matar al objetivo. */
  timeToKill: number;
  /** Segundos estimados para que el objetivo mate al bot. */
  timeToDie: number;
  /** `timeToDie / timeToKill`: por encima de 1 la pelea favorece al bot. */
  exchange: number;
  /** Aliados vivos menos rivales vivos. */
  allyDiff: number;
  /** Umbral de vida dinámico para decidir la retirada. */
  retreatHp: number;
}

export type PendingCastState = NonNullable<MatchPlayerState['activeCast']>;

/**
 * Lo que el bot cree saber de un windup rival.
 */
export interface PunishRead {
  cast: PendingCastState;
  commit: boolean;
  remainingError: number;
  /** Momento a partir del cual reacciona y puede intentar la interrupción. */
  readyAt: number;
}
