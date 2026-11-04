/**
 * Ajustes de audio persistidos en localStorage.
 *
 * Este módulo no importa PlayCanvas a propósito: la pantalla de Opciones lo
 * usa para los sliders sin cargar el motor 3D. `audio.ts` se suscribe aquí para
 * aplicar el volumen al SoundManager cuando esté disponible.
 */

export interface AudioSettings {
  /** Volumen global 0-1. */
  master: number;
  /** Volumen de los efectos 0-1. */
  sfx: number;
  /** Volumen de la música de fondo 0-1. */
  music: number;
}

const STORAGE_KEY = "newpoke.audio.v2";
const LEGACY_STORAGE_KEY = "newpoke.audio.v1";
const DEFAULT_SETTINGS: AudioSettings = { master: 0.6, sfx: 0.7, music: 0.1 };

let settings = loadSettings();
const listeners = new Set<() => void>();

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function parseSettings(parsed: Partial<AudioSettings>): AudioSettings {
  return {
    master: clamp01(parsed.master ?? DEFAULT_SETTINGS.master),
    sfx: clamp01(parsed.sfx ?? DEFAULT_SETTINGS.sfx),
    music: clamp01(parsed.music ?? DEFAULT_SETTINGS.music),
  };
}

function loadSettings(): AudioSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return parseSettings(JSON.parse(raw) as Partial<AudioSettings>);

    // Migración desde v1: se conservan los volúmenes general y de efectos,
    // pero la música vuelve al nuevo valor por defecto (más bajo), porque v1
    // solo guardaba el 35 % que resultaba demasiado alto de fondo.
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Partial<AudioSettings>;
      const migrated: AudioSettings = {
        master: clamp01(parsed.master ?? DEFAULT_SETTINGS.master),
        sfx: clamp01(parsed.sfx ?? DEFAULT_SETTINGS.sfx),
        music: DEFAULT_SETTINGS.music,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      return migrated;
    }
    return { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage puede no estar disponible (modo privado): se mantiene en memoria.
  }
}

export function getAudioSettings(): AudioSettings {
  return { ...settings };
}

export function setAudioSettings(patch: Partial<AudioSettings>): void {
  settings = {
    master:
      patch.master === undefined ? settings.master : clamp01(patch.master),
    sfx: patch.sfx === undefined ? settings.sfx : clamp01(patch.sfx),
    music: patch.music === undefined ? settings.music : clamp01(patch.music),
  };
  persist();
  for (const listener of listeners) listener();
}

/** Suscribe la UI (o el motor) a los cambios de volumen. */
export function subscribeAudioSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
