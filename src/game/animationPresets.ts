/**
 * Patrones de autoría para los timelines de animación.
 *
 * Son funciones puras que devuelven un `AnimationScript`. No son presets de
 * runtime: cada habilidad decide cuál usa y puede sustituirlos por su propio
 * array cuando necesite encadenar clips distintos.
 *
 * Los patrones hablan en marcas del clip 3D (`impact`, `followThrough`, `end`),
 * no en frames de sprite. Así funcionan igual con clips de distinta duración y
 * el `impact` visual cae siempre en el instante de efecto del gameplay.
 */

import type { AnimationScript } from './core/animationScript';
import type { AnimationName } from './types';

/**
 * Ataque con anticipación, ventana activa y recuperación.
 *
 * - `start` → `impact` durante el `startup` (alinea el impacto y recorta
 *   anticipación si no cabe).
 * - `impact` → `followThrough` durante `active` (mantiene la pose si sobra
 *   ventana).
 * - `followThrough` → `end` durante `recovery`.
 */
export function attackScript(clip: AnimationName): AnimationScript {
  return [
    {
      clip,
      frames: { from: 'start', to: 'impact' },
      at: 'start',
      until: 'effect',
      fit: 'alignImpact'
    },
    {
      clip,
      frames: { from: 'impact', to: 'followThrough' },
      at: 'effect',
      until: 'castEnd',
      fit: 'trimEnd',
      hold: 'impact'
    },
    {
      clip,
      frames: { from: 'followThrough', to: 'end' },
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
      hold: 'end'
    }
  ];
}

/**
 * Lanzamiento sin ventana activa (proyectiles, haces y áreas instantáneas).
 * Anticipación hasta el impacto y el resto del clip durante la recuperación.
 */
export function releaseScript(clip: AnimationName): AnimationScript {
  return [
    {
      clip,
      frames: { from: 'start', to: 'impact' },
      at: 'start',
      until: 'effect',
      fit: 'alignImpact'
    },
    {
      clip,
      frames: { from: 'impact', to: 'end' },
      at: 'effect',
      until: 'end',
      fit: 'trimEnd'
    }
  ];
}

/**
 * Canalización que reproduce la carga solo si la anticipación del lanzamiento
 * llega tarde. Si el impacto del lanzamiento cabe en el `startup`, la carga no
 * se dibuja.
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
      hold: 'end',
      mode: options.mode ?? 'once',
      speed: options.speed ?? 1
    },
    ...release
  ];
}

/**
 * Canalización: carga en bucle durante la preparación y ataque al liberar.
 * El lanzamiento empieza en el impacto, así que cae en `effect`.
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
      frames: { from: 'impact', to: 'followThrough' },
      at: 'effect',
      until: 'castEnd',
      fit: 'trimEnd',
      hold: 'impact'
    },
    {
      clip: release,
      frames: { from: 'followThrough', to: 'end' },
      at: 'castEnd',
      until: 'end',
      fit: 'trimEnd'
    }
  ];
}
