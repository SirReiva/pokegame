/**
 * Sincronización de las copias de los actores con el estado de simulación.
 *
 * Es la única parte del bucle de render que necesita a la vez el estado de la
 * partida y el sidecar de presentación. Se aísla aquí para que `Game` no mezcle
 * simulación, niebla y billboards en el mismo método.
 */

import type { CameraRig } from '../camera';
import { CONFIG } from '../config';
import type { DeathMarker } from '../deathMarker';
import type { MatchPlayerState } from '../matchState';
import type { PlayerView } from './playerView';

/** Cámara mínima que necesita una vista para colocar su cielo. */
interface SkyAnchor {
  setPosition(x: number, y: number, z: number): void;
}

export interface MatchViewSync {
  /** Vistas humanas, en el orden de los viewports. */
  readonly views: readonly MatchPlayerState[];
  /** Todos los combatientes, incluidos los bots. */
  readonly players: readonly MatchPlayerState[];
  /** Sidecar de presentación por jugador. */
  readonly viewsByPlayer: ReadonlyMap<MatchPlayerState, PlayerView>;
  /** Cielo propio de cada vista. */
  readonly viewSkies: ReadonlyMap<CameraRig, SkyAnchor>;
  /** Marcadores de KO por plaza y viewport. */
  readonly deathMarkers: ReadonlyMap<number, readonly (DeathMarker | null)[]>;
  /** Jugadores por plaza, para el contador de reaparición. */
  readonly playerBySlot: ReadonlyMap<number, MatchPlayerState>;
  readonly waterHeight: number;
  readonly debugHideActors: boolean;
  readonly dt: number;
}

/**
 * Actualiza posición, animación, orientación y billboard de cada copia visible.
 * Las copias ocultas por la niebla no se tocan: `updateVision` las sincroniza en
 * cuanto vuelven a mostrarse.
 */
export function syncMatchView(sync: MatchViewSync): void {
  const { viewsByPlayer, players, views } = sync;

  if (sync.debugHideActors) {
    for (const player of players) {
      const view = viewsByPlayer.get(player);
      if (!view) continue;
      for (const copy of view.copies) copy.setVisible(false);
    }
  }

  // Primero las cámaras ya están actualizadas; cada copia se orienta hacia la
  // cámara del viewport que la va a dibujar.
  views.forEach((cameraOwner, viewIndex) => {
    const cameraView = viewsByPlayer.get(cameraOwner);
    if (!cameraView) return;
    const cameraPosition = cameraView.camera.position;
    sync.viewSkies.get(cameraView.camera)?.setPosition(
      cameraPosition.x,
      cameraPosition.y,
      cameraPosition.z
    );

    for (const player of players) {
      const playerView = viewsByPlayer.get(player);
      if (!playerView) continue;
      const copy = playerView.copies[viewIndex];
      // Una copia oculta no se renderiza; su estado se sincroniza en cuanto
      // `updateVision` vuelve a mostrarla.
      if (!copy || !copy.isVisible) continue;
      copy.setPositionAndSubmerge(
        player.x,
        player.z,
        player.submerge,
        sync.waterHeight
      );
      copy.setFacing(player.facing);
      if (player.animationFrame !== null) {
        // El plan de casteo fija el frame; todas las vistas dibujan el mismo.
        copy.setManualFrame(player.animation, player.animationFrame);
      } else {
        copy.clearManual();
        copy.play(player.animation);
        copy.setPlayback(player.playback);
        copy.setLoop(true);
      }
      copy.setHitboxDebug(CONFIG.debug.showHitboxes);
      // Mientras dura el `faint` el cuerpo se va a gris; al reaparecer recupera
      // el color de inmediato. El billboard interpola la caída, así que llamar
      // cada frame no cuesta nada cuando el valor no cambia.
      copy.setDesaturation(player.alive ? 0 : 1);
      copy.update(sync.dt, cameraPosition);
    }

    // El lote de sombras de esta vista se reescribe una sola vez, cuando ya se
    // han movido todas sus copias: una subida de buffer por viewport y frame.
    cameraView.shadowBatch?.commit();

    // El retrato de la marca de KO se mantiene de pie en cada vista aunque la
    // cámara orbite alrededor del cuerpo. El centro muestra los segundos que
    // faltan para que el Pokémon vuelva a la vida.
    sync.deathMarkers.forEach((markers, slot) => {
      const marker = markers[viewIndex];
      if (!marker) return;
      marker.faceCamera(cameraPosition);
      const target = sync.playerBySlot.get(slot);
      if (target) marker.setRespawnCountdown(target.respawnTimer);
    });
  });
}
