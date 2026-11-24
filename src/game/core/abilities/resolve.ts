/**
 * Contratos de resolución de habilidades.
 *
 * El motor decide la geometría, reúne a los objetivos alcanzables y llama a
 * `def.resolve` una vez por evento. La resolución por defecto de cada forma
 * (melee, proyectil, haz, área, dash y self) reproduce el comportamiento
 * histórico; una habilidad puede sustituirla para aplicar daño, hitstun,
 * empuje, slow, buffs, curación o revivir con reglas propias.
 *
 * El contexto siempre lleva listas (`targets`, `fallenAllies`), aunque el
 * evento tenga un único objetivo. Así todas las formas comparten el mismo
 * contrato y los callbacks de área no necesitan una API distinta.
 */

import type { BuffSpec, SlowSpec, StatusSpec } from './specs';
import type { AoeDamageMode, AoeShape } from './styles';

/** Lo mínimo que un callback necesita saber de un jugador. */
export interface AoePlayer {
  x: number;
  z: number;
  /** Rumbo del cuerpo en radianes, si el motor lo conoce. */
  facing?: number;
  /** Apuntado del stick derecho en radianes; `null`/`undefined` si no hay. */
  aimYaw?: number | null;
}

/** Seguimiento de la curación por impacto de un mismo lanzamiento. */
export interface HealOnHitToken {
  healed: boolean;
}

/** Un Pokémon reunido por el motor para el evento de resolución actual. */
export interface AbilityTarget<TPlayer extends AoePlayer = AoePlayer> {
  player: TPlayer;
  /** Distancia desde el origen del golpe (centro del área o lanzador). */
  distance: number;
  /** Multiplicador radial de daño: 1 en el centro, `radialMinDamage` en el borde. */
  radialMultiplier: number;
  /** Potencia ya escalada por la distancia para este objetivo. */
  damagePower: number;
  isAlly: boolean;
  isEnemy: boolean;
  isSelf: boolean;
  /** `false` si un collider corta la línea entre el origen y el objetivo. */
  lineOfSight: boolean;
  /**
   * `true` si el golpe estándar puede alcanzarle: es rival, está vivo y no es
   * invulnerable. Los aliados y el propio lanzador quedan en `false`.
   */
  hittable: boolean;
  /** Punto de impacto si difiere del centro del objetivo. */
  impactX?: number;
  impactZ?: number;
  /** Origen del empuje si difiere del lanzador o del centro del área. */
  sourceX?: number;
  sourceZ?: number;
  /**
   * Segundos que este objetivo lleva expuesto al área. Solo lo rellenan los
   * modos `overtime-target`; en el resto coincide con `elapsed` del contexto.
   */
  elapsed?: number;
  /** Tick propio del objetivo en `overtime-target`; 0 en el primer golpe. */
  tick?: number;
}

/** Aliado caído cuyo marcador de KO queda dentro del área. */
export interface AbilityFallenAlly<TPlayer extends AoePlayer = AoePlayer> {
  player: TPlayer;
  distance: number;
  lineOfSight: boolean;
}

/** Ajustes de un golpe estándar aplicado desde una resolución. */
export interface AbilityHitOptions {
  /** Potencia del golpe. Por defecto, `target.damagePower`. */
  power?: number;
  /**
   * Comportamiento de control estándar. Por defecto `true` en golpes únicos y
   * `false` en ticks de área. Sirve de valor por defecto para `cancel`,
   * `hitstun` y `knockback`.
   */
  control?: boolean;
  /** Cancela dash y preparación. Por defecto, el valor de `control`. */
  cancel?: boolean;
  /** Segundos de hitstun. Por defecto, `def.props.hitstun` si `control`. */
  hitstun?: number;
  /**
   * Distancia de empuje. `null` lo desactiva. Por defecto,
   * `def.props.knockback` si `control`, o 0 si no.
   */
  knockback?: number | null;
  /** Ralentización. `null` la desactiva. Por defecto, `def.props.slow`. */
  slow?: SlowSpec | null;
  /** Estado. `null` lo desactiva. Por defecto, `def.props.status`. */
  status?: StatusSpec | null;
  healToken?: HealOnHitToken;
  impactX?: number;
  impactZ?: number;
  sourceX?: number;
  sourceZ?: number;
  /** Objetivos que ya pagaron el `+2` de la fórmula en este lanzamiento. */
  flatBonusApplied?: Set<number>;
}

