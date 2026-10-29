/**
 * Reglas puras de combate: fórmula de daño, precisión, críticos y geometría
 * de impactos. No depende de PlayCanvas, así que se puede probar o reutilizar
 * sin levantar el motor.
 */

import { CONFIG } from './config';
import type { CombatStats } from './pokedex';
import { isStab, typeEffectiveness } from './typeChart';

/** KO necesarios para ganar la partida por equipo. */
export const KO_TARGET = CONFIG.combat.koTarget;

/** Probabilidad de crítico de la generación VII en adelante. */
const CRIT_CHANCE = CONFIG.combat.critChance;
/** Multiplicador de daño de un crítico. */
const CRIT_MULTIPLIER = CONFIG.combat.critMultiplier;
/** Factor aleatorio oficial del daño: entre 0,85 y 1,00. */
const RANDOM_MIN = CONFIG.combat.randomMin;
const RANDOM_MAX = CONFIG.combat.randomMax;

export interface DamageInput {
  moveType: string;
  category: 'physical' | 'special';
  power: number;
  attacker: CombatStats;
  defender: CombatStats;
  attackerTypes: readonly string[];
  defenderTypes: readonly string[];
  /** Multiplicadores temporales de ataque (buffs). */
  attackMultiplier?: number;
  /** Multiplicadores temporales de defensa (buffs). */
  defenseMultiplier?: number;
  critical: boolean;
  randomFactor: number;
}

export interface DamageResult {
  damage: number;
  effectiveness: number;
  stab: boolean;
  critical: boolean;
}

/**
 * Fórmula oficial de daño a nivel 50:
 *
 * ```
 * base = floor(floor((2 × nivel / 5 + 2) × potencia × ataque / defensa) / 50) + 2
 * daño = base × crítico × aleatorio × STAB × efectividad
 * ```
 *
 * La efectividad se aplica con `floor` después de cada modificador, como en el
 * juego. Un movimiento inmune hace 0; cualquier otro golpe válido hace al
 * menos 1 de daño.
 */
export function computeDamage(input: DamageInput): DamageResult {
  const attackStat =
    input.category === 'physical' ? input.attacker.attack : input.attacker.spAttack;
  const defenseStat =
    input.category === 'physical' ? input.defender.defense : input.defender.spDefense;
  const attack = Math.max(1, Math.floor(attackStat * (input.attackMultiplier ?? 1)));
  const defense = Math.max(1, Math.floor(defenseStat * (input.defenseMultiplier ?? 1)));

  const levelFactor = Math.floor((2 * 50) / 5 + 2);
  const base =
    Math.floor(
      Math.floor((levelFactor * input.power * attack) / defense) / 50
    ) + 2;

  const effectiveness = typeEffectiveness(input.moveType, input.defenderTypes);
  if (effectiveness === 0) {
    return {
      damage: 0,
      effectiveness,
      stab: isStab(input.moveType, input.attackerTypes),
      critical: input.critical
    };
  }

  const stab = isStab(input.moveType, input.attackerTypes);
  let damage = base;
  if (input.critical) damage = Math.floor(damage * CRIT_MULTIPLIER);
  damage = Math.floor(damage * input.randomFactor);
  if (stab) damage = Math.floor(damage * 1.5);
  damage = Math.floor(damage * effectiveness);

  return {
    damage: Math.max(1, damage),
    effectiveness,
    stab,
    critical: input.critical
  };
}

export function rollCritical(): boolean {
  return Math.random() < CRIT_CHANCE;
}

/** Precisión 0 significa que el movimiento no puede fallar. */
export function rollAccuracy(accuracy: number): boolean {
  if (accuracy <= 0) return true;
  return Math.random() * 100 < accuracy;
}

export function rollRandomFactor(): number {
  return RANDOM_MIN + Math.random() * (RANDOM_MAX - RANDOM_MIN);
}

/** Diferencia angular normalizada al rango [-π, π]. */
export function angleDelta(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

/** Distancia de un punto a un segmento en el plano XZ. */
export function pointSegmentDistance(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  const t =
    lengthSq > 0
      ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / lengthSq))
      : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

type SegmentCollider =
  | { type: 'circle'; x: number; z: number; radius: number }
  | {
      type: 'segment';
      ax: number;
      az: number;
      bx: number;
      bz: number;
      radius: number;
    };

/** Distancia mínima entre dos segmentos en XZ. */
function segmentDistance(
  a0x: number,
  a0z: number,
  a1x: number,
  a1z: number,
  b0x: number,
  b0z: number,
  b1x: number,
  b1z: number
): number {
  // Si se cruzan, la distancia es cero.
  const d1x = a1x - a0x;
  const d1z = a1z - a0z;
  const d2x = b1x - b0x;
  const d2z = b1z - b0z;
  const denominator = d1x * d2z - d1z * d2x;
  if (Math.abs(denominator) > 0.000001) {
    const t = ((b0x - a0x) * d2z - (b0z - a0z) * d2x) / denominator;
    const u = ((b0x - a0x) * d1z - (b0z - a0z) * d1x) / denominator;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(
    pointSegmentDistance(a0x, a0z, b0x, b0z, b1x, b1z),
    pointSegmentDistance(a1x, a1z, b0x, b0z, b1x, b1z),
    pointSegmentDistance(b0x, b0z, a0x, a0z, a1x, a1z),
    pointSegmentDistance(b1x, b1z, a0x, a0z, a1x, a1z)
  );
}

/**
 * Distancia hasta el primer collider que corta un rayo, o `maxDistance` si no
 * hay nada. Los haces la usan para detenerse en separadores, muros y rocas en
 * vez de atravesarlos. `padding` ensancha los colliders con el radio del haz.
 */
export function raycastColliderDistance(
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
  maxDistance: number,
  colliders: readonly SegmentCollider[],
  padding = 0
): number {
  const length = Math.hypot(dirX, dirZ);
  if (length < 0.000001 || maxDistance <= 0) return 0;
  const dx = dirX / length;
  const dz = dirZ / length;
  // Avance fino: los separadores son cápsulas, así que comprobar punto a punto
  // evita tener que resolver la intersección rayo-cápsula.
  const step = 0.1;
  const steps = Math.max(1, Math.ceil(maxDistance / step));
  for (let index = 0; index <= steps; index++) {
    const t = Math.min(maxDistance, (index / steps) * maxDistance);
    const px = x + dx * t;
    const pz = z + dz * t;
    for (const collider of colliders) {
      if (collider.type === 'circle') {
        if (
          Math.hypot(px - collider.x, pz - collider.z) <=
          collider.radius + padding
        ) {
          return t;
        }
      } else if (
        pointSegmentDistance(
          px,
          pz,
          collider.ax,
          collider.az,
          collider.bx,
          collider.bz
        ) <=
        collider.radius + padding
      ) {
        return t;
      }
    }
  }
  return maxDistance;
}

/**
 * ¿Bloquea algún collider el segmento entre dos puntos? Se usa para haces y
 * para la línea de visión de las habilidades. `padding` ensancha los colliders
 * con el radio del efecto.
 */
export function segmentBlockedByColliders(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  colliders: readonly SegmentCollider[],
  padding = 0
): boolean {
  for (const collider of colliders) {
    if (collider.type === 'circle') {
      if (
        pointSegmentDistance(collider.x, collider.z, ax, az, bx, bz) <=
        collider.radius + padding
      ) {
        return true;
      }
    } else if (
      segmentDistance(ax, az, bx, bz, collider.ax, collider.az, collider.bx, collider.bz) <=
      collider.radius + padding
    ) {
      return true;
    }
  }
  return false;
}
