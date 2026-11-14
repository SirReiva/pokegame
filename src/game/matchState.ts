/**
 * Puente de compatibilidad: el estado de partida vive en
 * `core/match/playerState.ts`.
 *
 * Se conserva este módulo para no romper los imports existentes de la capa
 * `game` mientras terminan de migrarse.
 */

export * from './core/match/playerState';
