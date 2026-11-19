import type { FxRuntime } from './fxRuntime';
import type { AoeFxHandle, EffectHandle } from '../../core/ports/fx';
import type { AoeStyle, BeamStyle, ImpactStyle, ProjectileStyle } from '../../abilities';
import { spawnOrbProjectile, spawnElectricProjectile, spawnFireProjectile, spawnGrassProjectile, spawnPoisonProjectile, spawnAuraProjectile, spawnShadowProjectile } from './projectiles';
import { spawnWaterProjectile, spawnWaterJetProjectile, spawnShurikenProjectile } from './projectilesWater';
import { spawnAirProjectile, spawnIceProjectile, spawnRockProjectile, spawnGhostProjectile } from './projectilesElemental';
import { spawnElectricBeam, spawnPsychicBeam, spawnDarkBeam, spawnGhostBeam } from './beams';
import { spawnWaterBeam, spawnFireBeam, spawnAirBeam, spawnGrassBeam, spawnIceBeam, spawnRockBeam } from './beamsElemental';
import { spawnRingAoe, spawnThunderAoe, spawnExplosionAoe } from './aoeCore';
import { spawnFireAoe, spawnFireWhirl, spawnSacredFlameCone, spawnHeatAoe } from './aoeFire';
import { spawnWaterAoe, spawnPrimordialPulseAoe } from './aoeWater';
import { spawnGrassAoe, spawnPoisonAoe } from './aoeNature';
import { spawnPsychicAoe, spawnGhostAoe } from './aoePsychic';
import { spawnAirAoe, spawnCycloneAoe } from './aoeAir';
import { spawnIceAoe, spawnBlizzardAoe, spawnSheerColdCone } from './aoeIce';
import { spawnGroundAoe, spawnFissureAoe, spawnBurrowAoe } from './aoeEarth';
import { spawnRecoveryAoe } from './support';
import { spawnHit, spawnAuraBurst, spawnGhostBurst, spawnDarkBurst, spawnSteelBurst, spawnFightingBurst, spawnShurikenBurst, spawnJawBurst, spawnElectricBurst, spawnFireBurst } from './impacts';
import { spawnGrassBurst, spawnWaterBurst, spawnPsychicBurst, spawnPoisonBurst, spawnAirBurst, spawnIceBurst, spawnRockBurst, spawnGroundBurst } from './bursts';

export type Rgb = readonly [number, number, number];
export type ProjectileFactory = (
  ctx: FxRuntime, x: number, z: number, color: Rgb, radius: number, dirX: number, dirZ: number
) => EffectHandle;
export type BeamFactory = (
  ctx: FxRuntime, x1: number, z1: number, x2: number, z2: number, color: Rgb, width: number
) => void;
export type AoeFactory = (
  ctx: FxRuntime, x: number, z: number, radius: number, color: Rgb, duration: number
) => void;
export type AoeConeFactory = (
  ctx: FxRuntime, x: number, z: number, dirX: number, dirZ: number, length: number, halfAngleDeg: number, color: Rgb, duration: number
) => AoeFxHandle;
export type ImpactFactory = (
  ctx: FxRuntime, x: number, z: number, color: Rgb, effectiveness: number
) => void;

export const BEAM_DURATIONS: Record<BeamStyle, number> = {
  electric: 0.34,
  fire: 0.45,
  grass: 0.46,
  psychic: 0.42,
  water: 0.55,
  dark: 0.48,
  ghost: 0.48,
  air: 0.46,
  ice: 0.48,
  rock: 0.62
};

