/**
 * Peligros en vuelo que consume la IA.
 *
 * Se construye una vez por paso de simulación y la comparten todos los bots.
 * No incluye efectos sin daño ni ralentización: un bot no necesita esquivar un
 * adorno.
 */

import type { ActiveAoe, Projectile } from '../matchState';
import { maxHitRadius } from '../roster';
import type { BotHazard } from './types';

export function buildBotHazards(
  projectiles: readonly Projectile[],
  activeAoes: readonly ActiveAoe[]
): BotHazard[] {
  const hazards: BotHazard[] = [];
  for (const projectile of projectiles) {
    if (projectile.def.power <= 0 && projectile.def.slow === null) continue;
    const speed = Math.hypot(projectile.vx, projectile.vz);
    const remainingDistance = Math.max(0, projectile.def.range - projectile.traveled);
    hazards.push({
      kind: 'projectile',
      x: projectile.x,
      z: projectile.z,
      radius: Math.max(0.05, projectile.def.radius),
      vx: projectile.vx,
      vz: projectile.vz,
      remaining: speed > 0.0001 ? remainingDistance / speed : 0,
      ownerTeam: projectile.owner.team
    });
  }
  for (const aoe of activeAoes) {
    if (aoe.def.power <= 0 && aoe.def.slow === null) continue;
    hazards.push({
      kind: 'aoe',
      x: aoe.x,
      z: aoe.z,
      // El motor compara contra el hurtbox mayor del roster, igual que el aro
      // visual; el bot suma después su propio `hitRadius`.
      radius: aoe.radius + maxHitRadius(),
      shape: aoe.shape,
      dirX: aoe.dirX,
      dirZ: aoe.dirZ,
      halfAngle: aoe.halfAngle,
      remaining: Math.max(0, aoe.duration - aoe.elapsed),
      ownerTeam: aoe.owner.team
    });
  }
  return hazards;
}
