/**
 * Entrada y salida del editor de mapas: borrador local, JSON descargado o
 * pegado y mapas de `public/maps`. Las funciones no tocan estado de React:
 * devuelven el resultado y la pantalla decide qué aviso mostrar.
 */

import type { ChangeEvent } from 'react';
import type { MapIndexEntry } from '../../game/map';
import {
  editorMapFromJson,
  editorMapToJson,
  validateEditorMap,
  type EditorMap,
  type EditorMapJson
} from '../../game/mapEditor';

export const DRAFT_KEY = 'newpoke.map-editor.draft.v1';

export interface EditorJsonResult {
  json: EditorMapJson | null;
  error: string | null;
}

/** Valida el mapa y lo convierte al JSON exportable. */
export function buildJson(map: EditorMap | null): EditorJsonResult {
  if (!map) return { json: null, error: null };
  const issues = validateEditorMap(map);
  if (issues.length > 0) return { json: null, error: issues[0] };
  return { json: editorMapToJson(map), error: null };
}

/** Descarga el JSON como archivo con el id del mapa. */
export function exportJson(json: EditorMapJson): void {
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
}

/** Copia el JSON al portapapeles. Devuelve `false` si el navegador lo impide. */
export async function copyJson(json: EditorMapJson): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(`${JSON.stringify(json, null, 2)}\n`);
    return true;
  } catch {
    return false;
  }
}

/** Convierte el JSON pegado o importado en un mapa del editor. */
export function importRaw(raw: unknown): EditorMap {
  return editorMapFromJson(raw);
}

/**
 * Lee el archivo elegido en un `<input type="file">`, limpia el campo y
 * devuelve el mensaje de error si el JSON no es válido.
 */
export async function onFileChange(
  event: ChangeEvent<HTMLInputElement>,
  importMap: (raw: unknown) => void
): Promise<string | null> {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return null;
  try {
    const raw: unknown = JSON.parse(await file.text());
    importMap(raw);
    return null;
  } catch (cause) {
    return cause instanceof Error ? cause.message : 'El archivo no es un JSON válido.';
  }
}

/** Descarga el JSON de un mapa del índice. */
export async function loadExisting(entry: MapIndexEntry): Promise<unknown> {
  const file = entry.file.replace(/^\/+/, '');
  const response = await fetch(`${import.meta.env.BASE_URL}maps/${file}`, {
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`No se pudo cargar el mapa (HTTP ${response.status}).`);
  return response.json();
}
