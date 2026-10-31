import type { ReactNode } from 'react';

/** Tecla o botón de mando dentro de los textos de ayuda. */
export function KeyPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block min-w-14.5 rounded-md border border-white/10 border-b-2 bg-white/[0.07] px-1.75 py-0.75 text-center font-mono text-10.24 text-steel-100">
      {children}
    </span>
  );
}
