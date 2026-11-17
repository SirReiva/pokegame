/**
 * Estado de combate por jugador: escudos, daño periódico, marcas, control y
 * pasivas.
 *
 * Todo vive en un único objeto (`MatchPlayerState.status`) para que los sistemas
 * de daño, movimiento y HUD compartan la misma representación. Las funciones de
 * este módulo son puras: no aplican daño ni curan, solo mutan las estructuras.
 * El runtime que sí golpea vive en `game/statusEffects.ts`.
 */

import type { AbilityDef } from '../abilities/def';
import type { MarkBurstSpec } from '../abilities/specs';
import type { PokemonType } from '../typeChart';
import type { Team } from '../team';

export type { MarkBurstSpec } from '../abilities/specs';

/** Escudo de reserva. Varios escudos se suman hasta el tope global. */
export interface ShieldInstance {
  amount: number;
  remaining: number;
  sourceSlot: number;
}

/**
 * Daño periódico. Reaplicar el mismo `id` **renueva** la duración; no acumula
 * instancias. `type: null` significa daño verdadero.
 */
export interface DotInstance {
  id: string;
  sourceSlot: number;
  sourceTeam: Team;
  type: PokemonType | null;
  powerPerSecond: number;
  remaining: number;
  interval: number;
  /** Acumulador de PV fraccionarios para no perder daño por redondeo. */
  accumulator: number;
}

export interface MarkInstance {
  id: string;
  sourceSlot: number;
  sourceTeam: Team;
  stacks: number;
  maxStacks: number;
  remaining: number;
  duration: number;
  burst: MarkBurstSpec;
}

/** Detonación pendiente de una marca; se resuelve en el paso de estados. */
export interface PendingBurst {
  burst: MarkBurstSpec;
  sourceSlot: number;
  sourceTeam: Team;
  x: number;
  z: number;
}

export interface AntiHealInstance {
  fraction: number;
  remaining: number;
}

/**
 * Habilidad copiada por Mímica. Solo se guarda el id base y la caducidad: la
 * definición afinada se recupera del catálogo al lanzarla, así el eco no
 * conserva referencias a objetos que puedan cambiar de balance.
 */
export interface CopiedAbility {
  id: string;
  /** Instante del reloj de partida en el que la copia deja de ser válida. */
  until: number;
}

/**
 * Eco de un haz (Rayo Solar de Celebi). Repite la geometría original a los
 * 0,8 s con el 35 % de potencia y sin control ni marcas.
 */
export interface EchoBeam {
  id: string;
  sourceSlot: number;
  sourceTeam: Team;
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  range: number;
  radius: number;
  damage: number;
  delay: number;
  /** Definición sin control, buffs, marcas ni DoT para el golpe repetido. */
  def: AbilityDef;
}

/**
 * Clon inmóvil de Greninja. Vive en el origen del dash, dispara una réplica
 * reducida de Shuriken de Agua y desaparece. Es una entidad de simulación, no
 * un actor: no recibe daño ni cuenta para la visión.
 */
export interface CloneInstance {
  id: string;
  sourceSlot: number;
  sourceTeam: Team;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  /** Segundos que queda en pie. */
  remaining: number;
  /** Cuenta atrás hasta replicar el proyectil. */
  shotDelay: number;
  /** Potencia del shuriken replicado. */
  power: number;
  /** Alcance con el que busca objetivo antes de disparar al frente. */
  range: number;
  /** `true` cuando ya disparó: solo queda desvanecerse. */
  fired: boolean;
}

/**
 * Explosión retardada en el suelo. La usa el foco de Entei, el eco de Celebi y
 * el rastro de Moltres. No sigue al objetivo.
 */
export interface DelayedBurst {
  id: string;
  sourceSlot: number;
  sourceTeam: Team;
  x: number;
  z: number;
  radius: number;
  damage: number;
  /** Fracción de PV máximos que cura a los aliados dentro. */
  healAllies: number;
  delay: number;
  slow?: { multiplier: number; duration: number };
}

/** Zona persistente que ralentiza rivales y acelera aliados. */
export interface ZoneInstance {
  id: string;
  sourceSlot: number;
  sourceTeam: Team;
  x: number;
  z: number;
  radius: number;
  remaining: number;
  enemySlow: number;
  allySpeed: number;
  damagePerSecond: number;
  tickInterval: number;
  tickTimer: number;
}

export interface PassiveRuntimeState {
  stacks: number;
  timer: number;
  /** Instante (reloj de partida) en el que la pasiva vuelve a estar lista. */
  readyAt: number;
  flag: boolean;
  /** Valor auxiliar para pasivas que recuerdan un objetivo o categoría. */
  value: number;
  /** Magnitud auxiliar (fracción de escudo, umbral, etc.). */
  magnitude: number;
}

