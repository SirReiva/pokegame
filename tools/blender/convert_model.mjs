#!/usr/bin/env node
/**
 * Convierte modelos .blend a GLB llamando a Blender desde Node.
 *
 * Lee los modelos dados de alta en tools/blender/models.json, deja elegir uno
 * (o varios) y lanza `blender -b <blend> -P export_pm_glb.py` con la salida y la
 * configuración de ese modelo. Así no hay que recordar rutas ni escribir el
 * comando completo de Blender.
 *
 * Uso:
 *   pnpm convert:model                      # menú interactivo
 *   pnpm convert:model pm0002_00            # por id
 *   pnpm convert:model 2                    # por número del menú
 *   pnpm convert:model --all                # todos los de models.json
 *   pnpm convert:model pm0001_00 --resolution 2048
 *
 * Las opciones que no son del wrapper se reenvían al exportador, así que los
 * flags de Blender pueden ir directamente o después de `--`.
 *
 * Opciones propias:
 *   --model <id>        modelo a convertir (repetible)
 *   --all               convierte todos los modelos
 *   --config <ruta>     JSON de configuración (por defecto tools/blender/models.json)
 *   --blend <ruta>      .blend alternativo (solo con un modelo)
 *   --output <ruta>     GLB alternativo (solo con un modelo)
 *   --blender <ruta>    ejecutable de Blender (por defecto: BLENDER_PATH, PATH
 *                       o las instalaciones habituales)
 *   --list              muestra los modelos y sale
 *   --dry-run           enseña el comando sin ejecutarlo
 *   --help              esta ayuda
 *
 * Todo lo que vaya después de `--` se pasa tal cual al exportador de Blender
 * (--resolution, --eye-resolution, --feeler-bones, --feeler-scale, --feeler-visible).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_CONFIG = path.join(ROOT, 'tools', 'blender', 'models.json');
const EXPORT_SCRIPT = path.join(ROOT, 'tools', 'blender', 'export_pm_glb.py');

/** Carpetas que nunca contienen los .blend del proyecto. */
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.wrangler', '.vite']);

function die(message) {
  console.error(`\n[error] ${message}`);
  process.exit(1);
}

function formatCommand(parts) {
  return parts.map((part) => (/\s/.test(part) ? `"${part}"` : part)).join(' ');
}

function parseArgv(argv) {
  const options = {
    models: [],
    passthrough: [],
    all: false,
    list: false,
    dryRun: false,
    help: false
  };

  const separator = argv.indexOf('--');
  const main = separator === -1 ? argv : argv.slice(0, separator);
  options.passthrough = separator === -1 ? [] : argv.slice(separator + 1);

  for (let i = 0; i < main.length; i += 1) {
    const arg = main[i];
    const next = () => {
      i += 1;
      if (main[i] === undefined) die(`Falta el valor de ${arg}`);
      return main[i];
    };

    switch (arg) {
      case '--model':
      case '-m':
        options.models.push(next());
        break;
      case '--all':
        options.all = true;
        break;
      case '--list':
      case '-l':
        options.list = true;
        break;
      case '--config':
        options.config = next();
        break;
      case '--blend':
        options.blend = next();
        break;
      case '--output':
      case '-o':
        options.output = next();
        break;
      case '--blender':
        options.blender = next();
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        // Las opciones del exportador (--resolution, --feeler-scale…) se
        // reenvían sin obligar a escribir "--": npm/pnpm se comen el separador.
        if (arg.startsWith('-')) {
          options.passthrough.push(arg);
          const value = main[i + 1];
          if (value !== undefined && !value.startsWith('-')) {
            i += 1;
            options.passthrough.push(value);
          }
        } else {
          options.models.push(arg);
        }
    }
  }

  return options;
}

