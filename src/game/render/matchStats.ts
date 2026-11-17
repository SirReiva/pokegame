/**
 * Construcción del snapshot de estadísticas que consume React.
 *
 * Convierte el estado mutable de la partida en objetos planos listos para el
 * HUD. No toca PlayCanvas: el único dato de presentación que necesita es el
 * `PlayerView` (copia visible y fila del billboard) para la brújula.
 */

import {
  ABILITIES,
  ABILITY_SLOTS,
  REGENERATION_DELAY_SECONDS,
  baseAbilityId,
  commonAbilityOption,
  type AbilitySlot
} from '../abilities';
import { RAD } from '../config';
import { effectiveVisionRange } from '../vision';
import { TERRAINS } from '../terrain';
import { DEFAULT_SKIN_ID } from '../skins';
import type { MatchPlayerState } from '../matchState';
import type { ModeHudSnapshot } from '../modes';
import type {
  KillFeedEntry,
  PlayerMatchStats,
  StatusHud
} from '../multiplayer';
import type { Team } from '../core/team';
import type { SpriteManifest } from '../types';
import { xpStatus } from '../xp';
import { passiveFor } from '../passives';
import { shieldTotal } from '../core/combat/status';
import type { PlayerView } from './playerView';

export interface MatchStatsInput {
  readonly players: readonly MatchPlayerState[];
  /** Vistas humanas, para localizar la copia propia de cada jugador. */
  readonly views: readonly MatchPlayerState[];
  readonly viewsByPlayer: ReadonlyMap<MatchPlayerState, PlayerView>;
  readonly manifest: SpriteManifest | null;
  readonly fps: number;
  readonly atmosphereVision: number;
  readonly killFeed: KillFeedEntry[];
  readonly teamScores: Record<Team, number>;
  readonly mode: ModeHudSnapshot | null;
  readonly winner: Team | null;
  activeCastArmor(player: MatchPlayerState): number;
}

/** Nombres legibles de los estados que llegan al HUD de detalle. */
const STATUS_NAMES: Record<string, string> = {
  estela: 'Estela ardiente',
  'foco-volcanico': 'Foco volcánico',
  'chorro-arena': 'Chorro de arena',
  quemadura: 'Quemadura',
  veneno: 'Veneno',
  semilla: 'Semilla',
  'carga-resonante': 'Carga resonante',
  frio: 'Frío',
  'carga-zapdos': 'Carga eléctrica',
  presion: 'Presión',
  fractura: 'Fractura',
  'anti-curación': 'Anti-curación',
  raiz: 'Raíz',
  silencio: 'Silencio'
};

