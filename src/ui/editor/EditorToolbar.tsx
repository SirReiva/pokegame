/** Cabecera del editor: título del mapa y acciones de importación/exportación. */

import type { ChangeEvent, RefObject } from 'react';
import type { EditorMap } from '../../game/mapEditor';
import { Brand } from '../Brand';
import { btnClass } from '../buttonStyles';
import { eyebrow } from '../styles';

interface EditorToolbarProps {
  map: EditorMap | null;
  canExport: boolean;
  fileRef: RefObject<HTMLInputElement | null>;
  openNewMap: () => void;
  copyJson: () => Promise<void>;
  exportJson: () => void;
  exitEditor: () => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
}

export function EditorToolbar({
  map,
  canExport,
  fileRef,
  openNewMap,
  copyJson,
  exportJson,
  exitEditor,
  onFileChange
}: EditorToolbarProps) {
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel-strong px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Brand compact />
          <span className="hidden h-8 w-px bg-line sm:block" />
          <div>
            <span className={eyebrow}>Editor de mapas</span>
            <h1 className="mt-0.5 text-17.6/tight">
              {map ? map.meta.name || 'Mapa sin nombre' : 'Sin mapa'}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={btnClass('ghost', 'small')} onClick={openNewMap}>
            Nuevo
          </button>
          <button
            type="button"
            className={btnClass('ghost', 'small')}
            onClick={() => fileRef.current?.click()}
          >
            Importar
          </button>
          <button
            type="button"
            className={btnClass('ghost', 'small')}
            onClick={() => void copyJson()}
            disabled={!canExport}
          >
            Copiar JSON
          </button>
          <button
            type="button"
            className={btnClass('primary', 'small')}
            onClick={exportJson}
            disabled={!canExport}
          >
            Exportar JSON
          </button>
          <button type="button" className={btnClass('ghost', 'small')} onClick={exitEditor}>
            Salir
          </button>
        </div>
      </header>

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => void onFileChange(event)}
      />
    </>
  );
}
