#!/usr/bin/env node
/**
 * Descarga los efectos de sonido de las habilidades y la música de fondo.
 *
 * Uso:
 *   pnpm sfx            # descarga/actualiza los sonidos usados por el juego
 *   pnpm sfx --force    # vuelve a descargar aunque los ficheros existan
 *
 * Álbumes de origen:
 *   Pokemon SFX Gen 5 - Attack Moves - BLK, WHT, BLK2, WHT2
 *   https://downloads.khinsider.com/game-soundtracks/album/pokemon-sfx-gen-5-attack-moves-blk-wht-blk2-wht2
 *   Pokémon Black & White (tema de combate del Team Plasma)
 *   https://downloads.khinsider.com/game-soundtracks/album/pokemon-black-and-white
 *
 * Los MP3 no se modifican: solo se renombran al id de la habilidad para que
 * `abilitySounds.ts` pueda resolverlos. Los efectos pertenecen a Nintendo,
 * Game Freak y The Pokémon Company; se usan en un proyecto fan no comercial.
 * Ver public/audio/CREDITS.md.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public', 'audio', 'sfx');
const HIT_DIR = path.join(OUT_DIR, 'hit');
const MUSIC_DIR = path.join(ROOT, 'public', 'audio', 'music');

const ALBUM =
  'https://jetta.vgmtreasurechest.com/soundtracks/pokemon-sfx-gen-5-attack-moves-blk-wht-blk2-wht2';

/**
 * Habilidad del juego -> pista del álbum. Los nombres del álbum están en
 * inglés y corresponden al movimiento real de Pokémon en el que se basa la
 * habilidad. Las que no existen en Gen 5 usan el movimiento más parecido.
 */
const ABILITY_TRACKS = {
  placaje: 'Tackle',
  ataqueRapido: 'Quick Attack',
  rayo: 'Thunderbolt',
  impactrueno: 'Thunder Shock',
  chispa: 'Spark',
  rollout: 'Rollout',
  ondaTrueno: 'Thunder Wave',
  explosion: 'Explosion',
  lenguetazo: 'Lick',
  bolaSombra: 'Shadow Ball',
  bombaLodo: 'Sludge Bomb',
  comeSuenos: 'Dream Eater',
  paralizador: 'Stun Spore',
  hojaAfilada: 'Razor Leaf',
  llueveHojas: 'Leaf Storm',
  aranazo: 'Scratch',
  giroFuego: 'Fire Spin',
  lanzallamas: 'Flamethrower',
  anilloIgneo: 'Fire Blast',
  acuaJet: 'Aqua Jet',
  rayoBurbuja: 'Bubble Beam',
  hidrobomba: 'Hydro Pump',
  garraMetal: 'Metal Claw',
  velocidadExtrema: 'Extreme Speed',
  esferaAura: 'Aura Sphere',
  combateCercano: 'Close Combat',
  // Water Shuriken no existe en Gen 5: se usa el proyectil de agua más próximo.
  shurikenAgua: 'Water Pulse',
  tajoUmbro: 'Night Slash',
  sombraVil: 'Shadow Sneak',
  pulsoUmbro: 'Dark Pulse',
  golpeAla: 'Wing Attack',
  rayoHielo: 'Ice Beam',
  vientoGelido: 'Icy Wind',
  ventisca: 'Blizzard',
  ataqueAereo: 'Aerial Ace',
  corteAereo: 'Aerial Ace',
  tajoAereo: 'Air Slash',
  ondaIgnea: 'Heat Wave',
  ataqueCeleste: 'Sky Attack',
  telequinesis: 'Telekinesis',
  teletransporte: 'Teleport',
  psiquico: 'Psychic',
  psicoataque: 'Psystrike',
  psicogolpe: 'Psycho Cut',
  agilidad: 'Agility',
  premonicion: 'Future Sight',
  recuperacion: 'Recover',
  golpeFuria: 'Fury Cutter',
  danzaEspada: 'Swords Dance',
  tijeraX: 'X Scissor',
  triturar: 'Crunch',
  avalancha: 'Avalanche',
  terremoto: 'Earthquake',
  rocaAfilada: 'Stone Edge',
  cuchillada: 'Slash',
  // Precipice Blades no existe en Gen 5: Fissure comparte la apertura del suelo.
  filoAbismo: 'Fissure',
  // Celebi: Magical Leaf y Solar Beam no están en el álbum, así que se usan
  // los movimientos de Planta y los equivalentes de tiempo/curación más cercanos.
  hojaMagica: 'Razor Leaf',
  rayoSolar: 'Leaf Storm',
  deseo: 'Recover',
  futuroSiniestro: 'Future Sight',
  proteccion: 'Protect',
  impulso: 'Quick Attack'
};

/** Efectos de impacto genéricos según la efectividad del tipo. */
const HIT_TRACKS = {
  normal: 'Hit Normal Damage',
  super: 'Hit Super Effective',
  weak: 'Hit Weak Not Very Effective'
};

/**
 * Música de fondo. Va en otro álbum, así que se guarda la URL directa ya
 * resuelta en lugar de reutilizar el mapa de carpetas de los efectos.
 */
