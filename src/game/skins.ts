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
  // Con el render 3D solo existe un modelo por especie, así que los aspectos
  // alternativos de los sprites no aportan una apariencia distinta.
  return [defaultSkinFor(entry)];
}

/**
 * Resuelve un aspecto por id. El render 3D usa un único modelo por especie, así
 * que cualquier skin guardada de una versión anterior cae al aspecto normal.
 */
export function skinFor(
  entry: PokemonEntry,
  _skinId?: string | null
): PokemonSkin {
  return defaultSkinFor(entry);
}
