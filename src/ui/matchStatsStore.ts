import type { PlayerMatchStats } from '../game/multiplayer';

type Listener = () => void;

/**
 * Almacén externo para las estadísticas del HUD.
 *
 * El motor emite estadísticas cuatro veces por segundo. Guardarlas en el estado
 * de `PlayScreen` obligaba a re-renderizar toda la pantalla (botones, canvas,
 * modales...) en cada emisión. Con este store solo se suscriben los componentes
 * que realmente las pintan: el HUD, el marcador final y el contador de FPS.
 */
export interface MatchStatsStore {
  getSnapshot(): PlayerMatchStats[];
  setSnapshot(next: PlayerMatchStats[]): void;
  subscribe(listener: Listener): () => void;
}

const EMPTY_STATS: PlayerMatchStats[] = [];

export function createMatchStatsStore(): MatchStatsStore {
  let snapshot = EMPTY_STATS;
  const listeners = new Set<Listener>();

  return {
    getSnapshot: () => snapshot,
    setSnapshot(next) {
      snapshot = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}