async function loadConfig(configPath) {
  if (!existsSync(configPath)) die(`No existe el JSON de configuración: ${configPath}`);

  let config;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch (error) {
    die(`No se pudo leer ${path.relative(ROOT, configPath)}: ${error.message}`);
  }

  const entries = Object.entries(config.models ?? {});
  if (entries.length === 0) die(`${path.relative(ROOT, configPath)} no define ningún modelo en "models"`);

  const configDir = path.dirname(configPath);
  const models = entries.map(([id, entry]) => ({
    id,
    blend: resolveInputPath(entry.blend ?? `models/${id}.blend`, configDir),
    output: path.resolve(ROOT, entry.output ?? `public/models/${id}/${id}.glb`)
  }));

  return { config, models };
}

/** El .blend se busca junto al JSON y, si no, desde la raíz del repo. */
function resolveInputPath(value, configDir) {
  if (path.isAbsolute(value)) return value;
  const candidates = [path.resolve(configDir, value), path.resolve(ROOT, value)];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function versionScore(name) {
  const match = name.match(/(\d+)(?:\.(\d+))?/);
  return match ? Number(match[1]) * 1000 + Number(match[2] ?? 0) : 0;
}

function commandPath(name) {
  const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], {
    encoding: 'utf8'
  });
  if (result.status !== 0) return null;
  return (
    result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && existsSync(line)) ?? null
  );
}

/** Instalaciones típicas de Blender, de la versión más nueva a la más vieja. */
function commonBlenderPaths() {
  const found = [];
  const env = process.env;

  if (process.platform === 'win32') {
    const bases = [
      env.ProgramFiles && path.join(env.ProgramFiles, 'Blender Foundation'),
      env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Blender Foundation'),
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'Blender Foundation')
    ].filter(Boolean);

    for (const base of bases) {
      if (!existsSync(base)) continue;
      const versions = readdirSync(base, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^Blender\b/i.test(entry.name))
        .sort((a, b) => versionScore(b.name) - versionScore(a.name));
      for (const entry of versions) found.push(path.join(base, entry.name, 'blender.exe'));
      found.push(path.join(base, 'blender.exe'));
    }

    found.push(
      env.USERPROFILE && path.join(env.USERPROFILE, 'Downloads', 'BlenderPortable', 'App', 'Blender64', 'blender.exe'),
      env.USERPROFILE && path.join(env.USERPROFILE, 'scoop', 'apps', 'blender', 'current', 'blender.exe'),
      env.ProgramFiles && path.join(env.ProgramFiles, 'Steam', 'steamapps', 'common', 'Blender', 'blender.exe')
    );
  } else if (process.platform === 'darwin') {
    found.push(
      '/Applications/Blender.app/Contents/MacOS/Blender',
      env.HOME && path.join(env.HOME, 'Applications', 'Blender.app', 'Contents', 'MacOS', 'Blender')
    );
  } else {
    found.push('/usr/bin/blender', '/usr/local/bin/blender', '/snap/bin/blender', '/opt/blender/blender');
  }

  return found.filter(Boolean);
}

function resolveBlender(explicit, configValue) {
  for (const value of [explicit, process.env.BLENDER_PATH, process.env.BLENDER_EXE, process.env.BLENDER, configValue]) {
    if (!value) continue;
    const candidate = path.isAbsolute(value) || !value.includes(path.sep) ? value : path.resolve(ROOT, value);
    if (existsSync(candidate) || !candidate.includes(path.sep)) return candidate;
  }

  const onPath = commandPath('blender');
  if (onPath) return onPath;

  return commonBlenderPaths().find((candidate) => existsSync(candidate)) ?? null;
}

/** Busca el .blend por nombre si la ruta configurada no existe. */
function findBlend(file) {
  if (existsSync(file)) return file;
  const name = path.basename(file).toLowerCase();
  let found = null;

  const walk = (dir, depth) => {
    if (found || depth > 4) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full, depth + 1);
      } else if (entry.name.toLowerCase() === name) {
        found = full;
      }
    }
  };

  walk(ROOT, 0);
  return found;
}

