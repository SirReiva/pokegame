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

import type { AoeEffect, AoeMovement } from './aoeEffect';
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
export type ProjectileStyle =
  | 'orb'
  | 'electric'
  | 'fire'
  | 'grass'
  | 'poison'
  | 'psychic'
  | 'water'
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
  | 'ground';

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
  | 'ice'
  | 'blizzard'
  | 'ground'
  | 'fissure'
  | 'recovery'
  | 'cyclone';

/**
 * Reparto del daño de un área:
 * - `instant`: un único golpe al completar la preparación.
 * - `overTime`: el área permanece `aoeDuration` segundos y golpea cada
 *   `aoeTickInterval` a los enemigos que sigan dentro.
 */
export type AoeDamageMode = 'instant' | 'overTime';

/**
 * Cómo se reproduce la animación de carga durante el `startup`:
 * - `once`: se reproduce una vez y se ancla su `HitFrame` al efecto.
 * - `loop`: se usa `startupAnimationSpeed` y se repite hasta el efecto.
 */
export type StartupAnimationMode = 'once' | 'loop';

export interface BuffSpec {
  stat: BuffStat;
  /** Multiplicador: 1,25 = +25 %, 0,8 = −20 %. */
  multiplier: number;
  /** Duración en segundos. */
  duration: number;
}

