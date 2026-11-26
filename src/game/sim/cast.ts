/**
 * Ciclo de un casteo activo.
 *
 * Avanza el reloj, dispara el efecto una sola vez, congela brevemente el clip
 * en el impacto y aplica el plan de animación. El host aporta el encolado, la
 * cámara y el asset del actor.
 */

import type { AbilityDef } from '../abilities';
import { CONFIG } from '../config';
import type { TelegraphHandle } from '../core/ports/fx';
import { castMovementMultiplier } from '../core/abilities/movement';
import type {
  ActiveCast,
  MatchPlayerState
} from '../matchState';
import type { DeviceInputSnapshot } from '../input';
import type { ActorAsset } from '../actorAsset';
import { clipTimeAt, segmentAt } from '../castPlan';
import { terrainAt } from '../terrain';
import { terrainSpeedEffect } from '../terrainSpeed';
import { terrainConcealment } from '../vision';

export interface CastSystemHost {
  isMatchOver(): boolean;
  assetFor(pokemonId: string): ActorAsset | undefined;
  queueCast(
    player: MatchPlayerState,
    def: AbilityDef,
    targetX: number | undefined,
    targetZ: number | undefined,
    marker: TelegraphHandle | null | undefined,
    dirX: number | undefined,
    dirZ: number | undefined,
    activeCast: ActiveCast
  ): void;
  updateCamera(
    player: MatchPlayerState,
    input: DeviceInputSnapshot,
    dt: number
  ): void;
}

/** Retira el clip de acción del jugador y deja mandar a la locomoción. */
export function clearCastClip(player: MatchPlayerState): void {
  player.actionAnimation = null;
  player.clipTime = null;
  player.clipSpeed = 1;
}

/**
 * Congela el clip en el marcador de impacto durante unos milisegundos. Sustituye
 * al antiguo `forcedFrame`: en 3D no hay frames que forzar, solo tiempo.
 */
export function beginImpactHold(cast: ActiveCast): void {
  if (cast.plan.impactClip === null || cast.plan.impactTime === null) return;
  // En casteos muy cortos el hit-stop no puede comerse la única ventana en la
  // que se ve la acción. Se limita a una fracción de lo que queda de casteo.
  const remaining = Math.max(0, cast.plan.endAt - cast.plan.effectAt);
  cast.hitStopRemaining = Math.min(
    CONFIG.animation.hitStopSeconds,
    remaining * 0.25
  );
}

export function stepActiveCast(
  host: CastSystemHost,
  player: MatchPlayerState,
  input: DeviceInputSnapshot,
  dt: number
): number | null {
  if (host.isMatchOver()) return 0;
  const cast = player.activeCast;
  if (!cast) return null;

  if (cast.hitStopRemaining > 0) {
    cast.hitStopRemaining = Math.max(0, cast.hitStopRemaining - dt);
  }
  cast.elapsed += dt;

  // Las áreas que declaran `aoePrepareMovement` recalculan su centro durante la
  // preparación: el aviso del suelo sigue el punto que devuelve la función.
  if (!cast.fired && cast.def.shape === 'aoe' && cast.def.aoePrepareMovement) {
    const next = cast.def.aoePrepareMovement({
      caster: player,
      def: cast.def,
      originX: cast.originX,
      originZ: cast.originZ,
      dirX: cast.dirX,
      dirZ: cast.dirZ,
      duration: cast.def.startup,
      elapsed: cast.elapsed
    });
    cast.targetX = next.x;
    cast.targetZ = next.z;
    cast.marker?.setCenter?.(next.x, next.z);
  }

  // Efecto: una sola vez, al llegar al instante de impacto/lanzamiento.
  if (!cast.fired && cast.elapsed >= cast.effectAt) {
    cast.fired = true;
    host.queueCast(
      player,
      cast.def,
      cast.targetX,
      cast.targetZ,
      cast.marker,
      cast.dirX,
      cast.dirZ,
      cast
    );
    beginImpactHold(cast);
  }

  applyCastPresentation(host, player, cast);

  const terrain = terrainAt(player.x, player.z);
  player.terrain = terrain;
  const castTerrainEffect = terrainSpeedEffect(terrain, player.types);
  player.terrainMultiplier = castTerrainEffect.multiplier;
  player.terrainSpeedReason = castTerrainEffect.reason;
  player.concealment = terrainConcealment(terrain, player.types);

  if (cast.elapsed >= cast.plan.endAt) {
    // La marca y el carril se autodestruyen al terminar su propio efecto.
    if (cast.hiddenCaster) player.hidden = false;
    if (cast.invulnerableCaster) player.invulnerableTimer = 0;
    cast.armorFx?.destroy();
    cast.armorFx = null;
    player.activeCast = null;
    clearCastClip(player);
    return null;
  }

  // Movimiento: el multiplicador depende de la fase y de los overrides de la
  // habilidad. `0` clava al lanzador; un número intermedio lo mueve más despacio.
  const movement = castMovementMultiplier({
    def: cast.def,
    elapsed: cast.elapsed,
    activeEnd: cast.plan.activeEnd,
    animationEndAt: cast.plan.animationEndAt
  });
  if (movement <= 0) {
    player.vx = 0;
    player.vz = 0;
    host.updateCamera(player, input, dt);
    return 0;
  }
  return movement;
}

/**
 * Selecciona el tiempo del clip de acción para el instante actual. Durante el
 * hit-stop se mantiene la pose de impacto aunque el reloj del casteo avance.
 */
export function applyCastPresentation(
  _host: CastSystemHost,
  player: MatchPlayerState,
  cast: ActiveCast
): void {
  if (
    cast.hitStopRemaining > 0 &&
    cast.plan.impactClip !== null &&
    cast.plan.impactTime !== null
  ) {
    player.actionAnimation = cast.plan.impactClip;
    player.clipTime = cast.plan.impactTime;
    player.clipSpeed = 1;
    return;
  }

  const segment = segmentAt(cast.plan, cast.elapsed);
  if (!segment) {
    clearCastClip(player);
    return;
  }

  player.actionAnimation = segment.animation;
  player.clipTime = clipTimeAt(segment, cast.elapsed);
  player.clipSpeed = segment.speed;
}

