/**
 * Pasivas del roster.
 *
 * Cada pasiva se define como una lista de hooks sobre eventos del combate:
 * - `onIncomingDamage`: reduce o absorbe daño antes de los escudos.
 * - `onDamageTaken`: reacciona al daño recibido.
 * - `onDirectHit`: reacciona a un golpe directo propio.
 * - `onAbilityCast`: reacciona al lanzamiento (clon, estela, charco...).
 * - `onTick`: auras y regeneración.
 * - `onKill`: recompensas por baja.
 *
 * Los hooks que no necesitan host (marcas, DoT, escudos, zonas) mutan el estado
 * directamente. Solo `onTick` recibe host para aplicar daño verdadero y control
 * sin acoplarse al orquestador.
 */

import { baseAbilityId, type AbilityDef, type BuffStat } from './abilities';
import type { MatchPlayerState } from './matchState';
import type { StatusEffectHost } from './statusEffects';
import {
  addDelayedBurst,
  addEchoBeam,
  addZone,
  applyBuffStatus,
  applyMark,
  grantShield,
  spawnClone,
  type MarkSpec
} from './statusEffects';
import {
  cycleEeveeStance,
  scheduleEeveeShield,
  stepEeveeStance
} from './sim/stances';
import { healingMultiplier } from './core/combat/status';

export interface PassiveHitContext {
  /** Dueño de la pasiva. */
  player: MatchPlayerState;
  /** Rival implicado: atacante en daño recibido, objetivo en golpe directo. */
  other: MatchPlayerState;
  damage: number;
  def: AbilityDef | null;
  time: number;
  /** Todos los combatientes; las auras necesitan ver más allá del rival. */
  players: readonly MatchPlayerState[];
}

export interface PassiveCastContext {
  player: MatchPlayerState;
  def: AbilityDef;
  time: number;
  players: readonly MatchPlayerState[];
  /** Host de estados para los efectos que necesitan una primitiva visual. */
  host: StatusEffectHost;
  /** Punto de suelo elegido por la habilidad, si lo tiene. */
  targetX?: number;
  targetZ?: number;
  /** Dirección fijada al iniciar el casteo, si la hubo. */
  dirX?: number;
  dirZ?: number;
}

export interface PassiveTickContext {
  player: MatchPlayerState;
  time: number;
  dt: number;
  host: StatusEffectHost;
}

export interface PassiveKillContext {
  player: MatchPlayerState;
  victim: MatchPlayerState;
  time: number;
}

export interface PassiveDef {
  id: string;
  name: string;
  description: string;
  /** Acumulaciones visibles en el HUD (0 si no aplica). */
  maxStacks?: number;
  /**
   * Medidor que alimenta la siguiente habilidad ofensiva. Los bots lo leen para
   * no desaprovechar acumulaciones; no cambia la mecánica.
   */
  castMeter?: boolean;
  onIncomingDamage?(context: PassiveHitContext): number;
  onDamageTaken?(context: PassiveHitContext): void;
  onDirectHit?(context: PassiveHitContext): void;
  onAbilityCast?(context: PassiveCastContext): void;
  onTick?(context: PassiveTickContext): void;
  onKill?(context: PassiveKillContext): void;
  /** Reacción a una asistencia confirmada (misma baja, sin ser el killer). */
  onAssist?(context: PassiveKillContext): void;
}

const distance = (a: MatchPlayerState, b: MatchPlayerState): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

const isEnemy = (a: MatchPlayerState, b: MatchPlayerState): boolean =>
  a.team !== b.team;

function addBuff(
  target: MatchPlayerState,
  stat: BuffStat,
  multiplier: number,
  duration: number,
  source?: string
): void {
  applyBuffStatus(target, stat, multiplier, duration, source);
}

function addMark(
  target: MatchPlayerState,
  spec: MarkSpec,
  source: MatchPlayerState,
  time: number
): void {
  applyMark(target, spec, source, time);
}

/** Hooks compartidos por medidores de impactos (Charmander, Pikachu...). */
function chargeOnHit(
  player: MatchPlayerState,
  max: number,
  stat: BuffStat,
  multiplier: number,
  duration: number
): void {
  const state = player.status.passive;
  state.stacks += 1;
  if (state.stacks < max) return;
  state.stacks = 0;
  addBuff(
    player,
    stat,
    multiplier,
    duration,
    `meter:${player.slot}:${stat}`
  );
}