/** Ralentización aplicada a los enemigos alcanzados. */
export interface SlowSpec {
  /** Multiplicador de velocidad: 0,55 = 45 % más lento. */
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
  /** Aspecto visual del haz (solo para `shape: 'beam'`). */
  beamStyle: BeamStyle;
  /** Aspecto visual del área (solo para `shape: 'aoe'`). */
  aoeStyle: AoeStyle;
  /** Daño único o daño periódico mientras se permanece dentro. */
  aoeDamageMode: AoeDamageMode;
  /**
   * Daño radial para habilidades de área. Si está activo, la potencia se
   * escala linealmente desde el 100 % en el centro hasta `radialMinDamage`
   * en el borde del radio.
   */
  radialDamage: boolean;
  /**
   * Multiplicador de potencia en el borde del área: `0` = 0 %, `0.35` = 35 %.
   * El centro siempre hace el 100 %. Solo se usa si `radialDamage` es `true`.
   */
  radialMinDamage: number;
  /** Duración del área en el suelo y del daño periódico en `overTime`. */
  aoeDuration: number;
  /** Intervalo entre golpes en modo `overTime` (segundos). */
  aoeTickInterval: number;
  /**
   * Función opcional que recoloca el centro de un área `overTime` en cada
   * frame. Recibe el tiempo transcurrido y el centro original, y devuelve el
   * centro actual en coordenadas de mundo. El motor mueve con él el daño de
   * cada tick, el aro del equipo y el efecto visual. Solo se usa en `overTime`.
   */
  aoeMovement?: AoeMovement;
  /**
   * Callback opcional que decide qué efectos aplica cada golpe o tick del
   * área. Recibe todos los Pokémon vivos dentro del radio (aliados, enemigos y
   * el propio lanzador) y los aliados caídos cuyo marcador de KO está dentro,
   * y elige a quién aplica daño, hitstun, empuje, slow, buffs, curación o
   * revivir. Si se omite, se usa `defaultAoeEffect`.
   */
  aoeEffect?: AoeEffect;
  /** Nº de enemigos extra que puede atravesar un proyectil. */
  pierce: number;
  /** Distancia del dash en unidades de mundo. */
  dashDistance: number;
  /** Empuje aplicado al objetivo al impactar, en unidades de mundo. */
  knockback: number;
  /** Buffs que se aplican al lanzador al usar la habilidad. */
  buffs: BuffSpec[];
  /** Ralentización que se aplica a los enemigos golpeados. */
  slow: SlowSpec | null;
  /**
   * Curación al lanzador como fracción de su vida máxima: `0.25` = 25 %.
   * `0` desactiva la curación. Se aplica al ejecutar la habilidad salvo que
   * `healOnHit` sea `true`.
   */
  healSelf: number;
  /**
   * Si es `true`, `healSelf` no se aplica al lanzar: solo cura cuando la
   * habilidad impacta al menos en un enemigo. Lo usa `Come Sueños`.
   */
  healOnHit: boolean;
  /**
   * Autodaño al lanzador como fracción de su vida máxima: `0.35` = 35 %.
   * `0` lo desactiva. Nunca le quita la última vida: si el golpe lo dejaría a
   * 0, se queda con 1 PV.
   */
  selfDamage: number;
  /** Si es `true`, el lanzador gana un escudo esférico y reducción de daño. */
  shield: boolean;
  /** Duración del escudo en segundos. */
  shieldDuration: number;
  /** Fracción de daño reducida mientras el escudo está activo (0-1). */
  damageReduction: number;
  /** Multiplicador de velocidad normal mientras el escudo está activo. */
  shieldSpeedMultiplier: number;
  /** Si es `true`, el dash se detiene al chocar con enemigos. */
  dashBlocksOnEnemies: boolean;
  /** Color del efecto, en 0-255. */
  color: [number, number, number];
  /**
   * Tiempo desde el inicio del casteo hasta que ocurre el efecto. La
   * presentación retima el clip para que su `HitFrame` caiga exactamente aquí.
   */
  startup: number;
  /**
   * Ventana de daño o desplazamiento que empieza con el efecto. En proyectiles
   * y áreas instantáneas suele ser 0; en melee es el tiempo de compromiso del
   * golpe y en dash la duración del desplazamiento.
   */
  active: number;
  /** Tiempo desde el fin del efecto hasta que el lanzador vuelve a estar libre. */
  recovery: number;
  /**
   * Animación de carga durante el `startup`; sin ella se usa `animation`.
   * Si ambas son `null`, no se reproduce ninguna animación.
   */
  startupAnimation: AnimationName | null;
  /** Cómo se reproduce `startupAnimation`. */
  startupAnimationMode: StartupAnimationMode;
  /** Velocidad de `startupAnimation` en modo `loop` (1 = normal). */
  startupAnimationSpeed: number;
  /**
   * Animación de sprite que se reproduce al lanzar la habilidad.
   * `null` = la habilidad no reproduce ninguna animación.
   */
  animation: AnimationName | null;
  /**
   * Permite moverse durante el `startup`. El efecto sigue fijado en el centro
   * calculado al empezar el lanzamiento, así que el Pokémon puede salir de la
   * zona mientras la marca sigue en el suelo. Sin efecto si `startup` es 0.
   */
  moveWhileStartup: boolean;
  /**
   * Si es `true`, lanzar la habilidad no pone a cero la velocidad actual: el
   * Pokémon conserva su inercia y solo se ajusta al nuevo máximo. Evita el
   * frenazo de las habilidades instantáneas que se pueden usar en movimiento.
   */
  preserveMomentum: boolean;
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
  beamStyle: 'electric',
  aoeStyle: 'ring',
  aoeDamageMode: 'instant',
  radialDamage: false,
  radialMinDamage: 0,
  aoeDuration: 2.5,
  aoeTickInterval: 0.5,
  pierce: 0,
  dashDistance: 0,
  knockback: 0,
  buffs: [],
  slow: null,
  healSelf: 0,
  healOnHit: false,
  selfDamage: 0,
  shield: false,
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
  description: ''
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

  constructor(seed: AbilitySeed) {
    this.draft = { ...seed };
  }

  power(value: number): this {
    this.draft.power = value;
    return this;
  }

  accuracy(value: number): this {
    this.draft.accuracy = value;
    return this;
  }

