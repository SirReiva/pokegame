/**
 * Stats base y cálculo de estadísticas para el combate.
 *
 * Se usan los valores reales de la especie y la fórmula oficial a nivel 50 con
 * IV 31 y EV 0, naturaleza neutra. Así el daño se comporta como en los juegos:
 * un Pokémon lento y frágil cae antes que un tanque, y los cambios de tipo
 * importan de verdad.
 *
 * Igual que `roster.ts` y `vision.ts`, vive fuera del manifiesto porque
 * `pnpm sprites` regenera ese archivo.
 */

export interface BaseStats {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
}

export interface CombatStats {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
}

/** Nivel de combate de toda la demo. */
export const COMBAT_LEVEL = 50;
/** IV perfecto y EV 0: el estándar de un Pokémon recién criado. */
const IV = 31;
const EV = 0;

export const POKEDEX_STATS: Record<string, BaseStats> = {
  '0001': { hp: 45, attack: 49, defense: 49, spAttack: 65, spDefense: 65, speed: 45 }, // Bulbasaur
  '0004': { hp: 39, attack: 52, defense: 43, spAttack: 60, spDefense: 50, speed: 65 }, // Charmander
  '0007': { hp: 44, attack: 48, defense: 65, spAttack: 50, spDefense: 64, speed: 43 }, // Squirtle
  '0025': { hp: 35, attack: 55, defense: 40, spAttack: 50, spDefense: 50, speed: 90 }, // Pikachu
  '0094': { hp: 60, attack: 65, defense: 60, spAttack: 130, spDefense: 75, speed: 110 }, // Gengar
  '0100': { hp: 40, attack: 30, defense: 50, spAttack: 55, spDefense: 55, speed: 100 }, // Voltorb
  '0133': { hp: 55, attack: 55, defense: 50, spAttack: 45, spDefense: 65, speed: 55 }, // Eevee
  '0448': { hp: 70, attack: 110, defense: 70, spAttack: 115, spDefense: 70, speed: 90 }, // Lucario
  '0658': { hp: 72, attack: 95, defense: 67, spAttack: 103, spDefense: 71, speed: 122 }, // Greninja
  '0150': { hp: 106, attack: 110, defense: 90, spAttack: 154, spDefense: 90, speed: 130 }, // Mewtwo
  '0151': { hp: 100, attack: 100, defense: 100, spAttack: 100, spDefense: 100, speed: 100 }, // Mew
  '0095': { hp: 35, attack: 45, defense: 160, spAttack: 30, spDefense: 45, speed: 70 }, // Onix
  '0123': { hp: 70, attack: 110, defense: 80, spAttack: 55, spDefense: 80, speed: 105 }, // Scyther
  '0248': { hp: 100, attack: 134, defense: 110, spAttack: 95, spDefense: 100, speed: 61 }, // Tyranitar
  '0144': { hp: 90, attack: 85, defense: 100, spAttack: 95, spDefense: 125, speed: 85 }, // Articuno
  '0145': { hp: 90, attack: 90, defense: 85, spAttack: 125, spDefense: 90, speed: 100 }, // Zapdos
  '0146': { hp: 90, attack: 100, defense: 90, spAttack: 125, spDefense: 85, speed: 90 }, // Moltres
  '0243': { hp: 90, attack: 85, defense: 75, spAttack: 115, spDefense: 100, speed: 115 }, // Raikou
  '0244': { hp: 115, attack: 115, defense: 85, spAttack: 90, spDefense: 75, speed: 100 }, // Entei
  '0245': { hp: 100, attack: 75, defense: 115, spAttack: 90, spDefense: 115, speed: 85 }, // Suicune
  '0249': { hp: 106, attack: 90, defense: 130, spAttack: 90, spDefense: 154, speed: 110 }, // Lugia
  '0250': { hp: 106, attack: 130, defense: 90, spAttack: 110, spDefense: 154, speed: 90 }, // Ho-Oh
  '0251': { hp: 100, attack: 100, defense: 100, spAttack: 100, spDefense: 100, speed: 100 } // Celebi
};

/** Valores neutros para una especie desconocida (no debería ocurrir). */
export const DEFAULT_BASE_STATS: BaseStats = {
  hp: 60,
  attack: 60,
  defense: 60,
  spAttack: 60,
  spDefense: 60,
  speed: 60
};

/** HP y stats finales a nivel 50 con IV 31 y EV 0. */
export function combatStatsFor(base: BaseStats): CombatStats {
  const stat = (value: number) =>
    Math.floor(((2 * value + IV + Math.floor(EV / 4)) * COMBAT_LEVEL) / 100) + 5;
  return {
    hp:
      Math.floor(((2 * base.hp + IV + Math.floor(EV / 4)) * COMBAT_LEVEL) / 100) +
      COMBAT_LEVEL +
      10,
    attack: stat(base.attack),
    defense: stat(base.defense),
    spAttack: stat(base.spAttack),
    spDefense: stat(base.spDefense),
    speed: stat(base.speed)
  };
}

export function baseStatsFor(pokemonId: string): BaseStats {
  return POKEDEX_STATS[pokemonId] ?? DEFAULT_BASE_STATS;
}
