/**
 * Resolución de áreas: geometría, objetivos, ticks por objetivo y eventos de
 * ciclo de vida. La aplicación de efectos vive en `abilityResolve.ts`; aquí
 * solo se reúnen los objetivos y se llama a la resolución de la habilidad.
 */

import type {
  AoeAbilityDef,
  AnyAbilityDef
} from '../abilities';
import type {
  AoeEventContext,
  AoeFallenAlly,
  AoeHitInput,
  AoeTarget
} from '../core/abilities/aoe';
import { aoeAreaFrom, aoeContains, aoeDistance, aoeHitPadding, aoeRadialFalloff } from '../aoeGeometry';
import { segmentBlockedByColliders } from '../combat';
import { DEG } from '../config';
import type { ActiveAoe, MatchPlayerState } from '../matchState';
import {
  buildResolveContext,
  resolveAbility,
  type AbilityResolveHost
} from './abilityResolve';

type PlayerAoeTarget = AoeTarget<MatchPlayerState>;
type PlayerAoeFallenAlly = AoeFallenAlly<MatchPlayerState>;
type PlayerAoeHitInput = AoeHitInput<MatchPlayerState, AoeAbilityDef>;

/** `onEnd` de un área instantánea que espera a terminar su duración visual. */
export interface PendingAoeEnd {
  caster: MatchPlayerState;
  def: AoeAbilityDef;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  /** Segundos que faltan para disparar el evento. */
  remaining: number;
  /** Tiempo transcurrido desde que apareció el área. */
  elapsed: number;
}

/** Host de resolución de área: añade la cola de `onEnd` diferidos. */
export interface AoeResolutionHost extends AbilityResolveHost {
  readonly pendingAoeEnds: PendingAoeEnd[];
}

interface BuiltTargets {
  targets: PlayerAoeTarget[];
  fallenAllies: PlayerAoeFallenAlly[];
}

function radialDamageMultiplier(
  def: AoeAbilityDef,
  falloff: number
): number {
  if (!def.radialDamage) return 1;
  const t = Math.min(1, Math.max(0, falloff));
  const min = Math.min(1, Math.max(0, def.radialMinDamage));
  return 1 - (1 - min) * t;
}

