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
 *   círculo (`aoeShape: 'circle'`), un patrón de varios círculos
 *   (`aoeCircles`) o un cono (`aoeShape: 'cone'`).
 * - `dash`: desplazamiento en la dirección en la que mira; puede dañar al paso.
 * - `self`: habilidad centrada en el lanzador (buffs, escudos, curación...).
 *
 * `power: 0` o `category: 'status'` convierten la habilidad en no dañina; los
 * `buffs` se aplican siempre al lanzador.
 *
 * Las habilidades direccionales usan el apuntado actual del Pokémon: el stick
 * derecho si está desviado o, si no, su `facing`. Al lanzar la habilidad, el
 * cuerpo gira primero hacia ese apuntado y después arranca el casteo normal.
 * Sin stick, el jugador apunta colocándose y girando con el movimiento.
 */

import type {
  AoeEvent,
  AoeMovement,
  AoePlayer,
  AoePrepareMovement
} from './core/abilities/aoe';
import type {
  AbilityBotProfile,
  AbilityDef,
  AbilityExtra,
  AbilityProps,
  AbilityResolve,
  AnyAbilityDef,
  AoeAbilityDef,
  AoeCircleSpec,
  BeamAbilityDef,
  BuffSpec,
  DashAbilityDef,
  MeleeAbilityDef,
  ProjectileAbilityDef,
  RepeatCooldownSpec,
  SelfAbilityDef
} from './core/abilities/def';
import { isChannelingCast } from './core/abilities/movement';
import type { PokemonType } from './core/typeChart';
import type { AnimationName } from './types';

import { CONFIG, DEG } from './config';
import {
  defaultAoeResolve,
  defaultBeamResolve,
  defaultDashResolve,
  defaultMeleeResolve,
  defaultProjectileResolve,
  defaultSelfResolve
} from './abilityResolve';

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
} from './core/abilities/styles';

export type {
  AoeEvent,
  AoeMovement,
  AoePlayer,
  AoePrepareMovement
} from './core/abilities/aoe';
export type {
  AbilityBotProfile,
  AbilityDef,
  AbilityExtra,
  AbilityFallenAlly,
  AbilityHitInput,
  AbilityHitOptions,
  AbilityProps,
  AbilityResolve,
  AbilityResolveContext,
  AbilityTarget,
  AnyAbilityDef,
  AoeAbilityDef,
  AoeCircleSpec,
  BeamAbilityDef,
  BuffSpec,
  DamageOverTimeSpec,
  DashAbilityDef,
  MeleeAbilityDef,
  ProjectileAbilityDef,
  RepeatCooldownSpec,
  SelfAbilityDef,
  SlowSpec
} from './core/abilities/def';
export type { HealOnHitToken } from './core/abilities/aoe';
export type { PokemonType } from './core/typeChart';
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
} from './core/abilities/styles';

export const ABILITY_SLOTS: AbilitySlot[] = ['basic', 'skill1', 'skill2', 'skill3'];

export const ABILITY_SLOT_LABEL: Record<AbilitySlot, string> = {
  basic: 'Básica',
  skill1: 'Habilidad 1',
  skill2: 'Habilidad 2',
  skill3: 'Habilidad 3'
};

export type AbilityId = string;

export const DEFAULT_PROPS: AbilityProps = {
  power: 0,
  hitstun: CONFIG.combat.hitstunSeconds,
  knockback: 0,
  slow: null,
  dot: null,
  healOnHit: false
};

