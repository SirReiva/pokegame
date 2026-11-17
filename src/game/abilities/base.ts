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
 * - `aoe`: área sobre el suelo centrada delante del Pokémon. Puede ser un
 *   círculo (`aoeShape: 'circle'`) o un cono (`aoeShape: 'cone'`).
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

import type {
  AoeEffect,
  AoeEvent,
  AoeMovement,
  AoePlayer,
  AoePrepareMovement
} from '../core/abilities/aoe';
import type {
  AbilityDef,
  RepeatCooldownSpec
} from '../core/abilities/def';
import type { DotSpec, MarkSpec } from '../core/abilities/specs';
import type { PokemonType } from '../core/typeChart';
import type { AnimationName } from '../types';

import type {
  AbilityShape,
  AbilitySlot,
  AoeDamageMode,
  AoeShape,
  AoeStyle,
  BeamStyle,
  BuffStat,
  DamageCategory,
  ImpactStyle,
  ProjectileStyle,
  StartupAnimationMode
} from '../core/abilities/styles';

export type {
  AoeEffect,
  AoeEvent,
  AoeMovement,
  AoePlayer,
  AoePrepareMovement
} from '../core/abilities/aoe';
export type {
  AbilityDef,
  BuffSpec,
  RepeatCooldownSpec,
  SlowSpec
} from '../core/abilities/def';
export type { PokemonType } from '../core/typeChart';
export type {
  AbilityShape,
  AbilitySlot,
  AoeDamageMode,
  AoeShape,
  AoeStyle,
  BeamStyle,
  BuffStat,
  DamageCategory,
  ImpactStyle,
  ProjectileStyle,
  StartupAnimationMode
} from '../core/abilities/styles';

export const ABILITY_SLOTS: AbilitySlot[] = ['basic', 'skill1', 'skill2', 'skill3'];

export const ABILITY_SLOT_LABEL: Record<AbilitySlot, string> = {
  basic: 'Básica',
  skill1: 'Habilidad 1',
  skill2: 'Habilidad 2',
  skill3: 'Habilidad 3'
};

export type AbilityId = string;

export const DEFAULT_ABILITY: Omit<
  AbilityDef,
  'id' | 'name' | 'type' | 'category' | 'shape'
> = {
  power: 0,
  cooldown: 1,
  repeatCooldown: null,
  range: 1.5,
  radius: 0.5,
  halfAngle: 45,
  projectileSpeed: 12,
  projectileStyle: 'orb',
  impactStyle: 'hit',
  beamStyle: 'electric',
  aoeStyle: 'ring',
  aoeShape: 'circle',
  aoeDamageMode: 'instant',
  radialDamage: false,
  radialMinDamage: 0,
  aoeDuration: 2.5,
  aoeTickInterval: 0.5,
  pierce: 0,
  hitCount: 1,
  dashDistance: 0,
  knockback: 0,
  buffs: [],
  slow: null,
  dot: null,
  marks: [],
  root: 0,
  silence: 0,
  antiHeal: null,
  healSelf: 0,
  healOnHit: false,
  selfDamage: 0,
  shield: false,
  shieldPool: 0,
  shieldDuration: 0,
  damageReduction: 0,
  shieldSpeedMultiplier: 1,
  dashBlocksOnEnemies: false,
  preserveMomentum: false,
  color: [255, 255, 255],
  startup: 0,
  active: 0,
  recovery: 0.45,
  startupAnimation: null,
  startupAnimationMode: 'once',
  startupAnimationSpeed: 1,
  animation: null,
  moveWhileStartup: false,
  blockMovementDuringCast: false,
  armorPool: 0,
  armorWindow: 'startup',
  blockMovementUntilEndAnimation: false,
  description: ''
};

/**
 * Rampa por defecto de las básicas melee: +10 % por uso consecutivo, tope
 * +50 % y reinicio tras 1,5 s sin repetirla. Cada habilidad puede declarar su
 * propia configuración si necesita otro ritmo.
 */
