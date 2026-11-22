import * as pc from 'playcanvas';
import type { ActorAsset } from '../actorAsset';
import {
  clipDuration,
  frameBoundary,
  frameStart
} from '../animationTimeline';
import { CONFIG, RAD } from '../config';
import { FOG_EXCLUDED_STENCIL } from '../fogStencil';
import { pruneBindConstantClips } from '../modelAnim';
import { resolveModelClip, type ModelAsset, type ModelClip } from '../model';
import type { AnimationName } from '../types';
import type { TeamOutline } from './teamOutline';

/** Mezcla al cambiar de animación en reproducción automática. */
const TRANSITION_SECONDS = 0.06;
/** Suavizado del gris del KO, coherente con el billboard de sprites. */
const DESATURATION_SECONDS = 0.08;
/** Límites de velocidad para adaptar la duración del clip 3D al del sprite. */
const MIN_ADAPTED_SPEED = 0.2;
const MAX_ADAPTED_SPEED = 4;

/** Busca el primer nodo del subárbol cuyo nombre encaje con `pattern`. */
function findNodeMatching(
  root: pc.GraphNode,
  pattern: RegExp
): pc.GraphNode | null {
  for (const child of root.children) {
    if (pattern.test(child.name)) return child;
    const nested = findNodeMatching(child, pattern);
    if (nested) return nested;
  }
  return null;
}

/**
 * Apoyo medido para un modelo, compartido por todas sus copias de viewport.
 *
 * `groundModel()` mide la caja de las mallas ya posadas, pero PlayCanvas solo
 * actualiza las matrices de piel al renderizar esa copia. Una copia oculta por
 * la niebla puede llegar a la medición con la pose de bind (Rayquaza estirado)
 * y quedarse con otra altura. Como todas las copias del mismo modelo comparten
 * pose y escala, la medición de la copia de referencia sirve para todas: así el
 * cuerpo y su barra de vida aparecen a la misma altura en todas las cámaras.
 */
interface ModelGrounding {
  /** Altura local del cuerpo sobre la raíz del actor. */
  alignY: number;
  /** Punto más alto de la pose de reposo, relativo a la raíz. */
  bodyTop: number;
}

let MODEL_GROUNDING = new WeakMap<ModelAsset, ModelGrounding>();

/**
 * Olvida las mediciones de apoyo. Se llama al cerrar la partida: la altura
 * depende de la pose con la que se midió y no debe heredarse entre partidas.
 */
export function clearModelGrounding(): void {
  MODEL_GROUNDING = new WeakMap();
}

export interface ModelBillboardOptions {
  /**
   * Esta copia puede publicar el apoyo del modelo. Debe ser la copia del dueño
   * en su propia vista: es la única que se dibuja desde el primer frame y, por
   * tanto, la que mide con la pose real y no con la de bind. Las demás copias
   * adoptan su medición en cuanto está disponible.
   */
  groundingReference?: boolean;
  /**
   * Mantiene la animación a la frecuencia completa del render. Se usa para el
   * cuerpo que controla el jugador de esa vista; el resto baja a 30 Hz (20 Hz
   * lejos) para repartir el coste de evaluar esqueletos.
   */
  fullRateAnimation?: boolean;
  /** La silueta tras obstáculos no está implementada en 3D (se ignora). */
  silhouette?: boolean;
  silhouetteColor?: readonly [number, number, number];
  /**
   * Contorno de equipo del viewport. La copia se registra mientras está
   * visible; el color lo decide quien construye el actor.
   */
  outline?: TeamOutline | null;
  /** Color del contorno en 0-255, o `null` para no llevarlo. */
  outlineColor?: readonly [number, number, number] | null;
  deferLayers?: boolean;
}

/**
 * Cuerpo 3D de un Pokémon para una copia de viewport.
 *
 * Sustituye a `SpriteBillboard` manteniendo su API pública: el actor sigue
 * pidiendo `play`, `setManualFrame`, `setPlayback` y `update`, pero aquí se
 * traducen a estados del `AnimComponent` de PlayCanvas.
 *
 * Los frames del plan de casteo se convierten a tiempo normalizado del clip 3D
 * equivalente. Así el `HitFrame` del manifiesto sigue mandando en el gameplay
 * aunque el clip del modelo tenga otra duración.
 */
