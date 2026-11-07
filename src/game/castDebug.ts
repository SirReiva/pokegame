/**
 * Overlay de depuración de las fases de casteo.
 *
 * Muestra, para cada jugador humano, el tiempo dentro de startup/active/
 * recovery, el frame manual que está dibujando el billboard y los marcadores
 * `HitFrame`/`ReturnFrame` del clip. Se activa con
 * `CONFIG.debug.showCastTimings`.
 */

import { segmentAt } from './castPlan';
import type { MatchPlayerState } from './matchState';

const STYLE = [
  'position:fixed',
  'left:8px',
  'bottom:8px',
  'z-index:9999',
  'pointer-events:none',
  'font:12px/1.35 ui-monospace,Menlo,Consolas,monospace',
  'color:#eaf2ff',
  'background:rgba(8,12,20,0.72)',
  'border:1px solid rgba(160,200,255,0.35)',
  'border-radius:6px',
  'padding:6px 8px',
  'white-space:pre',
  'max-width:46vw',
  'max-height:40vh',
  'overflow:hidden'
].join(';');

export class CastDebugOverlay {
  private readonly root: HTMLDivElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.style.cssText = STYLE;
    this.root.textContent = '';
    this.root.style.display = 'none';
    document.body.appendChild(this.root);
  }

  update(players: readonly MatchPlayerState[]): void {
    const lines: string[] = [];
    for (const player of players) {
      if (player.isBot) continue;
      const cast = player.activeCast;
      if (!cast) {
        lines.push(`${player.name} · idle`);
        continue;
      }
      const phase =
        cast.elapsed < cast.def.startup
          ? 'startup'
          : cast.elapsed < cast.plan.activeEnd
            ? 'active'
            : 'recovery';
      lines.push(
        `${player.name} · ${cast.def.id} · ${phase} ${cast.elapsed.toFixed(2)}/${cast.plan.endAt.toFixed(2)}s`
      );
      const segment = segmentAt(cast.plan, cast.elapsed);
      const frame = player.animationFrame === null ? 'auto' : player.animationFrame;
      if (segment) {
        lines.push(
          `  ${segment.animation} frames ${segment.startFrame}..${segment.endFrame} @ ${segment.playback.toFixed(2)}x  draw ${player.animation}/${frame}`
        );
      } else {
        lines.push(`  (hueco) draw ${player.animation}/${frame}`);
      }
      if (cast.plan.hitClip !== null && cast.plan.hitFrame !== null) {
        lines.push(
          `  hit ${cast.plan.hitClip}#${cast.plan.hitFrame} @ ${cast.effectAt.toFixed(2)}s${cast.fired ? ' · fired' : ''}`
        );
      } else {
        lines.push(`  sin clip de lanzamiento · efecto @ ${cast.effectAt.toFixed(2)}s${cast.fired ? ' · fired' : ''}`);
      }
    }
    this.root.textContent = lines.join('\n');
    this.root.style.display = lines.length > 0 ? 'block' : 'none';
  }

  destroy(): void {
    this.root.remove();
  }
}
