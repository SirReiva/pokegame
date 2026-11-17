/**
 * Runtime de estados avanzados: DoT, marcas, raíces, silencios, anti-heal,
 * escudos, explosiones retardadas y zonas.
 *
 * Las estructuras viven en `core/combat/status.ts`; este módulo las muta y
 * llama al host para el daño, la curación y los efectos que dependen del motor.
 * No conoce PlayCanvas ni React.
 */

import type { BuffStat } from './abilities';
import type { DotSpec, MarkSpec } from './core/abilities/specs';
import type { Team } from './core/team';
import type { MatchPlayerState } from './matchState';
import {
  addShield,
  consumeShields,
  resistControl,
  stepControlResistance,
  type CloneInstance,
  type DelayedBurst,
  type EchoBeam,
  type MarkBurstSpec,
  type ZoneInstance
} from './core/combat/status';

export type { DotSpec, MarkSpec } from './core/abilities/specs';

export interface StatusEffectHost {
  isMatchOver(): boolean;
  now(): number;
  players(): readonly MatchPlayerState[];
  playerBySlot(slot: number): MatchPlayerState | null;
  /** Daño verdadero o de tipo ya resuelto; el host aplica PV, popup y KO. */
  damage(
    target: MatchPlayerState,
    amount: number,
    sourceSlot: number,
    sourceTeam: Team,
    label: string
  ): void;
  heal(
    target: MatchPlayerState,
    amount: number,
    sourceSlot: number,
    sourceTeam: Team
  ): void;
  applySlow(
    source: MatchPlayerState | null,
    target: MatchPlayerState,
    multiplier: number,
    duration: number
  ): void;
  applyBuff(
    target: MatchPlayerState,
    stat: BuffStat,
    multiplier: number,
    duration: number,
    source?: string
  ): void;
  /**
   * Dispara el shuriken de un clon. El host es el único que conoce el sistema
   * de proyectiles; el estado solo guarda dónde y cuándo debe replicar.
   */
  fireCloneShot(clone: CloneInstance): void;
  /** Marca visual del clon mientras espera para replicar. */
  spawnCloneVisual(clone: CloneInstance): void;
  /** Resuelve el eco de un haz cuando expira su retardo. */
  resolveEchoBeam(echo: EchoBeam): void;
}

/** Reaplica un DoT: renueva duración y potencia, no acumula instancias. */
export function applyDot(
  target: MatchPlayerState,
  spec: DotSpec,
  source: MatchPlayerState
): void {
  if (!target.alive || spec.power <= 0 || spec.duration <= 0) return;
  const type = spec.type ?? null;
  const existing = target.status.dots.find(
    (dot) => dot.id === spec.id && dot.sourceSlot === source.slot
  );
  if (existing) {
    existing.powerPerSecond = spec.power;
    existing.remaining = spec.duration;
    existing.interval = spec.interval ?? 0.5;
    existing.type = type;
    existing.sourceTeam = source.team;
    return;
  }
  target.status.dots.push({
    id: spec.id,
    sourceSlot: source.slot,
    sourceTeam: source.team,
    type,
    powerPerSecond: spec.power,
    remaining: spec.duration,
    interval: spec.interval ?? 0.5,
    accumulator: 0
  });
}

/**
 * Añade una acumulación de marca. Al llegar al máximo se encola la detonación:
 * el daño y el control se resuelven en `stepStatusEffects`, el único punto con
 * host para aplicar daño verdadero y KO.
 */
