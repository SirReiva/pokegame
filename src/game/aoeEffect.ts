/**
 * Efecto por defecto de las habilidades de área.
 *
 * Los contratos de los callbacks viven en `core/abilities/aoe.ts` para que el
 * núcleo no dependa de esta capa. Aquí queda solo el comportamiento histórico:
 * daña a los rivales alcanzables, aplica el `slow` de la habilidad y deja el
 * control únicamente en las áreas instantáneas.
 *
 * Se re-exportan los tipos para no romper los imports existentes de la capa
 * `game`.
 */

import type { AoeEffect } from './core/abilities/aoe';
import type { AbilityDef } from './abilities';
import type { MatchPlayerState } from './matchState';

export type {
  AoeEffect,
  AoeEffectContext,
  AoeEvent,
  AoeEventContext,
  AoeFallenAlly,
  AoeHitInput,
  AoeHitOptions,
  AoeMovement,
  AoeMovementContext,
  AoePlayer,
  AoePrepareMovement,
  AoeTarget
} from './core/abilities/aoe';

/**
 * Comportamiento histórico de las áreas: daña a los rivales alcanzables,
 * aplica el `slow` de la habilidad y deja el control solo en las instantáneas.
 */
export const defaultAoeEffect: AoeEffect<MatchPlayerState, AbilityDef> = (context) => {
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
