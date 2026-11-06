import * as pc from 'playcanvas';
import { CONFIG, DEG } from './config';
import { MAX_TEAM_SIZE, type SplitRect } from './multiplayer';
import { mapHalfDepth, mapHalfWidth } from './terrain';

/**
 * Niebla de guerra dibujada por el motor.
 *
 * - `FogView`: quad pegado a la cámara. Calcula cada frame el borde suave de la
 *   unión de círculos del equipo y, en el mismo fragment, muestrea la máscara
 *   world-space para pintar las sombras de cordilleras y árboles.
 * - `FogMask`: máscara de visibilidad por equipo (círculos menos cuñas) que se
 *   recompone a pocos Hz. Es la única fuente de verdad de las sombras; ya no
 *   hay un decal aparte que duplique la unión de óvalos en pantalla.
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
varying vec3 vWorldPosition;

void main(void) {
  vUv = aUv0;
  // Posición de mundo del quad (pegado a la cámara): sirve para reconstruir
  // en el fragment el punto del suelo bajo cada píxel.
  vec4 world = matrix_model * vec4(aPosition, 1.0);
  vWorldPosition = world.xyz;
  gl_Position = matrix_viewProjection * world;
}
`;

const FRAGMENT_SHADER = `
varying vec2 vUv;
varying vec3 vWorldPosition;
uniform vec3 uFogColor;
uniform float uFogOpacity;
uniform vec2 uFogCenter[${MAX_VISION_CIRCLES}];
uniform vec2 uFogRadius[${MAX_VISION_CIRCLES}];
uniform float uFogFeather;
uniform vec3 uCameraPosition;
uniform vec2 uMapHalfSize;
uniform float uMapEdgeFeather;
uniform sampler2D uFogMask;

void main(void) {
  // La visión es de equipo: el alfa es el mínimo de todos los círculos, así
  // que basta con estar dentro de uno para que el mundo se dibuje normal.
  // Los círculos sin usar se envían con radio 0 y no revelan nada. Este borde
  // se calcula cada frame y por eso se mantiene suave aunque la máscara del
  // equipo se recomponga a menos Hz.
  float circle = 1.0;
  for (int i = 0; i < ${MAX_VISION_CIRCLES}; i++) {
    vec2 offset = (vUv - uFogCenter[i]) / max(uFogRadius[i], vec2(0.0001));
    circle = min(circle, smoothstep(1.0 - uFogFeather, 1.0, length(offset)));
  }

  // La niebla solo sombrea el interior del mapa: la falda de césped exterior
  // se deja limpia. Se interseca el rayo de cámara con el plano del suelo y
  // se descarta lo que cae fuera de los límites, con un borde suave. Ese
  // mismo punto del suelo sirve para muestrear la máscara world-space del
  // equipo: así esta única capa pinta tanto el exterior de los círculos como
  // las sombras de cordilleras y árboles. Antes había un decal aparte que
  // repetía la unión de óvalos en pantalla; ahora ambas cosas comparten la
  // misma máscara y no pueden desafinar sus bordes.
  float mapMask = 0.0;
  float mask = 1.0;
  vec3 ray = vWorldPosition - uCameraPosition;
  if (ray.y < -0.0001) {
    float t = -uCameraPosition.y / ray.y;
    vec2 ground = uCameraPosition.xz + ray.xz * t;
    vec2 outside = abs(ground) - uMapHalfSize;
    float distanceOutside = max(outside.x, outside.y);
    mapMask = 1.0 - smoothstep(-uMapEdgeFeather, uMapEdgeFeather, distanceOutside);
    vec2 maskUv = ground / max(uMapHalfSize * 2.0, vec2(0.0001)) + 0.5;
    mask = texture2D(uFogMask, maskUv).r;
  }

  // circle manda fuera de la unión de visión; 1 - mask añade la sombra que
  // proyectan los oclusores dentro de ella.
  float alpha = max(circle, 1.0 - mask);
  gl_FragColor = vec4(uFogColor, alpha * uFogOpacity * mapMask);
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
 * Círculos de visión ya proyectados a UV de la vista. Los calcula `FogView`
 * cada frame para el borde suave del quad de niebla.
 */