export class ModelBillboard {
  readonly root: pc.Entity;

  private readonly asset: ActorAsset;
  private readonly model: ModelAsset;
  private readonly device: pc.GraphicsDevice;
  private readonly pivot: pc.Entity;
  private readonly align: pc.Entity;
  private readonly modelEntity: pc.Entity;
  private readonly anim: pc.AnimComponent;
  private readonly layer: pc.AnimComponentLayer;
  /**
   * Hueso raíz del esqueleto (`origin`/`Origin`). Sus clips traen root motion
   * (el personaje avanza dentro de la animación); se fija en su posición de
   * reposo para que solo la simulación mueva al actor.
   */
  private readonly rootMotionNode: pc.GraphNode | null;
  private readonly rootMotionBase: pc.Vec3 | null;

  /** Estado asignado en el grafo de animación y si se creó con loop. */
  private readonly states = new Map<AnimationName, { loop: boolean }>();
  private animation: AnimationName | null = null;
  private clipDurationSeconds = 0;
  private spriteDurationSeconds = 0;
  private playback = 1;
  private loop = true;
  private manual = false;
  private lastManualFrame = -1;
  private facing = 0;
  private row = 0;
  private layerId: number | null = null;
  private readonly outline: TeamOutline | null;
  private readonly outlineColor: readonly [number, number, number] | null;
  private outlined = false;
  private visible = true;
  private desaturationTarget = 0;
  private desaturation = 0;
  /** LOD: el sistema deja de actualizar el esqueleto y lo hace este reloj. */
  private animationLodActive = false;
  private animationLodAccumulator = 0;
  /**
   * Motivo por el que la animación está parada: oculta por la niebla o fuera
   * del frustum de la cámara. Al reanudar se avanza el reloj de golpe para que
   * la pose no se quede congelada en el instante en que desapareció.
   */
  private animationPaused = false;
  private pausedAtMs = 0;
  private outOfView = false;
  private outOfViewFrames = 0;
  /** Primeros frames a frecuencia completa: la pose de idle debe existir antes de medir el apoyo. */
  private animationWarmupFrames = 0;
  private readonly fullRateAnimation: boolean;
  /** El apoyo se calcula una vez, con la pose de reposo ya evaluada. */
  private grounded = false;
  private settleFrames = 0;
  /**
   * Una copia que aparece tras estar oculta (un bot enemigo al entrar en
   * visión) puede traer cualquier fase del idle. Se mide con una pose canónica
   * para que su altura no dependa del instante de la revelación.
   */
  private groundingPosePending = false;
  /** Copia de referencia: mide y publica el apoyo del modelo. */
  private readonly groundingReference: boolean;
  /** Apoyo compartido adoptado, o `null` mientras esta copia mide el suyo. */
  private sharedGrounding: ModelGrounding | null = null;
  /** Esta copia creó la medición compartida y puede seguir afinándola. */
  private ownsGroundingRecord = false;
  /**
   * Altura visible de la pose de idle respecto a la raíz del actor. La caja del
   * bind pose no sirve para el HUD: Rayquaza mide 10,9 unidades estirado, pero
   * en idle aparece enroscado y mucho más bajo. La barra de vida y el
   * hundimiento en agua usan esta medida real.
   */
  private bodyTopValue = 0;
  /** Frames de idle que se siguen muestreando para quedarse con el máximo. */
  private topSamples = 0;

