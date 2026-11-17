/**
 * Resolución del eco de un haz de Celebi.
 *
 * El eco no reutiliza el ejecutor completo: repite solo la línea de daño, sin
 * control, marcas, buffs ni curación. Así el efecto es predecible y no puede
 * encadenar pasivas por accidente.
 */

import { segmentBlockedByColliders } from '../combat';
import type { AbilityDef } from '../core/abilities/def';
import type { EchoBeam } from '../core/combat/status';
import type { CombatFxPort } from '../core/ports/fx';
import type { MatchPlayerState } from '../matchState';
import { maxHitRadius } from '../roster';
import type { World } from '../world';

export interface EchoBeamHost {
  readonly combatFx: CombatFxPort;
  readonly world: World;
  players(): readonly MatchPlayerState[];
  playerBySlot(slot: number): MatchPlayerState | null;
  canHit(attacker: MatchPlayerState, target: MatchPlayerState): boolean;
  applyAbilityDamage(
    attacker: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef,
    options: {
      power: number;
      control: false;
      hitstun: 0;
      knockback: 0;
      slow: null;
    }
  ): void;
}

export function resolveEchoBeam(echo: EchoBeam, host: EchoBeamHost): void {
  const owner = host.playerBySlot(echo.sourceSlot);
  if (!owner || !owner.alive) return;

  const toX = echo.targetX - echo.x;
  const toZ = echo.targetZ - echo.z;
  const distance = Math.min(echo.range, Math.max(0.1, Math.hypot(toX, toZ)));
  const inv = 1 / Math.max(0.0001, Math.hypot(toX, toZ));
  const dirX = toX * inv;
  const dirZ = toZ * inv;
  const endX = echo.x + dirX * distance;
  const endZ = echo.z + dirZ * distance;

  host.combatFx.spawnBeam(
    echo.x,
    echo.z,
    endX,
    endZ,
    echo.def.color,
    Math.max(0.08, echo.radius),
    echo.def.beamStyle
  );

  for (const target of host.players()) {
    if (!host.canHit(owner, target)) continue;
    const relX = target.x - echo.x;
    const relZ = target.z - echo.z;
    const along = relX * dirX + relZ * dirZ;
    const lateral = Math.abs(relX * dirZ - relZ * dirX);
    if (along < 0 || along > distance + target.hitRadius) continue;
    if (lateral > echo.radius + maxHitRadius() + target.hitRadius) continue;
    if (
      segmentBlockedByColliders(
        echo.x,
        echo.z,
        target.x,
        target.z,
        host.world.colliders
      )
    ) {
      continue;
    }
    host.applyAbilityDamage(owner, target, echo.def, {
      power: echo.damage,
      control: false,
      hitstun: 0,
      knockback: 0,
      slow: null
    });
  }
}
