import type { ReactNode } from 'react';

/** Tecla o botón de mando dentro de los textos de ayuda. */
export function KeyPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block min-w-[58px] rounded-md border border-white/10 border-b-2 bg-white/[0.07] px-[7px] py-[3px] text-center font-mono text-[0.64rem] text-[#dbe7f3]">
      {children}
    </span>
  );
}
