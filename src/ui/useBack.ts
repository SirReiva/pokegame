import { useCallback } from 'react';

/**
 * Vuelve a la pantalla anterior sin guardar el origen en la URL.
 * Si no hay historial (enlace directo), navega al fallback.
 */
export function useBack(fallback = '/'): () => void {
  return useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.hash = fallback;
    }
  }, [fallback]);
}
