/**
 * Contratos específicos de las áreas.
 *
 * Los tipos de resolución son comunes a todas las formas y viven en
 * `resolve.ts`. Aquí quedan la geometría móvil, los eventos de ciclo de vida y
 * alias de lectura para el código de áreas.
 */

import type { BuffSpec, SlowSpec } from './specs';
import type { CombatFxPort as CombatFx } from '../ports/fx';
import type {
  AbilityFallenAlly,
  AbilityHitInput,
  AbilityHitOptions,
  AbilityResolve,
  AbilityResolveContext,
  AbilityTarget
} from './resolve';

export type { AoePlayer, HealOnHitToken } from './resolve';

/** Alias de los contratos comunes usados por las áreas. */
export type AoeTarget<TPlayer extends { x: number; z: number } = { x: number; z: number }> =
  AbilityTarget<TPlayer>;
export type AoeFallenAlly<
  TPlayer extends { x: number; z: number } = { x: number; z: number }
> = AbilityFallenAlly<TPlayer>;
export type AoeHitOptions = AbilityHitOptions;
export type AoeEffect<
  TPlayer extends { x: number; z: number } = { x: number; z: number },
  TDef = unknown
> = AbilityResolve<TPlayer, TDef>;
export type AoeHitInput<
  TPlayer extends { x: number; z: number } = { x: number; z: number },
  TDef = unknown
> = AbilityHitInput<TPlayer, TDef>;
export type AoeEffectContext<
  TPlayer extends { x: number; z: number } = { x: number; z: number },
  TDef = unknown
> = AbilityResolveContext<TPlayer, TDef>;

/**
 * Datos que recibe cada frame la función de movimiento de un área. El centro se
 * expresa en coordenadas de mundo.
 */
export interface AoeMovementContext<
  TPlayer extends { x: number; z: number } = { x: number; z: number },
  TDef = unknown
> {
  caster: TPlayer;
  def: TDef;
  /** Centro del área al empezar la fase que mueve la función. */
  originX: number;
  originZ: number;
  /**
   * Dirección horizontal del lanzamiento (desde el lanzador hacia el centro),
   * normalizada. Si el área nació sobre el lanzador, es su dirección de
   * apuntado.
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
 * Función que recoloca el centro de un área `overtime` en cada frame. Debe
 * devolver el centro en coordenadas de mundo; el motor mueve con él el daño de
 * cada tick, el aro del equipo y el efecto visual.
 */
export type AoeMovement<
  TPlayer extends { x: number; z: number } = { x: number; z: number },
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
  TPlayer extends { x: number; z: number } = { x: number; z: number },
  TDef = unknown
> = AoeMovement<TPlayer, TDef>;

/**
 * Contexto de los eventos de ciclo de vida de un área. Reutiliza el contexto de
 * resolución, así que además de los objetivos dentro del área en ese instante
 * incluye los servicios para golpear, empujar, ralentizar, curar o revivir, más
 * `combatFx` para lanzar efectos propios.
 *
 * `tick` siempre vale 0 y `power` es la potencia bruta de la habilidad (sin el
 * escalado por tick que usa el daño periódico).
 */
export interface AoeEventContext<
  TPlayer extends { x: number; z: number } = { x: number; z: number },
  TDef = unknown
> extends AbilityResolveContext<TPlayer, TDef> {
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
  TPlayer extends { x: number; z: number } = { x: number; z: number },
  TDef = unknown
> = (context: AoeEventContext<TPlayer, TDef>) => void;

// Re-exportados para no romper imports existentes de callbacks de área.
export type {
  AbilityFallenAlly,
  AbilityHitOptions,
  AbilityResolve,
  AbilityResolveContext,
  AbilityTarget
} from './resolve';
export type { BuffSpec, SlowSpec };
