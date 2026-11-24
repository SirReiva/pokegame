/**
 * Decisión de alto nivel de los bots.
 *
 * Elige entre retirarse, curarse, recoger un objeto, revivir o curar aliados y
 * atacar. También puntúa las habilidades disponibles y calcula el daño y la
 * probabilidad de impacto esperados.
 *
 * No conoce el control del actor ni la percepción: el controlador le entrega el
 * estado compartido y las operaciones auxiliares mediante `BotDecisionContext`.
 */

import {
  ABILITIES,
  type AbilityDef,
  type BuffStat,
  type StatusSpec
} from '../abilities';
import { isDamageStatus } from '../core/abilities/specs';
import {
  atmosphereIncomingMultiplier,
  atmosphereMoveMultiplier,
  atmosphereShapeMultiplier,
  type AtmosphereId
} from '../atmosphere';
import { aoeAreaFrom, aoeRadialFalloff, type AoeArea } from '../aoeGeometry';
import { castMovementMultiplier } from '../core/abilities/movement';
import type { NavPoint } from '../botNav';
import { computeDamage } from '../combat';
import { CONFIG, DEG } from '../config';
import { isOvertimeMode } from '../core/abilities/styles';
import type { PickupSpawn } from '../items';
import type { MatchPlayerState } from '../matchState';
import { maxHitRadius } from '../roster';
import { terrainAt, terrainTeam } from '../terrain';
import type { Collider } from '../world';
import { clamp, directionTo } from './math';
import type {
  BotHelpCall,
  FightAssessment,
  HazardEvasion,
  IncomingThreat,
  TargetPrediction,
  Vec2
} from './types';
import type { BotTuning } from './tuning';

/** Vida por debajo de la cual una pelea con desventaja de tipo justifica huir. */
const MATCHUP_RETREAT_HP = 0.6;
/**
 * Diferencia mínima de efectividad para considerar que el rival nos supera.
 * Con la escala plana un escalón son 0,05, así que 0,04 detecta una ventaja
 * real sin dispararse por el ruido de coma flotante de los productos.
 */
const MATCHUP_RETREAT_EDGE = 0.04;
/** Escala del cooldown de habilidad frente a la referencia de la puntuación. */
const COOLDOWN_REFERENCE = 4;
const COOLDOWN_WEIGHT_MIN = 0.45;
const COOLDOWN_WEIGHT_MAX = 1.25;
/** Penalización por repetir la misma habilidad en la puntuación. */
const REPEAT_SCORE_FACTOR = 1.5;
/** Mitigación a partir de la cual una habilidad grande no compensa. */
const BIG_ABILITY_MITIGATION_THRESHOLD = 0.4;
const LETHAL_BONUS = 60;
const FINISH_BONUS = 18;
/** Fracción de vida del rival por debajo de la cual se valora rematarlo. */
const FINISH_HP_FRACTION = 0.18;
/**
 * Puntos extra por cada segundo de hitstun por encima del global. Si todas las
 * habilidades usan el valor por defecto, el término vale 0 y no altera la
 * rotación; solo premia a las que declaran un stun más largo.
 */
const HITSTUN_SCORE_PER_SECOND = 120;
/**
 * Puntuación conservadora para resoluciones propias que declaran daño o
 * control sin exponer una magnitud en `props`. Solo se aplica cuando la
 * habilidad lo marca con `.bot({ customDamage / customControl })`.
 */
const CUSTOM_DAMAGE_SCORE = 25;
const CUSTOM_CONTROL_SCORE = 18;

/**
 * Daño esperado de un estado de daño completo: daño fijo por tick × número de
 * ticks. Protección lo reduce; la efectividad de tipo y el crítico no lo
 * afectan.
 */
function expectedDotDamage(
  target: MatchPlayerState,
  status: StatusSpec | null | undefined
): number {
  if (!isDamageStatus(status) || status.damage <= 0 || status.duration <= 0) {
    return 0;
  }
  const interval =
    status.interval !== undefined && status.interval > 0
      ? status.interval
      : 1;
  const ticks = Math.max(1, Math.ceil(status.duration / interval));
  const reduction =
    target.damageReductionTimer > 0 ? target.damageReduction : 0;
  return Math.max(1, Math.round(status.damage * ticks * (1 - reduction)));
}

/** Valor conservador de un estado de control, según su duración y fuerza. */
function expectedControlScore(status: StatusSpec): number {
  const durationFactor = clamp(status.duration / 2.5, 0.4, 1.5);
  switch (status.kind) {
    case 'frozen':
      return (
        (15 + clamp(1 - status.multiplier, 0, 1) * 70) * durationFactor
      );
    case 'asleep':
      return 60 * durationFactor;
    case 'paralyzed':
      return 40 * durationFactor;
    default:
      return 0;
  }
}

/** Bonus por interrumpir una curación o reanimación enemiga. */
const SUPPORT_DENY_BONUS = 35;
/** Puntuación mínima para gastar una habilidad. */
const MIN_ABILITY_SCORE = 0;

const RETREAT_DANGER_RADIUS = 9;
const RETREAT_PURSUER_RADIUS = 8;
const RETREAT_PURSUIT_EXTENSION = 2.5;
const RETREAT_COVER_SECONDS = 3;
const RETREAT_ARRIVE_DISTANCE = 2.5;
const RETREAT_LOSING_HP = 0.6;
const RETREAT_OUTNUMBERED_HP = 0.65;

const REGEN_START_HP = 0.55;
const REGEN_RETREAT_HP = 0.5;
const REGEN_STOP_HP = 0.8;
const REGEN_MAX_SECONDS = 7;
const REGEN_COOLDOWN_SECONDS = 4;

