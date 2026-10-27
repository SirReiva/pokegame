import { TYPE_LABELS, typeStyle } from './typeInfo';

export function TypeBadge({ type }: { type: string }) {
  return (
    <span className="type-badge" style={typeStyle(type)}>
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}