/** Diferencia angular normalizada al intervalo (-π, π]. */
function shortestAngle(angle: number): number {
  return (
    (((angle + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) -
    Math.PI
  );
}

/** Grados que el cono de Fuego Sagrado puede separarse de su eje de lanzamiento. */
const SACRED_FLAME_MAX_TURN_DEG = 15;

/** Campos comunes por defecto; las factorías añaden los de cada forma. */
const BASE_DEFAULTS = {
  cooldown: 1,
  repeatCooldown: null,
  buffs: [] as BuffSpec[],
  healSelf: 0,
  selfDamage: 0,
  impactStyle: 'hit' as ImpactStyle,
  color: [255, 255, 255] as [number, number, number],
  startup: 0,
  active: 0,
  recovery: 0.45,
  startupAnimation: null as AnimationName | null,
  startupAnimationMode: 'once' as StartupAnimationMode,
  startupAnimationSpeed: 1,
  animation: null as AnimationName | null,
  moveWhileStartup: false,
  armorPool: 0,
  armorWindow: 'startup' as 'startup' | 'cast',
  preserveMomentum: false,
  description: ''
};

/** Valores propios de cada forma. */
const SHAPE_DEFAULTS: Record<AbilityShape, Record<string, unknown>> = {
  melee: { range: 1.5, radius: 0.5, halfAngle: 45 },
  projectile: {
    range: 8,
    radius: 0.5,
    projectileSpeed: 12,
    pierce: 0,
    projectileStyle: 'orb'
  },
  beam: { range: 8, radius: 0.5, beamStyle: 'electric' },
  aoe: {
    range: 4,
    radius: 2,
    halfAngle: 45,
    aoeShape: 'circle',
    aoeCircles: [] as AoeCircleSpec[],
    aoeCircleFx: 'each',
    aoeDamageMode: 'once',
    radialDamage: false,
    radialMinDamage: 0,
    aoeDuration: 2.5,
    aoeTickInterval: 0.5,
    aoeTurnRate: 0,
    aoeStyle: 'ring'
  },
  dash: { radius: 0.9, dashDistance: 0, dashBlocksOnEnemies: false },
  self: {
    radius: 1,
    shield: false,
    shieldDuration: 0,
    damageReduction: 0,
    shieldSpeedMultiplier: 1
  }
};

/**
 * Rampa por defecto de las básicas melee: +10 % por uso consecutivo, tope
 * +50 % y reinicio tras 1,5 s sin repetirla. Cada habilidad puede declarar su
 * propia configuración si necesita otro ritmo.
 */
const BASIC_MELEE_REPEAT_COOLDOWN: RepeatCooldownSpec = {
  step: 0.1,
  max: 0.5,
  resetAfter: 1.5
};

/** Tiempo total de ocupación del lanzador (casteo completo). */
export function abilityTotalTime(def: AbilityDef): number {
  return def.startup + def.active + def.recovery;
}

/**
 * Catálogo de habilidades. Se irá rellenando una a una.
 *
 * Pikachu usa Placaje como básica cuerpo a cuerpo, Ataque Rápido para entrar
 * o salir, Rayo como haz de daño y Impactrueno como proyectil de presión. Los
 * números se pueden ajustar sin tocar el motor: solo afectan a esta definición.
 */
export const ABILITIES: Record<AbilityId, AnyAbilityDef> = {};

/** Definición concreta de una forma y sus props. */
type DefFor<S extends AbilityShape, P extends AbilityProps> =
  S extends 'melee'
    ? MeleeAbilityDef<P>
    : S extends 'projectile'
      ? ProjectileAbilityDef<P>
      : S extends 'beam'
        ? BeamAbilityDef<P>
        : S extends 'aoe'
          ? AoeAbilityDef<P>
          : S extends 'dash'
            ? DashAbilityDef<P>
            : S extends 'self'
              ? SelfAbilityDef<P>
              : never;

interface MeleeFields {
  /** Alcance del arco, en unidades de mundo. */
  range(value: number): this;
  /** Radio del VFX de curación; no cambia el hitbox. */
  radius(value: number): this;
  /** Semiángulo del arco, en grados. */
  halfAngle(value: number): this;
}

interface ProjectileFields {
  /** Distancia máxima de vuelo. */
  range(value: number): this;
  /** Radio de detección y grosor visual. */
  radius(value: number): this;
  /** Aspecto y velocidad del proyectil. */
  projectile(style: ProjectileStyle, speed: number): this;
  /** Enemigos extra que puede atravesar. */
  pierce(value: number): this;
}

interface BeamFields {
  /** Longitud del haz. */
  range(value: number): this;
  /** Semiancho del haz. */
  radius(value: number): this;
  /** Aspecto visual del haz. */
  beam(style: BeamStyle): this;
}

interface AoeFields {
  /** Distancia desde el lanzador hasta el centro. */
  range(value: number): this;
  /** Radio del círculo o longitud del cono. */
  radius(value: number): this;
  /** Semiángulo del cono, en grados. */
  halfAngle(value: number): this;
  /** Configura estilo, modo de reparto y duración del área. */
  area(
    style: AoeStyle,
    mode: AoeDamageMode,
    duration: number,
    tickInterval?: number
  ): this;
  /** Geometría del área: círculo o cono. */
  aoeShape(shape: AoeShape): this;
  /**
   * Sustituye el círculo único por un patrón de círculos. Los desplazamientos
   * son relativos al centro del área y giran con la dirección del lanzamiento.
   */
  aoeCircles(circles: readonly AoeCircleSpec[]): this;
  /**
   * Elige si el patrón dibuja un efecto por círculo (`'each'`) o uno solo que
   * cubre el conjunto (`'grouped'`).
   */
  aoeCircleFx(mode: 'each' | 'grouped'): this;
  /** Activa el daño radial con el multiplicador del borde. */
  radial(minDamage: number): this;
  /** Evento al empezar el lanzamiento, antes del `startup`. */
  onStart(event: AoeEvent<AoePlayer, AnyAbilityDef>): this;
  /** Evento al aparecer el área, antes del primer golpe o tick. */
  onCast(event: AoeEvent<AoePlayer, AnyAbilityDef>): this;
  /** Evento al terminar el área. */
  onEnd(event: AoeEvent<AoePlayer, AnyAbilityDef>): this;
  /** Recoloca el centro y la marca durante el `startup`. */
  aoePrepareMovement(
    movement: AoePrepareMovement<AoePlayer, AnyAbilityDef>
  ): this;
  /** Recoloca el centro de un área con ticks en cada frame. */
  aoeMovement(movement: AoeMovement<AoePlayer, AnyAbilityDef>): this;
  /**
   * Grados por segundo con los que el cono gira hacia la dirección que devuelve
   * `aoeMovement`. `0` la aplica de golpe.
   */
  aoeTurnRate(degreesPerSecond: number): this;
}

interface DashFields {
  /** Ancho del barrido; se usa `max(0.5, radius)`. */
  radius(value: number): this;
  /** Distancia del dash, en unidades de mundo. */
  dash(distance: number): this;
  /** El dash se detiene al chocar con enemigos. */
  dashBlocksOnEnemies(): this;
}

interface SelfFields {
  /** Radio del VFX de buff o curación. */
  radius(value: number): this;
  /** Escudo esférico con reducción y multiplicador de velocidad. */
  shield(duration: number, reduction: number, speedMultiplier?: number): this;
}

type ShapeBuilderFields<S extends AbilityShape> = S extends 'melee'
  ? MeleeFields
  : S extends 'projectile'
    ? ProjectileFields
    : S extends 'beam'
      ? BeamFields
      : S extends 'aoe'
        ? AoeFields
        : S extends 'dash'
          ? DashFields
          : S extends 'self'
            ? SelfFields
            : never;

/** Métodos comunes a todas las formas. */
export interface CommonBuilder<S extends AbilityShape, P extends AbilityProps> {
  /** Potencia base del golpe. */
  power(value: number): this;
  /** Segundos de hitstun al impactar. */
  hitstun(value: number): this;
  /** Empuje al impactar, en unidades de mundo. */
  knockback(value: number): this;
  /** Ralentización aplicada a los golpeados. */
  slow(multiplier: number, duration: number): this;
  /** Daño en el tiempo aplicado a los golpeados. */
  dot(
    type: PokemonType,
    damage: number,
    duration: number,
    interval?: number
  ): this;
  /** La curación de `heal` solo se aplica si la habilidad impacta. */
  healOnHit(): this;
  /** Añade props propias de la habilidad al bloque común. */
  props<E extends Record<string, unknown>>(extra: E): AbilityBuilderFor<S, P & E>;
  /** Perfil declarativo para la IA cuando `resolve` hace algo no deducible. */
  bot(profile: AbilityBotProfile): this;
  /** Escape hatch para ajustes puntuales del motor. */
  extra(extra: AbilityExtra): this;
  /** Resolución obligatoria de la habilidad. */
  resolve(fn: AbilityResolve<AoePlayer, DefFor<S, P>>): this;
  /** Enfriamiento en segundos. */
  cooldown(value: number): this;
  /** Rampa de enfriamiento al repetir la habilidad. */
  repeatCooldown(spec: RepeatCooldownSpec): this;
  /** Aspecto visual del impacto. */
  impact(style: ImpactStyle): this;
  /** Buff aplicado al lanzador. */
  buff(stat: BuffStat, multiplier: number, duration: number): this;
  /** Curación al lanzador como fracción de su vida máxima. */
  heal(fraction: number): this;
  /** Autodaño no letal como fracción de la vida máxima. */
  selfDamage(fraction: number): this;
  /** Color del efecto, en 0-255. */
  color(r: number, g: number, b: number): this;
  /** Tiempo desde la pulsación hasta el efecto. */
  startup(
    seconds: number,
    options?: {
      mode?: StartupAnimationMode;
      speed?: number;
      move?: boolean | number;
      animation?: AnimationName;
    }
  ): this;
  /** Ventana de daño o desplazamiento que empieza con el efecto. */
  active(seconds: number): this;
  /** Tiempo desde el fin del efecto hasta volver a estar libre. */
  recovery(seconds: number): this;
  /** Movimiento durante todo el casteo. */
  movementDuringCast(value?: boolean | number): this;
  /** Armadura de casteo. */
  armor(pool: number, options?: { window?: 'startup' | 'cast' }): this;
  /** Movimiento hasta terminar la animación de lanzamiento. */
  movementUntilEndAnimation(value?: boolean | number): this;
  /** Conserva la inercia al lanzar. */
  preserveMomentum(): this;
  /** Animación de lanzamiento; `null` la desactiva. */
  animation(name: AnimationName | null): this;
  /** Texto corto para el HUD. */
  description(text: string): this;
  /** Construye la definición; solo compila si se ha declarado `resolve`. */
  build(): DefFor<S, P>;
}

/** Builder público de una forma concreta. */
export type AbilityBuilderFor<
  S extends AbilityShape,
  P extends AbilityProps = AbilityProps
> = CommonBuilder<S, P> & ShapeBuilderFields<S>;

/**
 * Implementación única de los builders. Las factorías la exponen con el tipo
 * de su forma, así que desde fuera solo se ven los métodos aplicables.
 */
class AbilityBuilder<S extends AbilityShape, P extends AbilityProps> {
  private readonly draft: Record<string, unknown>;
  /** Distingue una ventana de armadura explícita de la inferida. */
  private armorWindowExplicit = false;

  constructor(seed: {
    id: string;
    name: string;
    type: PokemonType;
    category: DamageCategory;
    shape: S;
  }) {
    this.draft = {
      ...BASE_DEFAULTS,
      ...SHAPE_DEFAULTS[seed.shape],
      ...seed,
      props: { ...DEFAULT_PROPS },
      buffs: []
    };
  }

  power(value: number): this {
    this.draftProps().power = value;
    return this;
  }

  hitstun(value: number): this {
    this.draftProps().hitstun = value;
    return this;
  }

  knockback(value: number): this {
    this.draftProps().knockback = value;
    return this;
  }

  slow(multiplier: number, duration: number): this {
    this.draftProps().slow = { multiplier, duration };
    return this;
  }

  dot(
    type: PokemonType,
    damage: number,
    duration: number,
    interval = 1
  ): this {
    this.draftProps().dot = { type, damage, duration, interval };
    return this;
  }

  healOnHit(): this {
    this.draftProps().healOnHit = true;
    return this;
  }

  props<E extends Record<string, unknown>>(
    extra: E
  ): AbilityBuilderFor<S, P & E> {
    Object.assign(this.draftProps(), extra);
    return this as unknown as AbilityBuilderFor<S, P & E>;
  }

  bot(profile: AbilityBotProfile): this {
    this.draft.bot = { ...profile };
    return this;
  }

  extra(extra: AbilityExtra): this {
    this.draft.extra = extra;
    return this;
  }

  resolve(fn: AbilityResolve<AoePlayer, DefFor<S, P>>): this {
    this.draft.resolve = fn;
    return this;
  }

  cooldown(value: number): this {
    this.draft.cooldown = value;
    return this;
  }

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

  projectile(style: ProjectileStyle, speed: number): this {
    this.draft.projectileStyle = style;
    this.draft.projectileSpeed = speed;
    return this;
  }

  pierce(value: number): this {
    this.draft.pierce = value;
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

  aoeShape(shape: AoeShape): this {
    this.draft.aoeShape = shape;
    return this;
  }

  aoeCircles(circles: readonly AoeCircleSpec[]): this {
    this.draft.aoeCircles = circles.map((circle) => ({ ...circle }));
    return this;
  }

  aoeCircleFx(mode: 'each' | 'grouped'): this {
    this.draft.aoeCircleFx = mode;
    return this;
  }

  radial(minDamage: number): this {
    this.draft.radialDamage = true;
    this.draft.radialMinDamage = minDamage;
    return this;
  }

  onStart(event: AoeEvent<AoePlayer, AnyAbilityDef>): this {
    this.draft.onStart = event;
    return this;
  }

  onCast(event: AoeEvent<AoePlayer, AnyAbilityDef>): this {
    this.draft.onCast = event;
    return this;
  }

  onEnd(event: AoeEvent<AoePlayer, AnyAbilityDef>): this {
    this.draft.onEnd = event;
    return this;
  }

  aoePrepareMovement(
    movement: AoePrepareMovement<AoePlayer, AnyAbilityDef>
  ): this {
    this.draft.aoePrepareMovement = movement;
    return this;
  }

  aoeMovement(movement: AoeMovement<AoePlayer, AnyAbilityDef>): this {
    this.draft.aoeMovement = movement;
    return this;
  }

  aoeTurnRate(degreesPerSecond: number): this {
    this.draft.aoeTurnRate = Math.max(0, degreesPerSecond);
    return this;
  }

  dash(distance: number): this {
    this.draft.dashDistance = distance;
    return this;
  }

  dashBlocksOnEnemies(): this {
    this.draft.dashBlocksOnEnemies = true;
    return this;
  }

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

  buff(stat: BuffStat, multiplier: number, duration: number): this {
    this.draft.buffs = [
      ...(this.draft.buffs as BuffSpec[]),
      { stat, multiplier, duration }
    ];
    return this;
  }

  heal(fraction: number): this {
    this.draft.healSelf = fraction;
    return this;
  }

  selfDamage(fraction: number): this {
    this.draft.selfDamage = fraction;
    return this;
  }

  color(r: number, g: number, b: number): this {
    this.draft.color = [r, g, b];
    return this;
  }

  startup(
    seconds: number,
    options: {
      mode?: StartupAnimationMode;
      speed?: number;
      move?: boolean | number;
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

  active(seconds: number): this {
    this.draft.active = seconds;
    return this;
  }

  recovery(seconds: number): this {
    this.draft.recovery = seconds;
    return this;
  }

  movementDuringCast(value: boolean | number = true): this {
    this.draft.movementDuringCast = value;
    return this;
  }

  armor(pool: number, options: { window?: 'startup' | 'cast' } = {}): this {
    this.draft.armorPool = pool;
    if (options.window !== undefined) {
      this.draft.armorWindow = options.window;
      this.armorWindowExplicit = true;
    }
    return this;
  }

  movementUntilEndAnimation(value: boolean | number = true): this {
    this.draft.movementUntilEndAnimation = value;
    return this;
  }

  preserveMomentum(): this {
    this.draft.preserveMomentum = true;
    return this;
  }

  animation(name: AnimationName | null): this {
    this.draft.animation = name;
    return this;
  }

  description(text: string): this {
    this.draft.description = text;
    return this;
  }

  build(): DefFor<S, P> {
    if (typeof this.draft.resolve !== 'function') {
      throw new Error(
        `La habilidad "${String(this.draft.id)}" no declara una resolución.`
      );
    }
    // Las canalizaciones no pueden esquivar: su armadura cubre todo el casteo
    // salvo que la habilidad indique otra ventana explícitamente.
    if (!this.armorWindowExplicit && isChannelingCast(this.draft)) {
      this.draft.armorWindow = 'cast';
    }
    return {
      ...this.draft,
      props: { ...DEFAULT_PROPS, ...this.draftProps() },
      buffs: [...(this.draft.buffs as BuffSpec[])]
    } as unknown as DefFor<S, P>;
  }

  private draftProps(): Record<string, unknown> {
    return this.draft.props as Record<string, unknown>;
  }
}

function createBuilder<S extends AbilityShape, P extends AbilityProps>(
  shape: S,
  id: string,
  name: string,
  type: PokemonType,
  category: DamageCategory,
  resolve: AbilityResolve<AoePlayer, DefFor<S, P>>
): AbilityBuilderFor<S, P> {
  const builder = new AbilityBuilder<S, P>({ id, name, type, category, shape });
  builder.resolve(resolve);
  return builder as unknown as AbilityBuilderFor<S, P>;
}

/** Básica o habilidad cuerpo a cuerpo en arco. */
export function meleeAbility<E extends Record<string, unknown> = {}>(
  id: string,
  name: string,
  type: PokemonType,
  category: DamageCategory,
  resolve: AbilityResolve<AoePlayer, MeleeAbilityDef<AbilityProps & E>>
): AbilityBuilderFor<'melee', AbilityProps & E> {
  return createBuilder('melee', id, name, type, category, resolve);
}

/** Proyectil que avanza hasta agotar su alcance. */
export function projectileAbility<E extends Record<string, unknown> = {}>(
  id: string,
  name: string,
  type: PokemonType,
  category: DamageCategory,
  resolve: AbilityResolve<AoePlayer, ProjectileAbilityDef<AbilityProps & E>>
): AbilityBuilderFor<'projectile', AbilityProps & E> {
  return createBuilder('projectile', id, name, type, category, resolve);
}

/** Haz instantáneo en línea recta. */
export function beamAbility<E extends Record<string, unknown> = {}>(
  id: string,
  name: string,
  type: PokemonType,
  category: DamageCategory,
  resolve: AbilityResolve<AoePlayer, BeamAbilityDef<AbilityProps & E>>
): AbilityBuilderFor<'beam', AbilityProps & E> {
  return createBuilder('beam', id, name, type, category, resolve);
}

/** Área en el suelo, instantánea o con ticks. */
export function aoeAbility<E extends Record<string, unknown> = {}>(
  id: string,
  name: string,
  type: PokemonType,
  category: DamageCategory,
  resolve: AbilityResolve<AoePlayer, AoeAbilityDef<AbilityProps & E>>
): AbilityBuilderFor<'aoe', AbilityProps & E> {
  return createBuilder('aoe', id, name, type, category, resolve);
}

/** Desplazamiento que puede golpear al paso. */
export function dashAbility<E extends Record<string, unknown> = {}>(
  id: string,
  name: string,
  type: PokemonType,
  category: DamageCategory,
  resolve: AbilityResolve<AoePlayer, DashAbilityDef<AbilityProps & E>>
): AbilityBuilderFor<'dash', AbilityProps & E> {
  return createBuilder('dash', id, name, type, category, resolve);
}

/** Habilidad centrada en el lanzador. */
export function selfAbility<E extends Record<string, unknown> = {}>(
  id: string,
  name: string,
  type: PokemonType,
  category: DamageCategory,
  resolve: AbilityResolve<AoePlayer, SelfAbilityDef<AbilityProps & E>>
): AbilityBuilderFor<'self', AbilityProps & E> {
  return createBuilder('self', id, name, type, category, resolve);
}

/** Construye la habilidad y la registra en el catálogo. */
export function registerAbility(builder: {
  build(): AnyAbilityDef;
}): AnyAbilityDef {
  const def = builder.build();
  ABILITIES[def.id] = def;
  return def;
}

/* ------------------------------------------------------------------------- */
/* Instintos comunes                                                         */
/* ------------------------------------------------------------------------- */

import type { CommonAbilityId } from './core/abilities/common';

export type { CommonAbilityId } from './core/abilities/common';

export const DEFAULT_COMMON_ABILITY: CommonAbilityId = 'proteccion';

/** Segundos oculto que exige Regeneración antes de empezar a curar. */
export const REGENERATION_DELAY_SECONDS = 2;

/** PV por segundo que recupera Regeneración mientras siga oculto. */
export const REGENERATION_HP_PER_SECOND = 5;

export interface CommonAbilityOption {
  id: CommonAbilityId;
  name: string;
  /** Nombre corto para el HUD. */
  short: string;
  /** `true` si no ocupa tecla y se resuelve solo. */
  passive: boolean;
  /** Cooldown para el HUD; 0 en pasivas. */
  cooldown: number;
  description: string;
}

export const COMMON_ABILITY_OPTIONS: readonly CommonAbilityOption[] = [
  {
    id: 'proteccion',
    name: 'Protección',
    short: 'Protección',
    passive: false,
    cooldown: 8,
    description:
      'Reduce un 60 % todo el daño recibido durante 2 s, ralentiza un 12 % y te impide usar otras habilidades mientras está activo. Genera un escudo esférico del color del Pokémon.'
  },
  {
    id: 'impulso',
    name: 'Impulso',
    short: 'Impulso',
    passive: false,
    cooldown: 3,
    description:
      'Dash corto de 2,2 u hacia delante. Se detiene en enemigos y separadores.'
  },
  {
    id: 'regeneracion',
    name: 'Regeneración',
    short: 'Regeneración',
    passive: true,
    cooldown: 0,
    description:
      'Tras 2 s oculto, recupera 5 PV/s mientras siga oculto. Se corta al perder HP, ser visto, atacar o usar una habilidad.'
  }
];

export function commonAbilityOption(
  id: CommonAbilityId
): CommonAbilityOption | null {
  return COMMON_ABILITY_OPTIONS.find((option) => option.id === id) ?? null;
}

export function isCommonAbilityId(value: string): value is CommonAbilityId {
  return COMMON_ABILITY_OPTIONS.some((option) => option.id === value);
}

/**
 * Habilidades comunes activas. `regeneracion` es pasiva y no tiene definición
 * de casteo; su lógica vive en el bucle de `Game`.
 */
/**
 * Overrides de animación por Pokémon. Sin entrada se usa la animación de la
 * definición; `null` desactiva la animación. Por defecto está vacío: Protección
 * no reproduce ninguna y Impulso usa `quickstrike`.
 */
export const COMMON_ANIMATION_OVERRIDES: Record<
  string,
  Partial<Record<CommonAbilityId, AnimationName | null>>
> = {};

export function commonAnimationFor(
  pokemonId: string,
  abilityId: CommonAbilityId,
  def: AbilityDef
): AnimationName | null {
  const override = COMMON_ANIMATION_OVERRIDES[pokemonId]?.[abilityId];
  return override === undefined ? def.animation : override;
}

export const COMMON_ABILITIES: Record<CommonAbilityId, AbilityDef | null> = {
  proteccion: registerAbility(
    selfAbility('proteccion', 'Protección', 'Normal', 'status', defaultSelfResolve)
      .cooldown(8)
      .radius(1)
      .recovery(0.15)
      .shield(2, 0.6, 0.88)
      .preserveMomentum()
      .animation(null)
      .color(220, 240, 255)
      .description(
        'Reduce un 60 % todo el daño recibido durante 2 s, ralentiza un 12 % y bloquea el uso de otras habilidades mientras está activo. El escudo esférico usa el color del Pokémon.'
      )
  ),
  impulso: registerAbility(
    dashAbility('impulso', 'Impulso', 'Normal', 'status', defaultDashResolve)
      .cooldown(3)
      .dash(2.2)
      .dashBlocksOnEnemies()
      .active(0.2)
      .recovery(0)
      .animation('quickstrike')
      .color(210, 235, 255)
      .description(
        'Dash corto de 2,2 u hacia delante. No hace daño y se detiene al chocar con enemigos o separadores.'
      )
  ),
  regeneracion: null
};

/* ------------------------------------------------------------------------- */
/* Pikachu                                                                   */
/* ------------------------------------------------------------------------- */

registerAbility(
  projectileAbility('impactrueno', 'Impactrueno', 'Electric', 'special', defaultProjectileResolve)
    .power(78)
    .cooldown(0.82)
    .range(8)
    .radius(0.26)
    .projectile('electric', 18)
    .impact('electric')
    .recovery(0.34)
    .startup(0.13, { mode: 'once' })
    .animation('shock')
    .color(247, 208, 44)
    .description(
      'Proyectil eléctrico muy rápido de 70 de potencia. Presión a media distancia de Pikachu.'
    )
);

registerAbility(
  dashAbility('ataqueRapido', 'Ataque Rápido', 'Normal', 'physical', defaultDashResolve)
    .power(60)
    .cooldown(4)
    .radius(0.9)
    .dash(4.5)
    .knockback(0.4)
    .active(0.25).recovery(0)
    .animation('quickstrike')
    .color(232, 244, 255)
    .description('Se lanza hacia delante y golpea a los rivales del camino.')
);

registerAbility(
  beamAbility('rayo', 'Rayo', 'Electric', 'special', defaultBeamResolve)
    .power(150)
    .cooldown(7)
    .range(11)
    .radius(0.35)
    .impact('electric')
    .recovery(0.55)
    .startup(0.35, { mode: 'once' })
    .animation('shock')
    .color(255, 238, 88)
    .description(
      'Definitiva: haz eléctrico instantáneo de 150 de potencia en la dirección en la que mira Pikachu.'
    )
);

registerAbility(
  meleeAbility('placaje', 'Placaje', 'Normal', 'physical', defaultMeleeResolve)
    .power(55)
    .cooldown(0.25)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(1.8)
    .radius(0.7)
    .halfAngle(50)
    .knockback(0.6)
    .active(0.175).recovery(0)
    .animation('attack')
    .impact('arc')
    .color(235, 228, 210)
    .description('Embestida cuerpo a cuerpo contra los rivales que tenga delante.')
);

/* ------------------------------------------------------------------------- */
/* Voltorb                                                                   */
/* ------------------------------------------------------------------------- */

registerAbility(
  meleeAbility('chispa', 'Chispa', 'Electric', 'physical', defaultMeleeResolve)
    .power(102)
    .cooldown(0.52)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2)
    .radius(0.7)
    .halfAngle(50)
    .knockback(0.25)
    .active(0.15).recovery(0)
    .animation('attack')
    .impact('electric')
    .color(247, 208, 44)
    .description(
      'Descarga eléctrica de corto alcance. Ataque básico de Voltorb.'
    )
);

registerAbility(
  dashAbility('rollout', 'Rollout', 'Normal', 'physical', defaultDashResolve)
    .power(115)
    .cooldown(4.5)
    .radius(0.95)
    .dash(5)
    .knockback(0.6)
    .active(0.3).recovery(0)
    .animation('twirl')
    .impact('electric')
    .color(247, 208, 44)
    .description(
      'Rueda 5 u hacia delante y arrolla a los rivales del camino. Entrada y escape.'
    )
);

registerAbility(
  projectileAbility('ondaTrueno', 'Onda Trueno', 'Electric', 'status', defaultProjectileResolve)
    .power(0)
    .cooldown(4)
    .range(9)
    .radius(0.3)
    .projectile('electric', 16)
    .impact('electric')
    .recovery(0.35)
    .animation('charge')
    .slow(0.55, 2.5)
    .color(247, 208, 44)
    .description(
      'Proyectil eléctrico que ralentiza un 45 % durante 2,5 s. No hace daño.'
    )
);

registerAbility(
  aoeAbility('explosion', 'Explosión', 'Electric', 'special', defaultAoeResolve)
    .power(230)
    .cooldown(13)
    .range(0)
    .radius(4.2)
    .area('explosion', 'once', 0.85)
    .startup(0.6, { animation: 'charge' })
    .armor(40)
    .recovery(0.5)
    .animation(null)
    .impact('electric')
    .knockback(1.2)
    .selfDamage(0.27)
    .color(247, 208, 44)
    .description(
      'Definitiva: carga 0,6 s y detona un área de 4,2 u centrada en Voltorb. Se lleva el 27 % de su vida máxima, sin llegar nunca a 0.'
    )
);

/* ------------------------------------------------------------------------- */
/* Gengar                                                                    */
/* ------------------------------------------------------------------------- */

registerAbility(
  meleeAbility('lenguetazo', 'Lengüetazo', 'Ghost', 'physical', defaultMeleeResolve)
    .power(42)
    .cooldown(0.7)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2)
    .radius(0.7)
    .halfAngle(50)
    .knockback(0.25)
    .active(0.16).recovery(0)
    .animation('shoot')
    .impact('ghost')
    .color(150, 110, 220)
    .description(
      'Lengüetazo fantasmal de corto alcance. Ataque básico de Gengar.'
    )
);

registerAbility(
  projectileAbility('bolaSombra', 'Bola Sombra', 'Ghost', 'special', defaultProjectileResolve)
    .power(56)
    .cooldown(6)
    .range(8.5)
    .radius(0.3)
    .projectile('ghost', 14)
    .impact('ghost')
    .recovery(0.45)
    .animation('shoot')
    .color(150, 110, 220)
    .description(
      'Proyectil de energía fantasmal. El golpe principal a distancia de Gengar.'
    )
);

registerAbility(
  aoeAbility('bombaLodo', 'Bomba Lodo', 'Poison', 'special', defaultAoeResolve)
    .power(20)
    .cooldown(9)
    .range(6.5)
    .radius(2.4)
    .area('poison', 'overtime-global', 2.5, 0.5)
    .slow(0.75, 1.5)
    .dot('Poison', 5, 3)
    .startup(0.35, { animation: 'shoot', move: true })
    .armor(20)
    .recovery(0.5)
    .animation(null)
    .impact('poison')
    .color(150, 90, 180)
    .description(
      'Lanza una bomba de lodo a 6,5 u: deja un charco de 2,4 u durante 2,5 s que hace 20 de daño por segundo, ralentiza un 25 % y envenena 3 s (5 PV/s).'
    )
);

registerAbility(
  beamAbility('comeSuenos', 'Come Sueños', 'Ghost', 'special', defaultBeamResolve)
    .power(74)
    .cooldown(11)
    .range(8)
    .radius(0.42)
    .beam('ghost')
    .impact('ghost')
    .startup(0.25, { animation: 'charge' })
    .recovery(0.55)
    .heal(0.15)
    .healOnHit()
    .color(160, 120, 235)
    .description(
      'Definitiva: haz fantasma de 8 u y 74 de potencia que cura el 15 % de la vida máxima de Gengar si impacta en al menos un enemigo.'
    )
);

/* ------------------------------------------------------------------------- */
/* Charmander                                                                */
/* ------------------------------------------------------------------------- */

registerAbility(
  meleeAbility('aranazo', 'Arañazo', 'Normal', 'physical', defaultMeleeResolve)
    .power(55)
    .cooldown(0.3)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(1.7)
    .radius(0.65)
    .halfAngle(45)
    .knockback(0.35)
    .active(0.15).recovery(0)
    .animation('strike')
    .impact('slash')
    .color(246, 236, 220)
    .description('Zarpazo rápido cuerpo a cuerpo. Ataque básico de Charmander.')
);

registerAbility(
  aoeAbility('giroFuego', 'Giro Fuego', 'Fire', 'special', defaultAoeResolve)
    .power(40)
    .cooldown(6)
    // Sin desplazamiento: el remolino nace sobre Charmander y lo acompaña.
    .range(0)
    .radius(1.7)
    .startup(0.5, { move: true })
    .armor(25)
    .recovery(0.45)
    .area('whirl', 'overtime-global', 2.4, 0.4)
    // El remolino nace pegado a Charmander y lo sigue tanto durante la
    // preparación como mientras dura el área.
    .aoePrepareMovement(({ caster }) => ({ x: caster.x, z: caster.z }))
    .aoeMovement(({ caster }) => ({ x: caster.x, z: caster.z }))
    .impact('fire')
    .slow(0.8, 1.5)
    .color(255, 132, 40)
    .description(
      'Remolino de fuego que gira alrededor de Charmander: 40 de daño por segundo durante 2,4 s y ralentiza un 20 % durante 1,5 s a quien siga dentro.'
    )
);

registerAbility(
  beamAbility('lanzallamas', 'Lanzallamas', 'Fire', 'special', defaultBeamResolve)
    .power(112)
    .cooldown(5.8)
    .range(9.5)
    .radius(0.4)
    .startup(0.35)
    .recovery(0.5)
    .animation('charge')
    .beam('fire')
    .impact('fire')
    .dot('Fire', 6, 3)
    .color(255, 138, 42)
    .description(
      'Chorro de fuego instantáneo que atraviesa a los rivales en línea y les aplica quemadura (6 PV/s durante 3 s).'
    )
);

registerAbility(
  aoeAbility('anilloIgneo', 'Anillo Ígneo', 'Fire', 'special', defaultAoeResolve)
    .power(145)
    .cooldown(12)
    .range(4.2)
    .radius(3.1)
    .startup(0.75)
    .armor(40)
    .recovery(0.7)
    .animation('charge')
    .area('fire', 'once', 0.5)
    .impact('fire')
    .color(255, 92, 30)
    .description(
      'Definitiva: explosión de fuego instantánea con un breve estallido de llamas.'
    )
);

/* ------------------------------------------------------------------------- */
/* Bulbasaur                                                                 */
/* ------------------------------------------------------------------------- */

registerAbility(
  meleeAbility('hojaAfilada', 'Hoja Afilada', 'Grass', 'special', defaultMeleeResolve)
    .power(125)
    .cooldown(3.8)
    .range(2.6)
    .radius(0.8)
    .halfAngle(50)
    .knockback(0.4)
    .active(0.225).recovery(0)
    .startup(0.3)
    .animation('charge')
    .impact('grass')
    .color(126, 214, 88)
    .description('Hoja cortante de gran alcance; empuja a quien golpea.')
);

registerAbility(
  meleeAbility('paralizador', 'Paralizador', 'Grass', 'status', defaultMeleeResolve)
    .power(0)
    .cooldown(5)
    .range(3)
    .radius(0.9)
    .halfAngle(60)
    .startup(0.2)
    .active(0.2).recovery(0)
    .animation('shoot')
    .impact('spore')
    .slow(0.55, 3)
    .color(72, 124, 54)
    .description(
      'Nube de partículas verdes que paraliza parcialmente: ralentiza un 45 % durante 3 s a los rivales que tenga delante.'
    )
);

registerAbility(
  aoeAbility('llueveHojas', 'Lluevehojas', 'Grass', 'special', defaultAoeResolve)
    .power(190)
    .cooldown(11)
    .range(4.2)
    .radius(3.2)
    .startup(0.75)
    .armor(40)
    .recovery(0.7)
    .animation('shake')
    .area('grass', 'once', 1.1)
    .impact('grass')
    .color(112, 204, 72)
    .description(
      'Definitiva: torbellino bajo y ancho de hojas. Golpea una vez con 190 de potencia.'
    )
);

/* ------------------------------------------------------------------------- */
/* Squirtle                                                                  */
/* ------------------------------------------------------------------------- */

registerAbility(
  dashAbility('acuaJet', 'Acua Jet', 'Water', 'physical', defaultDashResolve)
    .power(65)
    .cooldown(5)
    .radius(0.85)
    .dash(4.2)
    .knockback(0.3)
    .active(0.3).recovery(0)
    .animation('attack')
    .color(96, 176, 255)
    .description(
      'Se impulsa con un chorro de agua y golpea a los rivales del camino.'
    )
);

registerAbility(
  projectileAbility('rayoBurbuja', 'Rayo Burbuja', 'Water', 'special', defaultProjectileResolve)
    .power(88)
    .cooldown(2.7)
    .range(8)
    .radius(0.24)
    .projectile('water', 13)
    .impact('water')
    .recovery(0.4)
    .startup(0.2)
    .animation('shoot')
    .slow(0.7, 2)
    .color(104, 196, 255)
    .description(
      'Chorro de burbujas a presión que ralentiza un 30 % durante 2 s.'
    )
);

registerAbility(
  beamAbility('hidrobomba', 'Hidrobomba', 'Water', 'special', defaultBeamResolve)
    .power(150)
    .cooldown(8)
    .range(8.5)
    .radius(0.42)
    .beam('water')
    .impact('water')
    .startup(0.3, { animation: 'charge' })
    .recovery(0.6)
    .animation('shoot')
    .color(88, 168, 255)
    .description(
      'Definitiva: chorro de agua a presión que atraviesa la línea de tiro.'
    )
);

/* ------------------------------------------------------------------------- */
/* Lucario                                                                   */
/* ------------------------------------------------------------------------- */

registerAbility(
  meleeAbility('garraMetal', 'Garra Metal', 'Steel', 'physical', defaultMeleeResolve)
    .power(52)
    .cooldown(0.5)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2)
    .radius(0.7)
    .halfAngle(45)
    .knockback(0.25)
    .active(0.16).recovery(0)
    .animation('strike')
    .impact('steel')
    .color(176, 198, 228)
    .description(
      'Zarpazo de acero rápido y corto. Ataque básico de Lucario.'
    )
);

registerAbility(
  dashAbility('velocidadExtrema', 'Velocidad Extrema', 'Normal', 'physical', defaultDashResolve)
    .power(55)
    .cooldown(6)
    .radius(0.9)
    .dash(5.2)
    .knockback(0.6)
    .active(0.25).recovery(0)
    .animation('quickstrike')
    .impact('fighting')
    .color(214, 236, 255)
    .description(
      'Se lanza a una velocidad imposible y golpea a los rivales del camino. Entrada y escape.'
    )
);

registerAbility(
  projectileAbility('esferaAura', 'Esfera Aura', 'Fighting', 'special', defaultProjectileResolve)
    .power(68)
    .cooldown(4.3)
    .range(10)
    .radius(0.32)
    .projectile('aura', 15)
    .impact('aura')
    .startup(0.2, { animation: 'charge' })
    .recovery(0.4)
    .animation('attack')
    .color(82, 152, 255)
    .description(
      'Proyectil de aura guiado. Alcance largo y golpe único; remata a los rivales que huyen.'
    )
);

registerAbility(
  meleeAbility('combateCercano', 'Combate Cercano', 'Fighting', 'physical', defaultMeleeResolve)
    .power(138)
    .cooldown(11.5)
    .range(2.4)
    .radius(1)
    .halfAngle(65)
    .knockback(1.1)
    .startup(0.35, { animation: 'charge' })
    .active(0.325).recovery(0)
    .animation('strike')
    .impact('fighting')
    .color(96, 150, 255)
    .description(
      'Definitiva: ráfaga de golpes de aura en un cono amplio. Mucho daño y empuje, pero exige acercarse.'
    )
);

/* ------------------------------------------------------------------------- */
/* Greninja                                                                  */
/* ------------------------------------------------------------------------- */

registerAbility(
  projectileAbility('shurikenAgua', 'Shuriken de Agua', 'Water', 'special', defaultProjectileResolve)
    .power(42)
    .cooldown(0.65)
    .range(9)
    .radius(0.24)
    .projectile('shuriken', 20)
    .impact('shuriken')
    .recovery(0.3)
    .animation('shoot')
    .color(112, 196, 255)
    .description(
      'Lanza un shuriken de agua que gira en el aire. Ataque básico a media distancia de Greninja.'
    )
);

registerAbility(
  meleeAbility('tajoUmbro', 'Tajo Umbrío', 'Dark', 'physical', defaultMeleeResolve)
    .power(65)
    .cooldown(1.4)
    .range(2.1)
    .radius(0.75)
    .halfAngle(55)
    .knockback(0.35)
    .active(0.16).recovery(0)
    .animation('attack')
    .impact('dark')
    .color(154, 120, 232)
    .description(
      'Zarpazo de sombra rápido. Castiga al rival que se acerca demasiado.'
    )
);

registerAbility(
  dashAbility('sombraVil', 'Sombra Vil', 'Dark', 'physical', defaultDashResolve)
    .power(50)
    .cooldown(7)
    .radius(0.85)
    .dash(4.8)
    .knockback(0.5)
    .active(0.26).recovery(0)
    .animation('quickstrike')
    .impact('dark')
    .color(128, 100, 216)
    .description(
      'Se desliza por las sombras 4,8 u y golpea a los rivales del camino. Entrada y escape.'
    )
);

registerAbility(
  beamAbility('pulsoUmbro', 'Pulso Umbrío', 'Dark', 'special', defaultBeamResolve)
    .power(85)
    .cooldown(10)
    .range(9.5)
    .radius(0.42)
    .beam('dark')
    .impact('dark')
    .startup(0.25, { animation: 'charge' })
    .recovery(0.55)
    .animation('shoot')
    .color(124, 92, 224)
    .description(
      'Definitiva: descarga un haz de energía oscura que atraviesa la línea de tiro.'
    )
);

/* ------------------------------------------------------------------------- */
/* Mewtwo                                                                    */
/* ------------------------------------------------------------------------- */

registerAbility(
  meleeAbility('telequinesis', 'Telequinesis', 'Psychic', 'special', defaultMeleeResolve)
    .power(45)
    .cooldown(0.6)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2.5)
    .radius(0.8)
    .halfAngle(55)
    .knockback(1.4)
    .active(0.2).recovery(0)
    .startup(0.12)
    .animation('punch')
    .impact('psychic')
    .color(214, 122, 255)
    .description(
      'Onda telequinética de corto alcance que empuja con fuerza. Ataque básico de Mewtwo.'
    )
);

registerAbility(
  dashAbility('teletransporte', 'Teletransporte', 'Psychic', 'status', defaultDashResolve)
    .power(0)
    .cooldown(6)
    .radius(0.85)
    .dash(5)
    .active(0.24).recovery(0)
    .animation('quickstrike')
    .impact('psychic')
    .color(170, 104, 255)
    .description(
      'Desaparece y reaparece 5 u más adelante. Movilidad pura para entrar o salir del combate.'
    )
);

registerAbility(
  beamAbility('psiquico', 'Psíquico', 'Psychic', 'special', defaultBeamResolve)
    .power(80)
    .cooldown(7)
    .range(10)
    .radius(0.42)
    .startup(0.4, { animation: 'shoot' })
    .recovery(0.5)
    .beam('psychic')
    .impact('psychic')
    .color(226, 132, 255)
    .description(
      'Lanza psíquico instantáneo de largo alcance que atraviesa a los rivales en línea.'
    )
);

registerAbility(
  aoeAbility('psicoataque', 'Psicoataque', 'Psychic', 'special', defaultAoeResolve)
    .power(100)
    .cooldown(15)
    .range(4.5)
    .radius(3.2)
    .startup(0.8, { animation: 'charge' })
    .armor(40)
    .recovery(0.7)
    .area('psychic', 'once', 0.85)
    .radial(0.35)
    .impact('psychic')
    .color(198, 96, 255)
    .description(
      'Definitiva: implosión psíquica que golpea una vez con 100 de potencia en un área amplia. Hace el 100 % en el centro y el 35 % en el borde.'
    )
);

/* ------------------------------------------------------------------------- */
/* Mew                                                                       */
/* ------------------------------------------------------------------------- */

registerAbility(
  meleeAbility('psicogolpe', 'Golpe Psíquico', 'Psychic', 'special', defaultMeleeResolve)
    .power(45)
    .cooldown(0.3)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2.1)
    .radius(0.7)
    .halfAngle(55)
    .knockback(0.5)
    .active(0.16).recovery(0)
    .startup(0.1)
    .animation('attack')
    .impact('psychic')
    .color(255, 150, 220)
    .description(
      'Onda psíquica de corto alcance y cadencia alta. Ataque básico de Mew.'
    )
);