export const BASIC_MELEE_REPEAT_COOLDOWN: RepeatCooldownSpec = {
  step: 0.1,
  max: 0.5,
  resetAfter: 1.5
};

/** Tiempo total de ocupación del lanzador (casteo completo). */
export function abilityTotalTime(def: AbilityDef): number {
  return def.startup + def.active + def.recovery;
}

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

/**
 * Builder fluido de habilidades.
 *
 * Cada definición declara solo lo que se diferencia del valor por defecto; el
 * resto lo rellena `defineAbility`. Los métodos devuelven `this`, así que una
 * habilidad se lee de arriba abajo sin objetos anidados.
 */
type AbilitySeed = Pick<
  AbilityDef,
  'id' | 'name' | 'type' | 'category' | 'shape'
>;

export class AbilityBuilder {
  private readonly draft: AbilitySeed & Partial<AbilityDef>;
  /** Distingue una ventana de armadura explícita de la inferida. */
  private armorWindowExplicit = false;

  constructor(seed: AbilitySeed) {
    this.draft = { ...seed };
  }

  power(value: number): this {
    this.draft.power = value;
    return this;
  }

  cooldown(value: number): this {
    this.draft.cooldown = value;
    return this;
  }

  /**
   * Aumenta el cooldown al repetir la misma habilidad de forma consecutiva.
   * `step` y `max` son fracciones del cooldown base; `resetAfter` son los
   * segundos sin volver a usarla que reinician la racha.
   */
  repeatCooldown(spec: RepeatCooldownSpec): this {
    this.draft.repeatCooldown = { ...spec };
    return this;
  }

  range(value: number): this {
    this.draft.range = value;
    return this;
  }

  radius(value: number): this {
    this.draft.radius = value;
    return this;
  }

  halfAngle(value: number): this {
    this.draft.halfAngle = value;
    return this;
  }

  /** Configura un proyectil con su velocidad y su aspecto visual. */
  projectile(style: ProjectileStyle, speed: number): this {
    this.draft.projectileStyle = style;
    this.draft.projectileSpeed = speed;
    return this;
  }

  impact(style: ImpactStyle): this {
    this.draft.impactStyle = style;
    return this;
  }

  beam(style: BeamStyle): this {
    this.draft.beamStyle = style;
    return this;
  }

  /** Configura un área con su estilo, modo de daño y duración. */
  area(
    style: AoeStyle,
    mode: AoeDamageMode,
    duration: number,
    tickInterval?: number
  ): this {
    this.draft.aoeStyle = style;
    this.draft.aoeDamageMode = mode;
    this.draft.aoeDuration = duration;
    if (tickInterval !== undefined) this.draft.aoeTickInterval = tickInterval;
    return this;
  }

  /**
   * Cambia la geometría del área. `cone` usa `radius` como longitud desde el
   * centro del lanzamiento y `halfAngle` como apertura; `circle` es el valor
   * por defecto.
   */
  aoeShape(shape: AoeShape): this {
    this.draft.aoeShape = shape;
    return this;
  }

  /**
   * Define la aplicación de efectos propia del área. Sin este callback se usa
   * el comportamiento estándar (daño a rivales + `slow` + control instantáneo).
   */
  aoeEffect(effect: AoeEffect<AoePlayer, AbilityDef>): this {
    this.draft.aoeEffect = effect;
    return this;
  }

  /** Evento al empezar el lanzamiento del área. */
  onStart(event: AoeEvent<AoePlayer, AbilityDef>): this {
    this.draft.onStart = event;
    return this;
  }

  /** Evento al aparecer el área, antes del primer golpe o tick. */
  onCast(event: AoeEvent<AoePlayer, AbilityDef>): this {
    this.draft.onCast = event;
    return this;
  }

