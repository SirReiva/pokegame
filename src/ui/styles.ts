/** Clases de Tailwind compartidas por varias pantallas. */
export const eyebrow =
  'block font-mono text-10.56 tracking-[0.19em] uppercase text-muted';

const stepPill = 'rounded-full border px-2.25 py-[5px] font-mono text-10.24 tracking-[0.09em] uppercase';

export const stepIdle = `${stepPill} border-line text-steel-800`;
export const stepActive = `${stepPill} border-accent bg-accent text-ink-dark-soft`;
export const stepDone = `${stepPill} border-accent/40 text-steel-350`;
