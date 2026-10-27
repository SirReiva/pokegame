import { TYPE_LABELS, typeStyle } from './typeInfo';

interface TypeBadgeProps {
  type: string;
  className?: string;
}

export function TypeBadge({ type, className = '' }: TypeBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-white/20 px-1.5 py-0.5 font-mono text-[0.56rem] leading-[1.4] font-bold tracking-[0.06em] uppercase ${className}`}
      style={typeStyle(type)}
    >
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}