  constructor(
    app: pc.AppBase,
    asset: ActorAsset,
    options: ModelBillboardOptions = {}
  ) {
    this.asset = asset;
    this.model = asset.model;
    this.device = app.graphicsDevice;
    this.outline = options.outline ?? null;
    this.outlineColor = options.outlineColor ?? null;
    this.groundingReference = options.groundingReference !== false;
    this.fullRateAnimation = options.fullRateAnimation === true;

    this.root = new pc.Entity(`actor-${asset.entry.id}`);
    this.pivot = new pc.Entity('model-facing');
    this.align = new pc.Entity('model-align');
    this.align.setLocalScale(
      this.model.scale,
      this.model.scale,
      this.model.scale
    );
    // El origen del modelo es el punto de apoyo que usa el propio GLB (el hueso
    // raíz coincide con él). No se centra por la caja: en Pokémon con cola,
    // alas o cuello largos esa caja está muy desequilibrada y el cuerpo
    // aparecería desplazado respecto a su sombra. La altura se ajusta sola en
    // el primer frame con la pose de reposo ya evaluada.
    this.align.setLocalPosition(0, this.model.offsetY, 0);
    // Si otra copia del modelo ya midió el apoyo, se nace con la altura buena.
    this.applySharedGrounding();

    this.modelEntity = this.model.container.instantiateRenderEntity({
      castShadows: false,
      receiveShadows: true
    });
    // Se guarda el hueso raíz antes de crear el componente de animación, para
    // capturar su posición de bind y no la primera pose evaluada.
    const rootMotionNode =
      this.modelEntity.findByName('origin') ??
      this.modelEntity.findByName('Origin') ??
      // Los GLB de Sketchfab/Blender añaden sufijo al hueso (`origin_70`).
      findNodeMatching(this.modelEntity, /^origin_\d+$/i);
    this.rootMotionNode = rootMotionNode ?? null;
    this.rootMotionBase = rootMotionNode
      ? rootMotionNode.getLocalPosition().clone()
      : null;
    // Se analiza una sola vez por modelo, con el grafo aún en bind. Quita las
    // curvas constantes que ya valen lo mismo que el bind: según los GLB del
    // catálogo, son el ~60 % de los canales y no cambian ninguna pose.
    pruneBindConstantClips(
      this.model,
      Object.values(this.model.clips).filter(
        (clip): clip is ModelClip => Boolean(clip)
      ),
      this.modelEntity
    );
    this.modelEntity.addComponent('anim', { activate: true, speed: 1 });
    const anim = this.modelEntity.anim;
    if (!anim) {
      throw new Error(`No se pudo crear el componente de animación de ${asset.entry.id}`);
    }
    this.anim = anim;
    // El grafo de estados se crea con la primera asignación. Se engancha ya el
    // clip de espera para poder obtener `baseLayer` en el constructor; luego
    // `play()` elige la transición inicial.
    const initial = resolveModelClip(this.model, 'idle');
    if (!initial) {
      throw new Error(`El modelo de ${asset.entry.id} no tiene ningún clip usable.`);
    }
    anim.assignAnimation(
      initial.animation,
      initial.clip.track,
      undefined,
      1,
      true
    );
    this.states.set(initial.animation, { loop: true });
    const layer = anim.baseLayer;
    if (!layer) {
      throw new Error(`No se pudo crear la capa de animación de ${asset.entry.id}`);
    }
    this.layer = layer;

    this.align.addChild(this.modelEntity);
    this.pivot.addChild(this.align);
    this.root.addChild(this.pivot);
    app.root.addChild(this.root);

    this.configureRenders();
    this.syncOutline();
  }

  private configureRenders(): void {
    for (const render of this.modelEntity.findComponents('render')) {
      render.castShadows = false;
      render.receiveShadows = true;
      if (this.layerId !== null) render.layers = [this.layerId];
      // La niebla de guerra tiñe el quad de pantalla sin test de profundidad.
      // Igual que el billboard de sprites, el cuerpo visible escribe esténcil 1
      // para que la sombra de una cordillera no oscurezca al Pokémon que está
      // delante de ella (ver `fogStencil.ts`).
      if (this.device.supportsStencil) {
        for (const instance of render.meshInstances) {
          instance.stencilFront = FOG_EXCLUDED_STENCIL;
          instance.stencilBack = FOG_EXCLUDED_STENCIL;
        }
      }
    }
  }

  /** Asigna un clip al grafo si aún no está o si cambió el modo de bucle. */
  private ensureState(
    animation: AnimationName,
    loop: boolean
  ): boolean {
    const resolved = resolveModelClip(this.model, animation);
    if (!resolved) return false;
    const existing = this.states.get(resolved.animation);
    if (existing && existing.loop === loop) return false;

    this.anim.assignAnimation(
      resolved.animation,
      resolved.clip.track,
      undefined,
      1,
      loop
    );
    this.states.set(resolved.animation, { loop });
    return true;
  }

