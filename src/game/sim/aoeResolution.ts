/**
 * Resolución de áreas: contexto de objetivos, callbacks de `aoeEffect`,
 * eventos de ciclo de vida y golpes estándar.
 */

import type { AbilityDef, BuffSpec, SlowSpec } from '../abilities';
import type {
  AoeEffect,
  AoeEffectContext,
  AoeEventContext,
  AoeFallenAlly,
  AoeHitInput,
  AoeHitOptions,
  AoeTarget
} from '../core/abilities/aoe';
import { defaultAoeEffect } from '../aoeEffect';
import { aoeAreaFrom, aoeContains, aoeDistance } from '../aoeGeometry';
import { segmentBlockedByColliders } from '../combat';
import { DEG } from '../config';
import type { CombatFxPort } from '../core/ports/fx';
import { applyHealFraction } from '../effects';
import type { MatchPlayerState } from '../matchState';
import { maxHitRadius } from '../roster';
import type { World } from '../world';
import type { XpSource } from '../xp';
import { XP_REWARDS } from '../xp';
import type { PendingAoeEnd } from './aoes';
import type { DamageOptions } from './damage';

type PlayerAoeTarget = AoeTarget<MatchPlayerState>;
type PlayerAoeFallenAlly = AoeFallenAlly<MatchPlayerState>;
type PlayerAoeHitInput = AoeHitInput<MatchPlayerState, AbilityDef>;
type PlayerAoeEffectContext = AoeEffectContext<MatchPlayerState, AbilityDef>;

export interface AoeResolutionHost {
  readonly combatFx: CombatFxPort;
  readonly matchPlayers: readonly MatchPlayerState[];
  readonly world: World;
  readonly pendingAoeEnds: PendingAoeEnd[];
  isMatchOver(): boolean;
  canHit(attacker: MatchPlayerState, target: MatchPlayerState): boolean;
  applyAbilityDamage(
    attacker: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef,
    options?: DamageOptions
  ): boolean;
  interruptWithRefund(target: MatchPlayerState, lethal: boolean): void;
  applyKnockback(
    target: MatchPlayerState,
    fromX: number,
    fromZ: number,
    distance: number
  ): void;
  applySlow(
    attacker: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef,
    slow: SlowSpec,
    color: readonly [number, number, number]
  ): void;
  reviveAoeAlly(
    target: PlayerAoeFallenAlly,
    fraction: number,
    def: AbilityDef,
    caster: MatchPlayerState
  ): boolean;
  showHealPopup(
    target: MatchPlayerState,
    amount: number,
    source: MatchPlayerState
  ): void;
  awardXp(player: MatchPlayerState, source: XpSource, amount: number): void;
}

function radialDamageMultiplier(
  def: AbilityDef,
  distance: number,
  radius: number
): number {
  if (!def.radialDamage) return 1;
  const t = Math.min(1, Math.max(0, distance / Math.max(0.001, radius)));
  const min = Math.min(1, Math.max(0, def.radialMinDamage));
  return 1 - (1 - min) * t;
}

function buildAoeContext(
  host: AoeResolutionHost,
  hit: PlayerAoeHitInput
): PlayerAoeEffectContext {
  const targets: PlayerAoeTarget[] = [];
  const fallenAllies: PlayerAoeFallenAlly[] = [];
  // El círculo usa `radius` alrededor del centro; el cono usa la misma prueba
  // de sector que el melee desde ese centro hacia delante.
  const area = aoeAreaFrom(hit.def, hit.x, hit.z, hit.dirX, hit.dirZ);
  const hitPadding = maxHitRadius();
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
      distance,
      hit.radius
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

  return {
    caster: hit.owner,
    def: hit.def,
    x: hit.x,
    z: hit.z,
    radius: hit.radius,
    shape: hit.shape,
    mode: hit.mode,
    tick: hit.tick,
    elapsed: hit.elapsed,
    power: hit.power,
    targets,
    fallenAllies,
    applyHit: (target, options) => applyAoeHit(host, hit, target, options),
    applyHitstun: (target, seconds, cancel = false) => {
      if (cancel) host.interruptWithRefund(target.player, false);
      if (seconds > 0) {
        target.player.stunTimer = Math.max(target.player.stunTimer, seconds);
      }
    },
    applyKnockback: (target, distance) =>
      host.applyKnockback(target.player, hit.x, hit.z, distance),
    applySlow: (target, slow) =>
      host.applySlow(hit.owner, target.player, hit.def, slow, hit.def.color),
    applyBuff: (target, buff) => applyAoeBuff(host, target, buff, hit.def),
    applyHeal: (target, fraction) =>
      applyAoeHeal(host, target, fraction, hit.def, hit.owner),
    revive: (target, fraction) =>
      host.reviveAoeAlly(target, fraction, hit.def, hit.owner),
    isMatchOver: () => host.isMatchOver()
  };
}

