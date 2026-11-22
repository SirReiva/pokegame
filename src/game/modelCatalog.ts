/**
 * Catálogo de modelos 3D jugables.
 *
 * Cada especie con GLB en `public/models/` se registra aquí. La clave es el id
 * de Pokédex con cuatro dígitos, el mismo que usa el manifiesto de sprites
 * (`0001`, `0025`...). Las especies que no aparecen no se ofrecen en el roster:
 * el render de partida es exclusivamente 3D.
 *
 * Ajustes opcionales:
 * - `scale`: multiplicador fino sobre la escala calculada automáticamente a
 *   partir del tamaño del sprite y de la caja del modelo.
 * - `yawOffsetDeg`: corrección de orientación para modelos que no miran a +Z.
 * - `targetHeight`: altura objetivo en unidades de mundo; por defecto se usa
 *   la altura del sprite `idle` de esa especie.
 * - `moveAnimation`: clip usado al desplazarse. Por defecto `run` (trote);
 *   `idle1` usa la pose de vuelo (`defaultidle01`) para los pájaros.
 * - `moveClip`: nombre exacto del clip del GLB para el desplazamiento; tiene
 *   prioridad sobre `moveAnimation` (por ejemplo, `20010_defaultidle01`).
 */

export interface PokemonModelEntry {
  /** Ruta dentro de `public/models/`. */
  file: string;
  /** Multiplicador fino sobre la escala automática. */
  scale?: number;
  /** Corrección de orientación, en grados. */
  yawOffsetDeg?: number;
  /** Altura objetivo; si falta, se toma del manifiesto de sprites. */
  targetHeight?: number;
  /**
   * Animación de desplazamiento:
   * - `run` (por defecto): trote, `run01_loop` o `fi21_run01`.
   * - `idle1`: flotar con `defaultidle01`; pensado para los pájaros.
   */
  moveAnimation?: 'run' | 'idle1';
  /** Nombre exacto del clip del GLB que se usa al desplazarse. */
  moveClip?: string;
}

export const POKEMON_MODELS: Readonly<Record<string, PokemonModelEntry>> = {
  '0001': { file: 'pm0001/pm0001_00.glb' },
  '0002': { file: 'pm0002/pm0002_00.glb' },
  '0004': { file: 'pm0004/pm0004_00.glb' },
  '0007': { file: 'pm0007/pm0007_00.glb' },
  '0025': { file: 'pm0025/pm0025.glb' },
  '0094': { file: 'pm0094/pm0094_00.glb' },
  '0095': { file: 'pm0095/pm0095_00.glb' },
  '0100': { file: 'pm0100/pm0100_00.glb' },
  '0123': { file: 'pm0123/pm0123.glb' },
  '0130': { file: 'pm0130/pm0130.glb' },
  '0133': { file: 'pm0133/pm0133_00.glb' },
  '0144': {
    file: 'pm0144/pm0144_00.glb',
    moveAnimation: 'idle1',
    moveClip: '20010_defaultidle01'
  },
  '0145': {
    file: 'pm0145/pm0145_00.glb',
    moveAnimation: 'idle1',
    moveClip: '20010_defaultidle01'
  },
  '0146': {
    file: 'pm0146/pm0146_00.glb',
    moveAnimation: 'idle1',
    moveClip: '20011_defaultidle02'
  },
  '0150': { file: 'pm0150/pm0150_00.glb' },
  '0151': { file: 'pm0151/pm0151_00.glb' },
  '0243': { file: 'pm0243/pm0243.glb' },
  '0244': { file: 'pm0244/pm0244.glb' },
  '0245': { file: 'pm0245/pm0245.glb' },
  '0248': { file: 'pm0248/pm0248.glb' },
  '0249': {
    file: 'pm0249/pm0249.glb',
    moveAnimation: 'idle1',
    moveClip: '20001_battlewait01_loop'
  },
  '0250': {
    file: 'pm0250/pm0250.glb',
    moveAnimation: 'idle1',
    moveClip: '20010_defaultidle01'
  },
  '0251': { file: 'pm0251/pm0251_00.glb' },
  '0382': { file: 'pm0382/pm0382.glb' },
  '0383': { file: 'pm0383/pm0383_00.glb' },
  '0384': { file: 'pm0384/pm0384.glb' },
  '0448': { file: 'pm0448/pm0448.glb' }
};

export function modelEntryFor(pokemonId: string): PokemonModelEntry | null {
  return POKEMON_MODELS[pokemonId] ?? null;
}

/** `true` si la especie tiene un GLB registrado. */
export function hasPokemonModel(pokemonId: string): boolean {
  return POKEMON_MODELS[pokemonId] !== undefined;
}

/** Especies con modelo, ordenadas por id. */
export function modeledPokemonIds(): string[] {
  return Object.keys(POKEMON_MODELS).sort();
}
