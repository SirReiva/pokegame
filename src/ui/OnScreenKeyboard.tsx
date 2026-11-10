import {
  VIRTUAL_KEYBOARD_COLUMNS,
  VIRTUAL_KEYBOARD_ROWS,
  virtualKeyLabel,
  type VirtualKeyboardCursor,
  type VirtualKeyboardKey
} from './virtualKeyboard';

export interface NameEditorView {
  slot: number;
  cursor: VirtualKeyboardCursor;
}

interface OnScreenKeyboardProps {
  editor: NameEditorView;
  onPress: (row: number, col: number) => void;
  onClose: () => void;
}

const keyBase =
  'flex min-h-7 items-center justify-center rounded-md border px-0.5 py-1 font-mono text-9.6 font-[650] transition-[background-color,border-color,color,transform] duration-100 active:scale-[0.96]';

const keyTitle: Partial<Record<VirtualKeyboardKey['kind'], string>> = {
  shift: 'Mayúsculas',
  space: 'Espacio',
  clear: 'Limpiar nombre',
  backspace: 'Borrar último carácter',
  done: 'Terminar de escribir'
};

/**
 * Teclado en pantalla compacto para editar el nombre dentro de la tarjeta del
 * jugador. Es presentacional: el cursor y el nombre viven en la ruta para
 * compartir la misma entrada de menú que el resto de la pantalla.
 */
export function OnScreenKeyboard({
  editor,
  onPress,
  onClose
}: OnScreenKeyboardProps) {
  return (
    <div
      role="group"
      aria-label={`Teclado en pantalla para el nombre del jugador ${editor.slot}`}
      className="mt-1.5 animate-pop-in rounded-xl border border-accent/40 bg-night-950/45 p-1.5"
    >
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="truncate font-mono text-8.32 tracking-[0.08em] uppercase text-accent-soft">
          Nombre · P{editor.slot}
        </span>
        <button
          type="button"
          aria-label="Cerrar teclado"
          title="Cerrar teclado (B)"
          className="grid size-5 flex-none place-items-center rounded-md border border-line bg-white/5 text-9.6 text-steel-300 transition-colors hover:border-line-strong hover:bg-white/10 hover:text-ink"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col gap-1">
        {VIRTUAL_KEYBOARD_ROWS.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className="grid gap-1"
            style={{
              gridTemplateColumns: `repeat(${VIRTUAL_KEYBOARD_COLUMNS}, minmax(0, 1fr))`
            }}
          >
            {row.map((key, colIndex) => {
              const active =
                editor.cursor.row === rowIndex && editor.cursor.col === colIndex;
              return (
                <button
                  key={`${rowIndex}-${colIndex}-${key.kind}`}
                  type="button"
                  aria-pressed={active}
                  title={keyTitle[key.kind]}
                  className={`${keyBase} ${
                    active
                      ? 'border-accent bg-accent text-ink-dark shadow-[0_0_14px_rgb(75_156_255/0.35)]'
                      : 'border-line bg-white/4.5 text-ink hover:border-line-strong hover:bg-white/10'
                  }`}
                  style={
                    key.span ? { gridColumn: `span ${key.span}` } : undefined
                  }
                  onClick={() => onPress(rowIndex, colIndex)}
                >
                  {virtualKeyLabel(key, editor.cursor.shift)}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <p className="mt-1 text-center font-mono text-8.32 tracking-[0.04em] text-steel-600">
        A escribe · B cierra
      </p>
    </div>
  );
}