/** Vida por debajo de la cual el bot busca una poción conocida. */
const PICKUP_SEEK_HP = 0.7;

/** Estado mutable del controlador que lee y escribe la decisión. */
export interface BotDecisionState {
  readonly clock: number;
  readonly atmosphere: AtmosphereId;
  target: MatchPlayerState | null;
  targetVisible: boolean;
  targetMatchupOffense: number;
  targetMatchupDefense: number;
  hazardEvasion: HazardEvasion | null;
  threat: IncomingThreat | null;
  /**
   * Rivales vivos del otro equipo visibles en este paso. Es la misma instancia
   * que reconstruye `updateTarget`, así que solo se puede leer: mutarla
   * corrompería la lista que verán el resto de consumidores.
   */
  readonly visibleEnemies: readonly MatchPlayerState[];
  visibleTimer: number;
  abilitySlot: number | null;
  supportCast: boolean;
  useCommon: boolean;
  recovering: boolean;
  regenUntil: number;
  regenCooldownUntil: number;
  regenGoal: Vec2 | null;
  regenGoalTimer: number;
  regenCheckTimer: number;
  retreat: boolean;
  retreatUntil: number;
  retreatCooldownUntil: number;
  retreatCover: Vec2 | null;
  retreatCoverUntil: number;
  retreatSanctuary: Vec2 | null;
  lastSeen: { x: number; z: number; at: number; slot: number } | null;
  patrolTimer: number;
  objective: { x: number; z: number; radius: number } | null;
  path: NavPoint[];
  pathTimer: number;
}

/**
 * Datos y operaciones del controlador que necesita la decisión.
 *
 * Los helpers siguen viviendo en `BotController`: aquí solo se exponen los que
 * usa esta capa, sin pasar el controlador completo.
 */
export interface BotDecisionContext {
  readonly tuning: BotTuning;
  readonly state: BotDecisionState;
  /** Umbral de intercambio para considerar una pelea perdida. */
  readonly retreatExchangeLoss: number;
  /** Radio en el que una amenaza impide regenerarse. */
  readonly regenDangerRadius: number;
  /** Vida por debajo de la cual se atiende una llamada de ayuda. */
  readonly helpCallHp: number;
  /** Potencia a partir de la cual una habilidad es «grande». */
  readonly bigAbilityPower: number;

  releasePickupClaim(self: MatchPlayerState): void;
  releaseReviveClaims(self: MatchPlayerState): void;
  clearPlannedDamage(self: MatchPlayerState): void;
  nearestVisibleEnemyDistance(self: MatchPlayerState): number;
  findHealSlot(self: MatchPlayerState): number | null;
  pickupTarget(self: MatchPlayerState): PickupSpawn | null;
  assessFight(
    self: MatchPlayerState,
    target: MatchPlayerState,
    pickup: PickupSpawn | null,
    colliders: readonly Collider[]
  ): FightAssessment;
  stopRetreat(cooldown: boolean): void;
  nearestOwnSanctuaryPoint(self: MatchPlayerState): Vec2 | null;
  retreatTime(self: MatchPlayerState, pickup: PickupSpawn | null): number;
  pickRetreatCover(
    self: MatchPlayerState,
    colliders: readonly Collider[]
  ): Vec2 | null;
  regenSegmentHidden(
    self: MatchPlayerState,
    point: Vec2,
    colliders: readonly Collider[],
    enemies: readonly MatchPlayerState[]
  ): boolean;
  claimPickup(self: MatchPlayerState, pickup: PickupSpawn): void;
  setGoal(goal: Vec2, pickup?: PickupSpawn | null): void;
  chooseSupportAbility(
    self: MatchPlayerState,
    players: readonly MatchPlayerState[],
    colliders: readonly Collider[]
  ): number | null;
  seekObjective(self: MatchPlayerState): boolean;
  updatePatrol(self: MatchPlayerState): void;
  teamHelp(self: MatchPlayerState): BotHelpCall | null;
  squadLastSeen(self: MatchPlayerState): { x: number; z: number } | null;
  isSupportSlot(self: MatchPlayerState, slot: number): boolean;

  supportScore(
    self: MatchPlayerState,
    players: readonly MatchPlayerState[],
    def: AbilityDef,
    colliders: readonly Collider[]
  ): number;
  predictTarget(
    self: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef | null
  ): TargetPrediction;
  canHitPrediction(
    self: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef,
    prediction: TargetPrediction,
    colliders: readonly Collider[]
  ): boolean;
  pickWithDecisionError(
    candidates: readonly { slot: number; score: number }[],
    bestSlot: number | null,
    bestScore: number,
    minScore: number
  ): number | null;
  claimSupportRevives(
    self: MatchPlayerState,
    players: readonly MatchPlayerState[],
    def: AbilityDef,
    colliders: readonly Collider[]
  ): void;
  commitPlannedDamage(
    self: MatchPlayerState,
    target: MatchPlayerState,
    slot: number
  ): void;

  castArmorAbsorbs(
    target: MatchPlayerState,
    def: AbilityDef,
    damage: number
  ): boolean;
  breaksCastArmor(
    target: MatchPlayerState,
    def: AbilityDef,
    damage: number
  ): boolean;
  committedDamageOn(self: MatchPlayerState, target: MatchPlayerState): number;
  damageTakenFactor(target: MatchPlayerState, def: AbilityDef | null): number;
  nextCastCooldown(self: MatchPlayerState, slot: number): number;
  buffValue(
    self: MatchPlayerState,
    def: AbilityDef,
    hpFraction: number
  ): number;
  countExtraAbilityTargets(
    self: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef,
    prediction: TargetPrediction,
    colliders: readonly Collider[]
  ): number;
  armorCastBonus(self: MatchPlayerState, def: AbilityDef): number;
  repeatCooldownExtra(self: MatchPlayerState, slot: number): number;
  isSupportRecovery(def: AbilityDef): boolean;

