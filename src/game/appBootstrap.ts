import * as pc from 'playcanvas';

/**
 * Crea el dispositivo gráfico y la aplicación de PlayCanvas.
 *
 * `pc.Application` registraba todos los sistemas por defecto, pero está
 * previsto que se deprecie en favor de `AppBase` + `createGraphicsDevice`. Con
 * `AppBase` hay que declarar solo lo que usa el juego: los cuatro componentes
 * que aparecen en `addComponent` y el handler de audio (el resto de texturas y
 * sprites se crean a mano, sin pasar por el registro de assets).
 */
export async function createGameApp(canvas: HTMLCanvasElement): Promise<pc.AppBase> {
  const device = await pc.createGraphicsDevice(canvas, {
    // Solo WebGL2 por ahora: WebGPU exigiría portar a WGSL los shaders hechos
    // a mano (niebla, viento y los `MOTION_*` de los efectos).
    deviceTypes: [pc.DEVICETYPE_WEBGL2],
    antialias: true,
    alpha: false,
    // En portátiles híbridos fuerza la GPU dedicada en vez de la integrada.
    powerPreference: 'high-performance'
  });

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
  return app;
}
