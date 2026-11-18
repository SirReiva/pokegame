/**
 * Re-exporta los contratos de área y la resolución por defecto.
 *
 * Los tipos generales viven en `core/abilities/resolve.ts` y los de área en
 * `core/abilities/aoe.ts`; las resoluciones por defecto de todas las formas
 * viven en `abilityResolve.ts`.
 */

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
