#!/usr/bin/env node
/**
 * Añade/actualiza los marcadores `rushFrame`, `hitFrame` y `returnFrame` del
 * manifiesto leyendo los `animdata.xml` locales. No descarga nada.
 *
 * Uso:
 *   node scripts/patch-sprite-metadata.mjs
 *
 * Es idempotente: se puede ejecutar tras `pnpm sprites` o después de tocar un
 * `animdata.xml` a mano.
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const SPRITES_DIR = path.join(ROOT, 'public', 'sprites');
const MANIFEST_PATH = path.join(SPRITES_DIR, 'manifest.json');

function parseFrames(xml) {
  const frames = new Map();
  for (const match of xml.matchAll(/<Anim>([\s\S]*?)<\/Anim>/g)) {
    const block = match[1];
    const name = /<Name>([^<]+)<\/Name>/.exec(block)?.[1];
    if (!name) continue;
    const read = (tag) => {
      const value = new RegExp(`<${tag}>(\\d+)</${tag}>`).exec(block)?.[1];
      return value === undefined ? undefined : Number(value);
    };
    frames.set(name, {
      rushFrame: read('RushFrame'),
      hitFrame: read('HitFrame'),
      returnFrame: read('ReturnFrame')
    });
  }
  return frames;
}

function animDataForSheet(sheet) {
  // sheet: "sprites/0001/attack.png" -> "public/sprites/0001/animdata.xml"
  const parts = sheet.split('/');
  parts.pop();
  return path.join(ROOT, 'public', ...parts, 'animdata.xml');
}

function patchAnimations(animations, cache) {
  for (const [slug, animation] of Object.entries(animations ?? {})) {
    if (!animation?.sheet) continue;
    const file = animDataForSheet(animation.sheet);
    let frames = cache.get(file);
    if (!frames) {
      try {
        frames = parseFrames(readFileSync(file, 'utf8'));
      } catch {
        frames = new Map();
      }
      cache.set(file, frames);
    }
    const name = [...frames.keys()].find(
      (candidate) => candidate.toLowerCase() === slug
    );
    const meta = name ? frames.get(name) : undefined;
    for (const key of ['rushFrame', 'hitFrame', 'returnFrame']) {
      if (meta?.[key] !== undefined) animation[key] = meta[key];
      else delete animation[key];
    }
  }
}

function main() {
  if (!statSync(MANIFEST_PATH, { throwIfNoEntry: false })) {
    throw new Error(`No existe ${MANIFEST_PATH}`);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const cache = new Map();
  let patched = 0;

  for (const entry of manifest.pokemon ?? []) {
    patchAnimations(entry.animations, cache);
    patched += Object.keys(entry.animations ?? {}).length;
    for (const skin of entry.skins ?? []) {
      patchAnimations(skin.animations, cache);
      patched += Object.keys(skin.animations ?? {}).length;
    }
  }

  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Manifiesto actualizado: ${patched} animaciones revisadas.`);
}

main();
