interface MatchCountdownProps {
  /** Segundos restantes; `0` mantiene el cartel de salida. */
  remaining: number;
}

/**
 * Cuenta atrás a pantalla completa antes de empezar. El motor congela la
 * simulación mientras dura, así que aquí solo hay presentación; no captura
 * clics ni teclas.
 */
export function MatchCountdown({ remaining }: MatchCountdownProps) {
  const go = remaining <= 0;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-9 flex animate-fade-in flex-col items-center justify-center gap-1 bg-night-950/45 backdrop-blur-[2px]"
      role="status"
    >
      <span className="font-mono text-11.2 tracking-[0.38em] uppercase text-steel-350">
        {go ? '¡A luchar!' : 'Comienza en'}
      </span>

      <span
        key={go ? 'go' : remaining}
        className={`animate-pop-in font-display font-extrabold leading-none tabular-nums drop-shadow-[0_12px_36px_rgb(0_0_0/0.6)] ${
          go
            ? 'text-[clamp(3.4rem,10vw,6.5rem)] tracking-[0.02em] text-accent-soft'
            : 'text-[clamp(6rem,18vw,12rem)] tracking-tighter text-ink'
        }`}
      >
        {go ? '¡YA!' : remaining}
      </span>

      {!go && (
        <span className="font-mono text-10.24 tracking-[0.24em] uppercase text-steel-550">
          Prepárate
        </span>
      )}
    </div>
  );
}
