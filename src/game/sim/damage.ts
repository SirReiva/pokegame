/**
 * Resolución de un golpe de habilidad.
 *
 * Inmunidad de tipo, sonido, slow, control, fórmula de daño, clima, escudo,
 * estadísticas, XP, KO y curación por impacto. El host aporta los avisos y las
 * reglas que ya viven en `Game`.
 */

import type { AbilityDef, BuffStat, SlowSpec } from '../abilities';
import {
  atmosphereIncomingMultiplier,
  atmosphereMoveMultiplier,
  atmosphereShapeMultiplier,
  type AtmosphereId
} from '../atmosphere';
import type { CombatFxPort } from '../core/ports/fx';
import type { HealOnHitToken, MatchPlayerState } from '../matchState';
import { CONFIG } from '../config';
import { computeDamage, rollCritical, rollRandomFactor } from '../combat';
import { applyHealSelf } from '../effects';
import { typeEffectiveness } from '../core/typeChart';
import { XP_REWARDS, type XpSource } from '../xp';
import { breakRegen } from './status';

export interface DamageOptions {
  power?: number;
  control?: boolean;
  cancel?: boolean;
  hitstun?: number;
  knockback?: number | null;
  slow?: SlowSpec | null;
  healToken?: HealOnHitToken;
  impactX?: number;
  impactZ?: number;
  sourceX?: number;
  sourceZ?: number;
  /** Marca de inmunidad compartida por los ticks de un lanzamiento. */
  immuneMarked?: Set<number>;
  /** Objetivos que ya pagaron el `+2` de la fórmula en este lanzamiento. */
  flatBonusApplied?: Set<number>;
}

export interface HitControlOptions {
  cancel: boolean;
  hitstun: number;
  knockback: number;
  /** Daño final del golpe; decide si la armadura del casteo lo absorbe. */
  damage: number;
  /** El golpe mata al objetivo; interrumpir no debe reembolsar cooldown. */
  lethal?: boolean;
  /** Estado o control duro: ignora la armadura del casteo. */
  force?: boolean;
  sourceX?: number;
  sourceZ?: number;
}

export interface DamageSystemHost {
  readonly combatFx: CombatFxPort;
  readonly atmosphere: AtmosphereId;
  buffMultiplier(player: MatchPlayerState, stat: BuffStat): number;
  applySlow(
    attacker: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef,
    slow: SlowSpec,
    color: readonly [number, number, number]
  ): void;
  activeCastArmor(target: MatchPlayerState): number;
  spawnArmorFeedback(target: MatchPlayerState, broke: boolean): void;
  interruptWithRefund(target: MatchPlayerState, lethal: boolean): void;
  applyKnockback(
    target: MatchPlayerState,
    fromX: number,
    fromZ: number,
    distance: number
  ): void;
  playImpactSound(effectiveness: number): void;
  showImmunePopup(target: MatchPlayerState, source: MatchPlayerState): void;
  showDamagePopup(
    target: MatchPlayerState,
    amount: number,
    critical: boolean,
    effectiveness: number,
    lethal: boolean,
    source: MatchPlayerState
  ): void;
  showHealPopup(
    target: MatchPlayerState,
    amount: number,
    source: MatchPlayerState
  ): void;
  awardCombatXp(
    attacker: MatchPlayerState,
    target: MatchPlayerState,
    appliedDamage: number,
    rawDamage: number,
    finalDamage: number
  ): void;
  awardXp(player: MatchPlayerState, source: XpSource, amount: number): void;
  vibrateOnDamage(target: MatchPlayerState, amount: number): void;
  knockOut(
    target: MatchPlayerState,
    killer: MatchPlayerState,
    abilityName: string
  ): void;
}

/**
 * Control de un golpe que conecta: puede cancelar dash/preparación, aplicar
 * hitstun y empujar. Devuelve `true` si la armadura del casteo absorbió el golpe.
 */
function applyHitControl(
  host: DamageSystemHost,
  attacker: MatchPlayerState,
  target: MatchPlayerState,
  options: HitControlOptions
): boolean {
  const cast = target.activeCast;
  // `blockMovementDuringCast` convierte el casteo en una canalización: el
  // lanzador queda clavado y cualquier impacto la corta.
  const channeling = cast?.def.blockMovementDuringCast === true;
  const armor = host.activeCastArmor(target);
  const armorActive = armor > 0;
  const wouldInterrupt = options.cancel || channeling;
  // La armadura absorbe el golpe mientras le quede pozo. Los estados, el
  // control explícito y los golpes letales pasan por encima.
  const absorbed =
    wouldInterrupt &&
    armorActive &&
    options.force !== true &&
    options.lethal !== true &&
    options.damage < armor;

  if (armorActive && wouldInterrupt) {
    if (absorbed && cast) {
      cast.armorRemaining = Math.max(0, armor - options.damage);
    }
    host.spawnArmorFeedback(target, !absorbed);
  }
  if (wouldInterrupt && !absorbed) {
    host.interruptWithRefund(target, options.lethal === true);
  }
  if (!absorbed) {
    if (options.hitstun > 0) {
      target.stunTimer = Math.max(target.stunTimer, options.hitstun);
    }
    if (options.knockback > 0) {
      host.applyKnockback(
        target,
        options.sourceX ?? attacker.x,
        options.sourceZ ?? attacker.z,
        options.knockback
      );
    }
  }
  return absorbed;
}

