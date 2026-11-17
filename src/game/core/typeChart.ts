/**
 * Tabla de tipos completa de Pokémon (generación VI en adelante) con la escala
 * de daño del juego: inmune ×0,85, resiste ×0,95 y débil ×1,05. Contra dos
 * tipos los valores se multiplican.
 *
 * Vive en el núcleo porque la usan tanto el movimiento por terreno
 * (`terrainSpeed.ts`) como el combate (`combat.ts`). Solo se listan los valores
 * distintos de 1; cualquier combinación ausente es neutra.
 */

export type PokemonType =
  | 'Normal'
  | 'Fire'
  | 'Water'
  | 'Electric'
  | 'Grass'
  | 'Ice'
  | 'Fighting'
  | 'Poison'
  | 'Ground'
  | 'Flying'
  | 'Psychic'
  | 'Bug'
  | 'Rock'
  | 'Ghost'
  | 'Dragon'
  | 'Dark'
  | 'Steel'
  | 'Fairy';

export const TYPE_CHART: Record<PokemonType, Partial<Record<PokemonType, number>>> = {
  Normal: {
    Rock: 0.95,
    Ghost: 0.85,
    Steel: 0.95
  },
  Fire: {
    Fire: 0.95,
    Water: 0.95,
    Grass: 1.05,
    Ice: 1.05,
    Bug: 1.05,
    Rock: 0.95,
    Dragon: 0.95,
    Steel: 1.05
  },
  Water: {
    Fire: 1.05,
    Water: 0.95,
    Grass: 0.95,
    Ground: 1.05,
    Rock: 1.05,
    Dragon: 0.95
  },
  Electric: {
    Water: 1.05,
    Electric: 0.95,
    Grass: 0.95,
    Ground: 0.85,
    Flying: 1.05,
    Dragon: 0.95
  },
  Grass: {
    Fire: 0.95,
    Water: 1.05,
    Grass: 0.95,
    Poison: 0.95,
    Ground: 1.05,
    Flying: 0.95,
    Bug: 0.95,
    Rock: 1.05,
    Dragon: 0.95,
    Steel: 0.95
  },
  Ice: {
    Fire: 0.95,
    Water: 0.95,
    Grass: 1.05,
    Ice: 0.95,
    Ground: 1.05,
    Flying: 1.05,
    Dragon: 1.05,
    Steel: 0.95
  },
  Fighting: {
    Normal: 1.05,
    Ice: 1.05,
    Poison: 0.95,
    Flying: 0.95,
    Psychic: 0.95,
    Bug: 0.95,
    Rock: 1.05,
    Ghost: 0.85,
    Dark: 1.05,
    Steel: 1.05,
    Fairy: 0.95
  },
  Poison: {
    Grass: 1.05,
    Poison: 0.95,
    Ground: 0.95,
    Rock: 0.95,
    Ghost: 0.95,
    Steel: 0.85,
    Fairy: 1.05
  },
  Ground: {
    Fire: 1.05,
    Electric: 1.05,
    Grass: 0.95,
    Poison: 1.05,
    Flying: 0.85,
    Bug: 0.95,
    Rock: 1.05,
    Steel: 1.05
  },
  Flying: {
    Electric: 0.95,
    Grass: 1.05,
    Fighting: 1.05,
    Bug: 1.05,
    Rock: 0.95,
    Steel: 0.95
  },
  Psychic: {
    Fighting: 1.05,
    Poison: 1.05,
    Psychic: 0.95,
    Dark: 0.85,
    Steel: 0.95
  },
  Bug: {
    Fire: 0.95,
    Grass: 1.05,
    Fighting: 0.95,
    Poison: 0.95,
    Flying: 0.95,
    Psychic: 1.05,
    Ghost: 0.95,
    Dark: 1.05,
    Steel: 0.95,
    Fairy: 0.95
  },
  Rock: {
    Fire: 1.05,
    Ice: 1.05,
    Fighting: 0.95,
    Poison: 0.95,
    Ground: 0.95,
    Flying: 1.05,
    Bug: 1.05,
    Steel: 0.95
  },
  Ghost: {
    Normal: 0.85,
    Psychic: 1.05,
    Ghost: 1.05,
    Dark: 0.95
  },
  Dragon: {
    Dragon: 1.05,
    Steel: 0.95,
    Fairy: 0.85
  },
  Dark: {
    Fighting: 0.95,
    Psychic: 1.05,
    Ghost: 1.05,
    Dark: 0.95,
    Fairy: 0.95
  },
  Steel: {
    Fire: 0.95,
    Water: 0.95,
    Electric: 0.95,
    Ice: 1.05,
    Rock: 1.05,
    Steel: 0.95,
    Fairy: 1.05
  },
  Fairy: {
    Fire: 0.95,
    Fighting: 1.05,
    Poison: 0.95,
    Dragon: 1.05,
    Dark: 1.05,
    Steel: 0.95
  }
};

/**
 * Multiplicador de un movimiento contra un Pokémon de uno o dos tipos. Es el
 * producto de la efectividad contra cada tipo, con la escala del juego: una
 * resistencia y una debilidad dobles multiplican sus valores (×0,95² ≈ ×0,90
 * y ×1,05² ≈ ×1,10).
 */
export function typeEffectiveness(
  moveType: string,
  defenderTypes: readonly string[]
): number {
  let multiplier = 1;
  for (const type of defenderTypes) {
    multiplier *= TYPE_CHART[moveType as PokemonType]?.[type as PokemonType] ?? 1;
  }
  return multiplier;
}

/** STAB: el movimiento comparte tipo con quien lo usa. */
export function isStab(moveType: string, attackerTypes: readonly string[]): boolean {
  return attackerTypes.includes(moveType);
}