  cooldown(value: number): this {
    this.draft.cooldown = value;
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
   * Define la aplicación de efectos propia del área. Sin este callback se usa
   * el comportamiento estándar (daño a rivales + `slow` + control instantáneo).
   */
  aoeEffect(effect: AoeEffect): this {
    this.draft.aoeEffect = effect;
    return this;
  }

  /**
   * Función que mueve el centro de un área `overTime` durante su duración.
   * Recibe el tiempo transcurrido y devuelve el centro en el mundo; el daño,
   * el aro y el efecto visual siguen ese centro.
   */
  aoeMovement(movement: AoeMovement): this {
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

/* ------------------------------------------------------------------------- */
/* Instintos comunes                                                         */
/* ------------------------------------------------------------------------- */

export type CommonAbilityId = 'proteccion' | 'impulso' | 'regeneracion';

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
    ability('proteccion', 'Protección', 'Normal', 'status', 'self')
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
    ability('impulso', 'Impulso', 'Normal', 'status', 'dash')
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
  ability('impactrueno', 'Impactrueno', 'Electric', 'special', 'projectile')
    .power(70)
    .accuracy(100)
    .cooldown(0.9)
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
  ability('ataqueRapido', 'Ataque Rápido', 'Normal', 'physical', 'dash')
    .power(60)
    .accuracy(100)
    .cooldown(4)
    .range(0)
    .radius(0.9)
    .dash(4.5)
    .knockback(0.4)
    .active(0.25).recovery(0)
    .animation('quickstrike')
    .color(232, 244, 255)
    .description('Se lanza hacia delante y golpea a los rivales del camino.')
);

registerAbility(
  ability('rayo', 'Rayo', 'Electric', 'special', 'beam')
    .power(130)
    .accuracy(100)
    .cooldown(8)
    .range(11)
    .radius(0.35)
    .impact('electric')
    .recovery(0.55)
    .startup(0.35, { mode: 'once' })
    .animation('shock')
    .color(255, 238, 88)
    .description(
      'Definitiva: haz eléctrico instantáneo de 130 de potencia en la dirección en la que mira Pikachu.'
    )
);

registerAbility(
  ability('placaje', 'Placaje', 'Normal', 'physical', 'melee')
    .power(55)
    .accuracy(100)
    .cooldown(0.25)
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
  ability('chispa', 'Chispa', 'Electric', 'physical', 'melee')
    .power(80)
    .accuracy(100)
    .cooldown(0.6)
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
  ability('rollout', 'Rollout', 'Normal', 'physical', 'dash')
    .power(100)
    .accuracy(100)
    .cooldown(6)
    .range(0)
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
  ability('ondaTrueno', 'Onda Trueno', 'Electric', 'status', 'projectile')
    .power(0)
    .accuracy(100)
    .cooldown(5)
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
  ability('explosion', 'Explosión', 'Electric', 'special', 'aoe')
    .power(200)
    .accuracy(100)
    .cooldown(18)
    .range(0)
    .radius(4.2)
    .area('explosion', 'instant', 0.85)
    .startup(0.6, { animation: 'charge' })
    .recovery(0.5)
    .animation(null)
    .impact('electric')
    .knockback(1.2)
    .selfDamage(0.35)
    .color(247, 208, 44)
    .description(
      'Definitiva: carga 0,6 s y detona un área de 4,2 u centrada en Voltorb. Se lleva el 35 % de su vida máxima, sin llegar nunca a 0.'
    )
);

/* ------------------------------------------------------------------------- */
/* Gengar                                                                    */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('lenguetazo', 'Lengüetazo', 'Ghost', 'physical', 'melee')
    .power(42)
    .accuracy(100)
    .cooldown(0.7)
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
  ability('bolaSombra', 'Bola Sombra', 'Ghost', 'special', 'projectile')
    .power(62)
    .accuracy(100)
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
  ability('bombaLodo', 'Bomba Lodo', 'Poison', 'special', 'aoe')
    .power(20)
    .accuracy(100)
    .cooldown(9)
    .range(6.5)
    .radius(2.4)
    .area('poison', 'overTime', 2.5, 0.5)
    .slow(0.75, 1.5)
    .startup(0.35, { animation: 'shoot', move: true })
    .recovery(0.5)
    .animation(null)
    .impact('poison')
    .color(150, 90, 180)
    .description(
      'Lanza una bomba de lodo a 6,5 u: deja un charco de 2,4 u durante 2,5 s que hace 20 de daño por segundo y ralentiza un 25 %.'
    )
);

registerAbility(
  ability('comeSuenos', 'Come Sueños', 'Ghost', 'special', 'beam')
    .power(80)
    .accuracy(100)
    .cooldown(11)
    .range(8)
    .radius(0.42)
    .beam('ghost')
    .impact('ghost')
    .startup(0.25, { animation: 'shoot' })
    .recovery(0.55)
    .heal(0.15)
    .healOnHit()
    .color(160, 120, 235)
    .description(
      'Definitiva: haz fantasma de 8 u y 80 de potencia que cura el 15 % de la vida máxima de Gengar si impacta en al menos un enemigo.'
    )
);

/* ------------------------------------------------------------------------- */
/* Charmander                                                                */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('aranazo', 'Arañazo', 'Normal', 'physical', 'melee')
    .power(55)
    .accuracy(100)
    .cooldown(0.3)
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
  ability('giroFuego', 'Giro Fuego', 'Fire', 'special', 'aoe')
    .power(40)
    .accuracy(85)
    .cooldown(6)
    .range(3.6)
    .radius(1.7)
    .startup(0.5, { move: true })
    .recovery(0.45)
    .area('whirl', 'overTime', 2.4, 0.4)
    .aoeMovement(({ originX, originZ, duration, elapsed }) => {
      // Espiral hacia fuera: arranca en el centro, da 1,5 vueltas y se abre
      // hasta 1,2 u. El remolino barre la zona sin dejar de cubrir el origen.
      const progress = Math.min(1, elapsed / duration);
      const angle = progress * Math.PI * 3;
      const radius = progress * 1.2;
      return {
        x: originX + Math.cos(angle) * radius,
        z: originZ + Math.sin(angle) * radius
      };
    })
    .impact('fire')
    .slow(0.8, 1.5)
    .color(255, 132, 40)
    .description(
      'Remolino de fuego en espiral: 40 de daño por segundo durante 2,4 s y ralentiza un 20 % durante 1,5 s a quien siga dentro.'
    )
);

