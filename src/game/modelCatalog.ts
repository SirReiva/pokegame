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
  // Pikachu es pequeño en el sprite, pero su GLB tiene la cola muy larga y la
  // huella horizontal inflaba la escala automática. Se ajusta a mano para que
  // quede por debajo de Mewtwo o Lucario, como en el manifiesto.
  '0025': { file: 'pm0025/pm0025.glb', scale: 0.6 },
  '0094': { file: 'pm0094/pm0094_00.glb', scale: 0.85 },
  // Onix es una serpiente de piedra enorme: se reduce para que su volumen no
  // tape a los rivales en combate.
  '0095': { file: 'pm0095/pm0095_00.glb', scale: 0.55 },
  '0100': { file: 'pm0100/pm0100_00.glb' },
  '0123': { file: 'pm0123/pm0123.glb' },
  '0130': { file: 'pm0130/pm0130.glb', scale: 0.7 },
  '0133': { file: 'pm0133/pm0133_00.glb' },
  // El trío de aves legendarias se ajusta al mismo tamaño relativo.
  '0144': {
    file: 'pm0144/pm0144_00.glb',
    scale: 0.8,
    moveAnimation: 'idle1',
    moveClip: '20010_defaultidle01'
  },
  '0145': {
    file: 'pm0145/pm0145_00.glb',
    scale: 0.8,
    moveAnimation: 'idle1',
    moveClip: '20010_defaultidle01'
  },
  '0146': {
    file: 'pm0146/pm0146_00.glb',
    scale: 0.8,
    moveAnimation: 'idle1',
    moveClip: '20011_defaultidle02'
  },
  // Mewtwo se veía pequeño frente a otros legendarios: +25 % sobre la escala
  // automática del manifiesto.
  '0150': { file: 'pm0150/pm0150_00.glb', scale: 1.25 },
  '0151': { file: 'pm0151/pm0151_00.glb' },
  '0243': { file: 'pm0243/pm0243.glb' },
  '0244': { file: 'pm0244/pm0244.glb' },
  '0245': { file: 'pm0245/pm0245.glb' },
  '0248': { file: 'pm0248/pm0248.glb' },
  '0249': {
    file: 'pm0249/pm0249.glb',
    scale: 0.8,
    moveAnimation: 'idle1',
    moveClip: '20001_battlewait01_loop'
  },
  '0250': {
    file: 'pm0250/pm0250.glb',
    scale: 0.6,
    moveAnimation: 'idle1',
    moveClip: '20010_defaultidle01'
  },
  '0251': { file: 'pm0251/pm0251_00.glb', scale: 0.65 },
  // Kyogre es un coloso marino: se reduce para compensar su gran huella.
  '0382': { file: 'pm0382/pm0382.glb', scale: 0.6 },
  '0383': { file: 'pm0383/pm0383_00.glb', scale: 0.8 },
  '0384': { file: 'pm0384/pm0384.glb' },
  '0448': { file: 'pm0448/pm0448.glb' },
  // Greninja viene de Sketchfab (CC-BY, Mariokart07). El atlas hornea la escala
  // de bind en la geometría, así que su caja ya está en unidades de mundo; se
  // reduce a mano para que no domine a los rivales en combate.
  '0658': { file: 'pm0658/pm0658.glb', scale: 0.7 }
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