export function applyMark(
  target: MatchPlayerState,
  spec: MarkSpec,
  source: MatchPlayerState,
  now: number
): void {
  if (!target.alive) return;
  const immuneUntil = target.status.markImmunity.get(spec.id) ?? 0;
  if (immuneUntil > now) return;

  let mark = target.status.marks.find(
    (candidate) =>
      candidate.id === spec.id && candidate.sourceSlot === source.slot
  );
  if (!mark) {
    mark = {
      id: spec.id,
      sourceSlot: source.slot,
      sourceTeam: source.team,
      stacks: 0,
      maxStacks: Math.max(1, spec.maxStacks),
      remaining: spec.duration,
      duration: spec.duration,
      burst: spec.burst
    };
    target.status.marks.push(mark);
  }
  mark.stacks += 1;
  mark.remaining = spec.duration;
  mark.duration = spec.duration;
  mark.burst = spec.burst;

  if (mark.stacks >= mark.maxStacks) {
    target.status.pendingBursts.push({
      burst: mark.burst,
      sourceSlot: mark.sourceSlot,
      sourceTeam: mark.sourceTeam,
      x: target.x,
      z: target.z
    });
    const index = target.status.marks.indexOf(mark);
    if (index >= 0) target.status.marks.splice(index, 1);
    if (spec.immunityAfter && spec.immunityAfter > 0) {
      target.status.markImmunity.set(spec.id, now + spec.immunityAfter);
    }
  }
}

function triggerMarkBurst(
  target: MatchPlayerState,
  burst: MarkBurstSpec,
  source: MatchPlayerState | null,
  host: StatusEffectHost
): void {
  if (burst.damage && burst.damage > 0) {
    host.damage(
      target,
      burst.damage,
      source?.slot ?? -1,
      source?.team ?? target.team,
      'mark'
    );
  }
  if (burst.slow) {
    host.applySlow(
      source,
      target,
      burst.slow.multiplier,
      burst.slow.duration
    );
  }
  if (burst.root) {
    applyRoot(target, burst.root, source, host.now(), host.players());
  }
  if (burst.silence) {
    applySilence(target, burst.silence, source, host.now(), host.players());
  }
  if (burst.antiHeal) {
    applyAntiHeal(target, burst.antiHeal.fraction, burst.antiHeal.duration);
  }
  if (burst.buff) {
    host.applyBuff(
      target,
      burst.buff.stat,
      burst.buff.multiplier,
      burst.buff.duration
    );
  }
  if (burst.healSelf && source) {
    host.heal(
      source,
      Math.round(source.maxHp * burst.healSelf),
      source.slot,
      source.team
    );
  }
}

/**
 * Fracción de control que devuelve un personaje con Sincronía (Mew). Se
 * consulta una sola vez por control para no reaplicar el reflejo en cadena.
 */
const CONTROL_REFLECT_FRACTION: Record<string, number> = {
  '0151': 0.5
};
const CONTROL_REFLECT_COOLDOWN = 8;

/** Aura de Agua Purificadora: reduce el control fuerte de Suicune y aliados. */
const SUICUNE_AURA_RADIUS = 4.5;
const SUICUNE_CONTROL_MULTIPLIER = 0.75;

/**
 * Multiplicador de duración del control recibido. Suicune lo reduce un 25 %
 * para sí mismo y para los aliados dentro de 4,5 u. No afecta a aturdimientos:
 * solo se aplica a slows, raíces y silencios.
 */
export function controlDurationMultiplier(
  target: MatchPlayerState,
  players: readonly MatchPlayerState[] = []
): number {
  if (target.pokemonId === '0245') return SUICUNE_CONTROL_MULTIPLIER;
  for (const ally of players) {
    if (!ally.alive || ally === target) continue;
    if (ally.pokemonId !== '0245') continue;
    if (ally.team !== target.team) continue;
    if (Math.hypot(ally.x - target.x, ally.z - target.z) > SUICUNE_AURA_RADIUS) {
      continue;
    }
    return SUICUNE_CONTROL_MULTIPLIER;
  }
  return 1;
}

export function takeControlReflection(
  target: MatchPlayerState,
  source: MatchPlayerState | null,
  seconds: number,
  now: number
): number {
  const fraction = CONTROL_REFLECT_FRACTION[target.pokemonId];
  if (!fraction || !source || source === target || source.team === target.team) {
    return 0;
  }
  const state = target.status.passive;
  if (state.readyAt > now) return 0;
  state.readyAt = now + CONTROL_REFLECT_COOLDOWN;
  return seconds * fraction;
}