registerAbility(
  ability('lanzallamas', 'Lanzallamas', 'Fire', 'special', 'beam')
    .power(100)
    .accuracy(100)
    .cooldown(6.5)
    .range(9.5)
    .radius(0.4)
    .startup(0.35)
    .recovery(0.5)
    .animation('charge')
    .beam('fire')
    .impact('fire')
    .color(255, 138, 42)
    .description('Chorro de fuego instantáneo que atraviesa a los rivales en línea.')
);

registerAbility(
  ability('anilloIgneo', 'Anillo Ígneo', 'Fire', 'special', 'aoe')
    .power(130)
    .accuracy(85)
    .cooldown(14)
    .range(4.2)
    .radius(3.1)
    .startup(0.75)
    .recovery(0.7)
    .animation('charge')
    .area('fire', 'instant', 0.5)
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
  ability('hojaAfilada', 'Hoja Afilada', 'Grass', 'special', 'melee')
    .power(100)
    .accuracy(100)
    .cooldown(5)
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
  ability('paralizador', 'Paralizador', 'Grass', 'status', 'melee')
    .power(0)
    .accuracy(100)
    .cooldown(7)
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
  ability('llueveHojas', 'Lluevehojas', 'Grass', 'special', 'aoe')
    .power(160)
    .accuracy(95)
    .cooldown(14)
    .range(4.2)
    .radius(3.2)
    .startup(0.75)
    .recovery(0.7)
    .animation('shake')
    .area('grass', 'instant', 1.1)
    .impact('grass')
    .color(112, 204, 72)
    .description(
      'Definitiva: torbellino bajo y ancho de hojas. Golpea una vez con 160 de potencia.'
    )
);

/* ------------------------------------------------------------------------- */
/* Squirtle                                                                  */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('acuaJet', 'Acua Jet', 'Water', 'physical', 'dash')
    .power(65)
    .accuracy(100)
    .cooldown(5)
    .range(0)
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
  ability('rayoBurbuja', 'Rayo Burbuja', 'Water', 'special', 'projectile')
    .power(80)
    .accuracy(100)
    .cooldown(3)
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
  ability('hidrobomba', 'Hidrobomba', 'Water', 'special', 'beam')
    .power(140)
    .accuracy(90)
    .cooldown(9)
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
  ability('garraMetal', 'Garra Metal', 'Steel', 'physical', 'melee')
    .power(45)
    .accuracy(100)
    .cooldown(0.5)
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
  ability('velocidadExtrema', 'Velocidad Extrema', 'Normal', 'physical', 'dash')
    .power(55)
    .accuracy(100)
    .cooldown(6)
    .range(0)
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
  ability('esferaAura', 'Esfera Aura', 'Fighting', 'special', 'projectile')
    .power(60)
    .accuracy(0)
    .cooldown(5)
    .range(10)
    .radius(0.32)
    .projectile('aura', 15)
    .impact('aura')
    .startup(0.2, { animation: 'charge' })
    .recovery(0.4)
    .animation('attack')
    .color(82, 152, 255)
    .description(
      'Proyectil de aura que nunca falla. Alcance largo y golpe único; remata a los rivales que huyen.'
    )
);

