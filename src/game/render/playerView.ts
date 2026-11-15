/**
 * Estado de presentación de un jugador.
 *
 * Vive fuera de `MatchPlayerState` para que la simulación no importe tipos de
 * PlayCanvas ni de canvas 2D. `MatchView` mantiene un sidecar por jugador y lo
 * consulta solo cuando sincroniza el render.
 */

import type { Actor } from '../actor';
import type { CameraRig } from '../camera';
import type { HealthBarArt } from '../healthBar';
import type { SplitRect } from '../multiplayer';
import type { ActorShadowBatch } from './actorShadows';

export interface PlayerView {
  readonly camera: CameraRig;
  readonly copies: Actor[];
  readonly bar: HealthBarArt;
  readonly viewport: SplitRect;
  /**
   * Lote de sombras del viewport. Solo lo tienen las vistas humanas: los bots
   * no dibujan su propia pantalla.
   */
  readonly shadowBatch: ActorShadowBatch | null;
}

export function createPlayerView(
  camera: CameraRig,
  bar: HealthBarArt,
  viewport: SplitRect,
  shadowBatch: ActorShadowBatch | null = null
): PlayerView {
  return { camera, copies: [], bar, viewport, shadowBatch };
}
