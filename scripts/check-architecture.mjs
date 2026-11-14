#!/usr/bin/env node
/**
 * Guardarraíl de arquitectura.
 *
 * No sustituye a TypeScript: comprueba lo que el compilador no ve.
 *   - ciclos de importación en runtime (deben ser 0);
 *   - dirección de dependencias entre capas;
 *   - tamaño máximo de archivo (con lista temporal de excepciones).
 *
 * Sin dependencias externas: se ejecuta con `node scripts/check-architecture.mjs`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');

const LAYERS = [
  { id: 'core', prefix: 'src/game/core/' },
  { id: 'sim', prefix: 'src/game/sim/' },
  { id: 'render', prefix: 'src/game/render/' },
  { id: 'app', prefix: 'src/game/app/' },
  { id: 'ui', prefix: 'src/ui/' },
  { id: 'screens', prefix: 'src/screens/' },
  { id: 'session', prefix: 'src/session/' },
  { id: 'game', prefix: 'src/game/' }
];

/**
 * Dependencias permitidas por capa. `game` es el cajón temporal de los módulos
 * que todavía no se han movido; solo puede importar hacia dentro, nunca desde
 * core/sim/render.
 */
const ALLOWED = {
  core: ['core'],
  // `sim` puede usar el cajón `game` mientras los tipos de dominio no terminen
  // de moverse a `core` (MatchPlayerState, AbilityDef, World...). Sí tiene
  // prohibido importar render/audio/UI.
  sim: ['core', 'sim', 'game'],
  render: ['core', 'render', 'game'],
  app: ['core', 'sim', 'render', 'app', 'game'],
  ui: ['ui', 'app', 'core', 'game'],
  screens: ['screens', 'ui', 'app', 'core', 'session', 'game'],
  session: ['session', 'core', 'app', 'game'],
  game: ['core', 'sim', 'render', 'app', 'game']
};

/** Rails de runtime/biblioteca que nunca deben entrar en el núcleo. */
const CORE_FORBIDDEN = new Set(['playcanvas', 'react', 'react-dom', 'wouter']);

/**
 * Archivos que todavía no cumplen el límite. Cada fase del plan debe borrar
 * entradas de esta lista, nunca añadirlas.
 */
const MAX_LINES = 1600;
const SIZE_ALLOWLIST = new Set([
  'src/game/game.ts',
  'src/game/bot.ts',
  'src/game/world.ts',
  'src/game/abilities.ts',
  'src/game/textures.ts',
  'src/game/effectBatch.ts'
]);

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
}

function toPosix(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function layerOf(file) {
  const rel = toPosix(file);
  const match = LAYERS.find((layer) => rel.startsWith(layer.prefix));
  return match?.id ?? null;
}

function resolveImport(fromFile, spec) {
  let resolved = path.resolve(path.dirname(fromFile), spec);
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
    if (fs.existsSync(resolved + ext)) return resolved + ext;
  }
  return null;
}

/** Extrae imports locales y distingue los que sobreviven al compilado. */
function readImports(file) {
  const text = fs.readFileSync(file, 'utf8');
  const result = [];
  const re = /(?:import|export)\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = re.exec(text))) {
    const spec = match[2];
    if (!spec.startsWith('.')) continue;
    const target = resolveImport(file, spec);
    if (!target) continue;
    const clause = match[1].trim();
    const typeOnly =
      clause.startsWith('type ') ||
      // import { type A, type B } from '...'
      (/^\{[\s\S]*\}$/.test(clause) &&
        clause
          .slice(1, -1)
          .split(',')
          .filter((part) => part.trim())
          .every((part) => part.trim().startsWith('type ')));
    result.push({ target, typeOnly, spec });
  }
  return { text, imports: result };
}

function stronglyConnected(files, edges) {
  const index = new Map(files.map((file, i) => [file, i]));
  const adj = files.map((file) => (edges.get(file) ?? []).map((dep) => index.get(dep)).filter((v) => v !== undefined));
  const visited = new Array(files.length).fill(-1);
  const low = new Array(files.length).fill(0);
  const onStack = new Array(files.length).fill(false);
  const stack = [];
  const components = [];
  let next = 0;

  function visit(v) {
    visited[v] = low[v] = next++;
    stack.push(v);
    onStack[v] = true;
    for (const w of adj[v]) {
      if (visited[w] === -1) {
        visit(w);
        low[v] = Math.min(low[v], low[w]);
      } else if (onStack[w]) {
        low[v] = Math.min(low[v], visited[w]);
      }
    }
    if (low[v] === visited[v]) {
      const component = [];
      let w;
      do {
        w = stack.pop();
        onStack[w] = false;
        component.push(w);
      } while (w !== v);
      if (component.length > 1) components.push(component.map((i) => files[i]));
    }
  }

  for (let v = 0; v < files.length; v++) if (visited[v] === -1) visit(v);
  return components;
}

const files = [];
walk(src, files);

const errors = [];
const warnings = [];
const graph = new Map();

for (const file of files) {
  const rel = toPosix(file);
  const { text, imports } = readImports(file);
  graph.set(file, imports.map((entry) => entry.target));

  const fromLayer = layerOf(file);
  if (!fromLayer) continue;

  for (const { target, spec } of imports) {
    const targetLayer = layerOf(target);
    if (!targetLayer) continue;
    if (!ALLOWED[fromLayer]?.includes(targetLayer)) {
      errors.push(
        `[capas] ${rel} (${fromLayer}) importa ${toPosix(target)} (${targetLayer}) mediante "${spec}"`
      );
    }
    if (fromLayer === 'core') {
      const bare = spec.replace(/^\.\.?\//, '');
      if (CORE_FORBIDDEN.has(bare)) {
        errors.push(`[core] ${rel} importa la librería "${spec}"`);
      }
    }
  }

  const lines = text.split(/\r?\n/).length;
  if (lines > MAX_LINES && !SIZE_ALLOWLIST.has(rel)) {
    errors.push(
      `[tamaño] ${rel} tiene ${lines} líneas (máximo ${MAX_LINES}). Divídelo o justifica una excepción temporal.`
    );
  }
}

const runtimeEdges = new Map();
for (const file of files) {
  const { imports } = readImports(file);
  runtimeEdges.set(file, imports.filter((entry) => !entry.typeOnly).map((entry) => entry.target));
}

const runtimeCycles = stronglyConnected(files, runtimeEdges);
for (const component of runtimeCycles) {
  errors.push(`[ciclo runtime] ${component.map(toPosix).join(' ↔ ')}`);
}

const allCycles = stronglyConnected(files, graph);
for (const component of allCycles) {
  const layers = new Set(component.map(layerOf).filter(Boolean));
  warnings.push(
    `[ciclo de tipos] ${layers.size > 1 ? `mezcla capas (${[...layers].join(', ')}): ` : ''}${component
      .map(toPosix)
      .join(' ↔ ')}`
  );
}

const totalLines = files.reduce((sum, file) => sum + fs.readFileSync(file, 'utf8').split(/\r?\n/).length, 0);
console.log(`Archivos: ${files.length} · Líneas: ${totalLines.toLocaleString('es-ES')}`);

for (const warning of warnings) console.warn(`aviso  ${warning}`);
for (const error of errors) console.error(`error  ${error}`);

if (errors.length > 0) {
  console.error(`\n${errors.length} problema(s) de arquitectura.`);
  process.exit(1);
}

console.log('\nArquitectura OK.');