registerAbility(
  dashAbility('agilidad', 'Agilidad', 'Psychic', 'status', defaultDashResolve)
    .power(0)
    .cooldown(8)
    .radius(0.85)
    .dash(4.4)
    .active(0.26).recovery(0)
    .animation('quickstrike')
    .buff('speed', 1.3, 3)
    .impact('psychic')
    .color(255, 176, 232)
    .description(
      'Se impulsa 4,4 u hacia delante y gana un 30 % de velocidad durante 3 s.'
    )
);

registerAbility(
  aoeAbility('premonicion', 'Premonición', 'Psychic', 'special', defaultAoeResolve)
    .power(80)
    .cooldown(10)
    .range(6)
    .radius(2.4)
    .startup(0.9, { move: true })
    .armor(40)
    .recovery(0.55)
    .area('psychic', 'once', 0.8)
    .radial(0.5)
    .impact('psychic')
    .slow(0.7, 2)
    .color(250, 128, 222)
    .description(
      'Marca un punto a 6 u: tras 0,9 s cae una explosión de 2,4 u que ralentiza un 30 % durante 2 s. Hace el 100 % en el centro y el 50 % en el borde.'
    )
);

registerAbility(
  aoeAbility('recuperacion', 'Recuperación', 'Psychic', 'status', defaultAoeResolve)
    .bot({ healAllies: true })
    .power(0)
    .cooldown(14)
    .range(0)
    .radius(3.2)
    .recovery(0.75)
    .startup(0.75)
    .armor(40)
    .animation('twirl')
    .heal(0.27)
    .area('recovery', 'once', 0.75)
    .resolve(({ targets, applyHeal }) => {
      // El lanzador ya se cura con `healSelf`; el área reparte el 20 % entre
      // los aliados que estén dentro del radio.
      for (const target of targets) {
        if (!target.isAlly || target.isSelf) continue;
        applyHeal(target, 0.2);
      }
    })
    .color(255, 170, 230)
    .description(
      'Se concentra 0,75 s y libera una onda curativa de 3,2 u: recupera el 27 % de su vida máxima y el 20 % de la de sus aliados en el área. Si el daño acumulado agota su armadura durante la concentración, se cancela.'
    )
);

