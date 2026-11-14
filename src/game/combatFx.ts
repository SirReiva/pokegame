/**
 * Fachada pública de los efectos de combate.
 *
 * La implementación vive en `render/fx` y se ha dividido por familias. Este
 * archivo se mantiene como punto de entrada estable para el resto del motor.
 */

export { CombatFx } from './render/fx/CombatFx';
export type {
  AoeFxHandle,
  EffectHandle,
  FxHandle,
  FxLayerResolver,
  TelegraphHandle,
  TelegraphOwner
} from './core/ports/fx';
