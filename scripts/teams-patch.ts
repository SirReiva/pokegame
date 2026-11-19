/**
 * Parche de estadísticas/velocidad/hurtbox/habilidades para los arneses de
 * balance. Vive en `scripts/` para que lo compartan el runner secuencial y el
 * paralelo con Piscina.
 *
 * No modifica archivos: muta las tablas en memoria del proceso o worker.
 */

import { ABILITIES, MOVESETS, type AbilityId } from '../src/game/abilities';
import { POKEDEX_STATS, type BaseStats } from '../src/game/pokedex';
import { POKEMON_HIT_RADIUS, POKEMON_SPEEDS } from '../src/game/roster';

export type StatKey = keyof BaseStats;

export interface AbilityPatch {
  power?: number;
  cooldown?: number;
  healSelf?: number;
  range?: number;
  radius?: number;
  halfAngle?: number;
  startup?: number;
  active?: number;
  recovery?: number;
  repeatCooldown?: { step?: number; max?: number; resetAfter?: number };
}

export interface TeamsPatch {
  stats?: {
    global?: Partial<Record<StatKey, number>>;
    species?: Record<string, Partial<Record<StatKey, number>>>;
    absolute?: Record<string, Partial<BaseStats>>;
  };
  speed?: Record<string, number>;
  hitRadius?: Record<string, number>;
  abilities?: Record<string, AbilityPatch>;
  /** Sustituye el moveset completo de una especie (4 slots). */
  movesets?: Record<string, Array<AbilityId | null>>;
}

let appliedKey: string | null = null;

/**
 * Aplica el parche una sola vez por proceso/worker. Piscina reutiliza workers,
 * así que sin esta guarda los multiplicadores se acumularían.
 */
export function applyTeamsPatch(patch: TeamsPatch | null): string[] {
  if (!patch) return [];
  const key = JSON.stringify(patch);
  if (appliedKey === key) return [];
  if (appliedKey !== null) {
    throw new Error('Este proceso ya aplicó otro parche; usa un pool nuevo');
  }
  appliedKey = key;

  const changed: string[] = [];
  const global = patch.stats?.global ?? {};
  for (const id of Object.keys(POKEDEX_STATS)) {
    const original = POKEDEX_STATS[id];
    const species = patch.stats?.species?.[id] ?? {};
    const next: BaseStats = {
      hp: Math.round(original.hp * (global.hp ?? 1) * (species.hp ?? 1)),
      attack: Math.round(original.attack * (global.attack ?? 1) * (species.attack ?? 1)),
      defense: Math.round(original.defense * (global.defense ?? 1) * (species.defense ?? 1)),
      spAttack: Math.round(
        original.spAttack * (global.spAttack ?? 1) * (species.spAttack ?? 1)
      ),
      spDefense: Math.round(
        original.spDefense * (global.spDefense ?? 1) * (species.spDefense ?? 1)
      ),
      speed: original.speed
    };
    Object.assign(next, patch.stats?.absolute?.[id] ?? {});
    if (JSON.stringify(next) !== JSON.stringify(original)) changed.push(`stat:${id}`);
    POKEDEX_STATS[id] = next;
  }

  for (const [id, value] of Object.entries(patch.speed ?? {})) {
    if (POKEMON_SPEEDS[id] !== undefined) {
      POKEMON_SPEEDS[id] = value;
      changed.push(`speed:${id}`);
    }
  }
  for (const [id, value] of Object.entries(patch.hitRadius ?? {})) {
    if (POKEMON_HIT_RADIUS[id] !== undefined) {
      POKEMON_HIT_RADIUS[id] = value;
      changed.push(`hit:${id}`);
    }
  }

  for (const [id, fields] of Object.entries(patch.abilities ?? {})) {
    const ability = ABILITIES[id];
    if (!ability) {
      console.warn(`Habilidad desconocida: ${id}`);
      continue;
    }
    let touched = false;
    if (fields.power !== undefined) {
      ability.props.power = fields.power;
      touched = true;
    }
    if (fields.cooldown !== undefined) {
      ability.cooldown = fields.cooldown;
      touched = true;
    }
    if (fields.healSelf !== undefined) {
      ability.healSelf = fields.healSelf;
      touched = true;
    }
    for (const key of ['range', 'radius', 'halfAngle', 'startup', 'active', 'recovery'] as const) {
      if (fields[key] !== undefined) {
        (ability as unknown as Record<string, number>)[key] = fields[key]!;
        touched = true;
      }
    }
    if (fields.repeatCooldown) {
      ability.repeatCooldown = {
        ...(ability.repeatCooldown ?? { step: 0, max: 0, resetAfter: 0 }),
        ...fields.repeatCooldown
      };
      touched = true;
    }
    if (touched) changed.push(`ability:${id}`);
  }

  for (const [id, moves] of Object.entries(patch.movesets ?? {})) {
    if (moves.length !== 4) {
      throw new Error(`El moveset de ${id} debe tener 4 slots`);
    }
    MOVESETS[id] = moves as [
      AbilityId | null,
      AbilityId | null,
      AbilityId | null,
      AbilityId | null
    ];
    changed.push(`moveset:${id}`);
  }

  return changed;
}

/** Solo para tests: olvida la guarda de aplicación. */
export function resetTeamsPatchGuard(): void {
  appliedKey = null;
}