/**
 * Enraíza: bloquea movimiento y dash, pero no el lanzamiento de habilidades.
 * `source` permite que Sincronía devuelva la mitad al lanzador.
 */
export function applyRoot(
  target: MatchPlayerState,
  seconds: number,
  source: MatchPlayerState | null = null,
  now = 0,
  players: readonly MatchPlayerState[] = []
): void {
  if (!target.alive || seconds <= 0) return;
  // Groudon reduce las raíces un 50 % (Tierra Primigenia) y Suicune un 25 %
  // para su aura.
  const aura = controlDurationMultiplier(target, players);
  const base = seconds * aura * (target.pokemonId === '0383' ? 0.5 : 1);
  const duration = resistControl(target.status, base);
  target.status.rootTimer = Math.max(target.status.rootTimer, duration);

  const reflected = takeControlReflection(target, source, base, now);
  if (reflected > 0 && source) {
    applyRoot(source, reflected, null, now, players);
  }
}

/** Silencia: bloquea habilidades, no movimiento. */
export function applySilence(
  target: MatchPlayerState,
  seconds: number,
  source: MatchPlayerState | null = null,
  now = 0,
  players: readonly MatchPlayerState[] = []
): void {
  if (!target.alive || seconds <= 0) return;
  const base = seconds * controlDurationMultiplier(target, players);
  const duration = resistControl(target.status, base);
  target.status.silenceTimer = Math.max(target.status.silenceTimer, duration);

  const reflected = takeControlReflection(target, source, base, now);
  if (reflected > 0 && source) {
    applySilence(source, reflected, null, now, players);
  }
}

/** Programa un eco de haz; el host lo resuelve al expirar el retardo. */
export function addEchoBeam(
  caster: MatchPlayerState,
  spec: Omit<EchoBeam, 'sourceSlot' | 'sourceTeam'>
): void {
  caster.status.echoBeams.push({
    ...spec,
    sourceSlot: caster.slot,
    sourceTeam: caster.team
  });
  while (caster.status.echoBeams.length > 4) caster.status.echoBeams.shift();
}

/** Crea un clon inmóvil; reemplaza cualquier clon previo del mismo dueño. */
export function spawnClone(
  owner: MatchPlayerState,
  spec: Omit<CloneInstance, 'sourceSlot' | 'sourceTeam'>
): void {
  if (!owner.alive) return;
  owner.status.clones.length = 0;
  owner.status.clones.push({
    ...spec,
    sourceSlot: owner.slot,
    sourceTeam: owner.team
  });
}

export function applyAntiHeal(
  target: MatchPlayerState,
  fraction: number,
  duration: number
): void {
  if (!target.alive || fraction <= 0 || duration <= 0) return;
  const current = target.status.antiHeal;
  if (current) {
    current.fraction = Math.max(current.fraction, fraction);
    current.remaining = Math.max(current.remaining, duration);
    return;
  }
  target.status.antiHeal = { fraction, remaining: duration };
}

/** Añade un escudo de reserva como fracción de los PV máximos del objetivo. */
export function grantShield(
  target: MatchPlayerState,
  fraction: number,
  duration: number,
  sourceSlot: number
): void {
  if (!target.alive || fraction <= 0 || duration <= 0) return;
  addShield(
    target.status,
    target.maxHp * fraction,
    duration,
    sourceSlot,
    target.maxHp
  );
}

export function addDelayedBurst(
  caster: MatchPlayerState,
  spec: Omit<DelayedBurst, 'sourceSlot' | 'sourceTeam'>
): void {
  caster.status.delayed.push({
    ...spec,
    sourceSlot: caster.slot,
    sourceTeam: caster.team
  });
  // Tope de seguridad: no acumular explosiones indefinidamente.
  while (caster.status.delayed.length > 8) caster.status.delayed.shift();
}