  /**
   * Crea el estado de una animación concreta. `Game` lo llama por tandas
   * durante la cuenta atrás para repartir el coste de compilar shaders.
   */
  prewarmStep(animation: AnimationName): boolean {
    const resolved = resolveModelClip(this.model, animation);
    if (!resolved || this.states.has(resolved.animation)) return false;
    this.ensureState(resolved.animation, true);
    return true;
  }

  get currentAnimation(): AnimationName | null {
    return this.animation;
  }

  get currentRow(): number {
    return this.row;
  }

  get currentFrame(): number {
    if (this.manual && this.lastManualFrame >= 0) return this.lastManualFrame;
    if (!this.animation || this.clipDurationSeconds <= 0) return 0;
    const progress = Math.max(
      0,
      Math.min(1, this.layer.activeStateCurrentTime / this.clipDurationSeconds)
    );
    const sprite = this.asset.skin.animations[this.animation];
    const frames = sprite?.durations.length ?? 1;
    return Math.min(frames - 1, Math.round(progress * (frames - 1)));
  }

  /** El modelo 3D no necesita simular el avance del frame sobre el suelo. */
  get motionX(): number {
    return 0;
  }

  get motionZ(): number {
    return 0;
  }

  /**
   * Altura visible de la pose de reposo sobre la raíz del actor. Es la que usan
   * la barra de vida y la inmersión en agua; 0 hasta que la pose se ha medido.
   */
  get bodyTop(): number {
    return this.bodyTopValue;
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    const wasVisible = this.visible;
    this.visible = visible;
    this.root.enabled = visible;
    // Al reaparecer, una copia sin apoyo medido puede estar congelada en
    // cualquier fase del idle. Se pedirá una pose canónica antes de medir.
    if (visible && !wasVisible && !this.grounded) {
      this.groundingPosePending = true;
    }
    // Las mallas ocultas no pueden quedarse en la capa de contorno: el
    // `OutlineRenderer` guarda sus propias instancias al margen del componente.
    this.syncOutline();
    // Un cuerpo oculto por la niebla no se dibuja, pero el `AnimComponent`
    // seguiría evaluando su esqueleto cada frame. Se para hasta que vuelva.
    this.refreshAnimationPlayback();
  }

  /**
   * Mantiene la entidad en el contorno del viewport solo mientras se dibuja.
   * Al ocultarla se retira de la capa interna; al volver a mostrarla se
   * registra otra vez con el mismo color.
   */
  private syncOutline(): void {
    const outline = this.outline;
    const color = this.outlineColor;
    const wanted = this.visible && outline !== null && color !== null;
    if (wanted === this.outlined) return;

    if (wanted && outline && color) {
      this.outlined = true;
      outline.add(this.root, color);
      return;
    }
    if (this.outlined) {
      this.outlined = false;
      outline?.remove(this.root);
    }
  }

  setLayer(layerId: number): void {
    this.layerId = layerId;
    this.configureRenders();
  }

  setFacing(yaw: number): void {
    this.facing = yaw;
  }

  setPlayback(rate: number): void {
    this.playback = Math.max(0.05, rate);
    if (!this.manual) this.anim.speed = this.playback;
  }

  /**
   * El gris del KO necesitaría un uniform por material; de momento se conserva
   * la animación de caída y el cuerpo se oculta al terminar `deathFade`.
   */
  setDesaturation(target: number): void {
    this.desaturationTarget = Math.min(1, Math.max(0, target));
  }

  /** Elige el clip y lo reproduce desde el principio. */
  play(name: AnimationName, restart = false): void {
    const resolved = resolveModelClip(this.model, name);
    if (!resolved) return;
    this.manual = false;
    this.lastManualFrame = -1;
    if (this.animation === resolved.animation && !restart) return;

    this.ensureState(resolved.animation, true);
    this.animation = resolved.animation;
    this.clipDurationSeconds = resolved.clip.track.duration;
    this.spriteDurationSeconds = clipDuration(
      this.asset.skin.animations[resolved.animation] ??
        this.asset.skin.animations.idle
    );
    this.loop = true;
    this.anim.speed = this.playback;
    this.anim.playing = true;
    this.setAnimationLod(false);
    // Si se llegó aquí, la animación es distinta o se pidió reinicio: siempre
    // hay que cambiar de estado, aunque el clip ya estuviera asignado.
    this.layer.transition(
      resolved.animation,
      restart ? 0 : TRANSITION_SECONDS
    );
  }

