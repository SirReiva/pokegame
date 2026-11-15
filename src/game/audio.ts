/**
 * Efectos de sonido y música de fondo sobre el SoundManager de PlayCanvas.
 *
 * PlayCanvas ya se encarga de crear el AudioContext y de reanudarlo con el
 * primer gesto del usuario (`SoundManager` registra sus propios listeners de
 * desbloqueo). Aquí cargamos los MP3 como assets de tipo `audio`, disparamos un
 * `pc.SoundInstance` por efecto y mantenemos el tema de combate en un
 * `<audio loop>`: un MP3 de varios minutos en un `AudioBuffer` ocupa decenas de
 * MB de PCM y no aporta nada frente a la reproducción en streaming.
 *
 * Los efectos se cargan por roster al empezar la partida (ver
 * `audioRoster.ts`): solo las habilidades y los instintos que pueden sonar en
 * esa partida. El resto se pide bajo demanda en el primer casteo.
 *
 * El volumen general se aplica al manager (`soundManager.volume`); el de
 * efectos va por instancia y el de música, al elemento de audio.
 */

import * as pc from 'playcanvas';
import type { AbilityDef } from './abilities';
import { ABILITY_CAST_SOUNDS, HIT_SOUNDS } from './abilitySounds';
import { sfxPathsForRoster, type AudioRosterEntry } from './audioRoster';
import { getAudioSettings, subscribeAudioSettings } from './audioSettings';
import { publicUrl } from './publicUrl';

/** Voces simultáneas máximas; evita saturar en peleas de 8 jugadores. */
const MAX_VOICES = 20;
/** Evita repetir el mismo impacto en el mismo frame (varios objetivos). */
const IMPACT_INTERVAL_MS = 55;
/** Evita que un área de ticks débiles sature el sonido de armadura. */
const ARMOR_BLOCK_INTERVAL_MS = 250;
const CAST_VOLUME = 0.55;
const IMPACT_VOLUME = 0.6;
const PRELOAD_WORKERS = 6;

/** Tema de combate de la partida. */
const MATCH_MUSIC_PATH = 'music/battle-team-plasma.mp3';

let soundManager: pc.SoundManager | null = null;
let currentApp: pc.AppBase | null = null;
const sounds = new Map<string, pc.Sound>();
/** Assets cargados, para poder liberarlos al terminar la partida. */
const assets = new Map<string, pc.Asset>();
const loading = new Map<string, Promise<pc.Sound | null>>();
const failed = new Set<string>();
const lastPlayedAt = new Map<string, number>();
/**
 * Se incrementa al soltar los efectos de una partida. Las cargas que terminen
 * después pertenecen a un roster anterior y no deben rellenar la caché.
 */
let loadGeneration = 0;
let activeVoices = 0;
let volumeSubscribed = false;

let musicElement: HTMLAudioElement | null = null;
/** Reintento de reproducción tras un bloqueo de autoplay. */
let musicRetry: (() => void) | null = null;
let musicWanted = false;
let musicPaused = false;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Volumen efectivo de la música: general × música. */
function musicVolume(): number {
  const settings = getAudioSettings();
  return clamp01(settings.master * settings.music);
}

/** Aplica el volumen general al manager; el de efectos va por instancia. */
function applyVolume(): void {
  const settings = getAudioSettings();
  if (soundManager) soundManager.volume = settings.master;
  if (musicElement) musicElement.volume = musicVolume();
}

/**
 * Engancha el audio a la aplicación de PlayCanvas.
 *
 * No precarga nada: el mapa se construye sin competir por red y memoria con
 * los MP3. `prepareMatchAudio()` decide qué suena en cada partida.
 */
export function configureAudio(app: pc.AppBase): void {
  if (currentApp === app) return;
  // La música pertenece a la aplicación anterior: se corta antes de cambiar.
  stopMatchMusic();
  currentApp = app;
  soundManager = app.soundManager;
  resetSfxTracking();
  if (!volumeSubscribed) {
    volumeSubscribed = true;
    subscribeAudioSettings(applyVolume);
  }
  applyVolume();
}

/** Suelta las referencias cuando se destruye la aplicación. */
export function disposeAudio(app: pc.AppBase): void {
  if (currentApp !== app) return;
  stopMatchMusic();
  // Los assets se descargan aquí; la app se destruye justo después y su
  // registro vuelve a pasar por `unload()`, que es idempotente.
  resetSfxTracking();
  currentApp = null;
  soundManager = null;
}

