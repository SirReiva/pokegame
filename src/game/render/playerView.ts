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

export interface PlayerView {
  readonly camera: CameraRig;
  readonly copies: Actor[];
  readonly bar: HealthBarArt;
  readonly viewport: SplitRect;
}

export function createPlayerView(
  camera: CameraRig,
  bar: HealthBarArt,
  viewport: SplitRect
): PlayerView {
  return { camera, copies: [], bar, viewport };
}