  /**
   * Activa o desactiva la repetición. PlayCanvas guarda el bucle por estado, así
   * que reasignarlo solo cuando cambia evita reconstruir el grafo cada frame.
   */
  setLoop(loop: boolean): void {
    if (this.loop === loop) return;
    this.loop = loop;
    if (this.animation) this.ensureState(this.animation, loop);
  }

  /**
   * Fija la pose del plan de casteo. El frame del manifiesto se traduce al
   * tiempo normalizado del clip 3D; entre cambios de frame el modelo avanza con
   * su propia velocidad, ajustada para completar el clip en el mismo tiempo que
   * el sprite.
   */
  setManualFrame(name: AnimationName, frame: number): void {
    const resolved = resolveModelClip(this.model, name);
    if (!resolved) return;

    const changed = this.animation !== resolved.animation;
    if (changed || !this.manual) {
      const assigned = this.ensureState(resolved.animation, false);
      this.animation = resolved.animation;
      this.clipDurationSeconds = resolved.clip.track.duration;
      this.spriteDurationSeconds = clipDuration(
        this.asset.skin.animations[resolved.animation] ??
          this.asset.skin.animations.idle
      );
      this.loop = false;
      this.anim.playing = true;
      this.setAnimationLod(false);
      if (assigned || !this.manual) {
        this.layer.transition(resolved.animation, 0);
      }
      this.lastManualFrame = -1;
    }

    this.manual = true;
    this.anim.speed = this.manualSpeed();

    if (frame !== this.lastManualFrame) {
      this.lastManualFrame = Math.round(frame);
      this.layer.activeStateCurrentTime = this.manualTime(
        resolved.animation,
        this.lastManualFrame
      );
    }
  }

  /** Vuelve al reloj automático (idle, walk, hurt...). */
  clearManual(): void {
    this.manual = false;
    this.lastManualFrame = -1;
  }

  private manualSpeed(): number {
    if (this.spriteDurationSeconds <= 0 || this.clipDurationSeconds <= 0) {
      return 1;
    }
    const speed = this.clipDurationSeconds / this.spriteDurationSeconds;
    return Math.max(
      MIN_ADAPTED_SPEED,
      Math.min(MAX_ADAPTED_SPEED, speed)
    );
  }

  /** Instante del clip 3D que corresponde al frame del manifiesto. */
  private manualTime(animation: AnimationName, frame: number): number {
    const sprite =
      this.asset.skin.animations[animation] ??
      this.asset.skin.animations.idle;
    const duration = this.clipDurationSeconds;
    const total = clipDuration(sprite);
    if (duration <= 0 || total <= 0) return 0;
    // Punto medio del frame para que la pose se vea durante todo su intervalo.
    const start = frameStart(sprite, frame);
    const end = frameBoundary(sprite, frame + 1);
    const progress = Math.max(0, Math.min(1, (start + end) / 2 / total));
    return progress * duration;
  }

