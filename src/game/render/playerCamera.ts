/** Cámara de un jugador: giro, zoom y yaw compartido con la simulación. */

import type { CameraRig } from '../camera';
import { CONFIG } from '../config';
import type { DeviceInputSnapshot } from '../input';
import type { MatchPlayerState } from '../matchState';

export function updatePlayerCamera(
  camera: CameraRig,
  player: MatchPlayerState,
  input: DeviceInputSnapshot,
  dt: number
): void {
  camera.addYaw(input.pointerYaw);
  if (input.wheel !== 0) {
    camera.addZoom(-input.wheel * CONFIG.camera.wheelStep);
  }
  camera.update(dt, player, input.cameraX, input.zoom);
  // La simulación (incluidos los bots) solo ve un número, no `CameraRig`.
  player.cameraYaw = camera.yaw;
}
