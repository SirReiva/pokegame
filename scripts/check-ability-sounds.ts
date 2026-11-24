#!/usr/bin/env node
/**
 * Auditoría de sonidos de habilidad.
 *
 * Comprueba lo que los tests de `audioRoster` no ven:
 *   - que cada habilidad usada en partida (movesets + instintos comunes) tenga
 *     entrada en `ABILITY_CAST_SOUNDS`;
 *   - que cada ruta de `ABILITY_CAST_SOUNDS` y `HIT_SOUNDS` exista en disco;
 *   - que no queden MP3 huérfanos en `public/audio/sfx/abilities`;
 *   - que no haya entradas de sonido sin habilidad definida.
 *
 * `regeneracion` es la única habilidad silenciosa por diseño (no tiene casteo).
 *
 * Uso: node --import tsx scripts/check-ability-sounds.ts
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ABILITIES, COMMON_ABILITIES, MOVESETS } from '../src/game/abilities';
import { ABILITY_CAST_SOUNDS, HIT_SOUNDS } from '../src/game/abilitySounds';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sfxRoot = path.join(root, 'public/audio/sfx');

/** Habilidades que se castean en silencio a propósito. */
const SILENT_BY_DESIGN = new Set(['regeneracion']);

const castSoundIds = new Set(Object.keys(ABILITY_CAST_SOUNDS));
const definedAbilityIds = new Set([
  ...Object.keys(ABILITIES),
  ...Object.keys(COMMON_ABILITIES)
]);

/** Habilidades que pueden llegar a sonar: las del moveset y los instintos. */
const usedAbilityIds = new Set<string>();
for (const moves of Object.values(MOVESETS)) {
  for (const id of moves) if (id) usedAbilityIds.add(id);
}
for (const id of Object.keys(COMMON_ABILITIES)) usedAbilityIds.add(id);

const problems: string[] = [];

// 1. Habilidades usadas sin sonido de casteo, agrupadas por especie.
const silentBySpecies: Array<[string, string[]]> = [];
for (const [species, moves] of Object.entries(MOVESETS)) {
  const silent = moves.filter(
    (id): id is string =>
      typeof id === 'string' &&
      !castSoundIds.has(id) &&
      !SILENT_BY_DESIGN.has(id)
  );
  if (silent.length > 0) silentBySpecies.push([species, [...new Set(silent)]]);
}

const silentCommon = Object.keys(COMMON_ABILITIES).filter(
  (id) => !castSoundIds.has(id) && !SILENT_BY_DESIGN.has(id)
);

for (const [species, ids] of silentBySpecies) {
  problems.push(`${species}: ${ids.join(', ')} sin sonido de casteo`);
}
for (const id of silentCommon) {
  problems.push(`instinto común ${id}: sin sonido de casteo`);
}

// 2. Rutas mapeadas cuyo archivo no existe.
const mappedPaths: Array<[string, string]> = [
  ...Object.entries(ABILITY_CAST_SOUNDS),
  ...Object.entries(HIT_SOUNDS)
];
const missingFiles = mappedPaths.filter(([, file]) => !existsSync(path.join(sfxRoot, file)));
for (const [id, file] of missingFiles) {
  problems.push(`${id}: falta el archivo ${file}`);
}

// 3. MP3 del repertorio que ninguna habilidad referencia.
const referencedFiles = new Set(
  mappedPaths
    .map(([, file]) => file)
    .filter((file) => file.startsWith('abilities/'))
    .map((file) => file.slice('abilities/'.length))
);
const abilitySfxDir = path.join(sfxRoot, 'abilities');
const orphanFiles = existsSync(abilitySfxDir)
  ? readdirSync(abilitySfxDir).filter((file) => !referencedFiles.has(file))
  : [];
for (const file of orphanFiles) {
  problems.push(`abilities/${file}: no lo usa ninguna habilidad`);
}

// 4. Entradas de sonido cuya habilidad ya no existe.
const orphanSoundIds = [...castSoundIds].filter((id) => !definedAbilityIds.has(id));
for (const id of orphanSoundIds) {
  problems.push(`${id}: tiene sonido pero no está definida en ABILITIES`);
}

const usedCount = usedAbilityIds.size;
const silentCount = silentBySpecies.reduce((total, [, ids]) => total + ids.length, 0) + silentCommon.length;

console.log(
  `Sonidos de casteo: ${castSoundIds.size} entradas · ${definedAbilityIds.size} habilidades definidas`
);
console.log(
  `Habilidades en uso: ${usedCount} · ${silentCount} sin sonido · ${SILENT_BY_DESIGN.size} silenciosa(s) por diseño`
);

if (silentBySpecies.length > 0) {
  console.log('\nHabilidades sin sonido por especie:');
  for (const [species, ids] of silentBySpecies) {
    console.log(`  ${species}  ${ids.join(', ')}`);
  }
}

if (problems.length === 0) {
  console.log('\nOK: todas las habilidades en uso tienen sonido y todos los MP3 se usan.');
} else {
  console.log(`\n${problems.length} problema(s):`);
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exitCode = 1;
}
