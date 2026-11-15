/**
 * Visibilidad compartida por equipo.
 *
 * Resuelve qué actores ve cada equipo en el paso de simulación actual y actualiza
 * `enemiesSeeing` (HUD y Regeneración). No toca niebla, cámaras ni copias: eso
 * se hace una vez por render.
 */

import { CONFIG } from '../config';
import type { Collider } from '../core/world';
import type { Team } from '../core/team';
import type { MatchPlayerState } from '../matchState';
import { ACTIVE_TEAMS } from '../terrain';
import { effectiveVisionRange, lineOfSightBlocked } from '../vision';

export function observerSeesActor(
  observer: MatchPlayerState,
  target: MatchPlayerState,
  alreadyVisible: boolean,
  colliders: readonly Collider[],
  atmosphereVision: number
): boolean {
  const distance = Math.hypot(target.x - observer.x, target.z - observer.z);
  const effective = effectiveVisionRange(
    observer.visionRange * observer.visionFactor * atmosphereVision,
    target.concealment.value
  );
  const limit = alreadyVisible ? effective + CONFIG.vision.hysteresis : effective;
  if (distance > limit) return false;
  return !lineOfSightBlocked(
    observer.x,
    observer.z,
    target.x,
    target.z,
    colliders
  );
}

/** ¿Ve algún Pokémon vivo del equipo el punto `(x, z)`? */
export function teamSeesPoint(
  players: readonly MatchPlayerState[],
  team: Team,
  x: number,
  z: number,
  concealment: number,
  colliders: readonly Collider[],
  atmosphereVision: number
): boolean {
  for (const observer of players) {
    if (!observer.alive || observer.team !== team) continue;
    const distance = Math.hypot(x - observer.x, z - observer.z);
    const effective = effectiveVisionRange(
      observer.visionRange * observer.visionFactor * atmosphereVision,
      concealment
    );
    if (distance > effective) continue;
    if (!lineOfSightBlocked(observer.x, observer.z, x, z, colliders)) return true;
  }
  return false;
}

/**
 * ¿Ve el equipo el punto de un objeto? Los objetos no se esconden por la
 * ocultación del terreno, solo por el radio de visión y la línea de visión.
 */
export function teamSeesPickupPoint(
  players: readonly MatchPlayerState[],
  team: Team,
  x: number,
  z: number,
  colliders: readonly Collider[],
  atmosphereVision: number
): boolean {
  for (const observer of players) {
    if (observer.team !== team) continue;
    if (!observer.alive) continue;
    const distance = Math.hypot(x - observer.x, z - observer.z);
    if (
      distance >
      effectiveVisionRange(
        observer.visionRange * observer.visionFactor * atmosphereVision,
        0
      )
    ) {
      continue;
    }
    if (!lineOfSightBlocked(observer.x, observer.z, x, z, colliders)) return true;
  }
  return false;
}

/**
 * Rellena `current` con los slots visibles de cada equipo y actualiza
 * `enemiesSeeing`. `previous` conserva la foto anterior para la histéresis.
 * Devuelve cuántos pares observador-objetivo se comprobaron, para las stats de
 * rendimiento (`app.stats.user`).
 */
export function refreshCombatVisibility(
  players: readonly MatchPlayerState[],
  previous: Record<Team, Set<number>>,
  current: Record<Team, Set<number>>,
  colliders: readonly Collider[],
  atmosphereVision: number
): number {
  let checks = 0;
  for (const player of players) player.enemiesSeeing = 0;
  for (const team of ACTIVE_TEAMS) current[team].clear();

  for (const observer of players) {
    // Un KO no revela actores al equipo, sea humano o bot.
    if (!observer.alive) continue;
    if (!observer.hidden) {
      current[observer.team].add(observer.slot);
    }
    for (const target of players) {
      if (target === observer) continue;
      // Una habilidad puede ocultar al lanzador (Excavar): ni rivales ni
      // aliados lo ven mientras dura la preparación.
      if (target.hidden) continue;
      // Un aliado vivo ya está en el conjunto por su propio slot; solo hay que
      // comprobar rivales y aliados que acaban de caer.
      if (target.alive && target.team === observer.team) continue;
      // Un KO deja ver la animación de daño un instante.
      if (!target.alive && target.deathFade <= 0) continue;
      checks += 1;
      const alreadyVisible = previous[observer.team].has(target.slot);
      const visible = observerSeesActor(
        observer,
        target,
        alreadyVisible,
        colliders,
        atmosphereVision
      );
      // El HUD "Descubierto" y la regeneración cuentan la línea de visión
      // directa de cada rival vivo, no la visión compartida del equipo.
      if (target.alive && observer.team !== target.team && visible) {
        target.enemiesSeeing += 1;
      }
      if (!visible) continue;
      current[observer.team].add(target.slot);
    }
  }
  return checks;
}
