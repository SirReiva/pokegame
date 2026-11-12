import { useSyncExternalStore, type ComponentProps } from 'react';
import { MatchHud } from './MatchHud';
import type { MatchStatsStore } from './matchStatsStore';

type MatchHudHostProps = Omit<ComponentProps<typeof MatchHud>, 'stats'> & {
  statsStore: MatchStatsStore;
};

/**
 * Suscribe el HUD al store de estadísticas sin arrastrar a `PlayScreen`.
 *
 * `useSyncExternalStore` devuelve la misma referencia mientras no llegue una
 * emisión nueva, así que el resto de la pantalla no se vuelve a renderizar a
 * 4 Hz. El HUD en sí sigue actualizándose con cada snapshot.
 */
export function MatchHudHost({ statsStore, ...props }: MatchHudHostProps) {
  const stats = useSyncExternalStore(
    statsStore.subscribe,
    statsStore.getSnapshot,
    statsStore.getSnapshot
  );
  return <MatchHud {...props} stats={stats} />;
}
