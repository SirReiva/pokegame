import * as pc from 'playcanvas';
import { actorWorldHeight, type ActorAsset } from './actorAsset';
import { CONFIG } from './config';
import { HitboxDebug } from './hitboxDebug';
import { PlayerMarker } from './marker';
import type { ActorShadowSlot } from './render/actorShadows';
import { ModelBillboard } from './render/modelBillboard';
import type { TeamOutline } from './render/teamOutline';
import type { AnimationName } from './types';

export interface ActorTransform {
  x: number;
  z: number;
}

/** Altura base del billboard y de la sombra sobre el suelo. */
const BILLBOARD_BASE_Y = 0.04;
const SHADOW_BASE_Y = 0.05;
/** Separación del anillo sobre la superficie cuando el actor está en el agua. */
const WATER_MARKER_LIFT = 0.015;
/** Hundimiento a partir del cual el anillo ya flota del todo en la superficie. */
const MARKER_FLOAT_SINK = 0.12;

/**
 * Todo lo que necesita una copia de un Pokémon del mundo. Va como objeto porque
 * la lista de banderas (anillo, silueta, contorno, capas diferidas) ya era
 * demasiado larga para pasarla por posición sin equivocarse.
 */
export interface ActorOptions {
  app: pc.AppBase;
  asset: ActorAsset;
  position: ActorTransform;
  facing: number;
  /**
   * Ranura del lote de sombras del viewport. La sombra no crea entidad ni
   * material propios: todas las copias de una vista comparten un draw call.
   */
  shadow?: ActorShadowSlot | null;
  /** Anillo de rumbo; solo lo lleva el jugador de esa vista. */
  withMarker?: boolean;
  /** Silueta que asoma tras los obstáculos; solo la copia del dueño. */
  silhouette?: boolean;
  accent?: readonly [number, number, number];
  /** Contorno de equipo; lo llevan las copias que no controla el jugador. */
  withOutline?: boolean;
  /** Contorno del viewport al que pertenece esta copia. */
  outline?: TeamOutline | null;
  hitRadius?: number;
  deferLayers?: boolean;
}

/**
 * Un Pokémon del mundo: modelo 3D + sombra de contacto.
 * El movimiento lo decide quien lo posee (jugador o NPC).
 */
export class Actor {
  readonly billboard: ModelBillboard;
  private readonly app: pc.AppBase;
  /** Ranura compartida de sombra; `null` si el actor no la lleva. */
  private readonly shadow: ActorShadowSlot | null;
  private readonly shadowDiameter: number;
  /** Altura local sobre la raíz del modelo donde apoya la barra de vida. */
  readonly barAnchorOffset: number;
  /** Altura de mundo cacheada; evita pedir la posición al nodo cada frame. */
  private barAnchorYValue = 0;
  /** Anillo de rumbo; solo lo lleva el jugador. */
  private readonly marker: PlayerMarker | null;
  /** Círculo de depuración del hurtbox; solo con `CONFIG.debug.showHitboxes`. */
  private hitboxDebug: HitboxDebug | null = null;
  private hitboxDebugEnabled = false;
  private layerId: number | null = null;
  private readonly hitRadius: number;
  readonly asset: ActorAsset;
  /** Rumbo de reposo; los NPC vuelven a él cuando el jugador se aleja. */
  readonly homeFacing: number;
  facing = 0;
  readonly position: ActorTransform;

  private sink = 0;
  private surfaceHeight = 0;
  private visible = true;
  private readonly markerBaseHeight = CONFIG.player.markerHeight;
  /** Altura del sprite sobre el suelo; escala cuánto se hunde en el agua. */
  private readonly visibleHeight: number;

  constructor(options: ActorOptions) {
    const { app, asset } = options;
    this.app = app;
    this.asset = asset;
    this.hitRadius = options.hitRadius ?? 0;
    this.position = { ...options.position };
    this.facing = options.facing;
    this.homeFacing = options.facing;
    this.shadow = options.shadow ?? null;

    const bodyHeight = actorWorldHeight(asset);
    this.visibleHeight = BILLBOARD_BASE_Y + bodyHeight;
    // La barra de vida se dibuja en el overlay 2D a esta altura; el actor solo
    // publica el punto de anclaje para que la capa lo proyecte.
    this.barAnchorOffset = bodyHeight + 0.18;
    // La sombra de contacto se ajusta a la huella del modelo, no al frame del
    // sprite: Onix o Gyarados ocupan mucho más suelo que su altura.
    this.shadowDiameter = Math.max(0.45, Math.min(2.4, asset.width * 0.55));

    const accent = options.accent ?? [255, 224, 102];
    this.billboard = new ModelBillboard(app, asset, {
      silhouette: options.silhouette === true,
      silhouetteColor: accent,
      outline: options.outline ?? null,
      outlineColor: options.withOutline ? accent : null,
      deferLayers: options.deferLayers === true
    });
    this.billboard.setFacing(options.facing);

    this.marker = options.withMarker
      ? new PlayerMarker(
          app,
          CONFIG.player.markerDiameter,
          CONFIG.player.markerHeight,
          CONFIG.player.markerOpacity,
          accent
        )
      : null;
    this.marker?.setFacing(options.facing);

    this.setHitboxDebug(CONFIG.debug.showHitboxes);

    this.setPosition(this.position.x, this.position.z);
  }

  setPosition(x: number, z: number): void {
    this.position.x = x;
    this.position.z = z;
    this.applyPosition();
  }

