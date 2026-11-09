/**
 * Reglas puras de combate: fórmula de daño, críticos y geometría de impactos.
 * No depende de PlayCanvas, así que se puede probar o reutilizar
 * sin levantar el motor.
 */

import { CONFIG } from './config';
import { COMBAT_LEVEL, type CombatStats } from './pokedex';
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
 * Fórmula oficial de daño (nivel `COMBAT_LEVEL`, 50 en la demo):
 *
 * ```
 * base = floor(floor((2 × nivel / 5 + 2) × potencia × ataque / defensa) / 50) + 2
 * daño = base × crítico × aleatorio × STAB × efectividad
 * ```
 *
 * El divisor `/ 50` es una constante de la fórmula oficial y no depende del
 * nivel; el nivel solo entra en `2 × nivel / 5 + 2`, que se lee de
 * `COMBAT_LEVEL` en `pokedex.ts` para que stats y daño no se desincronicen.
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

  const levelFactor = Math.floor((2 * COMBAT_LEVEL) / 5 + 2);
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

export function rollRandomFactor(): number {
  return RANDOM_MIN + Math.random() * (RANDOM_MAX - RANDOM_MIN);
}

/** Punto del segmento A-B más cercano a P en el plano XZ. */
export function closestPointOnSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): { x: number; z: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  const t =
    lengthSq > 0
      ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / lengthSq))
      : 0;
  return { x: ax + dx * t, z: az + dz * t };
}

/** Diferencia angular normalizada al rango [-π, π]. */
export function angleDelta(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

/**
 * `true` si el hurtbox circular de un objetivo solapa el sector de un golpe
 * melee. El sector nace en `originX/originZ`, apunta a `facing` y tiene `radius`
 * de alcance y `halfAngle` de semiángulo (radianes). El objetivo cuenta como
 * tocado si su cuerpo (radio `targetRadius`) roza el borde, no solo si su centro
 * cae dentro: así el borde dibujado de la telegrafía coincide con el primer
 * punto de contacto.
 */
export function sectorOverlapsCircle(
  originX: number,
  originZ: number,
  facing: number,
  halfAngle: number,
  radius: number,
  targetX: number,
  targetZ: number,
  targetRadius: number
): boolean {
  const dx = targetX - originX;
  const dz = targetZ - originZ;
  const distance = Math.hypot(dx, dz);
  if (distance > radius + targetRadius) return false;
  // El cuerpo cubre el vértice del cono: cualquier ángulo vale.
  if (distance <= targetRadius) return true;
  const delta = Math.abs(angleDelta(Math.atan2(dx, dz), facing));
  const angularRadius = Math.asin(Math.min(1, targetRadius / distance));
  return delta <= halfAngle + angularRadius;
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
 * Primer `t` del rayo en el que entra en un círculo expandido, o `Infinity` si
 * no lo toca. `dx/dz` debe ser unitario. Resolver la ecuación de segundo grado
 * evita muestrear el rayo punto a punto.
 */
function rayCircleEntry(
  x: number,
  z: number,
  dx: number,
  dz: number,
  cx: number,
  cz: number,
  radius: number,
  maxDistance: number
): number {
  const ox = x - cx;
  const oz = z - cz;
  const offset = ox * ox + oz * oz - radius * radius;
  if (offset <= 0) return 0;
  const projection = ox * dx + oz * dz;
  if (projection > 0) return Infinity;
  const discriminant = projection * projection - offset;
  if (discriminant < 0) return Infinity;
  const t = -projection - Math.sqrt(discriminant);
  return t >= 0 && t <= maxDistance ? t : Infinity;
}

/**
 * Primer `t` del rayo en el que entra en una cápsula (segmento engordado), o
 * `Infinity` si no la toca. La cápsula es la unión del rectángulo central y los
 * dos círculos de los extremos, así que basta con quedarse con la entrada más
 * temprana de las tres.
 */
function rayCapsuleEntry(
  x: number,
  z: number,
  dx: number,
  dz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  radius: number,
  maxDistance: number
): number {
  let best = Math.min(
    rayCircleEntry(x, z, dx, dz, ax, az, radius, maxDistance),
    rayCircleEntry(x, z, dx, dz, bx, bz, radius, maxDistance)
  );
  const ex = bx - ax;
  const ez = bz - az;
  const length = Math.hypot(ex, ez);
  if (length > 0.000001) {
    const ux = ex / length;
    const uz = ez / length;
    const relX = x - ax;
    const relZ = z - az;
    // Coordenadas locales del rectángulo: `t` avanza a lo largo del segmento y
    // `s` perpendicular a él, con el rectángulo en [0, length] × [-radius, radius].
    const originT = relX * ux + relZ * uz;
    const originS = -relX * uz + relZ * ux;
    const dirT = dx * ux + dz * uz;
    const dirS = -dx * uz + dz * ux;
    let enter = 0;
    let exit = maxDistance;
    if (Math.abs(dirT) < 0.000001) {
      if (originT < 0 || originT > length) enter = Infinity;
    } else {
      let t1 = -originT / dirT;
      let t2 = (length - originT) / dirT;
      if (t1 > t2) [t1, t2] = [t2, t1];
      enter = Math.max(enter, t1);
      exit = Math.min(exit, t2);
    }
    if (enter <= exit) {
      if (Math.abs(dirS) < 0.000001) {
        if (originS < -radius || originS > radius) enter = Infinity;
      } else {
        let t1 = (-radius - originS) / dirS;
        let t2 = (radius - originS) / dirS;
        if (t1 > t2) [t1, t2] = [t2, t1];
        enter = Math.max(enter, t1);
        exit = Math.min(exit, t2);
      }
      if (enter <= exit && enter < best) best = Math.max(0, enter);
    }
  }
  return best;
}

/**
 * Distancia hasta el primer collider que corta un rayo, o `maxDistance` si no
 * hay nada. Los haces la usan para detenerse en separadores, muros y rocas en
 * vez de atravesarlos. `padding` ensancha los colliders con el radio del haz.
 *
 * La intersección es analítica (rayo-círculo y rayo-cápsula). Antes se avanzaba
 * en pasos de 0,1 u y se comprobaba cada collider en cada paso: con 8 bots
 * evaluando habilidades cada frame eso consumía ~15 % de un núcleo y provocaba
 * caídas de FPS en las peleas.
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
  let nearest = maxDistance;
  for (const collider of colliders) {
    const radius = collider.radius + padding;
    if (radius < 0) continue;
    const t =
      collider.type === 'circle'
        ? rayCircleEntry(x, z, dx, dz, collider.x, collider.z, radius, nearest)
        : rayCapsuleEntry(
            x,
            z,
            dx,
            dz,
            collider.ax,
            collider.az,
            collider.bx,
            collider.bz,
            radius,
            nearest
          );
    if (t < nearest) {
      nearest = t;
      if (nearest === 0) return 0;
    }
  }
  return nearest;
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
