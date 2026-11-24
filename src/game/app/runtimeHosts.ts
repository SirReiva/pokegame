/**
 * Hosts de los sistemas de juego.
 *
 * Agrupan el estado mutable de la sesión (`RuntimeState`) y construyen los
 * adaptadores que consumen `sim/**`, `render/**` y `ai/**`. Así `Game` no
 * mantiene una docena de objetos proxy: construye un único estado y un único
 * grupo de hosts.
 */

import type { AbilityDef, BuffStat, SlowSpec } from '../abilities';
import type { AtmosphereId } from '../atmosphere';
import type { AoeFallenAlly } from '../aoeEffect';
import type { AoeHitInput } from '../aoeEffect';
import type { AbilityHitInput, AnyAbilityDef } from '../abilities';
import type { CombatFxPort } from '../core/ports/fx';
import type { Team } from '../core/team';
import type { FogMask, FogView } from '../fog';
import type { DeviceInputSnapshot } from '../input';
import type { ActorAsset } from '../actorAsset';
import type {
  ActiveAoe,
  MatchPlayerState,
  PendingInstantHit,
  PendingMeleeHit
} from '../matchState';
import type { World } from '../world';
import type { XpSource } from '../xp';
import type {
  AoeSystemHost,
  PendingAoeEnd
} from '../sim/aoes';
import type { AoeResolutionHost } from '../sim/aoeResolution';
import type { AtmosphereSystemHost } from '../sim/atmosphere';
import type { CastSystemHost } from '../sim/cast';
import type { DamageSystemHost, DamageOptions } from '../sim/damage';
import type { DashSystemHost } from '../sim/dash';
import type { HitSystemHost } from '../sim/hits';
import type { KnockoutHost } from '../sim/knockout';
import type { PlayerSystemHost } from '../sim/player';
import type { ProjectileSystemHost } from '../sim/projectiles';
import type { StatusSystemHost } from '../sim/status';
import type { VisionViewHost } from '../render/visionView';

/** Estado interno que comparten todos los hosts. */
export interface RuntimeState {
  readonly projectiles: ProjectileSystemHost['projectiles'];
  readonly matchPlayers: readonly MatchPlayerState[];
  readonly world: World;
  readonly activeAoes: ActiveAoe[];
  readonly pendingAoeEnds: PendingAoeEnd[];
  readonly pendingInstantHits: PendingInstantHit[];
  readonly pendingMeleeHits: PendingMeleeHit[];
  readonly views: readonly MatchPlayerState[];
  readonly visibleByTeam: Record<Team, ReadonlySet<number>>;
  readonly fogMasks: ReadonlyMap<Team, FogMask>;
  readonly fogViews: readonly FogView[];
  readonly simulationStep: number;
  readonly atmosphereVision: number;
  readonly atmosphere: AtmosphereId;
  readonly combatFx: CombatFxPort;