registerAbility(
  ability('combateCercano', 'Combate Cercano', 'Fighting', 'physical', 'melee')
    .power(125)
    .accuracy(100)
    .cooldown(13)
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
  ability('shurikenAgua', 'Shuriken de Agua', 'Water', 'special', 'projectile')
    .power(42)
    .accuracy(100)
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
  ability('tajoUmbro', 'Tajo Umbrío', 'Dark', 'physical', 'melee')
    .power(65)
    .accuracy(100)
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
  ability('sombraVil', 'Sombra Vil', 'Dark', 'physical', 'dash')
    .power(50)
    .accuracy(100)
    .cooldown(7)
    .range(0)
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
  ability('pulsoUmbro', 'Pulso Umbrío', 'Dark', 'special', 'beam')
    .power(85)
    .accuracy(100)
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
  ability('telequinesis', 'Telequinesis', 'Psychic', 'special', 'melee')
    .power(45)
    .accuracy(100)
    .cooldown(0.6)
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
  ability('teletransporte', 'Teletransporte', 'Psychic', 'status', 'dash')
    .power(0)
    .accuracy(0)
    .cooldown(6)
    .range(0)
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
  ability('psiquico', 'Psíquico', 'Psychic', 'special', 'beam')
    .power(80)
    .accuracy(100)
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
  ability('psicoataque', 'Psicoataque', 'Psychic', 'special', 'aoe')
    .power(100)
    .accuracy(95)
    .cooldown(15)
    .range(4.5)
    .radius(3.2)
    .startup(0.8, { animation: 'charge' })
    .recovery(0.7)
    .area('psychic', 'instant', 0.85)
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
  ability('psicogolpe', 'Golpe Psíquico', 'Psychic', 'special', 'melee')
    .power(45)
    .accuracy(100)
    .cooldown(0.3)
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
  ability('agilidad', 'Agilidad', 'Psychic', 'status', 'dash')
    .power(0)
    .accuracy(0)
    .cooldown(8)
    .range(0)
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
  ability('premonicion', 'Premonición', 'Psychic', 'special', 'aoe')
    .power(85)
    .accuracy(100)
    .cooldown(10)
    .range(6)
    .radius(2.4)
    .startup(0.9, { move: true })
    .recovery(0.55)
    .area('psychic', 'instant', 0.8)
    .radial(0.5)
    .impact('psychic')
    .slow(0.7, 2)
    .color(250, 128, 222)
    .description(
      'Marca un punto a 6 u: tras 0,9 s cae una explosión de 2,4 u que ralentiza un 30 % durante 2 s. Hace el 100 % en el centro y el 50 % en el borde.'
    )
);

registerAbility(
  ability('recuperacion', 'Recuperación', 'Psychic', 'status', 'aoe')
    .power(0)
    .accuracy(0)
    .cooldown(14)
    .range(0)
    .radius(3.5)
    .recovery(0.75)
    .startup(0.75)
    .animation('twirl')
    .heal(0.35)
    .area('recovery', 'instant', 0.75)
    .aoeEffect(({ targets, applyHeal }) => {
      // El lanzador ya se cura con `healSelf`; el área reparte el 25 % entre
      // los aliados que estén dentro del radio.
      for (const target of targets) {
        if (!target.isAlly || target.isSelf) continue;
        applyHeal(target, 0.25);
      }
    })
    .color(255, 170, 230)
    .description(
      'Se concentra 0,75 s y libera una onda curativa de 3,5 u: recupera el 35 % de su vida máxima y el 25 % de la de sus aliados en el área. Si le golpean durante la concentración, se cancela.'
    )
);

/* ------------------------------------------------------------------------- */
/* Moltres                                                                   */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('ataqueAereo', 'Ataque Aéreo', 'Flying', 'physical', 'melee')
    .power(55)
    .accuracy(0)
    .cooldown(0.55)
    .range(2.2)
    .radius(0.8)
    .halfAngle(55)
    .knockback(0.35)
    .active(0.18).recovery(0)
    .animation('strike')
    .impact('air')
    .color(255, 190, 92)
    .description(
      'Golpe alado de corto alcance que nunca falla. Ataque básico de Moltres.'
    )
);

