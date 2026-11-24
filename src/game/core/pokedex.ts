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
  '0001': { hp: 58, attack: 53, defense: 60, spAttack: 78, spDefense: 70, speed: 45 }, // Bulbasaur
  '0004': { hp: 46, attack: 56, defense: 48, spAttack: 67, spDefense: 54, speed: 65 }, // Charmander
  '0007': { hp: 51, attack: 52, defense: 72, spAttack: 56, spDefense: 64, speed: 43 }, // Squirtle
  '0025': { hp: 50, attack: 61, defense: 52, spAttack: 58, spDefense: 56, speed: 90 }, // Pikachu
  '0094': { hp: 56, attack: 65, defense: 60, spAttack: 122, spDefense: 75, speed: 110 }, // Gengar
  '0100': { hp: 62, attack: 36, defense: 62, spAttack: 65, spDefense: 68, speed: 100 }, // Voltorb
  '0133': { hp: 55, attack: 55, defense: 50, spAttack: 45, spDefense: 65, speed: 55 }, // Eevee
  '0448': { hp: 77, attack: 121, defense: 76, spAttack: 127, spDefense: 70, speed: 90 }, // Lucario
  '0658': { hp: 78, attack: 95, defense: 72, spAttack: 103, spDefense: 76, speed: 122 }, // Greninja
  '0150': { hp: 106, attack: 110, defense: 90, spAttack: 154, spDefense: 90, speed: 130 }, // Mewtwo
  '0151': { hp: 94, attack: 100, defense: 95, spAttack: 100, spDefense: 95, speed: 100 }, // Mew
  '0232': { hp: 90, attack: 120, defense: 120, spAttack: 60, spDefense: 60, speed: 50 }, // Donphan
  '0095': { hp: 60, attack: 55, defense: 175, spAttack: 34, spDefense: 60, speed: 70 }, // Onix
  '0123': { hp: 70, attack: 110, defense: 80, spAttack: 55, spDefense: 80, speed: 105 }, // Scyther
  '0130': { hp: 90, attack: 125, defense: 76, spAttack: 60, spDefense: 100, speed: 81 }, // Gyarados
  '0248': { hp: 100, attack: 134, defense: 110, spAttack: 95, spDefense: 100, speed: 61 }, // Tyranitar
  '0144': { hp: 90, attack: 85, defense: 100, spAttack: 95, spDefense: 125, speed: 85 }, // Articuno
  '0145': { hp: 90, attack: 90, defense: 85, spAttack: 125, spDefense: 90, speed: 100 }, // Zapdos
  '0146': { hp: 90, attack: 100, defense: 86, spAttack: 117, spDefense: 85, speed: 90 }, // Moltres
  '0243': { hp: 90, attack: 85, defense: 75, spAttack: 115, spDefense: 100, speed: 115 }, // Raikou
  '0244': { hp: 115, attack: 115, defense: 85, spAttack: 90, spDefense: 75, speed: 100 }, // Entei
  '0245': { hp: 82, attack: 75, defense: 107, spAttack: 90, spDefense: 95, speed: 85 }, // Suicune
  '0249': { hp: 106, attack: 90, defense: 130, spAttack: 90, spDefense: 154, speed: 110 }, // Lugia
  '0250': { hp: 94, attack: 130, defense: 85, spAttack: 110, spDefense: 145, speed: 90 }, // Ho-Oh
  '0251': { hp: 116, attack: 108, defense: 110, spAttack: 115, spDefense: 112, speed: 100 }, // Celebi
  '0382': { hp: 72, attack: 98, defense: 76, spAttack: 136, spDefense: 101, speed: 90 }, // Kyogre
  '0383': { hp: 100, attack: 150, defense: 140, spAttack: 100, spDefense: 90, speed: 90 }, // Groudon
  '0384': { hp: 98, attack: 145, defense: 85, spAttack: 145, spDefense: 85, speed: 95 } // Rayquaza
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
