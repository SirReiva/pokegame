import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import type { EditorState } from '../editorModel';

const { createEditorMap } = await import('../../../game/mapEditor');
const { DRAFT_KEY } = await import('../editorIo');
const {
  applyMapEdit,
  loadDraft,
  mapIssues,
  mapWithTiles,
  redoEdit,
  saveDraft,
  undoEdit
} = await import('../editorModel');

const globalScope = globalThis as { window?: { localStorage: Storage } };

function emptyState(): EditorState {
  const map = createEditorMap({
    id: 'test',
    name: 'Mapa de prueba',
    cols: 64,
    rows: 64,
    fill: 'jungle'
  });
  return { map, undo: [], redo: [] };
}

afterEach(() => {
  delete globalScope.window;
});

test('mapWithTiles muta una copia y undo/redo restauran el historial', () => {
  const initial = emptyState();
  const original = initial.map;
  assert.ok(original);

  const nextMap = mapWithTiles(original, (tiles) => {
    tiles[0][0] = 'sand';
    return true;
  });
  assert.ok(nextMap);
  assert.equal(nextMap.tiles[0][0], 'sand');
  assert.equal(original.tiles[0][0], 'jungle');
  assert.equal(mapWithTiles(original, () => false), null);

  const edited = applyMapEdit(initial, nextMap);
  assert.equal(edited.undo.length, 1);
  assert.equal(edited.map?.tiles[0][0], 'sand');

  const undone = undoEdit(edited);
  assert.ok(undone);
  assert.equal(undone.map?.tiles[0][0], 'jungle');
  assert.equal(undone.undo.length, 0);
  assert.equal(undone.redo.length, 1);

  const redone = redoEdit(undone);
  assert.ok(redone);
  assert.equal(redone.map?.tiles[0][0], 'sand');
  assert.equal(redone.redo.length, 0);
});

test('un mapa mínimo creado por el editor no tiene avisos de validación', () => {
  const map = createEditorMap({
    id: 'minimo',
    name: 'Mínimo',
    cols: 64,
    rows: 64,
    fill: 'jungle'
  });

  assert.deepEqual(mapIssues(map), []);
  assert.deepEqual(mapIssues(null), []);
});

test('loadDraft tolera un JSON corrupto y saveDraft persiste el mapa', () => {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    }
  } as Storage;
  globalScope.window = { localStorage };

  store.set(DRAFT_KEY, '{esto no es un borrador válido');
  assert.deepEqual(loadDraft(), { map: null, undo: [], redo: [] });

  saveDraft(null);
  assert.equal(store.has(DRAFT_KEY), false);

  const map = createEditorMap({
    id: 'borrador',
    name: 'Borrador',
    cols: 64,
    rows: 64,
    fill: 'sand'
  });
  saveDraft(map);

  const loaded = loadDraft();
  assert.equal(loaded.map?.meta.id, 'borrador');
  assert.equal(loaded.map?.tiles[0][0], 'sand');
  assert.deepEqual(loaded.undo, []);
  assert.deepEqual(loaded.redo, []);
});
