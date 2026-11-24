/**
 * Resolución de un golpe de habilidad.
 *
 * Inmunidad de tipo, sonido, slow, control, fórmula de daño, clima, escudo,
 * estadísticas, XP, KO y curación por impacto. El host aporta los avisos y las
 * reglas que ya viven en `Game`.
 */

import type { AbilityDef, BuffStat, SlowSpec, StatusSpec } from '../abilities';
import {
  atmosphereIncomingMultiplier,
  atmosphereMoveMultiplier,
  atmosphereShapeMultiplier,
  type AtmosphereId
} from '../atmosphere';
import type { CombatFxPort } from '../core/ports/fx';
import { isChannelingCast } from '../core/abilities/movement';
import type {
  ActiveDamageStatus,
  ActiveStatus,
  HealOnHitToken,
  MatchPlayerState
} from '../matchState';
import { statusPokemonType } from '../core/abilities/specs';
import { computeDamage, rollCritical, rollRandomFactor } from '../combat';
import { applyHealSelf } from '../effects';
import { typeEffectiveness, type PokemonType } from '../core/typeChart';
import { XP_REWARDS, type XpSource } from '../xp';
import { breakRegen } from './status';

export interface DamageOptions {
  power?: number;
  control?: boolean;
  cancel?: boolean;
  hitstun?: number;
  knockback?: number | null;
  slow?: SlowSpec | null;
  /** Estado. `null` lo desactiva. Por defecto, `def.props.status`. */
  status?: StatusSpec | null;
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
  /** Recalcula la velocidad tras aplicar o quitar una congelación. */
  refreshSlowMultiplier(target: MatchPlayerState): void;
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
    source: MatchPlayerState,
    /** Tipo del estado en un tick de daño en el tiempo; null en daño directo. */
    dotType?: PokemonType | null
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

/** Intervalo por defecto entre ticks de un estado. */
const DEFAULT_STATUS_INTERVAL = 1;

/** `true` si el estado activo reparte daño por tick. */
function isDamageStatusActive(
  status: ActiveStatus
): status is ActiveDamageStatus {
  return status.kind === 'poisoned' || status.kind === 'burned';
}

/** Intervalo efectivo de un estado que lo declare. */
function statusInterval(status: StatusSpec): number {
  if ('interval' in status && status.interval !== undefined && status.interval > 0) {
    return status.interval;
  }
  return DEFAULT_STATUS_INTERVAL;
}

/**
 * Aplica un estado al objetivo.
 *
 * Solo puede haber una instancia por `kind`: reaplicar el mismo estado
 * reemplaza la anterior. El primer tick de daño se resuelve en el siguiente
 * paso de simulación, no dentro del golpe que lo aplica.
 */
export function applyStatus(
  host: DamageSystemHost,
  target: MatchPlayerState,
  source: MatchPlayerState,
  spec: StatusSpec,
  abilityName: string,
  color: readonly [number, number, number]
): void {
  if (!target.alive || spec.duration <= 0) return;
  removeStatus(target, spec.kind);
  const interval = statusInterval(spec);

  switch (spec.kind) {
    case 'poisoned':
    case 'burned': {
      if (spec.damage <= 0) return;
      target.statuses.push({
        kind: spec.kind,
        damage: spec.damage,
        interval,
        remaining: spec.duration,
        nextTick: 0,
        source,
        abilityName
      });
      break;
    }
    case 'frozen': {
      target.statuses.push({
        kind: 'frozen',
        multiplier: spec.multiplier,
        remaining: spec.duration,
        source,
        abilityName
      });
      host.refreshSlowMultiplier(target);
      break;
    }
    case 'asleep': {
      target.statuses.push({
        kind: 'asleep',
        remaining: spec.duration,
        source,
        abilityName
      });
      // Dormirse corta el casteo en curso y el dash: no puede seguir actuando.
      host.interruptWithRefund(target, false);
      target.dash = null;
      break;
    }
    case 'paralyzed': {
      target.statuses.push({
        kind: 'paralyzed',
        extraCooldown: spec.extraCooldown,
        mode: spec.mode,
        interval,
        remaining: spec.duration,
        nextTick: 0,
        source,
        abilityName
      });
      // `once` cobra al entrar; `overtime` empieza en el siguiente paso y
      // repite cada intervalo.
      if (spec.mode === 'once' && spec.extraCooldown > 0) {
        addCooldownPenalty(target, spec.extraCooldown);
      }
      break;
    }
  }
  host.combatFx.spawnBuff(target.x, target.z, color, 0.8);
}

/** Quita la instancia activa de un estado, si existe. */
export function removeStatus(
  target: MatchPlayerState,
  kind: ActiveStatus['kind']
): void {
  const index = target.statuses.findIndex((status) => status.kind === kind);
  if (index < 0) return;
  target.statuses.splice(index, 1);
}

/** Suma segundos extra a las habilidades que ya están en enfriamiento. */
function addCooldownPenalty(target: MatchPlayerState, amount: number): void {
  if (amount <= 0) return;
  for (let index = 0; index < target.cooldowns.length; index++) {
    if (target.cooldowns[index] <= 0.0001) continue;
    target.cooldowns[index] += amount;
    target.cooldownPenalties[index] =
      (target.cooldownPenalties[index] ?? 0) + amount;
  }
}

/**
 * Resuelve un tick de daño en el tiempo. Es daño fijo: no aplica STAB,
 * crítico, efectividad, armadura de casteo ni hitstun. Protección sí lo
 * reduce, y cada tick corta la regeneración pasiva.
 */
function applyDamageStatusTick(
  host: DamageSystemHost,
  target: MatchPlayerState,
  status: ActiveDamageStatus
): void {
  if (!target.alive || target.invulnerableTimer > 0) return;

  const reduction =
    target.damageReductionTimer > 0 ? target.damageReduction : 0;
  const finalDamage = Math.max(1, Math.round(status.damage * (1 - reduction)));
  const lethal = finalDamage >= target.hp;
  const appliedDamage = Math.min(finalDamage, target.hp);

  host.showDamagePopup(
    target,
    finalDamage,
    false,
    1,
    lethal,
    status.source,
    statusPokemonType(status)
  );
  target.hp = Math.max(0, target.hp - finalDamage);
  target.damageTaken += appliedDamage;
  if (status.source.team !== target.team) {
    status.source.damageDealt += appliedDamage;
  }
  host.awardCombatXp(
    status.source,
    target,
    appliedDamage,
    status.damage,
    finalDamage
  );
  breakRegen(target);
  host.vibrateOnDamage(target, appliedDamage);
  if (target.hp <= 0) {
    host.knockOut(target, status.source, status.abilityName);
  }
}

/**
 * Avanza los estados activos: ticks de daño, parálisis `overtime`, duración de
 * los estados y compactado de la lista. Corre una vez por paso de simulación.
 */
export function stepStatuses(
  players: readonly MatchPlayerState[],
  dt: number,
  host: DamageSystemHost,
  isMatchOver: () => boolean
): void {
  for (const player of players) {
    if (player.statuses.length === 0) continue;
    if (!player.alive) {
      player.statuses.length = 0;
      continue;
    }

    const hadFrozen = player.statuses.some(
      (status) => status.kind === 'frozen'
    );
    let count = 0;
    for (const status of player.statuses) {
      if (isMatchOver()) {
        player.statuses.length = 0;
        return;
      }

      // Los ticks vencidos se cobran antes de avanzar los temporizadores.
      if (isDamageStatusActive(status)) {
        while (status.nextTick <= 0 && status.remaining > 0) {
          status.nextTick += status.interval;
          applyDamageStatusTick(host, player, status);
          if (!player.alive || isMatchOver()) break;
        }
        status.nextTick -= dt;
      } else if (status.kind === 'paralyzed' && status.mode === 'overtime') {
        while (status.nextTick <= 0 && status.remaining > 0) {
          status.nextTick += status.interval;
          addCooldownPenalty(player, status.extraCooldown);
          if (isMatchOver()) break;
        }
        status.nextTick -= dt;
      }

      status.remaining -= dt;
      if (player.alive && status.remaining > 0) {
        player.statuses[count++] = status;
      }
    }
    player.statuses.length = count;
    // Una congelación que expira deja de ralentizar en el mismo paso.
    if (hadFrozen) host.refreshSlowMultiplier(player);
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
  // `movementDuringCast` bloqueado convierte el casteo en una canalización: el
  // lanzador queda clavado y cualquier impacto la corta.
  const channeling = cast ? isChannelingCast(cast.def) : false;
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
  const power = options.power ?? def.props.power;
  const damaging = power > 0 && def.category !== 'status';
  const control = options.control ?? true;
  const cancel = options.cancel ?? control;
  const hitstun =
    options.hitstun ?? (control ? def.props.hitstun : 0);
  const knockback =
    options.knockback === undefined
      ? control
        ? def.props.knockback
        : 0
      : options.knockback ?? 0;
  const slow = options.slow === undefined ? def.props.slow : options.slow;
  const status = options.status === undefined ? def.props.status : options.status;

  // La efectividad solo escala el daño: ningún tipo anula ya el golpe
  // completo, así que el estado y el control se aplican igual.
  const effectiveness = typeEffectiveness(def.type, target.types);
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
    if (status && target.alive) {
      applyStatus(host, target, attacker, status, def.name, def.color);
    }
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

  // Un golpe directo despierta al objetivo antes de aplicar el estado nuevo.
  removeStatus(target, 'asleep');

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

  // El estado se aplica después del golpe: un objetivo que muere no lo recibe.
  if (status && target.alive) {
    applyStatus(host, target, attacker, status, def.name, def.color);
  }

  // `healOnHit` se resuelve aquí, en el único punto donde un golpe resta vida.
  if (def.props.healOnHit && options.healToken && !options.healToken.healed) {
    options.healToken.healed = true;
    applyHealSelf(attacker, def, host.combatFx, (healed, amount) => {
      host.showHealPopup(healed, amount, attacker);
      host.awardXp(healed, 'healing', amount * XP_REWARDS.healingPerHp);
    });
  }
  return true;
}