  isMatchOver: () => boolean;
  canHit: (
    attacker: MatchPlayerState,
    target: MatchPlayerState
  ) => boolean;
  applyAbilityDamage: (
    attacker: MatchPlayerState,
    target: MatchPlayerState,
    def: AnyAbilityDef,
    options?: DamageOptions
  ) => boolean;
  resolveAbility: (
    input: AbilityHitInput<MatchPlayerState, AnyAbilityDef>
  ) => void;
  tickAoeTargets: (aoe: ActiveAoe, dt: number) => void;
  removeProjectile: ProjectileSystemHost['removeProjectile'];
  playImpactSound: (effectiveness?: number) => void;
  resolveAoeHit: AoeSystemHost['resolveAoeHit'];
  emitAoeEvent: AoeSystemHost['emitAoeEvent'];
  takeInstantHits: HitSystemHost['takeInstantHits'];
  takeMeleeHits: HitSystemHost['takeMeleeHits'];
  dashSweepHits: HitSystemHost['dashSweepHits'];
  applyKnockback: HitSystemHost['applyKnockback'];
  cancelCast: HitSystemHost['cancelCast'];
  refreshSlowMultiplier: PlayerSystemHost['refreshSlowMultiplier'];
  respawnPlayer: PlayerSystemHost['respawnPlayer'];
  updateCamera: PlayerSystemHost['updateCamera'];
  stepActiveCast: PlayerSystemHost['stepActiveCast'];
  stepDash: PlayerSystemHost['stepDash'];
  buffMultiplier: PlayerSystemHost['buffMultiplier'];
  resolvePosition: PlayerSystemHost['resolvePosition'];
  castAbility: PlayerSystemHost['castAbility'];
  awardXp: StatusSystemHost['awardXp'];
  showHeal: StatusSystemHost['showHeal'];
  assetFor: CastSystemHost['assetFor'];
  queueCast: CastSystemHost['queueCast'];
  dashPosition: DashSystemHost['dashPosition'];
  syncDashCast: DashSystemHost['syncDashCast'];
  showDamage: AtmosphereSystemHost['showDamage'];
  vibrate: AtmosphereSystemHost['vibrate'];
  emitStats: AtmosphereSystemHost['emitStats'];
  activeCastArmor: DamageSystemHost['activeCastArmor'];
  spawnArmorFeedback: DamageSystemHost['spawnArmorFeedback'];
  interruptWithRefund: DamageSystemHost['interruptWithRefund'];
  showDamagePopup: DamageSystemHost['showDamagePopup'];
  showHealPopup: DamageSystemHost['showHealPopup'];
  awardCombatXp: DamageSystemHost['awardCombatXp'];
  vibrateOnDamage: DamageSystemHost['vibrateOnDamage'];
  knockOut: DamageSystemHost['knockOut'];
  clearRepeatCooldown: KnockoutHost['clearRepeatCooldown'];
  playDeathCopies: KnockoutHost['playDeathCopies'];
  spawnDeathMarker: KnockoutHost['spawnDeathMarker'];
  collectAssists: KnockoutHost['collectAssists'];
  pushKillFeed: KnockoutHost['pushKillFeed'];
  awardKillXp: KnockoutHost['awardKillXp'];
  handleModeKnockout: KnockoutHost['handleModeKnockout'];
  viewOf: VisionViewHost['viewOf'];
  refreshCombatVisibility: VisionViewHost['refreshCombatVisibility'];
  updatePickupKnowledge: VisionViewHost['updatePickupKnowledge'];
  applySlow: AoeResolutionHost['applySlow'];
  reviveAoeAlly: AoeResolutionHost['reviveAoeAlly'];
}

export interface RuntimeHosts {
  projectile: ProjectileSystemHost;
  aoe: AoeSystemHost;
  hit: HitSystemHost;
  player: PlayerSystemHost;
  status: StatusSystemHost;
  cast: CastSystemHost;
  dash: DashSystemHost;
  atmosphere: AtmosphereSystemHost;
  damage: DamageSystemHost;
  knockout: KnockoutHost;
  vision: VisionViewHost;
  aoeResolution: AoeResolutionHost;
}

