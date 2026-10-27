#!/usr/bin/env node
/**
 * Descarga los sprites de PMD Sprite Collab y genera el manifiesto que consume el juego.
 *
 * Uso:
 *   npm run sprites            # descarga/actualiza los assets del roster
 *   npm run sprites -- --force # fuerza la descarga aunque los ficheros existan
 *
 * Además de las hojas de animación, el script lee `-Shadow.png` y guarda en el
 * manifiesto el "ancla de suelo" de cada frame: el píxel blanco de la sombra,
 * que marca el centro del personaje a nivel del suelo. Ese punto se usa en el
 * motor para apoyar el billboard en el terreno sin que las animaciones tiemblen.
 * También descarga el retrato `Normal.png` de cada Pokémon para las interfaces
 * HTML, que no usan las hojas animadas.
 *
 * Los sprites son obra de la comunidad de PMD Sprite Collab y se distribuyen
 * bajo CC BY-NC 4.0. No se usan con fines comerciales. Ver public/sprites/CREDITS.md.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { inflateSync } from 'node:zlib';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public', 'sprites');
const RAW_BASE = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite';
const PORTRAIT_BASE = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/portrait';
const SOURCE = 'https://sprites.pmdcollab.org/';
const LICENSE = 'CC BY-NC 4.0';
const LICENSE_URL = 'https://creativecommons.org/licenses/by-nc/4.0/';
const LICENSE_FILE = 'https://github.com/PMDCollab/SpriteCollab/blob/master/LICENSE.md';

/** Roster de la demo. El id es el número de Pokédex con 4 dígitos. */
const ROSTER = [
  { id: '0001', name: 'Bulbasaur', types: ['Grass', 'Poison'], accent: '#7ac74c' },
  { id: '0004', name: 'Charmander', types: ['Fire'], accent: '#ee8130' },
  { id: '0007', name: 'Squirtle', types: ['Water'], accent: '#6390f0' },
  { id: '0025', name: 'Pikachu', types: ['Electric'], accent: '#f7d02c' },
  { id: '0133', name: 'Eevee', types: ['Normal'], accent: '#a8a77a' },
  { id: '0448', name: 'Lucario', types: ['Fighting', 'Steel'], accent: '#c22e28' },
  { id: '0658', name: 'Greninja', types: ['Water', 'Dark'], accent: '#3f6f9f' },
  { id: '0150', name: 'Mewtwo', types: ['Psychic'], accent: '#f95587' },
  { id: '0151', name: 'Mew', types: ['Psychic'], accent: '#f7a8c4' },
  { id: '0095', name: 'Onix', types: ['Rock', 'Ground'], accent: '#b6a136' }
];

const ACTIONS = ['Idle', 'Walk'];
const force = process.argv.includes('--force');

function slug(value) {
  return value.toLowerCase();
}