const PASSIVE_FURY_STEP = 1;

function gainFury(player: MatchPlayerState, time: number): void {
  const state = player.status.passive;
  if (time < state.readyAt) return;
  state.readyAt = time + PASSIVE_FURY_STEP;
  state.stacks += 1;
  if (state.stacks < 5) return;
  state.stacks = 0;
  addBuff(player, 'attack', 1.2, 4, 'furia:attack');
  addBuff(player, 'speed', 1.1, 4, 'furia:speed');
  grantShield(player, 0.1, 4, player.slot);
}

const ARCANINE_COMBAT_GAP = 6;
const ARCANINE_AURA_RADIUS = 4.5;
const ARCANINE_PER_ENEMY_COOLDOWN = 10;

const ONIX_PLATE_COUNT = 3;
const ONIX_PLATE_HP = 60;
const SQUIRTLE_SHIELD_FRACTION = 0.08;
const SQUIRTLE_SHIELD_COOLDOWN = 4;

/**
 * Intimidación de Arcanine: al entrar en combate (primer golpe tras 6 s sin
 * pelear) aplica −15 % AF durante 3 s a todos los rivales en 4,5 u. Cada rival
 * tiene su propio enfriamiento de 10 s y el debuff no se acumula.
 */
function arcanineIntimidate(
  player: MatchPlayerState,
  time: number,
  players: readonly MatchPlayerState[]
): void {
  const state = player.status.passive;
  const lastCombat = state.value;
  state.value = time;
  if (lastCombat >= 0 && time - lastCombat < ARCANINE_COMBAT_GAP) return;

  for (const target of players) {
    if (!target.alive || !isEnemy(player, target)) continue;
    if (distance(player, target) > ARCANINE_AURA_RADIUS) continue;
    const key = `intimidacion:${target.slot}`;
    if ((player.status.markImmunity.get(key) ?? 0) > time) continue;
    player.status.markImmunity.set(key, time + ARCANINE_PER_ENEMY_COOLDOWN);
    addBuff(target, 'attack', 0.85, 3, `intimidacion:${player.slot}`);
  }
}

/**
 * Estela Ardiente de Moltres. Tajo Aéreo deja tres tramos a lo largo del dash;
 * Ataque Celeste deja un tramo en el punto de impacto. La zona hace 15 PV/s a
 * los rivales y no toca a los aliados.
 */
function moltresTrail(context: PassiveCastContext): void {
  const base = baseAbilityId(context.def.id);
  if (base !== 'tajoAereo' && base !== 'ataqueCeleste') return;
  const player = context.player;
  const dirX = context.dirX ?? Math.sin(player.facing);
  const dirZ = context.dirZ ?? Math.cos(player.facing);

  // La estela se renueva: una nueva pasada sustituye los tramos anteriores.
  let kept = 0;
  for (const zone of player.status.zones) {
    if (zone.id !== 'estela') player.status.zones[kept++] = zone;
  }
  player.status.zones.length = kept;

  const place = (x: number, z: number, radius: number): void => {
    addZone(player, {
      id: 'estela',
      x,
      z,
      radius,
      remaining: 3,
      enemySlow: 1,
      allySpeed: 1,
      damagePerSecond: 15,
      tickInterval: 0.5,
      tickTimer: 0
    });
  };

  if (base === 'tajoAereo') {
    const length = context.def.dashDistance > 0 ? context.def.dashDistance : 4.8;
    for (const fraction of [0.12, 0.5, 0.88]) {
      place(
        player.x + dirX * length * fraction,
        player.z + dirZ * length * fraction,
        0.72
      );
    }
    return;
  }

  const x = context.targetX ?? player.x + dirX * context.def.range;
  const z = context.targetZ ?? player.z + dirZ * context.def.range;
  place(x, z, 1.6);
}

/** Charcos de Kyogre: nacen en el punto de la habilidad, no bajo el lanzador. */
function kyogrePuddle(context: PassiveCastContext): void {
  const base = baseAbilityId(context.def.id);
  if (base !== 'remolinoMarino' && base !== 'pulsoPrimigenio') return;
  const player = context.player;
  const dirX = context.dirX ?? Math.sin(player.facing);
  const dirZ = context.dirZ ?? Math.cos(player.facing);
  addZone(player, {
    id: 'charco',
    x: context.targetX ?? player.x + dirX * context.def.range,
    z: context.targetZ ?? player.z + dirZ * context.def.range,
    radius: 2.2,
    remaining: 4,
    enemySlow: 0.8,
    allySpeed: 1.1,
    damagePerSecond: 0,
    tickInterval: 0.5,
    tickTimer: 0
  });
}

