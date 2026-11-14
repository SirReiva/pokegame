/**
 * Estado del HUD de partida: almacén de estadísticas, atmósfera y visibilidad.
 * Las estadísticas se publican con `useSyncExternalStore` en los componentes
 * que las consumen, no en `PlayScreen`.
 */

import { useEffect, useState } from 'react';
import type { AtmosphereState } from '../../game/atmosphere';
import { createMatchStatsStore } from '../../ui/matchStatsStore';

export function useMatchHud() {
  const [statsStore] = useState(createMatchStatsStore);
  const [atmosphere, setAtmosphere] = useState<AtmosphereState | null>(null);
  const [hudVisible, setHudVisible] = useState(true);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'h' && !event.repeat) {
        setHudVisible((visible) => !visible);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return { statsStore, atmosphere, setAtmosphere, hudVisible, setHudVisible };
}
