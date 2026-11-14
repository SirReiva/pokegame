/**
 * Avance de un jugador en un paso fijo.
 *
 * Temporizadores, hitstun, casteo, dash, movimiento relativo a la cámara,
 * colisiones, animación y lanzamiento de habilidades. El host aporta las
 * acciones del motor (cámara, respawn, casteo y colisión).
 */

import type { AtmosphereId } from '../atmosphere';
import type { BuffStat } from '../abilities';
import { CONFIG, DEG } from '../config';
import type { DeviceInputSnapshot } from '../input';
import type { MatchPlayerState } from '../matchState';
import { atmosphereSpeedMultiplier } from '../atmosphere';
import { terrainAt } from '../terrain';
import { terrainSpeedEffect } from '../terrainSpeed';
import { terrainConcealment } from '../vision';

export interface PlayerSystemHost {
  readonly atmosphere: AtmosphereId;
  refreshSlowMultiplier(player: MatchPlayerState): void;
  respawnPlayer(player: MatchPlayerState): void;
  updateCamera(
    player: MatchPlayerState,
    input: DeviceInputSnapshot,
    dt: number
  ): void;
  stepActiveCast(
    player: MatchPlayerState,
    input: DeviceInputSnapshot,
    dt: number
  ): boolean;
  stepDash(
    player: MatchPlayerState,
    input: DeviceInputSnapshot,
    dt: number
  ): boolean;
  buffMultiplier(player: MatchPlayerState, stat: BuffStat): number;
  resolvePosition(
    player: MatchPlayerState,
    x: number,
    z: number
  ): { x: number; z: number };
  castAbility(player: MatchPlayerState, slotIndex: number): void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function angleLerp(current: number, target: number, t: number): number {
  const delta = Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current)
  );
  return current + delta * t;
}