async function download(url, destination) {
  const response = await fetch(url, { headers: { 'User-Agent': 'newpoke-sprite-importer' } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} al descargar ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (destination) {
    await writeFile(destination, buffer);
  }
  return buffer;
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'newpoke-sprite-importer' } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} al descargar ${url}`);
  }
  return response.text();
}

function parseAnims(xml) {
  const anims = new Map();
  for (const match of xml.matchAll(/<Anim>([\s\S]*?)<\/Anim>/g)) {
    const block = match[1];
    const name = /<Name>([^<]+)<\/Name>/.exec(block)?.[1];
    if (!name) continue;
    const frameWidth = Number(/<FrameWidth>(\d+)<\/FrameWidth>/.exec(block)?.[1]);
    const frameHeight = Number(/<FrameHeight>(\d+)<\/FrameHeight>/.exec(block)?.[1]);
    const durations = [...block.matchAll(/<Duration>(\d+)<\/Duration>/g)].map((m) => Number(m[1]));
    if (!frameWidth || !frameHeight || durations.length === 0) continue;
    anims.set(name, { frameWidth, frameHeight, durations });
  }
  return anims;
}

/**
 * Decodificador PNG mínimo (8 bits, sin entrelazado, RGB/RGBA/escala de grises).
 * Evita añadir dependencias solo para leer los píxeles de las sombras.
 */
function decodePng(buffer) {
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('El fichero descargado no es un PNG válido');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const chunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      chunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  if (bitDepth !== 8) throw new Error(`PNG con profundidad ${bitDepth} no soportada`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`PNG con tipo de color ${colorType} no soportado`);

  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);
  let cursor = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[cursor++];
    const line = Buffer.from(raw.subarray(cursor, cursor + stride));
    cursor += stride;

    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = previous[x];
      const c = x >= channels ? previous[x - channels] : 0;
      let value = line[x];
      switch (filter) {
        case 0: break;
        case 1: value = (value + a) & 0xff; break;
        case 2: value = (value + b) & 0xff; break;
        case 3: value = (value + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          const predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          value = (value + predictor) & 0xff;
          break;
        }
        default:
          throw new Error(`Filtro PNG ${filter} no soportado`);
      }
      line[x] = value;
    }

    for (let x = 0; x < width; x++) {
      const src = x * channels;
      const dst = (y * width + x) * 4;
      if (channels === 4) {
        pixels[dst] = line[src];
        pixels[dst + 1] = line[src + 1];
        pixels[dst + 2] = line[src + 2];
        pixels[dst + 3] = line[src + 3];
      } else if (channels === 3) {
        pixels[dst] = line[src];
        pixels[dst + 1] = line[src + 1];
        pixels[dst + 2] = line[src + 2];
        pixels[dst + 3] = 255;
      } else if (channels === 1) {
        pixels[dst] = pixels[dst + 1] = pixels[dst + 2] = line[src];
        pixels[dst + 3] = 255;
      } else {
        pixels[dst] = pixels[dst + 1] = pixels[dst + 2] = line[src];
        pixels[dst + 3] = line[src + 1];
      }
    }

    previous = line;
  }

  return { width, height, pixels };
}

/**
 * Calcula el píxel más bajo con contenido visible de cada frame.
 *
 * El arte de PMD dibuja a veces una pata, la cola o el borde del cuerpo por
 * debajo del ancla de la sombra (el punto de apoyo). En un mapa 3D con suelo
 * opaco esos píxeles quedan enterrados y el sprite parece cortado. El motor usa
 * estos valores para subir solo los frames afectados. `-1` = celda vacía.
 */
function extractBottoms(sheet, frameWidth, frameHeight, columns, rows) {
  const bottoms = [];

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      let bottom = -1;

      // De abajo arriba: el primer píxel opaco es el borde inferior visible.
      for (let y = frameHeight - 1; y >= 0 && bottom < 0; y--) {
        for (let x = 0; x < frameWidth; x++) {
          const px = ((row * frameHeight + y) * sheet.width + (column * frameWidth + x)) * 4;
          // Mismo umbral que el alphaTest del material (0.5).
          if (sheet.pixels[px + 3] >= 128) {
            bottom = y;
            break;
          }
        }
      }

      bottoms.push(bottom);
    }
  }

  return bottoms;
}

/**
 * Localiza el píxel blanco de la sombra en cada frame. Devuelve una lista
 * fila a fila (8 direcciones x columnas) con el ancla en píxeles.
 */
function extractAnchors(shadow, frameWidth, frameHeight, columns) {
  const anchors = [];
  const safeWidth = Math.min(frameWidth, shadow.width);

  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < columns; column++) {
      let sumX = 0;
      let sumY = 0;
      let count = 0;

      for (let y = 0; y < frameHeight; y++) {
        for (let x = 0; x < safeWidth; x++) {
          const px = ((row * frameHeight + y) * shadow.width + (column * frameWidth + x)) * 4;
          const r = shadow.pixels[px];
          const g = shadow.pixels[px + 1];
          const b = shadow.pixels[px + 2];
          const a = shadow.pixels[px + 3];
          if (a > 0 && r >= 240 && g >= 240 && b >= 240) {
            sumX += x;
            sumY += y;
            count++;
          }
        }
      }

      if (count === 0) {
        throw new Error(
          `La sombra no tiene píxel blanco en la fila ${row}, columna ${column}`
        );
      }

      anchors.push({
        x: Math.round(sumX / count),
        y: Math.round(sumY / count)
      });
    }
  }

  return anchors;
}

function parseCredits(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields = line.split('\t');
    if (fields.length < 2) continue;
    rows.push({
      artist: fields[1]?.trim() || 'Desconocido',
      contact: fields[3]?.trim() || '',
      actions: (fields[4] ?? '').split(',').map((item) => item.trim()).filter(Boolean)
    });
  }
  return rows;
}

function creditMarkdown(pokemon, credits) {
  const lines = [`## ${pokemon.name} (#${pokemon.id})`, ''];
  if (credits.length === 0) {
    lines.push('- Créditos no disponibles.');
  } else {
    for (const credit of credits) {
      const contact = credit.contact && credit.contact !== 'Unspecified' ? ` — ${credit.contact}` : '';
      const actions = credit.actions.length > 0 ? ` · ${credit.actions.join(', ')}` : '';
      lines.push(`- ${credit.artist}${contact}${actions}`);
    }
  }
  lines.push(
    `- Fuente: ${RAW_BASE}/${pokemon.id}`,
    `- Retrato: ${PORTRAIT_BASE}/${pokemon.id}/Normal.png`,
    `- Hoja de créditos original: ${RAW_BASE}/${pokemon.id}/credits.txt`,
    ''
  );
  return lines.join('\n');
}

