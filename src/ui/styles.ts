/** Clases de Tailwind compartidas por varias pantallas. */
export const eyebrow =
  'block font-mono text-[0.66rem] tracking-[0.19em] uppercase text-muted';

const stepPill = 'rounded-full border px-[9px] py-[5px] font-mono text-[0.64rem] tracking-[0.09em] uppercase';

export const stepIdle = `${stepPill} border-line text-[#6f8298]`;
export const stepActive = `${stepPill} border-accent bg-accent text-[#0b1118]`;
export const stepDone = `${stepPill} border-accent/40 text-[#a9bccf]`;
