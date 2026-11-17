/**
 * Estadísticas de combate del rediseño (balance v1.1).
 *
 * Escala propia, no la oficial de los juegos:
 * - PV de referencia 1.000.
 * - AF/AE/DF/DE con media 100 en el roster.
 * - VEL en unidades por segundo; `roster.ts` la consume para el movimiento.
 * - VIS en unidades de radio; `vision.ts` la consume para la niebla de guerra.
 *
 * Con 100 de ataque y 100 de defensa, `D ≈ B` en la fórmula de `combat.ts`.
 * `balance.md` es la fuente canónica: si estos valores cambian, hay que
 * actualizar el documento y volver a pasar la simulación.
 */

export interface BaseStats {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
}

export type CombatStats = BaseStats;

/** Roles de diseño. El principal manda; el secundario matiza la identidad. */
export type CombatRole =
  | 'Tanque'
  | 'Luchador'
  | 'Asesino'
  | 'Mago'
  | 'Hostigador'
  | 'Apoyo';

export interface CombatProfile {
  stats: BaseStats;
  /** Radio de visión en unidades de mundo. */
  vision: number;
  role: CombatRole;
  secondaryRole: CombatRole;
}

/**
 * Fichas finales de balance v1.1. Arcanine (0059) entra como Pokémon 28 y sus
 * datos viven aquí aunque todavía no tenga hojas de sprite: así el día que se
 * importen no hay que tocar el núcleo.
 */
