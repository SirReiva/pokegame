import { useEffect, useRef, useState } from 'react';
import { Input, type InputDeviceInfo, type MenuInputEvent } from '../game/input';

/**
 * Tiempo que se ignoran las acciones al montar la pantalla. Evita que un botón
 * que sigue pulsado desde la pantalla anterior (o desde la partida) confirme
 * dos veces al cambiar de ruta.
 */
const ARM_DELAY_MS = 180;

/**
 * Fuente de entrada para las pantallas HTML (lobby y selección de Pokémon).
 * No crea ningún canvas de PlayCanvas: solo escucha teclado, mandos y la API
 * de Gamepad, y devuelve la lista de dispositivos conectados.
 */
export function useMenuInput(
  onAction: (event: MenuInputEvent) => void
): InputDeviceInfo[] {
  const [devices, setDevices] = useState<InputDeviceInfo[]>([]);
  const actionRef = useRef(onAction);

  useEffect(() => {
    actionRef.current = onAction;
  });

  useEffect(() => {
    const input = new Input();
    const armedAt = performance.now() + ARM_DELAY_MS;
    let frame = 0;

    const tick = () => {
      const next = input.poll();
      if (next.changed) setDevices(next.devices);

      if (performance.now() >= armedAt) {
        for (const event of next.actions) actionRef.current(event);
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      input.dispose();
    };
  }, []);

  return devices;
}
