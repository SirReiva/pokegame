/**
 * Resolución común de habilidades.
 *
 * Construye el contexto que recibe `def.resolve` a partir de los objetivos que
 * ya reunió el motor (geometría del área, arco melee, proyectil o barrido del
 * dash) y expone los servicios de combate: golpe estándar, hitstun, empuje,
 * slow, buffs, curación y revivir.
 */

import type {
  AbilityHitInput,
  AbilityHitOptions,
  AbilityResolveContext,
  AbilityTarget,
  AnyAbilityDef,
  BuffSpec,
  SlowSpec
} from '../abilities';
import { isOvertimeMode } from '../core/abilities/styles';
import type { CombatFxPort } from '../core/ports/fx';
import { applyHealFraction } from '../effects';
import type { MatchPlayerState } from '../matchState';
import type { World } from '../world';
import type { XpSource } from '../xp';
import { XP_REWARDS } from '../xp';
import type { DamageOptions } from './damage';

type PlayerTarget = AbilityTarget<MatchPlayerState>;
type PlayerFallenAlly = {
  player: MatchPlayerState;
  distance: number;
  lineOfSight: boolean;
};
type PlayerHitInput = AbilityHitInput<MatchPlayerState, AnyAbilityDef>;

/** Servicios que necesita una resolución; los aportan `Game` y el simulador. */
export interface AbilityResolveHost {
  readonly combatFx: CombatFxPort;
  readonly matchPlayers: readonly MatchPlayerState[];
  readonly world: World;
  isMatchOver(): boolean;
  canHit(attacker: MatchPlayerState, target: MatchPlayerState): boolean;
  applyAbilityDamage(
    attacker: MatchPlayerState,
    target: MatchPlayerState,
    def: AnyAbilityDef,
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
    def: AnyAbilityDef,
    slow: SlowSpec,
    color: readonly [number, number, number]
  ): void;
  reviveAoeAlly(
    target: PlayerFallenAlly,
    fraction: number,
    def: AnyAbilityDef,
    caster: MatchPlayerState
  ): boolean;
  showHealPopup(
    target: MatchPlayerState,
    amount: number,
    source: MatchPlayerState
  ): void;
  awardXp(player: MatchPlayerState, source: XpSource, amount: number): void;
}

/** Ejecuta la resolución declarada por la habilidad. */
export function resolveAbility(
  host: AbilityResolveHost,
  input: PlayerHitInput
): void {
  input.def.resolve(buildResolveContext(host, input));
}

export function buildResolveContext(
  host: AbilityResolveHost,
  input: PlayerHitInput
): AbilityResolveContext<MatchPlayerState, AnyAbilityDef> {
  const fallenAllies = (input.fallenAllies ?? []) as readonly PlayerFallenAlly[];
  return {
    caster: input.owner,
    def: input.def,
    x: input.x,
    z: input.z,
    radius: input.radius,
    shape: input.shape,
    mode: input.mode,
    tick: input.tick,
    elapsed: input.elapsed,
    power: input.power,
    targets: input.targets ?? [],
    fallenAllies,
    applyHit: (target, options) => applyHit(host, input, target, options),
    applyHitstun: (target, seconds, cancel = false) => {
      if (cancel) host.interruptWithRefund(target.player, false);
      if (seconds > 0) {
        target.player.stunTimer = Math.max(target.player.stunTimer, seconds);
      }
    },
    applyKnockback: (target, distance) =>
      host.applyKnockback(
        target.player,
        target.sourceX ?? input.x,
        target.sourceZ ?? input.z,
        distance
      ),
    applySlow: (target, slow) =>
      host.applySlow(input.owner, target.player, input.def, slow, input.def.color),
    applyBuff: (target, buff) => applyBuff(host, target, buff, input.def),
    applyHeal: (target, fraction) =>
      applyHeal(host, target, fraction, input.def, input.owner),
    revive: (target, fraction) =>
      host.reviveAoeAlly(
        target as PlayerFallenAlly,
        fraction,
        input.def,
        input.owner
      ),
    isMatchOver: () => host.isMatchOver()
  };
}

/** Golpe estándar de una resolución. */
function applyHit(
  host: AbilityResolveHost,
  input: PlayerHitInput,
  target: PlayerTarget,
  options: AbilityHitOptions = {}
): boolean {
  return host.applyAbilityDamage(input.owner, target.player, input.def, {
    power: options.power ?? target.damagePower,
    control: options.control ?? !isOvertimeMode(input.mode),
    cancel: options.cancel,
    hitstun: options.hitstun,
    knockback: options.knockback,
    slow: options.slow,
    dot: options.dot,
    healToken: options.healToken ?? input.healToken,
    impactX: options.impactX ?? target.impactX,
    impactZ: options.impactZ ?? target.impactZ,
    sourceX: options.sourceX ?? target.sourceX ?? input.x,
    sourceZ: options.sourceZ ?? target.sourceZ ?? input.z,
    flatBonusApplied: options.flatBonusApplied ?? input.flatBonusApplied
  });
}

function applyBuff(
  host: AbilityResolveHost,
  target: PlayerTarget,
  buff: BuffSpec,
  def: AnyAbilityDef
): void {
  target.player.buffs.push({ ...buff, duration: buff.duration });
  host.combatFx.spawnBuff(target.player.x, target.player.z, def.color, 0.95);
}

function applyHeal(
  host: AbilityResolveHost,
  target: PlayerTarget,
  fraction: number,
  def: AnyAbilityDef,
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
