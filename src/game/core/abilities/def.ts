/**
 * Contratos de definición de habilidades.
 *
 * Solo tipos: el catálogo, los valores por defecto y los builders viven en
 * `abilities.ts`. La definición es una unión discriminada por `shape`: cada
 * forma declara únicamente los campos que su ejecutor lee. El bloque de golpe
 * (`power`, `hitstun`, `knockback`, `slow`, `dot`, `healOnHit`) vive en
 * `props`, que es genérico para que una habilidad pueda añadir datos propios.
 */

import type { AoeEvent, AoeMovement, AoePlayer, AoePrepareMovement } from './aoe';
import type { AbilityResolve, AbilityResolveContext } from './resolve';
import type { BuffSpec, DamageOverTimeSpec, SlowSpec } from './specs';
import type { AnimationScript } from '../animationScript';
import type { PokemonType } from '../typeChart';
import type {
  AoeDamageMode,
  AoeShape,
  AoeStyle,
  BeamStyle,
  DamageCategory,
  ImpactStyle,
  ProjectileStyle
} from './styles';

export type { BuffSpec, DamageOverTimeSpec, SlowSpec } from './specs';
export type {
  AbilityFallenAlly,
  AbilityHitInput,
  AbilityHitOptions,
  AbilityResolve,
  AbilityResolveContext,
  AbilityTarget
} from './resolve';

/**
 * Bloque común de golpe. Todas las habilidades lo llevan, aunque su forma no
 * llegue a golpear (una habilidad `self` puede dejar `power` a 0).
 */
export interface AbilityProps {
  /** Potencia base de la fórmula de daño. 0 en habilidades de estado. */
  power: number;
  /**
   * Segundos de hitstun que aplica el golpe al impactar. Solo cuenta cuando el
   * golpe lleva control. Por defecto, el global `CONFIG.combat.hitstunSeconds`.
   */
  hitstun: number;
  /** Empuje aplicado al objetivo al impactar, en unidades de mundo. */
  knockback: number;
  /** Ralentización que se aplica a los enemigos golpeados. */
  slow: SlowSpec | null;
  /** Daño en el tiempo que se aplica a los enemigos golpeados. */
  dot: DamageOverTimeSpec | null;
  /**
   * Si es `true`, `healSelf` no se aplica al lanzar: solo cura cuando la
   * habilidad impacta al menos en un enemigo. Lo usa `Come Sueños`.
   */
  healOnHit: boolean;
}

/** Escape hatch explícito para ajustes raros de una habilidad concreta. */
export type AbilityExtra = Readonly<Record<string, string | number | boolean>>;

/**
 * Lo que la IA necesita saber de una resolución personalizada.
 *
 * El motor no puede inspeccionar una función, así que la habilidad declara de
 * forma explícita si su `resolve` cura, revive o aplica daño/control que no se
 * deduce de `props`. Sin este perfil, una resolución propia es opaca para los
 * bots y pueden descartarla como si no hiciera nada.
 */
export interface AbilityBotProfile {
  /** La resolución reparte curación entre aliados vivos. */
  healAllies?: boolean;
  /** La resolución revive aliados caídos. */
  revive?: boolean;
  /** La resolución aplica daño que no se calcula con `props.power`. */
  customDamage?: boolean;
  /** La resolución aplica control que no se calcula con `props`. */
  customControl?: boolean;
}

/**
 * Rampa de enfriamiento al repetir la misma habilidad de forma consecutiva.
 * `step` y `max` son fracciones del cooldown base; `resetAfter` son los
 * segundos sin volver a usarla que reinician la racha.
 */
export interface RepeatCooldownSpec {
  step: number;
  max: number;
  resetAfter: number;
}

/**
 * Campos comunes a todas las formas. La resolución es obligatoria: el builder
 * no construye una definición sin ella.
 */