export interface PlayerCombatStatus {
  rootTimer: number;
  silenceTimer: number;
  antiHeal: AntiHealInstance | null;
  shields: ShieldInstance[];
  dots: DotInstance[];
  marks: MarkInstance[];
  pendingBursts: PendingBurst[];
  clones: CloneInstance[];
  delayed: DelayedBurst[];
  echoBeams: EchoBeam[];
  /** Habilidad copiada por Mímica; `null` si no hay copia lista. */
  copiedAbility: CopiedAbility | null;
  zones: ZoneInstance[];
  /** Inmunidad por marca: `id -> instante hasta el que no se puede reaplicar`. */
  markImmunity: Map<string, number>;
  /** Acumulaciones de control fuerte para la resistencia progresiva. */
  controlStacks: number;
  controlDecay: number;
  /** Último instante en el que el jugador recibió daño. */
  lastDamageAt: number;
  passive: PassiveRuntimeState;
}

/** Tope global de escudos como fracción de los PV máximos. */
export const SHIELD_CAP_FRACTION = 0.35;

/** Reducción máxima de duración por resistencia progresiva (3 acumulaciones). */
const CONTROL_STEP = 0.3;
const CONTROL_MAX_STACKS = 3;
const CONTROL_DECAY_SECONDS = 6;

export function createPassiveRuntime(): PassiveRuntimeState {
  return { stacks: 0, timer: 0, readyAt: 0, flag: false, value: -1, magnitude: 0 };
}

export function createCombatStatus(): PlayerCombatStatus {
  return {
    rootTimer: 0,
    silenceTimer: 0,
    antiHeal: null,
    shields: [],
    dots: [],
    marks: [],
    pendingBursts: [],
    clones: [],
    delayed: [],
    echoBeams: [],
    copiedAbility: null,
    zones: [],
    markImmunity: new Map(),
    controlStacks: 0,
    controlDecay: 0,
    lastDamageAt: 0,
    passive: createPassiveRuntime()
  };
}

/** Limpia el estado al reaparecer, conservando los arrays para no asignar. */
export function resetCombatStatus(status: PlayerCombatStatus): void {
  status.rootTimer = 0;
  status.silenceTimer = 0;
  status.antiHeal = null;
  status.shields.length = 0;
  status.dots.length = 0;
  status.marks.length = 0;
  status.pendingBursts.length = 0;
  status.clones.length = 0;
  status.delayed.length = 0;
  status.echoBeams.length = 0;
  status.copiedAbility = null;
  status.zones.length = 0;
  status.markImmunity.clear();
  status.controlStacks = 0;
  status.controlDecay = 0;
  status.lastDamageAt = 0;
  status.passive = createPassiveRuntime();
}

export function shieldTotal(status: PlayerCombatStatus): number {
  let total = 0;
  for (const shield of status.shields) total += shield.amount;
  return total;
}

/**
 * Añade un escudo respetando el tope global. Devuelve la cantidad realmente
 * añadida, que puede ser menor si ya había escudos.
 */
export function addShield(
  status: PlayerCombatStatus,
  amount: number,
  duration: number,
  sourceSlot: number,
  maxHp: number
): number {
  if (amount <= 0 || duration <= 0) return 0;
  const cap = maxHp * SHIELD_CAP_FRACTION;
  const current = shieldTotal(status);
  const granted = Math.max(0, Math.min(amount, cap - current));
  if (granted <= 0) return 0;
  status.shields.push({ amount: granted, remaining: duration, sourceSlot });
  return granted;
}

/**
 * Consume escudos de más antiguo a más nuevo. Devuelve el daño que queda por
 * aplicar después de los escudos.
 */
export function consumeShields(
  status: PlayerCombatStatus,
  damage: number
): number {
  let remaining = damage;
  while (remaining > 0 && status.shields.length > 0) {
    const shield = status.shields[0];
    const absorbed = Math.min(shield.amount, remaining);
    shield.amount -= absorbed;
    remaining -= absorbed;
    if (shield.amount <= 0.0001) status.shields.shift();
  }
  return remaining;
}

/**
 * Duración efectiva de un control fuerte tras aplicar resistencia progresiva.
 * Cada control consecutivo dura un 30 % menos; la resistencia decae a los 6 s.
 */
export function resistControl(
  status: PlayerCombatStatus,
  baseSeconds: number
): number {
  if (baseSeconds <= 0) return 0;
  const multiplier = 1 / (1 + status.controlStacks * CONTROL_STEP);
  status.controlStacks = Math.min(
    CONTROL_MAX_STACKS,
    status.controlStacks + 1
  );
  status.controlDecay = CONTROL_DECAY_SECONDS;
  return baseSeconds * multiplier;
}

/** Avanza la decadencia de la resistencia al control. */
export function stepControlResistance(
  status: PlayerCombatStatus,
  dt: number
): void {
  if (status.controlStacks <= 0) return;
  status.controlDecay -= dt;
  if (status.controlDecay <= 0) {
    status.controlStacks = Math.max(0, status.controlStacks - 1);
    status.controlDecay = status.controlStacks > 0 ? CONTROL_DECAY_SECONDS : 0;
  }
}

/** Fracción de curación que llega tras el anti-heal activo. */
export function healingMultiplier(status: PlayerCombatStatus): number {
  return status.antiHeal ? Math.max(0, 1 - status.antiHeal.fraction) : 1;
}
