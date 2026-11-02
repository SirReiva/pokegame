import * as pc from 'playcanvas';
import { CONFIG, DEG } from './config';
import { MAX_TEAM_SIZE, type SplitRect } from './multiplayer';
import { mapHalfDepth, mapHalfWidth } from './terrain';

/**
 * Niebla de guerra dibujada por el motor.
 *
 * Hay dos piezas:
 * - `FogView`: quad pegado a la cámara que sombrea fuera de la unión de los
 *   círculos de visión del equipo.
 * - `FogDecal`: plano horizontal en el mundo con la visibilidad del equipo y
 *   las sombras que proyectan las cordilleras. Al estar fijo en el mapa, no
 *   depende de la cámara.
 */

/** Círculo de visión de un Pokémon, en coordenadas de mundo. */
export interface VisionCircle {
  x: number;
  z: number;
  visionRange: number;
}

/** Tope de círculos que puede revelar una vista (un equipo completo). */
const MAX_VISION_CIRCLES = MAX_TEAM_SIZE;

const VERTEX_SHADER = `
attribute vec3 aPosition;
attribute vec2 aUv0;
uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;
varying vec2 vUv;

void main(void) {
  vUv = aUv0;
  gl_Position = matrix_viewProjection * matrix_model * vec4(aPosition, 1.0);
}
`;

/**
 * Variante para el decal: además de la UV del plano, pasa la posición en clip
 * space para reconstruir en el fragment el óvalo de pantalla de la vista.
 */
const DECAL_VERTEX_SHADER = `
attribute vec3 aPosition;
attribute vec2 aUv0;
uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;
varying vec2 vUv;
varying vec4 vClip;

void main(void) {
  vUv = aUv0;
  vec4 clip = matrix_viewProjection * matrix_model * vec4(aPosition, 1.0);
  vClip = clip;
  gl_Position = clip;
}
`;

const FRAGMENT_SHADER = `
varying vec2 vUv;
uniform vec3 uFogColor;
uniform float uFogOpacity;
uniform vec2 uFogCenter[${MAX_VISION_CIRCLES}];
uniform vec2 uFogRadius[${MAX_VISION_CIRCLES}];
uniform float uFogFeather;

void main(void) {
  // La visión es de equipo: el alfa es el mínimo de todos los círculos, así
  // que basta con estar dentro de uno para que el mundo se dibuje normal.
  // Los círculos sin usar se envían con radio 0 y no revelan nada.
  float alpha = 1.0;
  for (int i = 0; i < ${MAX_VISION_CIRCLES}; i++) {
    vec2 offset = (vUv - uFogCenter[i]) / max(uFogRadius[i], vec2(0.0001));
    alpha = min(alpha, smoothstep(1.0 - uFogFeather, 1.0, length(offset)));
  }
  gl_FragColor = vec4(uFogColor, alpha * uFogOpacity);
}
`;

const DECAL_FRAGMENT_SHADER = `
varying vec2 vUv;
varying vec4 vClip;
uniform vec3 uFogColor;
uniform sampler2D uFogMask;
uniform vec2 uScreenCenter[${MAX_VISION_CIRCLES}];
uniform vec2 uScreenRadius[${MAX_VISION_CIRCLES}];
uniform float uScreenFeather;
uniform float uScreenOpacity;

void main(void) {
  // La máscara ya codifica la visibilidad del equipo: blanco donde ve algún
  // Pokémon vivo (dentro de su círculo y sin un separador de por medio) y
  // negro donde no ve ninguno. El decal solo oscurece esa parte oculta.
  float hidden = (1.0 - texture2D(uFogMask, vUv).r) * uScreenOpacity;

  // Misma unión de óvalos y mismo degradado que dibuja FogView. Al compartir
  // el borde, la sombra se funde con la niebla en lugar de cortarse.
  vec2 clipUv = vClip.xy / vClip.w * 0.5 + 0.5;
  float circle = 1.0;
  for (int i = 0; i < ${MAX_VISION_CIRCLES}; i++) {
    vec2 offset = (clipUv - uScreenCenter[i]) / max(uScreenRadius[i], vec2(0.0001));
    circle = min(circle, smoothstep(1.0 - uScreenFeather, 1.0, length(offset)));
  }
  circle *= uScreenOpacity;

  float target = max(circle, hidden);
  float alpha = clamp(
    (target - circle) / max(1.0 - circle, 0.001),
    0.0,
    1.0
  );

  gl_FragColor = vec4(uFogColor, alpha);
}
`;

