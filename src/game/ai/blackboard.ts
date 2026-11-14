/**
 * Estado compartido entre los bots de un mismo equipo.
 *
 * La pizarra la crea una vez el motor por partida y la mutan los controladores
 * durante el paso de simulación. Los valores por defecto no contienen datos de
 * ningún frame anterior.
 */

import { createTeamRecord } from '../multiplayer';
import type { BotHazard, BotSquad, BotWorldView, TeamBlackboard } from './types';

function createTeamBlackboard(): TeamBlackboard {
  return {
    focus: { slot: null, until: 0 },
    lastSeen: new Map(),
    aliveAllies: 0,
    aliveEnemies: 0,
    pickupClaims: new Map(),
    reviveClaims: new Map(),
    patrolClaims: new Map(),
    engageCall: 'engage',
    committedDamage: new Map(),
    help: null
  };
}

export function createBotSquad(): BotSquad {
  return createTeamRecord(createTeamBlackboard);
}

/** Sin peligros externos (partidas sin bots o primer frame). */
export const NO_HAZARDS: readonly BotHazard[] = [];

export const EMPTY_BOT_WORLD_VIEW: BotWorldView = {
  visibleSlots: new Set(),
  atmosphere: 'clear'
};
