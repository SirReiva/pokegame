import { useEffect, useState, type CSSProperties } from 'react';
import type { AnimationName, PokemonEntry } from '../game/types';

interface SpritePreviewProps {
  entry: PokemonEntry;
  animation?: AnimationName;
  row?: number;
  height?: number;
  paused?: boolean;
  className?: string;
}

/**
 * Previsualización de una hoja de sprites usando CSS.
 * Reproduce la animación respetando las duraciones del manifiesto.
 */
export function SpritePreview({
  entry,
  animation = 'idle',
  row = 0,
  height = 96,
  paused = false,
  className
}: SpritePreviewProps) {
  const anim = entry.animations[animation];
  const [playback, setPlayback] = useState({ anim, frame: 0 });

  // Si cambia la animación mostramos el frame 0 sin provocar un render extra.
  const frame = playback.anim === anim ? playback.frame : 0;

  useEffect(() => {
    if (paused || anim.columns <= 1) return;

    let cancelled = false;
    let timer = 0;
    let index = 0;

    const schedule = () => {
      const ticks = anim.durations[index] ?? 6;
      const delay = Math.max(70, (ticks / 60) * 1000);
      timer = window.setTimeout(() => {
        if (cancelled) return;
        index = (index + 1) % anim.columns;
        setPlayback({ anim, frame: index });
        schedule();
      }, delay);
    };

    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [anim, paused]);

  const scale = height / anim.frameHeight;
  const safetyRow = Math.min(Math.max(row, 0), anim.rows - 1);
  const sheetWidth = anim.frameWidth * anim.columns;
  const sheetHeight = anim.frameHeight * anim.rows;

  const style: CSSProperties = {
    width: Math.round(anim.frameWidth * scale),
    height: Math.round(anim.frameHeight * scale),
    backgroundImage: `url(${anim.sheet})`,
    backgroundSize: `${Math.round(sheetWidth * scale)}px ${Math.round(sheetHeight * scale)}px`,
    backgroundPosition: `${-Math.round(frame * anim.frameWidth * scale)}px ${-Math.round(
      safetyRow * anim.frameHeight * scale
    )}px`
  };

  return (
    <span
      className={className ? `sprite-preview ${className}` : 'sprite-preview'}
      style={style}
      role="img"
      aria-label={`${entry.name} en animación ${animation === 'idle' ? 'de reposo' : 'de caminar'}`}
    />
  );
}