  aoeEscapeDistance(area: AoeArea, x: number, z: number): number;
  effectiveSpeed(player: MatchPlayerState): number;
  statMultiplier(player: MatchPlayerState, stat: BuffStat): number;
}

export class BotDecision {
  private readonly ctx: BotDecisionContext;

  constructor(context: BotDecisionContext) {
    this.ctx = context;
  }

  private get state(): BotDecisionState {
    return this.ctx.state;
  }

  decide(
    self: MatchPlayerState,
    players: readonly MatchPlayerState[],
    colliders: readonly Collider[]
  ): void {
    const target = this.state.target;
    const targetIsVisible =
      target !== null && this.state.targetVisible && target.alive;
    const distance = target
      ? Math.hypot(target.x - self.x, target.z - self.z)
      : Infinity;
    const hpFraction = self.hp / Math.max(1, self.maxHp);
    this.state.abilitySlot = null;
    this.state.supportCast = false;
    this.state.useCommon = false;
    this.ctx.releasePickupClaim(self);
    this.ctx.releaseReviveClaims(self);
    // Cualquier decisión nueva invalida el daño comprometido en la anterior,
    // incluso si acaba eligiendo una habilidad de apoyo o ninguna.
    this.ctx.clearPlannedDamage(self);
    // Con un peligro ya encima, Impulso es una salida válida aunque no haya un
    // rival cerca: la rama de huida de `drive` solo necesita saber si toca
    // intentarlo.
    if (this.state.hazardEvasion && self.commonAbilityId === 'impulso') {
      this.state.useCommon =
        Math.random() < this.ctx.tuning.commonChance;
    }

    // Lectura de tipos del objetivo: huir antes si nos supera claramente en
    // efectividad. La escala plana mueve el daño poco, así que se exige un
    // escalón completo de diferencia y no cualquier décima.
    const targetOffense = target ? this.state.targetMatchupOffense : 1;
    const targetDefense = target ? this.state.targetMatchupDefense : 1;
    const outmatchedFight =
      targetIsVisible &&
      targetDefense > 1 &&
      targetDefense - targetOffense >= MATCHUP_RETREAT_EDGE;
    const badFight =
      outmatchedFight && hpFraction < MATCHUP_RETREAT_HP;

    // La visión es compartida: un rival al otro lado del mapa visto por un
    // aliado no debe mantener al bot huyendo. Solo cuenta una amenaza cercana.
    const nearestEnemy = this.ctx.nearestVisibleEnemyDistance(self);
    const regenBot = self.commonAbilityId === 'regeneracion';
    const atBase =
      Math.hypot(self.x - self.spawn.x, self.z - self.spawn.z) <=
      RETREAT_ARRIVE_DISTANCE;
    const hidden = self.enemiesSeeing === 0;
    // Regeneración solo funciona si ningún rival le ve. Un windup visible que
    // todavía puede alcanzarle también hace peligroso quedarse quieto.
    const regenSafe =
      hidden &&
      nearestEnemy > this.ctx.regenDangerRadius &&
      this.state.threat === null &&
      this.state.hazardEvasion === null;
    const canRecover =
      (regenBot && regenSafe) || this.ctx.findHealSlot(self) !== null;
    // Los objetos se conocen por posición desde el principio. Si el equipo ya
    // ve uno usado, `pickupTarget` lo descarta sin necesidad de ir hasta él.
    const pickup =
      hpFraction < PICKUP_SEEK_HP ? this.ctx.pickupTarget(self) : null;

    // La retirada ya no usa solo la vida: compara el intercambio de daño,
    // cuenta los vivos de cada equipo, los recursos disponibles y la facilidad
    // de escapar. El umbral resultante es mayor para cristales y menor para
    // tanques o bots con escudo/curación.
    const fight =
      targetIsVisible && target
        ? this.ctx.assessFight(self, target, pickup, colliders)
        : null;
    const retreatHp = regenBot
      ? Math.max(
          fight?.retreatHp ?? this.ctx.tuning.retreatHp,
          REGEN_RETREAT_HP
        )
      : (fight?.retreatHp ?? this.ctx.tuning.retreatHp);
    const lowHp = hpFraction < retreatHp;
    const losingFight =
      fight !== null &&
      fight.exchange < this.ctx.retreatExchangeLoss &&
      hpFraction < RETREAT_LOSING_HP;
    const outnumbered =
      fight !== null &&
      fight.allyDiff <= -1 &&
      hpFraction < RETREAT_OUTNUMBERED_HP;
    const wantsRetreat = lowHp || badFight || losingFight || outnumbered;

    if (this.state.recovering) {
      // Deja de esperar si le ven, se acerca un rival, hay una amenaza en curso
      // o ya ha recuperado suficiente vida. El tope de tiempo evita que un bot
      // se quede escondido indefinidamente si la pelea está en otro sitio.
      const done =
        !regenBot ||
        !regenSafe ||
        hpFraction >= REGEN_STOP_HP ||
        this.state.clock >= this.state.regenUntil;
      if (done) {
        this.state.recovering = false;
        this.state.regenCooldownUntil =
          this.state.clock + REGEN_COOLDOWN_SECONDS;
        this.state.regenGoal = null;
        this.state.regenGoalTimer = 0;
        this.state.regenCheckTimer = 0;
        this.state.lastSeen = null;
        this.state.patrolTimer = 0;
      }
    }

    if (this.state.retreat) {
      if (
        !wantsRetreat ||
        nearestEnemy > RETREAT_DANGER_RADIUS
      ) {
        // El peligro ya pasó: vuelve a la acción sin esperar.
        this.ctx.stopRetreat(false);
      } else if (regenBot && regenSafe && hpFraction < REGEN_STOP_HP) {
        // Ya está oculto: mejor curarse aquí que seguir corriendo a la base.
        this.ctx.stopRetreat(false);
      } else if (atBase && !canRecover) {
        // La base no cura por sí sola. Quedarse plantado allí solo regala una
        // baja; es mejor volver a patrullar y buscar una pelea favorable.
        this.ctx.stopRetreat(true);
      } else if (this.state.clock >= this.state.retreatUntil) {
        if (!atBase && nearestEnemy <= RETREAT_PURSUER_RADIUS) {
          // La huida calculada terminó, pero el perseguidor sigue encima: no
          // se da por segura hasta romper la distancia.
          this.state.retreatUntil =
            this.state.clock + RETREAT_PURSUIT_EXTENSION;
        } else {
          this.ctx.stopRetreat(true);
        }
      }
    }

    if (
      !this.state.recovering &&
      regenBot &&
      regenSafe &&
      self.activeCast === null &&
      hpFraction < REGEN_START_HP &&
      this.state.clock >= this.state.regenCooldownUntil
    ) {
      this.state.recovering = true;
      this.state.regenUntil = this.state.clock + REGEN_MAX_SECONDS;
      this.state.regenGoal = null;
      this.state.regenGoalTimer = 0;
      this.state.regenCheckTimer = 0;
      this.state.retreat = false;
      this.state.lastSeen = null;
      this.state.path = [];
      this.state.pathTimer = 0;
    }

    if (this.state.recovering) {
      // Cualquier ataque o habilidad cortaría la regeneración: el bot se mueve
      // despacio por cobertura y no dispara hasta que termine o lo descubran.
      this.state.abilitySlot = null;
      this.state.useCommon = false;
      return;
    }

    if (
      !this.state.retreat &&
      wantsRetreat &&
      nearestEnemy <= RETREAT_DANGER_RADIUS &&
      this.state.clock >= this.state.retreatCooldownUntil &&
      !(atBase && !canRecover)
    ) {
      this.state.retreat = true;
      // El santuario propio es la primera opción: una vez dentro, los rivales
      // cuerpo a cuerpo no pueden seguirlo. Si no hay ninguno cerca, se usará
      // la cobertura o la base como hasta ahora.
      this.state.retreatSanctuary = this.ctx.nearestOwnSanctuaryPoint(self);
      this.state.retreatUntil =
        this.state.clock + this.ctx.retreatTime(self, pickup);
      this.state.retreatCover = this.ctx.pickRetreatCover(self, colliders);
      this.state.retreatCoverUntil =
        this.state.clock + RETREAT_COVER_SECONDS;
    }

    // Huida: se planta a curarse si tiene una curación fiable lista y el rival
    // no está encima. Si no, corre hacia su base.
    if (this.state.retreat) {
      const healSlot = this.ctx.findHealSlot(self);
      if (healSlot !== null && distance > 3.2) {
        this.state.abilitySlot = healSlot;
      }
      this.state.useCommon = this.shouldUseCommon(
        self,
        distance,
        true,
        hpFraction
      );
      let cover = this.state.retreatCover;
      if (cover) {
        // `visibleEnemies` ya solo contiene rivales vivos del otro equipo.
        const coverEnemies = this.state.visibleEnemies;
        const stale =
          this.state.clock >= this.state.retreatCoverUntil ||
          Math.hypot(cover.x - self.x, cover.z - self.z) < 0.9 ||
          coverEnemies.length === 0 ||
          !this.ctx.regenSegmentHidden(
            self,
            cover,
            colliders,
            coverEnemies
          );
        if (stale) {
          cover = null;
          this.state.retreatCover = null;
        }
      }
      const insideOwnSanctuary =
        terrainTeam(terrainAt(self.x, self.z)) === self.team;
      // Ya refugiado, no cruza el mapa por una poción exterior: primero
      // conserva la ventaja del santuario. Solo sale si la poción también está
      // dentro de su territorio.
      const pickupSafe =
        pickup !== null &&
        (!insideOwnSanctuary ||
          terrainTeam(terrainAt(pickup.x, pickup.z)) === self.team);
      if (pickup && pickupSafe) {
        this.ctx.claimPickup(self, pickup);
        this.ctx.setGoal(pickup, pickup);
      } else if (insideOwnSanctuary) {
        // Ya está a salvo del cuerpo a cuerpo: no abandona el santuario para
        // esconderse en una cobertura peor. Si su base también está dentro,
        // se acerca a ella; si no, mantiene la posición protegida.
        const spawnInSanctuary =
          terrainTeam(terrainAt(self.spawn.x, self.spawn.z)) === self.team;
        this.ctx.setGoal(
          spawnInSanctuary ? self.spawn : { x: self.x, z: self.z }
        );
      } else if (this.state.retreatSanctuary) {
        this.ctx.setGoal(this.state.retreatSanctuary);
      } else if (cover) {
        this.ctx.setGoal(cover);
      } else {
        this.ctx.setGoal(self.spawn);
      }
      return;
    }

    // Las áreas de apoyo (revivir o curar aliados) se pueden lanzar sin un
    // rival a la vista. Si hay una pelea útil, `chooseAbility` ya suma su valor
    // y decide si compensa; fuera de combate el apoyo manda sobre patrullar o
    // recoger un objeto.
    const supportSlot = this.ctx.chooseSupportAbility(
      self,
      players,
      colliders
    );
    if (supportSlot !== null && !targetIsVisible) {
      this.state.abilitySlot = supportSlot;
      this.state.supportCast = true;
      return;
    }

    // Sin rival a la vista, un bot dañado prefiere acercarse a un objeto
    // conocido antes que perseguir una posición recordada o patrullar.
    if (pickup && !targetIsVisible) {
      this.ctx.claimPickup(self, pickup);
      this.ctx.setGoal(pickup, pickup);
      return;
    }

    if (
      targetIsVisible &&
      this.state.visibleTimer >= this.ctx.tuning.reaction
    ) {
      this.state.abilitySlot = this.chooseAbility(
        self,
        target,
        players,
        colliders
      );
      this.state.supportCast =
        this.state.abilitySlot !== null &&
        this.ctx.isSupportSlot(self, this.state.abilitySlot);
      this.state.useCommon = this.shouldUseCommon(
        self,
        distance,
        false,
        hpFraction
      );
      return;
    }

    // Sin objetivo visible, acudir a la llamada de ayuda de un aliado herido
    // tiene prioridad sobre perseguir una posición recordada.
    const help = this.ctx.teamHelp(self);
    if (
      help &&
      help.slot !== self.slot &&
      help.until > this.state.clock &&
      hpFraction > this.ctx.helpCallHp
    ) {
      this.ctx.setGoal({ x: help.x, z: help.z });
      return;
    }

    const ownMemory =
      this.state.lastSeen &&
      this.state.clock - this.state.lastSeen.at <= this.ctx.tuning.memory
        ? this.state.lastSeen
        : null;
    const memory = ownMemory ?? this.ctx.squadLastSeen(self);
    if (memory && !this.state.objective) {
      this.ctx.setGoal({ x: memory.x, z: memory.z });
      return;
    }

    // En los modos de objetivo la zona conocida pesa más que una posición
    // recordada: los bots deben volver a la colina aunque hayan perdido de
    // vista al rival.
    if (this.ctx.seekObjective(self)) return;

    if (memory) {
      this.ctx.setGoal({ x: memory.x, z: memory.z });
      return;
    }

    this.ctx.updatePatrol(self);
  }

