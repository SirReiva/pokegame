/** Configuración de una plaza que viaja del lobby al motor. */

import type { CommonAbilityId } from '../abilities/common';
import type { Team } from '../team';

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
  isBot?: boolean;
  botDifficulty?: BotDifficulty;
}