function modelRow(model, index) {
  return {
    index: String(index + 1),
    id: model.id,
    blend: path.relative(ROOT, model.blend) || model.blend,
    output: path.relative(ROOT, model.output) || model.output,
    missing: !existsSync(model.blend)
  };
}

function printModels(models, configPath = DEFAULT_CONFIG) {
  const rows = models.map(modelRow);
  const headers = { index: '#', id: 'Modelo', blend: '.blend', output: 'GLB' };
  const width = (key) => Math.max(headers[key].length, ...rows.map((row) => row[key].length));

  const widths = {
    index: width('index'),
    id: width('id'),
    blend: width('blend'),
    output: width('output')
  };

  console.log(`\nModelos en ${path.relative(ROOT, configPath)}:\n`);
  console.log(
    `  ${headers.index.padStart(widths.index)}  ${headers.id.padEnd(widths.id)}  ${headers.blend.padEnd(widths.blend)}  ${headers.output}`
  );
  console.log(`  ${'-'.repeat(widths.index)}  ${'-'.repeat(widths.id)}  ${'-'.repeat(widths.blend)}  ${'-'.repeat(widths.output)}`);
  for (const row of rows) {
    console.log(
      `  ${row.index.padStart(widths.index)}  ${row.id.padEnd(widths.id)}  ${row.blend.padEnd(widths.blend)}  ${row.output}${row.missing ? '  (falta el .blend)' : ''}`
    );
  }
}

/** Devuelve los modelos que encajan con un id o un número del menú. */
function matchModels(models, value) {
  const needle = value.trim().toLowerCase();
  if (!needle) return [];

  if (/^\d+$/.test(needle)) {
    const byNumber = models[Number(needle) - 1];
    if (byNumber) return [byNumber];
  }

  const exact = models.filter((model) => model.id.toLowerCase() === needle);
  if (exact.length > 0) return exact;

  return models.filter((model) => model.id.toLowerCase().startsWith(needle));
}

function selectModels(models, values) {
  const selected = [];
  for (const value of values) {
    const matches = matchModels(models, value);
    if (matches.length === 0) {
      die(`No hay ningún modelo que coincida con "${value}". Usa --list para ver los disponibles.`);
    }
    if (matches.length > 1) {
      die(`"${value}" es ambiguo: ${matches.map((model) => model.id).join(', ')}.`);
    }
    if (!selected.includes(matches[0])) selected.push(matches[0]);
  }
  return selected;
}

async function askModel(models, configPath) {
  printModels(models, configPath);
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    for (;;) {
      let answer;
      try {
        answer = (await rl.question(
          `\n¿Qué modelo quieres convertir? [1-${models.length} o id, Enter = ${models[0].id}]: `
        )).trim();
      } catch (error) {
        if (error?.code === 'ERR_USE_AFTER_CLOSE') die('Entrada cerrada sin elegir modelo.');
        throw error;
      }
      if (!answer) return models[0];

      const matches = matchModels(models, answer);
      if (matches.length === 1) return matches[0];
      if (matches.length === 0) {
        console.log(`  No existe "${answer}". Prueba con un número o con el id completo.`);
      } else {
        console.log(`  "${answer}" coincide con: ${matches.map((model) => model.id).join(', ')}.`);
      }
    }
  } finally {
    rl.close();
  }
}

