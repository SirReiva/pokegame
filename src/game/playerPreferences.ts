/**
 * Preferencias de cada dispositivo (nombre y modo de control) guardadas en
 * `sessionStorage`.
 *
 * La identidad es la del dispositivo (`kbd`, `pad-0`, `pad-1`…), no la plaza,
 * para que al reconectar un mando recupere su nombre y su modo de control
 * aunque haya cambiado de hueco en el lobby.
 */

import {
  DEFAULT_MOVEMENT_MODE,
  MOVEMENT_MODES,
  PLAYER_NAME_MAX_LENGTH,
  type MovementMode
} from './multiplayer';

export interface PlayerPreference {
  name: string;
  movementMode: MovementMode;
}

const STORAGE_KEY = 'newpoke.player-prefs.v1';

type StoredPreference = Partial<PlayerPreference>;
type StoredPreferences = Record<string, StoredPreference>;

function readPreferences(): StoredPreferences {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as StoredPreferences;
  } catch {
    // sessionStorage puede no estar disponible o contener datos corruptos.
    return {};
  }
}

function isMovementMode(value: unknown): value is MovementMode {
  return MOVEMENT_MODES.includes(value as MovementMode);
}

function cleanName(value: unknown): string | null {
  return typeof value === 'string' ? value.slice(0, PLAYER_NAME_MAX_LENGTH) : null;
}

/** Preferencias guardadas de un dispositivo, o `null` si no tiene ninguna. */
export function loadPlayerPreference(deviceId: string): PlayerPreference | null {
  const entry = readPreferences()[deviceId];
  if (!entry || typeof entry !== 'object') return null;

  const name = cleanName(entry.name);
  const movementMode = isMovementMode(entry.movementMode)
    ? entry.movementMode
    : null;
  if (name === null && movementMode === null) return null;

  return {
    name: name ?? '',
    movementMode: movementMode ?? DEFAULT_MOVEMENT_MODE
  };
}

/** Guarda total o parcialmente las preferencias de un dispositivo. */
export function savePlayerPreference(
  deviceId: string,
  patch: Partial<PlayerPreference>
): void {
  if (typeof window === 'undefined') return;

  const all = readPreferences();
  const next: StoredPreference = { ...all[deviceId] };

  const name = cleanName(patch.name);
  if (name !== null) next.name = name;
  if (isMovementMode(patch.movementMode)) {
    next.movementMode = patch.movementMode;
  }

  all[deviceId] = next;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Sin sessionStorage (modo privado) se mantiene solo el estado en memoria.
  }
}
