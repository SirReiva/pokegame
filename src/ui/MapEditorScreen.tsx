import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from 'react';
import type { MapIndexEntry } from '../game/map';
import {
  EDITOR_MAX_SIZE,
  EDITOR_MIN_SIZE,
  cellCenter,
  cloneBases,
  cloneMountains,
  createEditorMap,
  floodFillInPlace,
  paintCellInPlace,
  paintLineInPlace,
  paintRectInPlace,
  resizeEditorMap,
  setBaseInPlace,
  type EditorMap,
  type EditorMeta,
  type EditorPickup
} from '../game/mapEditor';
import { ITEM_DEFINITIONS, type ItemId } from '../game/items';
import {
  TEAM_IDS,
  TERRAINS,
  TERRAIN_IDS,
  type BarrierKind,
  type MountainRange,
  type Team,
  type TerrainId
} from '../game/terrain';
import { btnClass } from './buttonStyles';
import { drawEditorCanvas } from './editor/editorCanvas';
import type { VolcanoDraft } from './editor/editorCanvas';
import {
  cellFromPointer as cellFromPointerAt,
  findMountainLine as findMountainLineAt,
  findMountainPoint as findMountainPointAt,
  findMountainSegment as findMountainSegmentAt,
  pointerCellFloat as pointerCellFloatAt
} from './editor/editorGeometry';
import {
  buildJson as buildEditorJson,
  copyJson as copyEditorJson,
  exportJson as downloadEditorJson,
  importRaw as importEditorMap,
  loadExisting as fetchEditorMap,
  onFileChange as readFileChange
} from './editor/editorIo';
import {
  DEFAULT_MOUNTAIN_WIDTH,
  SIZE_PRESETS,
  TOOLS,
  applyMapEdit,
  barrierLabel,
  loadDraft,
  mapIssues,
  mapWithBases,
  mapWithMountains,
  mapWithPickups,
  mapWithTiles,
  redoEdit,
  saveDraft,
  setupFormFrom,
  teamLabel,
  toolForKey,
  undoEdit,
  type Cell,
  type EditorRect,
  type EditorState,
  type SetupForm,
  type Tool
} from './editor/editorModel';
import { EditorPropertiesPanel, EditorToolsPanel } from './editor/EditorSidebar';
import { EditorToolbar } from './editor/EditorToolbar';
import { fieldClass, inputClass } from './editor/editorStyles';
import { KeyPill } from './KeyPill';
import { eyebrow } from './styles';

interface MapEditorScreenProps {
  maps: MapIndexEntry[];
  onExit: () => void;
}