function runConversion(model, { blender, configPath, options }) {
  const blend = findBlend(options.blend ? path.resolve(ROOT, options.blend) : model.blend);
  if (!blend) {
    throw new Error(
      `No encuentro ${path.basename(model.blend)}. Colócalo en la raíz del repo o fija la ruta con --blend.`
    );
  }
  if (!existsSync(EXPORT_SCRIPT)) throw new Error(`No existe ${path.relative(ROOT, EXPORT_SCRIPT)}`);

  const output = options.output ? path.resolve(ROOT, options.output) : model.output;
  const args = ['-b', blend, '-P', EXPORT_SCRIPT, '--', '--config', configPath, output, ...options.passthrough];

  console.log(`\n=== ${model.id} ===`);
  console.log(`  .blend  ${blend}`);
  console.log(`  GLB     ${output}`);
  console.log(`  comando ${formatCommand([blender, ...args])}\n`);

  if (options.dryRun) return;

  const previousMtime = existsSync(output) ? statSync(output).mtimeMs : 0;
  const startedAt = Date.now();
  const result = spawnSync(blender, args, { cwd: ROOT, stdio: 'inherit' });

  if (result.error) throw new Error(`No se pudo ejecutar Blender: ${result.error.message}`);

  const written = existsSync(output) ? statSync(output) : null;
  const isFresh = written && (written.mtimeMs > previousMtime || written.mtimeMs >= startedAt - 1000);
  if (!isFresh) {
    throw new Error(`Blender terminó con código ${result.status ?? '?'} y no escribió ${path.relative(ROOT, output)}.`);
  }

  const size = written.size / (1024 * 1024);
  console.log(`\n[ok] ${model.id} → ${path.relative(ROOT, output)} (${size.toFixed(1)} MB)`);
  if (result.status !== 0) {
    // En Windows Blender devuelve 1 aunque el export haya ido bien; el GLB y el
    // mtime son la fuente de verdad.
    console.log(`[aviso] Blender devolvió el código ${result.status}, pero el GLB se regeneró correctamente.`);
  }
}

function printHelp() {
  console.log(`
Convierte modelos .blend a GLB con Blender.

  pnpm convert:model                      menú interactivo
  pnpm convert:model pm0002_00            por id
  pnpm convert:model 2                    por número del menú
  pnpm convert:model --all                todos los modelos
  pnpm convert:model --list               lista los modelos
  pnpm convert:model pm0001_00 --resolution 2048

Opciones:
  --model <id>      modelo a convertir (repetible)
  --all             todos los modelos de models.json
  --config <ruta>   JSON alternativo (por defecto tools/blender/models.json)
  --blend <ruta>    .blend alternativo (solo con un modelo)
  --output <ruta>   GLB alternativo (solo con un modelo)
  --blender <ruta>  ejecutable de Blender
  --list            muestra los modelos y sale
  --dry-run         enseña el comando sin ejecutarlo
  --help            esta ayuda

Las opciones que no son del wrapper se reenvían al exportador:
  --resolution, --eye-resolution, --feeler-bones, --feeler-scale, --feeler-visible
También puedes agruparlas después de "--".

Blender se busca en --blender, BLENDER_PATH, el PATH y las instalaciones
habituales de Windows, macOS y Linux.
`);
}

const options = parseArgv(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

const configPath = options.config ? path.resolve(ROOT, options.config) : DEFAULT_CONFIG;
const { config, models } = await loadConfig(configPath);

if (options.list) {
  printModels(models, configPath);
  process.exit(0);
}

if ((options.blend || options.output) && (options.all || options.models.length > 1)) {
  die('--blend y --output solo se pueden usar al convertir un único modelo.');
}

let selected;
if (options.all) {
  selected = models;
} else if (options.models.length > 0) {
  selected = selectModels(models, options.models);
} else if (process.stdin.isTTY) {
  selected = [await askModel(models, configPath)];
} else {
  printModels(models, configPath);
  die('Modo no interactivo: indica el modelo, por ejemplo `pnpm convert:model pm0001_00`.');
}

const blender = resolveBlender(options.blender, config.blender);
if (!blender) {
  die(
    'No encuentro Blender. Pásalo con --blender, define BLENDER_PATH o instálalo en una ruta habitual.\n' +
      'Ejemplo: pnpm convert:model pm0001_00 --blender "C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe"'
  );
}
console.log(`[blender] ${blender}`);

let failures = 0;
for (const model of selected) {
  try {
    runConversion(model, { blender, configPath, options });
  } catch (error) {
    failures += 1;
    console.error(`\n[error] ${model.id}: ${error.message}`);
  }
}

if (failures > 0) process.exit(1);