async function importPokemon(pokemon) {
  const dir = path.join(OUT_DIR, pokemon.id);
  await mkdir(dir, { recursive: true });

  const folderUrl = `${RAW_BASE}/${pokemon.id}`;
  const animDataPath = path.join(dir, 'animdata.xml');
  const creditsPath = path.join(dir, 'credits.txt');

  const animDataXml = await fetchText(`${folderUrl}/AnimData.xml`);
  await writeFile(animDataPath, animDataXml);

  const creditsText = await fetchText(`${folderUrl}/credits.txt`);
  await writeFile(creditsPath, creditsText);

  // Retrato normal para las interfaces HTML. Los sprites animados solo se usan
  // en el mundo 3D de PlayCanvas.
  const portraitFile = 'portrait.png';
  const portraitPath = path.join(dir, portraitFile);
  if (!existsSync(portraitPath) || force) {
    await download(`${PORTRAIT_BASE}/${pokemon.id}/Normal.png`, portraitPath);
  }

  const anims = parseAnims(animDataXml);
  const credits = parseCredits(creditsText);
  const shadowSize = Number(/<ShadowSize>(\d+)<\/ShadowSize>/.exec(animDataXml)?.[1] ?? 1);
  const animations = {};

  for (const action of ACTIONS) {
    const meta = anims.get(action);
    if (!meta) {
      throw new Error(`${pokemon.name}: AnimData.xml no incluye la animación ${action}`);
    }

    const file = `${slug(action)}.png`;
    const destination = path.join(dir, file);
    const alreadyThere = existsSync(destination) && !force;
    let buffer;

    if (alreadyThere) {
      buffer = await readFile(destination);
    } else {
      buffer = await download(`${folderUrl}/${action}-Anim.png`, destination);
    }

    const sheet = decodePng(buffer);
    const { width, height } = sheet;
    const columns = width / meta.frameWidth;
    const rows = height / meta.frameHeight;

    if (!Number.isInteger(columns) || !Number.isInteger(rows)) {
      throw new Error(
        `${pokemon.name}/${action}: la hoja ${width}x${height} no encaja con frames de ` +
        `${meta.frameWidth}x${meta.frameHeight}`
      );
    }
    if (rows !== 8) {
      throw new Error(`${pokemon.name}/${action}: se esperaban 8 direcciones, hay ${rows}`);
    }
    if (columns !== meta.durations.length) {
      throw new Error(
        `${pokemon.name}/${action}: ${columns} columnas en la hoja pero ` +
        `${meta.durations.length} duraciones en AnimData.xml`
      );
    }

    const shadowBuffer = await download(`${folderUrl}/${action}-Shadow.png`);
    const shadow = decodePng(shadowBuffer);
    if (shadow.width !== width || shadow.height !== height) {
      throw new Error(
        `${pokemon.name}/${action}: la sombra mide ${shadow.width}x${shadow.height} ` +
        `y la hoja ${width}x${height}`
      );
    }

    const anchors = extractAnchors(shadow, meta.frameWidth, meta.frameHeight, columns);
    const bottoms = extractBottoms(sheet, meta.frameWidth, meta.frameHeight, columns, rows);

    animations[slug(action)] = {
      sheet: `/sprites/${pokemon.id}/${file}`,
      frameWidth: meta.frameWidth,
      frameHeight: meta.frameHeight,
      columns,
      rows,
      durations: meta.durations,
      anchors,
      bottoms
    };

    console.log(
      `  ${action.padEnd(4)} ${width}x${height}  ${columns}x${rows} frames  ` +
      `${meta.frameWidth}x${meta.frameHeight}px  anclas ${anchors.length}`
    );
  }

  return {
    credits,
    entry: {
      id: pokemon.id,
      name: pokemon.name,
      dex: Number(pokemon.id),
      types: pokemon.types,
      accent: pokemon.accent,
      shadowSize,
      source: `${SOURCE}#/${pokemon.id}`,
      credits,
      portrait: `/sprites/${pokemon.id}/${portraitFile}`,
      animations
    }
  };
}

