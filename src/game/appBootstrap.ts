import * as pc from 'playcanvas';
import {
  getGraphicsSettings,
  setActiveGraphicsBackend,
  type GraphicsBackend
} from './graphicsSettings';

/**
 * Orden de intentos por preferencia. `createGraphicsDevice` añade WebGL2 como
 * último recurso, así que `auto` y `webgpu` comparten lista; el caso `webgpu`
 * se valida después para no mentir al jugador.
 */
const DEVICE_TYPES: Record<GraphicsBackend, string[]> = {
  auto: [pc.DEVICETYPE_WEBGPU, pc.DEVICETYPE_WEBGL2],
  webgpu: [pc.DEVICETYPE_WEBGPU, pc.DEVICETYPE_WEBGL2],
  webgl2: [pc.DEVICETYPE_WEBGL2]
};

/**
 * Crea el dispositivo gráfico y la aplicación de PlayCanvas.
 *
 * `pc.Application` registraba todos los sistemas por defecto, pero está
 * previsto que se deprecie en favor de `AppBase` + `createGraphicsDevice`. Con
 * `AppBase` hay que declarar solo lo que usa el juego: los cuatro componentes
 * que aparecen en `addComponent` y el handler de audio (el resto de texturas y
 * sprites se crean a mano, sin pasar por el registro de assets).
 *
 * Los shaders propios (niebla, viento y efectos) tienen versión GLSL y WGSL,
 * así que ambos backends son válidos. Ver `docs/graficos-webgpu.md`.
 */
export async function createGameApp(
  canvas: HTMLCanvasElement,
  backend: GraphicsBackend = getGraphicsSettings().backend
): Promise<pc.AppBase> {
  const device = await pc.createGraphicsDevice(canvas, {
    deviceTypes: DEVICE_TYPES[backend],
    antialias: true,
    alpha: false,
    // En portátiles híbridos fuerza la GPU dedicada en vez de la integrada.
    // Chrome en Windows ignora esta opción al pedir el adaptador WebGPU y lo
    // avisa por consola (crbug.com/369219127); se mantiene porque sí se aplica
    // al contexto WebGL2 de respaldo y es el valor por defecto de PlayCanvas.
    powerPreference: 'high-performance'
  });

  // El motor siempre deja WebGL2 como último recurso. Si el jugador pidió
  // WebGPU explícitamente, es mejor avisar que jugar sin saberlo.
  if (backend === 'webgpu' && !device.isWebGPU) {
    device.destroy();
    throw new Error(
      'WebGPU no está disponible en este navegador. Cambia el backend a Automático o WebGL2 en Opciones.'
    );
  }

  const app = new pc.AppBase(canvas);
  const options = new pc.AppOptions();
  options.graphicsDevice = device;
  options.componentSystems = [
    pc.RenderComponentSystem,
    pc.CameraComponentSystem,
    pc.LightComponentSystem,
    pc.ParticleSystemComponentSystem
  ];
  options.resourceHandlers = [pc.AudioHandler];
  options.soundManager = new pc.SoundManager();
  app.init(options);

  setActiveGraphicsBackend(device.isWebGPU ? 'webgpu' : 'webgl2');
  return app;
}
