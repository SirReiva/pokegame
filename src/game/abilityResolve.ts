/**
 * Resoluciones por defecto de cada forma.
 *
 * Reproducen el comportamiento histórico: dañar a los rivales alcanzables con
 * línea de visión, aplicar su `slow` y su `status`, y dejar el control solo en
 * los golpes únicos. Una habilidad puede sustituirlas con `.resolve(...)`.
 *
 * Se tipan con `AnyAbilityDef` porque solo leen el bloque común `props`; así la
 * misma función sirve para cualquier props extendida.
 */

import type { AnyAbilityDef } from './core/abilities/def';
import type {
  AbilityResolveContext,
  AoePlayer
} from './core/abilities/resolve';
import { isOvertimeMode } from './core/abilities/styles';

type Context = AbilityResolveContext<AoePlayer, AnyAbilityDef>;

/**
 * Golpe único a todos los objetivos alcanzables. Lo usan melee, proyectil, haz
 * y dash: el motor ya filtró la geometría y aquí solo se aplica el golpe.
 */
function resolveAllTargets(context: Context): void {
  for (const target of context.targets) {
    if (context.isMatchOver()) break;
    if (!target.hittable || !target.lineOfSight) continue;
    context.applyHit(target);
  }
}

export const defaultMeleeResolve = resolveAllTargets;
export const defaultProjectileResolve = resolveAllTargets;
export const defaultBeamResolve = resolveAllTargets;
export const defaultDashResolve = resolveAllTargets;

/**
 * Resolución de área. En los modos con ticks no hay control por defecto, y un
 * área persistente sin daño, slow ni estado no hace nada salvo que una
 * resolución propia reparta buffs, curación o revividas.
 */
export function defaultAoeResolve(context: Context): void {
  const overtime = isOvertimeMode(context.mode);
  if (
    overtime &&
    context.power <= 0 &&
    !context.def.props.slow &&
    !context.def.props.status
  ) {
    return;
  }
  for (const target of context.targets) {
    if (overtime && context.isMatchOver()) break;
    if (!target.hittable || !target.lineOfSight) continue;
    context.applyHit(target, { control: !overtime });
  }
}

/** Las habilidades `self` no tienen objetivos por defecto. */
export function defaultSelfResolve(): void {
  // Los buffs, la curación y el escudo se aplican en el casteo; una resolución
  // propia puede añadir efectos extra sobre el lanzador o el entorno.
}
