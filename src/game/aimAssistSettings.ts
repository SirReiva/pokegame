/**
 * Ajustes de la ayuda de apuntado, persistidos en `localStorage`.
 *
 * Este módulo no importa PlayCanvas ni lógica de combate a propósito: la
 * pantalla de Opciones lo usa para el interruptor sin cargar el motor 3D y el
 * motor lo consulta al lanzar proyectiles y haces.
 */

export interface AimAssistSettings {
  /** Si se permite corregir el ángulo de proyectiles y haces. */
  enabled: boolean;
}

const STORAGE_KEY = 'newpoke.aim-assist.v1';
const DEFAULT_SETTINGS: AimAssistSettings = { enabled: true };

let settings = loadSettings();
const listeners = new Set<() => void>();

function parseSettings(parsed: Partial<AimAssistSettings>): AimAssistSettings {
  return {
    enabled:
      typeof parsed.enabled === 'boolean'
        ? parsed.enabled
        : DEFAULT_SETTINGS.enabled
  };
}

function loadSettings(): AimAssistSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return parseSettings(JSON.parse(raw) as Partial<AimAssistSettings>);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function persist(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage puede no estar disponible (modo privado): se mantiene en memoria.
  }
}

export function getAimAssistSettings(): AimAssistSettings {
  return { ...settings };
}

/** Atajo para el bucle de juego: evita copiar el objeto en cada casteo. */
export function isAimAssistEnabled(): boolean {
  return settings.enabled;
}

export function setAimAssistSettings(patch: Partial<AimAssistSettings>): void {
  settings = parseSettings({ ...settings, ...patch });
  persist();
  for (const listener of listeners) listener();
}

/** Suscribe la UI a los cambios del ajuste. */
export function subscribeAimAssistSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
