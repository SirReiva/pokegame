/**
 * Peligros en vuelo que consume la IA.
 *
 * Se construye una vez por paso de simulación y la comparten todos los bots.
 * No incluye efectos sin daño ni ralentización: un bot no necesita esquivar un
 * adorno.
 *
 * El buffer es reutilizable: `buildBotHazards(..., buffer)` reescribe los
 * mismos objetos en vez de asignar uno por peligro y paso. Los bots solo leen
 * los peligros durante su propio `update`, así que reescribirlos al empezar el
 * paso siguiente es seguro.
 */

import type { ActiveAoe, Projectile } from '../matchState';
import { maxHitRadius } from '../roster';
import type { BotHazard } from './types';

export interface BotHazardBuffer {
  /** Peligros del paso actual; los consumidores lo tratan como solo lectura. */
  hazards: BotHazard[];
  /**
   * Todos los objetos creados, aunque `hazards` se haya recortado. Mantiene
   * viva la instancia para reutilizarla cuando vuelva a haber peligros.
   */
  readonly pool: BotHazard[];
}

export function createBotHazardBuffer(): BotHazardBuffer {
  return { hazards: [], pool: [] };
}

export function buildBotHazards(
  projectiles: readonly Projectile[],
  activeAoes: readonly ActiveAoe[],
  buffer: BotHazardBuffer = createBotHazardBuffer()
): BotHazard[] {
  const { hazards, pool } = buffer;
  let count = 0;
  for (const projectile of projectiles) {
    if (projectile.def.power <= 0 && projectile.def.slow === null) continue;
    const speed = Math.hypot(projectile.vx, projectile.vz);
    const remainingDistance = Math.max(0, projectile.def.range - projectile.traveled);
    const hazard = acquireHazard(pool, count);
    hazards[count] = hazard;
    count += 1;
    hazard.kind = 'projectile';
    hazard.x = projectile.x;
    hazard.z = projectile.z;
    hazard.radius = Math.max(0.05, projectile.def.radius);
    hazard.vx = projectile.vx;
    hazard.vz = projectile.vz;
    hazard.remaining = speed > 0.0001 ? remainingDistance / speed : 0;
    hazard.ownerTeam = projectile.owner.team;
  }
  for (const aoe of activeAoes) {
    if (aoe.def.power <= 0 && aoe.def.slow === null) continue;
    const hazard = acquireHazard(pool, count);
    hazards[count] = hazard;
    count += 1;
    hazard.kind = 'aoe';
    hazard.x = aoe.x;
    hazard.z = aoe.z;
    // El motor compara contra el hurtbox mayor del roster, igual que el aro
    // visual; el bot suma después su propio `hitRadius`.
    hazard.radius = aoe.radius + maxHitRadius();
    hazard.shape = aoe.shape;
    hazard.dirX = aoe.dirX;
    hazard.dirZ = aoe.dirZ;
    hazard.halfAngle = aoe.halfAngle;
    hazard.remaining = Math.max(0, aoe.duration - aoe.elapsed);
    hazard.ownerTeam = aoe.owner.team;
  }
  // Se recorta la vista pero no el pool: los peligros que sobran se reutilizan
  // en el siguiente paso. Los campos de otro `kind` quedan obsoletos a
  // propósito: todos los consumidores deciden por `kind` antes de leerlos.
  hazards.length = count;
  return hazards;
}

/**
 * Devuelve el hueco `index` del pool, creándolo solo la primera vez. Los
 * valores de relleno nunca se publican: se sobrescriben antes de recortar el
 * array de vista.
 */
function acquireHazard(pool: BotHazard[], index: number): BotHazard {
  const existing = pool[index];
  if (existing !== undefined) return existing;
  const hazard: BotHazard = {
    kind: 'projectile',
    x: 0,
    z: 0,
    radius: 0,
    ownerTeam: 'red'
  };
  pool[index] = hazard;
  return hazard;
}
