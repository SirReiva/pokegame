interface BrandProps {
  /** Versión reducida para las cabeceras de sala y selección. */
  compact?: boolean;
}

/** Logotipo con el "botón" de Poké Ball dibujado con utilidades de Tailwind. */
export function Brand({ compact = false }: BrandProps) {
  return (
    <div className="flex items-center gap-4">
      <span
        aria-hidden="true"
        className={`relative grid flex-none place-items-center overflow-hidden border border-line-strong bg-[image:linear-gradient(150deg,#27384d,#101a26)] shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_12px_26px_rgb(0_0_0/0.45)] before:absolute before:inset-x-2 before:top-1/2 before:h-0.5 before:bg-white/[0.14] after:z-[1] after:rounded-full after:border-accent after:bg-[#0b121b] after:shadow-[0_0_22px_color-mix(in_srgb,var(--color-accent)_55%,transparent)] ${
          compact
            ? 'size-11 rounded-[13px] after:size-[15px] after:border-2'
            : 'size-[58px] rounded-[17px] after:size-5 after:border-[3px]'
        }`}
      >
        {!compact && (
          <span className="absolute top-[13px] right-[14px] size-[5px] animate-pulse rounded-full bg-white opacity-80" />
        )}
      </span>

      <div>
        <h1
          className={`leading-none font-extrabold ${
            compact ? 'text-[1.6rem]' : 'text-[clamp(2.2rem,5vw,3.4rem)]'
          }`}
        >
          New<span className="text-accent">Poke</span>
        </h1>
        <p
          className={`tracking-[0.04em] text-muted ${
            compact ? 'mt-[3px] text-[0.7rem]' : 'mt-1.5 text-[0.82rem]'
          }`}
        >
          Multijugador local · 1-8 jugadores
        </p>
      </div>
    </div>
  );
}