/** Diferencia angular normalizada al intervalo (-π, π]. */
function shortestAngle(angle: number): number {
  return (
    (((angle + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) -
    Math.PI
  );
}

/**
 * Mueve y gira un área persistente antes de resolver su tick.
 *
 * El centro se aplica de inmediato. La dirección que devuelve `aoeMovement` es
 * el objetivo: el área gira hacia ella como máximo `aoeTurnRate` grados por
 * segundo, de modo que un cambio de apuntado se ve como un desplazamiento y no
 * como un salto. Con `aoeTurnRate: 0` el giro es instantáneo.
 */
export function resolveAoeMovement(aoe: ActiveAoe, dt: number): void {
  if (!aoe.movement || aoe.elapsed >= aoe.duration) return;
  const next = aoe.movement({
    caster: aoe.owner,
    def: aoe.def,
    originX: aoe.originX,
    originZ: aoe.originZ,
    dirX: aoe.originDirX,
    dirZ: aoe.originDirZ,
    duration: aoe.duration,
    elapsed: aoe.elapsed
  });
  aoe.x = next.x;
  aoe.z = next.z;
  if (next.dirX !== undefined && next.dirZ !== undefined) {
    const length = Math.hypot(next.dirX, next.dirZ);
    if (length > 0.0001) {
      const target = Math.atan2(next.dirX / length, next.dirZ / length);
      const current = Math.atan2(aoe.dirX, aoe.dirZ);
      const delta = shortestAngle(target - current);
      const maxStep = Math.max(0, aoe.def.aoeTurnRate) * DEG * dt;
      const turn =
        maxStep > 0
          ? Math.max(-maxStep, Math.min(maxStep, delta))
          : delta;
      if (turn !== 0) {
        const angle = current + turn;
        aoe.dirX = Math.sin(angle);
        aoe.dirZ = Math.cos(angle);
      }
    }
  }
  aoe.moveVisual?.(aoe.x, aoe.z, aoe.dirX, aoe.dirZ);
}

/**
 * Reúne los Pokémon vivos dentro del área y los aliados caídos cuyo marcador
 * de KO también está dentro.
 */
function buildAoeTargets(
  host: AoeResolutionHost,
  hit: PlayerAoeHitInput
): BuiltTargets {
  const targets: PlayerAoeTarget[] = [];
  const fallenAllies: PlayerAoeFallenAlly[] = [];
  // El círculo usa `radius` alrededor del centro; el cono usa la misma prueba
  // de sector que el melee desde ese centro hacia delante.
  const area = aoeAreaFrom(hit.def, hit.x, hit.z, hit.dirX, hit.dirZ);
  // Los patrones de círculos usan su radio exacto; el resto de áreas suman el
  // mayor hurtbox para que el aro marque el límite real de golpe.
  const hitPadding = aoeHitPadding(hit.def);
  for (const player of host.matchPlayers) {
    if (!player.alive) {
      // Los aliados caídos siguen en el punto del KO hasta reaparecer.
      if (player.team !== hit.owner.team) continue;
      if (!aoeContains(area, player.x, player.z, player.hitRadius, hitPadding)) {
        continue;
      }
      const distance = aoeDistance(area, player.x, player.z);
      fallenAllies.push({
        player,
        distance,
        lineOfSight: !segmentBlockedByColliders(
          area.x,
          area.z,
          player.x,
          player.z,
          host.world.colliders
        )
      });
      continue;
    }
    if (!aoeContains(area, player.x, player.z, player.hitRadius, hitPadding)) {
      continue;
    }
    const distance = aoeDistance(area, player.x, player.z);
    const radialMultiplier = radialDamageMultiplier(
      hit.def,
      aoeRadialFalloff(area, player.x, player.z)
    );
    targets.push({
      player,
      distance,
      radialMultiplier,
      damagePower: hit.power * radialMultiplier,
      isAlly: player.team === hit.owner.team,
      isEnemy: player.team !== hit.owner.team,
      isSelf: player === hit.owner,
      lineOfSight: !segmentBlockedByColliders(
        area.x,
        area.z,
        player.x,
        player.z,
        host.world.colliders
      ),
      hittable: host.canHit(hit.owner, player)
    });
  }
  return { targets, fallenAllies };
}

/**
 * Resuelve un golpe o tick del área. La resolución recibe la lista completa de
 * objetivos y aliados caídos, aunque el evento sea de un solo tick.
 */
export function resolveAoeHit(
  host: AoeResolutionHost,
  hit: PlayerAoeHitInput
): void {
  const built = buildAoeTargets(host, hit);
  resolveAbility(host, { ...hit, ...built });
}

/**
 * Avanza los ticks por objetivo de un área `overtime-target`.
 *
 * Cada objetivo lleva su propio temporizador desde que entra: el primer tick
 * cae al entrar y al salir se descarta su estado. El contexto recibe el
 * `elapsed` global del área y el `elapsed`/`tick` propios del objetivo.
 */
export function tickAoeTargets(
  host: AoeResolutionHost,
  aoe: ActiveAoe,
  dt: number
): void {
  if (aoe.elapsed >= aoe.duration) return;
  const tickPower = aoe.def.props.power * aoe.tickInterval;
  const built = buildAoeTargets(host, {
    owner: aoe.owner,
    def: aoe.def,
    x: aoe.x,
    z: aoe.z,
    radius: aoe.radius,
    shape: aoe.shape,
    dirX: aoe.dirX,
    dirZ: aoe.dirZ,
    halfAngle: aoe.halfAngle,
    mode: aoe.def.aoeDamageMode,
    tick: 0,
    elapsed: aoe.elapsed,
    power: tickPower,
    healToken: aoe.healToken,
    flatBonusApplied: aoe.flatBonusApplied
  });
  const timers =
    aoe.targetTimers ??
    (aoe.targetTimers = new Map<
      number,
      { elapsed: number; tickTimer: number; tick: number }
    >());
  const inside = new Set<number>();

  for (const target of built.targets) {
    const slot = target.player.slot;
    inside.add(slot);
    let timer = timers.get(slot);
    if (!timer) {
      timer = { elapsed: 0, tickTimer: 0, tick: 0 };
      timers.set(slot, timer);
    }
    timer.elapsed += dt;
    timer.tickTimer -= dt;
    let guard = 0;
    while (
      timer.tickTimer <= 0 &&
      timer.elapsed < aoe.duration &&
      guard < 8
    ) {
      guard += 1;
      resolveAbility(host, {
        owner: aoe.owner,
        def: aoe.def,
        x: aoe.x,
        z: aoe.z,
        radius: aoe.radius,
        shape: aoe.shape,
        dirX: aoe.dirX,
        dirZ: aoe.dirZ,
        halfAngle: aoe.halfAngle,
        mode: aoe.def.aoeDamageMode,
        tick: timer.tick,
        elapsed: aoe.elapsed,
        power: tickPower,
        targets: [
          { ...target, elapsed: timer.elapsed, tick: timer.tick }
        ],
        fallenAllies: [],
        healToken: aoe.healToken,
        flatBonusApplied: aoe.flatBonusApplied
      });
      timer.tickTimer += aoe.tickInterval;
      timer.tick += 1;
    }
  }

  // Al salir del área se descarta el estado: volver a entrar empieza de cero.
  for (const slot of timers.keys()) {
    if (!inside.has(slot)) timers.delete(slot);
  }
}

/**
 * Dispara un evento del ciclo de vida del área (`onStart`, `onCast` o `onEnd`).
 */
export function emitAoeEvent(
  host: AoeResolutionHost,
  phase: 'start' | 'cast' | 'end',
  caster: MatchPlayerState,
  def: AoeAbilityDef,
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
  elapsed: number
): void {
  // Las áreas de un solo golpe no tienen `ActiveAoe` que se retire: su `onEnd`
  // se programa para cuando termine la duración visual del estallido.
  if (phase === 'cast' && def.aoeDamageMode === 'once' && def.onEnd) {
    host.pendingAoeEnds.push({
      caster,
      def,
      x,
      z,
      dirX,
      dirZ,
      remaining: Math.max(0.1, def.aoeDuration),
      elapsed: 0
    });
  }
  const event =
    phase === 'start'
      ? def.onStart
      : phase === 'cast'
        ? def.onCast
        : def.onEnd;
  if (!event) return;
  const built = buildAoeTargets(host, {
    owner: caster,
    def,
    x,
    z,
    radius: def.radius,
    shape: def.aoeShape,
    dirX,
    dirZ,
    halfAngle: def.halfAngle * DEG,
    mode: def.aoeDamageMode,
    tick: 0,
    elapsed,
    power: def.props.power
  });
  const base = buildResolveContext(host, {
    owner: caster,
    def,
    x,
    z,
    radius: def.radius,
    shape: def.aoeShape,
    dirX,
    dirZ,
    halfAngle: def.halfAngle * DEG,
    mode: def.aoeDamageMode,
    tick: 0,
    elapsed,
    power: def.props.power,
    ...built
  });
  const context: AoeEventContext<MatchPlayerState, AnyAbilityDef> = {
    ...base,
    combatFx: host.combatFx,
    setCasterHidden: (hidden) => {
      caster.hidden = hidden;
      // El casteo recuerda que ocultó al lanzador para volver a mostrarlo si se
      // interrumpe antes de que llegue su `onCast`.
      if (hidden && caster.activeCast) caster.activeCast.hiddenCaster = true;
    },
    setCasterInvulnerable: (invulnerable) => {
      if (invulnerable) {
        // La preparación entera queda cubierta; `onCast` la retira antes de que
        // el margen extra pueda notarse.
        caster.invulnerableTimer = Math.max(
          caster.invulnerableTimer,
          def.startup + 0.1
        );
        if (caster.activeCast) caster.activeCast.invulnerableCaster = true;
      } else if (caster.activeCast?.invulnerableCaster) {
        caster.invulnerableTimer = 0;
      }
    }
  };
  event(context);
}