/**
 * Servicios que una resolución puede usar sobre los objetivos. El motor
 * mantiene la inmunidad de tipo, el crítico, el daño real y las estadísticas.
 */
export interface AbilityResolveContext<
  TPlayer extends AoePlayer = AoePlayer,
  TDef = unknown
> {
  caster: TPlayer;
  def: TDef;
  /** Origen del evento: centro del área, lanzador o punto de impacto. */
  x: number;
  z: number;
  /** Radio del círculo o longitud del cono; 0 fuera de las áreas. */
  radius: number;
  /** `circle` o `cone`; útil para callbacks que adapten la geometría. */
  shape: AoeShape;
  mode: AoeDamageMode;
  /** Índice del golpe global del área. En `overtime-target`, el del objetivo. */
  tick: number;
  /** Segundos transcurridos desde que apareció el área. */
  elapsed: number;
  /** Potencia base del golpe antes del multiplicador radial. */
  power: number;
  targets: readonly AbilityTarget<TPlayer>[];
  /** Compañeros de equipo caídos con su marcador de KO dentro del radio. */
  fallenAllies: readonly AbilityFallenAlly<TPlayer>[];
  /**
   * Aplica el golpe estándar: inmunidad, sonido, slow, estado, daño,
   * hitstun/cancel/empuje y `healOnHit`. Devuelve `true` solo si quitó vida.
   */
  applyHit(target: AbilityTarget<TPlayer>, options?: AbilityHitOptions): boolean;
  /** Aplica hitstun y, opcionalmente, cancela dash/preparación. */
  applyHitstun(
    target: AbilityTarget<TPlayer>,
    seconds: number,
    cancel?: boolean
  ): void;
  /** Empuja al objetivo desde el origen del evento. */
  applyKnockback(target: AbilityTarget<TPlayer>, distance: number): void;
  /** Aplica una ralentización sin pasar por la inmunidad. */
  applySlow(target: AbilityTarget<TPlayer>, slow: SlowSpec): void;
  /** Añade un buff/debuff temporal al objetivo. */
  applyBuff(target: AbilityTarget<TPlayer>, buff: BuffSpec): void;
  /** Cura al objetivo una fracción de su vida máxima (`0.25` = 25 %). */
  applyHeal(target: AbilityTarget<TPlayer>, fraction: number): void;
  /**
   * Revive a un aliado caído con una fracción de su vida máxima (`0.5` = 50 %)
   * en el punto donde murió. Devuelve `true` si seguía caído.
   */
  revive(target: AbilityFallenAlly<TPlayer>, fraction: number): boolean;
  /** `true` cuando la partida ya terminó; útil para cortar bucles de ticks. */
  isMatchOver(): boolean;
}

/** Función que decide qué efectos aplica un evento de la habilidad. */
export type AbilityResolve<
  TPlayer extends AoePlayer = AoePlayer,
  TDef = unknown
> = (context: AbilityResolveContext<TPlayer, TDef>) => void;

/** Datos que el motor ya resolvió para un evento de golpe o tick. */
export interface AbilityHitInput<
  TPlayer extends AoePlayer = AoePlayer,
  TDef = unknown
> {
  owner: TPlayer;
  def: TDef;
  x: number;
  z: number;
  radius: number;
  shape: AoeShape;
  dirX: number;
  dirZ: number;
  /** Semiángulo del cono en radianes. */
  halfAngle: number;
  mode: AoeDamageMode;
  tick: number;
  elapsed: number;
  power: number;
  /** Objetivos ya reunidos por la geometría o por el sistema de golpes. */
  targets?: readonly AbilityTarget<TPlayer>[];
  fallenAllies?: readonly AbilityFallenAlly<TPlayer>[];
  healToken?: HealOnHitToken;
  flatBonusApplied?: Set<number>;
}