  private shouldUseCommon(
    self: MatchPlayerState,
    distance: number,
    retreating: boolean,
    hpFraction: number
  ): boolean {
    if (self.commonAbilityId === 'regeneracion') return false;
    if (self.cooldowns[4] > 0.001 || self.damageReductionTimer > 0) return false;
    if (Math.random() > this.ctx.tuning.commonChance) return false;

    if (self.commonAbilityId === 'proteccion') {
      return hpFraction < 0.58 && distance < 5.5;
    }
    if (self.commonAbilityId === 'impulso') {
      if (retreating) return distance < 4.2;
      return distance > 2.2 && distance < 5.2;
    }
    return false;
  }

  private chooseAbility(
    self: MatchPlayerState,
    target: MatchPlayerState,
    players: readonly MatchPlayerState[],
    colliders: readonly Collider[]
  ): number | null {
    let bestSlot: number | null = null;
    let bestScore = -Infinity;
    const candidates: { slot: number; score: number }[] = [];

    for (let slot = 0; slot < 4; slot++) {
      if (self.cooldowns[slot] > 0.001) continue;
      const id = self.abilityIds[slot];
      const def = id ? ABILITIES[id] : null;
      if (!def) continue;
      const support = this.ctx.supportScore(self, players, def, colliders);
      // Las áreas de apoyo se centran en el bot: no necesitan que haya un
      // rival dentro de su alcance para ser útiles.
      const prediction = this.ctx.predictTarget(self, target, def);
      const inRange = this.ctx.canHitPrediction(
        self,
        target,
        def,
        prediction,
        colliders
      );
      if (!inRange && support <= 0) continue;
      if (def.selfDamage > 0 && self.hp / Math.max(1, self.maxHp) < 0.52) {
        continue;
      }

      let score = inRange
        ? this.scoreAbility(
            self,
            target,
            def,
            slot,
            prediction,
            support,
            colliders
          )
        : -Infinity;
      if (support > 0) {
        score = score === -Infinity ? support : score + support;
      }
      candidates.push({ slot, score });
      if (score > bestScore) {
        bestScore = score;
        bestSlot = slot;
      }
    }

    // Ninguna opción aporta lo suficiente: es mejor no gastar el cooldown y
    // seguir moviéndose que lanzar una cura o un buff inútil.
    const chosenSlot = this.ctx.pickWithDecisionError(
      candidates,
      bestSlot,
      bestScore,
      MIN_ABILITY_SCORE
    );
    if (chosenSlot === null) return null;
    const bestId = self.abilityIds[chosenSlot];
    const bestDef = bestId ? ABILITIES[bestId] : null;
    if (bestDef) {
      this.ctx.claimSupportRevives(self, players, bestDef, colliders);
    }
    this.ctx.commitPlannedDamage(self, target, chosenSlot);
    return chosenSlot;
  }