  /**
   * Sumerge al actor una fracción de su altura visible. El sprite baja para
   * que la lámina de agua le cubra las piernas; la sombra de contacto se oculta
   * bajo el agua y el anillo de rumbo sube a la superficie, de modo que el
   * jugador sigue viendo hacia dónde mira.
   *
   * Usar una fracción (y no una altura fija) mantiene la misma sensación en
   * Pokémon altos y bajos, porque no todos miden los mismos píxeles.
   */
  setSubmerge(fraction: number, surfaceHeight: number): void {
    this.surfaceHeight = surfaceHeight;
    this.sink = Math.max(0, fraction * this.visibleHeight - surfaceHeight);
    this.applyPosition();
  }

  /**
   * Mueve y sumerge al actor en una sola pasada. Las copias del splitscreen se
   * actualizan cada frame; separar posición y hundimiento llamaba dos veces a
   * `applyPosition()` y duplicaba los `setPosition` de billboard, sombra, anillo
   * y hurtbox.
   */
  setPositionAndSubmerge(
    x: number,
    z: number,
    fraction: number,
    surfaceHeight: number
  ): void {
    this.position.x = x;
    this.position.z = z;
    this.surfaceHeight = surfaceHeight;
    this.sink = Math.max(0, fraction * this.visibleHeight - surfaceHeight);
    this.applyPosition();
  }

  private applyPosition(): void {
    this.billboard.root.setPosition(
      this.position.x,
      BILLBOARD_BASE_Y - this.sink,
      this.position.z
    );
    this.updateShadow();
    this.barAnchorYValue = BILLBOARD_BASE_Y - this.sink + this.barAnchorOffset;

    if (this.marker) {
      // Transición suave para que el anillo no salte al entrar o salir del agua.
      const float = Math.min(1, this.sink / MARKER_FLOAT_SINK);
      const rest = this.markerBaseHeight;
      const surface = this.surfaceHeight + WATER_MARKER_LIFT;
      this.marker.setHeight(rest + (surface - rest) * float);
      this.marker.setPosition(this.position.x, this.position.z);
    }
    this.hitboxDebug?.setPosition(this.position.x, this.position.z);
  }

  /**
   * La sombra sigue el avance visual del frame (ataques, cargas, dash...). El
   * billboard desplaza el plano hacia la cámara para convertir el movimiento
   * vertical del arte en un envite sobre el suelo; la sombra debe acompañarlo.
   */
  private updateShadow(): void {
    this.shadow?.setShadow(
      this.position.x + this.billboard.motionX,
      SHADOW_BASE_Y - this.sink,
      this.position.z + this.billboard.motionZ,
      this.shadowDiameter,
      this.visible && this.sink <= 0.001
    );
  }

  /**
   * Orienta el sprite y la flecha del suelo. `markerYaw` permite que la flecha
   * muestre una dirección distinta de la mirada, como el apuntado del stick
   * derecho; por defecto acompaña al cuerpo.
   */
  setFacing(yaw: number, markerYaw = yaw): void {
    this.facing = yaw;
    this.billboard.setFacing(yaw);
    this.marker?.setFacing(markerYaw);
  }

  play(name: AnimationName, restart = false): void {
    this.billboard.play(name, restart);
  }

  setPlayback(rate: number): void {
    this.billboard.setPlayback(rate);
  }

  /** Fija el frame desde la simulación; deja de avanzar automáticamente. */
  setManualFrame(name: AnimationName, frame: number): void {
    this.billboard.setManualFrame(name, frame);
  }

  /** Vuelve al reloj automático de idle/walk/hurt. */
  clearManual(): void {
    this.billboard.clearManual();
  }

  get currentFrame(): number {
    return this.billboard.currentFrame;
  }

  setLoop(loop: boolean): void {
    this.billboard.setLoop(loop);
  }

  /** Gris del KO (0 = color, 1 = escala de grises); el billboard lo interpola. */
  setDesaturation(value: number): void {
    this.billboard.setDesaturation(value);
  }

  /**
   * Crea el estado de animación concreto si falta. Devuelve `true` si ha tenido
   * que crearlo.
   */
  prewarmStep(animation: AnimationName): boolean {
    return this.billboard.prewarmStep(animation);
  }

  update(dt: number, cameraPosition: pc.Vec3): void {
    this.billboard.update(dt, cameraPosition);
    // El billboard acaba de recalcular su avance visual; la sombra lo sigue.
    this.updateShadow();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.billboard.setVisible(visible);
    this.updateShadow();
    this.marker?.setVisible(visible);
    this.hitboxDebug?.setVisible(visible);
  }

  /**
   * Activa o desactiva el círculo de depuración del hurtbox. Se puede llamar
   * cada frame: solo hace trabajo cuando el estado cambia.
   */
  setHitboxDebug(enabled: boolean): void {
    if (enabled === this.hitboxDebugEnabled) return;
    this.hitboxDebugEnabled = enabled;
    if (!enabled) {
      this.hitboxDebug?.destroy();
      this.hitboxDebug = null;
      return;
    }
    if (this.hitRadius <= 0) return;
    this.hitboxDebug = new HitboxDebug(this.app, this.hitRadius);
    this.hitboxDebug.setPosition(this.position.x, this.position.z);
    this.hitboxDebug.setVisible(this.visible);
    if (this.layerId !== null) this.hitboxDebug.setLayer(this.layerId);
  }

  /** Estado actual, para la histéresis de la niebla de guerra. */
  get isVisible(): boolean {
    return this.visible;
  }

  /** Altura de mundo donde apoya la barra de vida de esta copia. */
  get barAnchorY(): number {
    return this.barAnchorYValue;
  }

  /** Capa de render exclusiva del viewport que debe ver esta copia. */
  setLayer(layerId: number): void {
    this.layerId = layerId;
    this.billboard.setLayer(layerId);
    this.marker?.setLayer(layerId);
    this.hitboxDebug?.setLayer(layerId);
  }

  destroy(): void {
    this.billboard.destroy();
    this.marker?.destroy();
    this.hitboxDebug?.destroy();
  }
}
