/**
 * Estrategias de ejecución por forma de habilidad.
 *
 * Cada forma (`melee`, `projectile`, `beam`, `aoe`, `dash`, `self`) tiene un
 * ejecutor registrado en `ABILITY_EXECUTORS`. `Game` solo resuelve el contexto
 * y delega; añadir una forma nueva es registrar una estrategia, no añadir otro
 * `case` al orquestador.
 */

import type { AbilityDef, AbilityShape, SlowSpec } from './abilities';
import type { AoeHitInput } from './aoeEffect';
import { CONFIG, DEG } from './config';
import {
  angleDelta,
  raycastColliderDistance,
  segmentBlockedByColliders
} from './combat';
import type { CombatFx } from './combatFx';
import type {
  ActiveAoe,
  HealOnHitToken,
  MatchPlayerState,
  PendingMeleeHit,
  Projectile
} from './matchState';
import { TEAM_INFO } from './multiplayer';
import { maxHitRadius } from './roster';
import type { AnimationName } from './types';
import type { World } from './world';

export interface AbilityDamageOptions {
  power?: number;
  /** Control estándar: cancelar dash/preparación + hitstun + empuje. */
  control?: boolean;
  /** Cancela dash y preparación. Por defecto, el valor de `control`. */
  cancel?: boolean;
  /** Segundos de hitstun. Por defecto, el global si `control`, o 0 si no. */
  hitstun?: number;
  /**
   * Distancia de empuje. `null` lo desactiva. Por defecto, `def.knockback` si
   * `control`, o 0 si no.
   */
  knockback?: number | null;
  /** Ralentización. `null` la desactiva. Por defecto, `def.slow`. */
  slow?: SlowSpec | null;
  /** Token compartido del lanzamiento para curar como máximo una vez. */
  healToken?: HealOnHitToken;
  /** Punto donde dibujar el impacto si no coincide con el centro del objetivo. */
  impactX?: number;
  impactZ?: number;
  /**
   * Origen del empuje. Un proyectil empuja desde su punto de entrada y un área
   * desde su centro; sin él se usa la posición actual del atacante.
   */
  sourceX?: number;
  sourceZ?: number;
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
  spawnShield(player: MatchPlayerState, def: AbilityDef): void;
  canHit(attacker: MatchPlayerState, target: MatchPlayerState): boolean;
  /**
   * Aplica daño y devuelve `true` solo si el golpe quitó vida de verdad
   * (acertó, no era inmune y tenía potencia). Los efectos que dependen del
   * impacto, como `healOnHit`, usan ese valor en lugar de contar cualquier
   * intento como acierto.
   */
  applyAbilityDamage(
    attacker: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef,
    options?: AbilityDamageOptions
  ): boolean;
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
  /**
   * Resuelve el golpe de un área: reúne a todos los Pokémon dentro del radio y
   * delega en el `aoeEffect` de la habilidad (o en el efecto por defecto).
   */
  resolveAoeHit(hit: AoeHitInput): void;
  /**
   * Token de `healOnHit` del lanzamiento en curso. Las formas que crean
   * proyectiles, áreas o golpes diferidos lo guardan para que la curación se
   * aplique cuando el impacto ocurra de verdad.
   */
  readonly healToken?: HealOnHitToken;
}

export type AbilityExecutor = (
  player: MatchPlayerState,
  def: AbilityDef,
  deps: AbilityExecutorDeps,
  targetX?: number,
  targetZ?: number
) => void;