  update(
    dt: number,
    cameraPosition: pc.Vec3,
    focusPosition?: pc.Vec3,
    inView = true
  ): void {
    if (!this.root.enabled) return;

    this.animationWarmupFrames = Math.min(
      4,
      this.animationWarmupFrames + 1
    );
    this.updateViewState(inView);

    // Una copia que acaba de aparecer puede reutilizar el apoyo que ya midió
    // la copia de referencia. Se comprueba cada frame porque la referencia
    // puede terminar su medición después de que esta copia se mostrara.
    if (!this.sharedGrounding) this.applySharedGrounding();

    // Un bot enemigo aparece con la fase del idle que le tocó mientras estaba
    // oculto. Se mide desde una pose canónica para que no cambie la altura.
    this.resetGroundingPose();

    // La orientación es continua: el modelo no necesita elegir fila de 8
    // direcciones. Se conserva el cálculo de fila para la brújula del HUD.
    this.pivot.setLocalEulerAngles(
      0,
      this.facing * RAD + this.model.yawOffset * RAD,
      0
    );
    this.row = this.computeRow(cameraPosition);

    // Root motion fuera: las animaciones pueden desplazar el hueso `origin`
    // varios metros (Onix, Gyarados, ataques), y ese avance se acumulaba sobre
    // la posición real del jugador.
    this.resetRootMotion();

    // La caja del GLB no sirve para apoyar el modelo: la pose de reposo puede
    // tener las patas recogidas (Articuno, Mewtwo) y las alas o la cola bajan
    // mucho más que los pies. Con la animación de espera ya evaluada se mide el
    // punto más bajo real y se sube o baja el cuerpo una sola vez.
    if (
      !this.grounded &&
      !this.manual &&
      this.animation === 'idle' &&
      ++this.settleFrames >= 3
    ) {
      this.groundModel();
    }

    // Una copia compartida copia la altura publicada por la referencia, para
    // que la barra no baile entre viewports aunque midiera otra pose al nacer.
    if (this.sharedGrounding) {
      this.bodyTopValue = this.sharedGrounding.bodyTop;
    } else if (
      this.grounded &&
      this.topSamples < 8 &&
      !this.manual &&
      this.animation === 'idle'
    ) {
      // La pose de reposo respira: se toman varios frames y se conserva el
      // punto más alto para que la barra no quede dentro de la cabeza.
      this.topSamples++;
      this.bodyTopValue = Math.max(this.bodyTopValue, this.measureBodyTop());
      this.publishGrounding();
    }

    if (!this.manual) {
      this.anim.speed = this.playback;
      // Un cuerpo fuera de cámara no avanza: al volver se pone al día de golpe.
      if (!this.animationPaused) {
        this.updateAnimationLod(dt, focusPosition ?? null);
      }
    } else {
      this.setAnimationLod(false);
    }

    // `updateAnimationLod` y la puesta al día de un cuerpo pausado evalúan el
    // clip con `anim.update()` dentro de este mismo `update()`, es decir,
    // después del primer reset. Hay que volver a fijar el hueso o el render
    // alternaría entre la posición de root motion del clip y la de bind: eso
    // se veía como un segundo cuerpo desplazado en aliados y rivales.
    this.resetRootMotion();

    // Gris del KO suavizado (sin shader propio todavía; se guarda para cuando
    // se aplique el tinte por material).
    if (this.desaturation !== this.desaturationTarget) {
      const blend = 1 - Math.exp(-dt / DESATURATION_SECONDS);
      this.desaturation +=
        (this.desaturationTarget - this.desaturation) * blend;
      if (Math.abs(this.desaturationTarget - this.desaturation) < 0.004) {
        this.desaturation = this.desaturationTarget;
      }
    }
  }

  /**
   * Deja el hueso de root motion en su posición de bind. Los clips pueden
   * desplazarlo varios metros, pero la posición del actor la manda la
   * simulación: el modelo no debe sumar ese avance.
   */
  private resetRootMotion(): void {
    if (this.rootMotionNode && this.rootMotionBase) {
      this.rootMotionNode.setLocalPosition(this.rootMotionBase);
    }
  }

  /**
   * Deja el idle en su primer instante antes de medir el apoyo de una copia
   * que reaparece. La copia estaba oculta, así que el corte no se ve; evita
   * que un bot enemigo se apoye según la fase del idle que tenía al entrar en
   * visión (Rayquaza se apoya con la cola y el cuerpo enroscados).
   */
  private resetGroundingPose(): void {
    if (!this.groundingPosePending) return;
    if (this.grounded) {
      this.groundingPosePending = false;
      return;
    }
    // Un clip manual o una animación de movimiento mandan: se espera a que
    // vuelva al idle y entonces se fija la pose de medición.
    if (this.manual || this.animation !== 'idle') return;

    const idle = resolveModelClip(this.model, 'idle');
    if (!idle) {
      this.groundingPosePending = false;
      return;
    }
    this.groundingPosePending = false;
    this.layer.transition(idle.animation, 0);
    // `transition` reinicia el estado, pero la pose no se evalúa hasta el
    // siguiente `animationUpdate`; se aplica ya para que el primer render sea
    // el idle canónico.
    this.anim.update(0);
    // La ventana de medición empieza de nuevo con esta pose.
    this.settleFrames = 0;
  }

