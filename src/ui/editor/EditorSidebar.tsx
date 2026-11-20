/**
 * Paneles laterales del editor: herramientas y terrenos a la izquierda, y
 * datos del mapa, bases, objetos, separadores y validación a la derecha.
 */

import type { RefObject } from 'react';
import { ITEM_DEFINITIONS, ITEM_IDS, type ItemId } from '../../game/items';
import {
  EDITOR_MAX_SIZE,
  EDITOR_MIN_SIZE,
  TERRAIN_SWATCHES,
  type EditorMap,
  type EditorMeta,
  type EditorPickup
} from '../../game/mapEditor';
import {
  TEAM_IDS,
  TERRAINS,
  TERRAIN_IDS,
  type BarrierKind,
  type Team,
  type TerrainId
} from '../../game/terrain';
import { btnClass } from '../buttonStyles';
import { KeyPill } from '../KeyPill';
import { TypeBadge } from '../TypeBadge';
import {
  TOOLS,
  barrierLabel,
  teamColor,
  teamLabel,
  type Tool
} from './editorModel';
import { fieldClass, inputClass, sectionTitle } from './editorStyles';

interface EditorToolsPanelProps {
  tool: Tool;
  terrain: TerrainId;
  counts: Record<TerrainId, number>;
  undoCount: number;
  redoCount: number;
  changeTool: (tool: Tool) => void;
  undo: () => void;
  redo: () => void;
  selectTerrain: (terrain: TerrainId) => void;
}

