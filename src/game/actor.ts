import * as pc from 'playcanvas';
import { CONFIG } from './config';
import { PlayerMarker } from './marker';
import { SpriteBillboard, type SpriteAsset } from './sprite';
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
 * Un Pokémon del mundo: billboard + sombra de contacto.
 * El movimiento lo decide quien lo posee (jugador o NPC).
 */
export class Actor {
  readonly billboard: SpriteBillboard;
  private readonly shadow: pc.Entity;
  /** Anillo de rumbo; solo lo lleva el jugador. */
  private readonly marker: PlayerMarker | null;
  readonly asset: SpriteAsset;
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

  constructor(
    app: pc.Application,
    asset: SpriteAsset,
    shadowMaterial: pc.StandardMaterial,
    position: ActorTransform,
    facing: number,
    withMarker = false
  ) {
    this.asset = asset;
    this.position = { ...position };
    this.facing = facing;
    this.homeFacing = facing;

    const idle = asset.entry.animations.idle;
    const anchorY = idle.anchors[0]?.y ?? idle.frameHeight * 0.75;
    this.visibleHeight =
      BILLBOARD_BASE_Y +
      anchorY * CONFIG.sprite.pixelScale * CONFIG.sprite.verticalStretch;

    this.billboard = new SpriteBillboard(app, asset, {
      pixelScale: CONFIG.sprite.pixelScale,
      verticalStretch: CONFIG.sprite.verticalStretch,
      alphaTest: CONFIG.sprite.alphaTest,
      silhouette: withMarker
    });
    this.billboard.setFacing(facing);

    const diameter = idle.frameWidth * CONFIG.sprite.pixelScale * 0.64;
    this.shadow = new pc.Entity(`shadow-${asset.entry.id}`);
    this.shadow.addComponent('render', { type: 'plane' });
    const shadowRender = this.shadow.render!;
    shadowRender.material = shadowMaterial;
    shadowRender.castShadows = false;
    shadowRender.receiveShadows = false;
    const shadowInstance = shadowRender.meshInstances[0];
    if (shadowInstance) shadowInstance.drawOrder = 2;
    this.shadow.setLocalScale(diameter, 1, diameter);
    app.root.addChild(this.shadow);

    this.marker = withMarker
      ? new PlayerMarker(
          app,
          CONFIG.player.markerDiameter,
          CONFIG.player.markerHeight,
          CONFIG.player.markerOpacity
        )
      : null;
    this.marker?.setFacing(facing);

    this.setPosition(position.x, position.z);
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

  private applyPosition(): void {
    this.billboard.root.setPosition(
      this.position.x,
      BILLBOARD_BASE_Y - this.sink,
      this.position.z
    );
    this.shadow.setPosition(this.position.x, SHADOW_BASE_Y - this.sink, this.position.z);
    this.shadow.enabled = this.visible && this.sink <= 0.001;

    if (this.marker) {
      // Transición suave para que el anillo no salte al entrar o salir del agua.
      const float = Math.min(1, this.sink / MARKER_FLOAT_SINK);
      const rest = this.markerBaseHeight;
      const surface = this.surfaceHeight + WATER_MARKER_LIFT;
      this.marker.setHeight(rest + (surface - rest) * float);
      this.marker.setPosition(this.position.x, this.position.z);
    }
  }

  setFacing(yaw: number): void {
    this.facing = yaw;
    this.billboard.setFacing(yaw);
    this.marker?.setFacing(yaw);
  }

  play(name: AnimationName, restart = false): void {
    this.billboard.play(name, restart);
  }

  setPlayback(rate: number): void {
    this.billboard.setPlayback(rate);
  }

  update(dt: number, cameraPosition: pc.Vec3): void {
    this.billboard.update(dt, cameraPosition);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.billboard.setVisible(visible);
    this.shadow.enabled = visible && this.sink <= 0.001;
    this.marker?.setVisible(visible);
  }

  destroy(): void {
    this.billboard.destroy();
    this.shadow.destroy();
    this.marker?.destroy();
  }
}
