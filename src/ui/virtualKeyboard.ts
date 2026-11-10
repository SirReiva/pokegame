/**
 * Distribución y navegación del teclado en pantalla del lobby.
 *
 * El layout es una rejilla de 10 columnas: cada fila declara sus teclas y las
 * teclas de acción ocupan varias columnas con `span`. Así la cruceta puede
 * moverse por filas y columnas sin depender del ancho real de cada tecla.
 */

export type VirtualKeyboardKey =
  | { kind: 'char'; value: string; label?: string; span?: number }
  | { kind: 'shift'; label: string; span?: number }
  | { kind: 'space'; label: string; span?: number }
  | { kind: 'clear'; label: string; span?: number }
  | { kind: 'backspace'; label: string; span?: number }
  | { kind: 'done'; label: string; span?: number };

export interface VirtualKeyboardCursor {
  row: number;
  col: number;
  shift: boolean;
  /**
   * Columna visual recordada para subir y bajar. Evita que el cursor derive
   * lateralmente al pasar por teclas anchas (`span` mayor que 1).
   */
  column?: number;
}

function chars(values: string): VirtualKeyboardKey[] {
  return [...values].map((value) => ({ kind: 'char', value }));
}

export const VIRTUAL_KEYBOARD_COLUMNS = 10;

export const VIRTUAL_KEYBOARD_ROWS: VirtualKeyboardKey[][] = [
  chars('1234567890'),
  chars('qwertyuiop'),
  chars('asdfghjklñ'),
  chars("zxcvbnm-.'"),
  chars('áéíóúü¡!¿?'),
  [
    { kind: 'shift', label: '⇧', span: 1 },
    { kind: 'space', label: 'espacio', span: 4 },
    { kind: 'clear', label: 'CLR', span: 2 },
    { kind: 'backspace', label: '⌫', span: 1 },
    { kind: 'done', label: 'Listo', span: 2 }
  ]
];

/** Texto visible de una tecla, en mayúsculas mientras `shift` está activo. */
export function virtualKeyLabel(
  key: VirtualKeyboardKey,
  shift: boolean
): string {
  if (key.kind === 'char') {
    const label = key.label ?? key.value;
    return shift ? label.toLocaleUpperCase('es') : label;
  }
  return key.label;
}

/** Columnas de la rejilla que ocupa una tecla (las de acción usan `span`). */
function keySpan(key: VirtualKeyboardKey): number {
  return key.span ?? 1;
}

/** Primera columna visual de una tecla dentro de su fila. */
function keyStart(row: VirtualKeyboardKey[], col: number): number {
  let start = 0;
  for (let index = 0; index < col; index++) {
    start += keySpan(row[index]);
  }
  return start;
}

/**
 * Columna visual que representa el cursor. Para las teclas anchas se usa el
 * centro redondeado, de modo que subir y bajar entre una tecla de 1 columna y
 * otra de varias columnas mantiene la posición sin desplazarse lateralmente.
 */
function cursorColumn(
  rows: VirtualKeyboardKey[][],
  cursor: VirtualKeyboardCursor
): number {
  const row = rows[cursor.row] ?? [];
  const key = row[cursor.col];
  if (!key) return cursor.col;
  return Math.round(keyStart(row, cursor.col) + (keySpan(key) - 1) / 2);
}

/** Tecla de una fila que cubre la columna visual indicada. */
function keyAtColumn(row: VirtualKeyboardKey[], column: number): number {
  let start = 0;
  for (let index = 0; index < row.length; index++) {
    const span = keySpan(row[index]);
    if (column < start + span) return index;
    start += span;
  }
  return Math.max(0, row.length - 1);
}

/** Mueve el cursor por la rejilla, ajustando la columna al cambiar de fila. */
export function moveVirtualKeyboardCursor(
  cursor: VirtualKeyboardCursor,
  action: 'up' | 'down' | 'left' | 'right'
): VirtualKeyboardCursor {
  const rows = VIRTUAL_KEYBOARD_ROWS;

  if (action === 'left' || action === 'right') {
    const row = rows[cursor.row] ?? [];
    const length = row.length || 1;
    const col = (cursor.col + (action === 'right' ? 1 : -1) + length) % length;
    const key = row[col];
    const column = key
      ? keyStart(row, col) + (keySpan(key) - 1) / 2
      : col;
    return { ...cursor, col, column };
  }

  const column = cursor.column ?? cursorColumn(rows, cursor);
  const row = Math.max(
    0,
    Math.min(rows.length - 1, cursor.row + (action === 'down' ? 1 : -1))
  );
  return { ...cursor, row, col: keyAtColumn(rows[row], column), column };
}

export interface VirtualKeyboardPress {
  /** Nuevo nombre tras pulsar la tecla. */
  value: string;
  /** Estado de Shift después de la pulsación (Mayús es de un solo uso). */
  shift: boolean;
  /** `true` cuando la tecla cierra el teclado. */
  close: boolean;
}

/** Aplica una tecla al nombre actual. */
export function applyVirtualKeyboardKey(
  key: VirtualKeyboardKey,
  value: string,
  shift: boolean,
  maxLength: number
): VirtualKeyboardPress {
  switch (key.kind) {
    case 'char': {
      const character = shift ? key.value.toLocaleUpperCase('es') : key.value;
      return {
        value: (value + character).slice(0, maxLength),
        shift: false,
        close: false
      };
    }
    case 'space':
      return { value: (value + ' ').slice(0, maxLength), shift, close: false };
    case 'clear':
      return { value: '', shift, close: false };
    case 'backspace':
      return { value: value.slice(0, -1), shift, close: false };
    case 'shift':
      return { value, shift: !shift, close: false };
    case 'done':
      return { value, shift, close: true };
  }
}
