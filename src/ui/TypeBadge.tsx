import { TYPE_ICONS, TYPE_LABELS, typeStyle } from './typeInfo';

// Los SVG se inlinean para que `fill="currentColor"` herede el color del texto
// de la insignia (blanco en tipos oscuros y casi negro en los claros).
const TYPE_ICON_SVGS = import.meta.glob('../assets/types/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default'
}) as Record<string, string>;

interface TypeBadgeProps {
  type: string;
  className?: string;
}

export function TypeBadge({ type, className = '' }: TypeBadgeProps) {
  const slug = TYPE_ICONS[type];
  const svg = slug ? TYPE_ICON_SVGS[`../assets/types/${slug}.svg`] : undefined;

  return (
    <span
      className={`inline-flex items-center gap-[0.3em] rounded-full border border-white/20 px-1.5 py-0.5 font-mono text-[0.56rem] leading-[1.4] font-bold tracking-[0.06em] uppercase ${className}`}
      style={typeStyle(type)}
    >
      {svg && (
        <span
          aria-hidden="true"
          className="size-[1.65em] flex-none [&>svg]:block [&>svg]:size-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}
