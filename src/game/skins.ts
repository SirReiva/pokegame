import type { PokemonEntry, PokemonSkin } from './types';

/** Identificador del aspecto normal, que no se guarda en `entry.skins`. */
export const DEFAULT_SKIN_ID = 'default';

/** Nombre visible del aspecto normal. */
export const DEFAULT_SKIN_NAME = 'Normal';

/** Construye el aspecto normal a partir de los datos base de la especie. */
export function defaultSkinFor(entry: PokemonEntry): PokemonSkin {
  return {
    id: DEFAULT_SKIN_ID,
    name: DEFAULT_SKIN_NAME,
    portrait: entry.portrait,
    animations: entry.animations,
    source: entry.source
  };
}

/** Todos los aspectos disponibles, empezando siempre por el normal. */
export function skinsFor(entry: PokemonEntry): PokemonSkin[] {
  return [defaultSkinFor(entry), ...(entry.skins ?? [])];
}

/**
 * Resuelve un aspecto por id. Si el manifiesto no lo incluye (por ejemplo, un
 * guardado antiguo), se cae al aspecto normal en vez de dejar al jugador sin
 * sprite.
 */
export function skinFor(
  entry: PokemonEntry,
  skinId?: string | null
): PokemonSkin {
  if (!skinId || skinId === DEFAULT_SKIN_ID) return defaultSkinFor(entry);
  return (
    entry.skins?.find((skin) => skin.id === skinId) ?? defaultSkinFor(entry)
  );
}