/** Clon de Agua: nace en el origen de Sombra Vil y replica un shuriken. */
function greninjaClone(context: PassiveCastContext): void {
  if (baseAbilityId(context.def.id) !== 'sombraVil') return;
  const player = context.player;
  const dirX = context.dirX ?? Math.sin(player.facing);
  const dirZ = context.dirZ ?? Math.cos(player.facing);
  const length = Math.hypot(dirX, dirZ) || 1;
  spawnClone(player, {
    id: 'clon-de-agua',
    x: player.x,
    z: player.z,
    dirX: dirX / length,
    dirZ: dirZ / length,
    remaining: 1.4,
    shotDelay: 0.45,
    power: 22,
    range: 8,
    fired: false
  });
  const clone = player.status.clones[0];
  if (clone) context.host.spawnCloneVisual(clone);
}

/** Ceniza Viva: la misma recompensa al matar y al asistir. */
function hoOhCinder(player: MatchPlayerState): void {
  if (!player.alive) return;
  const missing = Math.max(0, player.maxHp - player.hp);
  const healed = Math.min(
    missing,
    Math.round(player.maxHp * 0.12 * healingMultiplier(player.status))
  );
  if (healed > 0) {
    player.hp += healed;
    player.abilityHealing += healed;
  }
  player.damageReduction = Math.max(player.damageReduction, 0.15);
  player.damageReductionTimer = Math.max(player.damageReductionTimer, 3);
  player.shieldSpeedMultiplier = 1;
}

/**
 * Eco Temporal: Rayo Solar repite su línea a los 0,8 s con el 35 % de potencia.
 * El eco conserva la geometría del haz, pero no aplica control, marcas, buffs
 * ni curación.
 */
function celebiEcho(context: PassiveCastContext): void {
  const def = context.def;
  if (baseAbilityId(def.id) !== 'rayoSolar') return;
  const player = context.player;
  const dirX = context.dirX ?? Math.sin(player.facing);
  const dirZ = context.dirZ ?? Math.cos(player.facing);
  const targetX = context.targetX ?? player.x + dirX * def.range;
  const targetZ = context.targetZ ?? player.z + dirZ * def.range;
  const damage = def.power * 0.35;
  const echoDef: AbilityDef = {
    ...def,
    power: damage,
    startup: 0,
    active: 0,
    recovery: 0,
    slow: null,
    dot: null,
    marks: [],
    root: 0,
    silence: 0,
    antiHeal: null,
    buffs: [],
    healSelf: 0,
    selfDamage: 0,
    hitCount: 1
  };
  addEchoBeam(player, {
    id: 'eco-solar',
    x: player.x,
    z: player.z,
    targetX,
    targetZ,
    range: def.range,
    radius: Math.max(0.2, def.radius),
    damage,
    delay: 0.8,
    def: echoDef
  });
}