const executeMelee: AbilityExecutor = (player, def, deps) => {
  // El arco dibujado es un aviso conservador: usa el mayor hurtbox del roster
  // para que el borde visible nunca quede por dentro del alcance real de ningún
  // objetivo. El golpe suma el hurtbox concreto de cada rival, así que contra
  // cuerpos pequeños (Voltorb, Celebi) el arco queda algo por fuera a propósito.
  deps.combatFx.spawnMelee(
    player.x,
    player.z,
    player.facing,
    def.range + maxHitRadius(),
    def.halfAngle,
    def.color,
    def.impactStyle,
    TEAM_INFO[player.team].accent
  );
  for (const target of deps.matchPlayers) {
    if (!deps.canHit(player, target)) continue;
    // Cualquier obstáculo entre ambos corta el golpe: ni cordilleras ni muros,
    // pero tampoco árboles, rocas o el pedestal de la base. Sin esto se podía
    // pegar a través de ellos aunque el objetivo estuviera dentro del arco.
    if (
      segmentBlockedByColliders(
        player.x,
        player.z,
        target.x,
        target.z,
        deps.world.colliders,
        CONFIG.combat.meleeSightPadding
      )
    ) {
      continue;
    }
    const dx = target.x - player.x;
    const dz = target.z - player.z;
    const distance = Math.hypot(dx, dz);
    if (distance > def.range + target.hitRadius) continue;
    if (distance < 0.001) {
      deps.addPendingMeleeHit({
        attacker: player,
        target,
        def,
        healToken: deps.healToken
      });
      continue;
    }
    const delta = Math.abs(angleDelta(Math.atan2(dx, dz), player.facing));
    if (delta <= def.halfAngle * DEG) {
      deps.addPendingMeleeHit({
        attacker: player,
        target,
        def,
        healToken: deps.healToken
      });
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
    visual,
    healToken: deps.healToken
  });
};

const executeBeam: AbilityExecutor = (player, def, deps, targetX, targetZ) => {
  let dirX = Math.sin(player.facing);
  let dirZ = Math.cos(player.facing);
  let distance: number;
  if (targetX !== undefined && targetZ !== undefined) {
    // Extremo fijado al empezar el windup: el haz termina donde se dibujó el
    // carril, aunque el lanzador se haya movido durante la carga.
    const toX = targetX - player.x;
    const toZ = targetZ - player.z;
    distance = Math.max(0.1, Math.hypot(toX, toZ));
    if (distance > 0.001) {
      dirX = toX / distance;
      dirZ = toZ / distance;
    }
  } else {
    // El haz se corta en el primer separador, muro o roca: ni el visual ni el
    // daño atraviesan obstáculos.
    distance = Math.max(
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
  }
  const endX = player.x + dirX * distance;
  const endZ = player.z + dirZ * distance;
  // Los haces con windup ya dibujaron su carril al empezar la carga. Los
  // instantáneos lo crean aquí para que también se vea hasta el final del haz.
  if (def.windup <= 0) {
    deps.combatFx.spawnBeamLane(
      player.x,
      player.z,
      endX,
      endZ,
      def.radius + maxHitRadius(),
      TEAM_INFO[player.team].accent,
      0,
      def.beamStyle
    );
  }
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
    if (lateral > def.radius + target.hitRadius) continue;
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
    // La curación de Come Sueños la resuelve `applyAbilityDamage` solo si el
    // golpe quita vida de verdad, y como mucho una vez por lanzamiento.
    deps.applyAbilityDamage(player, target, def, {
      healToken: deps.healToken
    });
  }
};