interface AbilityBase<P extends AbilityProps> {
  /** Identificador único; se usa en `MOVESETS`. */
  id: string;
  name: string;
  /** Tipo del movimiento (STAB, efectividad y clima). */
  type: PokemonType;
  category: DamageCategory;
  /** Bloque de golpe; puede extenderse con props propias de la habilidad. */
  props: P;
  /**
   * Resolución de la habilidad. El motor la llama una vez por evento con los
   * objetivos ya reunidos. Nunca es `undefined`: cada definición declara la
   * suya, aunque sea la función por defecto de su forma.
   */
  resolve: AbilityResolve<AoePlayer, any>;
  /** Enfriamiento en segundos. */
  cooldown: number;
  /**
   * Rampa opcional al repetir la habilidad sin alternar con otra. `null` deja
   * el cooldown fijo. Las básicas melee la usan para desincentivar el spam.
   */
  repeatCooldown: RepeatCooldownSpec | null;
  /** Buffs que se aplican al lanzador al usar la habilidad. */
  buffs: BuffSpec[];
  /**
   * Curación al lanzador como fracción de su vida máxima: `0.25` = 25 %.
   * `0` desactiva la curación. Se aplica al ejecutar la habilidad salvo que
   * `props.healOnHit` sea `true`.
   */
  healSelf: number;
  /**
   * Autodaño al lanzador como fracción de su vida máxima: `0.35` = 35 %.
   * `0` lo desactiva. Nunca le quita la última vida: si el golpe lo dejaría a
   * 0, se queda con 1 PV.
   */
  selfDamage: number;
  /** Aspecto visual del impacto; lo usan todas las formas que golpean. */
  impactStyle: ImpactStyle;
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
   * Timeline de animación de la habilidad. Se coloca dentro de
   * `startup + active + recovery`, puede encadenar clips y puede dejar huecos.
   * Un array vacío desactiva la animación.
   */
  presentation: AnimationScript;
  /**
   * Variante del timeline por especie (`pokemonId`). Reemplaza al script común
   * para esa especie; no se fusiona paso a paso.
   */
  presentationBySpecies?: Readonly<Record<string, AnimationScript>> | null;
  /**
   * Movimiento durante el `startup`: `false` bloquea, `true` usa la velocidad
   * normal y un número es un multiplicador de velocidad (`0` bloquea). Por
   * defecto es `false`. El efecto sigue fijado en el centro calculado al
   * empezar el lanzamiento, así que el Pokémon puede salir de la zona mientras
   * la marca sigue en el suelo. Sin efecto si `startup` es 0.
   */
  moveWhileStartup: boolean | number;
  /**
   * Movimiento durante todo el casteo (`startup + active + recovery`), no solo
   * durante el `startup`. Mismos valores que `moveWhileStartup`: `false`/`0`
   * clava al lanzador, `true` permite velocidad normal y un número multiplica
   * la velocidad. Sin declararlo no altera las reglas por fase. Clavar al
   * lanzador durante todo el casteo lo convierte en una canalización.
   */
  movementDuringCast?: boolean | number;
  /**
   * PV de armadura del casteo: cada golpe resta su daño a este pozo sin
   * mitigarlo y, mientras quede, no cancela el casteo ni aplica hitstun o
   * empuje. Cuando el daño acumulado agota el pozo, el casteo se rompe. `0`
   * desactiva la armadura. El valor es absoluto y se calibra contra las
   * básicas rápidas.
   */
  armorPool: number;
  /**
   * Ventana de la armadura: `'startup'` cubre solo la preparación; `'cast'`
   * cubre todo el casteo. En canalizaciones se infiere `'cast'`.
   */
  armorWindow: 'startup' | 'cast';
  /**
   * Movimiento desde el inicio del casteo hasta que termina de reproducirse la
   * animación de lanzamiento. Mismos valores que `moveWhileStartup`:
   * `false`/`0` bloquea, `true` permite velocidad normal y un número multiplica
   * la velocidad. Sin declararlo no altera las reglas por fase. Después de la
   * animación, la recuperación restante vuelve a las reglas normales. Si no hay
   * animación, la ventana llega hasta el final del casteo.
   */
  movementUntilEndAnimation?: boolean | number;
  /**
   * Si es `true`, lanzar la habilidad no pone a cero la velocidad actual: el
   * Pokémon conserva su inercia y solo se ajusta al nuevo máximo. Evita el
   * frenazo de las habilidades instantáneas que se pueden usar en movimiento.
   */
  preserveMomentum: boolean;
  /** Texto corto para el HUD y la descripción de la habilidad. */
  description: string;
  /**
   * Perfil declarativo para la IA. Solo es necesario cuando `resolve` hace
   * algo que no se deduce de `props` (curar aliados, revivir, daño propio...).
   */
  bot?: AbilityBotProfile;
  /** Escape hatch para ajustes puntuales que no encajan en el tipo de la forma. */
  extra?: AbilityExtra;
}

/** Golpe cuerpo a cuerpo en arco. */
export interface MeleeAbilityDef<
  P extends AbilityProps = AbilityProps
> extends AbilityBase<P> {
  shape: 'melee';
  /** Alcance del arco en unidades de mundo. */
  range: number;
  /** Radio del VFX de curación; no afecta al hitbox del arco. */
  radius: number;
  /** Semiángulo del arco, en grados. */
  halfAngle: number;
}

/** Proyectil que avanza hasta agotar `range` o chocar. */
export interface ProjectileAbilityDef<
  P extends AbilityProps = AbilityProps
> extends AbilityBase<P> {
  shape: 'projectile';
  /** Distancia máxima de vuelo. */
  range: number;
  /** Radio de detección y grosor visual del proyectil. */
  radius: number;
  /** Velocidad en u/s. */
  projectileSpeed: number;
  /** Nº de enemigos extra que puede atravesar. */
  pierce: number;
  /** Aspecto visual del proyectil. */
  projectileStyle: ProjectileStyle;
}

/** Haz instantáneo en línea recta. */
export interface BeamAbilityDef<
  P extends AbilityProps = AbilityProps
> extends AbilityBase<P> {
  shape: 'beam';
  /** Longitud del haz. */
  range: number;
  /** Semiancho del haz. */
  radius: number;
  /** Aspecto visual del haz. */
  beamStyle: BeamStyle;
}

