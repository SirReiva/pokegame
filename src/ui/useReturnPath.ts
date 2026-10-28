import { useSearch } from 'wouter';

/**
 * Ruta a la que debe volver una pantalla secundaria (`/opciones`, `/editor`).
 * Se pasa como `?from=/lobby` para no depender del historial del navegador.
 */
export function useReturnPath(fallback = '/'): string {
  const search = useSearch();
  const from = new URLSearchParams(search).get('from');
  if (!from || !from.startsWith('/') || from.startsWith('//')) return fallback;
  return from;
}