export function addZone(
  caster: MatchPlayerState,
  spec: Omit<ZoneInstance, 'sourceSlot' | 'sourceTeam'>
): void {
  caster.status.zones.push({
    ...spec,
    sourceSlot: caster.slot,
    sourceTeam: caster.team
  });
  while (caster.status.zones.length > 3) caster.status.zones.shift();
}

/** Ralentización pura, sin pasar por el host ni por una habilidad concreta. */
export function applySlowStatus(
  target: MatchPlayerState,
  key: string,
  multiplier: number,
  duration: number
): void {
  if (multiplier >= 1 || duration <= 0 || !target.alive) return;
  const existing = target.slowEffects.find((effect) => effect.source === key);
  if (existing) {
    existing.multiplier = Math.min(existing.multiplier, multiplier);
    existing.remaining = Math.max(existing.remaining, duration);
  } else {
    target.slowEffects.push({ source: key, multiplier, remaining: duration });
  }
  target.slowMultiplier = target.slowEffects.reduce(
    (slowest, effect) => Math.min(slowest, effect.multiplier),
    1
  );
}

/** Buff/debuff puro sobre un jugador. */
export function applyBuffStatus(
  target: MatchPlayerState,
  stat: BuffStat,
  multiplier: number,
  duration: number,
  source?: string
): void {
  if (!target.alive || duration <= 0) return;
  if (source) {
    const existing = target.buffs.find(
      (buff) => buff.source === source && buff.stat === stat
    );
    if (existing) {
      existing.multiplier = multiplier;
      existing.duration = Math.max(existing.duration, duration);
      return;
    }
  }
  target.buffs.push({ stat, multiplier, duration, source });
}

/**
 * Avanza todos los estados. Las listas se compactan en sitio para no crear
 * arrays nuevos cada frame.
 */
export function stepStatusEffects(
  players: readonly MatchPlayerState[],
  dt: number,
  host: StatusEffectHost
): void {
  if (host.isMatchOver()) return;
  for (const player of players) {
    if (!player.alive) continue;
    const status = player.status;
    stepControlResistance(status, dt);
    if (status.copiedAbility && status.copiedAbility.until <= host.now()) {
      status.copiedAbility = null;
    }

    if (status.antiHeal) {
      status.antiHeal.remaining -= dt;
      if (status.antiHeal.remaining <= 0) status.antiHeal = null;
    }

    // Escudos: cada uno conserva su duración.
    if (status.shields.length > 0) {
      let count = 0;
      for (const shield of status.shields) {
        shield.remaining -= dt;
        if (shield.remaining > 0 && shield.amount > 0.0001) {
          status.shields[count++] = shield;
        }
      }
      status.shields.length = count;
    }

    // Daño periódico.
    if (status.dots.length > 0) {
      let count = 0;
      for (const dot of status.dots) {
        dot.remaining -= dt;
        dot.accumulator += dot.powerPerSecond * dt;
        const whole = Math.floor(dot.accumulator);
        if (whole > 0) {
          dot.accumulator -= whole;
          host.damage(
            player,
            whole,
            dot.sourceSlot,
            dot.sourceTeam,
            dot.id
          );
        }
        if (dot.remaining > 0) status.dots[count++] = dot;
      }
      status.dots.length = count;
    }

    // Marcas: caducan y se olvidan.
    if (status.marks.length > 0) {
      let count = 0;
      for (const mark of status.marks) {
        mark.remaining -= dt;
        if (mark.remaining > 0) status.marks[count++] = mark;
      }
      status.marks.length = count;
    }

    // Detonaciones de marcas que se completaron durante el frame.
    if (status.pendingBursts.length > 0) {
      for (const pending of status.pendingBursts) {
        triggerMarkBurst(
          player,
          pending.burst,
          host.playerBySlot(pending.sourceSlot),
          host
        );
      }
      status.pendingBursts.length = 0;
    }

    // Clones: cuentan atrás para replicar y luego se desvanecen.
    if (status.clones.length > 0) {
      let count = 0;
      for (const clone of status.clones) {
        clone.remaining -= dt;
        if (!clone.fired) {
          clone.shotDelay -= dt;
          if (clone.shotDelay <= 0) {
            clone.fired = true;
            host.fireCloneShot(clone);
            // Deja un instante visible tras disparar, como el clon de la ficha.
            clone.remaining = Math.min(clone.remaining, 0.18);
          }
        }
        if (clone.remaining > 0) status.clones[count++] = clone;
      }
      status.clones.length = count;
    }

    // Explosiones retardadas.
    if (status.delayed.length > 0) {
      let count = 0;
      for (const burst of status.delayed) {
        burst.delay -= dt;
        if (burst.delay > 0) {
          status.delayed[count++] = burst;
          continue;
        }
        triggerDelayed(burst, host);
      }
      status.delayed.length = count;
    }

    // Ecos de haz: repiten la línea original sin control ni marcas.
    if (status.echoBeams.length > 0) {
      let count = 0;
      for (const echo of status.echoBeams) {
        echo.delay -= dt;
        if (echo.delay > 0) {
          status.echoBeams[count++] = echo;
          continue;
        }
        host.resolveEchoBeam(echo);
      }
      status.echoBeams.length = count;
    }

    // Zonas: ralentizan rivales, aceleran aliados y pueden hacer daño.
    if (status.zones.length > 0) {
      let count = 0;
      for (const zone of status.zones) {
        zone.remaining -= dt;
        zone.tickTimer -= dt;
        if (zone.tickTimer <= 0) {
          zone.tickTimer += Math.max(0.1, zone.tickInterval);
          triggerZone(zone, host);
        }
        if (zone.remaining > 0) status.zones[count++] = zone;
      }
      status.zones.length = count;
    }
  }
}