export const PROJECTILE_FACTORIES: Record<ProjectileStyle, ProjectileFactory> = {
  orb: (ctx, x, z, color, radius) => spawnOrbProjectile(ctx, x, z, color, radius),
  electric: (ctx, x, z, _color, radius, dirX, dirZ) => spawnElectricProjectile(ctx, x, z, radius, dirX, dirZ),
  fire: (ctx, x, z, _color, radius, dirX, dirZ) => spawnFireProjectile(ctx, x, z, radius, dirX, dirZ),
  grass: (ctx, x, z, color, radius, dirX, dirZ) => spawnGrassProjectile(ctx, x, z, radius, dirX, dirZ, color),
  poison: (ctx, x, z, color, radius, dirX, dirZ) => spawnPoisonProjectile(ctx, x, z, radius, dirX, dirZ, color),
  psychic: (ctx, x, z, color, radius) => spawnOrbProjectile(ctx, x, z, color, radius),
  water: (ctx, x, z, color, radius, dirX, dirZ) => spawnWaterProjectile(ctx, x, z, radius, dirX, dirZ, color),
  waterJet: (ctx, x, z, color, radius, dirX, dirZ) => spawnWaterJetProjectile(ctx, x, z, radius, dirX, dirZ, color),
  aura: (ctx, x, z, color, radius, dirX, dirZ) => spawnAuraProjectile(ctx, x, z, color, radius, dirX, dirZ),
  shuriken: (ctx, x, z, color, radius, dirX, dirZ) => spawnShurikenProjectile(ctx, x, z, color, radius, dirX, dirZ),
  shadow: (ctx, x, z, color, radius, dirX, dirZ) => spawnShadowProjectile(ctx, x, z, color, radius, dirX, dirZ),
  ghost: (ctx, x, z, color, radius, dirX, dirZ) => spawnGhostProjectile(ctx, x, z, color, radius, dirX, dirZ),
  air: (ctx, x, z, color, radius, dirX, dirZ) => spawnAirProjectile(ctx, x, z, radius, dirX, dirZ, color),
  ice: (ctx, x, z, color, radius, dirX, dirZ) => spawnIceProjectile(ctx, x, z, radius, dirX, dirZ, color),
  rock: (ctx, x, z, color, radius, dirX, dirZ) => spawnRockProjectile(ctx, x, z, radius, dirX, dirZ, color)
};

export const IMPACT_FACTORIES: Record<ImpactStyle, ImpactFactory> = {
  hit: (ctx, x, z, color, effectiveness) => spawnHit(ctx, x, z, color, effectiveness),
  electric: (ctx, x, z, color, effectiveness) => spawnElectricBurst(ctx, x, z, color, effectiveness),
  fire: (ctx, x, z, color, effectiveness) => spawnFireBurst(ctx, x, z, color, effectiveness),
  grass: (ctx, x, z, color, effectiveness) => spawnGrassBurst(ctx, x, z, color, effectiveness),
  poison: (ctx, x, z, color, effectiveness) => spawnPoisonBurst(ctx, x, z, color, effectiveness),
  spore: (ctx, x, z, color, effectiveness) => spawnHit(ctx, x, z, color, effectiveness),
  slash: (ctx, x, z, color, effectiveness) => spawnHit(ctx, x, z, color, effectiveness),
  arc: (ctx, x, z, color, effectiveness) => spawnHit(ctx, x, z, color, effectiveness),
  psychic: (ctx, x, z, color, effectiveness) => spawnPsychicBurst(ctx, x, z, color, effectiveness),
  water: (ctx, x, z, color, effectiveness) => spawnWaterBurst(ctx, x, z, color, effectiveness),
  aura: (ctx, x, z, color, effectiveness) => spawnAuraBurst(ctx, x, z, color, effectiveness),
  steel: (ctx, x, z, color, effectiveness) => spawnSteelBurst(ctx, x, z, color, effectiveness),
  fighting: (ctx, x, z, color, effectiveness) => spawnFightingBurst(ctx, x, z, color, effectiveness),
  dark: (ctx, x, z, color, effectiveness) => spawnDarkBurst(ctx, x, z, color, effectiveness),
  jaw: (ctx, x, z, _color, effectiveness) => spawnJawBurst(ctx, x, z, effectiveness),
  shuriken: (ctx, x, z, color, effectiveness) => spawnShurikenBurst(ctx, x, z, color, effectiveness),
  ghost: (ctx, x, z, color, effectiveness) => spawnGhostBurst(ctx, x, z, color, effectiveness),
  air: (ctx, x, z, color, effectiveness) => spawnAirBurst(ctx, x, z, color, effectiveness),
  ice: (ctx, x, z, color, effectiveness) => spawnIceBurst(ctx, x, z, color, effectiveness),
  rock: (ctx, x, z, color, effectiveness) => spawnRockBurst(ctx, x, z, color, effectiveness),
  ground: (ctx, x, z, color, effectiveness) => spawnGroundBurst(ctx, x, z, color, effectiveness),
  // El Látigo Cepa comparte el estallido vegetal: el zarcillo 3D lo dibuja el
  // efecto melee y el golpe remata con hojas y motas verdes.
  vine: (ctx, x, z, color, effectiveness) => spawnGrassBurst(ctx, x, z, color, effectiveness)
};