registerAbility(
  ability('tajoAereo', 'Tajo Aéreo', 'Flying', 'special', 'projectile')
    .power(65)
    .accuracy(100)
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
  ability('ondaIgnea', 'Onda Ígnea', 'Fire', 'special', 'aoe')
    .power(60)
    .accuracy(95)
    .cooldown(8)
    .range(4.2)
    .radius(2.9)
    .area('heat', 'instant', 0.9)
    .radial(0.4)
    .slow(0.82, 1.5)
    .startup(0.3, { animation: 'shoot', move: true })
    .recovery(0.5)
    .animation(null)
    .impact('air')
    .color(255, 150, 60)
    .description(
      'Onda de aire abrasador de 2,9 u: 60 de potencia, 40 % en el borde y 18 % de ralentización durante 1,5 s.'
    )
);

registerAbility(
  ability('ataqueCeleste', 'Ataque Celeste', 'Flying', 'physical', 'aoe')
    .power(115)
    .accuracy(90)
    .cooldown(15)
    .range(6)
    .radius(3.1)
    .area('air', 'instant', 0.9)
    .radial(0.35)
    .knockback(0.9)
    .startup(0.8, { animation: 'charge' })
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
  ability('golpeAla', 'Golpe Ala', 'Flying', 'physical', 'melee')
    .power(55)
    .accuracy(100)
    .cooldown(0.55)
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
  ability('rayoHielo', 'Rayo Hielo', 'Ice', 'special', 'beam')
    .power(90)
    .accuracy(100)
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
  ability('vientoGelido', 'Viento Gélido', 'Ice', 'special', 'aoe')
    .power(55)
    .accuracy(95)
    .cooldown(8)
    .range(4.5)
    .radius(2.8)
    .area('ice', 'instant', 0.9)
    .radial(0.5)
    .slow(0.65, 2.5)
    .startup(0.3, { animation: 'shoot', move: true })
    .recovery(0.5)
    .animation(null)
    .impact('ice')
    .color(130, 210, 245)
    .description(
      'Ráfaga helada de 2,8 u: 55 de potencia, 50 % en el borde y ralentización del 35 % durante 2,5 s.'
    )
);

registerAbility(
  ability('ventisca', 'Ventisca', 'Ice', 'special', 'aoe')
    .power(100)
    .accuracy(90)
    .cooldown(15)
    .range(5.5)
    .radius(3.3)
    .area('blizzard', 'instant', 1.1)
    .radial(0.35)
    .slow(0.75, 2)
    .startup(0.75, { animation: 'charge' })
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
/* Scyther                                                                   */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('golpeFuria', 'Golpe Furia', 'Bug', 'physical', 'melee')
    .power(45)
    .accuracy(100)
    .cooldown(0.4)
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
  ability('corteAereo', 'Corte Aéreo', 'Flying', 'physical', 'dash')
    .power(60)
    .accuracy(100)
    .cooldown(6.5)
    .range(0)
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
  ability('danzaEspada', 'Danza Espada', 'Normal', 'status', 'self')
    .power(0)
    .accuracy(0)
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
  ability('tijeraX', 'Tijera X', 'Bug', 'physical', 'melee')
    .power(130)
    .accuracy(100)
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
  ability('triturar', 'Triturar', 'Dark', 'physical', 'melee')
    .power(50)
    .accuracy(100)
    .cooldown(0.85)
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
  ability('avalancha', 'Avalancha', 'Rock', 'physical', 'projectile')
    .power(55)
    .accuracy(90)
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
  ability('terremoto', 'Terremoto', 'Ground', 'physical', 'aoe')
    .power(18)
    .accuracy(100)
    .cooldown(9)
    .range(0)
    .radius(3.4)
    .area('ground', 'overTime', 2.5, 0.5)
    .startup(0.45, { animation: 'hop' })
    .recovery(0.7)
    .animation(null)
    .impact('ground')
    .color(198, 158, 92)
    .description(
      'Salta y golpea el suelo: el área de 3,4 u sigue agrietada 2,5 s y hace 18 de daño por segundo (45 en total) a quien permanezca dentro.'
    )
);

