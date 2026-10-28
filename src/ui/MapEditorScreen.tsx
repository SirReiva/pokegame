import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent
} from 'react';
import type { MapIndexEntry } from '../game/map';
import {
  EDITOR_DEFAULT_SIZE,
  EDITOR_DEFAULT_TILE_SIZE,
  EDITOR_DEFAULT_WATER_HEIGHT,
  EDITOR_HISTORY_LIMIT,
  EDITOR_MAX_SIZE,
  EDITOR_MIN_SIZE,
  TERRAIN_SWATCHES,
  applySnapshot,
  cloneBases,
  cloneTiles,
  createEditorMap,
  editorMapFromJson,
  editorMapToJson,
  floodFillInPlace,
  paintCellInPlace,
  paintLineInPlace,
  paintRectInPlace,
  readEditorDraft,
  resizeEditorMap,
  setBaseInPlace,
  snapshotOf,
  validateEditorMap,
  type EditorBase,
  type EditorMap,
  type EditorMapJson,
  type EditorMeta,
  type EditorSnapshot
} from '../game/mapEditor';
import { TERRAIN_IDS, TERRAINS, type Team, type TerrainId } from '../game/terrain';
import { Brand } from './Brand';
import { btnClass } from './buttonStyles';
import { KeyPill } from './KeyPill';
import { eyebrow } from './styles';
import { TypeBadge } from './TypeBadge';

interface MapEditorScreenProps {
  maps: MapIndexEntry[];
  onExit: () => void;
}

type Tool = 'pencil' | 'fill' | 'rect' | 'eraser' | 'base-blue' | 'base-red';

interface EditorState {
  map: EditorMap | null;
  undo: EditorSnapshot[];
  redo: EditorSnapshot[];
}

interface SetupForm {
  id: string;
  name: string;
  cols: string;
  rows: string;
  tileSize: string;
  waterHeight: string;
  fill: TerrainId;
}

interface Cell {
  row: number;
  col: number;
}

const DRAFT_KEY = 'newpoke.map-editor.draft.v1';
const SIZE_PRESETS = [16, 24, 32, 48, 64, 76];

const TOOLS: Array<{ id: Tool; label: string; key: string; title: string }> = [
  { id: 'pencil', label: 'Lápiz', key: 'B', title: 'Pinta celdas al arrastrar' },
  { id: 'fill', label: 'Relleno', key: 'G', title: 'Rellena la región conectada del mismo terreno' },
  { id: 'rect', label: 'Rectángulo', key: 'R', title: 'Arrastra para pintar un rectángulo' },
  { id: 'eraser', label: 'Borrador', key: 'E', title: 'Pinta con el terreno de fondo' },
  { id: 'base-blue', label: 'Base azul', key: '1', title: 'Coloca o mueve la base del equipo azul' },
  { id: 'base-red', label: 'Base roja', key: '2', title: 'Coloca o mueve la base del equipo rojo' }
];

const sectionTitle =
  'mb-2 font-mono text-[0.63rem] tracking-[0.16em] uppercase text-muted';
const inputClass =
  'w-full rounded-[9px] border border-line bg-[#070c14]/80 px-2.5 py-1.5 font-mono text-[0.76rem] text-ink outline-none transition-colors focus:border-accent/60';
const fieldClass = 'flex flex-col gap-1 text-[0.7rem] text-muted';

function loadDraft(): EditorState {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      const draft = readEditorDraft(parsed);
      if (draft) {
        return {
          map: { ...draft, mountains: draft.mountains ?? [] },
          undo: [],
          redo: []
        };
      }
    }
  } catch {
    // Borrador corrupto o localStorage no disponible: se empieza de cero.
  }
  return { map: null, undo: [], redo: [] };
}

function setupFormFrom(map: EditorMap | null): SetupForm {
  if (map) {
    return {
      id: map.meta.id,
      name: map.meta.name,
      cols: String(map.cols),
      rows: String(map.rows),
      tileSize: String(map.meta.tileSize),
      waterHeight: String(map.meta.waterHeight),
      fill: map.background
    };
  }
  return {
    id: 'mi-mapa',
    name: 'Mi mapa',
    cols: String(EDITOR_DEFAULT_SIZE),
    rows: String(EDITOR_DEFAULT_SIZE),
    tileSize: String(EDITOR_DEFAULT_TILE_SIZE),
    waterHeight: String(EDITOR_DEFAULT_WATER_HEIGHT),
    fill: 'jungle'
  };
}

