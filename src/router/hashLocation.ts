import { useSyncExternalStore } from 'react';
import { navigate } from 'wouter/use-hash-location';

const hashPrefix = /^#?\/?/;

function currentPath(): string {
  return '/' + window.location.hash.replace(hashPrefix, '');
}

function subscribe(onChange: () => void): () => void {
  // El hook de wouter solo escucha `hashchange`, pero el historial también
  // cambia la ruta con `popstate` (atrás/adelante). Escuchamos ambos para que
  // el repintado sea inmediato.
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