  /**
   * LOD de animación: fuera del radio de detalle se para el reloj automático
   * del `AnimComponent` y se avanza a mano cada `interval` segundos. El cuerpo
   * y su contorno se siguen dibujando igual; solo cambia la frecuencia con la
   * que se recalcula el esqueleto. Con varias copias por viewport se nota
   * sobre todo en el `animUpdate` de CPU y en la subida de matrices de skin.
   *
   * El cuerpo del jugador de la vista se queda a frecuencia completa; el resto
   * de copias baja a 30 Hz cerca del foco y a 20 Hz lejos.
   */
  private updateAnimationLod(
    dt: number,
    focus: pc.Vec3 | null
  ): void {
    const settings = CONFIG.performance.animationLod;
    if (
      !settings.enabled ||
      !focus ||
      this.fullRateAnimation ||
      this.animationWarmupFrames < 3
    ) {
      this.setAnimationLod(false);
      return;
    }
    const position = this.root.getPosition();
    const dx = position.x - focus.x;
    const dz = position.z - focus.z;
    const near = dx * dx + dz * dz <= settings.distance * settings.distance;
    const interval = Math.max(
      settings.minInterval,
      near ? settings.nearInterval : settings.interval
    );

    if (!this.animationLodActive) {
      this.setAnimationLod(true);
    }

    this.animationLodAccumulator += dt;
    if (this.animationLodAccumulator < interval) return;
    const elapsed = this.animationLodAccumulator;
    this.animationLodAccumulator = 0;
    this.anim.update(elapsed);
  }

  /**
   * Histéresis de 3 frames para el frustum: un cuerpo que roza el borde de la
   * cámara no debe congelarse por un frame suelto.
   */
  private updateViewState(inView: boolean): void {
    if (inView) {
      this.outOfView = false;
      this.outOfViewFrames = 0;
    } else if (!this.outOfView) {
      this.outOfViewFrames += 1;
      if (this.outOfViewFrames >= 3) this.outOfView = true;
    }
    this.refreshAnimationPlayback();
  }

  /**
   * Para o reanuda el reloj del `AnimComponent` según visibilidad. Al reanudar
   * avanza el tiempo acumulado de una sola vez para que la pose sea la actual,
   * sin evaluar el esqueleto en cada frame oculto.
   */
  private refreshAnimationPlayback(): void {
    const shouldPause = !this.visible || (this.outOfView && !this.manual);
    if (shouldPause) {
      if (!this.animationPaused) {
        this.animationPaused = true;
        this.pausedAtMs = performance.now();
      }
      this.anim.playing = false;
      return;
    }
    if (this.animationPaused) {
      this.animationPaused = false;
      const elapsed = (performance.now() - this.pausedAtMs) / 1000;
      if (elapsed > 0) this.anim.update(elapsed);
      // Un clip manual no hace bucle y `update()` puede dejarlo en pausa; el
      // siguiente `setManualFrame` vuelve a fijar el tiempo, pero el controlador
      // tiene que seguir reproduciendo.
      if (this.manual) this.layer.playing = true;
    }
    this.anim.playing = !this.animationLodActive;
  }

  private setAnimationLod(active: boolean): void {
    if (this.animationLodActive === active) return;
    this.animationLodActive = active;
    this.animationLodAccumulator = 0;
    this.refreshAnimationPlayback();
  }

  /**
   * Adopta el apoyo ya publicado para este modelo. Devuelve `true` si hay una
   * medición disponible. La altura compartida pisa la local: si esta copia
   * midió antes de ser renderizada, su valor de bind no debe quedarse.
   */
  private applySharedGrounding(): boolean {
    if (this.sharedGrounding || this.ownsGroundingRecord) return true;
    const shared = MODEL_GROUNDING.get(this.model);
    if (!shared) return false;
    this.sharedGrounding = shared;
    this.align.setLocalPosition(0, shared.alignY, 0);
    this.bodyTopValue = shared.bodyTop;
    this.grounded = true;
    this.groundingPosePending = false;
    return true;
  }