const executeAoe: AbilityExecutor = (player, def, deps, targetX, targetZ) => {
  const dirX = Math.sin(player.facing);
  const dirZ = Math.cos(player.facing);
  // El centro no puede quedar detrás de un obstáculo: se detiene antes del
  // primer collider para que el telegraph y el daño coincidan con lo que ve el
  // jugador.
  const reach = Math.min(
    def.range,
    raycastColliderDistance(
      player.x,
      player.z,
      dirX,
      dirZ,
      def.range,
      deps.world.colliders,
      CONFIG.combat.aoeSightPadding
    )
  );
  const centerX = targetX ?? player.x + dirX * reach;
  const centerZ = targetZ ?? player.z + dirZ * reach;
  const duration = Math.max(0.1, def.aoeDuration);
  // Las áreas sin preparación no pasan por la marca de `castAbility`: el aro
  // del equipo se crea aquí junto al efecto para que el límite del área se vea
  // durante toda la habilidad, no solo durante el impacto.
  if (def.windup <= 0) {
    deps.combatFx.spawnAoeTelegraph(
      centerX,
      centerZ,
      def.radius + maxHitRadius(),
      TEAM_INFO[player.team].accent,
      0,
      duration
    );
  }
  // La marca del suelo que se dibuja durante el windup añade el mayor hurtbox
  // del roster en `game.ts`: esa es la zona en la que el centro de cualquier
  // objetivo puede recibir el golpe. La explosión es una deflagración de
  // volumen, así que su efecto usa ese mismo radio y llena el aro hasta el
  // borde; el resto de áreas conserva el disco de `def.radius`.
  const effectRadius =
    def.aoeStyle === 'explosion'
      ? def.radius + maxHitRadius()
      : def.radius;
  deps.combatFx.spawnAoe(
    centerX,
    centerZ,
    effectRadius,
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
      tickTimer: 0,
      tick: 0,
      healToken: deps.healToken
    });
    return;
  }
  // El área instantánea resuelve un único golpe. El callback de la habilidad
  // decide qué efectos se aplican a cada Pokémon dentro del radio.
  deps.resolveAoeHit({
    owner: player,
    def,
    x: centerX,
    z: centerZ,
    radius: def.radius,
    mode: 'instant',
    tick: 0,
    elapsed: 0,
    power: def.power,
    healToken: deps.healToken
  });
};

/**
 * Distancia máxima del dash antes de chocar con un enemigo. Se descuenta el
 * radio de ambos cuerpos para que el desplazamiento se detenga al contacto.
 */
function dashEnemyLimit(
  player: MatchPlayerState,
  dirX: number,
  dirZ: number,
  maxDistance: number,
  deps: AbilityExecutorDeps
): number {
  let limit = maxDistance;
  const clearance = CONFIG.player.radius * 2;
  for (const target of deps.matchPlayers) {
    if (target === player || !target.alive || target.team === player.team) continue;
    const dx = target.x - player.x;
    const dz = target.z - player.z;
    const projection = dx * dirX + dz * dirZ;
    if (projection <= 0 || projection > maxDistance + clearance) continue;
    const perpendicular = Math.abs(dx * dirZ - dz * dirX);
    if (perpendicular > clearance) continue;
    limit = Math.min(limit, Math.max(0, projection - clearance));
  }
  return limit;
}

const executeDash: AbilityExecutor = (player, def, deps) => {
  const dirX = Math.sin(player.facing);
  const dirZ = Math.cos(player.facing);
  const dashDistance = def.dashBlocksOnEnemies
    ? dashEnemyLimit(player, dirX, dirZ, def.dashDistance, deps)
    : def.dashDistance;
  if (dashDistance <= 0.01) return;
  // El desplazamiento real se reparte en `stepDash` durante la animación.
  const resolved = deps.dashPosition(
    player,
    player.x,
    player.z,
    dirX,
    dirZ,
    dashDistance
  );
  const distance = Math.hypot(resolved.x - player.x, resolved.z - player.z);
  // La animación dura lo que tarda en recorrer la distancia real. Si un
  // obstáculo acorta el dash, también se acorta QuickStrike.
  const duration =
    distance > 0.01 && dashDistance > 0.01
      ? Math.max(
          0.08,
          Math.min(def.castTime, (distance / dashDistance) * def.castTime)
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
    distance,
    traveled: 0,
    playback,
    trailTimer: 0,
    hit: new Set(),
    healToken: deps.healToken
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
  if (def.shield) {
    player.damageReductionTimer = def.shieldDuration;
    player.damageReduction = Math.min(0.65, Math.max(0, def.damageReduction));
    player.shieldSpeedMultiplier = Math.max(0.1, def.shieldSpeedMultiplier);
    deps.spawnShield(player, def);
    return;
  }
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