registerAbility(
  ability('rocaAfilada', 'Roca Afilada', 'Rock', 'physical', 'beam')
    .power(90)
    .accuracy(80)
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
  ability('cuchillada', 'Cuchillada', 'Normal', 'physical', 'melee')
    .power(45)
    .accuracy(100)
    .cooldown(0.6)
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
  ability('filoAbismo', 'Filo del Abismo', 'Ground', 'physical', 'aoe')
    .power(100)
    .accuracy(90)
    .cooldown(15)
    .range(4.5)
    .radius(3.2)
    .area('ground', 'instant', 0.9)
    .radial(0.35)
    .knockback(0.6)
    .startup(0.7, { animation: 'charge' })
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
  ability('atadura', 'Atadura', 'Rock', 'physical', 'melee')
    .power(65)
    .accuracy(100)
    .cooldown(0.7)
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
  ability('lanzarrocas', 'Lanzarrocas', 'Rock', 'physical', 'projectile')
    .power(85)
    .accuracy(95)
    .cooldown(4.5)
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
  ability('excavar', 'Excavar', 'Ground', 'physical', 'dash')
    .power(85)
    .accuracy(100)
    .cooldown(8)
    .range(0)
    .radius(0.95)
    .dash(5.2)
    .knockback(0.7)
    .active(0.35).recovery(0)
    .animation('attack')
    .impact('ground')
    .color(182, 161, 54)
    .description(
      'Se hunde bajo tierra y emerge 5,2 u más adelante, arrollando a los rivales del camino.'
    )
);

registerAbility(
  ability('fisura', 'Fisura', 'Ground', 'physical', 'aoe')
    .power(155)
    .accuracy(70)
    .cooldown(14)
    .range(2.5)
    .radius(3.4)
    .area('fissure', 'instant', 0.75)
    .radial(0.35)
    .knockback(0.9)
    .startup(0.6, { animation: 'charge' })
    .recovery(0.6)
    .animation(null)
    .impact('ground')
    .color(182, 161, 54)
    .description(
      'Definitiva: abre una fisura de 3,4 u a 2,5 u de distancia. Golpea una vez con 155 de potencia, el 100 % en el centro y el 35 % en el borde; 70 % de precisión.'
    )
);

/* ------------------------------------------------------------------------- */
/* Celebi                                                                    */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('hojaMagica', 'Hoja Mágica', 'Grass', 'special', 'projectile')
    .power(45)
    // 0 = nunca falla: las hojas guiadas persiguen el objetivo hasta el final.
    .accuracy(0)
    .cooldown(0.8)
    .range(8)
    .radius(0.26)
    .projectile('grass', 14)
    .impact('grass')
    .recovery(0.3)
    .animation('shoot')
    .color(143, 208, 90)
    .description(
      'Proyectil de hojas guiadas que nunca falla. 45 de potencia y 8 u de alcance. Ataque básico de Celebi.'
    )
);

registerAbility(
  ability('rayoSolar', 'Rayo Solar', 'Grass', 'special', 'beam')
    .power(85)
    .accuracy(95)
    .cooldown(8)
    .range(9.5)
    .radius(0.48)
    .startup(0.65, { animation: 'charge' })
    .recovery(0.55)
    .animation('shoot')
    .beam('grass')
    .impact('grass')
    .color(150, 224, 96)
    .description(
      'Se carga 0,65 s con la luz del sol y dispara un haz de 9,5 u que atraviesa a todos los rivales en línea. 85 de potencia.'
    )
);

registerAbility(
  ability('deseo', 'Deseo', 'Psychic', 'status', 'aoe')
    .power(0)
    .accuracy(0)
    .cooldown(13)
    .range(0)
    .radius(3.2)
    // Deseo es una concentración larga: la carga en bucle evita que el
    // personaje se quede congelado en la primera pose del twirl.
    .startup(1.2, { mode: 'loop', animation: 'charge' })
    .recovery(0.65)
    .animation('twirl')
    .area('recovery', 'instant', 0.8)
    .aoeEffect(({ fallenAllies, revive }) => {
      // La onda no cura: devuelve al combate a los aliados caídos cuyo
      // marcador de KO esté dentro del radio, con la mitad de su vida.
      for (const ally of fallenAllies) revive(ally, 0.5);
    })
    .color(156, 224, 112)
    .description(
      'Pide un deseo: se concentra 1,2 s y libera una onda de 3,2 u que revive con el 50 % de su vida máxima a los aliados caídos cuyos marcadores estén dentro del área. Si le golpean durante la concentración, se cancela.'
    )
);

