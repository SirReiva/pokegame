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
export type ProjectileStyle =
  | 'orb'
  | 'electric'
  | 'fire'
  | 'grass'
  | 'poison'
  | 'psychic'
  | 'water'
  | 'aura';

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
  | 'fighting';

/** Aspecto visual de un haz. */
export type BeamStyle = 'electric' | 'fire' | 'psychic' | 'water';

/** Aspecto visual de un área. */
export type AoeStyle =
  | 'ring'
  | 'fire'
  | 'whirl'
  | 'grass'
  | 'poison'
  | 'psychic'
  | 'water';

/**
 * Reparto del daño de un área:
 * - `instant`: un único golpe al completar la preparación.
 * - `overTime`: el área permanece `aoeDuration` segundos y golpea cada
 *   `aoeTickInterval` a los enemigos que sigan dentro.
 */
export type AoeDamageMode = 'instant' | 'overTime';

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
   * `0` desactiva la curación. Se aplica al ejecutar la habilidad.
   */
  healSelf: number;
  /** Color del efecto, en 0-255. */
  color: [number, number, number];
  /** Duración de la animación de ataque, en segundos. */
  castTime: number;
  /**
   * Duración real del clip de lanzamiento, en segundos. En las melee coincide
   * siempre con `moveLock`; en el resto vale `castTime` por defecto.
   */
  animationTime: number;
  /**
   * Tiempo durante el que el lanzador no puede moverse con el input, en
   * segundos. Las habilidades melee lo igualan a la mitad de `castTime` por
   * defecto.
   */
  moveLock: number;
  /** Preparación antes de ejecutar el efecto, en segundos. */
  windup: number;
  /**
   * Animación distinta para la preparación; sin ella se repite `animation`.
   * Si ambas son `null`, no se reproduce ninguna animación.
   */
  windupAnimation: AnimationName | null;
  /** Modo de la animación durante la preparación. */
  windupAnimationMode: WindupAnimationMode;
  /** Velocidad de la animación de preparación en modo `loop` (1 = normal). */
  windupAnimationSpeed: number;
  /**
   * Animación de sprite que se reproduce al lanzar la habilidad.
   * `null` = la habilidad no reproduce ninguna animación.
   */
  animation: AnimationName | null;
  /**
   * Permite moverse durante el `windup`. El efecto sigue fijado en el centro
   * calculado al empezar el lanzamiento, así que el Pokémon puede salir de la
   * zona mientras la marca sigue en el suelo. Sin efecto si `windup` es 0.
   */
  moveWhileWindup: boolean;
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
  color: [255, 255, 255],
  castTime: 0.45,
  animationTime: 0.45,
  moveLock: 0,
  windup: 0,
  windupAnimation: null,
  windupAnimationMode: 'once',
  windupAnimationSpeed: 1,
  animation: null,
  moveWhileWindup: false,
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
  const ability = { ...DEFAULT_ABILITY, ...def };
  if (ability.shape === 'melee') {
    // Las melee bloquean el movimiento durante su animación y el clip dura
    // exactamente ese mismo tiempo (la mitad del castTime por defecto).
    if (def.moveLock === undefined) ability.moveLock = ability.castTime * 0.5;
    ability.animationTime = ability.moveLock;
  } else if (def.animationTime === undefined) {
    ability.animationTime = ability.castTime;
  }
  return ability;
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

  color(r: number, g: number, b: number): this {
    this.draft.color = [r, g, b];
    return this;
  }

  cast(seconds: number): this {
    this.draft.castTime = seconds;
    return this;
  }

  /** Bloquea el movimiento del lanzador durante `seconds` al usar la habilidad. */
  moveLock(seconds: number): this {
    this.draft.moveLock = seconds;
    return this;
  }

  windup(
    seconds: number,
    options: {
      mode?: WindupAnimationMode;
      speed?: number;
      move?: boolean;
      animation?: AnimationName;
    } = {}
  ): this {
    this.draft.windup = seconds;
    if (options.mode !== undefined) {
      this.draft.windupAnimationMode = options.mode;
    }
    if (options.speed !== undefined) {
      this.draft.windupAnimationSpeed = options.speed;
    }
    if (options.move !== undefined) this.draft.moveWhileWindup = options.move;
    if (options.animation !== undefined) {
      this.draft.windupAnimation = options.animation;
    }
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
/* Pikachu                                                                   */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('impactrueno', 'Impactrueno', 'Electric', 'special', 'projectile')
    .power(40)
    .accuracy(100)
    .cooldown(0.9)
    .range(8)
    .radius(0.26)
    .projectile('electric', 14)
    .impact('electric')
    .cast(0.34)
    .windup(0.22, { mode: 'once' })
    .animation('shock')
    .color(247, 208, 44)
    .description('Proyectil eléctrico rápido. Ataque básico de Pikachu.')
);

