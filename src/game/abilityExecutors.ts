/**
 * Estrategias de ejecución por forma de habilidad.
 *
 * Cada forma (`melee`, `projectile`, `beam`, `aoe`, `dash`, `self`) tiene un
 * ejecutor registrado en `ABILITY_EXECUTORS`. `Game` solo resuelve el contexto
 * y delega; añadir una forma nueva es registrar una estrategia, no añadir otro
 * `case` al orquestador.
 */

import type { AbilityDef, AbilityShape } from './abilities';
import { CONFIG, DEG } from './config';
import {
  angleDelta,
  raycastColliderDistance,
  segmentBlockedByColliders
} from './combat';
import type { CombatFx } from './combatFx';
import type {
  ActiveAoe,
  MatchPlayerState,
  PendingMeleeHit,
  Projectile
} from './matchState';
import type { AnimationName } from './types';
import type { World } from './world';

export interface AbilityDamageOptions {
  power?: number;
  control?: boolean;
}

/**
 * Servicios del motor que necesitan los ejecutores. Se pasan explícitamente
 * para que las estrategias no dependan de la clase `Game` ni de sus campos
 * privados.
 */
export interface AbilityExecutorDeps {
  readonly combatFx: CombatFx;
  readonly world: World;
  readonly matchPlayers: MatchPlayerState[];
  canHit(attacker: MatchPlayerState, target: MatchPlayerState): boolean;
  applyAbilityDamage(
    attacker: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef,
    options?: AbilityDamageOptions
  ): void;
  radialDamageMultiplier(
    def: AbilityDef,
    distance: number,
    radius: number
  ): number;
  dashPosition(
    player: MatchPlayerState,
    x: number,
    z: number,
    dirX: number,
    dirZ: number,
    distance: number
  ): { x: number; z: number };
  animationPlaybackFor(
    player: MatchPlayerState,
    animation: AnimationName,
    duration: number
  ): number;
  addProjectile(projectile: Projectile): void;
  addActiveAoe(aoe: ActiveAoe): void;
  addPendingMeleeHit(hit: PendingMeleeHit): void;
}

export type AbilityExecutor = (
  player: MatchPlayerState,
  def: AbilityDef,
  deps: AbilityExecutorDeps,
  targetX?: number,
  targetZ?: number
) => void;

const executeMelee: AbilityExecutor = (player, def, deps) => {
  deps.combatFx.spawnMelee(
    player.x,
    player.z,
    player.facing,
    def.range,
    def.halfAngle,
    def.color,
    def.impactStyle
  );
  for (const target of deps.matchPlayers) {
    if (!deps.canHit(player, target)) continue;
    const dx = target.x - player.x;
    const dz = target.z - player.z;
    const distance = Math.hypot(dx, dz);
    if (distance > def.range + CONFIG.player.radius) continue;
    if (distance < 0.001) {
      deps.addPendingMeleeHit({ attacker: player, target, def });
      continue;
    }
    const delta = Math.abs(angleDelta(Math.atan2(dx, dz), player.facing));
    if (delta <= def.halfAngle * DEG) {
      deps.addPendingMeleeHit({ attacker: player, target, def });
    }
  }
};

const executeProjectile: AbilityExecutor = (player, def, deps) => {
  const dirX = Math.sin(player.facing);
  const dirZ = Math.cos(player.facing);
  const originX = player.x + dirX * 0.4;
  const originZ = player.z + dirZ * 0.4;
  const speed = def.projectileSpeed > 0 ? def.projectileSpeed : 12;
  const visual = deps.combatFx.spawnProjectile(
    originX,
    originZ,
    def.color,
    def.radius,
    def.projectileStyle,
    dirX,
    dirZ
  );
  deps.addProjectile({
    owner: player,
    def,
    x: originX,
    z: originZ,
    vx: dirX * speed,
    vz: dirZ * speed,
    traveled: 0,
    pierce: def.pierce,
    hit: new Set(),
    visual
  });
};

