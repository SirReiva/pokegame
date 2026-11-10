/**
 * Efectos de sonido y música de fondo sobre el SoundManager de PlayCanvas.
 *
 * PlayCanvas ya se encarga de crear el AudioContext y de reanudarlo con el
 * primer gesto del usuario (`SoundManager` registra sus propios listeners de
 * desbloqueo). Aquí cargamos los MP3 como assets de tipo `audio`, disparamos un
 * `pc.SoundInstance` por efecto y mantenemos una instancia en bucle para el
 * tema de combate.
 *
 * El volumen general se aplica al manager (`soundManager.volume`); el de
 * efectos y el de música, a cada instancia.
 */

import * as pc from 'playcanvas';
import type { AbilityDef } from './abilities';
import {
  ABILITY_CAST_SOUNDS,
  ALL_SFX_PATHS,
  HIT_SOUNDS
} from './abilitySounds';
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
const loading = new Map<string, Promise<pc.Sound | null>>();
const failed = new Set<string>();
const lastPlayedAt = new Map<string, number>();
let activeVoices = 0;
let volumeSubscribed = false;

let musicInstance: pc.SoundInstance | null = null;
let musicWanted = false;
let musicPaused = false;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Aplica el volumen general al manager; el de efectos va por instancia. */
function applyVolume(): void {
  if (!soundManager) return;
  const settings = getAudioSettings();
  soundManager.volume = settings.master;
  if (musicInstance) musicInstance.volume = clamp01(settings.music);
}

/**
 * Engancha el audio a la aplicación de PlayCanvas y precarga los sonidos.
 * Se llama al crear `Game`, antes de que empiece la partida.
 */
export function configureAudio(app: pc.AppBase): void {
  if (currentApp === app) return;
  // La música pertenece a la aplicación anterior: se corta antes de cambiar.
  musicWanted = false;
  musicPaused = false;
  musicInstance?.stop();
  musicInstance = null;
  currentApp = app;
  soundManager = app.soundManager;
  sounds.clear();
  loading.clear();
  failed.clear();
  lastPlayedAt.clear();
  activeVoices = 0;
  if (!volumeSubscribed) {
    volumeSubscribed = true;
    subscribeAudioSettings(applyVolume);
  }
  applyVolume();
  void preloadAudio();
  void loadSound(MATCH_MUSIC_PATH);
}

/** Suelta las referencias cuando se destruye la aplicación. */
export function disposeAudio(app: pc.AppBase): void {
  if (currentApp !== app) return;
  stopMatchMusic();
  currentApp = null;
  soundManager = null;
  sounds.clear();
  loading.clear();
  failed.clear();
  lastPlayedAt.clear();
  activeVoices = 0;
}

function loadSound(path: string): Promise<pc.Sound | null> {
  const cached = sounds.get(path);
  if (cached) return Promise.resolve(cached);
  const pending = loading.get(path);
  if (pending) return pending;
  if (failed.has(path) || !currentApp) return Promise.resolve(null);

  const promise = new Promise<pc.Sound | null>((resolve) => {
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
      const sound = asset.resource as pc.Sound;
      sounds.set(path, sound);
      resolve(sound);
    });
  }).finally(() => {
    loading.delete(path);
  });

  loading.set(path, promise);
  return promise;
}

async function preloadAudio(): Promise<void> {
  const paths = ALL_SFX_PATHS;
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

function startMusicInstance(sound: pc.Sound): void {
  const manager = soundManager;
  if (!manager || musicInstance) return;
  const instance = new pc.SoundInstance(manager, sound, {
    loop: true,
    volume: clamp01(getAudioSettings().music)
  });
  instance.play();
  musicInstance = instance;
}

/**
 * Arranca el tema de combate al empezar una partida. Si el MP3 aún se está
 * decodificando, arranca en cuanto esté listo (si la partida sigue activa).
 */
export function startMatchMusic(): void {
  musicWanted = true;
  musicPaused = false;
  if (!soundManager) return;
  if (musicInstance) {
    musicInstance.volume = clamp01(getAudioSettings().music);
    musicInstance.resume();
    return;
  }
  const sound = sounds.get(MATCH_MUSIC_PATH);
  if (sound) {
    startMusicInstance(sound);
    return;
  }
  void loadSound(MATCH_MUSIC_PATH).then((loaded) => {
    if (loaded && musicWanted && !musicPaused) startMusicInstance(loaded);
  });
}

/** Pausa la música sin perder el punto de reproducción (menú de pausa). */
export function pauseMatchMusic(): void {
  musicPaused = true;
  musicInstance?.pause();
}

/** Reanuda la música tras cerrar el menú de pausa. */
export function resumeMatchMusic(): void {
  if (!musicWanted) return;
  musicPaused = false;
  if (musicInstance) {
    musicInstance.resume();
    return;
  }
  startMatchMusic();
}

/** Detiene y reinicia el tema al terminar o abandonar la partida. */
export function stopMatchMusic(): void {
  musicWanted = false;
  musicPaused = false;
  musicInstance?.stop();
  musicInstance = null;
}