registerAbility(
  ability('ataqueRapido', 'Ataque Rápido', 'Normal', 'physical', 'dash')
    .power(40)
    .accuracy(100)
    .cooldown(4)
    .range(0)
    .radius(0.9)
    .dash(4.5)
    .knockback(0.4)
    .cast(0.25)
    .animation('quickstrike')
    .color(232, 244, 255)
    .description('Se lanza hacia delante y golpea a los rivales del camino.')
);

registerAbility(
  ability('rayo', 'Rayo', 'Electric', 'special', 'beam')
    .power(90)
    .accuracy(100)
    .cooldown(8)
    .range(11)
    .radius(0.35)
    .impact('electric')
    .cast(0.55)
    .windup(0.5, { mode: 'once' })
    .animation('shock')
    .color(255, 238, 88)
    .description(
      'Haz eléctrico instantáneo en la dirección en la que mira Pikachu.'
    )
);

registerAbility(
  ability('placaje', 'Placaje', 'Normal', 'physical', 'melee')
    .power(40)
    .accuracy(100)
    .cooldown(0.25)
    .range(1.8)
    .radius(0.7)
    .halfAngle(50)
    .knockback(0.6)
    .cast(0.35)
    .animation('attack')
    .impact('arc')
    .color(235, 228, 210)
    .description('Embestida cuerpo a cuerpo contra los rivales que tenga delante.')
);

/* ------------------------------------------------------------------------- */
/* Charmander                                                                */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('aranazo', 'Arañazo', 'Normal', 'physical', 'melee')
    .power(40)
    .accuracy(100)
    .cooldown(0.3)
    .range(1.7)
    .radius(0.65)
    .halfAngle(45)
    .knockback(0.35)
    .cast(0.3)
    .animation('strike')
    .impact('slash')
    .color(246, 236, 220)
    .description('Zarpazo rápido cuerpo a cuerpo. Ataque básico de Charmander.')
);

registerAbility(
  ability('giroFuego', 'Giro Fuego', 'Fire', 'special', 'aoe')
    .power(35)
    .accuracy(85)
    .cooldown(6)
    .range(3.6)
    .radius(1.7)
    .windup(0.5, { move: true })
    .cast(0.45)
    .area('whirl', 'overTime', 2.4, 0.4)
    .impact('fire')
    .color(255, 132, 40)
    .description(
      'Remolino de fuego persistente: 35 de daño por segundo durante 2,4 s a quien siga dentro.'
    )
);

registerAbility(
  ability('lanzallamas', 'Lanzallamas', 'Fire', 'special', 'beam')
    .power(90)
    .accuracy(100)
    .cooldown(7)
    .range(9.5)
    .radius(0.4)
    .windup(0.35)
    .cast(0.5)
    .animation('charge')
    .beam('fire')
    .impact('fire')
    .color(255, 138, 42)
    .description('Chorro de fuego instantáneo que atraviesa a los rivales en línea.')
);

registerAbility(
  ability('anilloIgneo', 'Anillo Ígneo', 'Fire', 'special', 'aoe')
    .power(110)
    .accuracy(85)
    .cooldown(14)
    .range(4.2)
    .radius(3.1)
    .windup(0.75)
    .cast(0.7)
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
  ability('hojaAfilada', 'Hoja Afilada', 'Grass', 'physical', 'melee')
    .power(60)
    .accuracy(100)
    .cooldown(5)
    .range(2.6)
    .radius(0.8)
    .halfAngle(50)
    .knockback(0.4)
    .cast(0.45)
    .windup(0.3)
    .animation('charge')
    .impact('grass')
    .color(126, 214, 88)
    .description('Hoja cortante de gran alcance; empuja a quien golpea.')
);

registerAbility(
  ability('paralizador', 'Paralizador', 'Grass', 'status', 'melee')
    .power(0)
    .accuracy(100)
    .cooldown(10)
    .range(3)
    .radius(0.9)
    .halfAngle(60)
    .windup(0.2)
    .cast(0.4)
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
    .power(120)
    .accuracy(95)
    .cooldown(14)
    .range(4.2)
    .radius(3.2)
    .windup(0.75)
    .cast(0.7)
    .animation('shake')
    .area('grass', 'instant', 1.1)
    .impact('grass')
    .color(112, 204, 72)
    .description(
      'Definitiva: torbellino bajo y ancho de hojas. Golpea una vez con 120 de potencia.'
    )
);

/* ------------------------------------------------------------------------- */
/* Squirtle                                                                  */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('acuaJet', 'Acua Jet', 'Water', 'physical', 'dash')
    .power(45)
    .accuracy(100)
    .cooldown(5)
    .range(0)
    .radius(0.85)
    .dash(4.2)
    .knockback(0.3)
    .cast(0.3)
    .animation('attack')
    .color(96, 176, 255)
    .description(
      'Se impulsa con un chorro de agua y golpea a los rivales del camino.'
    )
);