async function main() {
  console.log(`Importando ${ROSTER.length} Pokémon desde PMD Sprite Collab...`);
  await mkdir(OUT_DIR, { recursive: true });

  const entries = [];
  const creditSections = [];

  for (const pokemon of ROSTER) {
    console.log(`\n${pokemon.name} (#${pokemon.id})`);
    const result = await importPokemon(pokemon);
    entries.push(result.entry);
    creditSections.push(creditMarkdown(pokemon, result.credits));
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: SOURCE,
    license: LICENSE,
    licenseUrl: LICENSE_URL,
    licenseFile: LICENSE_FILE,
    directions: ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'],
    tickRate: 60,
    pokemon: entries
  };

  await writeFile(
    path.join(OUT_DIR, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );

  const creditsMarkdown = [
    '# Créditos de sprites',
    '',
    'Los sprites de este directorio proceden de **PMD Sprite Collab**:',
    '',
    `- Web: ${SOURCE}`,
    `- Repositorio: https://github.com/PMDCollab/SpriteCollab`,
    `- Licencia: [${LICENSE}](${LICENSE_URL})`,
    '',
    'Se distribuyen sin modificaciones y se usan únicamente con fines no comerciales.',
    'Cada Pokémon conserva su `credits.txt` original en su carpeta.',
    '',
    ...creditSections
  ].join('\n');

  await writeFile(path.join(OUT_DIR, 'CREDITS.md'), `${creditsMarkdown}\n`, 'utf8');

  console.log(`\nManifiesto: ${path.relative(ROOT, path.join(OUT_DIR, 'manifest.json'))}`);
  console.log(`Créditos:   ${path.relative(ROOT, path.join(OUT_DIR, 'CREDITS.md'))}`);
}

main().catch((error) => {
  console.error(`\nError: ${error.message}`);
  process.exitCode = 1;
});