const executeBeam: AbilityExecutor = (player, def, deps) => {
  const dirX = Math.sin(player.facing);
  const dirZ = Math.cos(player.facing);
  // El haz se corta en el primer separador, muro o roca: ni el visual ni el
  // daño atraviesan obstáculos.
  const distance = Math.max(
    0.1,
    raycastColliderDistance(
      player.x,
      player.z,
      dirX,
      dirZ,
      def.range,
      deps.world.colliders
    )
  );
  const endX = player.x + dirX * distance;
  const endZ = player.z + dirZ * distance;
  deps.combatFx.spawnBeam(
    player.x,
    player.z,
    endX,
    endZ,
    def.color,
    Math.max(0.08, def.radius),
    def.beamStyle
  );
  for (const target of deps.matchPlayers) {
    if (!deps.canHit(player, target)) continue;
    // Comprobación en el marco del haz: el objetivo debe estar delante del
    // lanzador y dentro del tramo. Así nadie recibe el golpe por detrás ni más
    // allá de la punta por el margen de radio.
    const toX = target.x - player.x;
    const toZ = target.z - player.z;
    const along = toX * dirX + toZ * dirZ;
    const lateral = Math.abs(toX * dirZ - toZ * dirX);
    if (along < 0 || along > distance) continue;
    if (lateral > def.radius + CONFIG.player.radius) continue;
    if (
      segmentBlockedByColliders(
        player.x,
        player.z,
        target.x,
        target.z,
        deps.world.colliders
      )
    ) {
      continue;
    }
    deps.applyAbilityDamage(player, target, def);
  }
};

const executeAoe: AbilityExecutor = (player, def, deps, targetX, targetZ) => {
  const dirX = Math.sin(player.facing);
  const dirZ = Math.cos(player.facing);
  const centerX = targetX ?? player.x + dirX * def.range;
  const centerZ = targetZ ?? player.z + dirZ * def.range;
  const duration = Math.max(0.1, def.aoeDuration);
  deps.combatFx.spawnAoe(
    centerX,
    centerZ,
    def.radius,
    def.color,
    def.aoeStyle,
    duration
  );
  if (def.aoeDamageMode === 'overTime') {
    const tickInterval = Math.max(0.05, Math.min(def.aoeTickInterval, duration));
    deps.addActiveAoe({
      owner: player,
      def,
      x: centerX,
      z: centerZ,
      radius: def.radius,
      elapsed: 0,
      duration,
      tickInterval,
      tickTimer: 0
    });
    return;
  }
  for (const target of deps.matchPlayers) {
    if (!deps.canHit(player, target)) continue;
    const distance = Math.hypot(target.x - centerX, target.z - centerZ);
    if (distance <= def.radius + CONFIG.player.radius) {
      const radial = deps.radialDamageMultiplier(def, distance, def.radius);
      deps.applyAbilityDamage(player, target, def, {
        power: def.power * radial
      });
    }
  }
};

const executeDash: AbilityExecutor = (player, def, deps) => {
  const dirX = Math.sin(player.facing);
  const dirZ = Math.cos(player.facing);
  // El desplazamiento real se reparte en `stepDash` durante la animación.
  const resolved = deps.dashPosition(
    player,
    player.x,
    player.z,
    dirX,
    dirZ,
    def.dashDistance
  );
  const distance = Math.hypot(resolved.x - player.x, resolved.z - player.z);
  // La animación dura lo que tarda en recorrer la distancia real. Si un
  // obstáculo acorta el dash, también se acorta QuickStrike.
  const duration =
    distance > 0.01 && def.dashDistance > 0.01
      ? Math.max(
          0.08,
          Math.min(def.castTime, (distance / def.dashDistance) * def.castTime)
        )
      : 0.08;
  const speed = distance > 0.01 ? distance / duration : 0;
  const playback =
    def.animation === null
      ? 1
      : deps.animationPlaybackFor(player, def.animation, duration);
  player.actionTimer = duration;
  player.playback = playback;
  player.dash = {
    def,
    elapsed: 0,
    duration,
    dirX,
    dirZ,
    speed,
    playback,
    trailTimer: 0,
    hit: new Set()
  };
  player.vx = 0;
  player.vz = 0;
  // Fuerza el cambio de capa en el mismo frame del casteo; el bucle de copias
  // lo mantiene después sin reiniciar el frame de la animación. Sin animación
  // propia el dash se resuelve solo con el desplazamiento.
  if (def.animation !== null) {
    player.animation = def.animation;
    for (const copy of player.copies) copy.play(def.animation, true);
  }
};

const executeSelf: AbilityExecutor = (player, def, deps) => {
  // Recuperación ya tiene su propio estallido de curación.
  if (def.healSelf <= 0) {
    deps.combatFx.spawnBuff(
      player.x,
      player.z,
      def.color,
      Math.max(0.8, def.radius)
    );
  }
};

/** Registro de estrategias por forma de habilidad. */
export const ABILITY_EXECUTORS: Record<AbilityShape, AbilityExecutor> = {
  melee: executeMelee,
  projectile: executeProjectile,
  beam: executeBeam,
  aoe: executeAoe,
  dash: executeDash,
  self: executeSelf
};