export function MapEditorScreen({ maps, onExit }: MapEditorScreenProps) {
  const initial = useMemo(() => loadDraft(), []);
  const [state, setState] = useState<EditorState>(initial);
  const stateRef = useRef<EditorState>(initial);

  const [tool, setTool] = useState<Tool>('pencil');
  const [terrain, setTerrain] = useState<TerrainId>(initial.map?.background ?? 'jungle');
  const [pickupType, setPickupType] = useState<ItemId>('potion');
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<Cell | null>(null);
  const [rect, setRect] = useState<EditorRect | null>(null);
  const [setupOpen, setSetupOpen] = useState(initial.map === null);
  const [form, setForm] = useState<SetupForm>(() => setupFormFrom(initial.map));
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ width: 900, height: 640 });
  const [mountainWidth, setMountainWidth] = useState(DEFAULT_MOUNTAIN_WIDTH);
  const [barrierKind, setBarrierKind] = useState<BarrierKind>('mountain');
  const [selectedMountain, setSelectedMountain] = useState<number | null>(null);
  const [draftPoints, setDraftPoints] = useState<Array<[number, number]>>([]);
  const [volcanoDraft, setVolcanoDraft] = useState<VolcanoDraft | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gridAreaRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const colsInputRef = useRef<HTMLInputElement | null>(null);
  const rowsInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{
    tool: Tool;
    lastRow: number;
    lastCol: number;
    startRow: number;
    startCol: number;
  } | null>(null);
  const mountainDragRef = useRef<{
    rangeIndex: number;
    pointIndex: number;
    moved: boolean;
  } | null>(null);
  const volcanoAnchorRef = useRef<{
    x: number;
    z: number;
    row: number;
    col: number;
  } | null>(null);
  const volcanoDraftRef = useRef<VolcanoDraft | null>(null);

  const map = state.map;

  const setVolcanoDraftNow = (draft: VolcanoDraft | null) => {
    volcanoDraftRef.current = draft;
    setVolcanoDraft(draft);
  };

  const clearVolcanoDrag = () => {
    volcanoAnchorRef.current = null;
    setVolcanoDraftNow(null);
  };

  const commit = (next: EditorState) => {
    stateRef.current = next;
    setState(next);
  };

  /** Cambia de herramienta y descarta el trazado de cordillera a medias. */
  const changeTool = (next: Tool) => {
    if (next !== 'mountain') {
      setDraftPoints([]);
      clearVolcanoDrag();
    }
    setTool(next);
  };

  const saveDraftNow = () => saveDraft(stateRef.current.map);

  const exitEditor = () => {
    saveDraftNow();
    onExit();
  };

  const syncSizeInputs = (cols: number, rows: number) => {
    if (colsInputRef.current) colsInputRef.current.value = String(cols);
    if (rowsInputRef.current) rowsInputRef.current.value = String(rows);
  };

  const updateMap = (nextMap: EditorMap, pushHistory = true) => {
    if (!stateRef.current.map) return;
    commit(applyMapEdit(stateRef.current, nextMap, pushHistory));
  };

  const undo = () => {
    const next = undoEdit(stateRef.current);
    if (next) commit(next);
  };

  const redo = () => {
    const next = redoEdit(stateRef.current);
    if (next) commit(next);
  };

  const mutateTiles = (
    mutate: (tiles: TerrainId[][]) => boolean,
    pushHistory = true
  ) => {
    const current = stateRef.current.map;
    if (!current) return;
    const next = mapWithTiles(current, mutate);
    if (next) updateMap(next, pushHistory);
  };

  const mutateBases = (mutate: (bases: EditorMap['bases']) => boolean, pushHistory = true) => {
    const current = stateRef.current.map;
    if (!current) return;
    const next = mapWithBases(current, mutate);
    if (next) updateMap(next, pushHistory);
  };

  const mutateMountains = (
    mutate: (mountains: MountainRange[]) => boolean,
    pushHistory = true
  ): boolean => {
    const current = stateRef.current.map;
    if (!current) return false;
    const next = mapWithMountains(current, mutate);
    if (!next) return false;
    updateMap(next, pushHistory);
    return true;
  };

  const mutatePickups = (
    mutate: (pickups: EditorPickup[]) => boolean,
    pushHistory = true
  ): boolean => {
    const current = stateRef.current.map;
    if (!current) return false;
    const next = mapWithPickups(current, mutate);
    if (!next) return false;
    updateMap(next, pushHistory);
    return true;
  };

  /** Coloca, cambia o elimina el objeto de una celda. */
  const editPickupCell = (row: number, col: number, remove: boolean) => {
    const current = stateRef.current.map;
    if (!current) return;
    mutatePickups((pickups) => {
      const index = pickups.findIndex(
        (pickup) => pickup.row === row && pickup.col === col
      );
      if (remove) {
        if (index < 0) return false;
        pickups.splice(index, 1);
        setToast('Objeto eliminado.');
        return true;
      }
      if (index >= 0) {
        if (pickups[index].type === pickupType) return false;
        pickups[index] = { type: pickupType, row, col };
        setToast(`Celda cambiada a ${ITEM_DEFINITIONS[pickupType].name}.`);
        return true;
      }
      pickups.push({ type: pickupType, row, col });
      setToast(`${ITEM_DEFINITIONS[pickupType].name} colocado.`);
      return true;
    });
  };

  const updateMeta = (patch: Partial<EditorMeta>) => {
    const current = stateRef.current.map;
    if (!current) return;
    updateMap({ ...current, meta: { ...current.meta, ...patch } }, false);
  };

  const updateBaseRadius = (radius: number) => {
    const current = stateRef.current.map;
    if (!current) return;
    const bases = cloneBases(current.bases);
    for (const team of TEAM_IDS) {
      if (bases[team]) bases[team].radius = radius;
    }
    updateMap(
      { ...current, meta: { ...current.meta, baseRadius: radius }, bases },
      false
    );
  };

  const removeBase = (team: Team) => {
    mutateBases((bases) => {
      if (!bases[team]) return false;
      delete bases[team];
      setToast(`Base ${teamLabel(team).toLowerCase()} eliminada.`);
      return true;
    });
  };

  /**
   * Comandos de pintado por herramienta. `rect` y `mountain` tienen su propio
   * flujo (arrastre y puntos), así que solo se registran aquí las que pintan
   * una celda directamente.
   */
  type CellTool = Exclude<Tool, 'rect' | 'mountain' | 'pickup'>;
  const cellCommands: Record<
    CellTool,
    (row: number, col: number, current: EditorMap, pushHistory: boolean) => void
  > = {
    pencil: (row, col, _current, pushHistory) => {
      mutateTiles(
        (tiles) => paintCellInPlace(tiles, row, col, terrain),
        pushHistory
      );
    },
    eraser: (row, col, current, pushHistory) => {
      mutateTiles(
        (tiles) => paintCellInPlace(tiles, row, col, current.background),
        pushHistory
      );
    },
    fill: (row, col, _current, pushHistory) => {
      mutateTiles(
        (tiles) => floodFillInPlace(tiles, row, col, terrain),
        pushHistory
      );
    },
    'base-blue': (row, col, current, pushHistory) => {
      mutateBases(
        (bases) =>
          setBaseInPlace(bases, 'blue', row, col, current.meta.baseRadius),
        pushHistory
      );
    },
    'base-red': (row, col, current, pushHistory) => {
      mutateBases(
        (bases) =>
          setBaseInPlace(bases, 'red', row, col, current.meta.baseRadius),
        pushHistory
      );
    },
    'base-yellow': (row, col, current, pushHistory) => {
      mutateBases(
        (bases) =>
          setBaseInPlace(bases, 'yellow', row, col, current.meta.baseRadius),
        pushHistory
      );
    },
    'base-green': (row, col, current, pushHistory) => {
      mutateBases(
        (bases) =>
          setBaseInPlace(bases, 'green', row, col, current.meta.baseRadius),
        pushHistory
      );
    }
  };

  const applyTool = (row: number, col: number, activeTool: Tool, pushHistory: boolean) => {
    const current = stateRef.current.map;
    if (!current) return;
    const command = cellCommands[activeTool as CellTool];
    if (!command) return;
    command(row, col, current, pushHistory);
  };

  const cellFromPointer = (
    event: ReactPointerEvent<HTMLCanvasElement>
  ): Cell | null => {
    const current = stateRef.current.map;
    if (!current) return null;
    return cellFromPointerAt(
      current,
      event.currentTarget.getBoundingClientRect(),
      event.clientX,
      event.clientY
    );
  };

  /** Posición del puntero en coordenadas fraccionarias de celda. */
  const pointerCellFloat = (
    event: ReactPointerEvent<HTMLCanvasElement> | ReactMouseEvent<HTMLCanvasElement>
  ) => {
    const current = stateRef.current.map;
    if (!current) return null;
    return pointerCellFloatAt(
      current,
      event.currentTarget.getBoundingClientRect(),
      event.clientX,
      event.clientY
    );
  };

  const findMountainPoint = (
    event: ReactPointerEvent<HTMLCanvasElement> | ReactMouseEvent<HTMLCanvasElement>
  ) => {
    const pointer = pointerCellFloat(event);
    return pointer ? findMountainPointAt(pointer) : null;
  };

  const findMountainLine = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerCellFloat(event);
    return pointer ? findMountainLineAt(pointer) : null;
  };

  const findMountainSegment = (
    event: ReactPointerEvent<HTMLCanvasElement> | ReactMouseEvent<HTMLCanvasElement>
  ) => {
    const pointer = pointerCellFloat(event);
    return pointer ? findMountainSegmentAt(pointer) : null;
  };

  const selectMountain = (index: number) => {
    const current = stateRef.current.map;
    const range = current?.mountains[index];
    if (!current || !range) return;
    setSelectedMountain(index);
    setMountainWidth(range.width);
    setBarrierKind(range.kind ?? 'mountain');
    setDraftPoints([]);
    clearVolcanoDrag();
    setTool('mountain');
  };

  /**
   * Cambia el tipo del separador seleccionado o, si no hay ninguno, el tipo
   * con el que se trazará el siguiente. La colisión no cambia.
   */
  const changeBarrierKind = (kind: BarrierKind) => {
    setBarrierKind(kind);
    setDraftPoints([]);
    clearVolcanoDrag();
    if (selectedMountain === null) return;
    mutateMountains((mountains) => {
      const range = mountains[selectedMountain];
      if (!range || (range.kind ?? 'mountain') === kind) return false;
      if (kind === 'volcano') {
        // Un volcán solo necesita un punto: se usa el centro del trazado.
        const points = range.points;
        if (points.length > 0) {
          let x = 0;
          let z = 0;
          for (const point of points) {
            x += point[0];
            z += point[1];
          }
          range.points = [[x / points.length, z / points.length]];
        }
      } else if (range.kind === 'volcano' && range.points.length < 2) {
        // Al volver a cordillera o muro hace falta un trazado: se abre el
        // centro en un tramo corto del ancho del volcán.
        const center = range.points[0];
        if (center) {
          const offset = range.width / 2;
          range.points = [
            [center[0] - offset, center[1]],
            [center[0] + offset, center[1]]
          ];
        }
      }
      range.kind = kind;
      return true;
    }, true);
  };

  const startMountainDraft = () => {
    setTool('mountain');
    setSelectedMountain(null);
    setDraftPoints([]);
    clearVolcanoDrag();
  };

  const finishDraft = () => {
    const current = stateRef.current.map;
    if (!current) return;
    if (barrierKind === 'volcano') return;
    if (!(mountainWidth > 0)) {
      setToast('El ancho del separador debe ser mayor que cero.');
      return;
    }
    if (draftPoints.length < 2) {
      setToast('Añade al menos dos puntos para crear un separador.');
      return;
    }
    const points = draftPoints.map(([x, z]) => [x, z] as [number, number]);
    const mountains = [
      ...cloneMountains(current.mountains),
      { kind: barrierKind, width: mountainWidth, points }
    ];
    updateMap({ ...current, mountains }, true);
    setSelectedMountain(mountains.length - 1);
    setDraftPoints([]);
    setToast(`${barrierLabel(barrierKind)} añadido. Arrastra uno de sus puntos para moverlo.`);
  };

  const removeMountain = (index: number) => {
    const current = stateRef.current.map;
    if (!current || !current.mountains[index]) return;
    const removed = current.mountains[index];
    const mountains = cloneMountains(current.mountains);
    mountains.splice(index, 1);
    updateMap({ ...current, mountains }, true);
    setSelectedMountain(null);
    setDraftPoints([]);
    setToast(`${barrierLabel(removed.kind)} eliminado.`);
  };

  const updateMountainWidth = (width: number) => {
    setMountainWidth(width);
    if (selectedMountain === null) return;
    mutateMountains((mountains) => {
      const range = mountains[selectedMountain];
      if (!range || range.width === width) return false;
      range.width = width;
      return true;
    }, false);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (setupOpen || (event.button !== 0 && event.button !== 2)) return;
    const cell = cellFromPointer(event);
    if (!cell) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === 'pickup') {
      editPickupCell(cell.row, cell.col, event.button === 2);
      return;
    }

    if (tool === 'mountain') {
      const current = stateRef.current.map;
      if (!current) return;

      if (event.button === 2) {
        if (draftPoints.length > 0) {
          setDraftPoints((previous) => previous.slice(0, -1));
          return;
        }
        const pointHit = findMountainPoint(event);
        if (pointHit) {
          const range = current.mountains[pointHit.rangeIndex];
          if (range?.kind === 'volcano') {
            setToast('El volcán necesita su centro; usa la × de la lista para quitarlo.');
          } else if (range && range.points.length <= 2) {
            setToast('Un separador necesita al menos dos puntos.');
          } else if (range) {
            const mountains = cloneMountains(current.mountains);
            mountains[pointHit.rangeIndex].points.splice(pointHit.pointIndex, 1);
            updateMap({ ...current, mountains }, true);
            setSelectedMountain(pointHit.rangeIndex);
            setToast('Punto del separador eliminado.');
          }
        } else {
          setSelectedMountain(null);
        }
        return;
      }

      if (draftPoints.length > 0) {
        const point = cellCenter(
          current.cols,
          current.rows,
          current.meta.tileSize,
          cell.row,
          cell.col
        );
        setDraftPoints((previous) => {
          const last = previous[previous.length - 1];
          if (last && last[0] === point.x && last[1] === point.z) return previous;
          return [...previous, [point.x, point.z]];
        });
        return;
      }

      const pointHit = findMountainPoint(event);
      if (pointHit) {
        selectMountain(pointHit.rangeIndex);
        mountainDragRef.current = { ...pointHit, moved: false };
        return;
      }

      const lineHit = findMountainLine(event);
      if (lineHit !== null) {
        selectMountain(lineHit);
        return;
      }

      const point = cellCenter(
        current.cols,
        current.rows,
        current.meta.tileSize,
        cell.row,
        cell.col
      );
      setSelectedMountain(null);
      if (barrierKind === 'volcano') {
        // Se muestra la huella cuadrada desde el primer clic; al arrastrar se
        // ajusta el cuadrado y al soltar se crea el volcán.
        volcanoAnchorRef.current = {
          x: point.x,
          z: point.z,
          row: cell.row,
          col: cell.col
        };
        setVolcanoDraftNow({ x: point.x, z: point.z, size: mountainWidth });
        return;
      }
      setDraftPoints([[point.x, point.z]]);
      return;
    }

    const active: Tool = event.button === 2 ? 'eraser' : tool;
    dragRef.current = {
      tool: active,
      lastRow: cell.row,
      lastCol: cell.col,
      startRow: cell.row,
      startCol: cell.col
    };

    if (active === 'rect') {
      setRect({ rowA: cell.row, colA: cell.col, rowB: cell.row, colB: cell.col });
      return;
    }

    applyTool(cell.row, cell.col, active, true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const cell = cellFromPointer(event);
    setHover((previous) =>
      previous && cell && previous.row === cell.row && previous.col === cell.col
        ? previous
        : cell
    );

    const volcanoAnchor = volcanoAnchorRef.current;
    if (volcanoAnchor) {
      if (!cell) return;
      const current = stateRef.current.map;
      if (!current) return;
      // Mientras el puntero siga en la celda inicial se mantiene la huella del
      // campo «Ancho»; al salir, el arrastre define un cuadrado de esquina a
      // esquina y el campo se actualiza con el lado resultante.
      if (cell.row === volcanoAnchor.row && cell.col === volcanoAnchor.col) {
        setVolcanoDraftNow({
          x: volcanoAnchor.x,
          z: volcanoAnchor.z,
          size: mountainWidth
        });
        return;
      }
      const point = cellCenter(
        current.cols,
        current.rows,
        current.meta.tileSize,
        cell.row,
        cell.col
      );
      const left = Math.min(volcanoAnchor.x, point.x);
      const right = Math.max(volcanoAnchor.x, point.x);
      const top = Math.min(volcanoAnchor.z, point.z);
      const bottom = Math.max(volcanoAnchor.z, point.z);
      const side = Math.max(
        right - left,
        bottom - top,
        current.meta.tileSize * 0.5
      );
      setVolcanoDraftNow({
        x: (left + right) / 2,
        z: (top + bottom) / 2,
        size: side
      });
      return;
    }

    const mountainDrag = mountainDragRef.current;
    if (mountainDrag) {
      if (!cell) return;
      const current = stateRef.current.map;
      if (!current) return;
      const point = cellCenter(current.cols, current.rows, current.meta.tileSize, cell.row, cell.col);
      const changed = mutateMountains((mountains) => {
        const target = mountains[mountainDrag.rangeIndex]?.points[mountainDrag.pointIndex];
        if (!target || (target[0] === point.x && target[1] === point.z)) return false;
        target[0] = point.x;
        target[1] = point.z;
        return true;
      }, !mountainDrag.moved);
      if (changed) mountainDrag.moved = true;
      return;
    }

    const drag = dragRef.current;
    if (!drag || !cell) return;

    if (drag.tool === 'rect') {
      if (cell.row !== drag.lastRow || cell.col !== drag.lastCol) {
        drag.lastRow = cell.row;
        drag.lastCol = cell.col;
        setRect({
          rowA: drag.startRow,
          colA: drag.startCol,
          rowB: cell.row,
          colB: cell.col
        });
      }
      return;
    }

    if (drag.tool === 'pencil' || drag.tool === 'eraser') {
      if (cell.row !== drag.lastRow || cell.col !== drag.lastCol) {
        const current = stateRef.current.map;
        if (!current) return;
        const paint = drag.tool === 'eraser' ? current.background : terrain;
        const fromRow = drag.lastRow;
        const fromCol = drag.lastCol;
        drag.lastRow = cell.row;
        drag.lastCol = cell.col;
        mutateTiles(
          (tiles) => paintLineInPlace(tiles, fromRow, fromCol, cell.row, cell.col, paint),
          false
        );
      }
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (volcanoAnchorRef.current) {
      const draft = volcanoDraftRef.current;
      volcanoAnchorRef.current = null;
      setVolcanoDraftNow(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const current = stateRef.current.map;
      if (!current || !draft || !(draft.size > 0)) return;
      // Lado con una décima de precisión, para que el campo «Ancho» no muestre
      // decimales interminables al soltar el arrastre.
      const size = Math.max(0.2, Math.round(draft.size * 10) / 10);
      const mountains = [
        ...cloneMountains(current.mountains),
        {
          kind: 'volcano' as const,
          width: size,
          points: [[draft.x, draft.z] as [number, number]]
        }
      ];
      updateMap({ ...current, mountains }, true);
      setSelectedMountain(mountains.length - 1);
      setMountainWidth(size);
      setToast('Volcán añadido. Arrastra su centro para moverlo.');
      return;
    }

    if (mountainDragRef.current) {
      mountainDragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }

    const drag = dragRef.current;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!drag || drag.tool !== 'rect') return;
    mutateTiles(
      (tiles) =>
        paintRectInPlace(
          tiles,
          drag.startRow,
          drag.startCol,
          drag.lastRow,
          drag.lastCol,
          terrain
        ),
      true
    );
    setRect(null);
  };

  const onDoubleClick = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (tool !== 'mountain' || barrierKind === 'volcano') return;
    if (draftPoints.length >= 2) {
      event.preventDefault();
      finishDraft();
      return;
    }
    if (draftPoints.length === 1) return;
    if (findMountainPoint(event)) return;

    const segment = findMountainSegment(event);
    const current = stateRef.current.map;
    if (!segment || !current) return;
    event.preventDefault();
    const mountains = cloneMountains(current.mountains);
    mountains[segment.rangeIndex].points.splice(segment.insertIndex, 0, segment.point);
    updateMap({ ...current, mountains }, true);
    setSelectedMountain(segment.rangeIndex);
    setToast('Punto añadido al separador.');
  };

  const selectTerrain = (next: TerrainId) => {
    setTerrain(next);
    if (
      tool === 'eraser' ||
      tool === 'mountain' ||
      tool === 'pickup' ||
      tool.startsWith('base-')
    ) {
      changeTool('pencil');
    }
  };

  const buildJson = () => {
    const result = buildEditorJson(stateRef.current.map);
    if (result.error) setToast(result.error);
    return result.json;
  };

  const exportJson = () => {
    const json = buildJson();
    if (!json) return;
    downloadEditorJson(json);
    setToast(`Mapa "${json.name}" exportado.`);
  };

  const copyJson = async () => {
    const json = buildJson();
    if (!json) return;
    if (await copyEditorJson(json)) setToast('JSON copiado al portapapeles.');
    else setToast('No se pudo copiar. Usa Exportar JSON.');
  };

  const importRaw = (raw: unknown) => {
    const imported = importEditorMap(raw);
    commit({ map: imported, undo: [], redo: [] });
    setTerrain(imported.background);
    setZoom(1);
    setSelectedMountain(null);
    setDraftPoints([]);
    setMountainWidth(imported.mountains[0]?.width ?? DEFAULT_MOUNTAIN_WIDTH);
    setBarrierKind(imported.mountains[0]?.kind ?? 'mountain');
    syncSizeInputs(imported.cols, imported.rows);
    setSetupOpen(false);
    setFormError(null);
    setToast(`Mapa "${imported.meta.name}" importado.`);
  };

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const errorMessage = await readFileChange(event, importRaw);
    if (errorMessage === null) return;
    if (setupOpen) setFormError(errorMessage);
    else setToast(errorMessage);
  };

  const loadExisting = async (entry: MapIndexEntry) => {
    try {
      importRaw(await fetchEditorMap(entry));
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'No se pudo cargar el mapa.');
    }
  };

  const openNewMap = () => {
    setForm(setupFormFrom(null));
    setFormError(null);
    setSetupOpen(true);
  };

  const createFromForm = () => {
    const cols = Number(form.cols);
    const rows = Number(form.rows);
    const tileSize = Number(form.tileSize);
    const waterHeight = Number(form.waterHeight);

    if (!Number.isFinite(cols) || cols < EDITOR_MIN_SIZE || cols > EDITOR_MAX_SIZE) {
      setFormError(`El ancho debe estar entre ${EDITOR_MIN_SIZE} y ${EDITOR_MAX_SIZE}.`);
      return;
    }
    if (!Number.isFinite(rows) || rows < EDITOR_MIN_SIZE || rows > EDITOR_MAX_SIZE) {
      setFormError(`El alto debe estar entre ${EDITOR_MIN_SIZE} y ${EDITOR_MAX_SIZE}.`);
      return;
    }
    if (!Number.isFinite(tileSize) || tileSize <= 0) {
      setFormError('El tamaño de celda debe ser mayor que cero.');
      return;
    }
    if (!Number.isFinite(waterHeight)) {
      setFormError('La altura del agua debe ser un número.');
      return;
    }

    const next = createEditorMap({
      id: form.id.trim() || 'mi-mapa',
      name: form.name.trim() || 'Mi mapa',
      cols,
      rows,
      tileSize,
      waterHeight,
      fill: form.fill
    });
    commit({ map: next, undo: [], redo: [] });
    setTerrain(next.background);
    setZoom(1);
    setSelectedMountain(null);
    setDraftPoints([]);
    setMountainWidth(DEFAULT_MOUNTAIN_WIDTH);
    syncSizeInputs(next.cols, next.rows);
    setSetupOpen(false);
    setFormError(null);
    setToast(`Mapa ${next.cols} × ${next.rows} creado.`);
  };

  const applyResize = () => {
    const current = stateRef.current.map;
    if (!current) return;
    const cols = Number(colsInputRef.current?.value ?? '');
    const rows = Number(rowsInputRef.current?.value ?? '');
    if (!Number.isFinite(cols) || cols < EDITOR_MIN_SIZE || cols > EDITOR_MAX_SIZE) {
      setToast(`El ancho debe estar entre ${EDITOR_MIN_SIZE} y ${EDITOR_MAX_SIZE}.`);
      return;
    }
    if (!Number.isFinite(rows) || rows < EDITOR_MIN_SIZE || rows > EDITOR_MAX_SIZE) {
      setToast(`El alto debe estar entre ${EDITOR_MIN_SIZE} y ${EDITOR_MAX_SIZE}.`);
      return;
    }
    const next = resizeEditorMap(current, cols, rows);
    if (!next) {
      setToast('El mapa ya tiene ese tamaño.');
      return;
    }
    updateMap(next, true);
    syncSizeInputs(next.cols, next.rows);
    setToast(`Rejilla redimensionada a ${next.cols} × ${next.rows}.`);
  };

  // --- Atajos de teclado -----------------------------------------------------

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (modifier && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (modifier && key === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if (modifier) return;

      const nextTool = toolForKey(key);
      if (nextTool) {
        if (nextTool !== 'mountain') setDraftPoints([]);
        setTool(nextTool);
      } else if (key === '+' || key === '=') setZoom((value) => Math.min(8, value * 1.25));
      else if (key === '-') setZoom((value) => Math.max(0.25, value / 1.25));
      else if (key === '0') setZoom(1);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Los atajos leen la última versión de los manejadores sin re-registrarse.
  const mountainActionsRef = useRef({ finishDraft, removeMountain });
  useEffect(() => {
    mountainActionsRef.current = { finishDraft, removeMountain };
  });

  // Atajos propios del trazado de cordilleras. Se registran aparte para leer
  // siempre el borrador y la selección actuales.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === 'Escape') {
        if (draftPoints.length > 0) {
          event.preventDefault();
          setDraftPoints([]);
        }
        return;
      }
      if (event.key === 'Enter' && tool === 'mountain' && draftPoints.length > 0) {
        event.preventDefault();
        mountainActionsRef.current.finishDraft();
        return;
      }
      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        tool === 'mountain' &&
        draftPoints.length === 0 &&
        selectedMountain !== null
      ) {
        event.preventDefault();
        mountainActionsRef.current.removeMountain(selectedMountain);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [draftPoints, tool, selectedMountain]);

  // --- Autoguardado y medidas ------------------------------------------------

  useEffect(() => {
    const timer = window.setTimeout(saveDraftNow, 350);
    return () => window.clearTimeout(timer);
  }, [state.map]);

  // Al salir del editor se guarda el último cambio sin esperar al debounce.
  useEffect(() => () => saveDraftNow(), []);

  useEffect(() => {
    const element = gridAreaRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setViewport({
        width: entry.contentRect.width,
        height: entry.contentRect.height
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const cellSize = useMemo(() => {
    if (!map) return 12;
    const width = Math.max(120, viewport.width);
    const height = Math.max(120, viewport.height);
    const fit = Math.min(width / map.cols, height / map.rows);
    return Math.max(2, Math.floor(fit * zoom));
  }, [map, viewport, zoom]);

  const counts = useMemo(() => {
    const result = Object.fromEntries(TERRAIN_IDS.map((id) => [id, 0])) as Record<
      TerrainId,
      number
    >;
    if (map) {
      for (const row of map.tiles) {
        for (const value of row) result[value] += 1;
      }
    }
    return result;
  }, [map]);

  const issues = useMemo(() => mapIssues(map), [map]);

  const hoverTerrain = hover && map ? map.tiles[hover.row][hover.col] : null;

  // --- Dibujo de la rejilla --------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map) return;
    drawEditorCanvas({
      canvas,
      map,
      cellSize,
      hover,
      rect,
      terrain,
      tool,
      selectedMountain,
      draftPoints,
      volcanoDraft,
      mountainWidth,
      barrierKind
    });
  }, [
    map,
    cellSize,
    hover,
    rect,
    terrain,
    tool,
    selectedMountain,
    draftPoints,
    volcanoDraft,
    mountainWidth,
    barrierKind
  ]);

  const activeTool = TOOLS.find((entry) => entry.id === tool);
  const canExport = map !== null && issues.length === 0;

  return (
    <div className="fixed inset-0 z-30 flex animate-fade-in flex-col bg-[radial-gradient(circle_at_18%_8%,#122033_0%,#080d15_46%,#05080d_100%)]">
      <EditorToolbar
        map={map}
        canExport={canExport}
        fileRef={fileRef}
        openNewMap={openNewMap}
        copyJson={copyJson}
        exportJson={exportJson}
        exitEditor={exitEditor}
        onFileChange={onFileChange}
      />

      <div className="flex min-h-0 flex-1 max-[980px]:flex-col max-[980px]:overflow-y-auto">
        <EditorToolsPanel
          tool={tool}
          terrain={terrain}
          counts={counts}
          undoCount={state.undo.length}
          redoCount={state.redo.length}
          changeTool={changeTool}
          undo={undo}
          redo={redo}
          selectTerrain={selectTerrain}
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2 text-11.2 text-muted">
            <span className="font-mono text-9.92 tracking-[0.08em] uppercase text-steel-450">
              {activeTool?.label ?? 'Herramienta'}
            </span>
            <span>
              Celda:{' '}
              <strong className="font-mono text-ink">
                {hover ? `${hover.row} · ${hover.col}` : '—'}
              </strong>
            </span>
            <span>
              Terreno:{' '}
              <strong className="text-ink">
                {hoverTerrain ? TERRAINS[hoverTerrain].name : '—'}
              </strong>
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                className={btnClass('ghost', 'tiny')}
                onClick={() => setZoom((value) => Math.max(0.25, value / 1.25))}
                title="Alejar (-)"
              >
                −
              </button>
              <span className="w-12 text-center font-mono text-10.88 tabular-nums text-ink">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                className={btnClass('ghost', 'tiny')}
                onClick={() => setZoom((value) => Math.min(8, value * 1.25))}
                title="Acercar (+)"
              >
                +
              </button>
              <button
                type="button"
                className={btnClass('ghost', 'tiny')}
                onClick={() => setZoom(1)}
                title="Ajustar a la ventana (0)"
              >
                Ajustar
              </button>
            </span>
          </div>

          <div
            ref={gridAreaRef}
            className="flex min-h-0 flex-1 overflow-auto p-6"
          >
            {map ? (
              <canvas
                ref={canvasRef}
                aria-label="Rejilla del mapa"
                className="m-auto shrink-0 cursor-crosshair touch-none rounded-sm shadow-[0_18px_50px_rgb(0_0_0/0.55)] outline outline-white/10"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onDoubleClick={onDoubleClick}
                onPointerLeave={() => setHover(null)}
                onContextMenu={(event) => event.preventDefault()}
              />
            ) : (
              <div className="m-auto text-center text-muted">
                <p className="text-14.4">Todavía no hay ningún mapa.</p>
                <button
                  type="button"
                  className={`${btnClass('primary')} mt-3`}
                  onClick={openNewMap}
                >
                  Crear el primero
                </button>
              </div>
            )}
          </div>

          <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2 font-mono text-10.08 text-steel-650">
            <span>
              Rejilla {map ? `${map.cols} × ${map.rows}` : '—'} ·{' '}
              {map ? map.cols * map.rows : 0} celdas
            </span>
            <span>
              Fondo: <strong className="text-steel-350">{TERRAINS[map?.background ?? 'jungle'].name}</strong>
            </span>
            <span className="ml-auto">
              <KeyPill>B</KeyPill> lápiz · <KeyPill>G</KeyPill> relleno · <KeyPill>R</KeyPill>{' '}
              rectángulo · <KeyPill>E</KeyPill> borrador · <KeyPill>M</KeyPill> separador ·{' '}
              <KeyPill>P</KeyPill> objeto · <KeyPill>Ctrl+Z</KeyPill> deshacer
            </span>
          </footer>
        </main>

        <EditorPropertiesPanel
          map={map}
          colsInputRef={colsInputRef}
          rowsInputRef={rowsInputRef}
          tool={tool}
          pickupType={pickupType}
          selectedMountain={selectedMountain}
          draftPoints={draftPoints}
          barrierKind={barrierKind}
          mountainWidth={mountainWidth}
          issues={issues}
          changeTool={changeTool}
          setPickupType={setPickupType}
          updateMeta={updateMeta}
          updateBaseRadius={updateBaseRadius}
          applyResize={applyResize}
          removeBase={removeBase}
          mutatePickups={mutatePickups}
          selectMountain={selectMountain}
          removeMountain={removeMountain}
          changeBarrierKind={changeBarrierKind}
          updateMountainWidth={updateMountainWidth}
          startMountainDraft={startMountainDraft}
          finishDraft={finishDraft}
          clearDraftPoints={() => setDraftPoints([])}
        />
      </div>

      {setupOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-night-900/82 p-4 backdrop-blur-[6px]">
          <div className="w-[min(560px,100%)] animate-pop-in rounded-panel border border-line bg-panel-strong p-5 shadow-[0_34px_80px_rgb(0_0_0/0.6)]">
            <span className={eyebrow}>Nuevo mapa</span>
            <h2 className="mt-1 text-2xl">Elige las dimensiones</h2>
            <p className="mt-1.5 text-12.8 leading-[1.55] text-muted">
              Elige el ancho y el alto de la rejilla; pueden ser distintos. Después podrás pintar
              celda a celda y colocar las dos bases.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <label className={`${fieldClass} col-span-2`}>
                <span>Nombre visible</span>
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </label>
              <label className={`${fieldClass} col-span-2`}>
                <span>Id (nombre del archivo)</span>
                <input
                  className={inputClass}
                  value={form.id}
                  onChange={(event) => setForm({ ...form, id: event.target.value })}
                />
              </label>
              <label className={fieldClass}>
                <span>Ancho (columnas)</span>
                <input
                  className={inputClass}
                  type="number"
                  min={EDITOR_MIN_SIZE}
                  max={EDITOR_MAX_SIZE}
                  step={2}
                  value={form.cols}
                  onChange={(event) => setForm({ ...form, cols: event.target.value })}
                />
              </label>
              <label className={fieldClass}>
                <span>Alto (filas)</span>
                <input
                  className={inputClass}
                  type="number"
                  min={EDITOR_MIN_SIZE}
                  max={EDITOR_MAX_SIZE}
                  step={2}
                  value={form.rows}
                  onChange={(event) => setForm({ ...form, rows: event.target.value })}
                />
              </label>
              <div className="col-span-2 flex flex-wrap gap-1.5">
                {SIZE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={btnClass('ghost', 'tiny')}
                    onClick={() => setForm({ ...form, cols: String(preset), rows: String(preset) })}
                  >
                    {preset} × {preset}
                  </button>
                ))}
              </div>
              <label className={fieldClass}>
                <span>Tamaño de celda</span>
                <input
                  className={inputClass}
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={form.tileSize}
                  onChange={(event) => setForm({ ...form, tileSize: event.target.value })}
                />
              </label>
              <label className={fieldClass}>
                <span>Altura del agua</span>
                <input
                  className={inputClass}
                  type="number"
                  step={0.1}
                  value={form.waterHeight}
                  onChange={(event) => setForm({ ...form, waterHeight: event.target.value })}
                />
              </label>
              <label className={`${fieldClass} col-span-2`}>
                <span>Terreno de fondo</span>
                <select
                  className={inputClass}
                  value={form.fill}
                  onChange={(event) =>
                    setForm({ ...form, fill: event.target.value as TerrainId })
                  }
                >
                  {TERRAIN_IDS.map((id) => (
                    <option key={id} value={id}>
                      {TERRAINS[id].name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {formError && (
              <p className="mt-3 rounded-[9px] border border-danger/25 bg-danger/9 px-2.5 py-2 text-xs/normal text-danger-100">
                {formError}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" className={btnClass('primary', 'small')} onClick={createFromForm}>
                Crear mapa
              </button>
              <button
                type="button"
                className={btnClass('ghost', 'small')}
                onClick={() => fileRef.current?.click()}
              >
                Importar JSON
              </button>
              <select
                className={`${inputClass} w-auto min-w-42.5 flex-1`}
                value=""
                onChange={(event) => {
                  const entry = maps.find((candidate) => candidate.id === event.target.value);
                  if (entry) void loadExisting(entry);
                }}
              >
                <option value="">Cargar mapa existente…</option>
                {maps.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
              {state.map && (
                <button
                  type="button"
                  className={btnClass('ghost', 'small')}
                  onClick={() => {
                    setSetupOpen(false);
                    setFormError(null);
                  }}
                >
                  Cancelar
                </button>
              )}
            </div>

            <p className="mt-3 border-t border-line pt-2.5 text-10.88/normal text-muted">
              Crear un mapa nuevo reemplaza el borrador actual. El editor guarda el mapa en este
              navegador automáticamente; para usarlo en el juego, exporta el JSON a{' '}
              <code className="font-mono text-steel-350">public/maps/</code> y añádelo a{' '}
              <code className="font-mono text-steel-350">index.json</code>.
            </p>
          </div>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none absolute bottom-14 left-1/2 z-50 -translate-x-1/2 animate-rise-in rounded-xl border border-line bg-night-700/95 px-4 py-2 text-12.48 text-ink shadow-[0_18px_40px_rgb(0_0_0/0.5)]">
          {toast}
        </div>
      )}
    </div>
  );
}
