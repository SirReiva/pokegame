import * as pc from 'playcanvas';
import { FxRuntime } from './fxRuntime';
import type { AoeStyle, BeamStyle, ImpactStyle, ProjectileStyle } from '../../abilities';
import type { FxLayerResolver } from '../../core/ports/fx';
import { spawnAoe, spawnAoeCone, spawnBeam, spawnImpact, spawnProjectile } from './dispatchers';
import { spawnMelee } from './melee';
import { spawnAoeConeTelegraph, spawnAoeTelegraph, spawnBeamLane } from './telegraphs';
import { spawnArmorAura, spawnArmorBreak, spawnArmorPulse, spawnBuff, spawnDash, spawnHeal, spawnProtectionShield } from './support';
import { spawnGrassBurst, spawnPoisonBurst, spawnPsychicBurst, spawnWaterBurst } from './bursts';
import { spawnElectricBurst, spawnFireBurst, spawnHit } from './impacts';
import type { EffectHandle, FxHandle, AoeFxHandle, TelegraphHandle, TelegraphOwner } from '../../core/ports/fx';

export class CombatFx {
  private readonly runtime: FxRuntime;

  constructor(
    app: pc.AppBase,
    layerId: number,
    resolveLayers: FxLayerResolver = () => [layerId]
  ) {
    this.runtime = new FxRuntime(app, layerId, resolveLayers);
  }

setWarmupLayer(layerId: number | null): void {
    return this.runtime.setWarmupLayer(layerId);
  }

  spawnProjectile(
    x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number,
    style: ProjectileStyle,
    dirX: number,
    dirZ: number
  ): EffectHandle {
    return spawnProjectile(this.runtime, x, z, color, radius, style, dirX, dirZ);
  }

  spawnMelee(
    x: number,
    z: number,
    yaw: number,
    range: number,
    halfAngleDeg: number,
    color: readonly [number, number, number],
    style: ImpactStyle = 'hit',
    markerColor?: readonly [number, number, number]
  ): void {
    return spawnMelee(this.runtime, x, z, yaw, range, halfAngleDeg, color, style, markerColor);
  }

  spawnBeam(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    color: readonly [number, number, number],
    width: number,
    style: BeamStyle = 'electric'
  ): void {
    return spawnBeam(this.runtime, x1, z1, x2, z2, color, width, style);
  }

  spawnAoe(
    x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    style: AoeStyle = 'ring',
    duration = 0.65
  ): AoeFxHandle {
    return spawnAoe(this.runtime, x, z, radius, color, style, duration);
  }

  spawnAoeCone(
    x: number,
    z: number,
    dirX: number,
    dirZ: number,
    length: number,
    halfAngleDeg: number,
    color: readonly [number, number, number],
    style: AoeStyle = 'ring',
    duration = 0.65
  ): AoeFxHandle {
    return spawnAoeCone(this.runtime, x, z, dirX, dirZ, length, halfAngleDeg, color, style, duration);
  }

  spawnAoeTelegraph(
    x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number,
    effectDuration = 0,
    owner?: TelegraphOwner
  ): TelegraphHandle {
    return spawnAoeTelegraph(this.runtime, x, z, radius, color, duration, effectDuration, owner);
  }

  spawnAoeConeTelegraph(
    x: number,
    z: number,
    dirX: number,
    dirZ: number,
    length: number,
    halfAngleDeg: number,
    color: readonly [number, number, number],
    duration: number,
    effectDuration = 0,
    owner?: TelegraphOwner
  ): TelegraphHandle {
    return spawnAoeConeTelegraph(this.runtime, x, z, dirX, dirZ, length, halfAngleDeg, color, duration, effectDuration, owner);
  }

  spawnBeamLane(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    halfWidth: number,
    color: readonly [number, number, number],
    windup: number,
    style: BeamStyle,
    owner?: TelegraphOwner
  ): TelegraphHandle {
    return spawnBeamLane(this.runtime, x1, z1, x2, z2, halfWidth, color, windup, style, owner);
  }

  spawnDash(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    color: readonly [number, number, number]
  ): void {
    return spawnDash(this.runtime, x1, z1, x2, z2, color);
  }

  spawnBuff(
    x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number
  ): void {
    return spawnBuff(this.runtime, x, z, color, radius);
  }

  spawnArmorAura(
    position: { x: number; z: number },
    color: readonly [number, number, number],
    radius: number,
    duration: number
  ): FxHandle {
    return spawnArmorAura(this.runtime, position, color, radius, duration);
  }

  spawnArmorPulse(
    x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number
  ): void {
    return spawnArmorPulse(this.runtime, x, z, color, radius);
  }

  spawnArmorBreak(
    x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number
  ): void {
    return spawnArmorBreak(this.runtime, x, z, color, radius);
  }

  spawnProtectionShield(
    position: { x: number; z: number },
    color: readonly [number, number, number],
    radius: number,
    centerY: number,
    duration: number
  ): FxHandle {
    return spawnProtectionShield(this.runtime, position, color, radius, centerY, duration);
  }

  spawnHeal(
    x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number
  ): void {
    return spawnHeal(this.runtime, x, z, color, radius);
  }

  spawnGrassBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    _effectiveness: number
  ): void {
    return spawnGrassBurst(this.runtime, x, z, color, _effectiveness);
  }

  spawnWaterBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    _effectiveness: number
  ): void {
    return spawnWaterBurst(this.runtime, x, z, color, _effectiveness);
  }

  spawnPsychicBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    _effectiveness: number
  ): void {
    return spawnPsychicBurst(this.runtime, x, z, color, _effectiveness);
  }

  spawnPoisonBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    _effectiveness: number
  ): void {
    return spawnPoisonBurst(this.runtime, x, z, color, _effectiveness);
  }

  spawnImpact(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number,
    style: ImpactStyle = 'hit'
  ): void {
    return spawnImpact(this.runtime, x, z, color, effectiveness, style);
  }

  spawnHit(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number
  ): void {
    return spawnHit(this.runtime, x, z, color, effectiveness);
  }

  spawnElectricBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number
  ): void {
    return spawnElectricBurst(this.runtime, x, z, color, effectiveness);
  }

  spawnFireBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number
  ): void {
    return spawnFireBurst(this.runtime, x, z, color, effectiveness);
  }

  update(dt: number): void {
    return this.runtime.update(dt);
  }

  clear(): void {
    return this.runtime.clear();
  }

  destroy(): void {
    return this.runtime.destroy();
  }
}