/** Oclusor de visión que proyecta sombra sobre el terreno. */
export interface SightOccluder {
  x: number;
  z: number;
  radius: number;
  /** Extremos del tramo de cresta, para el caso de jugador pegado. */
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

/**
 * Círculos de visión ya proyectados a UV de la vista. Los calcula `FogView` y
 * los consume `FogDecal` para que ambas capas de niebla compartan el mismo
 * borde y la misma unión de visibilidad del equipo.
 */
export interface ScreenFog {
  centers: Float32Array;
  radii: Float32Array;
  feather: number;
  opacity: number;
}

const MASK_SIZE = 192;
const SHADOW_LENGTH = 40;
/** Margen (u) del círculo en la máscara para tapar el borde suave de FogView. */
const MASK_CIRCLE_MARGIN = 0.75;
/** Extensión de la banda cuando el jugador está pegado a la cresta. */
const INSIDE_EDGE_EXTENSION = 0.05;

/**
 * El quad se dibuja un 2 % más grande que el frustum para no dejar una costura
 * de un píxel en los bordes del viewport. Las UV se amplían lo mismo para que
 * el borde de la pantalla siga correspondiendo exactamente a 0-1.
 */
const QUAD_MARGIN = 1.02;
const UV_MARGIN = 0.01;

/** Quad unitario en el plano XY, con UV de pantalla. */
export function createFogMesh(device: pc.GraphicsDevice): pc.Mesh {
  const mesh = new pc.Mesh(device);
  mesh.setPositions([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  mesh.setUvs(0, [
    -UV_MARGIN, -UV_MARGIN,
    1 + UV_MARGIN, -UV_MARGIN,
    1 + UV_MARGIN, 1 + UV_MARGIN,
    -UV_MARGIN, 1 + UV_MARGIN
  ]);
  mesh.setIndices([0, 1, 2, 0, 2, 3]);
  mesh.update();
  return mesh;
}

/** Plano horizontal de mapa completo para el decal de sombra. */
export function createFogDecalMesh(device: pc.GraphicsDevice): pc.Mesh {
  const mesh = new pc.Mesh(device);
  mesh.setPositions([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]);
  mesh.setUvs(0, [0, 0, 1, 0, 1, 1, 0, 1]);
  mesh.setIndices([0, 1, 2, 0, 2, 3]);
  mesh.update();
  return mesh;
}

/** Niebla de pantalla de una vista: unión de círculos del equipo y sombreado exterior. */
export class FogView {
  readonly entity: pc.Entity;

  /** Unión de círculos en UV de la vista; la comparte el decal de cordillera. */
  readonly screenFog: ScreenFog = {
    centers: new Float32Array(MAX_VISION_CIRCLES * 2),
    radii: new Float32Array(MAX_VISION_CIRCLES * 2),
    feather: CONFIG.vision.fogFeather,
    opacity: 0
  };

  private readonly device: pc.GraphicsDevice;
  private readonly material: pc.ShaderMaterial;

  /** Vectores reutilizados para proyectar los círculos de visión a pantalla. */
  private readonly worldPoints = {
    probe: new pc.Vec3()
  };
  private readonly screenPoints = {
    probe: new pc.Vec3()
  };

  constructor(
    device: pc.GraphicsDevice,
    mesh: pc.Mesh,
    cameraEntity: pc.Entity,
    layerId: number,
    index: number
  ) {
    this.device = device;

    // Los círculos sin usar se mandan lejos y con radio 0 para que el shader
    // no revele nada hasta que `update` reciba los observadores reales.
    for (let index = 0; index < MAX_VISION_CIRCLES; index++) {
      this.screenFog.centers[index * 2] = -1000;
      this.screenFog.centers[index * 2 + 1] = -1000;
    }

    this.material = new pc.ShaderMaterial({
      uniqueName: 'fog-of-war',
      vertexGLSL: VERTEX_SHADER,
      fragmentGLSL: FRAGMENT_SHADER,
      attributes: {
        aPosition: pc.SEMANTIC_POSITION,
        aUv0: pc.SEMANTIC_TEXCOORD0
      }
    });
    this.material.blendType = pc.BLEND_NORMAL;
    this.material.depthTest = false;
    this.material.depthWrite = false;
    this.material.cull = pc.CULLFACE_NONE;
    this.material.setParameter('uFogColor', new Float32Array(CONFIG.vision.fogColor));
    this.material.setParameter('uFogOpacity', this.screenFog.opacity);
    this.material.setParameter('uFogFeather', this.screenFog.feather);
    this.material.setParameter('uFogCenter[0]', this.screenFog.centers);
    this.material.setParameter('uFogRadius[0]', this.screenFog.radii);
    this.material.update();

    const instance = new pc.MeshInstance(mesh, this.material);
    instance.castShadow = false;
    instance.receiveShadow = false;
    instance.drawOrder = 1000;

    this.entity = new pc.Entity(`fog-view-${index + 1}`);
    this.entity.addComponent('render');
    const render = this.entity.render!;
    render.meshInstances = [instance];
    render.castShadows = false;
    render.receiveShadows = false;
    render.layers = [layerId];
    cameraEntity.addChild(this.entity);
  }

  /**
   * Recoloca el quad para cubrir el viewport y le pasa al shader la unión de
   * los círculos de visión del equipo, proyectados a UV de esta vista. La
   * unión queda en `screenFog` para que el decal de sombra compense la niebla
   * con los mismos óvalos.
   *
   * Cada círculo se proyecta muestreando su perímetro en el suelo y tomando la
   * caja envolvente en pantalla. Si parte del círculo queda detrás de la
   * cámara, el borde inferior se prolonga hasta el final del panel; si no cae
   * nada delante, el círculo no revela nada.
   */
  update(
    camera: pc.CameraComponent,
    viewport: SplitRect,
    yaw: number,
    circles: readonly VisionCircle[]
  ): void {
    const { width: canvasWidth, height: canvasHeight } = this.device.clientRect;
    const rectWidth = viewport.w * canvasWidth;
    const rectHeight = viewport.h * canvasHeight;
    if (rectWidth <= 0 || rectHeight <= 0) {
      this.setOpacity(0);
      return;
    }

    // Quad en espacio de cámara: cubre exactamente el frustum a esta distancia.
    const aspect = rectWidth / rectHeight;
    const distance = camera.nearClip + 0.05;
    const halfHeight = Math.tan((camera.fov * DEG) / 2) * distance * QUAD_MARGIN;
    const halfWidth = halfHeight * aspect;
    this.entity.setLocalPosition(0, 0, -distance);
    this.entity.setLocalScale(halfWidth, halfHeight, 1);

    const rectLeft = viewport.x * canvasWidth;
    const rectTop = (1 - viewport.y - viewport.h) * canvasHeight;

    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const cameraPosition = camera.entity.getPosition();
    const pitch = CONFIG.camera.pitch * DEG;
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const world = this.worldPoints;
    const screen = this.screenPoints;

    const toX = (screenX: number) => ((screenX - rectLeft) / rectWidth) * 100;
    const toY = (screenY: number) => ((screenY - rectTop) / rectHeight) * 100;
    const clampX = (value: number) => Math.min(400, Math.max(-200, value));
    const clampY = (value: number) => Math.min(160, Math.max(-20, value));

    for (let index = 0; index < MAX_VISION_CIRCLES; index++) {
      const slot = index * 2;
      const circle = circles[index];
      if (!circle || circle.visionRange <= 0.0001) {
        this.screenFog.centers[slot] = -1000;
        this.screenFog.centers[slot + 1] = -1000;
        this.screenFog.radii[slot] = 0;
        this.screenFog.radii[slot + 1] = 0;
        continue;
      }

      const { x, z, visionRange } = circle;
      // El círculo local se muestrea fino para conservar su borde suave; los
      // aliados usan menos muestras porque su óvalo suele quedar más lejos.
      const probeSteps = index === 0 ? 32 : 16;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let behindCamera = false;

      for (let step = 0; step < probeSteps; step++) {
        const angle = (step / probeSteps) * Math.PI * 2;
        const probeX = x + Math.cos(angle) * visionRange;
        const probeZ = z + Math.sin(angle) * visionRange;
        // Profundidad real aproximada con el pitch de la cámara: los puntos
        // que quedan detrás no se pueden proyectar y se descartan.
        const depth =
          (probeX - cameraPosition.x) * forwardX +
          (probeZ - cameraPosition.z) * forwardZ;
        const depth3D = depth * cosPitch + cameraPosition.y * sinPitch;
        if (depth3D <= camera.nearClip) {
          behindCamera = true;
          continue;
        }

        const probe = camera.worldToScreen(
          world.probe.set(probeX, 0, probeZ),
          screen.probe
        );
        const screenX = toX(probe.x);
        const screenY = toY(probe.y);
        if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) continue;
        minX = Math.min(minX, screenX);
        maxX = Math.max(maxX, screenX);
        minY = Math.min(minY, screenY);
        maxY = Math.max(maxY, screenY);
      }

      // Ningún punto del círculo cae delante de la cámara: no revela nada.
      if (minX === Infinity) {
        this.screenFog.centers[slot] = -1000;
        this.screenFog.centers[slot + 1] = -1000;
        this.screenFog.radii[slot] = 0;
        this.screenFog.radii[slot + 1] = 0;
        continue;
      }

      // El lado cercano del círculo se sale por abajo del panel; prolongar el
      // óvalo hasta el borde evita un hueco de niebla junto a la cámara.
      if (behindCamera) maxY = Math.max(maxY, 160);

      minX = clampX(minX);
      maxX = clampX(maxX);
      minY = clampY(minY);
      maxY = clampY(maxY);

      // Círculo completamente fuera del panel: tampoco puede revelar nada.
      if (maxX < 0 || minX > 100 || maxY < 0 || minY > 100) {
        this.screenFog.centers[slot] = -1000;
        this.screenFog.centers[slot + 1] = -1000;
        this.screenFog.radii[slot] = 0;
        this.screenFog.radii[slot + 1] = 0;
        continue;
      }

      const centerX = (minX + maxX) * 0.5;
      const centerY = (minY + maxY) * 0.5;
      const radiusX = Math.max(0.5, (maxX - minX) * 0.5);
      const radiusY = Math.max(0.5, (maxY - minY) * 0.5);

      // La UV del quad tiene el origen abajo; el centro calculado viene del
      // origen superior de la pantalla.
      this.screenFog.centers[slot] = centerX / 100;
      this.screenFog.centers[slot + 1] = 1 - centerY / 100;
      this.screenFog.radii[slot] = radiusX / 100;
      this.screenFog.radii[slot + 1] = radiusY / 100;
    }

    this.material.setParameter('uFogCenter[0]', this.screenFog.centers);
    this.material.setParameter('uFogRadius[0]', this.screenFog.radii);
    this.setOpacity(CONFIG.vision.fogOpacity);
  }

  private setOpacity(value: number): void {
    this.screenFog.opacity = value;
    this.material.setParameter('uFogOpacity', value);
  }

  destroy(): void {
    this.entity.destroy();
    this.material.destroy();
  }
}

/**
 * Sombra de cordillera fija en el mundo. La máscara se dibuja en coordenadas
 * XZ del mapa y el plano vive en la capa de la vista; la cámara solo lo mira,
 * no lo deforma. Se dibuja sin test de profundidad para que la cuña tiña también
 * la vegetación y las decoraciones, y usa una máscara de esténcil para excluir
 * a los separadores y no sombrear su cara visible.
 *
 * La máscara no es solo la sombra: se compone la visibilidad de todo el equipo
 * (círculo de cada observador menos sus cuñas), de modo que una sombra solo
 * oscurece los puntos que no ve ningún aliado.
 */
export class FogDecal {
  readonly entity: pc.Entity;

  private readonly material: pc.ShaderMaterial;
  private readonly occluders: readonly SightOccluder[];
  private readonly maskCanvas: HTMLCanvasElement;
  private readonly maskContext: CanvasRenderingContext2D;
  private readonly maskTexture: pc.Texture;
  /** Lienzo auxiliar donde se compone la visibilidad de cada observador. */
  private readonly observerCanvas: HTMLCanvasElement;
  private readonly observerContext: CanvasRenderingContext2D;
  private readonly screenCenters = new Float32Array(MAX_VISION_CIRCLES * 2);
  private readonly screenRadii = new Float32Array(MAX_VISION_CIRCLES * 2);
  private screenFeather: number = CONFIG.vision.fogFeather;
  private screenOpacity = 0;
  /** Observadores del último frame, para no redibujar la máscara sin cambios. */
  private readonly lastCircles: VisionCircle[] = [];

  constructor(
    device: pc.GraphicsDevice,
    root: pc.Entity,
    mesh: pc.Mesh,
    layerId: number,
    index: number,
    occluders: readonly SightOccluder[]
  ) {
    this.occluders = occluders;

    this.maskCanvas = document.createElement('canvas');
    this.maskCanvas.width = MASK_SIZE;
    this.maskCanvas.height = MASK_SIZE;
    const context = this.maskCanvas.getContext('2d');
    if (!context) throw new Error('No se pudo crear el contexto 2D de la niebla');
    this.maskContext = context;
    // Antes del primer update la máscara es blanca (nada oculto): así el decal
    // no oscurece nada si se renderiza un frame antes de recibir observadores.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, MASK_SIZE, MASK_SIZE);

    this.observerCanvas = document.createElement('canvas');
    this.observerCanvas.width = MASK_SIZE;
    this.observerCanvas.height = MASK_SIZE;
    const observerContext = this.observerCanvas.getContext('2d');
    if (!observerContext) throw new Error('No se pudo crear el contexto 2D de la niebla');
    this.observerContext = observerContext;

    // Sin observadores todavía: centros lejanos y radios nulos para que el
    // decal no oscurezca nada hasta el primer `update`.
    for (let circleIndex = 0; circleIndex < MAX_VISION_CIRCLES; circleIndex++) {
      this.screenCenters[circleIndex * 2] = -1000;
      this.screenCenters[circleIndex * 2 + 1] = -1000;
    }

    this.maskTexture = new pc.Texture(device, {
      name: `fog-decal-mask-${index + 1}`,
      width: MASK_SIZE,
      height: MASK_SIZE,
      format: pc.PIXELFORMAT_RGBA8,
      mipmaps: false,
      minFilter: pc.FILTER_LINEAR,
      magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_CLAMP_TO_EDGE,
      addressV: pc.ADDRESS_CLAMP_TO_EDGE,
      srgb: false
    });
    this.maskTexture.setSource(this.maskCanvas);

    this.material = new pc.ShaderMaterial({
      uniqueName: 'fog-of-war-decal',
      vertexGLSL: DECAL_VERTEX_SHADER,
      fragmentGLSL: DECAL_FRAGMENT_SHADER,
      attributes: {
        aPosition: pc.SEMANTIC_POSITION,
        aUv0: pc.SEMANTIC_TEXCOORD0
      }
    });
    this.material.blendType = pc.BLEND_NORMAL;
    // Sin test de profundidad: la cuña de sombra también tiñe la vegetación y
    // las decoraciones que sobresalen del suelo, no solo la losa del terreno.
    // La máscara de esténcil (ver `world.ts`) deja fuera a los separadores para
    // que su cara visible no se oscurezca cuando la cámara los alinea con la
    // zona de sombra.
    this.material.depthTest = false;
    this.material.depthWrite = false;
    this.material.cull = pc.CULLFACE_NONE;
    this.material.setParameter('uFogColor', new Float32Array(CONFIG.vision.fogColor));
    this.material.setParameter('uFogMask', this.maskTexture);
    this.material.setParameter('uScreenCenter[0]', this.screenCenters);
    this.material.setParameter('uScreenRadius[0]', this.screenRadii);
    this.material.setParameter('uScreenFeather', this.screenFeather);
    this.material.setParameter('uScreenOpacity', this.screenOpacity);
    this.material.update();

    const instance = new pc.MeshInstance(mesh, this.material);
    instance.castShadow = false;
    instance.receiveShadow = false;
    instance.drawOrder = 1;
    // Solo donde el mundo escribió esténcil 1 (terreno, decoraciones y props);
    // los separadores escriben 0 para no recibir sombra en su cara visible.
    // Sin esténcil en el dispositivo, el decal se dibuja como antes.
    if (device.supportsStencil) {
      const stencil = new pc.StencilParameters({
        func: pc.FUNC_EQUAL,
        ref: 1,
        readMask: 0xff,
        writeMask: 0x00,
        fail: pc.STENCILOP_KEEP,
        zfail: pc.STENCILOP_KEEP,
        zpass: pc.STENCILOP_KEEP
      });
      instance.stencilFront = stencil;
      instance.stencilBack = stencil;
    }

    this.entity = new pc.Entity(`fog-decal-${index + 1}`);
    this.entity.setPosition(0, 0.02, 0);
    const halfX = mapHalfWidth();
    const halfZ = mapHalfDepth();
    this.entity.setLocalScale(halfX, 1, halfZ);
    this.entity.addComponent('render');
    const render = this.entity.render!;
    render.meshInstances = [instance];
    render.castShadows = false;
    render.receiveShadows = false;
    render.layers = [layerId];
    root.addChild(this.entity);
  }

  /**
   * @param circles Observadores vivos del equipo, con el jugador local primero.
   * La máscara world-space es la unión de lo que ve cada uno; el óvalo de
   * pantalla es la unión de sus círculos. La máscara solo se redibuja cuando
   * cambia la posición o el rango de algún observador.
   */
  update(circles: readonly VisionCircle[], screen: ScreenFog | null): void {
    this.syncScreenFog(screen);
    if (!this.circlesChanged(circles)) return;
    this.rememberCircles(circles);
    this.updateMask(circles);
  }

  private syncScreenFog(screen: ScreenFog | null): void {
    if (screen) {
      this.screenCenters.set(screen.centers);
      this.screenRadii.set(screen.radii);
      this.screenFeather = screen.feather;
      this.screenOpacity = screen.opacity;
    } else {
      this.screenOpacity = 0;
    }
    this.material.setParameter('uScreenCenter[0]', this.screenCenters);
    this.material.setParameter('uScreenRadius[0]', this.screenRadii);
    this.material.setParameter('uScreenFeather', this.screenFeather);
    this.material.setParameter('uScreenOpacity', this.screenOpacity);
  }

  private circlesChanged(circles: readonly VisionCircle[]): boolean {
    if (circles.length !== this.lastCircles.length) return true;
    for (let index = 0; index < circles.length; index++) {
      const next = circles[index];
      const prev = this.lastCircles[index];
      if (
        next.x !== prev.x ||
        next.z !== prev.z ||
        next.visionRange !== prev.visionRange
      ) {
        return true;
      }
    }
    return false;
  }

  private rememberCircles(circles: readonly VisionCircle[]): void {
    this.lastCircles.length = 0;
    for (const circle of circles) {
      this.lastCircles.push({
        x: circle.x,
        z: circle.z,
        visionRange: circle.visionRange
      });
    }
  }

  /**
   * Compone la máscara de visibilidad del equipo. Para cada observador se pinta
   * su círculo de blanco y sus cuñas de separador de negro; después se
   * superpone cada máscara con `lighter` (unión). El resultado es blanco donde
   * ve al menos un Pokémon del equipo y negro donde no ve ninguno. Así una
   * sombra de cordillera solo oscurece si tapa a todos los aliados que podrían
   * ver ese punto.
   */
  private updateMask(circles: readonly VisionCircle[]): void {
    const context = this.maskContext;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = '#000';
    context.fillRect(0, 0, MASK_SIZE, MASK_SIZE);

    const halfX = mapHalfWidth();
    const halfZ = mapHalfDepth();
    const toCanvasX = (x: number) => ((x + halfX) / (halfX * 2)) * MASK_SIZE;
    const toCanvasY = (z: number) => ((z + halfZ) / (halfZ * 2)) * MASK_SIZE;

    for (const circle of circles) {
      const observer = this.observerContext;
      observer.setTransform(1, 0, 0, 1, 0, 0);
      observer.globalCompositeOperation = 'source-over';
      observer.fillStyle = '#fff';
      observer.fillRect(0, 0, MASK_SIZE, MASK_SIZE);
      this.drawShadowWedges(observer, circle.x, circle.z, circle.visionRange);

      // Un pequeño margen evita que la cuantización de la textura recorte el
      // interior del círculo que FogView dibuja con su borde suave.
      const radius = circle.visionRange + MASK_CIRCLE_MARGIN;
      const radiusX = Math.max(0.5, (radius / (halfX * 2)) * MASK_SIZE);
      const radiusY = Math.max(0.5, (radius / (halfZ * 2)) * MASK_SIZE);

      context.save();
      context.beginPath();
      context.ellipse(
        toCanvasX(circle.x),
        toCanvasY(circle.z),
        radiusX,
        radiusY,
        0,
        0,
        Math.PI * 2
      );
      context.clip();
      context.globalCompositeOperation = 'lighter';
      context.drawImage(this.observerCanvas, 0, 0);
      context.restore();
    }

    context.globalCompositeOperation = 'source-over';
    this.maskTexture.upload();
  }

  /** Pinta las cuñas de sombra que proyecta un observador desde su posición. */
  private drawShadowWedges(
    context: CanvasRenderingContext2D,
    playerX: number,
    playerZ: number,
    visionRange: number
  ): void {
    const halfX = mapHalfWidth();
    const halfZ = mapHalfDepth();
    const toCanvasX = (x: number) => ((x + halfX) / (halfX * 2)) * MASK_SIZE;
    const toCanvasY = (z: number) => ((z + halfZ) / (halfZ * 2)) * MASK_SIZE;

    context.fillStyle = '#000';

    const candidates: Array<SightOccluder & { distance: number }> = [];
    for (const occluder of this.occluders) {
      const distance = Math.hypot(occluder.x - playerX, occluder.z - playerZ);
      // Los separadores se muestrean en tramos cortos, así que no basta con
      // limitar el número total: un separador cercano llenaría la lista y los
      // demás dejarían de proyectar sombra. Se dibujan todos los tramos que
      // caen dentro del radio de visión (fuera de él la niebla ya es opaca).
      if (distance > visionRange + occluder.radius + 2) continue;
      candidates.push({ ...occluder, distance });
    }

    for (const occluder of candidates) {
      if (occluder.distance <= occluder.radius + 0.01) {
        // Jugador pegado a la cresta: banda sobre el lado opuesto del tramo.
        const segmentX = occluder.bx - occluder.ax;
        const segmentZ = occluder.bz - occluder.az;
        const segmentLength = Math.hypot(segmentX, segmentZ);
        if (segmentLength < 0.0001) continue;

        const dirX = segmentX / segmentLength;
        const dirZ = segmentZ / segmentLength;
        let normalX = -dirZ;
        let normalZ = dirX;
        if (
          (playerX - occluder.ax) * normalX + (playerZ - occluder.az) * normalZ >
          0
        ) {
          normalX = -normalX;
          normalZ = -normalZ;
        }

        // Extensión corta en los extremos: la justa para cubrir el tramo sin
        // que la sombra se escape por delante del final de la cresta.
        const ext = INSIDE_EDGE_EXTENSION;
        const farX = normalX * SHADOW_LENGTH;
        const farZ = normalZ * SHADOW_LENGTH;
        const ax = occluder.ax - dirX * ext;
        const az = occluder.az - dirZ * ext;
        const bx = occluder.bx + dirX * ext;
        const bz = occluder.bz + dirZ * ext;

        context.beginPath();
        context.moveTo(toCanvasX(ax), toCanvasY(az));
        context.lineTo(toCanvasX(bx), toCanvasY(bz));
        context.lineTo(toCanvasX(bx + farX), toCanvasY(bz + farZ));
        context.lineTo(toCanvasX(ax + farX), toCanvasY(az + farZ));
        context.closePath();
        context.fill();
        continue;
      }

      const dx = occluder.x - playerX;
      const dz = occluder.z - playerZ;
      const angle = Math.atan2(dz, dx);
      const halfAngle = Math.asin(Math.min(1, occluder.radius / occluder.distance));
      const tangentDistance = Math.sqrt(
        occluder.distance * occluder.distance - occluder.radius * occluder.radius
      );

      const a1 = angle - halfAngle;
      const a2 = angle + halfAngle;
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      const c2 = Math.cos(a2);
      const s2 = Math.sin(a2);

      // Cuña tangente: arranca en los puntos de tangencia y se abre hacia el
      // lado opuesto al jugador. La montaña tapa el borde de arranque.
      const t1x = playerX + c1 * tangentDistance;
      const t1z = playerZ + s1 * tangentDistance;
      const t2x = playerX + c2 * tangentDistance;
      const t2z = playerZ + s2 * tangentDistance;

      context.beginPath();
      context.moveTo(toCanvasX(t1x), toCanvasY(t1z));
      context.lineTo(toCanvasX(t1x + c1 * SHADOW_LENGTH), toCanvasY(t1z + s1 * SHADOW_LENGTH));
      context.lineTo(toCanvasX(t2x + c2 * SHADOW_LENGTH), toCanvasY(t2z + s2 * SHADOW_LENGTH));
      context.lineTo(toCanvasX(t2x), toCanvasY(t2z));
      context.closePath();
      context.fill();
    }
  }

  destroy(): void {
    this.entity.destroy();
    this.material.destroy();
    this.maskTexture.destroy();
  }
}