/* ------------------------------------------------------------------------- */
/* Moltres                                                                   */
/* ------------------------------------------------------------------------- */

registerAbility(
  meleeAbility('ataqueAereo', 'Ataque Aéreo', 'Flying', 'physical', defaultMeleeResolve)
    .power(55)
    .cooldown(0.55)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2.2)
    .radius(0.8)
    .halfAngle(55)
    .knockback(0.35)
    .active(0.18).recovery(0)
    .animation('strike')
    .impact('air')
    .color(255, 190, 92)
    .description(
      'Golpe alado de corto alcance. Ataque básico de Moltres.'
    )
);

registerAbility(
  projectileAbility('tajoAereo', 'Tajo Aéreo', 'Flying', 'special', defaultProjectileResolve)
    .power(65)
    .cooldown(3.5)
    .range(8.5)
    .radius(0.3)
    .projectile('air', 16)
    .impact('air')
    .recovery(0.4)
    .animation('shoot')
    .color(255, 206, 122)
    .description(
      'Abanico de viento afilado que vuela 8,5 u. El ataque a distancia fiable de Moltres.'
    )
);

registerAbility(
  aoeAbility('ondaIgnea', 'Onda Ígnea', 'Fire', 'special', defaultAoeResolve)
    .power(55)
    .cooldown(8)
    .range(4.2)
    .radius(2.9)
    .area('heat', 'once', 0.9)
    .radial(0.4)
    .slow(0.82, 1.5)
    .startup(0.3, { animation: 'shoot', move: true })
    .armor(20)
    .recovery(0.5)
    .animation(null)
    .impact('air')
    .color(255, 150, 60)
    .description(
      'Onda de aire abrasador de 2,9 u: 55 de potencia, 40 % en el borde y 18 % de ralentización durante 1,5 s.'
    )
);