  private scoreAbility(
    self: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef,
    slot: number,
    prediction: TargetPrediction,
    support: number,
    colliders: readonly Collider[]
  ): number {
    const hpFraction = self.hp / Math.max(1, self.maxHp);
    const hasEffect =
      def.props.power > 0 ||
      def.props.status !== null ||
      def.healSelf > 0 ||
      def.props.slow !== null ||
      def.props.knockback > 0 ||
      def.buffs.length > 0 ||
      def.bot?.customDamage === true ||
      def.bot?.customControl === true ||
      (def.shape === 'self' && def.shield) ||
      def.shape === 'dash';
    if (!hasEffect) return -Infinity;

    const hitChance = this.hitChance(self, target, def, prediction);
    const expectedDamage = this.expectedDamage(
      self,
      target,
      def,
      prediction
    );
    const expectedHit = expectedDamage * hitChance;
    // La armadura del casteo rival absorbe el control de este golpe: el daño
    // entra, pero no hay hitstun, empuje ni cancelación.
    const armorAbsorbed = this.ctx.castArmorAbsorbs(
      target,
      def,
      expectedDamage
    );

    const offensive =
      def.props.power > 0 ||
      def.props.status !== null ||
      def.props.slow !== null ||
      def.bot?.customDamage === true ||
      def.bot?.customControl === true;
    // La gracia de reaparición se ve como estado, pero no su tiempo restante:
    // mientras esté activa no se gasta una habilidad ofensiva en ese rival.
    if (offensive && target.invulnerableTimer > 0) return -Infinity;

    const cooldownWeight = clamp(
      COOLDOWN_REFERENCE /
        Math.max(0.5, this.ctx.nextCastCooldown(self, slot)),
      COOLDOWN_WEIGHT_MIN,
      COOLDOWN_WEIGHT_MAX
    );
    let score = 0;

    if (
      def.props.power > 0 ||
      def.props.status !== null ||
      def.bot?.customDamage === true ||
      def.bot?.customControl === true
    ) {
      const bigAbility =
        slot === 3 || def.props.power >= this.ctx.bigAbilityPower;
      const dealsDamage =
        def.props.power > 0 ||
        def.props.status !== null ||
        def.bot?.customDamage === true;
      // Si un compañero ya ha comprometido daño suficiente para tumbarlo, no
      // se gasta otra definitiva en el mismo objetivo.
      if (
        bigAbility &&
        dealsDamage &&
        this.ctx.committedDamageOn(self, target) >= target.hp
      ) {
        return -Infinity;
      }
      const mitigation = 1 - this.ctx.damageTakenFactor(target, def);
      // El escudo ya rebaja el daño esperado, pero una habilidad grande cuyo
      // golpe entra muy reducido no compensa su cooldown. El DoT es fijo y no
      // pasa por la efectividad de tipo, así que no se veta por mitigación.
      if (
        def.props.power > 0 &&
        mitigation >= BIG_ABILITY_MITIGATION_THRESHOLD &&
        bigAbility
      ) {
        return -Infinity;
      }
      score += expectedHit * cooldownWeight;
      // Una resolución propia sin magnitud declarada recibe una estimación
      // conservadora para que no se descarte por tener `props.power: 0`.
      if (
        def.bot?.customDamage === true &&
        def.props.power <= 0 &&
        !isDamageStatus(def.props.status)
      ) {
        score += CUSTOM_DAMAGE_SCORE * hitChance;
      }
      if (def.bot?.customControl === true && !armorAbsorbed) {
        score += CUSTOM_CONTROL_SCORE * hitChance;
      }
      // Un impacto también aplica hitstun y cancela dash/preparaciones, salvo
      // que la armadura del casteo lo absorba.
      if (!armorAbsorbed) {
        score += 8 * hitChance;
        const extraHitstun = Math.max(
          0,
          def.props.hitstun - CONFIG.combat.hitstunSeconds
        );
        if (extraHitstun > 0) {
          score += extraHitstun * HITSTUN_SCORE_PER_SECOND * hitChance;
        }
      }
      if (expectedHit >= target.hp) {
        score += LETHAL_BONUS;
      } else if (
        target.hp - expectedHit <=
        target.maxHp * FINISH_HP_FRACTION
      ) {
        score += FINISH_BONUS;
      }
    }

    if (def.healSelf > 0) {
      let healScore = 70 + (1 - hpFraction) * 130;
      // `healOnHit` solo cura si el golpe conecta.
      if (def.props.healOnHit) healScore *= hitChance;
      score += healScore;
      // No gastar la curación a vida casi llena, salvo que también cure a
      // aliados heridos: entonces el lanzamiento sí aporta.
      if (hpFraction > 0.8 && support <= 0) score -= 220;
    }
    if (def.shape === 'self' && def.shield) score += 55 + (1 - hpFraction) * 70;
    if (def.buffs.length > 0) {
      score += this.ctx.buffValue(self, def, hpFraction);
    }
    if (def.props.slow) {
      const slowStrength = clamp(1 - def.props.slow.multiplier, 0, 1);
      const durationFactor = clamp(def.props.slow.duration / 2.5, 0.4, 1.5);
      score +=
        (15 + slowStrength * 70) * durationFactor * hitChance;
    }
    // El daño en el tiempo ya entra en `expectedDamage`; los estados de
    // control se valoran aquí para que una habilidad de estado no puntúe 0.
    if (def.props.status && !isDamageStatus(def.props.status)) {
      score += expectedControlScore(def.props.status) * hitChance;
    }
    if (def.props.knockback > 0 && !armorAbsorbed) {
      score += Math.min(20, def.props.knockback * 12) * hitChance;
    }

    switch (def.shape) {
      case 'melee':
        score += 12;
        break;
      case 'projectile':
      case 'beam':
        score += prediction.distance > 2.5 ? 16 : 0;
        break;
      case 'dash':
        score += 10;
        if (def.props.power === 0) score += 35; // reposicionamiento / huida
        break;
      case 'aoe':
        score += 12;
        break;
      case 'self':
        score += 28;
        break;
    }

    // Un cono, un haz que atraviesa, un proyectil con `pierce` o un área pueden
    // golpear a más de un rival. El daño principal ya está en `score`, pero el
    // impacto extra también vale parte del cooldown.
    const extraTargets = this.ctx.countExtraAbilityTargets(
      self,
      target,
      def,
      prediction,
      colliders
    );
    if (extraTargets > 0) {
      const weight = def.shape === 'aoe' ? 32 : 24;
      score += extraTargets * weight * hitChance;
    }

    // Autodaño y windup son riesgos reales: cuanto más largo el segundo y más
    // caro el primero, menos compensa lanzarlo.
    if (def.selfDamage > 0) {
      const selfDamage = self.maxHp * def.selfDamage;
      score -= 15 + (selfDamage / Math.max(1, self.hp)) * 70;
    }
    // La armadura reduce el riesgo del startup: la habilidad puede completarse
    // aunque el rival esté haciendo pokes. Si el daño acumulado de los pokes
    // listos se queda por debajo del pozo, el riesgo baja mucho; si no, solo se
    // descuenta algo por la armadura intrínseca.
    const armorBonus = this.ctx.armorCastBonus(self, def);
    const startupRisk =
      def.armorPool > 0 ? (armorBonus > 0 ? 0.35 : 0.7) : 1;
    score -= Math.min(16, def.startup * 14) * startupRisk;
    score += armorBonus;

    // Aprovechar el windup rival: las habilidades instantáneas pueden cancelar
    // su preparación; las que tardan más que el rival llegan tarde y además
    // dejan al bot plantado. Si la armadura del casteo absorbe el golpe, no
    // hay interrupción y no se cobran los bonus de castigo.
    const pending = target.activeCast;
    if (pending) {
      const remaining = pending.effectAt - pending.elapsed;
      if (
        remaining > 0 &&
        this.ctx.breaksCastArmor(target, def, expectedDamage)
      ) {
        if (def.startup <= remaining) score += 18;
        else score -= 22;
        // Cortar una curación o reanimación enemiga vale más que castigar un
        // ataque: esos PV (o ese aliado) vuelven a la pelea si se completa.
        if (
          pending.def.healSelf > 0 ||
          this.ctx.isSupportRecovery(pending.def)
        ) {
          score += SUPPORT_DENY_BONUS;
        }
        if (
          def.shape === 'melee' ||
          def.shape === 'projectile' ||
          def.shape === 'beam'
        ) {
          score += 10;
        }
        if (
          castMovementMultiplier({
            def: pending.def,
            elapsed: pending.elapsed,
            activeEnd: pending.plan.activeEnd,
            animationEndAt: pending.plan.animationEndAt
          }) <= 0
        ) {
          score += 8;
        }
      }
    }

    // La definitiva se guarda para cuando el objetivo ya está tocado o hay
    // varios rivales en el área; si no, se usa la rotación corta.
    const targetHp = target.hp / Math.max(1, target.maxHp);
    if (slot === 3 && targetHp > 0.65) score -= 14;
    if (slot === 0) score += 8;
    // Repetir la misma habilidad alarga su próximo cooldown. La puntuación baja
    // con la racha para que el bot prefiera alternar si hay otra opción viable.
    const repeatExtra = this.ctx.repeatCooldownExtra(self, slot);
    if (repeatExtra > 0) {
      score /= 1 + repeatExtra * REPEAT_SCORE_FACTOR;
    }
    return score;
  }