export interface ScreenFog {
  centers: Float32Array;
  radii: Float32Array;
  feather: number;
  opacity: number;
}

const MASK_SIZE = CONFIG.vision.mask.size;
const SHADOW_LENGTH = CONFIG.vision.mask.shadowLength;
/** Margen (u) del círculo en la máscara para tapar el borde suave de FogView. */
const MASK_CIRCLE_MARGIN = 0.75;
/** Extensión de la banda cuando el jugador está pegado a la cresta. */
const INSIDE_EDGE_EXTENSION = 0.05;
/** Intervalo mínimo entre recompuestos. 0 = sin límite. */
const MASK_UPDATE_INTERVAL =
  CONFIG.vision.mask.updateHz > 0 ? 1 / CONFIG.vision.mask.updateHz : 0;
/** Movimiento mínimo (u) para considerar que un observador se ha movido. */
const MASK_MOVE_EPSILON = CONFIG.vision.mask.moveEpsilon;
const MASK_MOVE_EPSILON_SQ = MASK_MOVE_EPSILON * MASK_MOVE_EPSILON;
const MASK_RANGE_EPSILON = 0.01;

/**
 * El quad se dibuja un 2 % más grande que el frustum para no dejar una costura
 * de un píxel en los bordes del viewport. Las UV se amplían lo mismo para que
 * el borde de la pantalla siga correspondiendo exactamente a 0-1.
 */
const QUAD_MARGIN = 1.02;
const UV_MARGIN = 0.01;
/** Borde suave (u) con el que la niebla se apaga al llegar al límite del mapa. */
const MAP_EDGE_FEATHER = 1.25;

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

/** Niebla de pantalla de una vista: unión de círculos del equipo y sombreado exterior. */
export class FogView {
  readonly entity: pc.Entity;

  /** Posición de cámara en un array reutilizable para el uniform del shader. */
  private readonly cameraPosition = new Float32Array(3);

  /** Unión de círculos en UV de la vista para el borde suave del quad. */
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
    index: number,
    mask: pc.Texture
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
    this.material.setParameter('uCameraPosition', this.cameraPosition);
    this.material.setParameter(
      'uMapHalfSize',
      new Float32Array([mapHalfWidth(), mapHalfDepth()])
    );
    this.material.setParameter('uMapEdgeFeather', MAP_EDGE_FEATHER);
    this.material.setParameter('uFogMask', mask);
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
   * máscara world-space del equipo la recibe el material en el constructor.
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
    // Se reutiliza en el fragment para recortar la niebla a los límites del mapa.
    this.cameraPosition[0] = cameraPosition.x;
    this.cameraPosition[1] = cameraPosition.y;
    this.cameraPosition[2] = cameraPosition.z;
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
 * Máscara world-space de visibilidad de un equipo. No depende de la cámara, así
 * que se comparte entre todas las vistas del mismo equipo: se redibuja y se
 * sube a GPU una sola vez aunque haya varios viewports en pantalla.
 *
 * La máscara no es solo la sombra: se compone la visibilidad de todo el equipo
 * (círculo de cada observador menos sus cuñas), de modo que una sombra solo
 * oscurece los puntos que no ve ningún aliado.
 */
export class FogMask {
  readonly texture: pc.Texture;

