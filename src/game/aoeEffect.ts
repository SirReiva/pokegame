/**
 * Efectos de las habilidades de área.
 *
 * El motor se encarga de la preparación, del centro, del radio, de la línea de
 * visión y de decidir cuándo toca un golpe (`instant` o cada tick de
 * `overTime`). Lo que ocurre con cada Pokémon dentro del área vive en un
 * callback por habilidad.
 *
 * El callback recibe **todos** los Pokémon vivos dentro del radio (aliados,
 * enemigos y el propio lanzador) en `targets`, y a los compañeros caídos con
 * marcador de KO en `fallenAllies`. A partir de ahí decide a quién aplica daño,
 * hitstun, empuje, ralentización, buffs, curación o revivir. Si la habilidad no
 * define `aoeEffect`, se usa `defaultAoeEffect`, que reproduce el comportamiento
 * histórico: solo rivales alcanzables, con su `slow` y con control únicamente
 * en las áreas instantáneas.
 */

import type {
  AbilityDef,
  AoeDamageMode,
  AoeShape,
  BuffSpec,
  SlowSpec
} from './abilities';
import type { HealOnHitToken, MatchPlayerState } from './matchState';

/** Datos del área que ya resolvió el motor para un golpe o tick concreto. */
export interface AoeHitInput {
  owner: MatchPlayerState;
  def: AbilityDef;
  x: number;
  z: number;
  /** Radio del círculo o longitud del cono. */
  radius: number;
  /** Geometría del golpe. */
  shape: AoeShape;
  /** Dirección unitaria del cono; solo se usa con `shape: 'cone'`. */
  dirX: number;
  dirZ: number;
  /** Semiángulo del cono en radianes. */
  halfAngle: number;
  mode: AoeDamageMode;
  /**
   * Índice del golpe: 0 en las áreas instantáneas y en el primer tick; 1, 2...
   * en los siguientes ticks de un área `overTime`.
   */
  tick: number;
  /** Segundos transcurridos desde que apareció el área. 0 en las instantáneas. */
  elapsed: number;
  /** Potencia base del golpe antes de aplicar el multiplicador radial. */
  power: number;
  /** Token compartido del lanzamiento para que `healOnHit` cure una sola vez. */
  healToken?: HealOnHitToken;
  /**
   * Slots que ya mostraron la marca de inmunidad en este lanzamiento. Las áreas
   * persistentes lo comparten entre ticks para no repetir el aviso.
   */
  immuneMarked?: Set<number>;
}

/**
 * Datos que recibe cada frame la función de movimiento de un área. El centro se
 * expresa en coordenadas de mundo.
 */
export interface AoeMovementContext {
  caster: MatchPlayerState;
  def: AbilityDef;
  /** Centro del área al empezar la fase que mueve la función. */
  originX: number;
  originZ: number;
  /**
   * Dirección horizontal del lanzamiento (desde el lanzador hacia el centro),
   * normalizada. Si el área nació sobre el lanzador, es su `facing`.
   */
  dirX: number;
  dirZ: number;
  /**
   * Duración de la fase: el `startup` del casteo en `aoePrepareMovement` o la
   * `aoeDuration` del área en `aoeMovement`.
   */
  duration: number;
  /** Segundos transcurridos desde que empezó esa fase. */
  elapsed: number;
}

/**
 * Función que recoloca el centro de un área `overTime` en cada frame. Debe
 * devolver el centro en coordenadas de mundo; el motor mueve con él el daño de
 * cada tick, el aro del equipo y el efecto visual.
 */
export type AoeMovement = (context: AoeMovementContext) => {
  x: number;
  z: number;
};

/**
 * Función que recoloca el centro y la marca del área durante la preparación del
 * casteo, antes de que aparezca el efecto. Comparte firma con `AoeMovement`,
 * pero `duration` es el `startup` y `elapsed` cuenta desde que empezó el
 * casteo. Sirve para que el aviso acompañe al lanzador mientras se mueve; al
 * dispararse el efecto, el área pasa a usar `aoeMovement`.
 */
export type AoePrepareMovement = AoeMovement;

/** Un Pokémon dentro del área en el momento del golpe. */
export interface AoeTarget {
  player: MatchPlayerState;
  /** Distancia centro del área → centro del Pokémon. */
  distance: number;
  /** Multiplicador radial de daño: 1 en el centro, `radialMinDamage` en el borde. */
  radialMultiplier: number;
  /** Potencia ya escalada por la distancia para este objetivo. */
  damagePower: number;
  isAlly: boolean;
  isEnemy: boolean;
  isSelf: boolean;
  /** `false` si un collider corta la línea entre el centro del área y el objetivo. */
  lineOfSight: boolean;
  /**
   * `true` si el golpe estándar puede alcanzarle: es rival, está vivo y no es
   * invulnerable. Los aliados y el propio lanzador quedan en `false`.
   */
  hittable: boolean;
}

