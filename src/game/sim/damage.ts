/**
 * Resolución de un golpe de habilidad.
 *
 * Inmunidad de tipo, sonido, slow, control, fórmula de daño, clima, escudo,
 * estadísticas, XP, KO y curación por impacto. El host aporta los avisos y las
 * reglas que ya viven en `Game`.
 */

import type {
  AbilityDef,
  BuffStat,
  DamageOverTimeSpec,
  SlowSpec
} from '../abilities';
import {
  atmosphereIncomingMultiplier,
  atmosphereMoveMultiplier,
  atmosphereShapeMultiplier,
  type AtmosphereId
} from '../atmosphere';
import type { CombatFxPort } from '../core/ports/fx';
import type {
  ActiveDamageOverTime,
  HealOnHitToken,
  MatchPlayerState
} from '../matchState';
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
  /** Daño en el tiempo. `null` lo desactiva. Por defecto, `def.dot`. */
  dot?: DamageOverTimeSpec | null;
  healToken?: HealOnHitToken;
  impactX?: number;
  impactZ?: number;
  sourceX?: number;
  sourceZ?: number;
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

/** Intervalo por defecto entre ticks de un daño en el tiempo. */
const DEFAULT_DOT_INTERVAL = 1;

/**
 * Aplica o refresca un daño en el tiempo sobre el objetivo.
 *
 * Solo puede haber una instancia por tipo de estado. Reaplicar el mismo tipo
 * refresca la duración, conserva el daño por tick más alto y actualiza el
 * lanzador al que se atribuye el daño posterior. El primer tick se resuelve en
 * el siguiente paso de simulación, no dentro del golpe que lo aplica.
 */
export function applyDamageOverTime(
  host: DamageSystemHost,
  target: MatchPlayerState,
  source: MatchPlayerState,
  spec: DamageOverTimeSpec,
  abilityName: string,
  color: readonly [number, number, number]
): void {
  if (!target.alive || spec.damage <= 0 || spec.duration <= 0) return;
  const interval =
    spec.interval !== undefined && spec.interval > 0
      ? spec.interval
      : DEFAULT_DOT_INTERVAL;

  const existing = target.dots.find((dot) => dot.type === spec.type);
  if (existing) {
    existing.damage = Math.max(existing.damage, spec.damage);
    existing.remaining = Math.max(existing.remaining, spec.duration);
    existing.source = source;
    existing.abilityName = abilityName;
    return;
  }

  target.dots.push({
    type: spec.type,
    damage: spec.damage,
    interval,
    remaining: spec.duration,
    nextTick: 0,
    source,
    abilityName
  });
  host.combatFx.spawnBuff(target.x, target.z, color, 0.8);
}

/**
 * Resuelve un tick de daño en el tiempo. Es daño fijo: no aplica STAB,
 * crítico, efectividad, armadura de casteo ni hitstun. Protección sí lo
 * reduce, y cada tick corta la regeneración pasiva.
 */
function applyDamageOverTimeTick(
  host: DamageSystemHost,
  target: MatchPlayerState,
  dot: ActiveDamageOverTime
): void {
  if (!target.alive || target.invulnerableTimer > 0) return;

  const reduction =
    target.damageReductionTimer > 0 ? target.damageReduction : 0;
  const finalDamage = Math.max(1, Math.round(dot.damage * (1 - reduction)));
  const lethal = finalDamage >= target.hp;
  const appliedDamage = Math.min(finalDamage, target.hp);

  host.showDamagePopup(target, finalDamage, false, 1, lethal, dot.source);
  target.hp = Math.max(0, target.hp - finalDamage);
  target.damageTaken += appliedDamage;
  if (dot.source.team !== target.team) {
    dot.source.damageDealt += appliedDamage;
  }
  host.awardCombatXp(dot.source, target, appliedDamage, dot.damage, finalDamage);
  breakRegen(target);
  host.vibrateOnDamage(target, appliedDamage);
  if (target.hp <= 0) {
    host.knockOut(target, dot.source, dot.abilityName);
  }
}

/**
 * Avanza los temporizadores de daño en el tiempo. Corre una vez por paso de
 * simulación para que el daño sea determinista y no dependa del framerate.
 */
export function stepDamageOverTime(
  players: readonly MatchPlayerState[],
  dt: number,
  host: DamageSystemHost,
  isMatchOver: () => boolean
): void {
  for (const player of players) {
    if (player.dots.length === 0) continue;
    if (!player.alive) {
      player.dots.length = 0;
      continue;
    }

    let count = 0;
    for (const dot of player.dots) {
      if (isMatchOver()) {
        player.dots.length = 0;
        return;
      }

      // Los ticks vencidos se cobran antes de avanzar los temporizadores. Un
      // estado reaplicado conserva su cadencia: el refresco no dispara un tick
      // extra por cada golpe que lo vuelve a aplicar.
      while (dot.nextTick <= 0 && dot.remaining > 0) {
        dot.nextTick += dot.interval;
        applyDamageOverTimeTick(host, player, dot);
        if (!player.alive || isMatchOver()) break;
      }

      dot.remaining -= dt;
      dot.nextTick -= dt;

      if (player.alive && dot.remaining > 0) player.dots[count++] = dot;
    }
    player.dots.length = count;
  }
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
    options.hitstun ?? (control ? def.hitstun : 0);
  const knockback =
    options.knockback === undefined
      ? control
        ? def.knockback
        : 0
      : options.knockback ?? 0;
  const slow = options.slow === undefined ? def.slow : options.slow;

  // La efectividad solo escala el daño: ningún tipo anula ya el golpe
  // completo, así que el estado y el control se aplican igual.
  const effectiveness = typeEffectiveness(def.type, target.types);
  // El impacto suena para cualquier golpe válido, también los de estado.
  host.playImpactSound(effectiveness);

  // La ralentización se aplica aunque la habilidad no haga daño.
  if (slow && target.alive) {
    host.applySlow(attacker, target, def, slow, def.color);
  }

  // El daño en el tiempo también se aplica en habilidades de estado puras.
  const dot = options.dot === undefined ? def.dot : options.dot;
  if (dot && target.alive) {
    applyDamageOverTime(host, target, attacker, dot, def.name, def.color);
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