export function stepPlayer(
  host: PlayerSystemHost,
  player: MatchPlayerState,
  input: DeviceInputSnapshot,
  dt: number
): void {
  // Temporizadores de combate: corren también mientras el jugador está KO.
  for (let index = 0; index < player.cooldowns.length; index++) {
    player.cooldowns[index] = Math.max(0, player.cooldowns[index] - dt);
  }
  for (const buff of player.buffs) buff.duration -= dt;
  // Compactar en sitio: filtrar creaba un array nuevo por jugador y paso
  // (60 Hz × 8 jugadores) aunque no hubiera nada que expirar.
  let buffCount = 0;
  for (const buff of player.buffs) {
    if (buff.duration > 0) player.buffs[buffCount++] = buff;
  }
  player.buffs.length = buffCount;
  if (player.slowEffects.length > 0) {
    for (const effect of player.slowEffects) effect.remaining -= dt;
    let slowCount = 0;
    for (const effect of player.slowEffects) {
      if (effect.remaining > 0) player.slowEffects[slowCount++] = effect;
    }
    player.slowEffects.length = slowCount;
    host.refreshSlowMultiplier(player);
  }
  if (player.invulnerableTimer > 0) {
    player.invulnerableTimer = Math.max(0, player.invulnerableTimer - dt);
  }
  if (player.damageReductionTimer > 0) {
    player.damageReductionTimer = Math.max(0, player.damageReductionTimer - dt);
    if (player.damageReductionTimer === 0) player.shieldSpeedMultiplier = 1;
  }
  if (player.stunTimer > 0) {
    player.stunTimer = Math.max(0, player.stunTimer - dt);
  }
  if (player.hurtTimer > 0) player.hurtTimer = Math.max(0, player.hurtTimer - dt);

  if (player.deathFade > 0) player.deathFade = Math.max(0, player.deathFade - dt);

  if (!player.alive) {
    player.vx = 0;
    player.vz = 0;
    player.respawnTimer = Math.max(0, player.respawnTimer - dt);
    if (player.respawnTimer <= 0) host.respawnPlayer(player);
    host.updateCamera(player, input, dt);
    return;
  }

  // Hitstun: bloquea movimiento y habilidades, pero deja girar la cámara.
  if (player.stunTimer > 0) {
    player.vx = 0;
    player.vz = 0;
    player.animation = 'hurt';
    player.playback = 1;
    player.animationFrame = null;
    const terrain = terrainAt(player.x, player.z);
    player.terrain = terrain;
    player.concealment = terrainConcealment(terrain, player.types);
    host.updateCamera(player, input, dt);
    return;
  }

  // Un casteo bloquea movimiento y otras habilidades mientras se reproduce.
  if (host.stepActiveCast(player, input, dt)) return;

  // Un dash consume el frame: no se mezcla con el movimiento normal.
  if (host.stepDash(player, input, dt)) return;

  const yaw = player.cameraYaw;
  const forwardX = -Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);

  // En el modo táctico el cuerpo no gira hacia la entrada: mira siempre hacia
  // donde apunta la cámara y el stick se interpreta como avance/retroceso (eje
  // Y) más desplazamiento lateral (eje X).
  const tactical = !player.isBot && player.movementMode === 'tactical';

  // El bloqueo de movimiento lo consume `stepActiveCast`: si el casteo está en
  // startup o en la ventana activa de una melee, este bloque no se ejecuta.
  const moveX = input.moveX;
  const moveY = input.moveY;
  const desiredX = rightX * moveX + forwardX * moveY;
  const desiredZ = rightZ * moveX + forwardZ * moveY;
  const magnitude = Math.hypot(desiredX, desiredZ);

  const terrainEffect = terrainSpeedEffect(
    terrainAt(player.x, player.z),
    player.types
  );
  player.terrainMultiplier = terrainEffect.multiplier;
  player.terrainSpeedReason = terrainEffect.reason;
  const shieldSpeed =
    player.damageReductionTimer > 0 ? player.shieldSpeedMultiplier : 1;
  const maxSpeed =
    player.maxSpeed *
    terrainEffect.multiplier *
    atmosphereSpeedMultiplier(host.atmosphere, player.types) *
    host.buffMultiplier(player, 'speed') *
    player.slowMultiplier *
    shieldSpeed;

  const targetSpeed = maxSpeed * Math.min(1, magnitude);
  const currentSpeed = Math.hypot(player.vx, player.vz);

  if (magnitude > 0.001) {
    // El rumbo de avance gira hacia la entrada en vez de interpolar cada eje
    // por separado. Al mezclar `vx` y `vz` la inercia lateral sobrevive al giro
    // y el Pokémon derrapa: sigue desplazándose hacia el lado anterior mientras
    // ya mira hacia el nuevo. Girando el vector se conserva la rapidez y el
    // cuerpo traza un arco corto.
    const dirX = desiredX / magnitude;
    const dirZ = desiredZ / magnitude;
    // De entrada se apunta a la dirección exacta pedida. Solo se sustituye por
    // un rumbo intermedio si hace falta girar poco a poco. El modo táctico no
    // interpola: el desplazamiento lateral debe ser inmediato y no arrastrar el
    // rumbo anterior, que es el de la cámara.
    let headingX = dirX;
    let headingZ = dirZ;

    if (!tactical && currentSpeed > 0.0001) {
      const currentX = player.vx / currentSpeed;
      const currentZ = player.vz / currentSpeed;
      const dot = clamp(currentX * dirX + currentZ * dirZ, -1, 1);
      const angle = Math.acos(dot);
      const maxStep = CONFIG.player.turnRate * dt;
      // Los giros casi opuestos se invierten en seco: girar el vector poco a
      // poco los desviaba hacia un lado trazando un arco en vez de volver.
      const snap = angle > CONFIG.player.turnSnapAngle * DEG;
      if (!snap && angle > maxStep) {
        const side = currentX * dirZ - currentZ * dirX >= 0 ? 1 : -1;
        const cos = Math.cos(maxStep);
        const sin = Math.sin(maxStep) * side;
        const nextX = currentX * cos - currentZ * sin;
        const nextZ = currentX * sin + currentZ * cos;
        headingX = nextX;
        headingZ = nextZ;
      }
    }

    const rate =
      (targetSpeed >= currentSpeed
        ? CONFIG.player.acceleration
        : CONFIG.player.deceleration) * dt;
    const nextSpeed =
      currentSpeed + clamp(targetSpeed - currentSpeed, -rate, rate);
    player.vx = headingX * nextSpeed;
    player.vz = headingZ * nextSpeed;
  } else if (currentSpeed > 0.0001) {
    // Sin entrada se frena en línea recta, conservando el rumbo.
    const nextSpeed = Math.max(0, currentSpeed - CONFIG.player.deceleration * dt);
    const scale = nextSpeed / currentSpeed;
    player.vx *= scale;
    player.vz *= scale;
  } else {
    player.vx = 0;
    player.vz = 0;
  }

  const resolved = host.resolvePosition(
    player,
    player.x + player.vx * dt,
    player.z + player.vz * dt
  );
  player.x = resolved.x;
  player.z = resolved.z;

  const speed = Math.hypot(player.vx, player.vz);
  if (!tactical && speed > CONFIG.player.minFacingSpeed) {
    const targetFacing = Math.atan2(player.vx, player.vz);
    player.facing = angleLerp(
      player.facing,
      targetFacing,
      1 - Math.exp(-CONFIG.player.turnLerp * dt)
    );
  }

  // Prioridad de animación: daño > ataque > andar > reposo. Durante un windup
  // móvil, andar tiene prioridad sobre el ataque para no deslizar.
  if (player.hurtTimer > 0) {
    player.animation = 'hurt';
    player.playback = 1;
    player.animationFrame = null;
  } else if (player.animationFrame !== null) {
    // El plan de casteo manda. Si el startup permite moverse y el Pokémon anda,
    // el caminar tiene prioridad para no deslizar.
    const cast = player.activeCast;
    if (
      cast?.def.moveWhileStartup &&
      cast.elapsed < cast.def.startup &&
      speed > CONFIG.player.minFacingSpeed
    ) {
      player.animation = 'walk';
      player.playback = clamp(
        speed / CONFIG.sprite.walkRateRefSpeed,
        CONFIG.sprite.walkRateMin,
        CONFIG.sprite.walkRateMax
      );
      player.animationFrame = null;
    }
  } else if (speed > CONFIG.player.minFacingSpeed) {
    player.animation = 'walk';
    player.playback = clamp(
      speed / CONFIG.sprite.walkRateRefSpeed,
      CONFIG.sprite.walkRateMin,
      CONFIG.sprite.walkRateMax
    );
  } else {
    player.animation = 'idle';
    player.playback = 1;
  }

  const terrain = terrainAt(player.x, player.z);
  player.terrain = terrain;
  // La velocidad de este frame se calculó con el terreno de partida, pero el
  // HUD debe mostrar el del punto al que se ha llegado: si no, durante un frame
  // enseña el terreno nuevo con el multiplicador anterior.
  const movedTerrainEffect = terrainSpeedEffect(terrain, player.types);
  player.terrainMultiplier = movedTerrainEffect.multiplier;
  player.terrainSpeedReason = movedTerrainEffect.reason;
  player.concealment = terrainConcealment(terrain, player.types);
  const targetSubmerge =
    terrain === 'waterHigh'
      ? CONFIG.player.submergeDeep
      : terrain === 'waterLow' || terrain === 'poison'
        ? CONFIG.player.submergeShallow
        : 0;
  player.submerge +=
    (targetSubmerge - player.submerge) *
    (1 - Math.exp(-CONFIG.player.submergeLerp * dt));
  if (player.submerge < 0.0005) player.submerge = 0;

  // Las habilidades se lanzan después de mover y girar: así salen siempre en
  // la dirección real a la que apunta el Pokémon en este frame.
  if (input.ability1) host.castAbility(player, 0);
  if (input.ability2) host.castAbility(player, 1);
  if (input.ability3) host.castAbility(player, 2);
  if (input.ability4) host.castAbility(player, 3);
  if (input.commonAbility && player.commonAbilityId !== 'regeneracion') {
    host.castAbility(player, 4);
  }

  host.updateCamera(player, input, dt);
}
