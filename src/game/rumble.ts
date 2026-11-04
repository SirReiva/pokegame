/**
 * Vibración de los mandos al recibir daño.
 *
 * La Gamepad API expone la vibración de dos formas según el navegador y la
 * familia del mando: `vibrationActuator.playEffect('dual-rumble')` (Chrome y
 * Edge, la más extendida) y `hapticActuators[].pulse()` (versión antigua). Se
 * intentan ambas y, si ninguna existe, no pasa nada: el golpe se resuelve
 * igual.
 */

/** Parámetros del efecto `dual-rumble` de la Gamepad API. */
interface DualRumbleEffect {
  startDelay?: number;
  duration: number;
  weakMagnitude: number;
  strongMagnitude: number;
}

interface VibrationActuator {
  playEffect?: (type: string, params: DualRumbleEffect) => Promise<unknown>;
}

interface HapticActuator {
  pulse?: (value: number, duration: number) => Promise<boolean>;
}

/** Extrae el índice del Gamepad API a partir del id del dispositivo (`pad-3`). */
function padIndexFor(deviceId: string): number | null {
  if (!deviceId.startsWith('pad-')) return null;
  const index = Number(deviceId.slice('pad-'.length));
  return Number.isInteger(index) && index >= 0 ? index : null;
}

/**
 * Hace vibrar el mando que controla a un jugador al recibir un golpe.
 *
 * La fuerza y la duración crecen con el daño respecto a la vida máxima: un
 * roce apenas se nota y un golpe fuerte o letal vibra al máximo. Las llamadas
 * repetidas del mismo instante (varios ticks de un área) simplemente reinician
 * el efecto, que es lo que se espera.
 */
export function rumbleOnDamage(deviceId: string, damage: number, maxHp: number): void {
  const index = padIndexFor(deviceId);
  if (index === null) return;
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return;

  const pad = navigator.getGamepads()[index];
  if (!pad || !pad.connected) return;

  const ratio = maxHp > 0 ? Math.min(1, Math.max(0, damage / maxHp)) : 0;
  // Incluso el golpe más débil deja una vibración perceptible; a partir de ahí
  // la curva sube rápido para que los impactos duros se distingan.
  const intensity = 0.3 + 0.7 * Math.sqrt(ratio);
  const duration = Math.round(90 + ratio * 130);

  const actuator = (pad as Gamepad & { vibrationActuator?: VibrationActuator | null })
    .vibrationActuator;
  if (actuator?.playEffect) {
    try {
      void actuator
        .playEffect('dual-rumble', {
          startDelay: 0,
          duration,
          weakMagnitude: intensity,
          strongMagnitude: Math.min(1, intensity * 0.85)
        })
        .catch(() => {
          // Algunos mandos rechazan el efecto sin tenerlo deshabilitado; el
          // golpe sigue su curso y no hay nada más que hacer.
        });
      return;
    } catch {
      // Se prueba el respaldo de `hapticActuators` antes de rendirse.
    }
  }

  const haptics = (pad as Gamepad & { hapticActuators?: HapticActuator[] })
    .hapticActuators;
  try {
    void haptics?.[0]?.pulse?.(intensity, duration)?.catch(() => {});
  } catch {
    // Sin soporte de vibración: silencio.
  }
}