function statusName(id: string): string {
  const known = STATUS_NAMES[id];
  if (known) return known;
  const label = id.replace(/[-_]/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function buildStatusEffects(player: MatchPlayerState): StatusHud[] {
  const status = player.status;
  const effects: StatusHud[] = [];
  for (const dot of status.dots) {
    effects.push({
      id: `dot:${dot.id}:${dot.sourceSlot}`,
      name: statusName(dot.id),
      kind: 'dot',
      remaining: dot.remaining
    });
  }
  for (const mark of status.marks) {
    effects.push({
      id: `mark:${mark.id}:${mark.sourceSlot}`,
      name: statusName(mark.id),
      kind: 'mark',
      remaining: mark.remaining,
      stacks: mark.stacks,
      maxStacks: mark.maxStacks
    });
  }
  if (status.antiHeal) {
    effects.push({
      id: 'antiheal',
      name: 'Anti-curación',
      kind: 'antiheal',
      remaining: status.antiHeal.remaining
    });
  }
  if (status.rootTimer > 0) {
    effects.push({
      id: 'root',
      name: 'Raíz',
      kind: 'root',
      remaining: status.rootTimer
    });
  }
  if (status.silenceTimer > 0) {
    effects.push({
      id: 'silence',
      name: 'Silencio',
      kind: 'silence',
      remaining: status.silenceTimer
    });
  }
  return effects;
}

/** Snapshot de todos los combatientes, incluidos los bots. */
export function buildMatchStats(input: MatchStatsInput): PlayerMatchStats[] {
  return input.players.map((player) => {
    // Cada humano tiene una copia por vista y su brújula usa la de su propia
    // vista. Los bots no generan vista: se leen de la primera pantalla.
    const viewIndex = player.isBot ? 0 : input.views.indexOf(player);
    const view = input.viewsByPlayer.get(player);
    const copies = view?.copies ?? [];
    const own = copies[viewIndex] ?? copies[0];
    const row = own?.billboard.currentRow ?? 0;
    const terrain = TERRAINS[player.terrain];
    const commonOption = commonAbilityOption(player.commonAbilityId);
    const commonDef = ABILITIES[player.commonAbilityId];
    const passiveDef = passiveFor(player.pokemonId);
    const passiveDetail =
      player.pokemonId === '0133'
        ? ['Agilidad', 'Resistencia', 'Potencia'][
            Math.max(0, player.status.passive.value)
          ] ?? 'Agilidad'
        : null;
    const xp = xpStatus(player.xp);

    return {
      slot: player.slot,
      name: player.name,
      team: player.team,
      pokemonId: player.pokemonId,
      skinId: player.skinId ?? DEFAULT_SKIN_ID,
      fps: Math.round(input.fps),
      yaw: player.cameraYaw * RAD,
      row,
      direction: input.manifest?.directions[row] ?? 'S',
      facing: (((player.facing * RAD) % 360) + 360) % 360,
      speed: Math.hypot(player.vx, player.vz),
      x: player.x,
      z: player.z,
      gamepad: player.deviceKind === 'gamepad',
      animation: player.animation,
      terrain: player.terrain,
      terrainName: terrain.name,
      terrainType: terrain.type,
      terrainSpeedMultiplier: player.terrainMultiplier,
      terrainSpeedReason: player.terrainSpeedReason,
      visionRange: player.visionRange * player.visionFactor * input.atmosphereVision,
      detectionRange: effectiveVisionRange(
        player.visionRange * player.visionFactor * input.atmosphereVision,
        player.concealment.value
      ),
      concealment: player.concealment.value,
      concealmentBase: player.concealment.base,
      concealmentMultiplier: player.concealment.multiplier,
      concealmentReason: player.concealment.reason,
      enemiesSeeing: player.enemiesSeeing,
      discovered: player.alive && player.enemiesSeeing > 0,
      hp: player.hp,
      maxHp: player.maxHp,
      alive: player.alive,
      respawnIn: player.respawnTimer,
      invulnerable: player.invulnerableTimer > 0,
      kills: player.kills,
      deaths: player.deaths,
      assists: player.assists,
      damageDealt: player.damageDealt,
      damageTaken: player.damageTaken,
      abilityHealing: player.abilityHealing,
      pickupHealing: player.pickupHealing,
      xp: xp.xp,
      level: xp.level,
      rank: xp.rank,
      xpIntoLevel: xp.intoLevel,
      xpToNext: xp.toNext,
      xpProgress: xp.progress,
      xpBreakdown: { ...player.xpBreakdown },
      buffs: player.buffs.map((buff) => ({
        stat: buff.stat,
        multiplier: buff.multiplier,
        remaining: buff.duration
      })),
      slows: player.slowEffects.map((effect) => ({
        multiplier: effect.multiplier,
        remaining: effect.remaining
      })),
      statusEffects: buildStatusEffects(player),
      abilities: player.abilityIds.slice(0, 4).map((id, abilityIndex) => {
        const def = id ? ABILITIES[id] : null;
        const copied =
          id && baseAbilityId(id) === 'mimica' && player.status.copiedAbility
            ? ABILITIES[player.status.copiedAbility.id]
            : null;
        const shown = copied ?? def;
        return {
          slot: ABILITY_SLOTS[abilityIndex] as AbilitySlot,
          id: id ?? '',
          name: copied ? `Mímica · ${copied.name}` : (def?.name ?? 'Sin asignar'),
          type: shown?.type ?? '',
          category: shown?.category ?? 'status',
          cooldown: player.cooldowns[abilityIndex] ?? 0,
          duration:
            player.cooldownTotals[abilityIndex] || (def?.cooldown ?? 0)
        };
      }),
      passive: passiveDef
        ? {
            id: passiveDef.id,
            name: passiveDef.name,
            description: passiveDef.description,
            stacks: player.status.passive.stacks,
            maxStacks: passiveDef.maxStacks ?? 0,
            detail: passiveDetail
          }
        : null,
      shieldActive: player.damageReductionTimer > 0,
      shieldAmount: shieldTotal(player.status),
      armorRemaining: input.activeCastArmor(player),
      armorMax: player.activeCast?.def.armorPool ?? 0,
      commonAbility: commonOption
        ? {
            id: commonOption.id,
            name: commonOption.name,
            short: commonOption.short,
            passive: commonOption.passive,
            cooldown: player.cooldowns[4] ?? 0,
            duration: player.cooldownTotals[4] || (commonDef?.cooldown ?? 0),
            readyIn: commonOption.passive
              ? Math.max(0, REGENERATION_DELAY_SECONDS - player.hiddenTimer)
              : 0,
            active: commonOption.passive ? player.regenerating : false,
            // El icono de Regeneración solo describe el estado real: si el
            // jugador está KO, lo ve un rival o está a vida máxima, no se
            // dibuja (docs/common-abilities.md, HUD).
            hidden:
              commonOption.passive &&
              (!player.alive ||
                player.enemiesSeeing > 0 ||
                player.hp >= player.maxHp),
            description: commonOption.description
          }
        : null,
      feed: input.killFeed,
      scores: { ...input.teamScores },
      mode: input.mode,
      winner: input.winner
    };
  });
}
