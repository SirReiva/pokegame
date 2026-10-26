import * as pc from 'playcanvas';
import { CONFIG } from './config';
import { SpriteBillboard, type SpriteAsset } from './sprite';
import type { AnimationName } from './types';

export interface ActorTransform {
  x: number;
  z: number;
}

/**
 * Un Pokémon del mundo: billboard + sombra de contacto.
 * El movimiento lo decide quien lo posee (jugador o NPC).
 */
export class Actor {
  readonly billboard: SpriteBillboard;
  private readonly shadow: pc.Entity;
  readonly asset: SpriteAsset;
  /** Rumbo de reposo; los NPC vuelven a él cuando el jugador se aleja. */
  readonly homeFacing: number;
  facing = 0;
  readonly position: ActorTransform;

  constructor(
    app: pc.Application,
    asset: SpriteAsset,
    shadowMaterial: pc.StandardMaterial,
    position: ActorTransform,
    facing: number
  ) {
    this.asset = asset;
    this.position = { ...position };
    this.facing = facing;
    this.homeFacing = facing;

    this.billboard = new SpriteBillboard(app, asset, {
      pixelScale: CONFIG.sprite.pixelScale,
      verticalStretch: CONFIG.sprite.verticalStretch,
      alphaTest: CONFIG.sprite.alphaTest
    });
    this.billboard.setFacing(facing);

    const idle = asset.entry.animations.idle;
    const diameter = idle.frameWidth * CONFIG.sprite.pixelScale * 0.64;
    this.shadow = new pc.Entity(`shadow-${asset.entry.id}`);
    this.shadow.addComponent('render', { type: 'plane' });
    const shadowRender = this.shadow.render!;
    shadowRender.material = shadowMaterial;
    shadowRender.castShadows = false;
    shadowRender.receiveShadows = false;
    this.shadow.setLocalScale(diameter, 1, diameter);
    app.root.addChild(this.shadow);

    this.setPosition(position.x, position.z);
  }

  setPosition(x: number, z: number): void {
    this.position.x = x;
    this.position.z = z;
    this.billboard.root.setPosition(x, 0.04, z);
    this.shadow.setPosition(x, 0.05, z);
  }

  setFacing(yaw: number): void {
    this.facing = yaw;
    this.billboard.setFacing(yaw);
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
    this.billboard.setVisible(visible);
    this.shadow.enabled = visible;
  }

  destroy(): void {
    this.billboard.destroy();
    this.shadow.destroy();
  }
}
