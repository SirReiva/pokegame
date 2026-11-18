/**
 * Estrategias de ejecución por forma de habilidad.
 *
 * Cada forma (`melee`, `projectile`, `beam`, `aoe`, `dash`, `self`) tiene un
 * ejecutor registrado en `ABILITY_EXECUTORS`. `Game` solo resuelve el contexto
 * y delega; añadir una forma nueva es registrar una estrategia, no añadir otro
 * `case` al orquestador.
 */

import type {
  AbilityDef,
  AbilityHitInput,
  AbilityShape,
  AbilityTarget,
  AoeAbilityDef,
  AnyAbilityDef,
  SelfAbilityDef
} from './abilities';
import type { AoeHitInput } from './aoeEffect';
import { spawnGroupedAoe, spawnGroupedAoeTelegraph } from './aoeGroupFx';
import { CONFIG, DEG } from './config';
import {
  raycastColliderDistance,
  sectorOverlapsCircle,
  segmentBlockedByColliders
} from './combat';
import { isOvertimeMode } from './core/abilities/styles';
import type { CombatFxPort as CombatFx, TelegraphHandle } from './core/ports/fx';
import type {
  ActiveAoe,
  ActiveCast,
  HealOnHitToken,
  MatchPlayerState,
  PendingMeleeHit,
  Projectile
} from './matchState';
import { attackYaw } from './matchState';
import { TEAM_INFO } from './multiplayer';
import { maxHitRadius } from './roster';
import type { World } from './world';

/**
 * Servicios del motor que necesitan los ejecutores. Se pasan explícitamente
 * para que las estrategias no dependan de la clase `Game` ni de sus campos
 * privados.
 */
export interface AbilityExecutorDeps {
  readonly combatFx: CombatFx;
  readonly world: World;
  readonly matchPlayers: MatchPlayerState[];
  spawnShield(player: MatchPlayerState, def: SelfAbilityDef): void;
  canHit(attacker: MatchPlayerState, target: MatchPlayerState): boolean;
  /** Ejecuta la resolución de la habilidad con los objetivos ya reunidos. */
  resolveAbility(input: AbilityHitInput<MatchPlayerState, AnyAbilityDef>): void;
  /** Tramo de dash resuelto; el objeto devuelto es compartido (copiar x/z). */
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
  /**
   * Casteo que está ejecutando el efecto. Permite que las áreas persistentes
   * queden ligadas a su canalización y se retiren si esta se interrumpe.
   */
  readonly activeCast?: ActiveCast;
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
   * Ayuda de apuntado opcional. El motor la ofrece solo a jugadores humanos y
   * devuelve `null` cuando el ajuste está desactivado o no hay un rival dentro
   * del cono. Los proyectiles la consultan al salir, no al iniciar la carga:
   * si el lanzador gira durante el startup, el disparo sale donde apunta.
   */
  readonly aimAssist?: (
    player: MatchPlayerState,
    def: AnyAbilityDef,
    dirX: number,
    dirZ: number
  ) => { dirX: number; dirZ: number } | null;
  /**
   * Resuelve el golpe de un área: reúne a todos los Pokémon dentro del radio y
   * delega en la resolución de la habilidad.
   */
  resolveAoeHit(hit: AoeHitInput<MatchPlayerState, AoeAbilityDef>): void;
  /**
   * Dispara un evento del ciclo de vida del área. El ejecutor lo usa para
   * avisar de `onCast` justo cuando el área aparece.
   */
  emitAoeEvent(
    phase: 'start' | 'cast' | 'end',
    player: MatchPlayerState,
    def: AoeAbilityDef,
    x: number,
    z: number,
    dirX: number,
    dirZ: number,
    elapsed: number
  ): void;
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
  if (def.shape !== 'melee') return;
  // El cuerpo gira hacia el apuntado antes de dibujar el arco y resolver el
  // golpe, igual que hacen los proyectiles al salir.
  const yaw = attackYaw(player);
  player.facing = yaw;
  // El arco dibuja el radio máximo de golpe (`range` + el mayor hurtbox) y el
  // golpe cuenta el cuerpo del rival desde el borde hacia dentro: si su hurtbox
  // roza el cono, recibe daño. Así no hay franjas donde el aviso cubra al rival
  // pero el centro quede fuera del alcance.
  deps.combatFx.spawnMelee(
    player.x,
    player.z,
    yaw,
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
        yaw,
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
  if (def.shape !== 'projectile') return;
  const yaw = attackYaw(player);
  let dirX = Math.sin(yaw);
  let dirZ = Math.cos(yaw);
  // Ayuda de apuntado suave: se aplica al salir el proyectil. Si corrige el
  // tiro, el cuerpo gira con él para que el disparo y el sprite coincidan.
  const assisted = deps.aimAssist?.(player, def, dirX, dirZ);
  if (assisted) {
    dirX = assisted.dirX;
    dirZ = assisted.dirZ;
    player.facing = Math.atan2(dirX, dirZ);
  }
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
  if (def.shape !== 'beam') return;
  const yaw = attackYaw(player);
  let dirX = Math.sin(yaw);
  let dirZ = Math.cos(yaw);
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
      def.beamStyle,
      { slot: player.slot, team: player.team }
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
  const targets: AbilityTarget<MatchPlayerState>[] = [];
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
    // La resolución por defecto aplica el golpe solo si quita vida de verdad y
    // comparte el token de `healOnHit` del lanzamiento.
    targets.push({
      player: target,
      distance: along,
      radialMultiplier: 1,
      damagePower: def.props.power,
      isAlly: target.team === player.team,
      isEnemy: target.team !== player.team,
      isSelf: target === player,
      lineOfSight: true,
      hittable: deps.canHit(player, target)
    });
  }
  if (targets.length === 0) return;
  deps.resolveAbility({
    owner: player,
    def,
    x: player.x,
    z: player.z,
    radius: def.radius,
    shape: 'circle',
    dirX,
    dirZ,
    halfAngle: 0,
    mode: 'once',
    tick: 0,
    elapsed: 0,
    power: def.props.power,
    targets,
    healToken: deps.healToken
  });
};