  /**
   * Daño final esperado de un golpe, con stats reales, STAB, efectividad,
   * buffs, escudo, crítico medio y factor aleatorio medio. La probabilidad de
   * conectar se aplica aparte en `hitChance`.
   */
  expectedDamage(
    self: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef,
    prediction: TargetPrediction
  ): number {
    if (def.props.power <= 0 && !isDamageStatus(def.props.status)) return 0;
    const category: 'physical' | 'special' =
      def.category === 'physical' ? 'physical' : 'special';
    const physical = category === 'physical';
    const randomFactor =
      (CONFIG.combat.randomMin + CONFIG.combat.randomMax) / 2;

    // El bot apunta hacia la posición prevista, así que el centro del área (o el
    // vértice del cono) cae en esa dirección a `range` del lanzador.
    let power = def.props.power;
    if (def.shape === 'aoe') {
      const aimX = prediction.x - self.x;
      const aimZ = prediction.z - self.z;
      const aimLength = Math.hypot(aimX, aimZ);
      const aimDirX =
        aimLength > 0.0001 ? aimX / aimLength : Math.sin(self.facing);
      const aimDirZ =
        aimLength > 0.0001 ? aimZ / aimLength : Math.cos(self.facing);
      const centerReach = def.range > 0.1 ? def.range : 0;
      const area = aoeAreaFrom(
        def,
        self.x + aimDirX * centerReach,
        self.z + aimDirZ * centerReach,
        aimDirX,
        aimDirZ
      );

      // Las áreas con daño radial pegan menos en el borde. La distancia
      // relevante es la que separa al rival del centro del círculo o del
      // vértice del cono.
      if (def.radialDamage) {
        const t = aoeRadialFalloff(area, prediction.x, prediction.z);
        power *= 1 - (1 - def.radialMinDamage) * t;
      }
      // En las áreas con ticks, `power` es daño por segundo. No se asume que el
      // rival se quede toda la duración: se estiman los ticks que llegará a
      // recibir según lo cerca que esté del borde y lo rápido que pueda salir.
      if (isOvertimeMode(def.aoeDamageMode) && def.aoeDuration > 0) {
        const tickInterval = Math.max(0.1, def.aoeTickInterval);
        const maxTicks = Math.max(
          1,
          Math.floor(def.aoeDuration / tickInterval)
        );
        const escapeDistance = this.ctx.aoeEscapeDistance(
          area,
          prediction.x,
          prediction.z
        );
        const escapeTime =
          escapeDistance / Math.max(1, this.ctx.effectiveSpeed(target));
        const expectedTime = Math.min(
          def.aoeDuration,
          escapeTime + tickInterval
        );
        // El primer tick global cae al aparecer; en `overtime-target` cae al
        // entrar cada objetivo, así que la estimación cuenta esa entrada.
        const ticks =
          def.aoeDamageMode === 'overtime-target'
            ? 1 + Math.floor(expectedTime / tickInterval)
            : Math.ceil(expectedTime / tickInterval);
        power *= Math.max(1, Math.min(maxTicks, ticks)) * tickInterval;
      }
    }
    // El DoT es daño fijo por tick: no pasa por STAB, crítico ni efectividad.
    // Protección sí lo reduce, igual que en `applyDamageStatusTick`.
    const dotDamage = expectedDotDamage(target, def.props.status);
    if (power <= 0 && dotDamage <= 0) return 0;

    let directDamage = 0;
    if (power > 0) {
      const input = {
        moveType: def.type,
        category,
        power,
        attacker: self.combat,
        defender: target.combat,
        attackerTypes: self.types,
        defenderTypes: target.types,
        attackMultiplier: this.ctx.statMultiplier(
          self,
          physical ? 'attack' : 'spAttack'
        ),
        defenseMultiplier: this.ctx.statMultiplier(
          target,
          physical ? 'defense' : 'spDefense'
        ),
        randomFactor
      };
      const normal = computeDamage({ ...input, critical: false }).damage;
      const critical = computeDamage({ ...input, critical: true }).damage;
      const expected =
        normal * (1 - CONFIG.combat.critChance) +
        critical * CONFIG.combat.critChance;
      const reduction =
        target.damageReductionTimer > 0 ? target.damageReduction : 0;
      const weatherMultiplier =
        atmosphereMoveMultiplier(this.state.atmosphere, def.type) *
        atmosphereShapeMultiplier(this.state.atmosphere, def.shape) *
        atmosphereIncomingMultiplier(this.state.atmosphere, target.types);
      directDamage = Math.max(
        1,
        Math.round(expected * (1 - reduction) * weatherMultiplier)
      );
    }
    return directDamage + dotDamage;
  }

