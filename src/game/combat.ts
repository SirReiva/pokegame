/**
 * Reglas puras de combate: fórmula de daño y geometría de impactos.
 * No depende de PlayCanvas, así que se puede probar o reutilizar sin levantar
 * el motor.
 *
 * El combate es determinista: no hay críticos, ni factor aleatorio, ni STAB.
 * Una habilidad hace siempre el mismo daño contra el mismo objetivo.
 */

import { CONFIG } from './config';
import type { CombatStats } from './pokedex';
import { combatEffectiveness } from './typeChart';

/** KO necesarios para ganar la partida por equipo. */
export const KO_TARGET = CONFIG.combat.koTarget;

export interface DamageInput {
  moveType: string;
  category: 'physical' | 'special';
  power: number;
  attacker: CombatStats;
  defender: CombatStats;
  defenderTypes: readonly string[];
  /** Multiplicadores temporales de ataque (buffs). */
  attackMultiplier?: number;
  /** Multiplicadores temporales de defensa (buffs). */
  defenseMultiplier?: number;
}

export interface DamageResult {
  damage: number;
  effectiveness: number;
}

/**
 * Fórmula del rediseño:
 *
 * ```
 * D = B × (1 + A/100) × 100/(100 + DEF) × E
 * ```
 *
 * - `B`: poder base de la habilidad.
 * - `A`: AF o AE del atacante, ya con sus multiplicadores.
 * - `DEF`: DF o DE del objetivo, ya con sus multiplicadores.
 * - `E`: efectividad suavizada (0,85-1,15).
 *
 * Con `A = 100` y `DEF = 100`, `D ≈ B`: los poderes de las fichas equivalen
 * casi a daño final contra un objetivo medio. Cualquier golpe válido hace al
 * menos 1 PV, aunque la efectividad sea la peor posible.
 */
export function computeDamage(input: DamageInput): DamageResult {
  const effectiveness = combatEffectiveness(
    input.moveType,
    input.defenderTypes
  );
  if (input.power <= 0) return { damage: 0, effectiveness };

  const attackStat =
    input.category === 'physical'
      ? input.attacker.attack
      : input.attacker.spAttack;
  const defenseStat =
    input.category === 'physical'
      ? input.defender.defense
      : input.defender.spDefense;
  const attack = Math.max(
    0,
    attackStat * (input.attackMultiplier ?? 1)
  );
  const defense = Math.max(
    0,
    defenseStat * (input.defenseMultiplier ?? 1)
  );

  const raw =
    input.power *
    (1 + attack / 100) *
    (100 / (100 + defense)) *
    effectiveness;

  return {
    damage: Math.max(1, Math.round(raw)),
    effectiveness
  };
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
 * Punto más cercano de un collider a `px/pz`, escrito en `out`. Es la variante
 * sin asignaciones de `closestPointOnCollider`: la resolución de posiciones la
 * llama una vez por collider y por iteración, así que devolver un objeto nuevo
 * generaba miles de objetos por paso. `out` se reescribe en cada llamada.
 */
export function closestPointOnColliderInto(
  collider: SegmentCollider,
  px: number,
  pz: number,
  out: { x: number; z: number }
): void {
  if (collider.type === 'circle') {
    out.x = collider.x;
    out.z = collider.z;
    return;
  }
  const dx = collider.bx - collider.ax;
  const dz = collider.bz - collider.az;
  const lengthSq = dx * dx + dz * dz;
  const t =
    lengthSq > 0
      ? Math.min(1, Math.max(0, ((px - collider.ax) * dx + (pz - collider.az) * dz) / lengthSq))
      : 0;
  out.x = collider.ax + dx * t;
  out.z = collider.az + dz * t;
}

/**
 * Punto más cercano de un collider a `px/pz`. Permite resolver la separación
 * de círculos y cápsulas con el mismo código. Reserva un objeto por llamada:
 * dentro de un bucle caliente, usa `closestPointOnColliderInto`.
 */
export function closestPointOnCollider(
  collider: SegmentCollider,
  px: number,
  pz: number
): { x: number; z: number } {
  const out = { x: 0, z: 0 };
  closestPointOnColliderInto(collider, px, pz, out);
  return out;
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