function triggerDelayed(burst: DelayedBurst, host: StatusEffectHost): void {
  const source = host.playerBySlot(burst.sourceSlot);
  for (const target of host.players()) {
    if (!target.alive) continue;
    const distance = Math.hypot(target.x - burst.x, target.z - burst.z);
    if (distance > burst.radius + target.hitRadius) continue;
    if (target.team === burst.sourceTeam) {
      if (burst.healAllies > 0) {
        host.heal(
          target,
          Math.round(target.maxHp * burst.healAllies),
          burst.sourceSlot,
          burst.sourceTeam
        );
      }
      continue;
    }
    if (burst.damage > 0) {
      host.damage(
        target,
        burst.damage,
        burst.sourceSlot,
        burst.sourceTeam,
        burst.id
      );
    }
    if (burst.slow) {
      host.applySlow(
        source,
        target,
        burst.slow.multiplier,
        burst.slow.duration
      );
    }
  }
}

function triggerZone(zone: ZoneInstance, host: StatusEffectHost): void {
  const source = host.playerBySlot(zone.sourceSlot);
  for (const target of host.players()) {
    if (!target.alive) continue;
    const distance = Math.hypot(target.x - zone.x, target.z - zone.z);
    if (distance > zone.radius + target.hitRadius) continue;
    if (target.team === zone.sourceTeam) {
      if (zone.allySpeed > 1) {
        host.applyBuff(
          target,
          'speed',
          zone.allySpeed,
          zone.tickInterval + 0.1,
          `zone:${zone.id}:${zone.sourceSlot}`
        );
      }
      continue;
    }
    if (zone.enemySlow < 1) {
      host.applySlow(
        source,
        target,
        zone.enemySlow,
        zone.tickInterval + 0.1
      );
    }
    if (zone.damagePerSecond > 0) {
      host.damage(
        target,
        Math.round(zone.damagePerSecond * zone.tickInterval),
        zone.sourceSlot,
        zone.sourceTeam,
        zone.id
      );
    }
  }
}

/**
 * Aplica el daño de un golpe a los escudos antes que a los PV. Devuelve el daño
 * que debe entrar a la vida.
 */
export function absorbWithShields(
  target: MatchPlayerState,
  damage: number
): number {
  return consumeShields(target.status, damage);
}
