/** Configuración de una plaza que viaja del lobby al motor. */

import type { CommonAbilityId } from '../abilities/common';
import type { Team } from '../team';

export type MovementMode = 'normal' | 'tactical';

export type BotDifficulty = 'easy' | 'normal' | 'hard' | 'expert';

export interface MatchPlayerConfig {
  slot: number;
  name: string;
  deviceId: string;
  deviceKind: 'keyboard' | 'gamepad';
  team: Team;
  pokemonId: string;
  /** Aspecto alternativo elegido; ausente o `default` significa el normal. */
  skinId?: string;
  commonAbilityId: CommonAbilityId;
  /** Modo de control elegido por el jugador; los bots usan `normal`. */
  movementMode: MovementMode;
  isBot?: boolean;
  botDifficulty?: BotDifficulty;
}