  /** Evento al terminar el área. */
  onEnd(event: AoeEvent<AoePlayer, AbilityDef>): this {
    this.draft.onEnd = event;
    return this;
  }

  /**
   * Función que recoloca el centro y la marca del área durante la preparación.
   * Se evalúa cada frame del `startup`; al disparar el efecto manda
   * `aoeMovement`.
   */
  aoePrepareMovement(movement: AoePrepareMovement<AoePlayer, AbilityDef>): this {
    this.draft.aoePrepareMovement = movement;
    return this;
  }

  /**
   * Función que mueve el centro de un área `overTime` durante su duración.
   * Recibe el tiempo transcurrido y devuelve el centro en el mundo; el daño,
   * el aro y el efecto visual siguen ese centro.
   */
  aoeMovement(movement: AoeMovement<AoePlayer, AbilityDef>): this {
    this.draft.aoeMovement = movement;
    return this;
  }

  /** Activa el daño radial con el multiplicador del borde. */
  radial(minDamage: number): this {
    this.draft.radialDamage = true;
    this.draft.radialMinDamage = minDamage;
    return this;
  }

  pierce(value: number): this {
    this.draft.pierce = value;
    return this;
  }

  dash(distance: number): this {
    this.draft.dashDistance = distance;
    return this;
  }

  /** El dash deja de atravesar enemigos: se detiene en el primero que encuentra. */
  dashBlocksOnEnemies(): this {
    this.draft.dashBlocksOnEnemies = true;
    return this;
  }

  /**
   * Escudo esférico con reducción de daño durante `duration` segundos.
   * `speedMultiplier` se aplica a la velocidad normal mientras está activo.
   */
  shield(
    duration: number,
    reduction: number,
    speedMultiplier = 0.8
  ): this {
    this.draft.shield = true;
    this.draft.shieldDuration = duration;
    this.draft.damageReduction = reduction;
    this.draft.shieldSpeedMultiplier = speedMultiplier;
    return this;
  }

  knockback(value: number): this {
    this.draft.knockback = value;
    return this;
  }

  buff(stat: BuffStat, multiplier: number, duration: number): this {
    this.draft.buffs = [
      ...(this.draft.buffs ?? []),
      { stat, multiplier, duration }
    ];
    return this;
  }

  slow(multiplier: number, duration: number): this {
    this.draft.slow = { multiplier, duration };
    return this;
  }

  /** Daño periódico aplicado a los enemigos golpeados. */
  dot(spec: DotSpec): this {
    this.draft.dot = { ...spec };
    return this;
  }

  /** Marca acumulable aplicada a los enemigos golpeados. */
  mark(spec: MarkSpec): this {
    this.draft.marks = [...(this.draft.marks ?? []), { ...spec }];
    return this;
  }

  /** Raíz aplicada a los enemigos golpeados. */
  root(seconds: number): this {
    this.draft.root = seconds;
    return this;
  }

  /** Silencio aplicado a los enemigos golpeados. */
  silence(seconds: number): this {
    this.draft.silence = seconds;
    return this;
  }

  /** Reducción de curación aplicada a los enemigos golpeados. */
  antiHeal(fraction: number, duration: number): this {
    this.draft.antiHeal = { fraction, duration };
    return this;
  }

  /** Escudo de reserva al lanzador, como fracción de sus PV máximos. */
  shieldPool(fraction: number, duration: number): this {
    this.draft.shieldPool = fraction;
    this.draft.shieldDuration = duration;
    return this;
  }

  heal(fraction: number): this {
    this.draft.healSelf = fraction;
    return this;
  }

  /** La curación de `heal` solo se aplica si la habilidad impacta. */
  healOnHit(): this {
    this.draft.healOnHit = true;
    return this;
  }

  /** Autodaño no letal como fracción de la vida máxima del lanzador. */
  selfDamage(fraction: number): this {
    this.draft.selfDamage = fraction;
    return this;
  }