/** Vacía las estructuras y descarga los assets (cambio o cierre de app). */
function resetSfxTracking(): void {
  loadGeneration += 1;
  releaseSfxAssets();
  sounds.clear();
  loading.clear();
  failed.clear();
  lastPlayedAt.clear();
  activeVoices = 0;
}

function releaseSfxAssets(): void {
  for (const asset of assets.values()) unloadAsset(asset);
  assets.clear();
}

/**
 * Libera los efectos de la partida terminada.
 *
 * Sin esto, jugar con rosters distintos acumularía los `AudioBuffer` de todas
 * las especies jugadas. Los assets se descargan del registro de PlayCanvas; el
 * siguiente roster los vuelve a pedir (normalmente desde la caché HTTP).
 */
export function releaseMatchAudio(): void {
  if (!currentApp) return;
  loadGeneration += 1;
  loading.clear();
  failed.clear();
  lastPlayedAt.clear();
  activeVoices = 0;
  sounds.clear();
  releaseSfxAssets();
}

function unloadAsset(asset: pc.Asset): void {
  try {
    asset.unload();
  } catch {
    // La app pudo liberarlo antes (destrucción en curso): no hay nada que hacer.
  }
}

function loadSound(path: string): Promise<pc.Sound | null> {
  const cached = sounds.get(path);
  if (cached) return Promise.resolve(cached);
  const pending = loading.get(path);
  if (pending) return pending;
  if (failed.has(path) || !currentApp) return Promise.resolve(null);

  const generation = loadGeneration;
  let promise: Promise<pc.Sound | null>;
  promise = new Promise<pc.Sound | null>((resolve) => {
    const app = currentApp;
    if (!app) {
      resolve(null);
      return;
    }
    app.assets.loadFromUrl(publicUrl(`audio/${path}`), 'audio', (error, asset) => {
      if (error || !asset) {
        failed.add(path);
        resolve(null);
        return;
      }
      // La aplicación pudo destruirse (o sustituirse) mientras decodificaba:
      // un sonido de un AudioContext cerrado no sirve en el nuevo.
      if (currentApp !== app) {
        resolve(null);
        return;
      }
      // El roster cambió mientras cargaba: se descarta para no retener PCM de
      // una partida que ya terminó.
      if (generation !== loadGeneration) {
        unloadAsset(asset);
        resolve(null);
        return;
      }
      const sound = asset.resource as pc.Sound;
      assets.set(path, asset);
      sounds.set(path, sound);
      resolve(sound);
    });
  }).finally(() => {
    // Una carga antigua no debe borrar la promesa nueva del mismo path.
    if (loading.get(path) === promise) loading.delete(path);
  });

  loading.set(path, promise);
  return promise;
}

/**
 * Prepara los efectos que pueden sonar en una partida y suelta los de la
 * anterior. Se llama al empezar; la música arranca en `startMatchMusic()`.
 */
export function prepareMatchAudio(roster: readonly AudioRosterEntry[]): void {
  if (!currentApp) return;
  releaseMatchAudio();
  void preloadPaths(sfxPathsForRoster(roster));
}

async function preloadPaths(paths: readonly string[]): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < paths.length) {
      const path = paths[cursor];
      cursor += 1;
      await loadSound(`sfx/${path}`);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(PRELOAD_WORKERS, paths.length) }, worker)
  );
}

function playSound(path: string, volume: number, minIntervalMs: number): void {
  const manager = soundManager;
  if (!manager) return;
  const key = `sfx/${path}`;
  const sound = sounds.get(key);
  if (!sound) {
    // Primera reproducción antes de que termine la precarga: se pide y se
    // descarta este disparo para no desincronizar el sonido del efecto.
    void loadSound(key);
    return;
  }
  if (activeVoices >= MAX_VOICES) return;

  const now = performance.now();
  const previous = lastPlayedAt.get(path);
  if (previous !== undefined && now - previous < minIntervalMs) return;
  lastPlayedAt.set(path, now);

  activeVoices += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeVoices = Math.max(0, activeVoices - 1);
  };

  const instance = new pc.SoundInstance(manager, sound, {
    volume: clamp01(volume * getAudioSettings().sfx),
    onEnd: release
  });
  instance.play();
  // Red de seguridad: si el contexto estaba suspendido o el sonido no llega a
  // arrancar, la voz no puede quedarse ocupada para siempre.
  window.setTimeout(release, (sound.duration + 1) * 1000);
}