registerAbility(
  aoeAbility('ataqueCeleste', 'Ataque Celeste', 'Flying', 'physical', defaultAoeResolve)
    .power(105)
    .cooldown(15)
    .range(6)
    .radius(3.1)
    .area('air', 'once', 0.9)
    .radial(0.35)
    .knockback(0.9)
    .startup(0.8, { animation: 'charge' })
    .armor(40)
    .recovery(0.6)
    .animation('strike')
    .impact('air')
    .color(255, 168, 72)
    .description(
      'Definitiva: marca un punto a 6 u y se lanza en picado tras 0,8 s. Golpea una vez en 3,1 u con el 100 % en el centro y el 35 % en el borde.'
    )
);

/* ------------------------------------------------------------------------- */
/* Articuno                                                                  */
/* ------------------------------------------------------------------------- */

registerAbility(
  meleeAbility('golpeAla', 'Golpe Ala', 'Flying', 'physical', defaultMeleeResolve)
    .power(55)
    .cooldown(0.55)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2.2)
    .radius(0.8)
    .halfAngle(55)
    .knockback(0.35)
    .active(0.18).recovery(0)
    .animation('attack')
    .impact('air')
    .color(206, 242, 255)
    .description(
      'Golpe de ala de corto alcance. Ataque básico de Articuno.'
    )
);

registerAbility(
  beamAbility('rayoHielo', 'Rayo Hielo', 'Ice', 'special', defaultBeamResolve)
    .power(82)
    .cooldown(7)
    .range(9.5)
    .radius(0.4)
    .beam('ice')
    .impact('ice')
    .startup(0.3, { animation: 'charge' })
    .recovery(0.5)
    .animation('shoot')
    .slow(0.8, 1.5)
    .color(150, 225, 255)
    .description(
      'Haz de hielo de 9,5 u y 90 de potencia que congela parcialmente: ralentiza un 20 % durante 1,5 s.'
    )
);

registerAbility(
  aoeAbility('vientoGelido', 'Viento Gélido', 'Ice', 'special', defaultAoeResolve)
    .power(55)
    .cooldown(8)
    .range(4.5)
    .radius(2.8)
    .area('ice', 'once', 0.9)
    .radial(0.5)
    .slow(0.65, 2.5)
    .startup(0.3, { animation: 'shoot', move: true })
    .armor(20)
    .recovery(0.5)
    .animation(null)
    .impact('ice')
    .color(130, 210, 245)
    .description(
      'Ráfaga helada de 2,8 u: 55 de potencia, 50 % en el borde y ralentización del 35 % durante 2,5 s.'
    )
);

registerAbility(
  aoeAbility('ventisca', 'Ventisca', 'Ice', 'special', defaultAoeResolve)
    .power(100)
    .cooldown(15)
    .range(5.5)
    .radius(3.3)
    .area('blizzard', 'once', 1.1)
    .radial(0.35)
    .slow(0.75, 2)
    .startup(0.75, { animation: 'charge' })
    .armor(40)
    .recovery(0.7)
    // El área es instantánea: la ventisca cae al terminar la carga. Sin clip
    // de lanzamiento para no reproducir el disparo cuando ya ha impactado.
    .animation(null)
    .impact('ice')
    .color(120, 200, 250)
    .description(
      'Definitiva: ventisca de 3,3 u que golpea una vez con 100 de potencia, 35 % en el borde y ralentización del 25 % durante 2 s.'
    )
);

/* ------------------------------------------------------------------------- */
/* Zapdos                                                                    */
/* ------------------------------------------------------------------------- */

registerAbility(
  meleeAbility('picoTaladro', 'Pico Taladro', 'Flying', 'physical', defaultMeleeResolve)
    .power(60)
    .cooldown(0.6)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2.2)
    .radius(0.8)
    .halfAngle(55)
    .knockback(0.4)
    .active(0.18).recovery(0)
    .animation('attack')
    .impact('air')
    .color(247, 208, 44)
    .description(
      'Picotazo giratorio de corto alcance. Ataque básico de Zapdos.'
    )
);

registerAbility(
  aoeAbility('descarga', 'Descarga', 'Electric', 'special', defaultAoeResolve)
    .power(75)
    .cooldown(8)
    .range(0)
    .radius(3.2)
    .area('explosion', 'once', 0.8)
    .radial(0.6)
    .slow(0.7, 1.5)
    .startup(0.3, { animation: 'charge', move: true })
    .armor(20)
    .recovery(0.5)
    .animation('shock')
    .impact('electric')
    .color(247, 208, 44)
    .description(
      'Descarga eléctrica de 3,2 u alrededor de Zapdos: 75 de potencia, 60 % en el borde y ralentización del 30 % durante 1,5 s.'
    )
);

registerAbility(
  aoeAbility('trueno', 'Trueno', 'Electric', 'special', defaultAoeResolve)
    .power(145)
    .cooldown(15)
    .range(6)
    .radius(3.6)
    // Rayo ramificado: tres impactos separados que no se solapan. El principal
    // cae en el punto marcado y los otros dos abren un abanico hacia delante.
    .aoeCircles([
      { offsetX: 0, offsetZ: 0, radius: 2 },
      { offsetX: 3.676, offsetZ: 2.122, radius: 2 },
      { offsetX: -3.676, offsetZ: 2.122, radius: 2 }
    ])
    .area('thunder', 'once', 0.95)
    .radial(0.4)
    .slow(0.65, 2)
    .knockback(1)
    .startup(0.85, { animation: 'charge' })
    .armor(45)
    .recovery(0.6)
    // El área cae al terminar la carga; sin clip de lanzamiento después del impacto.
    .animation(null)
    .impact('electric')
    .color(255, 238, 88)
    .description(
      'Definitiva: marca un punto a 6 u y, tras 0,85 s, cae un rayo ramificado en tres impactos separados de 2 u: el principal en el punto marcado y dos ramas en abanico hacia delante. 145 de potencia, el 100 % en el centro de cada impacto y el 40 % en su borde, empuja 1 u y ralentiza un 35 % durante 2 s.'
    )
);

/* ------------------------------------------------------------------------- */
/* Scyther                                                                   */
/* ------------------------------------------------------------------------- */

registerAbility(
  meleeAbility('golpeFuria', 'Golpe Furia', 'Bug', 'physical', defaultMeleeResolve)
    .power(45)
    .cooldown(0.4)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2.1)
    .radius(0.75)
    .halfAngle(55)
    .knockback(0.25)
    .active(0.15).recovery(0)
    .animation('attack')
    .impact('slash')
    .color(166, 185, 26)
    .description(
      'Tajo de guadaña rápido y corto. Ataque básico de Scyther.'
    )
);

registerAbility(
  dashAbility('corteAereo', 'Corte Aéreo', 'Flying', 'physical', defaultDashResolve)
    .power(60)
    .cooldown(6.5)
    .radius(0.9)
    .dash(5)
    .knockback(0.6)
    .active(0.26).recovery(0)
    .animation('attack')
    .impact('air')
    .color(196, 240, 160)
    .description(
      'Se lanza 5 u hacia delante entre el viento y corta a los rivales del camino. Entrada y escape.'
    )
);

registerAbility(
  selfAbility('danzaEspada', 'Danza Espada', 'Normal', 'status', defaultSelfResolve)
    .power(0)
    .cooldown(12)
    .radius(1.2)
    .startup(0.45, { animation: 'charge' })
    .recovery(0.6)
    .animation('charge')
    .buff('attack', 1.35, 4.5)
    .color(170, 210, 60)
    .description(
      'Danza de filos que aumenta un 35 % su ataque durante 4,5 s. Prepárala antes de entrar al combate.'
    )
);

registerAbility(
  meleeAbility('tijeraX', 'Tijera X', 'Bug', 'physical', defaultMeleeResolve)
    .power(130)
    .cooldown(14)
    .range(2.7)
    .radius(1.1)
    .halfAngle(70)
    .knockback(1.1)
    .startup(0.35, { animation: 'charge' })
    .active(0.325).recovery(0)
    .animation('attack')
    .impact('slash')
    .color(170, 200, 40)
    .description(
      'Definitiva: cruza las guadañas en un cono amplio de 2,7 u. Mucho daño y empuje, pero exige estar cerca.'
    )
);

/* ------------------------------------------------------------------------- */
/* Tyranitar                                                                 */
/* ------------------------------------------------------------------------- */

registerAbility(
  meleeAbility('triturar', 'Triturar', 'Dark', 'physical', defaultMeleeResolve)
    .power(50)
    .cooldown(0.85)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2)
    .radius(0.8)
    .halfAngle(55)
    .knockback(0.35)
    .active(0.21).recovery(0)
    .animation('attack')
    .impact('jaw')
    .color(126, 98, 166)
    .description(
      'Mordisco de mandíbula brutal. Golpe cuerpo a cuerpo lento pero muy contundente. Ataque básico de Tyranitar.'
    )
);

registerAbility(
  projectileAbility('avalancha', 'Avalancha', 'Rock', 'physical', defaultProjectileResolve)
    .power(55)
    .cooldown(5)
    .range(8.5)
    .radius(0.34)
    .projectile('rock', 14)
    .impact('rock')
    .knockback(0.45)
    .startup(0.25)
    .recovery(0.45)
    .animation('shoot')
    .color(196, 166, 104)
    .description(
      'Lanza un pedrusco de 8,5 u que estalla en esquirlas al impactar. Su ataque a distancia fiable.'
    )
);

registerAbility(
  aoeAbility('terremoto', 'Terremoto', 'Ground', 'physical', defaultAoeResolve)
    .power(18)
    .cooldown(9)
    .range(0)
    .radius(3.4)
    .area('ground', 'overtime-global', 2.5, 0.5)
    .startup(0.45, { animation: 'hop' })
    .armor(25)
    .recovery(0.7)
    .animation(null)
    .impact('ground')
    .color(198, 158, 92)
    .description(
      'Salta y golpea el suelo: el área de 3,4 u sigue agrietada 2,5 s y hace 18 de daño por segundo (45 en total) a quien permanezca dentro.'
    )
);

