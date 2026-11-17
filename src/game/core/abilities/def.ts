/**
 * Contratos de definición de habilidades.
 *
 * Solo tipos: el catálogo, los valores por defecto y los builders viven en
 * `abilities.ts`. Se separan para que el estado de la partida y los
 * ejecutores de combate puedan depender de una definición sin arrastrar el
 * catálogo completo.
 */

import type {
  AoeEffect,
  AoeEvent,
  AoeMovement,
  AoePlayer,
  AoePrepareMovement
} from './aoe';
import type { BuffSpec, DamageOverTimeSpec, SlowSpec } from './specs';
import type { AnimationName } from '../types';
import type { PokemonType } from '../typeChart';
import type {
  AbilityShape,
  AoeDamageMode,
  AoeShape,
  AoeStyle,
  BeamStyle,
  DamageCategory,
  ImpactStyle,
  ProjectileStyle,
  StartupAnimationMode
} from './styles';

export type { BuffSpec, DamageOverTimeSpec, SlowSpec } from './specs';

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

export interface AbilityDef {
  /** Identificador único; se usa en `MOVESETS`. */
  id: string;
  name: string;
  type: PokemonType;
  category: DamageCategory;
  shape: AbilityShape;
  /** Potencia base de la fórmula de daño. 0 en habilidades de estado. */
  power: number;
  /** Enfriamiento en segundos. */
  cooldown: number;
  /**
   * Rampa opcional al repetir la habilidad sin alternar con otra. `null` deja
   * el cooldown fijo. Las básicas melee la usan para desincentivar el spam.
   */
  repeatCooldown: RepeatCooldownSpec | null;
  /** Alcance en unidades de mundo (melee, proyectil, haz o centro del área). */
  range: number;
  /**
   * Radio del proyectil, del golpe cuerpo a cuerpo o del área circular. En un
   * área con `aoeShape: 'cone'` es la longitud del cono.
   */
  radius: number;
  /** Semiángulo del cono (melee o `aoeShape: 'cone'`), en grados. */
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
  /**
   * Geometría del área. `circle` usa `radius` alrededor del centro; `cone`
   * nace en el centro y avanza `radius` hacia delante con `halfAngle`.
   */
  aoeShape: AoeShape;
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
   * Función opcional que recoloca el centro de un área durante el `startup`.
   * El motor mueve con ella la marca del suelo; el centro resultante se usa al
   * disparar el efecto. Sirve para que el aviso siga al lanzador mientras se
   * mueve antes del impacto.
   */
  aoePrepareMovement?: AoePrepareMovement<AoePlayer, AbilityDef>;
  /**
   * Función opcional que recoloca el centro de un área `overTime` en cada
   * frame. Recibe el tiempo transcurrido y el centro original, y devuelve el
   * centro actual en coordenadas de mundo. El motor mueve con él el daño de
   * cada tick, el aro del equipo y el efecto visual. Solo se usa en `overTime`.
   */
  aoeMovement?: AoeMovement<AoePlayer, AbilityDef>;
  /**
   * Callback opcional que decide qué efectos aplica cada golpe o tick del
   * área. Recibe todos los Pokémon vivos dentro del radio (aliados, enemigos y
   * el propio lanzador) y los aliados caídos cuyo marcador de KO está dentro,
   * y elige a quién aplica daño, hitstun, empuje, slow, buffs, curación o
   * revivir. Si se omite, se usa `defaultAoeEffect`.
   */
  aoeEffect?: AoeEffect<AoePlayer, AbilityDef>;
  /**
   * Evento que se ejecuta al empezar el lanzamiento del área, antes del
   * `startup`. Solo se usa con `shape: 'aoe'`.
   */
  onStart?: AoeEvent<AoePlayer, AbilityDef>;
  /**
   * Evento que se ejecuta al aparecer el área, justo después del `startup` y
   * antes del primer golpe o tick. Solo se usa con `shape: 'aoe'`.
   */
  onCast?: AoeEvent<AoePlayer, AbilityDef>;
  /**
   * Evento que se ejecuta al terminar el área: al agotar su `aoeDuration` o,
   * en las instantáneas, cuando acaba su duración visual. Solo se usa con
   * `shape: 'aoe'`.
   */
  onEnd?: AoeEvent<AoePlayer, AbilityDef>;
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
  /** Daño en el tiempo que se aplica a los enemigos golpeados. */
  dot: DamageOverTimeSpec | null;
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
   * Clava al lanzador durante todo el casteo (`startup + active + recovery`),
   * no solo durante el `startup`. Tiene prioridad sobre `moveWhileStartup`.
   * Pensado para áreas canalizadas que deben impedir moverse hasta que termine
   * la animación de lanzamiento.
   */
  blockMovementDuringCast: boolean;
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
   * Clava al lanzador desde el inicio del casteo hasta que termina de
   * reproducirse la animación de lanzamiento, aunque `moveWhileStartup` sea
   * `true`. Después, la recuperación restante ya permite moverse. Si no hay
   * animación, bloquea hasta el final del casteo.
   */
  blockMovementUntilEndAnimation: boolean;
  /**
   * Si es `true`, lanzar la habilidad no pone a cero la velocidad actual: el
   * Pokémon conserva su inercia y solo se ajusta al nuevo máximo. Evita el
   * frenazo de las habilidades instantáneas que se pueden usar en movimiento.
   */
  preserveMomentum: boolean;
  /** Texto corto para el HUD y la descripción de la habilidad. */
  description: string;
}
