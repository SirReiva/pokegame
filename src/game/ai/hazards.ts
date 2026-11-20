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
import type { AnyAbilityDef } from '../abilities';
import {
  writeAoeCircles,
  type AoeCircle,
  type AoeSector
} from '../aoeGeometry';
import { DEG } from '../config';
import { maxHitRadius } from '../roster';
import type { BotHazard } from './types';

/**
 * Adelantos que se añaden al barrido de un área móvil. Los bots ven la unión
 * de la posición actual y estas muestras futuras, así que empiezan a apartarse
 * del camino antes de que el área llegue. En los conos la muestra incluye
 * también el giro, limitado por `aoeTurnRate`.
 */
const FUTURE_SAMPLES = [0.15, 0.3, 0.45] as const;

/**
 * Círculos actuales del área más las posiciones futuras de `aoeMovement`.
 *
 * El array se reutiliza entre pasos. Solo se usa con áreas circulares; los
 * conos tienen su propia unión de sectores en `sweepAoeSectors`.
 */
function sweepAoeCircles(aoe: ActiveAoe, out: AoeCircle[]): AoeCircle[] {
  const perSample = Math.max(1, aoe.def.aoeCircles.length);
  writeAoeCircles(aoe.def, aoe.x, aoe.z, aoe.dirX, aoe.dirZ, out);
  const movement = aoe.def.aoeMovement;
  if (!movement) return out;

  let count = perSample;
  const remaining = Math.max(0, aoe.duration - aoe.elapsed);
  for (const ahead of FUTURE_SAMPLES) {
    if (ahead > remaining) break;
    const next = movement({
      caster: aoe.owner,
      def: aoe.def,
      originX: aoe.originX,
      originZ: aoe.originZ,
      dirX: aoe.originDirX,
      dirZ: aoe.originDirZ,
      duration: aoe.duration,
      elapsed: aoe.elapsed + ahead
    });
    writeAoeCircles(
      aoe.def,
      next.x,
      next.z,
      next.dirX ?? aoe.dirX,
      next.dirZ ?? aoe.dirZ,
      out,
      count
    );
    count += perSample;
  }
  out.length = count;
  return out;
}

/** Diferencia angular normalizada al intervalo (-π, π]. */
function shortestAngle(angle: number): number {
  return (
    (((angle + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) -
    Math.PI
  );
}

/**
 * Sectores actuales de un cono más las posiciones y direcciones futuras de
 * `aoeMovement`. El giro de cada muestra respeta `aoeTurnRate`: el cono no salta
 * al ángulo objetivo, igual que en la simulación.
 *
 * El array se reutiliza entre pasos. Sin movimiento devuelve solo el sector
 * actual.
 */
function sweepAoeSectors(
  aoe: ActiveAoe,
  radius: number,
  out: AoeSector[]
): AoeSector[] {
  let count = 0;
  const addSector = (
    x: number,
    z: number,
    dirX: number,
    dirZ: number
  ): void => {
    const sector =
      out[count] ??
      (out[count] = {
        x: 0,
        z: 0,
        radius: 0,
        dirX: 0,
        dirZ: 1,
        halfAngle: 0
      });
    sector.x = x;
    sector.z = z;
    sector.radius = radius;
    sector.dirX = dirX;
    sector.dirZ = dirZ;
    sector.halfAngle = aoe.halfAngle;
    count += 1;
  };

  addSector(aoe.x, aoe.z, aoe.dirX, aoe.dirZ);
  const movement = aoe.def.aoeMovement;
  if (!movement) {
    out.length = count;
    return out;
  }

  const remaining = Math.max(0, aoe.duration - aoe.elapsed);
  const turnRate = Math.max(0, aoe.def.aoeTurnRate) * DEG;
  let angle = Math.atan2(aoe.dirX, aoe.dirZ);
  let previous = 0;
  for (const ahead of FUTURE_SAMPLES) {
    if (ahead > remaining) break;
    const next = movement({
      caster: aoe.owner,
      def: aoe.def,
      originX: aoe.originX,
      originZ: aoe.originZ,
      dirX: aoe.originDirX,
      dirZ: aoe.originDirZ,
      duration: aoe.duration,
      elapsed: aoe.elapsed + ahead
    });
    if (next.dirX !== undefined && next.dirZ !== undefined) {
      const length = Math.hypot(next.dirX, next.dirZ);
      if (length > 0.0001) {
        const target = Math.atan2(next.dirX / length, next.dirZ / length);
        const delta = shortestAngle(target - angle);
        const maxStep = turnRate * (ahead - previous);
        angle +=
          maxStep > 0
            ? Math.max(-maxStep, Math.min(maxStep, delta))
            : delta;
      }
    }
    addSector(next.x, next.z, Math.sin(angle), Math.cos(angle));
    previous = ahead;
  }
  out.length = count;
  return out;
}

/** `true` si el efecto puede dañar o ralentizar aunque no tenga `power`. */
function isHazardous(def: AnyAbilityDef): boolean {
  return (
    def.props.power > 0 ||
    def.props.slow !== null ||
    def.props.dot !== null ||
    def.bot?.customDamage === true
  );
}

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
    if (!isHazardous(projectile.def)) continue;
    // `Math.sqrt` en vez de `Math.hypot`: mismas magnitudes (velocidades de
    // juego) con menos coste en un bucle que recorre todos los proyectiles por
    // paso.
    const speed = Math.sqrt(
      projectile.vx * projectile.vx + projectile.vz * projectile.vz
    );
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
    hazard.mode = undefined;
    hazard.targetTimers = undefined;
  }
  for (const aoe of activeAoes) {
    if (!isHazardous(aoe.def)) continue;
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
    hazard.circles =
      aoe.shape === 'circle'
        ? sweepAoeCircles(aoe, hazard.circles ?? (hazard.circles = []))
        : undefined;
    hazard.sectors =
      aoe.shape === 'cone'
        ? sweepAoeSectors(
            aoe,
            hazard.radius,
            hazard.sectors ?? (hazard.sectors = [])
          )
        : undefined;
    hazard.remaining = Math.max(0, aoe.duration - aoe.elapsed);
    hazard.ownerTeam = aoe.owner.team;
    hazard.mode = aoe.def.aoeDamageMode;
    hazard.targetTimers = aoe.targetTimers;
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