function teamColor(team: Team): string {
  return team === 'blue' ? '#4b9cff' : '#ff5f63';
}

function teamLabel(team: Team): string {
  return team === 'blue' ? 'Azul' : 'Roja';
}

export function MapEditorScreen({ maps, onExit }: MapEditorScreenProps) {
  const initial = useMemo(() => loadDraft(), []);
  const [state, setState] = useState<EditorState>(initial);
  const stateRef = useRef<EditorState>(initial);

  const [tool, setTool] = useState<Tool>('pencil');
  const [terrain, setTerrain] = useState<TerrainId>(initial.map?.background ?? 'jungle');
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<Cell | null>(null);
  const [rect, setRect] = useState<{ rowA: number; colA: number; rowB: number; colB: number } | null>(
    null
  );
  const [setupOpen, setSetupOpen] = useState(initial.map === null);
  const [form, setForm] = useState<SetupForm>(() => setupFormFrom(initial.map));
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ width: 900, height: 640 });

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

  const map = state.map;
  const mapCols = map?.cols;
  const mapRows = map?.rows;

  const commit = (next: EditorState) => {
    stateRef.current = next;
    setState(next);
  };

  const saveDraft = () => {
    try {
      const current = stateRef.current.map;
      if (current) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(current));
      else window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Sin espacio o en modo privado: el editor sigue funcionando en memoria.
    }
  };

  const exitEditor = () => {
    saveDraft();
    onExit();
  };

  const syncSizeInputs = (cols: number, rows: number) => {
    if (colsInputRef.current) colsInputRef.current.value = String(cols);
    if (rowsInputRef.current) rowsInputRef.current.value = String(rows);
  };

  const updateMap = (nextMap: EditorMap, pushHistory = true) => {
    const current = stateRef.current;
    if (!current.map) return;
    const next: EditorState = pushHistory
      ? {
          map: nextMap,
          undo: [...current.undo, snapshotOf(current.map)].slice(-EDITOR_HISTORY_LIMIT),
          redo: []
        }
      : { map: nextMap, undo: current.undo, redo: current.redo };
    commit(next);
  };

  const undo = () => {
    const current = stateRef.current;
    if (!current.map || current.undo.length === 0) return;
    const previous = current.undo[current.undo.length - 1];
    commit({
      map: applySnapshot(current.map, previous),
      undo: current.undo.slice(0, -1),
      redo: [...current.redo, snapshotOf(current.map)].slice(-EDITOR_HISTORY_LIMIT)
    });
  };

  const redo = () => {
    const current = stateRef.current;
    if (!current.map || current.redo.length === 0) return;
    const next = current.redo[current.redo.length - 1];
    commit({
      map: applySnapshot(current.map, next),
      undo: [...current.undo, snapshotOf(current.map)].slice(-EDITOR_HISTORY_LIMIT),
      redo: current.redo.slice(0, -1)
    });
  };

  const mutateTiles = (
    mutate: (tiles: TerrainId[][]) => boolean,
    pushHistory = true
  ) => {
    const current = stateRef.current.map;
    if (!current) return;
    const tiles = cloneTiles(current.tiles);
    if (!mutate(tiles)) return;
    updateMap({ ...current, tiles }, pushHistory);
  };

  const mutateBases = (mutate: (bases: EditorMap['bases']) => boolean, pushHistory = true) => {
    const current = stateRef.current.map;
    if (!current) return;
    const bases = cloneBases(current.bases);
    if (!mutate(bases)) return;
    updateMap({ ...current, bases }, pushHistory);
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
    if (bases.blue) bases.blue.radius = radius;
    if (bases.red) bases.red.radius = radius;
    updateMap(
      { ...current, meta: { ...current.meta, baseRadius: radius }, bases },
      false
    );
  };

  const applyTool = (row: number, col: number, activeTool: Tool, pushHistory: boolean) => {
    const current = stateRef.current.map;
    if (!current) return;

    if (activeTool === 'pencil' || activeTool === 'eraser') {
      const paint = activeTool === 'eraser' ? current.background : terrain;
      mutateTiles((tiles) => paintCellInPlace(tiles, row, col, paint), pushHistory);
    } else if (activeTool === 'fill') {
      mutateTiles((tiles) => floodFillInPlace(tiles, row, col, terrain), pushHistory);
    } else if (activeTool === 'base-blue' || activeTool === 'base-red') {
      const team: Team = activeTool === 'base-blue' ? 'blue' : 'red';
      mutateBases(
        (bases) => setBaseInPlace(bases, team, row, col, current.meta.baseRadius),
        pushHistory
      );
    }
  };

  const cellFromPointer = (event: ReactPointerEvent<HTMLCanvasElement>): Cell | null => {
    const current = stateRef.current.map;
    if (!current) return null;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    const col = Math.floor(((event.clientX - bounds.left) / bounds.width) * current.cols);
    const row = Math.floor(((event.clientY - bounds.top) / bounds.height) * current.rows);
    if (row < 0 || col < 0 || row >= current.rows || col >= current.cols) return null;
    return { row, col };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (setupOpen || (event.button !== 0 && event.button !== 2)) return;
    const cell = cellFromPointer(event);
    if (!cell) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

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

  const selectTerrain = (next: TerrainId) => {
    setTerrain(next);
    if (tool === 'eraser' || tool === 'base-blue' || tool === 'base-red') setTool('pencil');
  };

  const buildJson = (): EditorMapJson | null => {
    const current = stateRef.current.map;
    if (!current) return null;
    const issues = validateEditorMap(current);
    if (issues.length > 0) {
      setToast(issues[0]);
      return null;
    }
    return editorMapToJson(current);
  };

  const exportJson = () => {
    const json = buildJson();
    if (!json) return;
    const text = `${JSON.stringify(json, null, 2)}\n`;
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${json.id}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast(`Mapa "${json.name}" exportado.`);
  };

  const copyJson = async () => {
    const json = buildJson();
    if (!json) return;
    try {
      await navigator.clipboard.writeText(`${JSON.stringify(json, null, 2)}\n`);
      setToast('JSON copiado al portapapeles.');
    } catch {
      setToast('No se pudo copiar. Usa Exportar JSON.');
    }
  };

  const importRaw = (raw: unknown) => {
    const imported = editorMapFromJson(raw);
    commit({ map: imported, undo: [], redo: [] });
    setTerrain(imported.background);
    setZoom(1);
    syncSizeInputs(imported.cols, imported.rows);
    setSetupOpen(false);
    setFormError(null);
    setToast(`Mapa "${imported.meta.name}" importado.`);
  };

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const raw: unknown = JSON.parse(await file.text());
      importRaw(raw);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'El archivo no es un JSON válido.';
      if (setupOpen) setFormError(message);
      else setToast(message);
    }
  };

  const loadExisting = async (entry: MapIndexEntry) => {
    try {
      const file = entry.file.replace(/^\/+/, '');
      const response = await fetch(`${import.meta.env.BASE_URL}maps/${file}`, {
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`No se pudo cargar el mapa (HTTP ${response.status}).`);
      importRaw(await response.json());
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

      if (key === 'b') setTool('pencil');
      else if (key === 'g') setTool('fill');
      else if (key === 'r') setTool('rect');
      else if (key === 'e') setTool('eraser');
      else if (key === '1') setTool('base-blue');
      else if (key === '2') setTool('base-red');
      else if (key === '+' || key === '=') setZoom((value) => Math.min(8, value * 1.25));
      else if (key === '-') setZoom((value) => Math.max(0.25, value / 1.25));
      else if (key === '0') setZoom(1);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // --- Autoguardado y medidas ------------------------------------------------

  useEffect(() => {
    const timer = window.setTimeout(saveDraft, 350);
    return () => window.clearTimeout(timer);
  }, [state.map]);

  // Al salir del editor se guarda el último cambio sin esperar al debounce.
  useEffect(() => () => saveDraft(), []);

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

  const issues = useMemo(() => (map ? validateEditorMap(map) : []), [map]);

  const hoverTerrain = hover && map ? map.tiles[hover.row][hover.col] : null;

  // --- Dibujo de la rejilla --------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map) return;

    const cssWidth = cellSize * map.cols;
    const cssHeight = cellSize * map.rows;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.max(1, Math.round(cssWidth * ratio));
    const pixelHeight = Math.max(1, Math.round(cssHeight * ratio));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, cssWidth, cssHeight);

    for (let row = 0; row < map.rows; row++) {
      const tiles = map.tiles[row];
      for (let col = 0; col < map.cols; col++) {
        context.fillStyle = TERRAIN_SWATCHES[tiles[col]];
        context.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
      }
    }

    if (cellSize >= 7) {
      context.strokeStyle = 'rgba(0, 0, 0, 0.22)';
      context.lineWidth = 1;
      context.beginPath();
      for (let col = 1; col < map.cols; col++) {
        const offset = col * cellSize + 0.5;
        context.moveTo(offset, 0);
        context.lineTo(offset, cssHeight);
      }
      for (let row = 1; row < map.rows; row++) {
        const offset = row * cellSize + 0.5;
        context.moveTo(0, offset);
        context.lineTo(cssWidth, offset);
      }
      context.stroke();
    }

    const drawBase = (base: EditorBase) => {
      const centerX = (base.col + 0.5) * cellSize;
      const centerY = (base.row + 0.5) * cellSize;
      const radius = Math.max(3, cellSize * 1.1);
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.fillStyle = teamColor(base.team);
      context.globalAlpha = 0.88;
      context.fill();
      context.globalAlpha = 1;
      context.lineWidth = Math.max(1, cellSize * 0.16);
      context.strokeStyle = 'rgba(255, 255, 255, 0.92)';
      context.stroke();
      if (cellSize >= 14) {
        context.fillStyle = '#08101a';
        context.font = `700 ${Math.round(cellSize * 0.82)}px ui-monospace, monospace`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(base.team === 'blue' ? 'A' : 'R', centerX, centerY + 0.5);
      }
    };

    if (map.bases.blue) drawBase(map.bases.blue);
    if (map.bases.red) drawBase(map.bases.red);

    if (rect) {
      const rowA = Math.min(rect.rowA, rect.rowB);
      const rowB = Math.max(rect.rowA, rect.rowB);
      const colA = Math.min(rect.colA, rect.colB);
      const colB = Math.max(rect.colA, rect.colB);
      context.globalAlpha = 0.62;
      context.fillStyle = TERRAIN_SWATCHES[terrain];
      context.fillRect(
        colA * cellSize,
        rowA * cellSize,
        (colB - colA + 1) * cellSize,
        (rowB - rowA + 1) * cellSize
      );
      context.globalAlpha = 1;
      context.strokeStyle = 'rgba(255, 255, 255, 0.88)';
      context.lineWidth = 2;
      context.strokeRect(
        colA * cellSize + 1,
        rowA * cellSize + 1,
        (colB - colA + 1) * cellSize - 2,
        (rowB - rowA + 1) * cellSize - 2
      );
    }

    if (hover && cellSize >= 3) {
      context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      context.lineWidth = Math.max(1, Math.min(3, cellSize * 0.15));
      context.strokeRect(
        hover.col * cellSize + 0.5,
        hover.row * cellSize + 0.5,
        cellSize - 1,
        cellSize - 1
      );
    }
  }, [map, cellSize, hover, rect, terrain]);

  const activeTool = TOOLS.find((entry) => entry.id === tool);
  const canExport = map !== null && issues.length === 0;

  return (
    <div className="fixed inset-0 z-30 flex animate-fade-in flex-col bg-[image:radial-gradient(circle_at_18%_8%,#122033_0%,#080d15_46%,#05080d_100%)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel-strong px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Brand compact />
          <span className="hidden h-8 w-px bg-line sm:block" />
          <div>
            <span className={eyebrow}>Editor de mapas</span>
            <h1 className="mt-0.5 text-[1.1rem] leading-tight">
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

      <div className="flex min-h-0 flex-1 max-[980px]:flex-col max-[980px]:overflow-y-auto">
        <aside className="flex w-[264px] flex-none flex-col gap-4 overflow-y-auto border-r border-line bg-[#080d15]/80 p-3 max-[980px]:w-full max-[980px]:border-r-0 max-[980px]:border-b">
          <section>
            <h2 className={sectionTitle}>Herramientas</h2>
            <div className="grid grid-cols-2 gap-1.5">
              {TOOLS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  title={`${entry.title} (${entry.key})`}
                  className={btnClass(tool === entry.id ? 'primary' : 'ghost', 'small')}
                  onClick={() => setTool(entry.id)}
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
                disabled={state.undo.length === 0}
              >
                Deshacer
              </button>
              <button
                type="button"
                className={`${btnClass('ghost', 'small')} flex-1`}
                onClick={redo}
                disabled={state.redo.length === 0}
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
                  title={`${TERRAINS[id].name} · ${TERRAINS[id].type}`}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-[9px] border px-2 py-1.5 text-left transition-colors ${
                    terrain === id
                      ? 'border-accent/70 bg-accent/10'
                      : 'border-transparent hover:border-line hover:bg-white/[0.04]'
                  }`}
                  onClick={() => selectTerrain(id)}
                >
                  <span
                    className="size-4 flex-none rounded-[3px] border border-black/40 shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]"
                    style={{ background: TERRAIN_SWATCHES[id] }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[0.75rem] text-[#d7e2ee]">
                    {TERRAINS[id].name}
                  </span>
                  <TypeBadge type={TERRAINS[id].type} />
                  <span className="w-8 text-right font-mono text-[0.58rem] tabular-nums text-[#6f8298]">
                    {counts[id]}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2 text-[0.7rem] text-muted">
            <span className="font-mono text-[0.62rem] tracking-[0.08em] uppercase text-[#8fa3b8]">
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
              <span className="w-12 text-center font-mono text-[0.68rem] tabular-nums text-ink">
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
                className="m-auto shrink-0 cursor-crosshair touch-none rounded-[4px] shadow-[0_18px_50px_rgb(0_0_0/0.55)] outline outline-1 outline-white/10"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onPointerLeave={() => setHover(null)}
                onContextMenu={(event) => event.preventDefault()}
              />
            ) : (
              <div className="m-auto text-center text-muted">
                <p className="text-[0.9rem]">Todavía no hay ningún mapa.</p>
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

          <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2 font-mono text-[0.63rem] text-[#7f92a7]">
            <span>
              Rejilla {map ? `${map.cols} × ${map.rows}` : '—'} ·{' '}
              {map ? map.cols * map.rows : 0} celdas
            </span>
            <span>
              Fondo: <strong className="text-[#a9bccf]">{TERRAINS[map?.background ?? 'jungle'].name}</strong>
            </span>
            <span className="ml-auto">
              <KeyPill>B</KeyPill> lápiz · <KeyPill>G</KeyPill> relleno · <KeyPill>R</KeyPill>{' '}
              rectángulo · <KeyPill>E</KeyPill> borrador · <KeyPill>Ctrl+Z</KeyPill> deshacer
            </span>
          </footer>
        </main>

        <aside className="flex w-[286px] flex-none flex-col gap-5 overflow-y-auto border-l border-line bg-[#080d15]/80 p-4 max-[980px]:w-full max-[980px]:border-l-0 max-[980px]:border-t">
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
            <p className="mt-2 text-[0.68rem] leading-[1.5] text-muted">
              Redimensionar conserva la esquina noroeste y rellena lo nuevo con el terreno de fondo.
            </p>
            {map && map.mountains.length > 0 && (
              <p className="mt-2 rounded-[9px] border border-line bg-white/[0.03] px-2.5 py-2 text-[0.68rem] leading-[1.5] text-[#a9bccf]">
                Conserva {map.mountains.length}{' '}
                {map.mountains.length === 1 ? 'cordillera importada' : 'cordilleras importadas'}.
                No se editan aquí, pero se mantienen al exportar.
              </p>
            )}
          </section>

          <section>
            <h2 className={sectionTitle}>Bases</h2>
            <div className="flex flex-col gap-1.5">
              {(['blue', 'red'] as const).map((team) => {
                const base = map?.bases[team];
                return (
                  <div
                    key={team}
                    className="flex items-center gap-2 rounded-[9px] border border-line bg-white/[0.03] px-2 py-1.5"
                  >
                    <span
                      className="size-2.5 flex-none rounded-full"
                      style={{ background: teamColor(team) }}
                    />
                    <span className="text-[0.74rem] text-[#d7e2ee]">{teamLabel(team)}</span>
                    <span className="ml-auto font-mono text-[0.62rem] text-[#8fa3b8]">
                      {base ? `fila ${base.row} · col ${base.col}` : 'sin colocar'}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex gap-1.5">
              <button
                type="button"
                className={`${btnClass('ghost', 'tiny')} flex-1`}
                onClick={() => setTool('base-blue')}
              >
                Mover azul
              </button>
              <button
                type="button"
                className={`${btnClass('ghost', 'tiny')} flex-1`}
                onClick={() => setTool('base-red')}
              >
                Mover roja
              </button>
            </div>
          </section>

          <section>
            <h2 className={sectionTitle}>Validación</h2>
            {issues.length === 0 ? (
              <p className="rounded-[9px] border border-[#7ac74c]/25 bg-[#7ac74c]/[0.08] px-2.5 py-2 text-[0.72rem] text-[#bff39d]">
                El mapa está listo para exportar.
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {issues.map((issue) => (
                  <li
                    key={issue}
                    className="rounded-[9px] border border-[#ff5c5c]/25 bg-[#ff5c5c]/[0.08] px-2.5 py-1.5 text-[0.7rem] leading-[1.45] text-[#ffb2b5]"
                  >
                    {issue}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className={sectionTitle}>Atajos</h2>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[0.7rem] text-[#a9bccf]">
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
                <KeyPill>Ctrl+Z</KeyPill> deshacer · <KeyPill>Ctrl+Y</KeyPill> rehacer
              </li>
              <li className="flex items-center gap-2">
                <KeyPill>+ / −</KeyPill> zoom · <KeyPill>0</KeyPill> ajustar
              </li>
              <li className="text-[0.68rem] leading-[1.45] text-muted">
                Clic derecho pinta con el terreno de fondo. El borrador también usa el fondo.
              </li>
            </ul>
          </section>
        </aside>
      </div>

      {setupOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#04070c]/[0.82] p-4 backdrop-blur-[6px]">
          <div className="w-[min(560px,100%)] animate-pop-in rounded-[18px] border border-line bg-panel-strong p-5 shadow-[0_34px_80px_rgb(0_0_0/0.6)]">
            <span className={eyebrow}>Nuevo mapa</span>
            <h2 className="mt-1 text-[1.5rem]">Elige las dimensiones</h2>
            <p className="mt-1.5 text-[0.8rem] leading-[1.55] text-muted">
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
              <p className="mt-3 rounded-[9px] border border-[#ff5c5c]/25 bg-[#ff5c5c]/[0.09] px-2.5 py-2 text-[0.75rem] leading-[1.5] text-[#ffb2b5]">
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
                className={`${inputClass} w-auto min-w-[170px] flex-1`}
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

            <p className="mt-3 border-t border-line pt-2.5 text-[0.68rem] leading-[1.5] text-muted">
              Crear un mapa nuevo reemplaza el borrador actual. El editor guarda el mapa en este
              navegador automáticamente; para usarlo en el juego, exporta el JSON a{' '}
              <code className="font-mono text-[#a9bccf]">public/maps/</code> y añádelo a{' '}
              <code className="font-mono text-[#a9bccf]">index.json</code>.
            </p>
          </div>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none absolute bottom-14 left-1/2 z-50 -translate-x-1/2 animate-rise-in rounded-xl border border-line bg-[#0a121c]/95 px-4 py-2 text-[0.78rem] text-ink shadow-[0_18px_40px_rgb(0_0_0/0.5)]">
          {toast}
        </div>
      )}
    </div>
  );
}
