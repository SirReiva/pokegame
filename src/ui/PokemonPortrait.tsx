import type { PokemonEntry } from '../game/types';

interface PokemonPortraitProps {
  entry: PokemonEntry;
  height?: number;
  className?: string;
}

/**
 * Retrato normal de PMD Sprite Collab para las interfaces HTML.
 * El mundo 3D sigue usando las hojas animadas desde `entry.animations`.
 */
export function PokemonPortrait({ entry, height = 64, className }: PokemonPortraitProps) {
  return (
    <img
      src={entry.portrait}
      alt={entry.name}
      width={height}
      height={height}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={className ? `pokemon-portrait ${className}` : 'pokemon-portrait'}
      style={{ width: height, height }}
    />
  );
}