export function applyAbilityDamage(
  host: DamageSystemHost,
  attacker: MatchPlayerState,
  target: MatchPlayerState,
  def: AbilityDef,
  options: DamageOptions = {}
): boolean {
  const power = options.power ?? def.power;
  const damaging = power > 0 && def.category !== 'status';
  const control = options.control ?? true;
  const cancel = options.cancel ?? control;
  const hitstun =
    options.hitstun ?? (control ? CONFIG.combat.hitstunSeconds : 0);
  const knockback =
    options.knockback === undefined
      ? control
        ? def.knockback
        : 0
      : options.knockback ?? 0;
  const slow = options.slow === undefined ? def.slow : options.slow;

  // La inmunidad de tipo anula el golpe completo: ni daño, ni estado, ni
  // impacto, ni control.
  const effectiveness = typeEffectiveness(def.type, target.types);
  if (effectiveness === 0) {
    if (!options.immuneMarked || !options.immuneMarked.has(target.slot)) {
      host.showImmunePopup(target, attacker);
      options.immuneMarked?.add(target.slot);
    }
    return false;
  }
  // El impacto suena para cualquier golpe válido, también los de estado.
  host.playImpactSound(effectiveness);

  // La ralentización se aplica aunque la habilidad no haga daño.
  if (slow && target.alive) {
    host.applySlow(attacker, target, def, slow, def.color);
  }

  // Una habilidad de estado no resta vida, pero su impacto cuenta como golpe:
  // cancela dash y preparación igual que una dañina.
  if (!damaging) {
    applyHitControl(host, attacker, target, {
      cancel,
      hitstun,
      knockback,
      damage: 0,
      force: true,
      sourceX: options.sourceX,
      sourceZ: options.sourceZ
    });
    return false;
  }

  // El `+2` de la fórmula es por golpe; en áreas persistentes el primero que
  // alcanza a cada objetivo lo paga y los siguientes lo desactivan.
  let flatBonus = 2;
  if (options.flatBonusApplied) {
    const alreadyApplied = options.flatBonusApplied.has(target.slot);
    if (!alreadyApplied) options.flatBonusApplied.add(target.slot);
    flatBonus = alreadyApplied ? 0 : 2;
  }

  const critical = rollCritical();
  const category = def.category === 'physical' ? 'physical' : 'special';
  const physical = category === 'physical';
  const result = computeDamage({
    moveType: def.type,
    category,
    power,
    attacker: attacker.combat,
    defender: target.combat,
    attackerTypes: attacker.types,
    defenderTypes: target.types,
    attackMultiplier: host.buffMultiplier(
      attacker,
      physical ? 'attack' : 'spAttack'
    ),
    defenseMultiplier: host.buffMultiplier(
      target,
      physical ? 'defense' : 'spDefense'
    ),
    flatBonus,
    critical,
    randomFactor: rollRandomFactor()
  });

  const reduction =
    target.damageReductionTimer > 0 ? target.damageReduction : 0;
  const weatherMultiplier =
    atmosphereMoveMultiplier(host.atmosphere, def.type) *
    atmosphereShapeMultiplier(host.atmosphere, def.shape) *
    atmosphereIncomingMultiplier(host.atmosphere, target.types);
  const finalDamage = Math.max(
    1,
    Math.round(result.damage * (1 - reduction) * weatherMultiplier)
  );
  const lethal = finalDamage >= target.hp;
  host.combatFx.spawnImpact(
    options.impactX ?? target.x,
    options.impactZ ?? target.z,
    def.color,
    result.effectiveness,
    def.impactStyle
  );
  host.showDamagePopup(
    target,
    finalDamage,
    result.critical,
    result.effectiveness,
    lethal,
    attacker
  );

  // El control puede venir del `control` estándar o de los ajustes propios del
  // callback de un área.
  const absorbed = applyHitControl(host, attacker, target, {
    cancel,
    hitstun,
    knockback,
    damage: finalDamage,
    lethal,
    sourceX: options.sourceX,
    sourceZ: options.sourceZ
  });

  // Solo cuenta el daño que descuenta vida real.
  const appliedDamage = Math.min(finalDamage, target.hp);
  target.hp = Math.max(0, target.hp - finalDamage);
  target.damageTaken += appliedDamage;
  if (attacker.team !== target.team) attacker.damageDealt += appliedDamage;
  host.awardCombatXp(
    attacker,
    target,
    appliedDamage,
    result.damage,
    finalDamage
  );
  breakRegen(target);
  // Un golpe absorbido por la armadura no debe reproducir el flinch.
  if (!absorbed) {
    target.hurtTimer = Math.max(target.hurtTimer, control ? 0.35 : 0.2);
  }
  host.vibrateOnDamage(target, appliedDamage);
  if (target.hp <= 0) host.knockOut(target, attacker, def.name);

  // `healOnHit` se resuelve aquí, en el único punto donde un golpe resta vida.
  if (def.healOnHit && options.healToken && !options.healToken.healed) {
    options.healToken.healed = true;
    applyHealSelf(attacker, def, host.combatFx, (healed, amount) => {
      host.showHealPopup(healed, amount, attacker);
      host.awardXp(healed, 'healing', amount * XP_REWARDS.healingPerHp);
    });
  }
  return true;
}
