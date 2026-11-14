import type { TerrainRelationReason } from './terrainSpeed';

/** Ocultación efectiva de un Pokémon en un terreno concreto. */
export interface Concealment {
  /** Ocultación base del terreno (0-1). */
  base: number;
  /** Multiplicador aplicado por los tipos del Pokémon. */
  multiplier: number;
  /** Ocultación final, ya limitada por `CONFIG.vision.maxConcealment`. */
  value: number;
  reason: TerrainRelationReason;
  terrainType: string;
}