registerAbility(
  ability('futuroSiniestro', 'Futuro Siniestro', 'Psychic', 'special', 'aoe')
    .power(105)
    .accuracy(95)
    .cooldown(15)
    .range(5.5)
    .radius(2.8)
    .startup(1, { animation: 'charge' })
    .recovery(0.7)
    // El área es instantánea al terminar la carga; no hay clip de lanzamiento
    // después del impacto.
    .animation(null)
    .area('psychic', 'instant', 0.9)
    .radial(0.35)
    .slow(0.65, 2)
    .impact('psychic')
    .color(190, 140, 255)
    .description(
      'Definitiva: marca un punto a 5,5 u y, tras 1 s, cae una explosión psíquica de 2,8 u. 105 de potencia, el 100 % en el centro y el 35 % en el borde, y ralentiza un 35 % durante 2 s.'
    )
);

/* ------------------------------------------------------------------------- */
/* Lugia                                                                     */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('ondaMental', 'Onda Mental', 'Psychic', 'special', 'projectile')
    .power(50)
    .accuracy(100)
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
  ability('marea', 'Marea', 'Water', 'special', 'aoe')
    .power(30)
    .accuracy(95)
    .cooldown(9)
    .range(4.5)
    .radius(3.2)
    .startup(0.35, { animation: 'charge', move: true })
    .recovery(0.5)
    .animation('shoot')
    .area('water', 'overTime', 2.5, 0.5)
    .slow(0.7, 1.2)
    .impact('water')
    .color(96, 178, 240)
    .description(
      'Extiende una marea de 3,2 u a 4,5 u de distancia que permanece 2,5 s: 30 de daño por segundo y ralentiza un 30 % durante 1,2 s a quien siga dentro.'
    )
);

registerAbility(
  ability('ciclon', 'Ciclón', 'Flying', 'special', 'aoe')
    .power(45)
    .accuracy(100)
    .cooldown(12)
    .range(0)
    .radius(3.6)
    .startup(0.3, { animation: 'charge' })
    .recovery(0.55)
    .animation('attack')
    .area('cyclone', 'instant', 1.2)
    .knockback(2.6)
    .slow(0.65, 1.5)
    .impact('air')
    .color(198, 224, 255)
    .description(
      'Golpe de ala que desata un ciclón de 3,6 u alrededor de Lugia: 45 de potencia, empuja 2,6 u y ralentiza un 35 % durante 1,5 s.'
    )
);

registerAbility(
  ability('aerochorro', 'Aerochorro', 'Flying', 'special', 'beam')
    .power(120)
    .accuracy(95)
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

/**
 * Moveset por id de Pokédex: [básica, habilidad 1, habilidad 2, habilidad 3].
 * `null` deja el hueco vacío y el HUD lo muestra como «Sin asignar».
 */
export const MOVESETS: Record<
  string,
  [AbilityId | null, AbilityId | null, AbilityId | null, AbilityId | null]
> = {};

MOVESETS['0025'] = ['placaje', 'ataqueRapido', 'impactrueno', 'rayo'];
MOVESETS['0100'] = ['chispa', 'rollout', 'ondaTrueno', 'explosion'];
MOVESETS['0094'] = ['lenguetazo', 'bolaSombra', 'bombaLodo', 'comeSuenos'];
MOVESETS['0001'] = ['placaje', 'paralizador', 'hojaAfilada', 'llueveHojas'];
MOVESETS['0004'] = ['aranazo', 'giroFuego', 'lanzallamas', 'anilloIgneo'];
MOVESETS['0007'] = ['placaje', 'acuaJet', 'rayoBurbuja', 'hidrobomba'];
MOVESETS['0448'] = [
  'garraMetal',
  'velocidadExtrema',
  'esferaAura',
  'combateCercano'
];
MOVESETS['0658'] = ['shurikenAgua', 'tajoUmbro', 'sombraVil', 'pulsoUmbro'];
MOVESETS['0144'] = ['golpeAla', 'rayoHielo', 'vientoGelido', 'ventisca'];
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
