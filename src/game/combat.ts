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
 * Contexto que reciben los decoradores de daño. Cada decorador transforma el
 * resultado del anterior, así que el orden de la cadena es parte de la regla.
 */
export interface DamageModifierContext {
  critical: boolean;
  randomFactor: number;
  stab: boolean;
  effectiveness: number;
}

/**
 * Decorador de daño: recibe el daño acumulado y devuelve el siguiente. Todos
 * redondean con `floor`, igual que la fórmula oficial, para que el orden no
 * cambie el resultado.
 */
export type DamageModifier = (
  damage: number,
  context: DamageModifierContext
) => number;

/**
 * Cadena de modificadores en el orden oficial:
 * crítico → aleatorio → STAB → efectividad.
 */
export const DAMAGE_MODIFIERS: readonly DamageModifier[] = [
  (damage, context) =>
    context.critical ? Math.floor(damage * CRIT_MULTIPLIER) : damage,
  (damage, context) => Math.floor(damage * context.randomFactor),
  (damage, context) => (context.stab ? Math.floor(damage * 1.5) : damage),
  (damage, context) => Math.floor(damage * context.effectiveness)
];

/** Aplica la cadena de decoradores sobre el daño base. */
export function decorateDamage(
  base: number,
  context: DamageModifierContext,
  modifiers: readonly DamageModifier[] = DAMAGE_MODIFIERS
): number {
  return modifiers.reduce(
    (damage, modifier) => modifier(damage, context),
    base
  );
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
  const damage = decorateDamage(base, {
    critical: input.critical,
    randomFactor: input.randomFactor,
    stab,
    effectiveness
  });

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

type CircleCollider = Extract<SegmentCollider, { type: 'circle' }>;
type LineCollider = Extract<SegmentCollider, { type: 'segment' }>;

/**
 * Estrategias de distancia por tipo de collider. Cada una devuelve la
 * distancia libre desde el punto hasta la superficie (0 si está dentro).
 */
const COLLIDER_POINT_DISTANCE: {
  circle: (px: number, pz: number, collider: CircleCollider) => number;
  segment: (px: number, pz: number, collider: LineCollider) => number;
} = {
  circle: (px, pz, collider) =>
    Math.max(0, Math.hypot(px - collider.x, pz - collider.z) - collider.radius),
  segment: (px, pz, collider) =>
    Math.max(
      0,
      pointSegmentDistance(px, pz, collider.ax, collider.az, collider.bx, collider.bz) -
        collider.radius
    )
};

/** Estrategias de bloqueo de un segmento por tipo de collider. */
const COLLIDER_SEGMENT_DISTANCE: {
  circle: (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    collider: CircleCollider
  ) => number;
  segment: (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    collider: LineCollider
  ) => number;
} = {
  circle: (ax, az, bx, bz, collider) =>
    Math.max(
      0,
      pointSegmentDistance(collider.x, collider.z, ax, az, bx, bz) - collider.radius
    ),
  segment: (ax, az, bx, bz, collider) =>
    Math.max(
      0,
      segmentDistance(ax, az, bx, bz, collider.ax, collider.az, collider.bx, collider.bz) -
        collider.radius
    )
};

function pointToCollider(
  px: number,
  pz: number,
  collider: SegmentCollider
): number {
  const strategy = COLLIDER_POINT_DISTANCE[collider.type] as (
    x: number,
    z: number,
    value: SegmentCollider
  ) => number;
  return strategy(px, pz, collider);
}

/**
 * Punto más cercano de un collider a `px/pz`. Permite resolver la separación
 * de círculos y cápsulas con el mismo código.
 */
export function closestPointOnCollider(
  collider: SegmentCollider,
  px: number,
  pz: number
): { x: number; z: number } {
  if (collider.type === 'circle') {
    return { x: collider.x, z: collider.z };
  }
  const dx = collider.bx - collider.ax;
  const dz = collider.bz - collider.az;
  const lengthSq = dx * dx + dz * dz;
  const t =
    lengthSq > 0
      ? Math.min(1, Math.max(0, ((px - collider.ax) * dx + (pz - collider.az) * dz) / lengthSq))
      : 0;
  return { x: collider.ax + dx * t, z: collider.az + dz * t };
}

function segmentToCollider(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  collider: SegmentCollider
): number {
  const strategy = COLLIDER_SEGMENT_DISTANCE[collider.type] as (
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    value: SegmentCollider
  ) => number;
  return strategy(ax, az, bx, bz, collider);
}

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
      if (pointToCollider(px, pz, collider) <= padding) return t;
    }
  }
  return maxDistance;
}

/**
 * ¿Está el punto dentro de algún collider (con `padding` de margen)? Se usa
 * para que los proyectiles se detengan en muros, rocas y separadores.
 */
export function pointBlockedByColliders(
  x: number,
  z: number,
  colliders: readonly SegmentCollider[],
  padding = 0
): boolean {
  return colliders.some(
    (collider) => pointToCollider(x, z, collider) <= padding
  );
}

/**
 * ¿Hay un separador (cordillera o muro) entre dos puntos? Los separadores son
 * los únicos colliders de tipo segmento, así que rocas, árboles y adornos no
 * cuentan. Se usa para que los golpes melee no atraviesen una cordillera.
 */
export function segmentBlockedBySeparator(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  colliders: readonly SegmentCollider[]
): boolean {
  return colliders.some(
    (collider) =>
      collider.type === 'segment' &&
      segmentToCollider(ax, az, bx, bz, collider) <= 0
  );
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
    if (segmentToCollider(ax, az, bx, bz, collider) <= padding) {
      return true;
    }
  }
  return false;
}
