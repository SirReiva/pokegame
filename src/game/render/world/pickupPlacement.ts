/** Validación de la posición de un objeto recogible en el mapa. */

import type { Collider } from '../../core/world';
import type { PickupSpawn } from '../../items';
import type { GameMap } from '../../terrain';
import { pointBlockedByColliders } from '../../combat';

/**
 * Motivo por el que un objeto del mapa no sería alcanzable, o `null` si lo es.
 * Se comprueba con el mundo ya construido, así que cubre también los props
 * procedurales que no están declarados en el JSON.
 */
export function pickupPlacementIssue(
  map: GameMap,
  spawn: PickupSpawn,
  colliders: readonly Collider[]
): string | null {
  const cols = map.tiles[0]?.length ?? 0;
  const rows = map.tiles.length;
  const tileSize = map.tileSize;
  const halfX = (cols * tileSize) / 2;
  const halfZ = (rows * tileSize) / 2;
  if (
    !Number.isFinite(spawn.x) ||
    !Number.isFinite(spawn.z) ||
    spawn.x < -halfX ||
    spawn.x > halfX ||
    spawn.z < -halfZ ||
    spawn.z > halfZ
  ) {
    return 'fuera de los límites del mapa';
  }
  const col = Math.floor((spawn.x + halfX) / tileSize);
  const row = Math.floor((spawn.z + halfZ) / tileSize);
  if (map.tiles[row]?.[col] === 'waterHigh') {
    return 'en aguas profundas';
  }
  if (pointBlockedByColliders(spawn.x, spawn.z, colliders)) {
    return 'dentro de un obstáculo';
  }
  return null;
}
