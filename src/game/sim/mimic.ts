/**
 * Mímica de Mew.
 *
 * Mew no tiene una habilidad propia de daño: copia la última habilidad no
 * definitiva que haya visto de un rival y la relanza con su geometría original
 * al 70 % de potencia y duración. El registro es una lista corta y ordenada por
 * tiempo; no necesita estructuras por jugador.
 */

import { baseAbilityId, type AbilityDef } from '../abilities';
import type { MarkBurstSpec } from '../core/combat/status';
import type { MarkSpec } from '../core/abilities/specs';
import type { Team } from '../core/team';
import type { MatchPlayerState } from '../matchState';

/** Ventana en la que una habilidad sigue siendo copiable. */
export const MIMIC_LOOKBACK_SECONDS = 6;
/** Alcance con el que Mew considera que ha «visto» la habilidad. */
export const MIMIC_RANGE = 12;
/** Tiempo que la copia queda guardada antes de lanzarse. */
export const MIMIC_STORE_SECONDS = 8;
/** Potencia y duración del eco copiado. */
export const MIMIC_POWER_SCALE = 0.7;

/** Habilidades que Mímica no puede copiar por diseño. */
const NON_COPYABLE = new Set(['mimica', 'adaptacion']);

interface MimicRecord {
  def: AbilityDef;
  team: Team;
  x: number;
  z: number;
  at: number;
}

/** ¿Se puede copiar esta habilidad desde este slot? */
export function canMimicAbility(def: AbilityDef, slotIndex: number): boolean {
  if (slotIndex < 0 || slotIndex > 2) return false;
  return !NON_COPYABLE.has(baseAbilityId(def.id));
}

/**
 * Registro de las últimas habilidades lanzadas por el roster. Guarda solo lo
 * necesario para decidir la copia; la definición se escala al lanzarla.
 */
export class MimicLog {
  private readonly records: MimicRecord[] = [];

  record(
    def: AbilityDef,
    slotIndex: number,
    caster: MatchPlayerState,
    time: number,
    players: readonly MatchPlayerState[] = []
  ): void {
    if (!canMimicAbility(def, slotIndex)) return;
    this.records.push({
      def,
      team: caster.team,
      x: caster.x,
      z: caster.z,
      at: time
    });
    // Una ventana de 6 s con 8 combatientes no necesita más de unas pocas
    // decenas de entradas; el tope evita crecer en partidas largas.
    if (this.records.length > 64) this.records.shift();

    // Mímica guarda la última habilidad vista por cada Mew enemigo. La copia
    // dura 8 s aunque el registro de «visto» solo mire los últimos 6 s.
    for (const player of players) {
      if (player.pokemonId !== '0151' || !player.alive) continue;
      if (player.team === caster.team) continue;
      if (
        Math.hypot(caster.x - player.x, caster.z - player.z) > MIMIC_RANGE
      ) {
        continue;
      }
      player.status.copiedAbility = {
        id: def.id,
        until: time + MIMIC_STORE_SECONDS
      };
    }
  }

  /** Última habilidad copiable vista por `caster`, o `null` si no hay. */
  find(caster: MatchPlayerState, time: number): AbilityDef | null {
    for (let index = this.records.length - 1; index >= 0; index--) {
      const record = this.records[index];
      if (time - record.at > MIMIC_LOOKBACK_SECONDS) break;
      if (record.team === caster.team) continue;
      if (
        Math.hypot(record.x - caster.x, record.z - caster.z) > MIMIC_RANGE
      ) {
        continue;
      }
      return record.def;
    }
    return null;
  }

  clear(): void {
    this.records.length = 0;
  }
}

function scaleMultiplier(multiplier: number): number {
  return 1 + (multiplier - 1) * MIMIC_POWER_SCALE;
}

function scaleBurst(burst: MarkBurstSpec): MarkBurstSpec {
  return {
    ...burst,
    damage:
      burst.damage === undefined
        ? undefined
        : Math.round(burst.damage * MIMIC_POWER_SCALE),
    healSelf:
      burst.healSelf === undefined
        ? undefined
        : burst.healSelf * MIMIC_POWER_SCALE,
    slow: burst.slow
      ? {
          ...burst.slow,
          duration: burst.slow.duration * MIMIC_POWER_SCALE
        }
      : undefined,
    root:
      burst.root === undefined ? undefined : burst.root * MIMIC_POWER_SCALE,
    silence:
      burst.silence === undefined
        ? undefined
        : burst.silence * MIMIC_POWER_SCALE,
    antiHeal: burst.antiHeal
      ? {
          fraction: burst.antiHeal.fraction * MIMIC_POWER_SCALE,
          duration: burst.antiHeal.duration * MIMIC_POWER_SCALE
        }
      : undefined,
    buff: burst.buff
      ? {
          ...burst.buff,
          multiplier: scaleMultiplier(burst.buff.multiplier),
          duration: burst.buff.duration * MIMIC_POWER_SCALE
        }
      : undefined
  };
}

function scaleMark(mark: MarkSpec): MarkSpec {
  return {
    ...mark,
    duration: mark.duration * MIMIC_POWER_SCALE,
    burst: scaleBurst(mark.burst)
  };
}

/**
 * Copia una habilidad al 70 %. La geometría (alcance, radio, ángulos) y la
 * armadura se conservan; la potencia, las duraciones y los efectos sí se
 * reducen. El enfriamiento no se toca: lo pone el slot de Mímica.
 */
export function scaleCopiedAbility(def: AbilityDef): AbilityDef {
  const scale = MIMIC_POWER_SCALE;
  return {
    ...def,
    name: `Mímica · ${def.name}`,
    power: def.power * scale,
    startup: def.startup * scale,
    active: def.active * scale,
    recovery: def.recovery * scale,
    aoeDuration: def.aoeDuration * scale,
    aoeTickInterval: def.aoeTickInterval * scale,
    knockback: def.knockback * scale,
    selfDamage: def.selfDamage * scale,
    healSelf: def.healSelf * scale,
    shieldPool: def.shieldPool * scale,
    slow: def.slow
      ? { ...def.slow, duration: def.slow.duration * scale }
      : null,
    dot: def.dot
      ? {
          ...def.dot,
          power: def.dot.power * scale,
          duration: def.dot.duration * scale
        }
      : null,
    marks: def.marks.map(scaleMark),
    root: def.root * scale,
    silence: def.silence * scale,
    antiHeal: def.antiHeal
      ? {
          fraction: def.antiHeal.fraction * scale,
          duration: def.antiHeal.duration * scale
        }
      : null,
    buffs: def.buffs.map((buff) => ({
      ...buff,
      multiplier: scaleMultiplier(buff.multiplier),
      duration: buff.duration * scale
    }))
  };
}
