/**
 * Entrada de los jugadores humanos entre pasos de simulación.
 *
 * A 144 Hz hay renders sin paso fijo. Las acciones de borde (habilidades,
 * rueda, giro de ratón) se acumulan hasta el siguiente paso para no perderse;
 * después solo se repiten los ejes mantenidos.
 */

import { IDLE_INPUT, type DeviceInputSnapshot, type InputFrame } from './input';
import type { MatchPlayerState } from './matchState';

/** Entradas de flanco acumuladas entre pasos de simulación. */
interface BufferedInput {
  pointerYaw: number;
  wheel: number;
  ability1: boolean;
  ability2: boolean;
  ability3: boolean;
  ability4: boolean;
  commonAbility: boolean;
}

function emptyBufferedInput(): BufferedInput {
  return {
    pointerYaw: 0,
    wheel: 0,
    ability1: false,
    ability2: false,
    ability3: false,
    ability4: false,
    commonAbility: false
  };
}

/**
 * Snapshot sin acciones de borde. Se usa en los pasos fijos posteriores al
 * primero de cada render: mantener pulsado movimiento o cámara sí se repite,
 * pero una habilidad, una muesca de rueda o un desplazamiento de ratón no
 * deben aplicarse varias veces.
 */
function heldOnlyInput(snapshot: DeviceInputSnapshot): DeviceInputSnapshot {
  return {
    ...snapshot,
    wheel: 0,
    pointerYaw: 0,
    startPressed: false,
    confirm: false,
    cancel: false,
    ability1: false,
    ability2: false,
    ability3: false,
    ability4: false,
    commonAbility: false,
    navX: 0,
    navY: 0
  };
}

export class HumanInputBuffer {
  private readonly buffered = new Map<string, BufferedInput>();

  /** Acumula las pulsaciones de este render para el próximo paso. */
  buffer(frame: InputFrame, views: readonly MatchPlayerState[]): void {
    for (const player of views) {
      const snapshot = frame.snapshots.get(player.deviceId) ?? IDLE_INPUT;
      const buffered =
        this.buffered.get(player.deviceId) ?? emptyBufferedInput();
      buffered.pointerYaw += snapshot.pointerYaw;
      buffered.wheel += snapshot.wheel;
      buffered.ability1 ||= snapshot.ability1;
      buffered.ability2 ||= snapshot.ability2;
      buffered.ability3 ||= snapshot.ability3;
      buffered.ability4 ||= snapshot.ability4;
      buffered.commonAbility ||= snapshot.commonAbility;
      this.buffered.set(player.deviceId, buffered);
    }
  }

  /** Entrada efectiva de un humano en un paso fijo. */
  resolve(
    player: MatchPlayerState,
    frame: InputFrame,
    firstStep: boolean
  ): DeviceInputSnapshot {
    const snapshot = frame.snapshots.get(player.deviceId) ?? IDLE_INPUT;
    if (!firstStep) return heldOnlyInput(snapshot);
    const buffered = this.buffered.get(player.deviceId);
    if (!buffered) return snapshot;
    const input: DeviceInputSnapshot = {
      ...snapshot,
      pointerYaw: buffered.pointerYaw,
      wheel: buffered.wheel,
      startPressed: false,
      confirm: false,
      cancel: false,
      ability1: buffered.ability1,
      ability2: buffered.ability2,
      ability3: buffered.ability3,
      ability4: buffered.ability4,
      commonAbility: buffered.commonAbility,
      navX: 0,
      navY: 0
    };
    this.buffered.set(player.deviceId, emptyBufferedInput());
    return input;
  }

  clear(): void {
    this.buffered.clear();
  }
}
