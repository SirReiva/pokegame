/**
 * Ciclo de un casteo activo.
 *
 * Avanza el reloj, dispara el efecto una sola vez, fuerza la pose de impacto y
 * aplica el plan de animación. El host aporta el encolado, la cámara y el asset
 * del sprite.
 */

import type { AbilityDef } from '../abilities';
import type { TelegraphHandle } from '../core/ports/fx';
import { castMovementMultiplier } from '../core/abilities/movement';
import type {
  ActiveCast,
  MatchPlayerState
} from '../matchState';
import type { DeviceInputSnapshot } from '../input';
import type { SpriteAsset } from '../sprite';
import { frameForSegment, segmentAt } from '../castPlan';
import { terrainAt } from '../terrain';
import { terrainSpeedEffect } from '../terrainSpeed';
import { terrainConcealment } from '../vision';

export interface CastSystemHost {
  isMatchOver(): boolean;
  assetFor(pokemonId: string, skinId?: string): SpriteAsset | undefined;
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

export function stepActiveCast(
  host: CastSystemHost,
  player: MatchPlayerState,
  input: DeviceInputSnapshot,
  dt: number
): number | null {
  if (host.isMatchOver()) return 0;
  const cast = player.activeCast;
  if (!cast) return null;

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
    armHitFrame(host, player, cast);
  }

  applyCastPresentation(host, player, cast);

  const terrain = terrainAt(player.x, player.z);
  player.terrain = terrain;
  const castTerrainEffect = terrainSpeedEffect(terrain, player.types);
  player.terrainMultiplier = castTerrainEffect.multiplier;
  player.terrainSpeedReason = castTerrainEffect.reason;
  player.concealment = terrainConcealment(terrain, player.types);

  if (cast.elapsed >= cast.plan.endAt) {
    // Si el impacto forzado aún tiene frames pendientes, se deja vivo un frame
    // más para que se dibuje. Se limpiará en la siguiente pasada.
    if (cast.forcedFrames > 0) {
      cast.elapsed = cast.plan.endAt - 1e-4;
    } else {
      // La marca y el carril se autodestruyen al terminar su propio efecto.
      if (cast.hiddenCaster) player.hidden = false;
      if (cast.invulnerableCaster) player.invulnerableTimer = 0;
      cast.armorFx?.destroy();
      cast.armorFx = null;
      player.activeCast = null;
      player.animationFrame = null;
      return null;
    }
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
 * Fuerza la pose de impacto durante un par de frames de render. Evita que un
 * `dt` grande salte del frame anterior al posterior al `HitFrame` sin dibujarlo.
 */
export function armHitFrame(
  host: CastSystemHost,
  player: MatchPlayerState,
  cast: ActiveCast
): void {
  if (cast.def.shape === 'dash') return;
  if (cast.plan.hitClip === null || cast.plan.hitFrame === null) return;
  // Si la presentación normal ya cae en el HitFrame, no hace falta forzar:
  // solo se fuerza cuando el salto de `dt` ya lo ha rebasado (o caído en hueco).
  const asset = host.assetFor(player.pokemonId, player.skinId);
  const segment = segmentAt(cast.plan, cast.elapsed);
  const clip = segment ? asset?.skin.animations[segment.animation] : null;
  const normalFrame =
    segment && clip ? frameForSegment(segment, clip, cast.elapsed) : null;
  if (normalFrame === cast.plan.hitFrame) return;
  cast.forcedAnimation = cast.plan.hitClip;
  cast.forcedFrame = cast.plan.hitFrame;
  cast.forcedFrames = 2;
}

/** Selecciona el frame del plan de casteo para el instante actual. */
export function applyCastPresentation(
  host: CastSystemHost,
  player: MatchPlayerState,
  cast: ActiveCast
): void {
  const asset = host.assetFor(player.pokemonId, player.skinId);

  // Salto de `dt`: mantén la pose de impacto aunque el reloj ya la haya
  // rebasado. Sin esto, el efecto se dispara pero el frame nunca se ve.
  if (
    cast.forcedFrames > 0 &&
    cast.forcedAnimation !== null &&
    cast.forcedFrame !== null
  ) {
    const forcedClip = asset?.skin.animations[cast.forcedAnimation];
    if (forcedClip) {
      player.animation = cast.forcedAnimation;
      player.animationFrame = Math.max(
        0,
        Math.min(forcedClip.columns - 1, cast.forcedFrame)
      );
      player.playback = 1;
      return;
    }
  }

  const segment = segmentAt(cast.plan, cast.elapsed);
  if (!segment) {
    player.animationFrame = null;
    player.animation = 'idle';
    player.playback = 1;
    return;
  }
  const clip = asset?.skin.animations[segment.animation];
  if (!clip) {
    player.animationFrame = null;
    player.animation = 'idle';
    player.playback = 1;
    return;
  }
  player.animation = segment.animation;
  player.animationFrame = frameForSegment(segment, clip, cast.elapsed);
  player.playback = 1;
}
