import type { PlayerMatchStats } from '../game/multiplayer';

type Listener = () => void;

/**
 * Almacén externo para las estadísticas del HUD.
 *
 * El motor emite estadísticas dos veces por segundo. Guardarlas en el estado
 * de `PlayScreen` obligaba a re-renderizar toda la pantalla (botones, canvas,
 * modales...) en cada emisión. Con este store solo se suscriben los componentes
 * que realmente las pintan: la cabecera, cada `PlayerHud`, el marcador final y
 * el contador de FPS.
 *
 * Además del snapshot global hay un snapshot por plaza. Así la cabecera y los
 * jugadores se actualizan por separado: un cambio de HP en la plaza 3 no
 * vuelve a renderizar el panel de la plaza 7.
 */
export interface MatchStatsStore {
  getSnapshot(): PlayerMatchStats[];
  setSnapshot(next: PlayerMatchStats[]): void;
  subscribe(listener: Listener): () => void;
  /** Estadísticas de una plaza, o `undefined` si aún no existen. */
  getSlotSnapshot(slot: number): PlayerMatchStats | undefined;
  subscribeSlot(slot: number, listener: Listener): () => void;
}

const EMPTY_STATS: PlayerMatchStats[] = [];

export function createMatchStatsStore(): MatchStatsStore {
  let snapshot = EMPTY_STATS;
  let slots = new Map<number, PlayerMatchStats>();
  const listeners = new Set<Listener>();
  const slotListeners = new Map<number, Set<Listener>>();

  return {
    getSnapshot: () => snapshot,
    getSlotSnapshot: (slot) => slots.get(slot),
    setSnapshot(next) {
      snapshot = next;

      const nextSlots = new Map<number, PlayerMatchStats>();
      for (const entry of next) nextSlots.set(entry.slot, entry);

      // Solo avisa a las plazas cuyo objeto ha cambiado (o que han salido).
      const changedSlots = new Set<number>();
      for (const [slot, entry] of nextSlots) {
        if (slots.get(slot) !== entry) changedSlots.add(slot);
      }
      for (const slot of slots.keys()) {
        if (!nextSlots.has(slot)) changedSlots.add(slot);
      }
      slots = nextSlots;

      for (const listener of listeners) listener();
      for (const slot of changedSlots) {
        const slotSet = slotListeners.get(slot);
        if (!slotSet) continue;
        for (const listener of slotSet) listener();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    subscribeSlot(slot, listener) {
      let slotSet = slotListeners.get(slot);
      if (!slotSet) {
        slotSet = new Set();
        slotListeners.set(slot, slotSet);
      }
      slotSet.add(listener);
      return () => {
        slotSet.delete(listener);
        if (slotSet.size === 0) slotListeners.delete(slot);
      };
    }
  };
}
