/** Relación entre el tipo del terreno y los tipos del Pokémon. */

export type TerrainRelationReason =
  | 'home'
  | 'hostile'
  | 'comfortable'
  | 'neutral';

/** Alias histórico: la velocidad fue la primera en usar esta relación. */
export type TerrainSpeedReason = TerrainRelationReason;
