import { useSyncExternalStore } from 'react';
import { navigate } from 'wouter/use-hash-location';

const hashPrefix = /^#?\/?/;

function currentPath(): string {
  return '/' + window.location.hash.replace(hashPrefix, '');
}

function subscribe(onChange: () => void): () => void {
  // El hook de wouter solo escucha `hashchange`, pero al retroceder entre
  // entradas que también cambian la query (por ejemplo `?map=...`) el navegador
  // únicamente emite `popstate`. Escuchamos ambos para que atrás/adelante repinte.
  window.addEventListener('hashchange', onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
    window.removeEventListener('popstate', onChange);
  };
}

export function useHashLocation(): [string, typeof navigate] {
  const path = useSyncExternalStore(subscribe, currentPath, () => '/');
  return [path, navigate];
}

useHashLocation.hrefs = (href: string) => `#${href}`;
