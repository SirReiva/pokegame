/**
 * Ciclo de vida del mapa: construir el mundo, cambiar de mapa y limpiar el
 * anterior.
 *
 * `Game` conserva el estado (mundo, cámara de menú, objetos y atmósfera) y este
 * módulo aplica el orden de creación/destrucción. El troceado del suelo y del
 * mundo se mantiene igual: el llamador decide en qué tramo de la barra cae cada
 * fase mediante `onProgress`.
 */

import * as pc from 'playcanvas';
import type { AtmosphereId } from '../atmosphere';
import { CameraRig } from '../camera';
import { CONFIG } from '../config';
import type { PickupSpawn } from '../items';
import { syncTeamsWithMap } from '../multiplayer';
import { PickupField, type ItemTextureMap } from '../pickups';
import { pickupPlacementIssue } from '../render/world/pickupPlacement';
import { mapRegions, setActiveMap, type GameMap } from '../terrain';
import {
  cachedGroundCanvasAsync,
  groundTextureSize
} from '../textures';
import { buildWorldAsync, type World } from '../world';

/** Estado del mundo que `Game` conserva entre cargas de mapa. */
export interface MapRuntimeHost {
  readonly app: pc.AppBase;
  /** El juego se destruyó: la carga en curso debe descartarse. */
  readonly disposed: boolean;
  /** Texturas de los objetos, cargadas una vez por partida. */
  readonly itemTextures: ItemTextureMap;

  /**
   * Identificador de la carga de mapa en curso. Si el jugador cambia de mapa
   * mientras se pinta el anterior, el resultado viejo se descarta.
   */
  mapLoadToken: number;
  world: World;
  pickups: PickupField | null;
  menuCamera: CameraRig;
  /** Punto al que orbita la cámara de menú (el `spawn` del mundo visible). */
  menuFocus: { x: number; z: number };
  /** Objetos que superaron la validación de posición y se ofrecen a los bots. */
  pickupSpawns: readonly PickupSpawn[];
  activeMapId: string;
  /** Clima de la partida; se sortea en `startMatch`. */
  atmosphere: AtmosphereId;
  /** Factor de visión del clima, cacheado para no recalcularlo por observador. */
  atmosphereVision: number;
  /** Acumulador del daño residual (arena, granizo). */
  atmosphereTick: number;

  /** Destruye la partida anterior sin tocar el mundo ni los objetos. */
  clearMatch(): void;
  /** Reconstruye los oclusores de niebla del mundo activo. */
  rebuildSightOccluders(): void;
  /** Rehornea el shadow map del sol si hay sombras activas. */
  refreshSunShadows(): void;
  /** Primer render del mundo nuevo mientras la pantalla de carga sigue visible. */
  render(): void;
}

/**
 * Reemplaza el mundo actual por el mapa indicado. Se usa al arrancar y
 * destruye la partida anterior para no dejar entidades ni materiales del mapa
 * anterior.
 *
 * El suelo se pinta antes de tocar el mundo actual y de forma troceada, así
 * que la pestaña responde durante la generación. El mundo se construye con su
 * mapa explícito, sin depender del estado global, así que la misma ruta sirve
 * para cambiar de mapa sin recrear el motor.
 *
 * `onProgress` recibe fracciones de 0 a 1 de la generación completa (suelo y
 * mundo). El llamador decide en qué tramo de la barra cae cada fase.
 */
export async function applyMap(
  host: MapRuntimeHost,
  map: GameMap,
  onProgress?: (fraction: number, label: string) => void
): Promise<boolean> {
  const token = ++host.mapLoadToken;
  const device = host.app.graphicsDevice;
  // `mapRegions` cachea por objeto de mapa: `setActiveMap` lo reutiliza abajo
  // en vez de volver a recorrer la rejilla.
  const zones = mapRegions(map).terrain;
  const isCancelled = () => host.disposed || token !== host.mapLoadToken;

  const groundCanvas = await cachedGroundCanvasAsync(
    groundTextureSize(map, {
      maxTexels: CONFIG.performance.groundTexturePixels,
      maxSize: Math.min(device.maxTextureSize, 8192)
    }),
    { map, zones },
    {
      onProgress: (fraction) =>
        onProgress?.(fraction * 0.8, 'Generando el suelo'),
      isCancelled
    }
  );
  // Otro cambio de mapa tomó el relevo (o se destruyó el juego).
  if (!groundCanvas || isCancelled()) return false;

  // El mundo nuevo se construye por secciones, con su mapa explícito y en una
  // raíz aparte: el mapa anterior sigue visible y respondiendo mientras tanto,
  // y el estado global del terreno todavía describe el mapa viejo.
  const world = await buildWorldAsync(
    host.app,
    { map, groundCanvas },
    {
      onProgress: (fraction) =>
        onProgress?.(0.8 + fraction * 0.2, 'Construyendo el escenario'),
      isCancelled
    }
  );
  if (!world || host.disposed || token !== host.mapLoadToken) {
    world?.dispose();
    return false;
  }

  host.clearMatch();
  host.pickups?.dispose();
  host.pickups = null;
  host.menuCamera?.dispose();
  host.world?.dispose();

  // Solo ahora, con el mundo nuevo ya construido, se activa el mapa. Así
  // ningún frame intermedio ve el terreno del mapa nuevo bajo la geometría
  // del anterior. `setActiveMap` reutiliza las regiones ya cacheadas.
  setActiveMap(map);
  syncTeamsWithMap();

  host.atmosphere = 'clear';
  host.atmosphereVision = 1;
  host.atmosphereTick = 0;
  host.world = world;
  // Los objetos se validan contra el mundo ya construido: un centro fuera de
  // los límites, en agua profunda o dentro de un collider (muro, roca, árbol,
  // base...) no se crea y tampoco se ofrece a los bots.
  host.pickupSpawns = map.pickups.filter((spawn) => {
    const issue = pickupPlacementIssue(
      map,
      spawn,
      host.world?.colliders ?? []
    );
    if (issue) {
      console.warn(
        `[items] Se descarta ${spawn.type} en (${spawn.x}, ${spawn.z}): ${issue}.`
      );
      return false;
    }
    return true;
  });
  host.pickups = new PickupField(
    host.app,
    host.world.shadowMaterial,
    host.itemTextures
  );
  host.pickups.setMap(host.pickupSpawns);
  host.activeMapId = map.id;
  host.rebuildSightOccluders();
  host.menuFocus = { x: map.spawn.x, z: map.spawn.z };
  host.menuCamera = new CameraRig(host.app, map.spawn);
  host.refreshSunShadows();
  // Primer render del mundo mientras la pantalla de carga sigue visible. El
  // primer frame de un mundo nuevo compila los shaders de sus materiales y
  // sube sus texturas a la GPU; en software se ha medido ~300 ms, y si la
  // carga termina después de la intro, ese tirón caía al empezar la partida.
  // Hacerlo aquí lo deja detrás del overlay y deja el primer frame jugable
  // limpio. Es un render extra, no un cambio de lógica.
  if (!host.disposed) host.render();
  return true;
}
