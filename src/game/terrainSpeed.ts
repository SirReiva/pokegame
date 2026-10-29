/**
 * Efecto del terreno sobre la velocidad del Pokémon que lo atraviesa.
 *
 * La relación se resuelve con la tabla de tipos de Pokémon, usando el tipo del
 * terreno como "atacante" y los tipos del Pokémon como "defensor":
 *
 * - Terreno propio (el Pokémon comparte el tipo del terreno): ×1,18.
 * - Terreno hostil (el tipo del terreno es súper eficaz contra el Pokémon): ×0,82.
 * - Terreno cómodo (lo resiste o es inmune a él): ×1,08.
 * - Resto de combinaciones: ×1.
 *
 * Así la hierba alta favorece a Scyther, la arena frena a Pikachu, la ciénaga
 * favorece a Bulbasaur, Charmander corre por la Colada volcánica y Eevee va
 * cómodo por los carriles y la carretera. El sistema es puro: no depende de PlayCanvas y puede
 * consultarse desde cualquier módulo.
 */

import { TERRAINS, type TerrainId } from './terrain';
import { typeEffectiveness } from './typeChart';

/**
 * Relación entre el tipo del terreno y los tipos del Pokémon. La comparten la
 * velocidad (`terrainSpeed.ts`) y la ocultación (`vision.ts`) para que ambas
 * reglas cuenten la misma historia: el Pokémon que comparte tipo con el terreno
 * está en casa, el que es débil a ese tipo lo pasa mal y el que lo resiste está
 * cómodo.
 */
export type TerrainRelationReason = 'home' | 'hostile' | 'comfortable' | 'neutral';

/** Alias histórico: la velocidad fue la primera en usar esta relación. */
export type TerrainSpeedReason = TerrainRelationReason;

export const TERRAIN_SPEED_FACTOR: Record<TerrainRelationReason, number> = {
  home: 1.18,
  hostile: 0.82,
  comfortable: 1.08,
  neutral: 1
};

export interface TerrainRelation {
  /** Tipo Pokémon asociado al terreno, para poder explicarlo en la UI. */
  terrainType: string;
  reason: TerrainRelationReason;
}

/**
 * Resuelve la relación tipo-terreno usando el tipo del terreno como atacante y
 * los tipos del Pokémon como defensores:
 *
 * - `home`: el Pokémon comparte el tipo del terreno.
 * - `hostile`: el terreno es súper eficaz contra el Pokémon (×2 o más).
 * - `comfortable`: el Pokémon lo resiste o es inmune (×0,5, ×0,25 o ×0).
 * - `neutral`: cualquier otra combinación.
 */
export function terrainTypeRelation(
  terrain: TerrainId,
  pokemonTypes: readonly string[]
): TerrainRelation {
  const terrainType = TERRAINS[terrain].type;
  if (pokemonTypes.includes(terrainType)) {
    return { terrainType, reason: 'home' };
  }

  const effectiveness = typeEffectiveness(terrainType, pokemonTypes);

  if (effectiveness >= 2) return { terrainType, reason: 'hostile' };
  if (effectiveness < 1) return { terrainType, reason: 'comfortable' };
  return { terrainType, reason: 'neutral' };
}

export interface TerrainSpeedEffect {
  multiplier: number;
  reason: TerrainSpeedReason;
  /** Tipo Pokémon asociado al terreno, para poder explicarlo en la UI. */
  terrainType: string;
}

export function terrainSpeedEffect(
  terrain: TerrainId,
  pokemonTypes: readonly string[]
): TerrainSpeedEffect {
  const relation = terrainTypeRelation(terrain, pokemonTypes);
  return {
    multiplier: TERRAIN_SPEED_FACTOR[relation.reason],
    reason: relation.reason,
    terrainType: relation.terrainType
  };
}
