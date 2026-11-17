/**
 * Contratos de los efectos de área.
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

import type { BuffSpec, SlowSpec } from './specs';
import type { AoeDamageMode, AoeShape } from './styles';
import type { CombatFxPort as CombatFx } from '../ports/fx';

/**
 * Lo mínimo que un callback de área necesita saber de un jugador.
 *
 * Es estructural a propósito: `MatchPlayerState` lo cumple sin que los
 * contratos de habilidad importen el estado completo de la partida.
 */
export interface AoePlayer {
  x: number;
  z: number;
}

/** Seguimiento de la curación por impacto de un mismo lanzamiento. */
export interface HealOnHitToken {
  healed: boolean;
}

/** Datos del área que ya resolvió el motor para un golpe o tick concreto. */
export interface AoeHitInput<
  TPlayer extends AoePlayer = AoePlayer,
  TDef = unknown
> {
  owner: TPlayer;
  def: TDef;
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
   * Slots que ya cobraron el término plano `+2` de la fórmula. Las áreas
   * persistentes lo comparten entre ticks para cobrarlo una sola vez por
   * objetivo en lugar de una por tick.
   */
  flatBonusApplied?: Set<number>;
}

/**
 * Datos que recibe cada frame la función de movimiento de un área. El centro se
 * expresa en coordenadas de mundo.
 */
export interface AoeMovementContext<
  TPlayer extends AoePlayer = AoePlayer,
  TDef = unknown
> {
  caster: TPlayer;
  def: TDef;
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
export type AoeMovement<
  TPlayer extends AoePlayer = AoePlayer,
  TDef = unknown
> = (context: AoeMovementContext<TPlayer, TDef>) => {
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
export type AoePrepareMovement<
  TPlayer extends AoePlayer = AoePlayer,
  TDef = unknown
> = AoeMovement<TPlayer, TDef>;

/** Un Pokémon dentro del área en el momento del golpe. */
export interface AoeTarget<TPlayer extends AoePlayer = AoePlayer> {
  player: TPlayer;
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
export interface AoeFallenAlly<TPlayer extends AoePlayer = AoePlayer> {
  player: TPlayer;
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
export interface AoeEffectContext<
  TPlayer extends AoePlayer = AoePlayer,
  TDef = unknown
> {
  caster: TPlayer;
  def: TDef;
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
  targets: readonly AoeTarget<TPlayer>[];
  /** Compañeros de equipo caídos con su marcador de KO dentro del radio. */
  fallenAllies: readonly AoeFallenAlly<TPlayer>[];
  /**
   * Aplica el golpe estándar: inmunidad, sonido, slow, daño,
   * hitstun/cancel/empuje y `healOnHit`. Devuelve `true` solo si quitó vida.
   */
  applyHit(target: AoeTarget<TPlayer>, options?: AoeHitOptions): boolean;
  /** Aplica hitstun y, opcionalmente, cancela dash/preparación. */
  applyHitstun(
    target: AoeTarget<TPlayer>,
    seconds: number,
    cancel?: boolean
  ): void;
  /** Empuja al objetivo desde el centro del área. */
  applyKnockback(target: AoeTarget<TPlayer>, distance: number): void;
  /** Aplica una ralentización sin pasar por la inmunidad. */
  applySlow(target: AoeTarget<TPlayer>, slow: SlowSpec): void;
  /** Añade un buff/debuff temporal al objetivo. */
  applyBuff(target: AoeTarget<TPlayer>, buff: BuffSpec): void;
  /** Cura al objetivo una fracción de su vida máxima (`0.25` = 25 %). */
  applyHeal(target: AoeTarget<TPlayer>, fraction: number): void;
  /**
   * Revive a un aliado caído con una fracción de su vida máxima (`0.5` = 50 %)
   * en el punto donde murió. Devuelve `true` si seguía caído.
   */
  revive(target: AoeFallenAlly<TPlayer>, fraction: number): boolean;
  /** `true` cuando la partida ya terminó; útil para cortar bucles de ticks. */
  isMatchOver(): boolean;
}

export type AoeEffect<
  TPlayer extends AoePlayer = AoePlayer,
  TDef = unknown
> = (context: AoeEffectContext<TPlayer, TDef>) => void;

/**
 * Contexto de los eventos de ciclo de vida de un área. Reutiliza el contexto de
 * `aoeEffect`, así que además de los objetivos dentro del área en ese instante
 * incluye los servicios para golpear, empujar, ralentizar, curar o revivir, más
 * `combatFx` para lanzar efectos propios.
 *
 * `tick` siempre vale 0 y `power` es la potencia bruta de la habilidad (sin el
 * escalado por tick que usa `aoeEffect`).
 */
export interface AoeEventContext<
  TPlayer extends AoePlayer = AoePlayer,
  TDef = unknown
> extends AoeEffectContext<TPlayer, TDef> {
  combatFx: CombatFx;
  /**
   * Oculta o vuelve a mostrar al lanzador (y su marca de equipo) mientras dure
   * el efecto. `Excavar` lo usa para esconderse bajo tierra en `onStart` y
   * reaparecer en `onCast`.
   */
  setCasterHidden(hidden: boolean): void;
  /**
   * Hace invulnerable o retira la invulnerabilidad del lanzador. `Excavar` la
   * activa mientras está oculto en `onStart` y la retira al emerger en
   * `onCast`. La invulnerabilidad se limpia sola si el casteo se interrumpe.
   */
  setCasterInvulnerable(invulnerable: boolean): void;
}

/** Callback de un evento del ciclo de vida de un área. */
export type AoeEvent<
  TPlayer extends AoePlayer = AoePlayer,
  TDef = unknown
> = (context: AoeEventContext<TPlayer, TDef>) => void;