registerAbility(
  beamAbility('rocaAfilada', 'Roca Afilada', 'Rock', 'physical', defaultBeamResolve)
    .power(90)
    .cooldown(12)
    .range(9)
    .radius(0.5)
    .beam('rock')
    .impact('rock')
    .startup(0.5, { animation: 'charge' })
    .recovery(0.6)
    // El haz y las estalagmitas son el golpe: no hay clip de lanzamiento
    // después de la carga para no encadenar un Attack que no aporta nada.
    .animation(null)
    .color(210, 178, 118)
    .description(
      'Definitiva: una línea de estalagmitas de 9 u que brota del suelo y golpea con 90 de potencia a todos los rivales en línea.'
    )
);

/* ------------------------------------------------------------------------- */
/* Groudon                                                                   */
/* ------------------------------------------------------------------------- */

registerAbility(
  meleeAbility('cuchillada', 'Cuchillada', 'Normal', 'physical', defaultMeleeResolve)
    .power(45)
    .cooldown(0.6)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2.2)
    .radius(0.85)
    .halfAngle(55)
    .knockback(0.4)
    .active(0.2).recovery(0)
    .animation('attack')
    .impact('slash')
    .color(226, 191, 101)
    .description(
      'Zarpazo amplio de sus garras. Golpe cuerpo a cuerpo fiable. Ataque básico de Groudon.'
    )
);

registerAbility(
  aoeAbility('filoAbismo', 'Filo del Abismo', 'Ground', 'physical', defaultAoeResolve)
    .power(100)
    .cooldown(15)
    .range(4.5)
    .radius(3.2)
    .area('ground', 'once', 0.9)
    .radial(0.35)
    .knockback(0.6)
    .startup(0.7, { animation: 'charge' })
    .armor(40)
    .recovery(0.7)
    .animation(null)
    .impact('ground')
    .color(214, 170, 88)
    .description(
      'Definitiva: abre una falla de 3,2 u a 4,5 u de distancia. Golpea una vez con 100 de potencia, el 100 % en el centro y el 35 % en el borde, y empuja a los alcanzados.'
    )
);

/* ------------------------------------------------------------------------- */
/* Onix                                                                      */
/* ------------------------------------------------------------------------- */

registerAbility(
  meleeAbility('atadura', 'Atadura', 'Rock', 'physical', defaultMeleeResolve)
    .power(84)
    .cooldown(0.7)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2.8)
    .radius(0.95)
    .halfAngle(65)
    .knockback(0.55)
    .active(0.225).recovery(0)
    .animation('attack')
    .impact('rock')
    .color(182, 161, 54)
    .description(
      'Golpe de cuerpo rocoso que tritura y empuja. Ataque básico de Onix.'
    )
);

registerAbility(
  projectileAbility('lanzarrocas', 'Lanzarrocas', 'Rock', 'physical', defaultProjectileResolve)
    .power(112)
    .cooldown(3.5)
    .range(8)
    .radius(0.32)
    .projectile('rock', 13)
    .impact('rock')
    .knockback(0.3)
    .startup(0.2, { animation: 'charge' })
    .recovery(0.45)
    .animation('shoot')
    .color(182, 161, 54)
    .description(
      'Lanza una roca a 8 u para presionar a distancia. Su herramienta para no ser kited.'
    )
);

registerAbility(
  aoeAbility('excavar', 'Excavar', 'Ground', 'physical', defaultAoeResolve)
    .power(95)
    .cooldown(5.5)
    .range(0)
    .radius(1.2)
    // El aviso sigue al lanzador mientras se mueve bajo tierra: al emerger,
    // la erupción nace exactamente donde está.
    .aoePrepareMovement(({ caster }) => ({ x: caster.x, z: caster.z }))
    // Sin armadura: `onStart` ya lo hace invulnerable durante toda la carga.
    .startup(2, {  move: 1.5 })
    .recovery(0.4)
    .animation('attack')
    .area('burrow', 'once', 0.75)
    .knockback(1.2)
    .onStart(
      ({
        setCasterHidden,
        setCasterInvulnerable
      }) => {
        setCasterHidden(true);
        setCasterInvulnerable(true);
      }
    )
    .onCast(({ setCasterHidden, setCasterInvulnerable }) => {
      setCasterHidden(false);
      setCasterInvulnerable(false);
    })
    .impact('ground')
    .color(182, 161, 54)
    .description(
      'Se oculta bajo tierra durante 2 s: es invulnerable y gana un 50 % de velocidad. Al emerger, desata una erupción de 1,2 u centrada en sí mismo con 85 de potencia que empuja 1,2 u a los rivales alcanzados.'
    )
);

registerAbility(
  aoeAbility('fisura', 'Fisura', 'Ground', 'physical', defaultAoeResolve)
    .power(180)
    .cooldown(11)
    .range(2.5)
    .radius(3.4)
    .area('fissure', 'once', 0.75)
    .radial(0.35)
    .knockback(0.9)
    .startup(0.6, { animation: 'hop' })
    .armor(40)
    .recovery(0.6)
    .animation(null)
    .impact('ground')
    .color(182, 161, 54)
    .description(
      'Definitiva: abre una fisura de 3,4 u a 2,5 u de distancia. Golpea una vez con 155 de potencia, el 100 % en el centro y el 35 % en el borde.'
    )
);

/* ------------------------------------------------------------------------- */
/* Celebi                                                                    */
/* ------------------------------------------------------------------------- */

registerAbility(
  projectileAbility('hojaMagica', 'Hoja Mágica', 'Grass', 'special', defaultProjectileResolve)
    .power(52)
    // Las hojas guiadas persiguen el objetivo hasta el final.
    .cooldown(0.7)
    .range(8)
    .radius(0.26)
    .projectile('grass', 14)
    .impact('grass')
    .recovery(0.3)
    .animation('shoot')
    .color(143, 208, 90)
    .description(
      'Proyectil de hojas guiadas. 45 de potencia y 8 u de alcance. Ataque básico de Celebi.'
    )
);

registerAbility(
  beamAbility('rayoSolar', 'Rayo Solar', 'Grass', 'special', defaultBeamResolve)
    .power(105)
    .cooldown(7)
    .range(9.5)
    .radius(0.48)
    .startup(0.55, { animation: 'charge' })
    .recovery(0.55)
    .animation('shoot')
    .beam('grass')
    .impact('grass')
    .color(150, 224, 96)
    .description(
      'Se carga 0,55 s con la luz del sol y dispara un haz de 9,5 u que atraviesa a todos los rivales en línea. 105 de potencia.'
    )
);

registerAbility(
  aoeAbility('deseo', 'Deseo', 'Psychic', 'status', defaultAoeResolve)
    .bot({ revive: true })
    .power(0)
    .cooldown(11)
    .range(0)
    .radius(3.6)
    // Deseo es una concentración larga: la carga en bucle evita que el
    // personaje se quede congelado en la primera pose del twirl.
    .startup(1.05, { mode: 'loop', animation: 'charge' })
    .armor(55)
    .recovery(0.65)
    .animation('twirl')
    .area('recovery', 'once', 0.8)
    .resolve(({ fallenAllies, revive }) => {
      // La onda no cura: devuelve al combate a los aliados caídos cuyo
      // marcador de KO esté dentro del radio, con la mitad de su vida.
      for (const ally of fallenAllies) revive(ally, 0.5);
    })
    .color(156, 224, 112)
    .description(
      'Pide un deseo: se concentra 1,05 s y libera una onda de 3,6 u que revive con el 50 % de su vida máxima a los aliados caídos cuyos marcadores estén dentro del área. Si el daño acumulado agota su armadura durante la concentración, se cancela.'
    )
);

registerAbility(
  aoeAbility('futuroSiniestro', 'Futuro Siniestro', 'Psychic', 'special', defaultAoeResolve)
    .power(125)
    .cooldown(13)
    .range(5.5)
    .radius(2.8)
    .startup(0.85, { animation: 'charge' })
    .armor(50)
    .recovery(0.7)
    // El área es instantánea al terminar la carga; no hay clip de lanzamiento
    // después del impacto.
    .animation(null)
    .area('psychic', 'once', 0.9)
    .radial(0.35)
    .slow(0.65, 2)
    .impact('psychic')
    .color(190, 140, 255)
    .description(
      'Definitiva: marca un punto a 5,5 u y, tras 0,85 s, cae una explosión psíquica de 2,8 u. 125 de potencia, el 100 % en el centro y el 35 % en el borde, y ralentiza un 35 % durante 2 s.'
    )
);

/* ------------------------------------------------------------------------- */
/* Lugia                                                                     */
/* ------------------------------------------------------------------------- */

registerAbility(
  projectileAbility('ondaMental', 'Onda Mental', 'Psychic', 'special', defaultProjectileResolve)
    .power(50)
    .cooldown(0.8)
    .range(8.5)
    .radius(0.28)
    .projectile('psychic', 14)
    .impact('psychic')
    .recovery(0.35)
    .animation('shoot')
    .color(138, 169, 232)
    .description(
      'Proyectil psíquico compacto de 8,5 u. 50 de potencia y cadencia alta. Ataque básico de Lugia.'
    )
);

registerAbility(
  aoeAbility('marea', 'Marea', 'Water', 'special', defaultAoeResolve)
    .power(30)
    .cooldown(9)
    .range(4.5)
    .radius(3.2)
    .startup(0.35, { animation: 'charge', move: true })
    .armor(20)
    .recovery(0.5)
    .animation('shoot')
    .area('water', 'overtime-global', 2.5, 0.5)
    .slow(0.7, 1.2)
    .impact('water')
    .color(96, 178, 240)
    .description(
      'Extiende una marea de 3,2 u a 4,5 u de distancia que permanece 2,5 s: 30 de daño por segundo y ralentiza un 30 % durante 1,2 s a quien siga dentro.'
    )
);

registerAbility(
  aoeAbility('ciclon', 'Ciclón', 'Flying', 'special', defaultAoeResolve)
    .power(45)
    .cooldown(4)
    .aoeMovement(({ originX, originZ, dirX, dirZ, elapsed, duration }) => {
      // Avanza hacia el frente a velocidad constante (sin frenar al final)
      // mientras se balancea lateralmente en forma de senoide (dos ciclos).
      // El patrón además gira sobre su centro: los tres vórtices orbitan
      // mientras el conjunto avanza.
      const progress = Math.min(1, elapsed / duration);
      const travel = progress * 10;
      const sway = Math.sin(progress * Math.PI * 4) * 0.6;
      const base = Math.atan2(dirX, dirZ);
      const spin = base + elapsed * 2;
      return {
        x: originX + dirX * travel - dirZ * sway,
        z: originZ + dirZ * travel + dirX * sway,
        dirX: Math.sin(spin),
        dirZ: Math.cos(spin)
      };
    })
    .range(2)
    .radius(2)
    // Tres vórtices separados (sin solaparse) que giran alrededor de un ojo
    // central mientras el conjunto avanza. Cada círculo dibuja su propio
    // huracán completo.
    .aoeCircles([
      { offsetX: 0, offsetZ: 1.45, radius: 1.15 },
      { offsetX: 1.256, offsetZ: -0.725, radius: 1.15 },
      { offsetX: -1.256, offsetZ: -0.725, radius: 1.15 }
    ])
    .startup(0.3, { animation: 'charge' })
    .armor(25)
    .recovery(0.55)
    .animation('shoot')
    .area('cyclone', 'overtime-global', 2.5)
    .slow(0.65, 1.5)
    .impact('air')
    .color(198, 224, 255)
    .description(
      'Golpe de ala que desata un ciclón de tres vórtices separados que giran alrededor de un ojo central mientras el conjunto avanza 10 u hacia delante con un vaivén senoidal de 0,6 u: 45 de daño por segundo durante 2,5 s y ralentiza un 35 % durante 1,5 s a quien siga dentro.'
    )
);

registerAbility(
  beamAbility('aerochorro', 'Aerochorro', 'Flying', 'special', defaultBeamResolve)
    .power(120)
    .cooldown(16)
    .range(11)
    .radius(0.55)
    .startup(0.8, { animation: 'charge' })
    .recovery(0.65)
    .animation('shoot')
    .beam('air')
    .impact('air')
    .knockback(2.2)
    .slow(0.7, 2)
    .color(138, 169, 232)
    .description(
      'Definitiva: carga 0,8 s y dispara un chorro de aire de 11 u que atraviesa a todos los rivales en línea. 120 de potencia, empuja 2,2 u y ralentiza un 30 % durante 2 s.'
    )
);