  /**
   * Probabilidad estimada de que el golpe conecte. Combina el error angular
   * de la dificultad, la distancia y el adelanto imperfecto contra la velocidad
   * lateral del rival.
   */
  hitChance(
    self: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef,
    prediction: TargetPrediction
  ): number {
    if (def.shape === 'self') return 1;

    const targetRadius = target.hitRadius;
    let lateralTolerance: number;
    let aimDistance = Math.max(0.5, prediction.distance);
    switch (def.shape) {
      case 'melee':
        lateralTolerance =
          prediction.distance * Math.tan(def.halfAngle * DEG) +
          maxHitRadius() +
          targetRadius;
        break;
      case 'projectile':
        lateralTolerance = def.radius + targetRadius;
        break;
      case 'beam':
        lateralTolerance = def.radius + maxHitRadius() + targetRadius;
        break;
      case 'dash':
        lateralTolerance = Math.max(0.5, def.radius) + targetRadius;
        break;
      case 'aoe':
        if (def.aoeShape === 'cone') {
          // En un cono el error de apuntado es angular: basta con que el rival
          // quede dentro de `halfAngle` respecto al eje del lanzamiento.
          aimDistance = Math.max(0.5, prediction.distance);
          lateralTolerance =
            aimDistance * Math.tan(def.halfAngle * DEG) + targetRadius;
        } else {
          // En un patrón, el error de apuntado tolerable lo marca el lóbulo
          // más grande, no el radio de colocación del área.
          let coverage = def.radius;
          if (def.aoeCircles.length > 0) {
            coverage = 0;
            for (const circle of def.aoeCircles) {
              coverage = Math.max(coverage, circle.radius ?? def.radius);
            }
          }
          lateralTolerance = coverage + maxHitRadius() + targetRadius;
          aimDistance = def.range > 0.1 ? def.range : 0.5;
        }
        break;
    }

    const maxAngle = Math.atan2(
      Math.max(0.05, lateralTolerance),
      aimDistance
    );
    const aimChance =
      this.ctx.tuning.aimError > 0
        ? clamp(maxAngle / this.ctx.tuning.aimError, 0, 1)
        : 1;

    // El adelanto usa solo una fracción de la velocidad (`lead`). La parte que
    // falta se nota sobre todo en la velocidad lateral al disparo.
    const direction = directionTo(self, prediction);
    const lateralSpeed = Math.abs(
      target.vx * direction.z - target.vz * direction.x
    );
    const residual =
      lateralSpeed * prediction.time * (1 - this.ctx.tuning.lead);
    const motionChance = clamp(
      1 - residual / Math.max(0.25, lateralTolerance * 2),
      0.5,
      1
    );
    return clamp(aimChance * motionChance, 0, 1);
  }
}
