/**
 * Selección de efectos de sonido para una partida.
 *
 * Vive fuera de `audio.ts` para poder probarlo sin PlayCanvas: el módulo real
 * carga assets y crea instancias, pero esta función es una proyección pura de
 * `MOVESETS` sobre las rutas de `abilitySounds`.
 *
 * Antes se precargaban los 73 MP3 del catálogo en cada partida. Con un roster
 * de 8 especies solo pueden sonar sus 4 habilidades, el instinto común de cada
 * jugador y los impactos genéricos; el resto se pide bajo demanda en el primer
 * casteo.
 */

import { baseAbilityId, MOVESETS } from './abilities';
import { ABILITY_CAST_SOUNDS, HIT_SOUNDS } from './abilitySounds';
import type { CommonAbilityId } from './core/abilities/common';

export interface AudioRosterEntry {
  pokemonId: string;
  /** Instinto común elegido; `regeneracion` no tiene sonido de casteo. */
  commonAbilityId?: CommonAbilityId;
}

/**
 * Instintos que se precargan siempre: `proteccion` también es el sonido del
 * bloqueo de armadura (`playArmorBlock`), aunque nadie lo haya elegido.
 */
const ALWAYS_PRELOADED_ABILITIES = ['proteccion', 'impulso'] as const;

/** Rutas relativas a `public/audio/sfx/` que pueden sonar en esta partida. */
export function sfxPathsForRoster(
  roster: readonly AudioRosterEntry[]
): string[] {
  const paths = new Set<string>();

  // Los impactos no dependen de la especie ni del moveset.
  for (const path of Object.values(HIT_SOUNDS)) paths.add(path);

  for (const abilityId of ALWAYS_PRELOADED_ABILITIES) {
    const path = ABILITY_CAST_SOUNDS[abilityId];
    if (path) paths.add(path);
  }

  for (const entry of roster) {
    for (const abilityId of MOVESETS[entry.pokemonId] ?? []) {
      const path = abilityId
        ? ABILITY_CAST_SOUNDS[baseAbilityId(abilityId)]
        : undefined;
      if (path) paths.add(path);
    }
    const commonPath = entry.commonAbilityId
      ? ABILITY_CAST_SOUNDS[entry.commonAbilityId]
      : undefined;
    if (commonPath) paths.add(commonPath);
  }

  return [...paths];
}