  /**
   * Publica la medición para las demás copias del modelo. Solo lo hace la
   * copia de referencia (la del dueño en su viewport), que se dibuja desde el
   * primer frame y nunca mide una pose de bind sin renderizar.
   */
  private publishGrounding(): void {
    if (!this.groundingReference) return;
    const existing = MODEL_GROUNDING.get(this.model);
    if (!existing) {
      MODEL_GROUNDING.set(this.model, {
        alignY: this.align.getLocalPosition().y,
        bodyTop: this.bodyTopValue
      });
      this.ownsGroundingRecord = true;
      return;
    }
    // Solo la copia que creó la medición sigue muestreando la respiración del
    // idle. Una copia tardía que mida otra pose no debe pisar la referencia.
    if (this.ownsGroundingRecord) {
      existing.bodyTop = Math.max(existing.bodyTop, this.bodyTopValue);
    }
  }

  /**
   * Apoya la pose actual sobre el suelo. PlayCanvas ya mantiene la caja de cada
   * malla esquinada (`meshInstance.aabb`) a partir de los huesos posados, así
   * que basta con desplazar el modelo la diferencia entre su punto más bajo y
   * la raíz del actor.
   */
  private groundModel(): void {
    let lowest = Infinity;
    let highest = -Infinity;
    for (const render of this.modelEntity.findComponents('render')) {
      for (const meshInstance of render.meshInstances) {
        const aabb = meshInstance.aabb;
        if (!aabb) continue;
        lowest = Math.min(lowest, aabb.getMin().y);
        highest = Math.max(highest, aabb.getMax().y);
      }
    }
    if (!Number.isFinite(lowest)) return;

    const rootY = this.root.getPosition().y;
    const delta = rootY - lowest;
    // Una caja aún sin posar puede dar valores absurdos; se reintenta al
    // siguiente frame en vez de teletransportar el cuerpo.
    if (Math.abs(delta) > 50) return;
    if (Math.abs(delta) > 0.001) {
      const position = this.align.getLocalPosition();
      this.align.setLocalPosition(
        position.x,
        position.y + delta,
        position.z
      );
    }
    // Altura visible después de apoyar el cuerpo: la caja se midió antes de
    // desplazarlo, así que su parte alta también sube `delta`.
    if (Number.isFinite(highest)) {
      this.bodyTopValue = Math.max(0, highest + delta - rootY);
    }
    this.grounded = true;
    this.publishGrounding();
  }

  /** Punto más alto de la pose actual, relativo a la raíz del actor. */
  private measureBodyTop(): number {
    let highest = -Infinity;
    for (const render of this.modelEntity.findComponents('render')) {
      for (const meshInstance of render.meshInstances) {
        const aabb = meshInstance.aabb;
        if (aabb) highest = Math.max(highest, aabb.getMax().y);
      }
    }
    if (!Number.isFinite(highest)) return 0;
    return Math.max(0, highest - this.root.getPosition().y);
  }

  /** Misma fila de 8 direcciones que usa el billboard, solo para el HUD. */
  private computeRow(cameraPosition: pc.Vec3): number {
    const dx = cameraPosition.x - this.root.getPosition().x;
    const dz = cameraPosition.z - this.root.getPosition().z;
    const length = Math.hypot(dx, dz);
    if (length < 0.0001) return this.row;
    const toCamX = dx / length;
    const toCamZ = dz / length;
    const rightX = toCamZ;
    const rightZ = -toCamX;
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    const angle =
      Math.atan2(fx * rightX + fz * rightZ, fx * toCamX + fz * toCamZ) * RAD;
    let row = Math.round(angle / 45);
    row = ((row % 8) + 8) % 8;
    return row;
  }

  destroy(): void {
    if (this.outlined) this.outline?.remove(this.root);
    this.outlined = false;
    this.root.destroy();
  }
}