/* ------------------------------------------------------------------------- */
/* Ho-Oh                                                                     */
/* ------------------------------------------------------------------------- */

registerAbility(
  meleeAbility('golpeAlaHoOh', 'Golpe Ala', 'Flying', 'physical', defaultMeleeResolve)
    .power(55)
    .cooldown(0.55)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2.2)
    .radius(0.8)
    .halfAngle(55)
    .knockback(0.35)
    .active(0.18).recovery(0)
    .animation('attack')
    .impact('air')
    .color(255, 196, 96)
    .description(
      'Golpe de ala dorado de corto alcance. Ataque básico de Ho-Oh.'
    )
);

registerAbility(
  dashAbility('pajaroOsado', 'Pájaro Osado', 'Flying', 'physical', defaultDashResolve)
    .power(100)
    .cooldown(6)
    .radius(1)
    .dash(6)
    .knockback(1.2)
    .active(0.35).recovery(0.35)
    .startup(0.4, { animation: 'charge' })
    .animation('attack')
    .impact('air')
    .selfDamage(0.12)
    .color(255, 176, 76)
    .description(
      'Se eleva 0,4 s y se lanza 6 u en picado: 100 de potencia, empuja 1,2 u y le cuesta el 12 % de su vida máxima. Entrada y escape.'
    )
);

registerAbility(
  aoeAbility('recuperacionHoOh', 'Recuperación', 'Fire', 'status', defaultAoeResolve)
    .bot({ healAllies: true })
    .power(0)
    .cooldown(13)
    .range(0)
    .radius(3.2)
    .startup(0.75, { animation: 'charge' })
    .armor(40)
    .recovery(0.65)
    .animation(null)
    .heal(0.3)
    .area('recovery', 'once', 0.75)
    .resolve(({ targets, applyHeal }) => {
      // Ho-Oh se cura con `healSelf`; la onda dorada reparte el 15 % restante
      // entre los aliados que estén dentro del radio.
      for (const target of targets) {
        if (!target.isAlly || target.isSelf) continue;
        applyHeal(target, 0.15);
      }
    })
    .color(255, 196, 96)
    .description(
      'Se concentra 0,75 s entre llamas doradas: recupera el 30 % de su vida máxima y el 15 % de la de sus aliados en 3,2 u. Si el daño acumulado agota su armadura durante la concentración, se cancela.'
    )
);

registerAbility(
  aoeAbility('fuegoSagrado', 'Fuego Sagrado', 'Fire', 'physical', defaultAoeResolve)
    .power(50)
    .cooldown(3)
    // El vértice nace 1 u por delante de Ho-Oh y el cono avanza 7,5 u con una
    // apertura total de 25° (12,5° a cada lado del eje de lanzamiento).
    .range(1)
    .radius(7.5)
    .halfAngle(12.5)
    .aoeShape('cone')
    .startup(0.4, { animation: 'charge' })
    .recovery(1.5)
    .movementDuringCast(0.25)
    .armor(60)
    .animation('shoot')
    .area('sacredFlame', 'overtime-global', 1.5, 0.5)
    // El vértice queda donde nació el cono, pero el eje sigue el apuntado del
    // jugador sin separarse más de 15° del lanzamiento original. Así se puede
    // barrer ligeramente la llama durante la canalización sin girar el cono
    // entero hacia atrás.
    .aoeMovement(({ caster, originX, originZ, dirX, dirZ }) => {
      const base = Math.atan2(dirX, dirZ);
      const aim = caster.aimYaw ?? caster.facing;
      if (aim === undefined) {
        return { x: originX, z: originZ };
      }
      const turn = Math.max(
        -SACRED_FLAME_MAX_TURN_DEG * DEG,
        Math.min(
          SACRED_FLAME_MAX_TURN_DEG * DEG,
          shortestAngle(aim - base)
        )
      );
      const angle = base + turn;
      return {
        x: caster.x,
        z: caster.z,
        dirX: Math.sin(angle),
        dirZ: Math.cos(angle)
      };
    })
    // El eje no salta al objetivo: gira 60°/s hacia él, así el barrido se lee
    // como un desplazamiento y se detiene suavemente en el límite de 15°.
    .aoeTurnRate(60)
    .slow(0.65, 1.5)
    .impact('fire')
    .color(255, 168, 56)
    .description(
      'Definitiva: exhala un cono de fuego sagrado de 25° desde 1 u por delante de Ho-Oh. Avanza 7,5 u y permanece 1,5 s: hace 50 de daño por segundo (75 en total) y ralentiza un 35 % durante 1,5 s a quien siga dentro. Mientras dura, el eje del cono gira progresivamente hacia tu apuntado, hasta 15° a cada lado del lanzamiento.'
    )
);

/* ------------------------------------------------------------------------- */
/* Gyarados                                                                  */
/* ------------------------------------------------------------------------- */

registerAbility(
  meleeAbility('acuaCola', 'Acua Cola', 'Water', 'physical', defaultMeleeResolve)
    .power(55)
    .cooldown(0.7)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2.5)
    .radius(0.9)
    .halfAngle(60)
    .knockback(0.55)
    .active(0.22).recovery(0)
    .animation('attack')
    .impact('water')
    .color(76, 143, 214)
    .description(
      'Barrido amplio de su cola envuelta en agua. Golpe básico de Gyarados; alcanza a varios rivales en cono y los empuja.'
    )
);

registerAbility(
  dashAbility('cascada', 'Cascada', 'Water', 'physical', defaultDashResolve)
    .power(70)
    .cooldown(5.5)
    .radius(0.9)
    .dash(4.6)
    .knockback(0.9)
    .startup(0.2, { animation: 'charge' })
    .active(0.3).recovery(0.2)
    .animation('attack')
    .impact('water')
    .color(76, 143, 214)
    .description(
      'Se enrosca y se lanza 4,6 u con una estela de agua, arrollando a quien encuentre. Su herramienta para entrar o salir.'
    )
);

registerAbility(
  meleeAbility('triturarGyarados', 'Triturar', 'Dark', 'physical', defaultMeleeResolve)
    .power(85)
    .cooldown(6)
    .range(2.2)
    .radius(0.9)
    .halfAngle(50)
    .knockback(0.8)
    .startup(0.25)
    .active(0.25).recovery(0.1)
    .animation('attack')
    .impact('jaw')
    .color(126, 98, 166)
    .description(
      'Abre sus fauces y muerde con fuerza bruta. Golpe corto pero brutal que castiga a Psíquicos y Fantasmas.'
    )
);

registerAbility(
  beamAbility('dragoaliento', 'Dragoaliento', 'Dragon', 'physical', defaultBeamResolve)
    .power(140)
    .cooldown(15)
    .range(10)
    .radius(0.55)
    .beam('psychic')
    .impact('psychic')
    .slow(0.55, 2.5)
    .startup(0.55, { animation: 'charge' })
    .armor(40)
    .recovery(0.6)
    .animation('shoot')
    .color(128, 96, 230)
    .description(
      'Definitiva: exhala un dragoaliento en línea de 10 u que atraviesa a todos los rivales. 140 de potencia y ralentiza un 45 % durante 2,5 s: su parálisis. Se carga 0,55 s con 40 de armadura.'
    )
);

/* ------------------------------------------------------------------------- */
/* Suicune                                                                   */
/* ------------------------------------------------------------------------- */

registerAbility(
  meleeAbility('golpeCuerpo', 'Golpe Cuerpo', 'Normal', 'physical', defaultMeleeResolve)
    .power(76)
    .cooldown(0.8)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2.2)
    .radius(0.9)
    .halfAngle(60)
    .knockback(0.85)
    .active(0.24).recovery(0)
    .animation('attack')
    .impact('hit')
    .color(235, 228, 210)
    .description(
      'Embestida con todo el cuerpo que aparta a los rivales: 80 de potencia y 0,85 u de empuje. Ataque básico de Suicune; exige estar cerca.'
    )
);

registerAbility(
  projectileAbility('chorroAgua', 'Chorro de Agua', 'Water', 'special', defaultProjectileResolve)
    .power(63)
    .cooldown(1.5)
    .range(8.5)
    .radius(0.22)
    .projectile('waterJet', 14)
    .impact('water')
    .recovery(0.3)
    .animation('shoot')
    .color(96, 176, 255)
    .description(
      'Dispara un chorro compacto de agua a 8,5 u con 63 de potencia. Ataque básico a distancia de Suicune.'
    )
);

registerAbility(
  aoeAbility('frioPolar', 'Frío Polar', 'Ice', 'special', defaultAoeResolve)
    .power(108)
    .cooldown(8)
    // El vértice nace 0,75 u por delante de Suicune y el cono avanza 7 u con
    // una apertura total de 60° (30° a cada lado del eje).
    .range(0.75)
    .radius(7)
    .halfAngle(30)
    .aoeShape('cone')
    .area('sheerCold', 'once', 0.5)
    .movementDuringCast(false)
    .radial(0.4)
    .slow(0.45, 2.5)
    .startup(0.85, { animation: 'charge' })
    .armor(50)
    // El cono es instantáneo al terminar la carga: sin clip de lanzamiento.
    .animation(null)
    .impact('ice')
    .color(200, 240, 255)
    .description(
      'Definitiva: canaliza el aire polar durante 1,3 s sin poder moverse (0,85 s de carga y 0,45 s de recuperación) y exhala un cono de 60° que nace 0,75 u por delante de Suicune y avanza 7 u. El golpe ocurre al terminar la carga: 108 de potencia (el 40 % en el borde) y 55 % de ralentización durante 2,5 s. La carga tiene 50 de armadura, el cono se disipa en 0,5 s y el enfriamiento es de 8 s. Si el daño agota la armadura durante la canalización, se cancela.'
    )
);

/* ------------------------------------------------------------------------- */
/* Kyogre                                                                    */
/* ------------------------------------------------------------------------- */

/**
 * Reparto de `Pulso Primigenio`: el primer pulso aporta el 37,5 % de la potencia
 * total y el resto se reparte entre los ticks siguientes. Con `.power(160)` y
 * dos ticks, son 60 + 100. Así `power` y `aoeDuration` son la única fuente de
 * verdad y el callback no puede desincronizarse de las tablas ni del HUD.
 */
const PRIMORDIAL_PULSE_FIRST_SHARE = 0.375;

registerAbility(
  projectileAbility('rafagaMarina', 'Ráfaga Marina', 'Water', 'special', defaultProjectileResolve)
    .power(38)
    .cooldown(0.85)
    .range(8.5)
    .radius(0.24)
    .projectile('waterJet', 15)
    .impact('water')
    .recovery(0.3)
    .animation('shoot')
    .color(72, 152, 235)
    .description(
      'Dispara una ráfaga de agua comprimida a 8,5 u. 46 de potencia y cadencia alta. Ataque básico de Kyogre.'
    )
);

registerAbility(
  aoeAbility('remolinoMarino', 'Remolino Marino', 'Water', 'special', defaultAoeResolve)
    .power(27)
    .cooldown(8)
    .range(5)
    .radius(3)
    .startup(0.3, { animation: 'charge', move: true })
    .armor(25)
    .recovery(0.5)
    .animation('shoot')
    .area('cyclone', 'overtime-global', 2.5, 0.5)
    .slow(0.7, 1.5)
    .impact('water')
    .color(80, 170, 255)
    .description(
      'Abre un remolino de 3 u a 5 u de distancia que gira durante 2,5 s: 27 de daño por segundo (67 en total) y ralentiza un 30 % durante 1,5 s a quien siga dentro. Su herramienta para cortar pasillos.'
    )
);

registerAbility(
  aoeAbility('aguasCurativas', 'Aguas Curativas', 'Water', 'status', defaultAoeResolve)
    .power(0)
    .cooldown(12)
    .range(0)
    .radius(3.4)
    .startup(0.7, { animation: 'charge' })
    .armor(40)
    .recovery(0.6)
    .animation(null)
    .heal(0.1)
    .area('recovery', 'once', 0.75)
    .resolve(({ targets, applyHeal }) => {
      // Kyogre se cura con `healSelf`; la marea reparte el 15 % restante
      // entre los aliados que estén dentro del radio.
      for (const target of targets) {
        if (!target.isAlly || target.isSelf) continue;
        applyHeal(target, 0.15);
      }
    })
    .color(96, 186, 255)
    .description(
      'Se concentra 0,7 s y bendice las aguas: recupera el 25 % de su vida máxima y el 15 % de la de sus aliados en 3,4 u. Si el daño acumulado agota su armadura durante la concentración, se cancela.'
    )
);

