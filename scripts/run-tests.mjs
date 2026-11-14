#!/usr/bin/env node
/**
 * Descubre y ejecuta los tests de `src/**` con el runner nativo de Node.
 *
 * Usa `tsx` como cargador para resolver imports sin extensión (el proyecto usa
 * `moduleResolution: bundler`). Sin framework de tests adicional.
 */

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const files = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) {
      files.push(path.relative(root, full));
    }
  }
}

walk(path.join(root, 'src'));
files.sort();

if (files.length === 0) {
  console.error('No se encontraron tests en src/**/*.test.ts');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', ...files],
  { cwd: root, stdio: 'inherit' }
);

process.exit(result.status ?? 1);