export const BEAM_FACTORIES: Record<BeamStyle, BeamFactory> = {
  electric: (ctx, x1, z1, x2, z2, color, width) => spawnElectricBeam(ctx, x1, z1, x2, z2, color, width),
  fire: (ctx, x1, z1, x2, z2, color, width) => spawnFireBeam(ctx, x1, z1, x2, z2, color, width),
  grass: (ctx, x1, z1, x2, z2, color, width) => spawnGrassBeam(ctx, x1, z1, x2, z2, color, width),
  psychic: (ctx, x1, z1, x2, z2, color, width) => spawnPsychicBeam(ctx, x1, z1, x2, z2, color, width),
  water: (ctx, x1, z1, x2, z2, color, width) => spawnWaterBeam(ctx, x1, z1, x2, z2, color, width),
  dark: (ctx, x1, z1, x2, z2, color, width) => spawnDarkBeam(ctx, x1, z1, x2, z2, color, width),
  ghost: (ctx, x1, z1, x2, z2, color, width) => spawnGhostBeam(ctx, x1, z1, x2, z2, color, width),
  air: (ctx, x1, z1, x2, z2, color, width) => spawnAirBeam(ctx, x1, z1, x2, z2, color, width),
  ice: (ctx, x1, z1, x2, z2, color, width) => spawnIceBeam(ctx, x1, z1, x2, z2, color, width),
  rock: (ctx, x1, z1, x2, z2, color, width) => spawnRockBeam(ctx, x1, z1, x2, z2, color, width)
};

export const AOE_FACTORIES: Record<AoeStyle, AoeFactory> = {
  ring: (ctx, x, z, radius, color, duration) => spawnRingAoe(ctx, x, z, radius, color, duration),
  fire: (ctx, x, z, radius, color, duration) => spawnFireAoe(ctx, x, z, radius, color, duration),
  whirl: (ctx, x, z, radius, color, duration) => spawnFireWhirl(ctx, x, z, radius, color, duration),
  grass: (ctx, x, z, radius, color, duration) => spawnGrassAoe(ctx, x, z, radius, color, duration),
  poison: (ctx, x, z, radius, color, duration) => spawnPoisonAoe(ctx, x, z, radius, color, duration),
  psychic: (ctx, x, z, radius, color, duration) => spawnPsychicAoe(ctx, x, z, radius, color, duration),
  water: (ctx, x, z, radius, color, duration) => spawnWaterAoe(ctx, x, z, radius, color, duration),
  explosion: (ctx, x, z, radius, color, duration) => spawnExplosionAoe(ctx, x, z, radius, color, duration),
  ghost: (ctx, x, z, radius, color, duration) => spawnGhostAoe(ctx, x, z, radius, color, duration),
  air: (ctx, x, z, radius, color, duration) => spawnAirAoe(ctx, x, z, radius, color, duration),
  heat: (ctx, x, z, radius, color, duration) => spawnHeatAoe(ctx, x, z, radius, color, duration),
  sacredFlame: (ctx, x, z, radius, color, duration) => spawnFireAoe(ctx, x, z, radius, color, duration),
  ice: (ctx, x, z, radius, color, duration) => spawnIceAoe(ctx, x, z, radius, color, duration),
  blizzard: (ctx, x, z, radius, color, duration) => spawnBlizzardAoe(ctx, x, z, radius, color, duration),
  sheerCold: (ctx, x, z, radius, color, duration) => spawnBlizzardAoe(ctx, x, z, radius, color, duration),
  ground: (ctx, x, z, radius, color, duration) => spawnGroundAoe(ctx, x, z, radius, color, duration),
  fissure: (ctx, x, z, radius, color, duration) => spawnFissureAoe(ctx, x, z, radius, color, duration),
  burrow: (ctx, x, z, radius, color, duration) => spawnBurrowAoe(ctx, x, z, radius, color, duration),
  recovery: (ctx, x, z, radius, color, duration) => spawnRecoveryAoe(ctx, x, z, radius, color, duration),
  cyclone: (ctx, x, z, radius, color, duration) => spawnCycloneAoe(ctx, x, z, radius, color, duration),
  primordialPulse: (ctx, x, z, radius, color, duration) => spawnPrimordialPulseAoe(ctx, x, z, radius, color, duration),
  thunder: (ctx, x, z, radius, color, duration) => spawnThunderAoe(ctx, x, z, radius, color, duration)
};

export const AOE_CONE_FACTORIES: Partial<Record<AoeStyle, AoeConeFactory>> = {
  sacredFlame: (ctx, x, z, dirX, dirZ, length, halfAngleDeg, color, duration) => spawnSacredFlameCone(ctx, x, z, dirX, dirZ, length, halfAngleDeg, color, duration),
  sheerCold: (ctx, x, z, dirX, dirZ, length, halfAngleDeg, color, duration) => spawnSheerColdCone(ctx, x, z, dirX, dirZ, length, halfAngleDeg, color, duration)
};
