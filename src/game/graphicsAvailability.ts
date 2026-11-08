/**
 * Comprueba qué backends gráficos puede usar este navegador.
 *
 * No importa PlayCanvas: la pantalla de Opciones lo usa antes de montar el
 * motor. El resultado se cachea para no pedir un adaptador WebGPU cada vez que
 * se entra en Opciones.
 */

export interface GraphicsAvailability {
  webgpu: boolean;
  webgl2: boolean;
}

/** Forma mínima de la API de WebGPU que consulta la sonda. */
interface GpuNavigator {
  gpu?: {
    requestAdapter(options?: {
      powerPreference?: "low-power" | "high-performance";
    }): Promise<unknown | null>;
  };
}

let pending: Promise<GraphicsAvailability> | null = null;

export function detectGraphicsAvailability(): Promise<GraphicsAvailability> {
  pending ??= probe();
  return pending;
}

async function probe(): Promise<GraphicsAvailability> {
  const [webgpu, webgl2] = await Promise.all([probeWebgpu(), probeWebgl2()]);
  return { webgpu, webgl2 };
}

async function probeWebgpu(): Promise<boolean> {
  const gpu = (navigator as Navigator & GpuNavigator).gpu;
  if (!gpu) return false;
  try {
    // Se consulta con la misma preferencia que usa `createGameApp`, para que el
    // icono refleje lo que realmente intentará el motor.
    return (await gpu.requestAdapter({ powerPreference: "high-performance" })) !== null;
  } catch {
    return false;
  }
}

function probeWebgl2(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return false;
    // Libera el contexto de la sonda; no se queda un canvas vivo por opciones.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