/**
 * Círculo de un área compuesta.
 *
 * `offsetX`/`offsetZ` son el desplazamiento respecto al centro del área:
 * `offsetX` hacia la derecha y `offsetZ` hacia delante. El motor los rota con
 * la dirección del lanzamiento, así que un patrón (línea, abanico, cruz) gira
 * junto con el área.
 */
export interface AoeCircleSpec {
  offsetX: number;
  offsetZ: number;
  /** Radio del círculo; si se omite se usa el `radius` del área. */
  radius?: number;
}

/** Área en el suelo, instantánea o con ticks. */
export interface AoeAbilityDef<
  P extends AbilityProps = AbilityProps
> extends AbilityBase<P> {
  shape: 'aoe';
  /** Distancia desde el lanzador hasta el centro del área. */
  range: number;
  /** Radio del círculo o longitud del cono. */
  radius: number;
  /** Geometría del área. */
  aoeShape: AoeShape;
  /**
   * Círculos que componen un área circular. Vacío (o ausente) equivale a un
   * único círculo de radio `radius` centrado en el área. Solo se usa con
   * `aoeShape: 'circle'`.
   */
  aoeCircles: AoeCircleSpec[];
  /**
   * Cómo se dibuja el patrón de `aoeCircles`: `'each'` crea un efecto por
   * círculo y `'grouped'` dibuja un único efecto centrado que cubre todo el
   * patrón. `'grouped'` conviene con estilos caros (por ejemplo, el ciclón).
   */
  aoeCircleFx: 'each' | 'grouped';
  /** Semiángulo del cono, en grados. Solo se usa con `aoeShape: 'cone'`. */
  halfAngle: number;
  /** Golpe único, ticks globales o ticks por objetivo. */
  aoeDamageMode: AoeDamageMode;
  /**
   * Daño radial: la potencia se escala linealmente desde el 100 % en el centro
   * hasta `radialMinDamage` en el borde.
   */
  radialDamage: boolean;
  /** Multiplicador de potencia en el borde (`0.35` = 35 %). */
  radialMinDamage: number;
  /** Duración del área en el suelo y del daño periódico. */
  aoeDuration: number;
  /** Intervalo entre ticks, en segundos. */
  aoeTickInterval: number;
  /**
   * Velocidad angular máxima, en grados por segundo, con la que un cono gira
   * hacia la dirección devuelta por `aoeMovement`. `0` aplica el cambio de
   * golpe, sin transición.
   */
  aoeTurnRate: number;
  /** Aspecto visual del área. */
  aoeStyle: AoeStyle;
  /**
   * Recoloca el centro del área durante el `startup`; el aviso del suelo sigue
   * al lanzador mientras se mueve antes del impacto.
   */
  aoePrepareMovement?: AoePrepareMovement<AoePlayer, any>;
  /**
   * Recoloca el centro de un área con ticks en cada frame. El daño, el aro y el
   * efecto visual siguen ese centro.
   */
  aoeMovement?: AoeMovement<AoePlayer, any>;
  /** Evento al empezar el lanzamiento, antes del `startup`. */
  onStart?: AoeEvent<AoePlayer, any>;
  /** Evento al aparecer el área, antes del primer golpe o tick. */
  onCast?: AoeEvent<AoePlayer, any>;
  /** Evento al terminar el área. */
  onEnd?: AoeEvent<AoePlayer, any>;
}

/** Desplazamiento que puede golpear al paso. */
export interface DashAbilityDef<
  P extends AbilityProps = AbilityProps
> extends AbilityBase<P> {
  shape: 'dash';
  /** Ancho del barrido; se usa `max(0.5, radius)`. */
  radius: number;
  /** Distancia del dash en unidades de mundo. */
  dashDistance: number;
  /** Si es `true`, el dash se detiene al chocar con enemigos. */
  dashBlocksOnEnemies: boolean;
}

/** Habilidad centrada en el lanzador. */
export interface SelfAbilityDef<
  P extends AbilityProps = AbilityProps
> extends AbilityBase<P> {
  shape: 'self';
  /** Radio del VFX de buff o curación. */
  radius: number;
  /** Si es `true`, el lanzador gana un escudo esférico y reducción de daño. */
  shield: boolean;
  /** Duración del escudo en segundos. */
  shieldDuration: number;
  /** Fracción de daño reducida mientras el escudo está activo (0-1). */
  damageReduction: number;
  /** Multiplicador de velocidad normal mientras el escudo está activo. */
  shieldSpeedMultiplier: number;
}

/** Definición de una habilidad, discriminada por `shape`. */
export type AbilityDef<P extends AbilityProps = AbilityProps> =
  | MeleeAbilityDef<P>
  | ProjectileAbilityDef<P>
  | BeamAbilityDef<P>
  | AoeAbilityDef<P>
  | DashAbilityDef<P>
  | SelfAbilityDef<P>;

/** Definición con props arbitrarias, para el catálogo y las firmas del motor. */
export type AnyAbilityDef = AbilityDef<any>;

/** Contexto de resolución tipado con una definición concreta. */
export type AbilityDefResolveContext<
  D extends AnyAbilityDef,
  TPlayer extends AoePlayer = AoePlayer
> = AbilityResolveContext<TPlayer, D>;