export function createRuntimeHosts(state: RuntimeState): RuntimeHosts {
  return {
    projectile: {
      get projectiles() {
        return state.projectiles;
      },
      get matchPlayers() {
        return state.matchPlayers;
      },
      get world() {
        return state.world;
      },
      combatFx: state.combatFx,
      isMatchOver: state.isMatchOver,
      canHit: state.canHit,
      resolveAbility: state.resolveAbility,
      removeProjectile: state.removeProjectile,
      playImpactSound: state.playImpactSound
    },
    aoe: {
      get activeAoes() {
        return state.activeAoes;
      },
      get pendingAoeEnds() {
        return state.pendingAoeEnds;
      },
      isMatchOver: state.isMatchOver,
      resolveAoeHit: state.resolveAoeHit,
      tickAoeTargets: state.tickAoeTargets,
      emitAoeEvent: state.emitAoeEvent
    },
    hit: {
      takeInstantHits: state.takeInstantHits,
      takeMeleeHits: state.takeMeleeHits,
      get world() {
        return state.world;
      },
      combatFx: state.combatFx,
      isMatchOver: state.isMatchOver,
      canHit: state.canHit,
      dashSweepHits: state.dashSweepHits,
      resolveAbility: state.resolveAbility,
      applyKnockback: state.applyKnockback,
      cancelCast: state.cancelCast
    },
    player: {
      get atmosphere() {
        return state.atmosphere;
      },
      refreshSlowMultiplier: state.refreshSlowMultiplier,
      respawnPlayer: state.respawnPlayer,
      updateCamera: state.updateCamera,
      stepActiveCast: state.stepActiveCast,
      stepDash: state.stepDash,
      buffMultiplier: state.buffMultiplier,
      resolvePosition: state.resolvePosition,
      castAbility: state.castAbility
    },
    status: {
      isMatchOver: state.isMatchOver,
      awardXp: state.awardXp,
      showHeal: state.showHeal
    },
    cast: {
      isMatchOver: state.isMatchOver,
      assetFor: state.assetFor,
      queueCast: state.queueCast,
      updateCamera: state.updateCamera
    },
    dash: {
      get matchPlayers() {
        return state.matchPlayers;
      },
      get pendingInstantHits() {
        return state.pendingInstantHits;
      },
      combatFx: state.combatFx,
      isMatchOver: state.isMatchOver,
      dashPosition: state.dashPosition,
      canHit: state.canHit,
      dashSweepHits: state.dashSweepHits,
      syncDashCast: state.syncDashCast,
      updateCamera: state.updateCamera
    },
    atmosphere: {
      isMatchOver: state.isMatchOver,
      showDamage: state.showDamage,
      vibrate: state.vibrate,
      emitStats: state.emitStats
    },
    damage: {
      combatFx: state.combatFx,
      get atmosphere() {
        return state.atmosphere;
      },
      buffMultiplier: state.buffMultiplier,
      applySlow: state.applySlow,
      refreshSlowMultiplier: state.refreshSlowMultiplier,
      activeCastArmor: state.activeCastArmor,
      spawnArmorFeedback: state.spawnArmorFeedback,
      interruptWithRefund: state.interruptWithRefund,
      applyKnockback: state.applyKnockback,
      playImpactSound: state.playImpactSound,
      showDamagePopup: state.showDamagePopup,
      showHealPopup: state.showHealPopup,
      awardCombatXp: state.awardCombatXp,
      awardXp: state.awardXp,
      vibrateOnDamage: state.vibrateOnDamage,
      knockOut: state.knockOut
    },
    knockout: {
      isMatchOver: state.isMatchOver,
      assetFor: state.assetFor,
      cancelCast: state.cancelCast,
      clearRepeatCooldown: state.clearRepeatCooldown,
      playDeathCopies: state.playDeathCopies,
      spawnDeathMarker: state.spawnDeathMarker,
      collectAssists: state.collectAssists,
      pushKillFeed: state.pushKillFeed,
      awardKillXp: state.awardKillXp,
      handleModeKnockout: state.handleModeKnockout,
      emitStats: state.emitStats
    },
    vision: {
      get players() {
        return state.matchPlayers;
      },
      get views() {
        return state.views;
      },
      get colliders() {
        return state.world.colliders;
      },
      get atmosphereVision() {
        return state.atmosphereVision;
      },
      get simulationStep() {
        return state.simulationStep;
      },
      get visibleByTeam() {
        return state.visibleByTeam;
      },
      get fogMasks() {
        return state.fogMasks;
      },
      get fogViews() {
        return state.fogViews;
      },
      viewOf: state.viewOf,
      refreshCombatVisibility: state.refreshCombatVisibility,
      updatePickupKnowledge: state.updatePickupKnowledge
    },
    aoeResolution: {
      get combatFx() {
        return state.combatFx;
      },
      get matchPlayers() {
        return state.matchPlayers;
      },
      get world() {
        return state.world;
      },
      get pendingAoeEnds() {
        return state.pendingAoeEnds;
      },
      isMatchOver: state.isMatchOver,
      canHit: state.canHit,
      applyAbilityDamage: state.applyAbilityDamage,
      interruptWithRefund: state.interruptWithRefund,
      applyKnockback: state.applyKnockback,
      applySlow: state.applySlow,
      reviveAoeAlly: state.reviveAoeAlly,
      showHealPopup: state.showHealPopup,
      awardXp: state.awardXp
    }
  };
}

// Tipos auxiliares re-exportados para que `Game` construya el estado con las
// mismas firmas que los hosts.
export type {
  AbilityDef,
  AoeFallenAlly,
  AoeHitInput,
  BuffStat,
  DamageOptions,
  DeviceInputSnapshot,
  SlowSpec,
  ActorAsset,
  XpSource
};
