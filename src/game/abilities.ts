/**
 * Catálogo de habilidades y asignación por Pokémon.
 *
 * El motor lee estas definiciones en tiempo de ejecución. Para añadir una
 * habilidad nueva basta con registrarla en `ABILITIES` y asignarla en
 * `MOVESETS`; no hay que tocar la lógica de combate mientras use una de las
 * formas soportadas:
 *
 * - `melee`: cono/arco en la dirección en la que mira el Pokémon.
 * - `projectile`: proyectil que avanza en la dirección en la que mira.
 * - `beam`: haz instantáneo en la dirección en la que mira.
 * - `aoe`: área circular sobre el suelo, centrada delante del Pokémon.
 * - `dash`: desplazamiento en la dirección en la que mira; puede dañar al paso.
 * - `self`: habilidad centrada en el lanzador (buffs, escudos, curación...).
 *
 * `power: 0` o `category: 'status'` convierten la habilidad en no dañina; los
 * `buffs` se aplican siempre al lanzador.
 *
 * Las habilidades direccionales usan el `facing` actual del Pokémon, sin
 * corrección de apuntado. El jugador apunta colocándose y girando con el
 * movimiento.
 */

import type { PokemonType } from './typeChart';
import type { AnimationName } from './types';

export type AbilitySlot = 'basic' | 'skill1' | 'skill2' | 'skill3';

export const ABILITY_SLOTS: AbilitySlot[] = ['basic', 'skill1', 'skill2', 'skill3'];

export const ABILITY_SLOT_LABEL: Record<AbilitySlot, string> = {
  basic: 'Básica',
  skill1: 'Habilidad 1',
  skill2: 'Habilidad 2',
  skill3: 'Habilidad 3'
};

export type AbilityShape = 'melee' | 'projectile' | 'beam' | 'aoe' | 'dash' | 'self';

export type DamageCategory = 'physical' | 'special' | 'status';

export type BuffStat = 'speed' | 'attack' | 'defense' | 'spAttack' | 'spDefense';

/** Aspecto visual de un proyectil. */
export type ProjectileStyle = 'orb' | 'electric';

/** Aspecto visual del impacto de una habilidad. */
export type ImpactStyle = 'hit' | 'electric';

/**
 * Cómo se reproduce la animación durante la preparación:
 * - `once`: se ajusta la velocidad para que el clip dure exactamente `windup`.
 * - `loop`: se usa `windupAnimationSpeed` y se repite hasta agotar `windup`.
 */
export type WindupAnimationMode = 'once' | 'loop';

export interface BuffSpec {
  stat: BuffStat;
  /** Multiplicador: 1,25 = +25 %, 0,8 = −20 %. */
  multiplier: number;
  /** Duración en segundos. */
  duration: number;
}

export interface AbilityDef {
  /** Identificador único; se usa en `MOVESETS`. */
  id: string;
  name: string;
  type: PokemonType;
  category: DamageCategory;
  shape: AbilityShape;
  /** Potencia base de la fórmula de daño. 0 en habilidades de estado. */
  power: number;
  /** Precisión 1-100. 0 = nunca falla. */
  accuracy: number;
  /** Enfriamiento en segundos. */
  cooldown: number;
  /** Alcance en unidades de mundo (melee, proyectil, haz o centro del área). */
  range: number;
  /** Radio del proyectil, del área o del golpe cuerpo a cuerpo. */
  radius: number;
  /** Semiángulo del cono cuerpo a cuerpo, en grados. */
  halfAngle: number;
  /** Velocidad del proyectil en u/s. */
  projectileSpeed: number;
  /** Aspecto visual del proyectil. */
  projectileStyle: ProjectileStyle;
  /** Aspecto visual del impacto. */
  impactStyle: ImpactStyle;
  /** Nº de enemigos extra que puede atravesar un proyectil. */
  pierce: number;
  /** Distancia del dash en unidades de mundo. */
  dashDistance: number;
  /** Empuje aplicado al objetivo al impactar, en unidades de mundo. */
  knockback: number;
  /** Buffs que se aplican al lanzador al usar la habilidad. */
  buffs: BuffSpec[];
  /** Color del efecto, en 0-255. */
  color: [number, number, number];
  /** Duración de la animación de ataque, en segundos. */
  castTime: number;
  /** Preparación antes de ejecutar el efecto, en segundos. */
  windup: number;
  /** Modo de la animación durante la preparación. */
  windupAnimationMode: WindupAnimationMode;
  /** Velocidad de la animación de preparación en modo `loop` (1 = normal). */
  windupAnimationSpeed: number;
  /** Animación de sprite que se reproduce al lanzar la habilidad. */
  animation: AnimationName;
  /** Texto corto para el HUD y la descripción de la habilidad. */
  description: string;
}

