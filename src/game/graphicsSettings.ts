/**
 * Ajustes gráficos persistidos en localStorage.
 *
 * Este módulo no importa PlayCanvas a propósito: la pantalla de Opciones lo
 * usa para elegir el backend sin cargar el motor 3D. `appBootstrap.ts` lee la
 * preferencia al crear el dispositivo y publica aquí cuál se usó de verdad.
 */

/** Backend elegido por el jugador. `auto` deja decidir al motor. */
export type GraphicsBackend = "auto" | "webgpu" | "webgl2";

/** Backend que acabó usando la última aplicación creada. */
export type ActiveGraphicsBackend = "webgpu" | "webgl2";

export interface GraphicsSettings {
  backend: GraphicsBackend;
}

const STORAGE_KEY = "newpoke.graphics.v1";
const DEFAULT_SETTINGS: GraphicsSettings = { backend: "auto" };

const BACKENDS: readonly GraphicsBackend[] = ["auto", "webgpu", "webgl2"];

let settings = loadSettings();
let activeBackend: ActiveGraphicsBackend | null = null;
const listeners = new Set<() => void>();

function parseSettings(parsed: Partial<GraphicsSettings>): GraphicsSettings {
  const backend = BACKENDS.includes(parsed.backend as GraphicsBackend)
    ? (parsed.backend as GraphicsBackend)
    : DEFAULT_SETTINGS.backend;
  return { backend };
}

function loadSettings(): GraphicsSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return parseSettings(JSON.parse(raw) as Partial<GraphicsSettings>);
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

export function getGraphicsSettings(): GraphicsSettings {
  return { ...settings };
}

export function setGraphicsSettings(patch: Partial<GraphicsSettings>): void {
  settings = parseSettings({ ...settings, ...patch });
  persist();
  for (const listener of listeners) listener();
}

/** Suscribe la UI a los cambios de preferencia o de backend activo. */
export function subscribeGraphicsSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Lo llama el arranque del motor tras crear el dispositivo. */
export function setActiveGraphicsBackend(backend: ActiveGraphicsBackend): void {
  if (activeBackend === backend) return;
  activeBackend = backend;
  for (const listener of listeners) listener();
}

/** Backend real de la última partida; `null` si aún no se ha creado ninguna. */
export function getActiveGraphicsBackend(): ActiveGraphicsBackend | null {
  return activeBackend;
}