const MUSIC_TRACKS = {
  'battle-team-plasma.mp3':
    'https://lambda.vgmtreasurechest.com/soundtracks/pokemon-black-and-white/eyhmqrkc/1-34.%20Battle%21%20Team%20Plasma.mp3'
};

/**
 * Carpetas privadas del CDN de khinsider por pista. Khinsider ofusca esta
 * ruta en su reproductor; se resolvió desde el listado del álbum y es estable
 * mientras la pista siga publicada.
 */
const TRACK_HASHES = {
  'Tackle': 'byqgiysu',
  'Quick Attack': 'uuqvdhyy',
  'Thunderbolt': 'wcyligiw',
  'Thunder Shock': 'pmrxlmbv',
  'Spark': 'lgxvjlzr',
  'Rollout': 'hpbqxqlj',
  'Thunder Wave': 'bsjuwwuh',
  'Explosion': 'esazuarj',
  'Lick': 'vpkfxujk',
  'Shadow Ball': 'olpsqcnk',
  'Sludge Bomb': 'izadrxms',
  'Dream Eater': 'jxmtgzdv',
  'Stun Spore': 'tqyuawfl',
  'Razor Leaf': 'ruusfvlv',
  'Leaf Storm': 'bopkepnt',
  'Scratch': 'nlrcktpr',
  'Fire Spin': 'npmnfnwu',
  'Flamethrower': 'dlreumzl',
  'Fire Blast': 'izzyvgvl',
  'Aqua Jet': 'zjvzotdl',
  'Bubble Beam': 'wwuiiows',
  'Hydro Pump': 'ijxkgboo',
  'Metal Claw': 'csfxxtba',
  'Extreme Speed': 'nanqovls',
  'Aura Sphere': 'gcunjgdx',
  'Close Combat': 'zrkypald',
  'Water Pulse': 'eqtuqysu',
  'Night Slash': 'rwgrqcpu',
  'Shadow Sneak': 'exajuura',
  'Dark Pulse': 'lupozipc',
  'Wing Attack': 'pmqtuuma',
  'Ice Beam': 'hmojadoj',
  'Icy Wind': 'fhubxjcl',
  'Blizzard': 'gugvjimo',
  'Aerial Ace': 'traeuiky',
  'Air Slash': 'wxwrvarf',
  'Heat Wave': 'ixozhmpo',
  'Sky Attack': 'kldgwpjb',
  'Telekinesis': 'hgkgblek',
  'Teleport': 'qytwdeie',
  'Psychic': 'grpbkxfm',
  'Psystrike': 'vppcsino',
  'Psycho Cut': 'onwukpvg',
  'Agility': 'hedcawej',
  'Future Sight': 'whudjinp',
  'Recover': 'servekla',
  'Fury Cutter': 'ciipzdti',
  'Swords Dance': 'msdnhtwb',
  'X Scissor': 'etfwsxmp',
  'Crunch': 'thfgphnv',
  'Avalanche': 'amhcnhwm',
  'Earthquake': 'dhyxpjcg',
  'Stone Edge': 'jrjuyffl',
  'Slash': 'oqljopht',
  'Fissure': 'joodzpzb',
  'Protect': 'kdkpuemz',
  'Hit Normal Damage': 'jnnzlend',
  'Hit Super Effective': 'ejipzexy',
  'Hit Weak Not Very Effective': 'agfjdoln'
};

function trackUrl(name) {
  const hash = TRACK_HASHES[name];
  if (!hash) throw new Error(`Sin carpeta CDN para la pista "${name}"`);
  return `${ALBUM}/${hash}/${encodeURIComponent(name)}.mp3`;
}

async function download(url, destination, force) {
  if (!force && existsSync(destination)) return 'skip';
  const response = await fetch(url, {
    headers: {
      // El CDN rechaza peticiones sin User-Agent de navegador.
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
      Accept: 'audio/mpeg,*/*'
    }
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} · ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(destination, buffer);
  return `${(buffer.length / 1024).toFixed(0)} KB`;
}

async function main() {
  const force = process.argv.includes('--force');
  await mkdir(path.join(OUT_DIR, 'abilities'), { recursive: true });
  await mkdir(HIT_DIR, { recursive: true });
  await mkdir(MUSIC_DIR, { recursive: true });

  const jobs = [
    ...Object.entries(ABILITY_TRACKS).map(([id, track]) => ({
      url: trackUrl(track),
      destination: path.join(OUT_DIR, 'abilities', `${id}.mp3`),
      label: `abilities/${id}.mp3`
    })),
    ...Object.entries(HIT_TRACKS).map(([key, track]) => ({
      url: trackUrl(track),
      destination: path.join(HIT_DIR, `${key}.mp3`),
      label: `hit/${key}.mp3`
    })),
    ...Object.entries(MUSIC_TRACKS).map(([file, url]) => ({
      url,
      destination: path.join(MUSIC_DIR, file),
      label: `music/${file}`
    }))
  ];

  let downloaded = 0;
  let skipped = 0;
  for (const job of jobs) {
    const result = await download(job.url, job.destination, force);
    if (result === 'skip') {
      skipped += 1;
      continue;
    }
    downloaded += 1;
    console.log(`✓ ${job.label} (${result})`);
  }
  console.log(`\nSonidos: ${downloaded} descargados, ${skipped} ya existentes.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