export const PASSIVES: Record<string, PassiveDef> = {
  '0001': {
    id: 'semillas-latentes',
    name: 'Semillas Latentes',
    description:
      'Los golpes directos dejan una semilla. El segundo golpe la germina: daño extra y una pequeña curación.',
    maxStacks: 0,
    onDirectHit: ({ player, other, def, time }) => {
      if (!def || def.category === 'status') return;
      addMark(
        other,
        {
          id: 'semilla',
          maxStacks: 2,
          duration: 6,
          burst: { damage: 35, healSelf: 0.03 }
        },
        player,
        time
      );
    }
  },
  '0004': {
    id: 'corazon-igneo',
    name: 'Corazón Ígneo',
    description:
      'Acumula calor con impactos directos. Al llenar el medidor, la siguiente habilidad de Fuego gana potencia.',
    maxStacks: 5,
    castMeter: true,
    onDirectHit: ({ player, def }) => {
      if (!def || def.category === 'status') return;
      chargeOnHit(player, 5, 'spAttack', 1.18, 3);
    }
  },
  '0007': {
    id: 'caparazon-guardian',
    name: 'Caparazón Guardián',
    description:
      'Tras 4 s sin recibir daño gana un escudo de reserva del 8 % de su vida máxima. Vuelve a activarse cada vez que se rompe la racha.',
    maxStacks: 1,
    onIncomingDamage: ({ player, damage, time }) => {
      const status = player.status;
      if (
        time - status.lastDamageAt >= SQUIRTLE_SHIELD_COOLDOWN &&
        !status.passive.flag
      ) {
        status.passive.flag = true;
        grantShield(player, SQUIRTLE_SHIELD_FRACTION, 6, player.slot);
      }
      return damage;
    },
    onDamageTaken: ({ player, time }) => {
      player.status.lastDamageAt = time;
      player.status.passive.flag = false;
    }
  },
  '0025': {
    id: 'carga-estatica',
    name: 'Carga Estática',
    description:
      'Genera carga al impactar. Al llenarse, la siguiente habilidad eléctrica recibe un bonus de ataque especial.',
    maxStacks: 5,
    castMeter: true,
    onDirectHit: ({ player, def }) => {
      if (!def || def.category === 'status') return;
      chargeOnHit(player, 5, 'spAttack', 1.2, 3);
    }
  },
  '0059': {
    id: 'intimidacion',
    name: 'Intimidación',
    description:
      'Al entrar en combate tras 6 s sin pelear, intimida a los rivales en 4,5 u: −15 % AF durante 3 s. Enfriamiento de 10 s por rival.',
    maxStacks: 0,
    onDirectHit: ({ player, time, players }) =>
      arcanineIntimidate(player, time, players),
    onDamageTaken: ({ player, time, players }) =>
      arcanineIntimidate(player, time, players)
  },
  '0094': {
    id: 'sombra-acechante',
    name: 'Sombra Acechante',
    description:
      'Tras 2 s fuera de la visión enemiga, su siguiente habilidad recibe un bonus de ataque especial.',
    maxStacks: 1,
    onTick: ({ player, dt }) => {
      const state = player.status.passive;
      if (player.enemiesSeeing === 0) {
        state.timer += dt;
        if (state.timer >= 2) state.flag = true;
      } else {
        state.timer = 0;
      }
    },
    onAbilityCast: ({ player }) => {
      if (!player.status.passive.flag) return;
      player.status.passive.flag = false;
      player.status.passive.timer = 0;
      addBuff(player, 'spAttack', 1.2, 2, 'gengar-sombra');
    }
  },
  '0095': {
    id: 'cuerpo-rocoso',
    name: 'Cuerpo Rocoso',
    description:
      'Tres placas de 60 PV absorben daño antes que la vida. Regenera una placa cada 6 s sin recibir golpes.',
    maxStacks: 3,
    onIncomingDamage: ({ player, damage }) => {
      const state = player.status.passive;
      if (!state.flag) {
        state.flag = true;
        state.stacks = ONIX_PLATE_COUNT;
        state.value = ONIX_PLATE_HP;
      }
      let remaining = damage;
      while (remaining > 0) {
        if (state.value <= 0) {
          if (state.stacks <= 1) {
            state.stacks = 0;
            state.value = 0;
            break;
          }
          state.stacks -= 1;
          state.value = ONIX_PLATE_HP;
        }
        const absorbed = Math.min(state.value, remaining);
        state.value -= absorbed;
        remaining -= absorbed;
      }
      return remaining;
    },
    onDamageTaken: ({ player }) => {
      player.status.passive.timer = 0;
    },
    onTick: ({ player, dt }) => {
      const state = player.status.passive;
      if (!state.flag) {
        state.flag = true;
        state.stacks = ONIX_PLATE_COUNT;
        state.value = ONIX_PLATE_HP;
        return;
      }
      if (state.stacks >= ONIX_PLATE_COUNT && state.value >= ONIX_PLATE_HP) {
        return;
      }
      state.timer += dt;
      if (state.timer < 6) return;
      state.timer = 0;
      if (state.stacks <= 0) {
        state.stacks = 1;
        state.value = ONIX_PLATE_HP;
      } else if (state.value < ONIX_PLATE_HP) {
        state.value = ONIX_PLATE_HP;
      } else {
        state.stacks = Math.min(ONIX_PLATE_COUNT, state.stacks + 1);
        state.value = ONIX_PLATE_HP;
      }
    }
  },
  '0100': {
    id: 'nucleo-resonante',
    name: 'Núcleo Resonante',
    description:
      'Cada golpe directo deja una carga residual (máx. 2). Al completarse, detona una descarga eléctrica de 40 de daño.',
    maxStacks: 0,
    onDirectHit: ({ player, other, def, time }) => {
      if (!def || def.category === 'status') return;
      addMark(
        other,
        {
          id: 'carga-resonante',
          maxStacks: 2,
          duration: 6,
          burst: { damage: 40 }
        },
        player,
        time
      );
    }
  },
  '0123': {
    id: 'filo-afilado',
    name: 'Filo Afilado',
    description:
      'Cada impacto directo acumula Filo (máx. 3). Cada acumulación da +8 % de ataque durante 3 s.',
    maxStacks: 3,
    castMeter: true,
    onDirectHit: ({ player, time }) => {
      const state = player.status.passive;
      if (time > state.readyAt) state.stacks = 0;
      state.readyAt = time + 3;
      state.stacks = Math.min(3, state.stacks + 1);
      addBuff(
        player,
        'attack',
        1 + 0.08 * state.stacks,
        3,
        'scyther-filo'
      );
    }
  },
  '0130': {
    id: 'furia',
    name: 'Furia',
    description:
      'Dar o recibir daño acumula Furia (máx. 5, una por segundo). Al llenarse entra en Enfurecido: +20 % AF, +10 % VEL y un escudo.',
    maxStacks: 5,
    onDirectHit: ({ player, time }) => gainFury(player, time),
    onDamageTaken: ({ player, time }) => gainFury(player, time)
  },
  '0133': {
    id: 'adaptabilidad',
    name: 'Adaptabilidad',
    description:
      'Tres estados manuales: Agilidad (+15 % VEL), Resistencia (+15 % DF/DE) y Potencia (+15 % AF/AE). Adaptación cambia al siguiente. Ataque Rápido y Último Recurso mejoran según el estado activo.',
    maxStacks: 0,
    onAbilityCast: ({ player, def }) => {
      const base = baseAbilityId(def.id);
      if (base === 'adaptacion') {
        cycleEeveeStance(player);
        return;
      }
      if (base === 'ataqueRapidoEevee') {
        scheduleEeveeShield(player, def, 0.06);
        return;
      }
      if (base === 'ultimoRecurso') {
        scheduleEeveeShield(player, def, 0.1);
      }
    },
    onTick: ({ player, dt }) => stepEeveeStance(player, dt)
  },
  '0448': {
    id: 'resonancia-del-aura',
    name: 'Resonancia del Aura',
    description:
      'Cada impacto genera aura; alternar daño físico y especial genera más. Al llenarse, la siguiente habilidad gana potencia.',
    maxStacks: 5,
    castMeter: true,
    onDirectHit: ({ player, def }) => {
      if (!def || def.category === 'status') return;
      const state = player.status.passive;
      const category = def.category === 'physical' ? 1 : 2;
      state.stacks += state.value !== category ? 2 : 1;
      state.value = category;
      if (state.stacks < 5) return;
      state.stacks = 0;
      addBuff(player, 'attack', 1.2, 4, 'lucario:attack');
      addBuff(player, 'spAttack', 1.2, 4, 'lucario:spAttack');
    }
  },
  '0658': {
    id: 'clon-de-agua',
    name: 'Clon de Agua',
    description:
      'Sombra Vil deja un clon inmóvil en el origen. Tras 0,45 s replica un Shuriken de Agua reducido y desaparece.',
    maxStacks: 0,
    onAbilityCast: greninjaClone
  },
  '0144': {
    id: 'escarcha',
    name: 'Escarcha',
    description:
      'Las habilidades de Hielo aplican Frío (máx. 3). Al completarse: raíz de 0,6 s y slow. Después, 8 s de inmunidad.',
    maxStacks: 0,
    onDirectHit: ({ player, other, def, time }) => {
      if (def?.type !== 'Ice') return;
      addMark(
        other,
        {
          id: 'frio',
          maxStacks: 3,
          duration: 5,
          immunityAfter: 8,
          burst: {
            root: 0.6,
            slow: { multiplier: 0.8, duration: 1.5 }
          }
        },
        player,
        time
      );
    }
  },
  '0145': {
    id: 'carga-electrica',
    name: 'Carga Estática',
    description:
      'El básico y Onda Trueno dejan Carga. La siguiente habilidad eléctrica la detona y transmite parte del daño.',
    maxStacks: 0,
    onDirectHit: ({ player, other, def, time }) => {
      if (def?.type !== 'Electric') return;
      addMark(
        other,
        {
          id: 'carga-zapdos',
          maxStacks: 2,
          duration: 5,
          burst: {
            damage: 35,
            slow: { multiplier: 0.9, duration: 1 }
          }
        },
        player,
        time
      );
    }
  },
  '0146': {
    id: 'estela-ardiente',
    name: 'Estela Ardiente',
    description:
      'Tajo Aéreo deja una estela de tres tramos y Ataque Celeste una zona en el impacto: 15 PV/s durante 3 s a los rivales. Se renueva, no se suma.',
    maxStacks: 0,
    onAbilityCast: moltresTrail
  },
  '0150': {
    id: 'presion-psiquica',
    name: 'Presión Psíquica',
    description:
      'Cada impacto aplica Presión (máx. 3). Al completarse: silencio de 0,5 s y slow. Después, 10 s de inmunidad.',
    maxStacks: 0,
    onDirectHit: ({ player, other, def, time }) => {
      if (!def || def.category === 'status') return;
      addMark(
        other,
        {
          id: 'presion',
          maxStacks: 3,
          duration: 4,
          immunityAfter: 10,
          burst: {
            silence: 0.5,
            slow: { multiplier: 0.8, duration: 2 }
          }
        },
        player,
        time
      );
    }
  },
  '0151': {
    id: 'sincronia',
    name: 'Sincronía',
    description:
      'Devuelve el 50 % de la duración de slows, raíces y silencios al lanzador. Enfriamiento de 8 s; no refleja empujes ni daño.',
    maxStacks: 0
  },
  '0243': {
    id: 'instinto-de-caza',
    name: 'Instinto de Caza',
    description:
      'Su daño marca a la Presa durante 6 s. Mientras la Presa siga viva, Raikou gana +12 % de velocidad.',
    maxStacks: 0,
    onDirectHit: ({ player, other, time }) => {
      player.status.passive.value = other.slot;
      player.status.passive.readyAt = time + 6;
    },
    onTick: ({ player, time, host }) => {
      const state = player.status.passive;
      if (state.value < 0) return;
      const prey = host.playerBySlot(state.value);
      if (!prey || !prey.alive) {
        state.value = -1;
        return;
      }
      if (time <= state.readyAt) {
        addBuff(player, 'speed', 1.12, 0.5, 'raikou-prey');
      }
    }
  },
  '0244': {
    id: 'foco-volcanico',
    name: 'Foco Volcánico',
    description:
      'Cada 6 s, la habilidad que daña planta un foco bajo el primer enemigo golpeado. Tras 1,2 s erupciona con daño y slow.',
    maxStacks: 0,
    onDirectHit: ({ player, other, def, time }) => {
      if (!def || def.power <= 0 || time < player.status.passive.readyAt) {
        return;
      }
      player.status.passive.readyAt = time + 6;
      addDelayedBurst(player, {
        id: 'foco-volcanico',
        x: other.x,
        z: other.z,
        radius: 1.8,
        damage: 35,
        healAllies: 0,
        delay: 1.2,
        slow: { multiplier: 0.8, duration: 1 }
      });
    }
  },
  '0245': {
    id: 'agua-purificadora',
    name: 'Agua Purificadora',
    description:
      'Aura de 4,5 u: Suicune y sus aliados ganan +8 % VEL y reciben un 25 % menos de duración de slows, raíces y silencios. No reduce aturdimientos.',
    maxStacks: 0,
    onTick: ({ player, host }) => {
      for (const target of host.players()) {
        if (!target.alive) continue;
        if (target.team !== player.team) continue;
        if (distance(player, target) > 4.5) continue;
        addBuff(target, 'speed', 1.08, 0.5, 'suicune-aura');
      }
    }
  },
  '0248': {
    id: 'chorro-arena',
    name: 'Chorro Arena',
    description:
      'Aura de 3,2 u: los enemigos dentro sufren 12 % de slow y 6 PV/s; Tyranitar recibe un 10 % menos de daño de quien esté dentro.',
    maxStacks: 0,
    onIncomingDamage: ({ player, other, damage }) => {
      return other && distance(player, other) <= 3.2 ? damage * 0.9 : damage;
    },
    onTick: ({ player, dt, host }) => {
      const state = player.status.passive;
      state.timer += dt;
      if (state.timer < 0.5) return;
      state.timer = 0;
      for (const target of host.players()) {
        if (!target.alive || !isEnemy(player, target)) continue;
        if (distance(player, target) > 3.2) continue;
        host.applySlow(player, target, 0.88, 0.6);
        host.damage(target, 3, player.slot, player.team, 'chorro-arena');
      }
    }
  },
  '0249': {
    id: 'multiescamas',
    name: 'Multiescamas',
    description:
      'Por encima del 60 % de PV, el primer daño cada 8 s se reduce un 35 %.',
    maxStacks: 0,
    onIncomingDamage: ({ player, damage, time }) => {
      if (player.hp / Math.max(1, player.maxHp) <= 0.6) return damage;
      if (time < player.status.passive.readyAt) return damage;
      player.status.passive.readyAt = time + 8;
      return damage * 0.65;
    }
  },
  '0250': {
    id: 'ceniza-viva',
    name: 'Ceniza Viva',
    description:
      'Al conseguir una baja o una asistencia, recupera un 12 % de su vida máxima y gana 15 % de reducción de daño durante 3 s.',
    maxStacks: 0,
    onKill: ({ player }) => hoOhCinder(player),
    onAssist: ({ player }) => hoOhCinder(player)
  },
  '0251': {
    id: 'eco-temporal',
    name: 'Eco Temporal',
    description:
      'Rayo Solar deja un eco que repite su línea a los 0,8 s con el 35 % de potencia. Deseo repite un 35 % de su curación. No repite control ni genera marcas.',
    maxStacks: 0,
    onAbilityCast: (context) => {
      const base = baseAbilityId(context.def.id);
      if (base === 'rayoSolar') {
        celebiEcho(context);
        return;
      }
      if (base !== 'deseo') return;
      const player = context.player;
      addDelayedBurst(player, {
        id: 'eco-deseo',
        x: player.x,
        z: player.z,
        radius: 3.2,
        damage: 0,
        healAllies: 0.06,
        delay: 0.8
      });
    }
  },
  '0382': {
    id: 'lluvia-primigenia',
    name: 'Lluvia Primigenia',
    description:
      'Remolino y Pulso dejan un charco de 2,2 u durante 4 s en el punto de la habilidad: ralentiza rivales y acelera aliados. Máximo 3 charcos.',
    maxStacks: 0,
    onAbilityCast: kyogrePuddle
  },
  '0383': {
    id: 'tierra-primigenia',
    name: 'Tierra Primigenia',
    description:
      'Inmune a empujes, atracciones y lanzamientos. Las raíces le duran un 50 % menos; no reduce stuns, silencios ni desarmes.',
    maxStacks: 0
  },
  '0384': {
    id: 'corriente-celeste',
    name: 'Corriente Celeste',
    description:
      'Dash y definitiva activan Corriente 4 s: +15 % VEL y +25 % a la siguiente habilidad Dragón no básica. Si esa habilidad impacta, Corriente se renueva. El básico no la consume ni la renueva.',
    maxStacks: 1,
    onAbilityCast: ({ player, def, time }) => {
      const base = baseAbilityId(def.id);
      if (def.shape !== 'dash' && base !== 'ascensoDraco') return;
      const state = player.status.passive;
      state.flag = true;
      state.readyAt = time + 4;
      state.stacks = 1;
      state.magnitude = 0;
    },
    onTick: ({ player, time }) => {
      const state = player.status.passive;
      if (!state.flag) return;
      if (state.readyAt <= time) {
        state.flag = false;
        state.readyAt = 0;
        state.stacks = 0;
        state.magnitude = 0;
        return;
      }
      addBuff(player, 'speed', 1.15, 0.5, 'rayquaza-current');
    },
    onDirectHit: ({ player, def, time }) => {
      const base = baseAbilityId(def?.id ?? '');
      if (def?.type !== 'Dragon' || base === 'garraDraco') return;
      const state = player.status.passive;
      // `magnitude` marca el casteo potenciado que sigue en vuelo. Solo una
      // habilidad Dragón que ya consumió Corriente puede renovarla al impactar.
      if (!state.flag || state.magnitude <= 0) return;
      state.magnitude = 0;
      state.flag = true;
      state.readyAt = time + 4;
      state.stacks = 1;
    }
  }
};