/** Resuelve un golpe o tick del área con el `aoeEffect` de la habilidad. */
export function resolveAoeHit(
  host: AoeResolutionHost,
  hit: PlayerAoeHitInput
): void {
  const effect = (hit.def.aoeEffect ?? defaultAoeEffect) as AoeEffect<
    MatchPlayerState,
    AbilityDef
  >;
  effect(buildAoeContext(host, hit));
}

/**
 * Dispara un evento del ciclo de vida del área (`onStart`, `onCast` o `onEnd`).
 */
export function emitAoeEvent(
  host: AoeResolutionHost,
  phase: 'start' | 'cast' | 'end',
  caster: MatchPlayerState,
  def: AbilityDef,
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
  elapsed: number
): void {
  // Las áreas instantáneas no tienen `ActiveAoe` que se retire: su `onEnd` se
  // programa para cuando termine la duración visual del estallido.
  if (phase === 'cast' && def.aoeDamageMode === 'instant' && def.onEnd) {
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
  const hit: PlayerAoeHitInput = {
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
    power: def.power
  };
  const context: AoeEventContext<MatchPlayerState, AbilityDef> = {
    ...buildAoeContext(host, hit),
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

/** Ejecuta el golpe estándar de un área contra un objetivo concreto. */
function applyAoeHit(
  host: AoeResolutionHost,
  hit: PlayerAoeHitInput,
  target: PlayerAoeTarget,
  options: AoeHitOptions = {}
): boolean {
  return host.applyAbilityDamage(hit.owner, target.player, hit.def, {
    power: options.power ?? target.damagePower,
    control: options.control ?? hit.mode === 'instant',
    cancel: options.cancel,
    hitstun: options.hitstun,
    knockback: options.knockback,
    slow: options.slow,
    healToken: options.healToken ?? hit.healToken,
    impactX: options.impactX,
    impactZ: options.impactZ,
    sourceX: options.sourceX ?? hit.x,
    sourceZ: options.sourceZ ?? hit.z,
    flatBonusApplied: hit.flatBonusApplied
  });
}

/** Buff/debuff temporal aplicado a un objetivo por un callback de área. */
function applyAoeBuff(
  host: AoeResolutionHost,
  target: PlayerAoeTarget,
  buff: BuffSpec,
  def: AbilityDef
): void {
  target.player.buffs.push({ ...buff, duration: buff.duration });
  host.combatFx.spawnBuff(target.player.x, target.player.z, def.color, 0.95);
}

/** Cura a un objetivo del área una fracción de su vida máxima. */
function applyAoeHeal(
  host: AoeResolutionHost,
  target: PlayerAoeTarget,
  fraction: number,
  def: AbilityDef,
  caster: MatchPlayerState
): void {
  const healed = applyHealFraction(
    target.player,
    fraction,
    def,
    host.combatFx,
    (healedPlayer, amount) => {
      host.showHealPopup(healedPlayer, amount, caster);
    },
    // La estadística y la XP de curación son para quien lanza la habilidad.
    caster
  );
  if (healed > 0) {
    host.awardXp(caster, 'healing', healed * XP_REWARDS.healingPerHp);
  }
}