const executeAoe: AbilityExecutor = (player, def, deps, targetX, targetZ) => {
  if (def.shape !== 'aoe') return;
  // En las áreas con preparación se conserva la dirección del lanzamiento; el
  // jugador pudo girar durante un `windup` móvil y el centro ya estaba fijado.
  const yaw = attackYaw(player);
  const dirX = deps.castDirX ?? Math.sin(yaw);
  const dirZ = deps.castDirZ ?? Math.cos(yaw);
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
  // Un área con `aoeCircles` se dibuja como la unión de sus círculos: un
  // efecto y una marca por círculo, agrupados en un solo handle.
  const grouped = shape === 'circle' && def.aoeCircles.length > 0;
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
            duration,
            { slot: player.slot, team: player.team }
          )
        : grouped
          ? spawnGroupedAoeTelegraph(
              deps.combatFx,
              def,
              centerX,
              centerZ,
              dirX,
              dirZ,
              TEAM_INFO[player.team].accent,
              0,
              duration,
              { slot: player.slot, team: player.team }
            )
          : deps.combatFx.spawnAoeTelegraph(
              centerX,
              centerZ,
              def.radius + maxHitRadius(),
              TEAM_INFO[player.team].accent,
              0,
              duration,
              { slot: player.slot, team: player.team }
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
      : grouped
        ? spawnGroupedAoe(
            deps.combatFx,
            def,
            centerX,
            centerZ,
            dirX,
            dirZ,
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
  // El área ya está dibujada en su centro definitivo: los eventos ven la
  // posición y los objetivos reales del primer golpe.
  deps.emitAoeEvent('cast', player, def, centerX, centerZ, dirX, dirZ, 0);
  if (isOvertimeMode(def.aoeDamageMode)) {
    const tickInterval = Math.max(0.05, Math.min(def.aoeTickInterval, duration));
    deps.addActiveAoe({
      owner: player,
      def,
      cast: deps.activeCast,
      fx: areaFx,
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
      flatBonusApplied: new Set(),
      movement: def.aoeMovement,
      originX: centerX,
      originZ: centerZ,
      dirX,
      dirZ,
      originDirX: dirX,
      originDirZ: dirZ,
      moveVisual: (x, z, nextDirX, nextDirZ) => {
        areaFx.setCenter(x, z);
        marker?.setCenter?.(x, z);
        areaFx.setDirection?.(nextDirX, nextDirZ);
        marker?.setDirection?.(nextDirX, nextDirZ);
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
    mode: 'once',
    tick: 0,
    elapsed: 0,
    power: def.props.power,
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
  if (def.shape !== 'dash') return;
  // La dirección se fija al empezar el casteo. Durante la preparación el
  // jugador puede seguir girando (y el frame del lanzamiento mueve antes de
  // resolver el efecto), pero el dash debe salir hacia donde apuntaba la
  // habilidad al iniciarse, como las áreas con `windup`.
  const yaw = attackYaw(player);
  const dirX = deps.castDirX ?? Math.sin(yaw);
  const dirZ = deps.castDirZ ?? Math.cos(yaw);
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
  if (def.shape !== 'self') return;
  if (def.shield) {
    player.damageReductionTimer = def.shieldDuration;
    player.damageReduction = Math.min(0.65, Math.max(0, def.damageReduction));
    player.shieldSpeedMultiplier = Math.max(0.1, def.shieldSpeedMultiplier);
    deps.spawnShield(player, def);
  } else if (def.healSelf <= 0) {
    // Recuperación ya tiene su propio estallido de curación.
    deps.combatFx.spawnBuff(
      player.x,
      player.z,
      def.color,
      Math.max(0.8, def.radius)
    );
  }
  // Una resolución propia puede añadir efectos sobre el lanzador. La lista
  // lleva al propio lanzador para que `applyBuff`, `applyHeal` o `applyHit`
  // tengan un objetivo válido.
  deps.resolveAbility({
    owner: player,
    def,
    x: player.x,
    z: player.z,
    radius: def.radius,
    shape: 'circle',
    dirX: Math.sin(player.facing),
    dirZ: Math.cos(player.facing),
    halfAngle: 0,
    mode: 'once',
    tick: 0,
    elapsed: 0,
    power: def.props.power,
    targets: [
      {
        player,
        distance: 0,
        radialMultiplier: 1,
        damagePower: def.props.power,
        isAlly: true,
        isEnemy: false,
        isSelf: true,
        lineOfSight: true,
        hittable: false
      }
    ],
    healToken: deps.healToken
  });
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
