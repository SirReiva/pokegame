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
  raycastColliderDistance,
  sectorOverlapsCircle,
  segmentBlockedByColliders
} from './combat';
import type { CombatFx, TelegraphHandle } from './combatFx';
import type {
  ActiveAoe,
  HealOnHitToken,
  MatchPlayerState,
  PendingMeleeHit,
  Projectile
} from './matchState';
import { TEAM_INFO } from './multiplayer';
import { maxHitRadius } from './roster';
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
  addProjectile(projectile: Projectile): void;
  addActiveAoe(aoe: ActiveAoe): void;
  addPendingMeleeHit(hit: PendingMeleeHit): void;
  /**
   * Marca de área creada durante el `windup`, si la hubo. El ejecutor la
   * reutiliza en vez de crear otra y la mueve junto al centro del área.
   */
  readonly marker?: TelegraphHandle | null;
  /** Dirección fijada al empezar la preparación, si la hubo. */
  readonly castDirX?: number;
  readonly castDirZ?: number;
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
  // El arco dibuja el radio máximo de golpe (`range` + el mayor hurtbox) y el
  // golpe cuenta el cuerpo del rival desde el borde hacia dentro: si su hurtbox
  // roza el cono, recibe daño. Así no hay franjas donde el aviso cubra al rival
  // pero el centro quede fuera del alcance.
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
    if (
      !sectorOverlapsCircle(
        player.x,
        player.z,
        player.facing,
        def.halfAngle * DEG,
        def.range + maxHitRadius(),
        target.x,
        target.z,
        target.hitRadius
      )
    ) {
      continue;
    }
    deps.addPendingMeleeHit({
      attacker: player,
      target,
      def,
      healToken: deps.healToken
    });
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
  // Los haces con startup ya dibujaron su carril al empezar la carga. Los
  // instantáneos lo crean aquí para que también se vea hasta el final del haz.
  if (def.startup <= 0) {
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
    // lanzador y dentro del tramo. El carril dibuja el radio máximo y el cuerpo
    // del rival cuenta desde el borde hacia dentro: si su hurtbox roza el
    // carril o la punta, recibe el golpe.
    const toX = target.x - player.x;
    const toZ = target.z - player.z;
    const along = toX * dirX + toZ * dirZ;
    const lateral = Math.abs(toX * dirZ - toZ * dirX);
    if (along < 0 || along > distance + target.hitRadius) continue;
    if (lateral > def.radius + maxHitRadius() + target.hitRadius) continue;
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
  // En las áreas con preparación se conserva la dirección del lanzamiento; el
  // jugador pudo girar durante un `windup` móvil y el centro ya estaba fijado.
  const dirX = deps.castDirX ?? Math.sin(player.facing);
  const dirZ = deps.castDirZ ?? Math.cos(player.facing);
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
  const shape = def.aoeShape;
  const halfAngle = shape === 'cone' ? def.halfAngle * DEG : 0;
  // Las áreas sin preparación no pasan por la marca de `castAbility`: el aro
  // del equipo se crea aquí junto al efecto para que el límite del área se vea
  // durante toda la habilidad, no solo durante el impacto. Las áreas con
  // `windup` reciben la marca ya creada para poder moverla junto al centro.
  const marker =
    deps.marker ??
    (def.startup <= 0
      ? shape === 'cone'
        ? deps.combatFx.spawnAoeConeTelegraph(
            centerX,
            centerZ,
            dirX,
            dirZ,
            def.radius + maxHitRadius(),
            def.halfAngle,
            TEAM_INFO[player.team].accent,
            0,
            duration
          )
        : deps.combatFx.spawnAoeTelegraph(
            centerX,
            centerZ,
            def.radius + maxHitRadius(),
            TEAM_INFO[player.team].accent,
            0,
            duration
          )
      : null);
  // El aro y el efecto dibujan el radio máximo de golpe (área + el mayor
  // hurtbox) y la comprobación usa el mismo valor: todo el interior del aro es
  // golpeable y el borde coincide con el límite real.
  const areaFx =
    shape === 'cone'
      ? deps.combatFx.spawnAoeCone(
          centerX,
          centerZ,
          dirX,
          dirZ,
          def.radius + maxHitRadius(),
          def.halfAngle,
          def.color,
          def.aoeStyle,
          duration
        )
      : deps.combatFx.spawnAoe(
          centerX,
          centerZ,
          def.radius + maxHitRadius(),
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
      shape,
      halfAngle,
      elapsed: 0,
      duration,
      tickInterval,
      tickTimer: 0,
      tick: 0,
      healToken: deps.healToken,
      immuneMarked: new Set(),
      movement: def.aoeMovement,
      originX: centerX,
      originZ: centerZ,
      dirX,
      dirZ,
      moveVisual: (x, z) => {
        areaFx.setCenter(x, z);
        marker?.setCenter?.(x, z);
      }
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
    shape,
    dirX,
    dirZ,
    halfAngle,
    mode: 'instant',
    tick: 0,
    elapsed: 0,
    power: def.power,
    healToken: deps.healToken,
    immuneMarked: new Set()
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
  // La dirección se fija al empezar el casteo. Durante la preparación el
  // jugador puede seguir girando (y el frame del lanzamiento mueve antes de
  // resolver el efecto), pero el dash debe salir hacia donde apuntaba la
  // habilidad al iniciarse, como las áreas con `windup`.
  const dirX = deps.castDirX ?? Math.sin(player.facing);
  const dirZ = deps.castDirZ ?? Math.cos(player.facing);
  const dashDistance = def.dashBlocksOnEnemies
    ? dashEnemyLimit(player, dirX, dirZ, def.dashDistance, deps)
    : def.dashDistance;
  if (dashDistance <= 0.01) return;
  // El cuerpo mira hacia donde sale el dash: el giro del frame de lanzamiento
  // no debe desviar ni el desplazamiento ni la orientación visible.
  player.facing = Math.atan2(dirX, dirZ);
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
  // El desplazamiento real se reparte durante `active`. Si un obstáculo
  // acorta el dash, también se acorta la distancia recorrida; la animación la
  // lleva el plan de casteo.
  const active = Math.max(0.08, def.active);
  const duration =
    distance > 0.01 && dashDistance > 0.01
      ? Math.max(0.08, Math.min(active, (distance / dashDistance) * active))
      : 0.08;
  const speed = distance > 0.01 ? distance / duration : 0;
  player.dash = {
    def,
    elapsed: 0,
    duration,
    dirX,
    dirZ,
    speed,
    distance,
    traveled: 0,
    trailTimer: 0,
    hit: new Set(),
    healToken: deps.healToken
  };
  player.vx = 0;
  player.vz = 0;
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