registerAbility(
  ability('rayoBurbuja', 'Rayo Burbuja', 'Water', 'special', 'projectile')
    .power(65)
    .accuracy(100)
    .cooldown(3.5)
    .range(8)
    .radius(0.24)
    .projectile('water', 13)
    .impact('water')
    .cast(0.4)
    .windup(0.2)
    .animation('shoot')
    .slow(0.7, 2)
    .color(104, 196, 255)
    .description(
      'Chorro de burbujas a presión que ralentiza un 30 % durante 2 s.'
    )
);

registerAbility(
  ability('hidrobomba', 'Hidrobomba', 'Water', 'special', 'beam')
    .power(115)
    .accuracy(90)
    .cooldown(9)
    .range(8.5)
    .radius(0.42)
    .beam('water')
    .impact('water')
    .windup(0.3, { animation: 'charge' })
    .cast(0.6)
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
    .cast(0.32)
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
    .cast(0.25)
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
    .windup(0.2, { animation: 'charge' })
    .cast(0.4)
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
    .windup(0.35, { animation: 'charge' })
    .cast(0.65)
    .animation('strike')
    .impact('fighting')
    .color(96, 150, 255)
    .description(
      'Definitiva: ráfaga de golpes de aura en un cono amplio. Mucho daño y empuje, pero exige acercarse.'
    )
);

/* ------------------------------------------------------------------------- */
/* Mewtwo                                                                    */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('telequinesis', 'Telequinesis', 'Psychic', 'special', 'melee')
    .power(55)
    .accuracy(100)
    .cooldown(0.6)
    .range(2.5)
    .radius(0.8)
    .halfAngle(55)
    .knockback(1.4)
    .cast(0.4)
    .windup(0.12)
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
    .cast(0.24)
    .animation('quickstrike')
    .impact('psychic')
    .color(170, 104, 255)
    .description(
      'Desaparece y reaparece 5 u más adelante. Movilidad pura para entrar o salir del combate.'
    )
);

registerAbility(
  ability('psiquico', 'Psíquico', 'Psychic', 'special', 'beam')
    .power(95)
    .accuracy(100)
    .cooldown(7)
    .range(10)
    .radius(0.42)
    .windup(0.4, { animation: 'shoot' })
    .cast(0.5)
    .beam('psychic')
    .impact('psychic')
    .color(226, 132, 255)
    .description(
      'Lanza psíquico instantáneo de largo alcance que atraviesa a los rivales en línea.'
    )
);

registerAbility(
  ability('psicoataque', 'Psicoataque', 'Psychic', 'special', 'aoe')
    .power(125)
    .accuracy(95)
    .cooldown(15)
    .range(4.5)
    .radius(3.2)
    .windup(0.8, { animation: 'charge' })
    .cast(0.7)
    .area('psychic', 'instant', 0.85)
    .radial(0.35)
    .impact('psychic')
    .color(198, 96, 255)
    .description(
      'Definitiva: implosión psíquica que golpea una vez con 125 de potencia en un área amplia. Hace el 100 % en el centro y el 35 % en el borde.'
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
    .cast(0.32)
    .windup(0.1)
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
    .cast(0.26)
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
    .windup(0.9, { move: true })
    .cast(0.55)
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
  ability('recuperacion', 'Recuperación', 'Psychic', 'status', 'self')
    .power(0)
    .accuracy(0)
    .cooldown(14)
    .radius(1)
    .cast(0.75)
    .windup(0.75)
    .animation('twirl')
    .heal(0.25)
    .color(255, 170, 230)
    .description(
      'Se concentra y recupera el 25 % de su vida máxima. Si le golpean durante la concentración, se cancela.'
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

MOVESETS['0025'] = ['placaje', 'ataqueRapido', 'rayo', 'impactrueno'];
MOVESETS['0001'] = ['placaje', 'paralizador', 'hojaAfilada', 'llueveHojas'];
MOVESETS['0004'] = ['aranazo', 'giroFuego', 'lanzallamas', 'anilloIgneo'];
MOVESETS['0007'] = ['placaje', 'acuaJet', 'rayoBurbuja', 'hidrobomba'];
MOVESETS['0448'] = [
  'garraMetal',
  'velocidadExtrema',
  'esferaAura',
  'combateCercano'
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

export function abilityForSlot(
  pokemonId: string,
  slotIndex: number
): AbilityDef | null {
  const moveset = MOVESETS[pokemonId];
  const id = moveset?.[slotIndex] ?? null;
  return id ? (ABILITIES[id] ?? null) : null;
}