/** Sonido de lanzamiento de la habilidad (tras el windup, si lo tiene). */
export function playAbilityCast(def: AbilityDef): void {
  const path = ABILITY_CAST_SOUNDS[def.id];
  if (!path) return;
  playSound(path, CAST_VOLUME, 0);
}

/**
 * Sonido de impacto. La efectividad (2 = súper eficaz, 0,5 = poco eficaz)
 * elige una de las tres variantes genéricas.
 */
export function playAbilityImpact(effectiveness: number): void {
  const path =
    effectiveness > 1
      ? HIT_SOUNDS.super
      : effectiveness < 1
        ? HIT_SOUNDS.weak
        : HIT_SOUNDS.normal;
  playSound(path, IMPACT_VOLUME, IMPACT_INTERVAL_MS);
}

/**
 * Golpe absorbido por la armadura de casteo. Reutiliza el sonido de Protección
 * para que el impacto se lea como “bloqueado” sin añadir un asset nuevo.
 */
export function playArmorBlock(): void {
  playSound(
    'abilities/proteccion.mp3',
    IMPACT_VOLUME * 0.75,
    ARMOR_BLOCK_INTERVAL_MS
  );
}

/**
 * El tema de combate se reproduce con un `<audio loop>` en streaming: el
 * navegador descarga y decodifica por delante, sin mantener los ~67 MB de PCM
 * que ocuparía la pista completa en un `AudioBuffer`.
 */
function ensureMusicElement(): HTMLAudioElement | null {
  if (musicElement) return musicElement;
  if (typeof document === 'undefined') return null;
  const element = document.createElement('audio');
  element.src = publicUrl(`audio/${MATCH_MUSIC_PATH}`);
  element.loop = true;
  element.preload = 'auto';
  element.volume = musicVolume();
  musicElement = element;
  return element;
}

function tryPlayMusic(): void {
  const element = ensureMusicElement();
  if (!element) return;
  element.volume = musicVolume();
  const playback = element.play();
  if (playback) {
    // El navegador puede exigir un gesto (autoplay). Se reintenta en el
    // siguiente clic o tecla, sin bloquear la partida.
    playback.catch(() => armMusicRetry());
  }
}

function armMusicRetry(): void {
  if (musicRetry || typeof window === 'undefined') return;
  const retry = () => {
    if (musicRetry !== retry) return;
    disarmMusicRetry();
    if (musicWanted && !musicPaused) tryPlayMusic();
  };
  musicRetry = retry;
  window.addEventListener('pointerdown', retry, true);
  window.addEventListener('keydown', retry, true);
}

function disarmMusicRetry(): void {
  const retry = musicRetry;
  if (!retry) return;
  musicRetry = null;
  window.removeEventListener('pointerdown', retry, true);
  window.removeEventListener('keydown', retry, true);
}

function releaseMusicElement(): void {
  const element = musicElement;
  musicElement = null;
  if (!element) return;
  try {
    element.pause();
    element.removeAttribute('src');
    // Fuerza al navegador a soltar el buffer en streaming del tema.
    element.load();
  } catch {
    // Elemento ya descartado por el navegador.
  }
}

/**
 * Arranca el tema de combate al empezar una partida. El elemento se crea en
 * este momento, no al construir el motor.
 */
export function startMatchMusic(): void {
  if (!currentApp) return;
  musicWanted = true;
  musicPaused = false;
  tryPlayMusic();
}

/** Pausa la música sin perder el punto de reproducción (menú de pausa). */
export function pauseMatchMusic(): void {
  musicPaused = true;
  musicElement?.pause();
}

/** Reanuda la música tras cerrar el menú de pausa. */
export function resumeMatchMusic(): void {
  if (!musicWanted) return;
  musicPaused = false;
  tryPlayMusic();
}

/** Detiene y reinicia el tema al terminar o abandonar la partida. */
export function stopMatchMusic(): void {
  musicWanted = false;
  musicPaused = false;
  disarmMusicRetry();
  releaseMusicElement();
}