export const POKEDEX_PROFILES: Record<string, CombatProfile> = {
  '0001': { stats: { hp: 1000, attack: 70, defense: 90, spAttack: 115, spDefense: 100, speed: 4.6 }, vision: 8.8, role: 'Apoyo', secondaryRole: 'Mago' }, // Bulbasaur
  '0004': { stats: { hp: 1000, attack: 95, defense: 85, spAttack: 120, spDefense: 90, speed: 5.8 }, vision: 9.5, role: 'Luchador', secondaryRole: 'Hostigador' }, // Charmander
  '0007': { stats: { hp: 1200, attack: 75, defense: 115, spAttack: 105, spDefense: 105, speed: 5.2 }, vision: 9.2, role: 'Tanque', secondaryRole: 'Apoyo' }, // Squirtle
  '0025': { stats: { hp: 900, attack: 100, defense: 75, spAttack: 125, spDefense: 80, speed: 6.9 }, vision: 11, role: 'Asesino', secondaryRole: 'Mago' }, // Pikachu
  '0059': { stats: { hp: 1100, attack: 120, defense: 105, spAttack: 70, spDefense: 90, speed: 6.4 }, vision: 11, role: 'Luchador', secondaryRole: 'Tanque' }, // Arcanine
  '0094': { stats: { hp: 900, attack: 70, defense: 75, spAttack: 150, spDefense: 90, speed: 7.6 }, vision: 10.8, role: 'Asesino', secondaryRole: 'Mago' }, // Gengar
  '0095': { stats: { hp: 1350, attack: 90, defense: 135, spAttack: 40, spDefense: 75, speed: 4.6 }, vision: 8.8, role: 'Tanque', secondaryRole: 'Luchador' }, // Onix
  '0100': { stats: { hp: 1000, attack: 80, defense: 80, spAttack: 120, spDefense: 85, speed: 8.2 }, vision: 9.5, role: 'Hostigador', secondaryRole: 'Mago' }, // Voltorb
  '0123': { stats: { hp: 900, attack: 120, defense: 70, spAttack: 45, spDefense: 75, speed: 7.2 }, vision: 10.8, role: 'Asesino', secondaryRole: 'Hostigador' }, // Scyther
  '0130': { stats: { hp: 1150, attack: 125, defense: 105, spAttack: 60, spDefense: 85, speed: 6.2 }, vision: 10.2, role: 'Luchador', secondaryRole: 'Tanque' }, // Gyarados
  '0133': { stats: { hp: 1050, attack: 105, defense: 95, spAttack: 95, spDefense: 95, speed: 6.1 }, vision: 9.5, role: 'Hostigador', secondaryRole: 'Luchador' }, // Eevee
  '0144': { stats: { hp: 950, attack: 60, defense: 85, spAttack: 140, spDefense: 105, speed: 6.8 }, vision: 11.6, role: 'Mago', secondaryRole: 'Apoyo' }, // Articuno
  '0145': { stats: { hp: 950, attack: 65, defense: 85, spAttack: 135, spDefense: 100, speed: 7.6 }, vision: 11.8, role: 'Mago', secondaryRole: 'Hostigador' }, // Zapdos
  '0146': { stats: { hp: 900, attack: 105, defense: 75, spAttack: 120, spDefense: 85, speed: 7.0 }, vision: 11.5, role: 'Mago', secondaryRole: 'Asesino' }, // Moltres
  '0150': { stats: { hp: 950, attack: 70, defense: 80, spAttack: 155, spDefense: 105, speed: 7.8 }, vision: 12, role: 'Mago', secondaryRole: 'Asesino' }, // Mewtwo
  '0151': { stats: { hp: 1000, attack: 95, defense: 95, spAttack: 110, spDefense: 100, speed: 7.0 }, vision: 11, role: 'Apoyo', secondaryRole: 'Mago' }, // Mew
  '0243': { stats: { hp: 900, attack: 120, defense: 70, spAttack: 80, spDefense: 80, speed: 7.7 }, vision: 11.9, role: 'Asesino', secondaryRole: 'Hostigador' }, // Raikou
  '0244': { stats: { hp: 1200, attack: 130, defense: 105, spAttack: 85, spDefense: 90, speed: 6.0 }, vision: 10.4, role: 'Luchador', secondaryRole: 'Mago' }, // Entei
  '0245': { stats: { hp: 1100, attack: 70, defense: 105, spAttack: 120, spDefense: 115, speed: 7.0 }, vision: 11.6, role: 'Apoyo', secondaryRole: 'Tanque' }, // Suicune
  '0248': { stats: { hp: 1250, attack: 100, defense: 110, spAttack: 70, spDefense: 90, speed: 4.5 }, vision: 9.6, role: 'Tanque', secondaryRole: 'Luchador' }, // Tyranitar
  '0249': { stats: { hp: 1300, attack: 70, defense: 115, spAttack: 110, spDefense: 125, speed: 7.5 }, vision: 12.4, role: 'Tanque', secondaryRole: 'Apoyo' }, // Lugia
  '0250': { stats: { hp: 1200, attack: 100, defense: 100, spAttack: 105, spDefense: 115, speed: 6.9 }, vision: 11.9, role: 'Apoyo', secondaryRole: 'Luchador' }, // Ho-Oh
  '0251': { stats: { hp: 950, attack: 60, defense: 85, spAttack: 135, spDefense: 110, speed: 7.1 }, vision: 11.7, role: 'Apoyo', secondaryRole: 'Mago' }, // Celebi
  '0382': { stats: { hp: 1050, attack: 60, defense: 90, spAttack: 140, spDefense: 120, speed: 5.9 }, vision: 12.2, role: 'Mago', secondaryRole: 'Apoyo' }, // Kyogre
  '0383': { stats: { hp: 1400, attack: 115, defense: 140, spAttack: 70, spDefense: 80, speed: 5.6 }, vision: 10.6, role: 'Tanque', secondaryRole: 'Luchador' }, // Groudon
  '0384': { stats: { hp: 1050, attack: 130, defense: 90, spAttack: 120, spDefense: 90, speed: 7.6 }, vision: 12.6, role: 'Mago', secondaryRole: 'Asesino' }, // Rayquaza
  '0448': { stats: { hp: 1050, attack: 120, defense: 90, spAttack: 115, spDefense: 85, speed: 6.5 }, vision: 10.5, role: 'Luchador', secondaryRole: 'Asesino' }, // Lucario
  '0658': { stats: { hp: 950, attack: 115, defense: 75, spAttack: 120, spDefense: 85, speed: 7.4 }, vision: 11.5, role: 'Asesino', secondaryRole: 'Hostigador' } // Greninja
};

/** Valores neutros para una especie desconocida (no debería ocurrir). */
export const DEFAULT_BASE_STATS: BaseStats = {
  hp: 1000,
  attack: 100,
  defense: 100,
  spAttack: 100,
  spDefense: 100,
  speed: 5.4
};

/**
 * En el rediseño no hay fórmula de nivel: las fichas ya son los valores de
 * combate. La función se mantiene para no romper a los consumidores que
 * construyen el estado del jugador.
 */
export function combatStatsFor(base: BaseStats): CombatStats {
  return { ...base };
}

export function baseStatsFor(pokemonId: string): BaseStats {
  return POKEDEX_PROFILES[pokemonId]?.stats ?? DEFAULT_BASE_STATS;
}

export function roleForPokemon(pokemonId: string): CombatProfile | null {
  return POKEDEX_PROFILES[pokemonId] ?? null;
}
