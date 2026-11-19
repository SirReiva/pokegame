/**
 * Tipos de presentación de las habilidades.
 *
 * Viven en `core` porque los comparten el catálogo de habilidades, los
 * ejecutores y el puerto de efectos. No dependen de PlayCanvas ni de React.
 */

export type AbilitySlot = 'basic' | 'skill1' | 'skill2' | 'skill3';

export type AbilityShape = 'melee' | 'projectile' | 'beam' | 'aoe' | 'dash' | 'self';

export type AoeShape = 'circle' | 'cone';

export type DamageCategory = 'physical' | 'special' | 'status';

export type BuffStat = 'speed' | 'attack' | 'defense' | 'spAttack' | 'spDefense';

/** Aspecto visual de un proyectil. */
export type ProjectileStyle =
  | 'orb'
  | 'electric'
  | 'fire'
  | 'grass'
  | 'poison'
  | 'psychic'
  | 'water'
  | 'waterJet'
  | 'aura'
  | 'shuriken'
  | 'shadow'
  | 'ghost'
  | 'air'
  | 'ice'
  | 'rock';

/** Aspecto visual del impacto de una habilidad. */
export type ImpactStyle =
  | 'hit'
  | 'electric'
  | 'fire'
  | 'grass'
  | 'poison'
  | 'spore'
  | 'psychic'
  | 'slash'
  | 'arc'
  | 'water'
  | 'aura'
  | 'steel'
  | 'fighting'
  | 'dark'
  | 'jaw'
  | 'shuriken'
  | 'ghost'
  | 'air'
  | 'ice'
  | 'rock'
  | 'ground'
  | 'vine';

/** Aspecto visual de un haz. */
export type BeamStyle =
  | 'electric'
  | 'fire'
  | 'grass'
  | 'psychic'
  | 'water'
  | 'dark'
  | 'ghost'
  | 'air'
  | 'ice'
  | 'rock';

/** Aspecto visual de un área. */
export type AoeStyle =
  | 'ring'
  | 'fire'
  | 'whirl'
  | 'grass'
  | 'poison'
  | 'psychic'
  | 'water'
  | 'explosion'
  | 'ghost'
  | 'air'
  | 'heat'
  | 'sacredFlame'
  | 'ice'
  | 'blizzard'
  | 'sheerCold'
  | 'ground'
  | 'fissure'
  | 'burrow'
  | 'recovery'
  | 'cyclone'
  | 'primordialPulse'
  | 'thunder';

/**
 * Reparto del daño de un área:
 * - `once`: un único golpe al completar la preparación.
 * - `overtime-global`: el área permanece `aoeDuration` segundos y golpea cada
 *   `aoeTickInterval` a todos los que estén dentro en ese instante. Los ticks
 *   están alineados al área, así que entrar tarde no recupera los anteriores.
 * - `overtime-target`: cada objetivo lleva su propio temporizador desde que
 *   entra; el primer tick cae al entrar y al salir se descarta su estado. El
 *   daño total depende del tiempo expuesto, no de una fase global.
 */
export type AoeDamageMode = 'once' | 'overtime-global' | 'overtime-target';

/** `true` en los modos que reparten ticks mientras el área permanece. */
export function isOvertimeMode(mode: AoeDamageMode): boolean {
  return mode === 'overtime-global' || mode === 'overtime-target';
}

/**
 * Cómo se reproduce la animación de carga durante el `startup`:
 * - `once`: se reproduce una vez y se ancla su `HitFrame` al efecto.
 * - `loop`: se usa `startupAnimationSpeed` y se repite hasta el efecto.
 */
export type StartupAnimationMode = 'once' | 'loop';