// Pokémon sin entrada explícita (no debería ocurrir con el roster actual).
export function passiveFor(pokemonId: string): PassiveDef | null {
  return PASSIVES[pokemonId] ?? null;
}

/** ¿La pasiva de este Pokémon lo hace inmune a empujes y atracciones? */
export function passiveBlocksKnockback(player: MatchPlayerState): boolean {
  return player.pokemonId === '0383';
}

/**
 * Corriente Celeste: la siguiente habilidad Dragón no básica consume la carga y
 * ve su potencia multiplicada por 1,25. El básico de Rayquaza ni consume ni se
 * beneficia. Se aplica al construir el casteo para que todas las instancias de
 * daño de esa habilidad compartan el bonus.
 */
export function adjustRayquazaCurrent(
  player: MatchPlayerState,
  def: AbilityDef
): AbilityDef {
  if (player.pokemonId !== '0384') return def;
  const base = baseAbilityId(def.id);
  if (def.type !== 'Dragon' || base === 'garraDraco') return def;

  const state = player.status.passive;
  if (state.flag && state.stacks > 0) {
    state.stacks = 0;
    state.magnitude = 1;
    return { ...def, power: def.power * 1.25 };
  }

  // Un casteo Dragón no potenciado no debe renovar Corriente por el impacto de
  // un casteo anterior que quedó en vuelo.
  state.magnitude = 0;
  return def;
}

