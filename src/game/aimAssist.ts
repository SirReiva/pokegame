/**
 * Ayuda de apuntado para proyectiles y haces de jugadores humanos.
 *
 * No es un autoaim: solo actúa si el rival ya cae dentro de un cono estrecho
 * alrededor de `facing` y hay línea de visión. La corrección es parcial y se
 * aplica en el momento del lanzamiento, así que el jugador sigue apuntando con
 * el cuerpo y conserva el control. Los bots no la usan: su error por dificultad
 * vive en `bot.ts`.
 */

import { CONFIG, DEG } from './config';

export interface AimAssistTarget {
  x: number;
  z: number;
  /** Hurtbox del objetivo, para valorar si el borde de su cuerpo ya entra. */
  hitRadius: number;
}

export interface AimAssistQuery {
  /** Posición del lanzador. */
  x: number;
  z: number;
  /** Dirección actual del cuerpo, en radianes (`atan2(dirX, dirZ)`). */
  facing: number;
  /** Alcance de la habilidad. */
  range: number;
  /** Radio del proyectil o del haz. */
  shotRadius: number;
  /**
   * Candidatos ya filtrados por el motor (rivales vivos, visibles y válidos).
   * La función no conoce equipos ni la niebla.
   */
  targets: readonly AimAssistTarget[];
  /** Comprueba si un obstáculo tapa el segmento hasta este objetivo. */
  blocked: (target: AimAssistTarget) => boolean;
}

export interface AimAssistResult {
  dirX: number;
  dirZ: number;
  /** Objetivo elegido; útil para depuración. */
  target: AimAssistTarget;
}

/** Diferencia angular normalizada a `[-π, π]`. */
function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/**
 * Devuelve la dirección corregida hacia el rival más cercano a la mira, o
 * `null` si ninguno entra en el cono de ayuda. Entre varios candidatos gana el
 * que menos ángulo necesita; a igualdad de ángulo, el más cercano.
 */
export function assistAimDirection(
  query: AimAssistQuery
): AimAssistResult | null {
  const maxAngle = CONFIG.combat.aimAssist.maxAngle * DEG;
  if (maxAngle <= 0 || query.range <= 0) return null;

  let bestTarget: AimAssistTarget | null = null;
  let bestDelta = 0;
  let bestAngle = Number.POSITIVE_INFINITY;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const target of query.targets) {
    const dx = target.x - query.x;
    const dz = target.z - query.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.0001) continue;

    // El cuerpo del rival puede sobresalir un poco del alcance nominal: el
    // golpe también cuenta si su hurtbox toca la punta del proyectil/haz.
    const reach = query.range + target.hitRadius + query.shotRadius;
    if (distance > reach) continue;

    const delta = angleDelta(query.facing, Math.atan2(dx, dz));
    const angle = Math.abs(delta);
    if (angle > maxAngle) continue;
    if (query.blocked(target)) continue;

    const closerAngle = angle < bestAngle - 0.00001;
    const tieBreak =
      Math.abs(angle - bestAngle) <= 0.00001 && distance < bestDistance;
    if (!bestTarget || closerAngle || tieBreak) {
      bestTarget = target;
      bestDelta = delta;
      bestAngle = angle;
      bestDistance = distance;
    }
  }

  if (!bestTarget) return null;

  // Corrección suave: no clava la mira en el centro del rival, sino que quita
  // la mayor parte del error. Así se perdona un roce sin convertir el disparo
  // en un imán.
  const corrected =
    query.facing + bestDelta * CONFIG.combat.aimAssist.strength;
  return {
    dirX: Math.sin(corrected),
    dirZ: Math.cos(corrected),
    target: bestTarget
  };
}
