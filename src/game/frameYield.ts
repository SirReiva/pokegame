/**
 * Cede el hilo al navegador sin esperar un frame completo.
 *
 * `scheduler.yield()` (Chrome) reanuda la tarea con prioridad normal, así que
 * el navegador puede pintar y atender eventos entre tandas. Donde no existe, se
 * usa `requestAnimationFrame`, que garantiza un frame pero cuesta ~16 ms por
 * cesión; en una carga de mapa con decenas de tandas esa diferencia se nota.
 *
 * El `setTimeout` final cubre pestañas ocultas, donde `requestAnimationFrame`
 * no se entrega.
 */
export function yieldToBrowser(): Promise<void> {
  const scheduler = (
    globalThis as {
      scheduler?: { yield?: () => Promise<void> };
    }
  ).scheduler;
  if (scheduler && typeof scheduler.yield === 'function') {
    return scheduler.yield();
  }
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve();
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(finish);
      // Si la pestaña está oculta o el compositor no entrega frames.
      timer = setTimeout(finish, 100);
    } else {
      timer = setTimeout(finish, 0);
    }
  });
}
