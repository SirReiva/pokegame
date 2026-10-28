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

/**
 * Filas de la tabla de tipos equivalentes a los tipos que usan los terrenos.
 * Solo se listan los valores distintos de 1; el resto se considera neutro.
 */
const TYPE_CHART: Record<string, Record<string, number>> = {
  Normal: {
    Rock: 0.5,
    Steel: 0.5,
    Ghost: 0
  },
  Bug: {
    Grass: 2,
    Psychic: 2,
    Dark: 2,
    Fire: 0.5,
    Fighting: 0.5,
    Poison: 0.5,
    Flying: 0.5,
    Ghost: 0.5,
    Steel: 0.5,
    Fairy: 0.5
  },
  Grass: {
    Water: 2,
    Ground: 2,
    Rock: 2,
    Fire: 0.5,
    Grass: 0.5,
    Poison: 0.5,
    Flying: 0.5,
    Bug: 0.5,
    Dragon: 0.5,
    Steel: 0.5
  },
  Ground: {
    Fire: 2,
    Electric: 2,
    Poison: 2,
    Rock: 2,
    Steel: 2,
    Grass: 0.5,
    Bug: 0.5,
    Flying: 0
  },
  Water: {
    Fire: 2,
    Ground: 2,
    Rock: 2,
    Water: 0.5,
    Grass: 0.5,
    Dragon: 0.5
  },
  Rock: {
    Fire: 2,
    Ice: 2,
    Flying: 2,
    Bug: 2,
    Fighting: 0.5,
    Ground: 0.5,
    Steel: 0.5
  },
  Fire: {
    Grass: 2,
    Ice: 2,
    Bug: 2,
    Steel: 2,
    Fire: 0.5,
    Water: 0.5,
    Rock: 0.5,
    Dragon: 0.5
  },
  Electric: {
    Water: 2,
    Flying: 2,
    Electric: 0.5,
    Grass: 0.5,
    Dragon: 0.5,
    Ground: 0
  },
  Ice: {
    Grass: 2,
    Ground: 2,
    Flying: 2,
    Dragon: 2,
    Fire: 0.5,
    Water: 0.5,
    Ice: 0.5,
    Steel: 0.5
  },
  Poison: {
    Grass: 2,
    Fairy: 2,
    Poison: 0.5,
    Ground: 0.5,
    Rock: 0.5,
    Ghost: 0.5,
    Steel: 0
  },
  Ghost: {
    Ghost: 2,
    Psychic: 2,
    Dark: 0.5,
    Normal: 0
  },
  Fairy: {
    Fighting: 2,
    Dragon: 2,
    Dark: 2,
    Fire: 0.5,
    Poison: 0.5,
    Steel: 0.5
  }
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

  let effectiveness = 1;
  for (const type of pokemonTypes) {
    effectiveness *= TYPE_CHART[terrainType]?.[type] ?? 1;
  }

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
