import type { GamepadFamily } from '../game/input';

/** Nombre legible de cada familia de mando. */
export const GAMEPAD_FAMILY_LABEL: Record<GamepadFamily, string> = {
  xbox: 'Xbox',
  playstation: 'PlayStation',
  nintendo: 'Nintendo',
  generic: 'Genérico'
};

/**
 * Botón frontal inferior de cada distribución. La Gamepad API lo expone
 * siempre en el índice 0, que es el que usan los menús para confirmar.
 */
export const GAMEPAD_CONFIRM_LABEL: Record<GamepadFamily, string> = {
  xbox: 'A',
  playstation: '✕',
  nintendo: 'B',
  generic: 'A'
};

/** Descripción corta de cómo confirmar con un dispositivo concreto. */
export function confirmHint(kind: 'keyboard' | 'gamepad', family?: GamepadFamily | null) {
  if (kind === 'keyboard') return 'Espacio / Enter';
  const resolved = family ?? 'generic';
  return `${GAMEPAD_FAMILY_LABEL[resolved]} · Botón ${GAMEPAD_CONFIRM_LABEL[resolved]}`;
}
