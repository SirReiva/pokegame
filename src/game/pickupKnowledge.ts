/**
 * Conocimiento de objetos por equipo.
 *
 * Cada equipo guarda un array indexado por `PickupSpawn.id`: `UNKNOWN` si no ve
 * el objeto ahora mismo, `AVAILABLE` o `USED` si lo ve y conoce su estado. Los
 * bots solo pueden consultar las entradas visibles; el resto no se rellena.
 *
 * Se usa un `Int8Array` en vez de un `Map<string, boolean>` para no crear
 * strings por frame ni recorrer objetos que el equipo no ve.
 */

import type { Team } from './core/team';
import type { PickupSpawn } from './items';
import { createTeamRecord } from './multiplayer';

export const PICKUP_UNKNOWN = 0;
export const PICKUP_AVAILABLE = 1;
export const PICKUP_USED = 2;

export type PickupKnowledge = Record<Team, Int8Array>;

/** Conocimiento vacío, compartido mientras no hay una partida cargada. */
export const EMPTY_PICKUP_KNOWLEDGE = new Int8Array(0);

export function createPickupKnowledge(size = 0): PickupKnowledge {
  return createTeamRecord(() => new Int8Array(size));
}

/** Índice estable del objeto dentro de la partida. */
export function pickupId(spawn: PickupSpawn, fallback = -1): number {
  return spawn.id ?? fallback;
}
