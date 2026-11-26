/**
 * Overlay de depuración de las fases de casteo.
 *
 * Muestra, para cada jugador humano, el tiempo dentro de startup/active/
 * recovery, el tramo de clip que está dibujando la capa de acción y el
 * marcador de impacto. Se activa con `CONFIG.debug.showCastTimings`.
 */

import { segmentAt } from './castPlan';
import type { MatchPlayerState } from './matchState';
import type { AnimationName } from './types';

export interface CastDebugAnimationState {
  active: boolean;
  animation: AnimationName | null;
  weight: number;
  playing: boolean;
  time: number;
}

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

  update(
    players: readonly MatchPlayerState[],
    stateFor?: (player: MatchPlayerState) => CastDebugAnimationState | null
  ): void {
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
      const clipTime =
        player.clipTime === null ? 'auto' : `${player.clipTime.toFixed(3)}s`;
      if (segment) {
        lines.push(
          `  ${segment.animation} clip ${segment.clipStart.toFixed(3)}..${segment.clipEnd.toFixed(3)} @ ${segment.speed.toFixed(2)}x  draw ${player.actionAnimation ?? 'auto'} ${clipTime}`
        );
      } else {
        lines.push(`  (hueco) draw ${player.actionAnimation ?? 'auto'} ${clipTime}`);
      }
      const state = stateFor?.(player);
      if (state) {
        lines.push(
          `  layer ${state.active ? 'ON' : 'off'} w=${state.weight.toFixed(2)} play=${state.playing} ${state.animation ?? '-'} t=${state.time.toFixed(3)}`
        );
      }
      if (cast.plan.impactClip !== null && cast.plan.impactTime !== null) {
        lines.push(
          `  impact ${cast.plan.impactClip}@${cast.plan.impactTime.toFixed(3)}s  effect ${cast.effectAt.toFixed(2)}s${cast.fired ? ' · fired' : ''}${cast.hitStopRemaining > 0 ? ' · hitstop' : ''}`
        );
      } else {
        lines.push(`  sin impacto · efecto @ ${cast.effectAt.toFixed(2)}s${cast.fired ? ' · fired' : ''}`);
      }
    }
    this.root.textContent = lines.join('\n');
    this.root.style.display = lines.length > 0 ? 'block' : 'none';
  }

  destroy(): void {
    this.root.remove();
  }
}