  private readonly occluders: readonly SightOccluder[];
  private readonly maskCanvas: HTMLCanvasElement;
  private readonly maskContext: CanvasRenderingContext2D;
  /** Lienzo auxiliar donde se compone la visibilidad de cada observador. */
  private readonly observerCanvas: HTMLCanvasElement;
  private readonly observerContext: CanvasRenderingContext2D;
  /** Observadores del último dibujo, para no redibujar la máscara sin cambios. */
  private readonly lastCircles: VisionCircle[] = [];
  /** Transformación mundo -> píxel de la máscara, precalculada. */
  private readonly maskScaleX: number;
  private readonly maskScaleY: number;
  private readonly maskOffsetX: number;
  private readonly maskOffsetY: number;
  /** Oclusores del observador actual y sus distancias, reutilizados. */
  private readonly candidates: SightOccluder[] = [];
  private readonly candidateDistances: number[] = [];
  /** Rejilla de oclusores por celda, o `null` si está desactivada. */
  private occluderGrid: number[][] | null = null;
  private gridCols = 1;
  private gridRows = 1;
  private gridCellSize = 1;
  private gridMinX = 0;
  private gridMinZ = 0;
  private maxOccluderRadius = 0;
  /** Tiempo desde el último recompuesto y si hay cambios pendientes. */
  private timeSinceUpdate = MASK_UPDATE_INTERVAL;
  private dirty = true;

