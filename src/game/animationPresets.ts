/**
 * Patrones de autoría para los timelines de animación.
 *
 * Son funciones puras que devuelven un `AnimationScript`. No son presets de
 * runtime: cada habilidad decide cuál usa y puede sustituirlos por su propio
 * array cuando necesite encadenar clips distintos.
 *
 * Los patrones reproducen el builder clásico para las formas con ventana
 * activa (melee, proyectiles con `active > 0`, haces...). Una habilidad con
 * `active: 0` puede saltarse el paso intermedio o escribir su propio script.
 */

import type { AnimationScript } from './core/animationScript';
import type { AnimationName } from './types';

/**
 * Ataque con anticipación, ventana activa y recuperación.
 *
 * - `first` → `hit` durante el `startup` (recorta anticipación si no cabe).
 * - `hit` → `return` durante `active` (mantiene la pose si sobra ventana).
 * - `return` → `last` durante `recovery`.
 */
export function attackScript(clip: AnimationName): AnimationScript {
  return [
    {
      clip,
      frames: { from: 'first', to: 'beforeHit' },
      at: 'start',
      until: 'effect',
      fit: 'trimStart'
    },
    {
      clip,
      frames: { from: 'hit', to: 'beforeReturn' },
      at: 'effect',
      until: 'castEnd',
      fit: 'trimEnd',
      hold: true
    },
    {
      clip,
      frames: { from: 'return', to: 'last' },
      at: 'castEnd',
      until: 'end',
      fit: 'trimEnd'
    }
  ];
}

/** Dash: el clip completo acompaña al desplazamiento activo. */
export function dashScript(clip: AnimationName): AnimationScript {
  return [
    {
      clip,
      at: 'effect',
      until: 'castEnd',
      fit: 'stretch',
      hold: true
    }
  ];
}

/**
 * Lanzamiento sin ventana activa (proyectiles, haces y áreas instantáneas).
 * Anticipación hasta el `HitFrame` y el resto del clip durante la recuperación.
 */
export function releaseScript(clip: AnimationName): AnimationScript {
  return [
    {
      clip,
      frames: { from: 'first', to: 'beforeHit' },
      at: 'start',
      until: 'effect',
      fit: 'trimStart'
    },
    {
      clip,
      frames: { from: 'hit', to: 'last' },
      at: 'effect',
      until: 'end',
      fit: 'trimEnd'
    }
  ];
}

/**
 * Canalización que reproduce la carga solo si la anticipación del lanzamiento
 * llega tarde. Es el equivalente exacto del builder clásico: si el `HitFrame`
 * del lanzamiento cabe en el `startup`, la carga no se dibuja.
 *
 * `release` se compone con `attackScript`, `releaseScript` o `dashScript`.
 */
export function channelFillScript(
  charge: AnimationName,
  release: AnimationScript,
  options: { mode?: 'once' | 'loop'; speed?: number } = {}
): AnimationScript {
  const releaseClip = release[0]?.clip;
  if (!releaseClip || charge === releaseClip) return release;
  return [
    {
      clip: charge,
      at: 'start',
      fill: true,
      fit: 'stretch',
      hold: true,
      mode: options.mode ?? 'once',
      speed: options.speed ?? 1
    },
    ...release
  ];
}

/**
 * Canalización: carga en bucle durante la preparación y ataque al liberar.
 * El lanzamiento empieza en el `hit`, así que el `HitFrame` cae en `effect`.
 */
export function channelScript(
  charge: AnimationName,
  release: AnimationName
): AnimationScript {
  return [
    {
      clip: charge,
      at: 'start',
      until: 'effect',
      mode: 'loop',
      speed: 1
    },
    {
      clip: release,
      frames: { from: 'hit', to: 'beforeReturn' },
      at: 'effect',
      until: 'castEnd',
      fit: 'trimEnd',
      hold: true
    },
    {
      clip: release,
      frames: { from: 'return', to: 'last' },
      at: 'castEnd',
      until: 'end',
      fit: 'trimEnd'
    }
  ];
}
