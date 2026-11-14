/**
 * Pintado de la rejilla del editor en un canvas 2D: terrenos, separadores,
 * bases, objetos, previsualización del rectángulo y celda bajo el puntero.
 */

import { ITEM_DEFINITIONS } from '../../game/items';
import {
  TERRAIN_SWATCHES,
  type EditorBase,
  type EditorMap
} from '../../game/mapEditor';
import { TEAM_IDS, type BarrierKind, type TerrainId } from '../../game/terrain';
import type { Cell, EditorRect, Tool } from './editorModel';
import { teamColor } from './editorModel';

const MOUNTAIN_COLOR = 'rgba(216, 199, 170, 0.9)';
const WALL_COLOR = 'rgba(184, 196, 210, 0.92)';
const MOUNTAIN_SELECTED_COLOR = '#7ac74c';

export interface EditorCanvasState {
  canvas: HTMLCanvasElement;
  map: EditorMap;
  cellSize: number;
  terrain: TerrainId;
  tool: Tool;
  selectedMountain: number | null;
  draftPoints: Array<[number, number]>;
  mountainWidth: number;
  barrierKind: BarrierKind;
  rect: EditorRect | null;
  hover: Cell | null;
}

export function drawEditorCanvas({
  canvas,
  map,
  cellSize,
  terrain,
  tool,
  selectedMountain,
  draftPoints,
  mountainWidth,
  barrierKind,
  rect,
  hover
}: EditorCanvasState): void {
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

  // --- Separadores ---------------------------------------------------------
  const halfX = (map.cols * map.meta.tileSize) / 2;
  const halfZ = (map.rows * map.meta.tileSize) / 2;
  const toCanvas = (x: number, z: number) => ({
    x: ((x + halfX) / map.meta.tileSize) * cellSize,
    y: ((z + halfZ) / map.meta.tileSize) * cellSize
  });

  const tracePoints = (points: Array<[number, number]>) => {
    if (points.length === 0) return;
    const first = toCanvas(points[0][0], points[0][1]);
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (let index = 1; index < points.length; index++) {
      const point = toCanvas(points[index][0], points[index][1]);
      context.lineTo(point.x, point.y);
    }
  };

  const showMountainHandles = tool === 'mountain';
  map.mountains.forEach((range, index) => {
    if (range.points.length === 0) return;
    const selected = showMountainHandles && selectedMountain === index;
    const isWall = range.kind === 'wall';
    const bandWidth = Math.max(3, (range.width / map.meta.tileSize) * cellSize);
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    tracePoints(range.points);
    context.strokeStyle = selected
      ? 'rgba(122, 199, 76, 0.4)'
      : isWall
        ? 'rgba(142, 158, 176, 0.38)'
        : 'rgba(196, 180, 158, 0.36)';
    context.lineWidth = bandWidth;
    context.stroke();
    context.strokeStyle = selected
      ? MOUNTAIN_SELECTED_COLOR
      : isWall
        ? WALL_COLOR
        : MOUNTAIN_COLOR;
    context.lineWidth = Math.max(1, Math.min(2, cellSize * 0.14));
    context.stroke();
    context.restore();
  });

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
      context.fillText(
        base.team === 'blue'
          ? 'A'
          : base.team === 'red'
            ? 'R'
            : base.team === 'yellow'
              ? 'M'
              : 'V',
        centerX,
        centerY + 0.5
      );
    }
  };

  for (const team of TEAM_IDS) {
    const base = map.bases[team];
    if (base) drawBase(base);
  }

  // --- Objetos recogibles --------------------------------------------------
  map.pickups.forEach((pickup) => {
    const definition = ITEM_DEFINITIONS[pickup.type];
    const centerX = (pickup.col + 0.5) * cellSize;
    const centerY = (pickup.row + 0.5) * cellSize;
    const radius = Math.max(2.5, Math.min(cellSize * 0.7, 9));
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fillStyle = definition.color;
    context.globalAlpha = 0.92;
    context.fill();
    context.globalAlpha = 1;
    context.lineWidth = Math.max(1, radius * 0.3);
    context.strokeStyle = 'rgba(8, 16, 26, 0.9)';
    context.stroke();
    if (cellSize >= 13) {
      context.fillStyle = '#fff7ea';
      context.font = `700 ${Math.max(7, Math.round(radius * 1.05))}px ui-monospace, monospace`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(definition.shortLabel, centerX, centerY + 0.5);
    }
  });

  if (showMountainHandles) {
    map.mountains.forEach((range, index) => {
      const selected = selectedMountain === index;
      const radius = selected
        ? Math.max(3.5, Math.min(8, cellSize * 0.42))
        : Math.max(2, Math.min(5, cellSize * 0.3));
      range.points.forEach(([x, z]) => {
        const point = toCanvas(x, z);
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fillStyle = selected
          ? MOUNTAIN_SELECTED_COLOR
          : range.kind === 'wall'
            ? 'rgba(214, 223, 234, 0.9)'
            : 'rgba(235, 226, 209, 0.88)';
        context.fill();
        context.lineWidth = Math.max(1, radius * 0.35);
        context.strokeStyle = 'rgba(8, 16, 26, 0.9)';
        context.stroke();
      });
    });
  }

  if (showMountainHandles && draftPoints.length > 0) {
    const preview = hover
      ? toCanvas(
          (hover.col + 0.5) * map.meta.tileSize - halfX,
          (hover.row + 0.5) * map.meta.tileSize - halfZ
        )
      : null;
    const first = toCanvas(draftPoints[0][0], draftPoints[0][1]);

    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    if (draftPoints.length >= 2 && mountainWidth > 0) {
      tracePoints(draftPoints);
      context.strokeStyle =
        barrierKind === 'wall' ? 'rgba(142, 158, 176, 0.28)' : 'rgba(122, 199, 76, 0.24)';
      context.lineWidth = Math.max(3, (mountainWidth / map.meta.tileSize) * cellSize);
      context.stroke();
    }
    context.setLineDash([Math.max(4, cellSize * 0.4), Math.max(3, cellSize * 0.28)]);
    context.strokeStyle = MOUNTAIN_SELECTED_COLOR;
    context.lineWidth = Math.max(1.5, Math.min(2.5, cellSize * 0.16));
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (let index = 1; index < draftPoints.length; index++) {
      const point = toCanvas(draftPoints[index][0], draftPoints[index][1]);
      context.lineTo(point.x, point.y);
    }
    if (preview) context.lineTo(preview.x, preview.y);
    context.stroke();
    context.setLineDash([]);
    draftPoints.forEach(([x, z]) => {
      const point = toCanvas(x, z);
      context.beginPath();
      context.arc(point.x, point.y, Math.max(3, Math.min(7, cellSize * 0.36)), 0, Math.PI * 2);
      context.fillStyle = MOUNTAIN_SELECTED_COLOR;
      context.fill();
      context.lineWidth = Math.max(1, cellSize * 0.08);
      context.strokeStyle = 'rgba(8, 16, 26, 0.9)';
      context.stroke();
    });
    context.restore();
  }

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
}