export function applyPassiveIncomingDamage(
  target: MatchPlayerState,
  attacker: MatchPlayerState,
  damage: number,
  def: AbilityDef | null,
  time: number,
  players: readonly MatchPlayerState[]
): number {
  const passive = PASSIVES[target.pokemonId];
  if (!passive?.onIncomingDamage) return damage;
  return passive.onIncomingDamage({
    player: target,
    other: attacker,
    damage,
    def,
    time,
    players
  });
}

export function applyPassiveDirectHit(
  attacker: MatchPlayerState,
  target: MatchPlayerState,
  damage: number,
  def: AbilityDef | null,
  time: number,
  players: readonly MatchPlayerState[]
): void {
  PASSIVES[attacker.pokemonId]?.onDirectHit?.({
    player: attacker,
    other: target,
    damage,
    def,
    time,
    players
  });
}

export function applyPassiveDamageTaken(
  target: MatchPlayerState,
  attacker: MatchPlayerState,
  damage: number,
  def: AbilityDef | null,
  time: number,
  players: readonly MatchPlayerState[]
): void {
  PASSIVES[target.pokemonId]?.onDamageTaken?.({
    player: target,
    other: attacker,
    damage,
    def,
    time,
    players
  });
}

export function applyPassiveAbilityCast(
  player: MatchPlayerState,
  def: AbilityDef,
  time: number,
  players: readonly MatchPlayerState[],
  host: StatusEffectHost,
  position?: { targetX?: number; targetZ?: number; dirX?: number; dirZ?: number }
): void {
  PASSIVES[player.pokemonId]?.onAbilityCast?.({
    player,
    def,
    time,
    players,
    host,
    targetX: position?.targetX,
    targetZ: position?.targetZ,
    dirX: position?.dirX,
    dirZ: position?.dirZ
  });
}

export function applyPassiveKill(
  player: MatchPlayerState,
  victim: MatchPlayerState,
  time: number
): void {
  PASSIVES[player.pokemonId]?.onKill?.({ player, victim, time });
}

/** Avisa a cada asistente confirmado; el killer ya recibió `onKill`. */
export function applyPassiveAssist(
  player: MatchPlayerState,
  victim: MatchPlayerState,
  time: number
): void {
  PASSIVES[player.pokemonId]?.onAssist?.({ player, victim, time });
}

/** Avanza las pasivas que dependen del reloj (auras, placas, medidores). */
export function stepPassives(
  players: readonly MatchPlayerState[],
  dt: number,
  time: number,
  host: StatusEffectHost
): void {
  if (host.isMatchOver()) return;
  for (const player of players) {
    if (!player.alive) continue;
    const passive = PASSIVES[player.pokemonId];
    passive?.onTick?.({ player, time, dt, host });
  }
}
