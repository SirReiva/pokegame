/**
 * Caché de ventajas de tipo por rival.
 *
 * `BotController.bestDamageMultiplier()` recorre las habilidades de ambos
 * Pokémon, la tabla de tipos y el clima. Ese resultado **no** depende de la
 * posición, la vida ni los cooldowns: solo cambia si entra otro rival en esa
 * plaza, si cambia el clima o si se sustituyen sus tipos o habilidades. Aun así
 * se recalculaba dos veces por rival visible en cada paso.
 *
 * Aquí se guarda por plaza y se invalida con esas señales, igual que un
 * "dirty flag": mientras nada de eso cambie, `updateTarget()` reutiliza el
 * valor. Es un cálculo puro, así que reutilizarlo no altera el juego.
 */

import type { AtmosphereId } from '../atmosphere';
import type { MatchPlayerState } from '../matchState';

/** Ventaja de tipo del bot contra el rival y del rival contra el bot. */
export interface MatchupValues {
  /** Mejor multiplicador del bot contra el rival (0 si es inmune a todo). */
  offense: number;
  /** Mejor multiplicador del rival contra el bot (0 si es inmune a todo). */
  defense: number;
}

interface MatchupEntry extends MatchupValues {
  attacker: MatchPlayerState;
  defender: MatchPlayerState;
  atmosphere: AtmosphereId;
  /**
   * Referencias a los tipos y habilidades con los que se calculó. En la partida
   * se asignan una vez; compararlas detecta cualquier sustitución sin recorrer
   * la tabla de tipos.
   */
  attackerTypes: readonly string[];
  defenderTypes: readonly string[];
  attackerAbilities: readonly (string | null)[];
  defenderAbilities: readonly (string | null)[];
}

export class MatchupCache {
  private readonly entries = new Map<number, MatchupEntry>();
  /** Resultado reutilizado: no asignar un objeto por rival y paso. */
  private readonly values: MatchupValues = { offense: 1, defense: 1 };

  /**
   * Valores vigentes de `self` contra `enemy`, o `null` si hay que
   * recalcularlos. El objeto devuelto es compartido: solo es válido hasta la
   * siguiente consulta.
   */
  lookup(
    self: MatchPlayerState,
    enemy: MatchPlayerState,
    atmosphere: AtmosphereId
  ): MatchupValues | null {
    const entry = this.entries.get(enemy.slot);
    if (
      !entry ||
      entry.attacker !== self ||
      entry.defender !== enemy ||
      entry.atmosphere !== atmosphere ||
      entry.attackerTypes !== self.types ||
      entry.defenderTypes !== enemy.types ||
      entry.attackerAbilities !== self.abilityIds ||
      entry.defenderAbilities !== enemy.abilityIds
    ) {
      return null;
    }
    this.values.offense = entry.offense;
    this.values.defense = entry.defense;
    return this.values;
  }

  /** Guarda el cálculo recién hecho y devuelve el objeto reutilizado. */
  store(
    self: MatchPlayerState,
    enemy: MatchPlayerState,
    atmosphere: AtmosphereId,
    offense: number,
    defense: number
  ): MatchupValues {
    this.entries.set(enemy.slot, {
      attacker: self,
      defender: enemy,
      atmosphere,
      attackerTypes: self.types,
      defenderTypes: enemy.types,
      attackerAbilities: self.abilityIds,
      defenderAbilities: enemy.abilityIds,
      offense,
      defense
    });
    this.values.offense = offense;
    this.values.defense = defense;
    return this.values;
  }

  /** Olvida todo; se llama al reiniciar el estado de combate del bot. */
  clear(): void {
    this.entries.clear();
  }
}