export type AbilityId = string;

export const DEFAULT_ABILITY: Omit<
  AbilityDef,
  'id' | 'name' | 'type' | 'category' | 'shape'
> = {
  power: 0,
  accuracy: 0,
  cooldown: 1,
  range: 1.5,
  radius: 0.5,
  halfAngle: 45,
  projectileSpeed: 12,
  projectileStyle: 'orb',
  impactStyle: 'hit',
  pierce: 0,
  dashDistance: 0,
  knockback: 0,
  buffs: [],
  color: [255, 255, 255],
  castTime: 0.45,
  windup: 0,
  windupAnimationMode: 'once',
  windupAnimationSpeed: 1,
  animation: 'attack',
  description: ''
};

/**
 * Registra una habilidad rellenando los valores que no se indiquen.
 * Pensado para que cada definición sea corta y legible.
 */
export function defineAbility(
  def: Pick<AbilityDef, 'id' | 'name' | 'type' | 'category' | 'shape'> &
    Partial<AbilityDef>
): AbilityDef {
  return { ...DEFAULT_ABILITY, ...def };
}

/**
 * Catálogo de habilidades. Se irá rellenando una a una.
 *
 * Pikachu usa Placaje como básica cuerpo a cuerpo, Ataque Rápido para entrar
 * o salir, Rayo como haz de daño y Impactrueno como proyectil de presión. Los
 * números se pueden ajustar sin tocar el motor: solo afectan a esta definición.
 */
export const ABILITIES: Record<AbilityId, AbilityDef> = {};

ABILITIES.impactrueno = defineAbility({
  id: 'impactrueno',
  name: 'Impactrueno',
  type: 'Electric',
  category: 'special',
  shape: 'projectile',
  power: 40,
  accuracy: 100,
  cooldown: 0.9,
  range: 8,
  radius: 0.26,
  projectileSpeed: 14,
  projectileStyle: 'electric',
  impactStyle: 'electric',
  castTime: 0.34,
  windup: 0.22,
  windupAnimationMode: 'once',
  animation: 'shock',
  color: [247, 208, 44],
  description: 'Proyectil eléctrico rápido. Ataque básico de Pikachu.'
});

ABILITIES.ataqueRapido = defineAbility({
  id: 'ataqueRapido',
  name: 'Ataque Rápido',
  type: 'Normal',
  category: 'physical',
  shape: 'dash',
  power: 40,
  accuracy: 100,
  cooldown: 4,
  range: 0,
  radius: 0.9,
  dashDistance: 4.5,
  knockback: 0.4,
  castTime: 0.25,
  animation: 'quickstrike',
  color: [232, 244, 255],
  description: 'Se lanza hacia delante y golpea a los rivales del camino.'
});

ABILITIES.rayo = defineAbility({
  id: 'rayo',
  name: 'Rayo',
  type: 'Electric',
  category: 'special',
  shape: 'beam',
  power: 90,
  accuracy: 100,
  cooldown: 8,
  range: 11,
  radius: 0.35,
  impactStyle: 'electric',
  castTime: 0.55,
  windup: 0.5,
  windupAnimationMode: 'once',
  animation: 'shock',
  color: [255, 238, 88],
  description: 'Haz eléctrico instantáneo en la dirección en la que mira Pikachu.'
});

ABILITIES.placaje = defineAbility({
  id: 'placaje',
  name: 'Placaje',
  type: 'Normal',
  category: 'physical',
  shape: 'melee',
  power: 40,
  accuracy: 100,
  cooldown: 0.25,
  range: 1.8,
  radius: 0.7,
  halfAngle: 50,
  knockback: 0.6,
  castTime: 0.35,
  color: [235, 228, 210],
  description: 'Embestida cuerpo a cuerpo contra los rivales que tenga delante.'
});

/**
 * Moveset por id de Pokédex: [básica, habilidad 1, habilidad 2, habilidad 3].
 * `null` deja el hueco vacío y el HUD lo muestra como «Sin asignar».
 */
export const MOVESETS: Record<
  string,
  [AbilityId | null, AbilityId | null, AbilityId | null, AbilityId | null]
> = {};

MOVESETS['0025'] = ['placaje', 'ataqueRapido', 'rayo', 'impactrueno'];

export function abilityForSlot(
  pokemonId: string,
  slotIndex: number
): AbilityDef | null {
  const moveset = MOVESETS[pokemonId];
  const id = moveset?.[slotIndex] ?? null;
  return id ? (ABILITIES[id] ?? null) : null;
}
