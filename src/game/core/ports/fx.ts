/**
 * Puerto de efectos visuales.
 *
 * La simulación y las estrategias de habilidad dependen de estas interfaces,
 * no de `CombatFx`. Así el dominio no importa PlayCanvas y se puede probar con
 * un doble en memoria. Las interfaces desaparecen al compilar: coste 0.
 */

import type {
  AoeStyle,
  BeamStyle,
  ImpactStyle,
  ProjectileStyle
} from '../abilities/styles';
import type { Team } from '../team';

export interface EffectHandle {
  setPosition(x: number, z: number): void;
  update(dt: number): void;
  destroy(): void;
}

/** Handle mínimo de un efecto activo: solo permite cancelarlo antes de tiempo. */
export interface FxHandle {
  destroy(): void;
}

/** Handle de un área visual que puede seguir a un centro móvil. */
export interface AoeFxHandle extends FxHandle {
  /** Recoloca el centro del área sin reiniciar su animación. */
  setCenter(x: number, z: number): void;
  /**
   * Gira un área con forma de cono alrededor de su vértice. Solo lo implementan
   * los conos; los círculos lo omiten.
   */
  setDirection?(dirX: number, dirZ: number): void;
}

/** Marca de área activa; se puede cancelar antes de que termine el retardo. */
export interface TelegraphHandle {
  destroy(): void;
  /**
   * Recoloca la marca si el área asociada se mueve. Solo lo implementan las
   * marcas de área; los carriles de haz no se desplazan.
   */
  setCenter?(x: number, z: number): void;
  /** Gira una marca de cono alrededor de su vértice. */
  setDirection?(dirX: number, dirZ: number): void;
  /** Recolorea el aro sin recrear la malla ni sus materiales. */
  setColor?(color: readonly [number, number, number]): void;
}

/** Lanzador de una marca de área o de haz. */
export interface TelegraphOwner {
  /** Plaza del jugador que lanzó la habilidad. */
  slot: number;
  /** Equipo del lanzador. */
  team: Team;
}

/**
 * Capas de render de las vistas que deben dibujar un efecto en `(x, z)`.
 * Devuelve un array vacío si ninguna vista lo ve.
 */
export type FxLayerResolver = (
  x: number,
  z: number,
  ignoreTerrainConcealment?: boolean,
  owner?: TelegraphOwner
) => readonly number[];

/**
 * Servicios de VFX que consumen los ejecutores, los efectos compuestos y los
 * callbacks de área. `CombatFx` lo implementa estructuralmente.
 */
export interface CombatFxPort {
  spawnHeal(
    x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number
  ): void;
  spawnProjectile(
    x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number,
    style: ProjectileStyle,
    dirX: number,
    dirZ: number
  ): EffectHandle;
  spawnMelee(
    x: number,
    z: number,
    yaw: number,
    range: number,
    halfAngleDeg: number,
    color: readonly [number, number, number],
    style?: ImpactStyle,
    markerColor?: readonly [number, number, number]
  ): void;
  spawnBeam(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    color: readonly [number, number, number],
    width: number,
    style?: BeamStyle
  ): void;
  spawnAoe(
    x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    style?: AoeStyle,
    duration?: number
  ): AoeFxHandle;
  spawnAoeCone(
    x: number,
    z: number,
    dirX: number,
    dirZ: number,
    length: number,
    halfAngleDeg: number,
    color: readonly [number, number, number],
    style?: AoeStyle,
    duration?: number
  ): AoeFxHandle;
  spawnAoeTelegraph(
    x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number,
    effectDuration?: number,
    owner?: TelegraphOwner
  ): TelegraphHandle;
  spawnAoeConeTelegraph(
    x: number,
    z: number,
    dirX: number,
    dirZ: number,
    length: number,
    halfAngleDeg: number,
    color: readonly [number, number, number],
    duration: number,
    effectDuration?: number,
    owner?: TelegraphOwner
  ): TelegraphHandle;
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
  ): TelegraphHandle;
  spawnDash(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    color: readonly [number, number, number]
  ): void;
  spawnBuff(
    x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number
  ): void;
  spawnArmorAura(
    position: { x: number; z: number },
    color: readonly [number, number, number],
    radius: number,
    duration: number
  ): FxHandle;
  spawnArmorPulse(
    x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number
  ): void;
  spawnArmorBreak(
    x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number
  ): void;
  spawnProtectionShield(
    position: { x: number; z: number },
    color: readonly [number, number, number],
    radius: number,
    centerY: number,
    duration: number
  ): FxHandle;
  spawnImpact(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number,
    style?: ImpactStyle
  ): void;
  spawnHit(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number
  ): void;
  spawnElectricBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number
  ): void;
  spawnFireBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number
  ): void;
  spawnGrassBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number
  ): void;
  spawnWaterBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number
  ): void;
  spawnPsychicBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number
  ): void;
  spawnPoisonBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number
  ): void;
}