registerAbility(
  aoeAbility('pulsoPrimigenio', 'Pulso Primigenio', 'Water', 'special', defaultAoeResolve)
    // En un área `overTime` el motor lee `power` como daño por segundo: 106
    // durante 1 s son 106 totales. El callback reparte el total entre pulsos.
    .power(106)
    .cooldown(16)
    .range(5)
    .radius(3.4)
    .startup(0.8, { animation: 'charge' })
    .armor(50)
    .recovery(0.6)
    .animation(null)
    // Dos ticks: el primero cae al aparecer el área y el segundo a los 0,5 s.
    .area('primordialPulse', 'overtime-global', 1, 0.5)
    .radial(0.4)
    .impact('water')
    .color(64, 150, 240)
    .resolve(({ def, targets, tick, applyHit, applyHeal }) => {
      const first = tick === 0;
      // El motor cobra `def.props.power` por segundo en áreas `overTime`; la duración
      // da el total del lanzamiento y el número de ticks reparte el segundo
      // pulso. Con power 106 y 1 s salen 40 + 66.
      const ticks = Math.max(
        1,
        Math.ceil(def.aoeDuration / def.aoeTickInterval)
      );
      const totalPower = def.props.power * def.aoeDuration;
      const firstShare = ticks === 1 ? 1 : PRIMORDIAL_PULSE_FIRST_SHARE;
      const power = first
        ? totalPower * firstShare
        : (totalPower * (1 - firstShare)) / Math.max(1, ticks - 1);
      const knockback = first ? 0.5 : 1.1;

      for (const target of targets) {
        if (target.isAlly) {
          // La curación llega con el segundo pulso para premiar quedarse
          // dentro del área hasta el final.
          if (!first) applyHeal(target, 0.1);
          continue;
        }
        if (!target.hittable || !target.lineOfSight) continue;
        applyHit(target, {
          power: power * target.radialMultiplier,
          control: false,
          knockback,
          slow: first ? null : { multiplier: 0.65, duration: 2 }
        });
      }
    })
    .description(
      'Definitiva: marca una zona de 3,4 u a 5 u y libera dos pulsos primigenios. El primero golpea al aparecer con 60 de potencia y 0,5 u de empuje; el segundo, a los 0,5 s, golpea con 100 de potencia, empuja 1,1 u y ralentiza un 35 % durante 2 s. El daño cae al 40 % en el borde (160 en total en el centro) y el segundo pulso cura un 10 % a los aliados dentro del área, incluido Kyogre. La carga de 0,8 s tiene 50 de armadura.'
    )
);

/* ------------------------------------------------------------------------- */
/* Rayquaza                                                                  */
/* ------------------------------------------------------------------------- */

registerAbility(
  meleeAbility('garraDraco', 'Garra Dragón', 'Dragon', 'physical', defaultMeleeResolve)
    .power(50)
    .cooldown(0.7)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2.4)
    .radius(0.9)
    .halfAngle(60)
    .knockback(0.4)
    .active(0.2).recovery(0)
    .animation('attack')
    .impact('slash')
    .color(96, 200, 120)
    .description(
      'Zarpazo amplio cargado de energía dracónica. Golpe básico de Rayquaza; alcanza a varios rivales en cono.'
    )
);

registerAbility(
  dashAbility('vueloDraco', 'Vuelo Dragón', 'Flying', 'physical', defaultDashResolve)
    .power(70)
    .cooldown(6)
    .radius(0.95)
    .dash(5.5)
    .knockback(0.9)
    .startup(0.25, { animation: 'charge' })
    .active(0.3).recovery(0.25)
    .animation('attack')
    .impact('air')
    .color(96, 200, 120)
    .description(
      'Se enrosca y se lanza 5,5 u en línea recta, arrollando a quien encuentre con 70 de potencia y 0,9 u de empuje. Su herramienta para entrar o escapar.'
    )
);

registerAbility(
  beamAbility('furiaDraco', 'Furia Dragón', 'Dragon', 'special', defaultBeamResolve)
    .power(80)
    .cooldown(9)
    .range(9.5)
    .radius(0.5)
    .startup(0.55, { animation: 'charge' })
    .armor(35)
    .recovery(0.55)
    .animation('shoot')
    .beam('psychic')
    .impact('psychic')
    .slow(0.7, 1.5)
    .color(128, 96, 230)
    .description(
      'Carga 0,55 s y exhala un haz dracónico de 9,5 u que atraviesa a todos los rivales en línea. 80 de potencia y 30 % de ralentización durante 1,5 s.'
    )
);

registerAbility(
  aoeAbility('ascensoDraco', 'Ascenso Draco', 'Flying', 'physical', defaultAoeResolve)
    .power(120)
    .cooldown(16)
    .range(0)
    .radius(3.2)
    // La marca sigue a Rayquaza mientras se eleva: la onda nace donde cae.
    .aoePrepareMovement(({ caster }) => ({ x: caster.x, z: caster.z }))
    // Sin armadura: `onStart` ya lo hace invulnerable durante toda la subida.
    .startup(1, { animation: 'charge', move: true })
    .recovery(0.55)
    .animation('attack')
    .area('air', 'once', 0.9)
    .radial(0.35)
    .knockback(1.1)
    .slow(0.65, 2)
    .onStart(
      ({
        targets,
        applyBuff,
        setCasterHidden,
        setCasterInvulnerable
      }) => {
        setCasterHidden(true);
        setCasterInvulnerable(true);
        const self = targets.find((target) => target.isSelf);
        if (self) {
          applyBuff(self, { stat: 'speed', multiplier: 1.4, duration: 1 });
        }
      }
    )
    .onCast(({ setCasterHidden, setCasterInvulnerable }) => {
      setCasterHidden(false);
      setCasterInvulnerable(false);
    })
    .impact('air')
    .color(96, 200, 120)
    .description(
      'Definitiva: se eleva durante 1 s invulnerable y un 40 % más rápido, y cae en picado sobre su posición con una onda de 3,2 u. 120 de potencia, el 100 % en el centro y el 35 % en el borde, empuja 1,1 u y ralentiza un 35 % durante 2 s.'
    )
);

/* ------------------------------------------------------------------------- */
/* Básicas elementales de los starters (fase 2)                              */
/* ------------------------------------------------------------------------- */

/*
 * Estas cuatro habilidades existen como recambio de la básica Normal. No se
 * asignan en `MOVESETS` por defecto: el paquete de balance las mete en el
 * primer slot de su especie. Así no se muta el tipo de `placaje`/`aranazo`,
 * que comparten otras especies.
 */

registerAbility(
  meleeAbility('latigoCepa', 'Látigo Cepa', 'Grass', 'special', defaultMeleeResolve)
    .power(55)
    .cooldown(0.25)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2.0)
    .radius(0.7)
    .halfAngle(50)
    .knockback(0.3)
    .active(0.175)
    .recovery(0)
    .animation('attack')
    .impact('vine')
    .color(88, 190, 96)
    .description('Látigo vegetal de corto alcance. Básica de Planta de Bulbasaur.')
);

registerAbility(
  meleeAbility('ascuas', 'Ascuas', 'Fire', 'special', defaultMeleeResolve)
    .power(65)
    .cooldown(0.25)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(1.9)
    .radius(0.65)
    .halfAngle(45)
    .knockback(0.25)
    .active(0.15)
    .recovery(0)
    .animation('strike')
    .impact('fire')
    .color(246, 146, 58)
    .description('Chispa de fuego de corto alcance. Básica de Fuego de Charmander.')
);

registerAbility(
  meleeAbility('pistolaAgua', 'Pistola Agua', 'Water', 'special', defaultMeleeResolve)
    .power(65)
    .cooldown(0.25)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(1.9)
    .radius(0.65)
    .halfAngle(45)
    .knockback(0.2)
    .active(0.15)
    .recovery(0)
    .animation('strike')
    .impact('water')
    .color(104, 196, 255)
    .description('Chorro de agua de corto alcance. Básica de Agua de Squirtle.')
);

registerAbility(
  meleeAbility('chispazo', 'Chispazo', 'Electric', 'special', defaultMeleeResolve)
    .power(55)
    .cooldown(0.25)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(1.9)
    .radius(0.65)
    .halfAngle(45)
    .knockback(0.2)
    .active(0.15)
    .recovery(0)
    .animation('attack')
    .impact('electric')
    .color(247, 208, 44)
    .description('Descarga eléctrica de corto alcance. Básica Eléctrica de Pikachu.')
);

/**
 * Moveset por id de Pokédex: [básica, habilidad 1, habilidad 2, habilidad 3].
 * `null` deja el hueco vacío y el HUD lo muestra como «Sin asignar».
 */
export const MOVESETS: Record<
  string,
  [AbilityId | null, AbilityId | null, AbilityId | null, AbilityId | null]
> = {};

MOVESETS['0025'] = ['chispazo', 'ataqueRapido', 'impactrueno', 'rayo'];
MOVESETS['0100'] = ['chispa', 'rollout', 'ondaTrueno', 'explosion'];
MOVESETS['0094'] = ['lenguetazo', 'bolaSombra', 'bombaLodo', 'comeSuenos'];
MOVESETS['0001'] = ['latigoCepa', 'paralizador', 'hojaAfilada', 'llueveHojas'];
MOVESETS['0004'] = ['ascuas', 'giroFuego', 'lanzallamas', 'anilloIgneo'];
MOVESETS['0007'] = ['pistolaAgua', 'acuaJet', 'rayoBurbuja', 'hidrobomba'];
MOVESETS['0448'] = [
  'garraMetal',
  'velocidadExtrema',
  'esferaAura',
  'combateCercano'
];
MOVESETS['0658'] = ['shurikenAgua', 'tajoUmbro', 'sombraVil', 'pulsoUmbro'];
MOVESETS['0144'] = ['golpeAla', 'rayoHielo', 'vientoGelido', 'ventisca'];
MOVESETS['0145'] = ['picoTaladro', 'ondaTrueno', 'descarga', 'trueno'];
MOVESETS['0146'] = [
  'ataqueAereo',
  'tajoAereo',
  'ondaIgnea',
  'ataqueCeleste'
];
MOVESETS['0150'] = [
  'telequinesis',
  'teletransporte',
  'psiquico',
  'psicoataque'
];
MOVESETS['0151'] = [
  'psicogolpe',
  'agilidad',
  'premonicion',
  'recuperacion'
];
MOVESETS['0123'] = ['golpeFuria', 'corteAereo', 'danzaEspada', 'tijeraX'];
MOVESETS['0248'] = ['triturar', 'avalancha', 'terremoto', 'rocaAfilada'];
MOVESETS['0095'] = ['atadura', 'lanzarrocas', 'excavar', 'fisura'];
MOVESETS['0383'] = ['cuchillada', 'terremoto', 'avalancha', 'filoAbismo'];
MOVESETS['0251'] = ['hojaMagica', 'rayoSolar', 'deseo', 'futuroSiniestro'];
MOVESETS['0249'] = ['ondaMental', 'marea', 'ciclon', 'aerochorro'];
MOVESETS['0250'] = [
  'golpeAlaHoOh',
  'pajaroOsado',
  'recuperacionHoOh',
  'fuegoSagrado'
];
MOVESETS['0130'] = ['acuaCola', 'cascada', 'triturarGyarados', 'dragoaliento'];
MOVESETS['0245'] = ['golpeCuerpo', 'chorroAgua', 'rayoHielo', 'frioPolar'];
MOVESETS['0382'] = ['rafagaMarina', 'remolinoMarino', 'aguasCurativas', 'pulsoPrimigenio'];
MOVESETS['0384'] = ['garraDraco', 'vueloDraco', 'furiaDraco', 'ascensoDraco'];

export function abilityForSlot(
  pokemonId: string,
  slotIndex: number
): AbilityDef | null {
  const moveset = MOVESETS[pokemonId];
  const id = moveset?.[slotIndex] ?? null;
  return id ? (ABILITIES[id] ?? null) : null;
}

/**
 * ¿El Pokémon tiene al menos una habilidad realmente definida en su moveset?
 * Los que todavía no tienen movimientos asignados no se pueden elegir en el
 * carrusel del roster.
 */
export function hasAssignedAbilities(pokemonId: string): boolean {
  const moveset = MOVESETS[pokemonId];
  if (!moveset) return false;
  return moveset.some((id) => id !== null && ABILITIES[id] !== undefined);
}
