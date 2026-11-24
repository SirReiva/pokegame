/**
 * Ajustes de dificultad de la IA.
 *
 * Solo datos: las capas de decisión leen estos valores, no los modifican.
 * `BotDifficulty` sigue viviendo en `multiplayer` porque la configuran los
 * ajustes de partida.
 */

import type { BotDifficulty } from '../multiplayer';

export interface BotTuning {
  /** Tiempo que debe ver a un objetivo antes de atacarlo. */
  reaction: number;
  /** Cada cuánto reevalúa objetivo y habilidad. */
  decision: number;
  /**
   * Probabilidad de elegir una acción viable peor que la mejor puntuada. Un
   * experto falla poco, pero no tiene una evaluación perfecta.
   */
  decisionError: number;
  /** Error angular máximo para considerar que está encarado. */
  aimTolerance: number;
  /**
   * Error angular máximo de apuntado (radianes). Se mantiene estable durante
   * unos frames para que el bot no tiemble, pero le hace fallar tiros que con
   * puntería perfecta entrarían.
   */
  aimError: number;
  /** Multiplicador sobre el rango de visión de la especie. */
  visionFactor: number;
  /** Peso de las ventajas y desventajas de tipo al elegir objetivo. */
  matchupWeight: number;
  /** Vida por debajo de la cual huye. */
  retreatHp: number;
  /** Segundos que recuerda la última posición vista. */
  memory: number;
  /** Cuánto adelanta el disparo a un objetivo en movimiento (0-1). */
  lead: number;
  /** Probabilidad de usar el instinto común cuando toca. */
  commonChance: number;
  /** Cada cuánto recalcula la ruta. */
  pathInterval: number;
  /** Antelación con la que reacciona a un windup rival. */
  evadeWindow: number;
  /** Cuánto prioriza a un rival que está preparando una habilidad. */
  punishBonus: number;
  /** Probabilidad de darse cuenta y castigar un windup rival. */
  punishChance: number;
  /** Error al estimar cuánto le queda al windup rival (segundos). */
  punishTimingError: number;
  /** Reacción media antes de intentar interrumpir un windup (segundos). */
  punishReaction: number;
}

/**
 * La dificultad se expresa sobre todo con predicción (`lead`), castigo de
 * windups, memoria, coordinación y evaluación de daño. Visión y reacción se
 * mantienen en rangos humanos: difícil y experto no ven más lejos que un
 * jugador ni reaccionan en milisegundos.
 */
export const TUNING: Record<BotDifficulty, BotTuning> = {
  easy: {
    reaction: 0.55,
    decision: 0.45,
    decisionError: 0.3,
    aimTolerance: 0.34,
    aimError: 0.2,
    visionFactor: 0.82,
    matchupWeight: 0.55,
    retreatHp: 0.22,
    memory: 2.2,
    lead: 0.1,
    commonChance: 0.35,
    pathInterval: 0.9,
    evadeWindow: 0.28,
    punishBonus: 1.5,
    punishChance: 0.25,
    punishTimingError: 0.4,
    punishReaction: 0.24
  },
  normal: {
    reaction: 0.3,
    decision: 0.26,
    decisionError: 0.18,
    aimTolerance: 0.2,
    aimError: 0.1,
    visionFactor: 0.96,
    matchupWeight: 1,
    retreatHp: 0.3,
    memory: 3.6,
    lead: 0.65,
    commonChance: 0.65,
    pathInterval: 0.65,
    evadeWindow: 0.44,
    punishBonus: 3,
    punishChance: 0.5,
    punishTimingError: 0.22,
    punishReaction: 0.15
  },
  hard: {
    reaction: 0.2,
    decision: 0.15,
    decisionError: 0.1,
    aimTolerance: 0.1,
    aimError: 0.05,
    visionFactor: 1,
    matchupWeight: 1.35,
    retreatHp: 0.36,
    memory: 5,
    lead: 0.95,
    commonChance: 0.9,
    pathInterval: 0.45,
    evadeWindow: 0.62,
    punishBonus: 4.5,
    punishChance: 0.72,
    punishTimingError: 0.1,
    punishReaction: 0.08
  },
  expert: {
    reaction: 0.16,
    decision: 0.09,
    decisionError: 0.05,
    aimTolerance: 0.06,
    aimError: 0.025,
    visionFactor: 1,
    matchupWeight: 1.6,
    retreatHp: 0.4,
    memory: 6,
    lead: 0.98,
    commonChance: 1,
    pathInterval: 0.3,
    evadeWindow: 0.78,
    punishBonus: 6,
    punishChance: 0.9,
    punishTimingError: 0.04,
    punishReaction: 0.03
  },
  /**
   * Punto de partida de la dificultad adaptativa. Sus valores no se usan tal
   * cual: cada bot clona este perfil y lo interpola entre `easy` y `expert`
   * según el nivel de los rivales y el marcador (ver `ai/adaptiveTuning.ts`).
   * La visión se mantiene en rango humano y no se adapta.
   */
  adaptive: {
    reaction: 0.36,
    decision: 0.27,
    decisionError: 0.18,
    aimTolerance: 0.2,
    aimError: 0.11,
    visionFactor: 1,
    matchupWeight: 1.08,
    retreatHp: 0.31,
    memory: 4.1,
    lead: 0.54,
    commonChance: 0.68,
    pathInterval: 0.6,
    evadeWindow: 0.53,
    punishBonus: 3.8,
    punishChance: 0.58,
    punishTimingError: 0.22,
    punishReaction: 0.14
  }
};

/** Factor de visión que la dificultad aplica a su propio observador. */
export function botVisionFactor(difficulty: BotDifficulty): number {
  return TUNING[difficulty].visionFactor;
}