  color(r: number, g: number, b: number): this {
    this.draft.color = [r, g, b];
    return this;
  }

  /** Tiempo desde el inicio del casteo hasta que ocurre el efecto. */
  startup(
    seconds: number,
    options: {
      mode?: StartupAnimationMode;
      speed?: number;
      move?: boolean;
      animation?: AnimationName;
    } = {}
  ): this {
    this.draft.startup = seconds;
    if (options.mode !== undefined) {
      this.draft.startupAnimationMode = options.mode;
    }
    if (options.speed !== undefined) {
      this.draft.startupAnimationSpeed = options.speed;
    }
    if (options.move !== undefined) this.draft.moveWhileStartup = options.move;
    if (options.animation !== undefined) {
      this.draft.startupAnimation = options.animation;
    }
    return this;
  }

  /** Ventana de daño/desplazamiento que empieza con el efecto. */
  active(seconds: number): this {
    this.draft.active = seconds;
    return this;
  }

  /** Tiempo desde el fin del efecto hasta volver a estar libre. */
  recovery(seconds: number): this {
    this.draft.recovery = seconds;
    return this;
  }

  /**
   * Bloquea el movimiento durante todo el casteo, recuperación incluida.
   * Tiene prioridad sobre `move: true` de `startup`.
   */
  blockMovementDuringCast(): this {
    this.draft.blockMovementDuringCast = true;
    return this;
  }

  /**
   * Armadura de casteo: los golpes restan su daño a un pozo de `pool` PV sin
   * mitigarlo; mientras quede armadura no cancelan la preparación ni aplican
   * hitstun o empuje. Cuando el daño acumulado agota el pozo, el casteo se
   * rompe. Por defecto cubre solo el startup; en canalizaciones cubre todo el
   * casteo. Un `force` del motor (estados, control explícito) la ignora.
   */
  armor(
    pool: number,
    options: { window?: 'startup' | 'cast' } = {}
  ): this {
    this.draft.armorPool = pool;
    if (options.window !== undefined) {
      this.draft.armorWindow = options.window;
      this.armorWindowExplicit = true;
    }
    return this;
  }

  /**
   * Bloquea el movimiento hasta que termina de reproducirse la animación de
   * lanzamiento. Después se puede mover durante la recuperación restante.
   * Tiene prioridad sobre `move: true` de `startup`.
   */
  blockMovementUntilEndAnimation(): this {
    this.draft.blockMovementUntilEndAnimation = true;
    return this;
  }

  /**
   * Lanzar la habilidad no detiene el movimiento actual. Pensado para
   * instantes que se usan en carrera, como Protección.
   */
  preserveMomentum(): this {
    this.draft.preserveMomentum = true;
    return this;
  }

  /**
   * Animación de lanzamiento. Omitirla (o pasar `null`) deja la habilidad sin
   * animación propia: el Pokémon mantiene su reposo o su caminar.
   */
  animation(name: AnimationName | null): this {
    this.draft.animation = name;
    return this;
  }

  description(text: string): this {
    this.draft.description = text;
    return this;
  }

  build(): AbilityDef {
    // Las canalizaciones no pueden esquivar: su armadura cubre todo el casteo
    // salvo que la habilidad indique otra ventana explícitamente.
    if (!this.armorWindowExplicit && this.draft.blockMovementDuringCast) {
      this.draft.armorWindow = 'cast';
    }
    return defineAbility(this.draft);
  }
}

/** Punto de entrada del builder. */
export function ability(
  id: string,
  name: string,
  type: PokemonType,
  category: DamageCategory,
  shape: AbilityShape
): AbilityBuilder {
  return new AbilityBuilder({ id, name, type, category, shape });
}

/** Construye la habilidad y la registra en el catálogo. */
export function registerAbility(builder: AbilityBuilder): AbilityDef {
  const def = builder.build();
  ABILITIES[def.id] = def;
  return def;
}