  constructor(
    device: pc.GraphicsDevice,
    occluders: readonly SightOccluder[],
    name: string
  ) {
    this.occluders = occluders;

    const halfX = mapHalfWidth();
    const halfZ = mapHalfDepth();
    this.maskScaleX = MASK_SIZE / (halfX * 2);
    this.maskScaleY = MASK_SIZE / (halfZ * 2);
    this.maskOffsetX = MASK_SIZE / 2;
    this.maskOffsetY = MASK_SIZE / 2;

    this.maskCanvas = document.createElement('canvas');
    this.maskCanvas.width = MASK_SIZE;
    this.maskCanvas.height = MASK_SIZE;
    // La máscara se dibuja y se sube como textura para el quad de niebla. La
    // visibilidad de actores y objetos se resuelve geométricamente en `Game`,
    // así que aquí no se lee el canvas ni hace falta `willReadFrequently`.
    const context = this.maskCanvas.getContext('2d');
    if (!context) throw new Error('No se pudo crear el contexto 2D de la niebla');
    this.maskContext = context;
    // Antes del primer update la máscara es blanca (nada oculto): así la niebla
    // no oscurece nada si se renderiza un frame antes de recibir observadores.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, MASK_SIZE, MASK_SIZE);

    this.observerCanvas = document.createElement('canvas');
    this.observerCanvas.width = MASK_SIZE;
    this.observerCanvas.height = MASK_SIZE;
    const observerContext = this.observerCanvas.getContext('2d');
    if (!observerContext) throw new Error('No se pudo crear el contexto 2D de la niebla');
    this.observerContext = observerContext;

    // Rejilla uniforme: cada oclusor se guarda en la celda de su centro. En
    // cada actualización solo se recorren las celdas que cubren el radio del
    // observador, en vez de toda la lista de árboles y tramos de cordillera.
    if (CONFIG.vision.mask.spatialGrid && occluders.length > 0) {
      let maxRadius = 0;
      for (const occluder of occluders) {
        if (occluder.radius > maxRadius) maxRadius = occluder.radius;
      }
      this.maxOccluderRadius = maxRadius;
      this.gridCellSize = Math.max(1, CONFIG.vision.mask.gridCellSize);
      this.gridMinX = -halfX;
      this.gridMinZ = -halfZ;
      this.gridCols = Math.max(
        1,
        Math.ceil((halfX * 2) / this.gridCellSize)
      );
      this.gridRows = Math.max(
        1,
        Math.ceil((halfZ * 2) / this.gridCellSize)
      );
      const grid: number[][] = [];
      for (let index = 0; index < this.gridCols * this.gridRows; index++) {
        grid.push([]);
      }
      for (let index = 0; index < occluders.length; index++) {
        const occluder = occluders[index];
        const col = this.gridColumn(occluder.x);
        const row = this.gridRow(occluder.z);
        grid[row * this.gridCols + col].push(index);
      }
      this.occluderGrid = grid;
    }

    this.texture = new pc.Texture(device, {
      name,
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
    this.texture.setSource(this.maskCanvas);
  }

  /**
   * Recompone la máscara si cambió la posición o el rango de algún observador.
   * Se limita la frecuencia: el borde suave de pantalla lo sigue calculando
   * `FogView` cada frame, y esta máscara solo aporta las sombras interiores.
   */
  update(circles: readonly VisionCircle[], dt: number): void {
    this.timeSinceUpdate += dt;
    if (this.circlesChanged(circles)) this.dirty = true;
    if (!this.dirty) return;
    if (this.timeSinceUpdate < MASK_UPDATE_INTERVAL) return;

    this.rememberCircles(circles);
    this.updateMask(circles);
    this.timeSinceUpdate = 0;
    this.dirty = false;
  }

  private circlesChanged(circles: readonly VisionCircle[]): boolean {
    if (circles.length !== this.lastCircles.length) return true;
    for (let index = 0; index < circles.length; index++) {
      const next = circles[index];
      const prev = this.lastCircles[index];
      const dx = next.x - prev.x;
      const dz = next.z - prev.z;
      if (dx * dx + dz * dz > MASK_MOVE_EPSILON_SQ) return true;
      if (Math.abs(next.visionRange - prev.visionRange) > MASK_RANGE_EPSILON) {
        return true;
      }
    }
    return false;
  }

  private rememberCircles(circles: readonly VisionCircle[]): void {
    for (let index = 0; index < circles.length; index++) {
      const circle = circles[index];
      const stored = this.lastCircles[index];
      if (stored) {
        stored.x = circle.x;
        stored.z = circle.z;
        stored.visionRange = circle.visionRange;
      } else {
        this.lastCircles[index] = {
          x: circle.x,
          z: circle.z,
          visionRange: circle.visionRange
        };
      }
    }
    this.lastCircles.length = circles.length;
  }

  private gridColumn(x: number): number {
    const column = Math.floor((x - this.gridMinX) / this.gridCellSize);
    if (column < 0) return 0;
    if (column >= this.gridCols) return this.gridCols - 1;
    return column;
  }

  private gridRow(z: number): number {
    const row = Math.floor((z - this.gridMinZ) / this.gridCellSize);
    if (row < 0) return 0;
    if (row >= this.gridRows) return this.gridRows - 1;
    return row;
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

    const observer = this.observerContext;
    context.globalCompositeOperation = 'lighter';

    for (const circle of circles) {
      observer.setTransform(1, 0, 0, 1, 0, 0);
      observer.globalCompositeOperation = 'source-over';

      // Un pequeño margen evita que la cuantización de la textura recorte el
      // interior del círculo que FogView dibuja con su borde suave. El recorte
      // se hace en el lienzo auxiliar para que las cuñas tampoco se pinten
      // fuera del círculo: antes se rellenaban 40 u y luego se descartaban.
      const radius = circle.visionRange + MASK_CIRCLE_MARGIN;
      const radiusX = Math.max(0.5, radius * this.maskScaleX);
      const radiusY = Math.max(0.5, radius * this.maskScaleY);
      const centerX = circle.x * this.maskScaleX + this.maskOffsetX;
      const centerY = circle.z * this.maskScaleY + this.maskOffsetY;

      // Solo se limpia y se compone la caja del círculo, no el canvas entero.
      // Un círculo de visión ocupa una fracción pequeña del mapa; tocar los
      // 128×128 píxeles por cada observador era trabajo casi todo inútil.
      const left = Math.max(0, Math.floor(centerX - radiusX - 1));
      const top = Math.max(0, Math.floor(centerY - radiusY - 1));
      const right = Math.min(MASK_SIZE, Math.ceil(centerX + radiusX + 1));
      const bottom = Math.min(MASK_SIZE, Math.ceil(centerY + radiusY + 1));
      const width = right - left;
      const height = bottom - top;
      if (width <= 0 || height <= 0) continue;

      observer.clearRect(left, top, width, height);
      observer.save();
      observer.beginPath();
      observer.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
      observer.clip();
      observer.fillStyle = '#fff';
      observer.fill();
      this.drawShadowWedges(observer, circle.x, circle.z, circle.visionRange);
      observer.restore();

      // El lienzo auxiliar es transparente fuera del círculo, así que al
      // sumarlo con `lighter` solo aporta la zona visible del observador.
      context.drawImage(
        this.observerCanvas,
        left,
        top,
        width,
        height,
        left,
        top,
        width,
        height
      );
    }

    context.globalCompositeOperation = 'source-over';

    this.texture.upload();
  }

  /** Pinta las cuñas de sombra que proyecta un observador desde su posición. */
  private drawShadowWedges(
    context: CanvasRenderingContext2D,
    playerX: number,
    playerZ: number,
    visionRange: number
  ): void {
    const toCanvasX = (x: number) => x * this.maskScaleX + this.maskOffsetX;
    const toCanvasY = (z: number) => z * this.maskScaleY + this.maskOffsetY;

    context.fillStyle = '#000';

    this.collectCandidates(playerX, playerZ, visionRange);
    const candidates = this.candidates;
    const distances = this.candidateDistances;

    for (let index = 0; index < candidates.length; index++) {
      const occluder = candidates[index];
      const distance = distances[index];
      if (distance <= occluder.radius + 0.01) {
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
      const halfAngle = Math.asin(Math.min(1, occluder.radius / distance));
      const tangentDistance = Math.sqrt(
        Math.max(0, distance * distance - occluder.radius * occluder.radius)
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

  /**
   * Rellena `candidates` con los oclusores que pueden proyectar sombra sobre
   * este observador. Con la rejilla activa solo recorre las celdas cercanas.
   */
  private collectCandidates(
    playerX: number,
    playerZ: number,
    visionRange: number
  ): void {
    const candidates = this.candidates;
    const distances = this.candidateDistances;
    candidates.length = 0;
    distances.length = 0;

    if (this.occluderGrid) {
      // El filtro original usa la distancia al centro del oclusor, así que su
      // celda basta: no hace falta insertarlo en varias celdas.
      const queryRange = visionRange + this.maxOccluderRadius + 2;
      const col0 = this.gridColumn(playerX - queryRange);
      const col1 = this.gridColumn(playerX + queryRange);
      const row0 = this.gridRow(playerZ - queryRange);
      const row1 = this.gridRow(playerZ + queryRange);
      for (let row = row0; row <= row1; row++) {
        const base = row * this.gridCols;
        for (let col = col0; col <= col1; col++) {
          for (const index of this.occluderGrid[base + col]) {
            this.pushCandidate(index, playerX, playerZ, visionRange);
          }
        }
      }
      return;
    }

    for (let index = 0; index < this.occluders.length; index++) {
      this.pushCandidate(index, playerX, playerZ, visionRange);
    }
  }

  private pushCandidate(
    index: number,
    playerX: number,
    playerZ: number,
    visionRange: number
  ): void {
    const occluder = this.occluders[index];
    const dx = occluder.x - playerX;
    const dz = occluder.z - playerZ;
    // Los separadores se muestrean en tramos cortos, así que no basta con
    // limitar el número total: un separador cercano llenaría la lista y los
    // demás dejarían de proyectar sombra. Se dibujan todos los tramos que
    // caen dentro del radio de visión (fuera de él la niebla ya es opaca).
    const limit = visionRange + occluder.radius + 2;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq > limit * limit) return;
    this.candidates.push(occluder);
    this.candidateDistances.push(Math.sqrt(distanceSq));
  }

  destroy(): void {
    this.texture.destroy();
  }
}
