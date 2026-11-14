/**
 * Niebla y copias por vista.
 *
 * Resuelve los círculos de visión de cada equipo una vez por frame, pinta la
 * máscara world-space y oculta las copias que no ve cada viewport. La
 * visibilidad de combate viene resuelta por paso desde `sim/visibility`.
 */

import type { Collider } from '../core/world';
import type { Team } from '../core/team';
import type { FogMask, FogView, VisionCircle } from '../fog';
import type { MatchPlayerState } from '../matchState';
import type { PlayerView } from './playerView';

export interface VisionViewHost {
  readonly players: readonly MatchPlayerState[];
  readonly views: readonly MatchPlayerState[];
  readonly colliders: readonly Collider[];
  readonly atmosphereVision: number;
  readonly simulationStep: number;
  readonly visibleByTeam: Record<Team, ReadonlySet<number>>;
  readonly fogMasks: ReadonlyMap<Team, FogMask>;
  readonly fogViews: readonly FogView[];
  viewOf(player: MatchPlayerState): PlayerView;
  refreshCombatVisibility(): void;
  updatePickupKnowledge(colliders: readonly Collider[]): void;
}

export class VisionView {
  private readonly viewCircles: VisionCircle[][] = [];
  private readonly visionCirclePool = new Map<number, VisionCircle>();
  private readonly visionCirclesByTeam = new Map<Team, VisionCircle[]>();
  private readonly localVisionBySlot = new Map<number, VisionCircle>();
  private visibilityStep = -1;

  markRefreshed(step: number): void {
    this.visibilityStep = step;
  }

  clear(): void {
    this.viewCircles.length = 0;
    this.visionCirclePool.clear();
    for (const circles of this.visionCirclesByTeam.values()) circles.length = 0;
    this.localVisionBySlot.clear();
    this.visibilityStep = -1;
  }

  update(host: VisionViewHost, dt: number): void {
    // Fallback para la cuenta atrás, renders sin paso de simulación y pasos que
    // terminaron antes de refrescar (por ejemplo, al cerrar la partida).
    if (this.visibilityStep !== host.simulationStep) {
      host.refreshCombatVisibility();
    }

    // Círculos de visión por equipo: se calculan una vez por frame y se
    // reutilizan en todas sus vistas. Solo los Pokémon vivos aportan visión.
    for (const circles of this.visionCirclesByTeam.values()) circles.length = 0;
    this.localVisionBySlot.clear();
    for (const player of host.players) {
      if (!player.alive) continue;
      let circle = this.visionCirclePool.get(player.slot);
      if (!circle) {
        circle = { x: 0, z: 0, visionRange: 0 };
        this.visionCirclePool.set(player.slot, circle);
      }
      circle.x = player.x;
      circle.z = player.z;
      circle.visionRange =
        player.visionRange * player.visionFactor * host.atmosphereVision;
      this.localVisionBySlot.set(player.slot, circle);
      let circles = this.visionCirclesByTeam.get(player.team);
      if (!circles) {
        circles = [];
        this.visionCirclesByTeam.set(player.team, circles);
      }
      circles.push(circle);
    }
    const circlesByTeam = this.visionCirclesByTeam;
    const localCircleBySlot = this.localVisionBySlot;

    // La máscara world-space se compone una sola vez por equipo.
    const noCircles: readonly VisionCircle[] = [];
    for (const [team, mask] of host.fogMasks) {
      mask.update(circlesByTeam.get(team) ?? noCircles, dt);
    }

    host.views.forEach((observer, viewIndex) => {
      const fog = host.fogViews[viewIndex];
      const observerView = host.viewOf(observer);
      const camera = observerView.camera.entity.camera;
      const circles = this.circlesForView(
        viewIndex,
        localCircleBySlot.get(observer.slot),
        circlesByTeam.get(observer.team) ?? noCircles
      );
      if (fog && camera) {
        fog.update(
          camera,
          observerView.viewport,
          observerView.camera.yaw,
          circles
        );
      }

      const visibleSlots = host.visibleByTeam[observer.team];
      for (const target of host.players) {
        const copy = host.viewOf(target).copies[viewIndex];
        if (!copy) continue;
        // Oculto por una habilidad: desaparece también en su propia vista.
        if (target.hidden) {
          copy.setVisible(false);
          continue;
        }
        // Un KO deja ver la animación de daño un instante.
        if (!target.alive && target.deathFade <= 0) {
          copy.setVisible(false);
          continue;
        }
        if (target === observer) {
          copy.setVisible(true);
          continue;
        }
        copy.setVisible(visibleSlots.has(target.slot));
      }
    });

    host.updatePickupKnowledge(host.colliders);
  }

  /**
   * Círculos de una vista con su propio observador primero: `FogView` muestrea
   * con más detalle el primer círculo. Reutiliza el buffer de la vista.
   */
  private circlesForView(
    viewIndex: number,
    local: VisionCircle | undefined,
    teamCircles: readonly VisionCircle[]
  ): readonly VisionCircle[] {
    let circles = this.viewCircles[viewIndex];
    if (!circles) {
      circles = [];
      this.viewCircles[viewIndex] = circles;
    }
    circles.length = 0;
    if (local) circles.push(local);
    for (const circle of teamCircles) {
      if (circle !== local) circles.push(circle);
    }
    return circles;
  }
}