/**
 * Aliado caído cuyo marcador de KO queda dentro del área. El motor solo reúne
 * aquí a los compañeros de equipo que todavía no han reaparecido.
 */
export interface AoeFallenAlly {
  player: MatchPlayerState;
  /** Distancia centro del área → punto donde cayó. */
  distance: number;
  /** `false` si un collider corta la línea entre el centro del área y el marcador. */
  lineOfSight: boolean;
}

export interface AoeHitOptions {
  /** Potencia del golpe. Por defecto, `target.damagePower`. */
  power?: number;
  /**
   * Comportamiento de control estándar. Por defecto `true` en áreas
   * instantáneas y `false` en ticks. Sirve de valor por defecto para `cancel`,
   * `hitstun` y `knockback`.
   */
  control?: boolean;
  /** Cancela dash y preparación. Por defecto, el valor de `control`. */
  cancel?: boolean;
  /** Segundos de hitstun. Por defecto, el global si `control`, o 0 si no. */
  hitstun?: number;
  /**
   * Distancia de empuje. `null` lo desactiva. Por defecto, `def.knockback` si
   * `control`, o 0 si no.
   */
  knockback?: number | null;
  /** Ralentización. `null` la desactiva. Por defecto, `def.slow`. */
  slow?: SlowSpec | null;
  healToken?: HealOnHitToken;
  impactX?: number;
  impactZ?: number;
  sourceX?: number;
  sourceZ?: number;
}

/**
 * Servicios que el callback puede usar sobre un objetivo. El motor mantiene la
 * inmunidad de tipo, el crítico, el daño real y las estadísticas.
 */
export interface AoeEffectContext {
  caster: MatchPlayerState;
  def: AbilityDef;
  x: number;
  z: number;
  radius: number;
  /** `circle` o `cone`; útil para callbacks que quieran adaptar el efecto. */
  shape: AoeShape;
  mode: AoeDamageMode;
  tick: number;
  elapsed: number;
  /** Potencia base del golpe antes del multiplicador radial. */
  power: number;
  targets: readonly AoeTarget[];
  /** Compañeros de equipo caídos con su marcador de KO dentro del radio. */
  fallenAllies: readonly AoeFallenAlly[];
  /**
   * Aplica el golpe estándar: inmunidad, sonido, slow, daño,
   * hitstun/cancel/empuje y `healOnHit`. Devuelve `true` solo si quitó vida.
   */
  applyHit(target: AoeTarget, options?: AoeHitOptions): boolean;
  /** Aplica hitstun y, opcionalmente, cancela dash/preparación. */
  applyHitstun(target: AoeTarget, seconds: number, cancel?: boolean): void;
  /** Empuja al objetivo desde el centro del área. */
  applyKnockback(target: AoeTarget, distance: number): void;
  /** Aplica una ralentización sin pasar por la inmunidad. */
  applySlow(target: AoeTarget, slow: SlowSpec): void;
  /** Añade un buff/debuff temporal al objetivo. */
  applyBuff(target: AoeTarget, buff: BuffSpec): void;
  /** Cura al objetivo una fracción de su vida máxima (`0.25` = 25 %). */
  applyHeal(target: AoeTarget, fraction: number): void;
  /**
   * Revive a un aliado caído con una fracción de su vida máxima (`0.5` = 50 %)
   * en el punto donde murió. Devuelve `true` si seguía caído.
   */
  revive(target: AoeFallenAlly, fraction: number): boolean;
  /** `true` cuando la partida ya terminó; útil para cortar bucles de ticks. */
  isMatchOver(): boolean;
}

export type AoeEffect = (context: AoeEffectContext) => void;

/**
 * Comportamiento histórico de las áreas: daña a los rivales alcanzables,
 * aplica el `slow` de la habilidad y deja el control solo en las instantáneas.
 */
export const defaultAoeEffect: AoeEffect = (context) => {
  // Un área persistente sin daño ni slow no tiene nada que hacer en ese tick.
  // Se mantiene la comprobación aquí (y no en el motor) para que un callback
  // propio pueda seguir aplicando buffs aunque la potencia sea 0.
  if (context.mode === 'overTime' && context.power <= 0 && !context.def.slow) {
    return;
  }
  for (const target of context.targets) {
    if (context.mode === 'overTime' && context.isMatchOver()) break;
    if (!target.hittable || !target.lineOfSight) continue;
    context.applyHit(target, { control: context.mode === 'instant' });
  }
};
