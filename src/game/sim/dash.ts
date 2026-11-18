/**
 * Avance de un dash activo.
 *
 * Reparte el desplazamiento durante la animación, detecta golpes al paso y
 * mantiene el terreno, la inmersión y la cámara sincronizados. El host aporta
 * la colisión, los golpes pendientes y el feedback visual.
 */

import type { CombatFxPort } from '../core/ports/fx';
import { CONFIG } from '../config';
import type {
  MatchPlayerState,
  PendingInstantHit
} from '../matchState';
import type { DeviceInputSnapshot } from '../input';
import { terrainAt } from '../terrain';
import { terrainSpeedEffect } from '../terrainSpeed';
import { terrainConcealment } from '../vision';

export interface DashSystemHost {
  readonly matchPlayers: readonly MatchPlayerState[];
  readonly pendingInstantHits: PendingInstantHit[];
  readonly combatFx: CombatFxPort;
  isMatchOver(): boolean;
  /**
   * Avanza un tramo del dash con colisiones. El objeto devuelto puede ser
   * reutilizado por la siguiente llamada: copia `x/z` antes de volver a
   * resolver otra posición.
   */
  dashPosition(
    player: MatchPlayerState,
    x: number,
    z: number,
    dirX: number,
    dirZ: number,
    distance: number
  ): { x: number; z: number };
  canHit(attacker: MatchPlayerState, target: MatchPlayerState): boolean;
  dashSweepHits(
    target: MatchPlayerState,
    ax: number,
    az: number,
    bx: number,
    bz: number,
    dirX: number,
    dirZ: number,
    reach: number
  ): boolean;
  syncDashCast(player: MatchPlayerState, duration: number): void;
  updateCamera(
    player: MatchPlayerState,
    input: DeviceInputSnapshot,
    dt: number
  ): void;
}

export function stepDash(
  host: DashSystemHost,
  player: MatchPlayerState,
  input: DeviceInputSnapshot,
  dt: number
): boolean {
  // Igual que la preparación: un dash en curso no sigue tras el final.
  if (host.isMatchOver()) return true;
  const dash = player.dash;
  if (!dash) return false;

  const previousX = player.x;
  const previousZ = player.z;
  dash.elapsed += dt;

  // El último frame no recorre `speed * dt` completos: se limita al resto de la
  // distancia para que el dash acabe exactamente en `distance`.
  const remaining = Math.max(0, dash.distance - dash.traveled);
  const stepDistance = Math.min(dash.speed * dt, remaining);
  const next = host.dashPosition(
    player,
    player.x,
    player.z,
    dash.dirX,
    dash.dirZ,
    stepDistance
  );
  player.x = next.x;
  player.z = next.z;
  const moved = Math.hypot(player.x - previousX, player.z - previousZ);
  dash.traveled += moved;

  const dashBaseReach = Math.max(0.5, dash.def.radius);
  // Impulso no hace daño ni aplica control: es solo desplazamiento. Los demás
  // dash conservan su golpe al paso.
  const dashCanHit = dash.def.props.power > 0 || dash.def.props.slow !== null;
  for (const target of dashCanHit ? host.matchPlayers : []) {
    if (dash.hit.has(target) || !host.canHit(player, target)) continue;
    const dashReach = dashBaseReach + target.hitRadius;
    if (
      !host.dashSweepHits(
        target,
        previousX,
        previousZ,
        player.x,
        player.z,
        dash.dirX,
        dash.dirZ,
        dashReach
      )
    ) {
      continue;
    }
    dash.hit.add(target);
    // El impacto se aplica en la fase común: si este dash mata al rival antes
    // de que le toque actuar, el orden de los jugadores volvería a decidir el
    // intercambio. Se guarda el tramo del barrido para revalidarlo.
    host.pendingInstantHits.push({
      attacker: player,
      target,
      def: dash.def,
      healToken: dash.healToken,
      ax: previousX,
      az: previousZ,
      bx: player.x,
      bz: player.z,
      dirX: dash.dirX,
      dirZ: dash.dirZ,
      reach: dashReach
    });
  }

  dash.trailTimer -= dt;
  if (moved > 0.01 && dash.trailTimer <= 0) {
    host.combatFx.spawnDash(
      previousX,
      previousZ,
      player.x,
      player.z,
      dash.def.color
    );
    dash.trailTimer = 0.04;
  }

  player.vx = dash.dirX * dash.speed;
  player.vz = dash.dirZ * dash.speed;

  const terrain = terrainAt(player.x, player.z);
  player.terrain = terrain;
  const dashTerrainEffect = terrainSpeedEffect(terrain, player.types);
  player.terrainMultiplier = dashTerrainEffect.multiplier;
  player.terrainSpeedReason = dashTerrainEffect.reason;
  player.concealment = terrainConcealment(terrain, player.types);
  const targetSubmerge =
    terrain === 'waterHigh'
      ? CONFIG.player.submergeDeep
      : terrain === 'waterLow' || terrain === 'poison'
        ? CONFIG.player.submergeShallow
        : 0;
  player.submerge +=
    (targetSubmerge - player.submerge) *
    (1 - Math.exp(-CONFIG.player.submergeLerp * dt));
  if (player.submerge < 0.0005) player.submerge = 0;

  // Si un obstáculo dinámico detiene el avance, el dash termina en el acto en
  // vez de quedarse reproduciendo la animación en el sitio.
  const expected = stepDistance;
  if (dash.elapsed > dt && expected > 0.001 && moved < expected * 0.2) {
    player.dash = null;
    player.vx = 0;
    player.vz = 0;
    host.syncDashCast(player, dash.elapsed);
    host.updateCamera(player, input, dt);
    return true;
  }

  const arrived = dash.traveled >= dash.distance - 0.001;
  if (arrived || dash.elapsed >= dash.duration) {
    player.dash = null;
    player.vx = 0;
    player.vz = 0;
    host.syncDashCast(player, Math.min(dash.elapsed, dash.duration));
  }

  host.updateCamera(player, input, dt);
  return true;
}