export function EditorToolsPanel({
  tool,
  terrain,
  counts,
  undoCount,
  redoCount,
  changeTool,
  undo,
  redo,
  selectTerrain
}: EditorToolsPanelProps) {
  return (
    <aside className="flex w-66 flex-none flex-col gap-4 overflow-y-auto border-r border-line bg-night-800/80 p-3 max-[980px]:w-full max-[980px]:border-r-0 max-[980px]:border-b">
      <section>
        <h2 className={sectionTitle}>Herramientas</h2>
        <div className="grid grid-cols-2 gap-1.5">
          {TOOLS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              title={`${entry.title} (${entry.key})`}
              className={btnClass(tool === entry.id ? 'primary' : 'ghost', 'small')}
              onClick={() => changeTool(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <button
            type="button"
            className={`${btnClass('ghost', 'small')} flex-1`}
            onClick={undo}
            disabled={undoCount === 0}
          >
            Deshacer
          </button>
          <button
            type="button"
            className={`${btnClass('ghost', 'small')} flex-1`}
            onClick={redo}
            disabled={redoCount === 0}
          >
            Rehacer
          </button>
        </div>
      </section>

      <section>
        <h2 className={sectionTitle}>Terrenos</h2>
        <div className="flex flex-col gap-1">
          {TERRAIN_IDS.map((id) => (
            <button
              key={id}
              type="button"
              title={
                TERRAINS[id].type
                  ? `${TERRAINS[id].name} · ${TERRAINS[id].type}`
                  : `${TERRAINS[id].name} · sin tipo`
              }
              className={`flex w-full cursor-pointer items-center gap-2 rounded-[9px] border px-2 py-1.5 text-left transition-colors ${
                terrain === id
                  ? 'border-accent/70 bg-accent/10'
                  : 'border-transparent hover:border-line hover:bg-white/4'
              }`}
              onClick={() => selectTerrain(id)}
            >
              <span
                className="size-4 flex-none rounded-[3px] border border-black/40 shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]"
                style={{ background: TERRAIN_SWATCHES[id] }}
              />
              <span className="min-w-0 flex-1 truncate text-xs text-steel-200">
                {TERRAINS[id].name}
              </span>
              {TERRAINS[id].type && (
                <TypeBadge type={TERRAINS[id].type} />
              )}
              <span className="w-8 text-right font-mono text-9.28 tabular-nums text-steel-800">
                {counts[id]}
              </span>
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}

interface EditorPropertiesPanelProps {
  map: EditorMap | null;
  colsInputRef: RefObject<HTMLInputElement | null>;
  rowsInputRef: RefObject<HTMLInputElement | null>;
  tool: Tool;
  pickupType: ItemId;
  selectedMountain: number | null;
  draftPoints: Array<[number, number]>;
  barrierKind: BarrierKind;
  mountainWidth: number;
  issues: string[];
  changeTool: (tool: Tool) => void;
  setPickupType: (id: ItemId) => void;
  updateMeta: (patch: Partial<EditorMeta>) => void;
  updateBaseRadius: (radius: number) => void;
  applyResize: () => void;
  removeBase: (team: Team) => void;
  mutatePickups: (mutate: (pickups: EditorPickup[]) => boolean) => boolean;
  selectMountain: (index: number) => void;
  removeMountain: (index: number) => void;
  changeBarrierKind: (kind: BarrierKind) => void;
  updateMountainWidth: (width: number) => void;
  startMountainDraft: () => void;
  finishDraft: () => void;
  clearDraftPoints: () => void;
}

export function EditorPropertiesPanel({
  map,
  colsInputRef,
  rowsInputRef,
  tool,
  pickupType,
  selectedMountain,
  draftPoints,
  barrierKind,
  mountainWidth,
  issues,
  changeTool,
  setPickupType,
  updateMeta,
  updateBaseRadius,
  applyResize,
  removeBase,
  mutatePickups,
  selectMountain,
  removeMountain,
  changeBarrierKind,
  updateMountainWidth,
  startMountainDraft,
  finishDraft,
  clearDraftPoints
}: EditorPropertiesPanelProps) {
  const mapCols = map?.cols;
  const mapRows = map?.rows;
  const selectedRange =
    map && selectedMountain !== null ? map.mountains[selectedMountain] : undefined;
  const selectedKind = selectedRange ? (selectedRange.kind ?? 'mountain') : barrierKind;
  const mountainWidthValue = selectedRange?.width ?? mountainWidth;
  const widthLabel = selectedRange
    ? selectedKind === 'volcano'
      ? `Lado del volcán ${selectedMountain! + 1}`
      : `Ancho del ${selectedKind === 'wall' ? 'muro' : 'cordillera'} ${selectedMountain! + 1}`
    : selectedKind === 'volcano'
      ? 'Lado del nuevo volcán'
      : 'Ancho del nuevo separador';

  return (
    <aside className="flex w-71.5 flex-none flex-col gap-5 overflow-y-auto border-l border-line bg-night-800/80 p-4 max-[980px]:w-full max-[980px]:border-l-0 max-[980px]:border-t">
      <section>
        <h2 className={sectionTitle}>Datos del mapa</h2>
        <div className="grid grid-cols-2 gap-2">
          <label className={`${fieldClass} col-span-2`}>
            <span>Nombre</span>
            <input
              className={inputClass}
              value={map?.meta.name ?? ''}
              onChange={(event) => updateMeta({ name: event.target.value })}
              disabled={!map}
            />
          </label>
          <label className={`${fieldClass} col-span-2`}>
            <span>Id (nombre del archivo)</span>
            <input
              className={inputClass}
              value={map?.meta.id ?? ''}
              onChange={(event) => updateMeta({ id: event.target.value })}
              disabled={!map}
            />
          </label>
          <label className={fieldClass}>
            <span>Lado de celda</span>
            <input
              className={inputClass}
              type="number"
              min={0.1}
              step={0.1}
              value={map?.meta.tileSize ?? ''}
              onChange={(event) => updateMeta({ tileSize: Number(event.target.value) })}
              disabled={!map}
            />
          </label>
          <label className={fieldClass}>
            <span>Altura del agua</span>
            <input
              className={inputClass}
              type="number"
              step={0.1}
              value={map?.meta.waterHeight ?? ''}
              onChange={(event) => updateMeta({ waterHeight: Number(event.target.value) })}
              disabled={!map}
            />
          </label>
          <label className={fieldClass}>
            <span>Radio de base</span>
            <input
              className={inputClass}
              type="number"
              min={0.5}
              step={0.1}
              value={map?.meta.baseRadius ?? ''}
              onChange={(event) => updateBaseRadius(Number(event.target.value))}
              disabled={!map}
            />
          </label>
          <label className={fieldClass}>
            <span>Ancho (columnas)</span>
            <input
              key={`cols-${mapCols ?? 'sin-mapa'}`}
              ref={colsInputRef}
              className={inputClass}
              type="number"
              min={EDITOR_MIN_SIZE}
              max={EDITOR_MAX_SIZE}
              defaultValue={map?.cols ?? ''}
              disabled={!map}
            />
          </label>
          <label className={fieldClass}>
            <span>Alto (filas)</span>
            <input
              key={`rows-${mapRows ?? 'sin-mapa'}`}
              ref={rowsInputRef}
              className={inputClass}
              type="number"
              min={EDITOR_MIN_SIZE}
              max={EDITOR_MAX_SIZE}
              defaultValue={map?.rows ?? ''}
              disabled={!map}
            />
          </label>
        </div>
        <button
          type="button"
          className={`${btnClass('ghost', 'small')} mt-2 w-full`}
          onClick={applyResize}
          disabled={!map}
        >
          Redimensionar rejilla
        </button>
        <p className="mt-2 text-10.88/normal text-muted">
          Redimensionar conserva la esquina noroeste, rellena lo nuevo con el terreno de fondo y
          desplaza los separadores con la rejilla.
        </p>
      </section>

      <section>
        <h2 className={sectionTitle}>Bases</h2>
        <div className="flex flex-col gap-1.5">
          {TEAM_IDS.map((team) => {
            const base = map?.bases[team];
            return (
              <div
                key={team}
                className="flex items-center gap-2 rounded-[9px] border border-line bg-white/3 px-2 py-1.5"
              >
                <span
                  className="size-2.5 flex-none rounded-full"
                  style={{ background: teamColor(team) }}
                />
                <span className="text-11.84 text-steel-200">{teamLabel(team)}</span>
                <span className="ml-auto font-mono text-9.92 text-steel-450">
                  {base ? `fila ${base.row} · col ${base.col}` : 'sin colocar'}
                </span>
                {base && (
                  <button
                    type="button"
                    className="cursor-pointer rounded border border-transparent px-1 font-mono text-9.92 text-steel-500 transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger-100"
                    onClick={() => removeBase(team)}
                    title={`Quitar la base ${teamLabel(team).toLowerCase()}`}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {TEAM_IDS.map((team) => (
            <button
              key={team}
              type="button"
              className={btnClass('ghost', 'tiny')}
              onClick={() => changeTool(`base-${team}` as Tool)}
            >
              {map?.bases[team] ? 'Mover' : 'Añadir'} {teamLabel(team).toLowerCase()}
            </button>
          ))}
        </div>
        <p className="mt-2 text-10.88/normal text-muted">
          El mapa puede tener entre 2 y 4 equipos. Los equipos sin base no participan en la
          partida.
        </p>
      </section>

      <section>
        <h2 className={sectionTitle}>Objetos</h2>
        <div className="flex flex-col gap-1">
          {ITEM_IDS.map((id) => {
            const definition = ITEM_DEFINITIONS[id];
            const count = map
              ? map.pickups.filter((pickup) => pickup.type === id).length
              : 0;
            return (
              <button
                key={id}
                type="button"
                className={`flex w-full cursor-pointer items-center gap-2 rounded-[9px] border px-2 py-1.5 text-left transition-colors ${
                  pickupType === id && tool === 'pickup'
                    ? 'border-accent/70 bg-accent/10'
                    : 'border-transparent hover:border-line hover:bg-white/4'
                }`}
                onClick={() => {
                  setPickupType(id);
                  changeTool('pickup');
                }}
                title={`${definition.description} Cooldown: ${definition.cooldownSeconds} s.`}
              >
                <span
                  className="size-4 flex-none rounded-[3px] border border-black/40 shadow-[inset_0_1px_0_rgb(255_255_255/0.3)]"
                  style={{ background: definition.color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-steel-200">
                    {definition.name}
                  </span>
                  <span className="block font-mono text-9.28 text-steel-500">
                    {definition.healHp} PV · {definition.cooldownSeconds} s
                  </span>
                </span>
                <span className="w-8 text-right font-mono text-9.28 tabular-nums text-steel-800">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-10.88/normal text-muted">
          Elige un objeto y haz clic en la rejilla para colocarlo. El clic derecho elimina el
          objeto de esa celda.
        </p>
        {map && map.pickups.length > 0 ? (
          <div className="mt-2 flex max-h-44 flex-col gap-1 overflow-y-auto">
            {map.pickups.map((pickup, index) => (
              <div
                key={`pickup-${pickup.row}-${pickup.col}`}
                className="flex items-center gap-1.5 rounded-[9px] border border-line bg-white/3 px-2 py-1.5"
              >
                <span
                  className="size-2.5 flex-none rounded-full"
                  style={{ background: ITEM_DEFINITIONS[pickup.type].color }}
                />
                <span className="min-w-0 flex-1 truncate text-11.2 text-steel-200">
                  {ITEM_DEFINITIONS[pickup.type].name}
                </span>
                <span className="font-mono text-9.28 text-steel-450">
                  {pickup.row} · {pickup.col}
                </span>
                <button
                  type="button"
                  className="flex size-6 flex-none cursor-pointer items-center justify-center rounded-md border border-transparent text-13.6 text-muted transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger-100"
                  onClick={() =>
                    mutatePickups((pickups) => {
                      if (!pickups[index]) return false;
                      pickups.splice(index, 1);
                      return true;
                    })
                  }
                  title="Eliminar objeto"
                  aria-label={`Eliminar ${ITEM_DEFINITIONS[pickup.type].name} de la celda ${pickup.row} · ${pickup.col}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 rounded-[9px] border border-line bg-white/3 px-2.5 py-2 text-10.88/normal text-muted">
            Sin objetos colocados.
          </p>
        )}
      </section>

      <section>
        <h2 className={sectionTitle}>Separadores</h2>
        <div className="flex flex-col gap-1.5">
          {map && map.mountains.length > 0 ? (
            map.mountains.map((range, index) => {
              const selected = tool === 'mountain' && selectedMountain === index;
              const label = barrierLabel(range.kind);
              return (
                <div
                  key={`barrier-${index}`}
                  className={`flex items-center gap-1.5 rounded-[9px] border px-2 py-1.5 ${
                    selected
                      ? 'border-accent/60 bg-accent/10'
                      : 'border-line bg-white/3'
                  }`}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 cursor-pointer text-left"
                    onClick={() => selectMountain(index)}
                    title={`Seleccionar ${label.toLowerCase()} para mover sus puntos`}
                  >
                    <span className="block truncate text-11.84 text-steel-200">
                      {label} {index + 1}
                    </span>
                    <span className="block font-mono text-9.6 text-steel-450">
                      {range.kind === 'volcano'
                        ? `lado ${Math.round(range.width * 10) / 10}`
                        : `${range.points.length} ${
                            range.points.length === 1 ? 'punto' : 'puntos'
                          } · ancho ${Math.round(range.width * 10) / 10}`}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="flex size-6 flex-none cursor-pointer items-center justify-center rounded-md border border-transparent text-13.6 text-muted transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger-100"
                    onClick={() => removeMountain(index)}
                    title={`Eliminar ${label.toLowerCase()}`}
                    aria-label={`Eliminar ${label.toLowerCase()} ${index + 1}`}
                  >
                    ×
                  </button>
                </div>
              );
            })
          ) : (
            <p className="rounded-[9px] border border-line bg-white/3 px-2.5 py-2 text-10.88/normal text-muted">
              Sin separadores. Usa «Dibujar separador» y haz clic en la rejilla para trazar uno.
            </p>
          )}
        </div>

        <div className={`${fieldClass} mt-2`}>
          <span>
            {selectedMountain !== null
              ? 'Tipo del separador seleccionado'
              : 'Tipo del nuevo separador'}
          </span>
          <div className="flex gap-1.5">
            {(
              [
                {
                  kind: 'mountain',
                  label: 'Cordillera',
                  title: 'Cordillera de picos: misma colisión y visión'
                },
                {
                  kind: 'wall',
                  label: 'Muro',
                  title: 'Muro de piedra con almenas: misma colisión y visión'
                },
                {
                  kind: 'volcano',
                  label: 'Volcán',
                  title: 'Cono truncado de lava sobre una huella cuadrada: misma colisión y visión'
                }
              ] as const
            ).map((option) => (
              <button
                key={option.kind}
                type="button"
                className={`${btnClass(selectedKind === option.kind ? 'primary' : 'ghost', 'tiny')} flex-1`}
                onClick={() => changeBarrierKind(option.kind)}
                disabled={!map}
                title={option.title}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <label className={`${fieldClass} mt-2`}>
          <span>{widthLabel}</span>
          <input
            className={inputClass}
            type="number"
            min={0.2}
            step={0.1}
            value={mountainWidthValue}
            onChange={(event) => updateMountainWidth(Number(event.target.value))}
            disabled={!map}
          />
        </label>

        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            className={`${btnClass('ghost', 'tiny')} flex-1`}
            onClick={startMountainDraft}
            disabled={!map}
          >
            {barrierKind === 'volcano' ? 'Colocar volcán' : 'Dibujar separador'}
          </button>
          {selectedMountain !== null && (
            <button
              type="button"
              className={btnClass('ghost', 'tiny')}
              onClick={() => removeMountain(selectedMountain)}
            >
              Eliminar
            </button>
          )}
        </div>

        {draftPoints.length > 0 && (
          <div className="mt-2 rounded-[9px] border border-accent/40 bg-accent/8 px-2.5 py-2 text-10.88/normal text-steel-200">
            Trazando {barrierKind === 'wall' ? 'muro' : 'cordillera'} · {draftPoints.length}{' '}
            {draftPoints.length === 1 ? 'punto' : 'puntos'}
            <div className="mt-1.5 flex gap-1.5">
              <button
                type="button"
                className={`${btnClass('primary', 'tiny')} flex-1`}
                onClick={finishDraft}
                disabled={draftPoints.length < 2}
              >
                Terminar
              </button>
              <button
                type="button"
                className={`${btnClass('ghost', 'tiny')} flex-1`}
                onClick={clearDraftPoints}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        <p className="mt-2 text-10.88/normal text-muted">
          {barrierKind === 'volcano' ? (
            <>
              El volcán ocupa siempre una huella cuadrada. Haz clic para colocarlo con el lado
              actual o arrastra sobre la rejilla para definir el cuadrado; después puedes moverlo
              arrastrando su centro.
            </>
          ) : (
            <>
              Elige arriba si el trazado es cordillera o muro. Haz clic para añadir puntos y doble
              clic o <KeyPill>Enter</KeyPill> para cerrar. Arrastra un punto para moverlo; doble
              clic sobre la línea añade uno y el clic derecho sobre un punto lo quita.
            </>
          )}
        </p>
      </section>

      <section>
        <h2 className={sectionTitle}>Validación</h2>
        {issues.length === 0 ? (
          <p className="rounded-[9px] border border-accent/25 bg-accent/8 px-2.5 py-2 text-11.52 text-accent-soft">
            El mapa está listo para exportar.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {issues.map((issue) => (
              <li
                key={issue}
                className="rounded-[9px] border border-danger/25 bg-danger/8 px-2.5 py-1.5 text-11.2 leading-[1.45] text-danger-100"
              >
                {issue}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className={sectionTitle}>Atajos</h2>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-11.2 text-steel-350">
          <li className="flex items-center gap-2">
            <KeyPill>B</KeyPill> lápiz · <KeyPill>G</KeyPill> relleno
          </li>
          <li className="flex items-center gap-2">
            <KeyPill>R</KeyPill> rectángulo · <KeyPill>E</KeyPill> borrador
          </li>
          <li className="flex items-center gap-2">
            <KeyPill>1</KeyPill> base azul · <KeyPill>2</KeyPill> base roja
          </li>
          <li className="flex items-center gap-2">
            <KeyPill>P</KeyPill> colocar objeto · clic derecho borra
          </li>
          <li className="flex items-center gap-2">
            <KeyPill>M</KeyPill> separador · <KeyPill>Enter</KeyPill> cerrar trazado
          </li>
          <li className="flex items-center gap-2">
            <KeyPill>Ctrl+Z</KeyPill> deshacer · <KeyPill>Ctrl+Y</KeyPill> rehacer
          </li>
          <li className="flex items-center gap-2">
            <KeyPill>+ / −</KeyPill> zoom · <KeyPill>0</KeyPill> ajustar
          </li>
          <li className="text-10.88 leading-[1.45] text-muted">
            Clic derecho pinta con el terreno de fondo. Con la herramienta Separador, quita
            el último punto del trazado o el punto bajo el cursor.
          </li>
        </ul>
      </section>
    </aside>
  );
}
