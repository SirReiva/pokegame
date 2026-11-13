import * as pc from 'playcanvas';
import { CONFIG } from './config';

/**
 * Presupuesto de simulación de los emisores ambientales del mapa.
 *
 * Cada emisor de partículas de PlayCanvas cuesta **una pasada de render por
 * frame** solo para simular sus partículas, aunque esté fuera de pantalla. En
 * los mapas con muchos distritos (polvo del desierto, brasas, humo, niebla,
 * polen…) eso son decenas de pasadas por frame: medido en WebGPU, 82 emisores
 * costaban ~5 ms de CPU por frame, más que toda la lógica del juego junta.
 *
 * Estas partículas son humo y motas que se mueven despacio, así que simularlas
 * a 20 Hz o 8 Hz cuando están lejos se ve exactamente igual y ahorra la mayor
 * parte del coste. Más allá del final de la niebla no se ven y se ocultan.
 */

/** Campos del emisor que PlayCanvas marca como internos pero son estables. */
interface EmitterInternals {
  fixedTimeStep: number;
  maxSubSteps: number;
  simTime: number;
  meshInstance: pc.MeshInstance;
}

interface AmbientEmitter {
  readonly entity: pc.Entity;
  /** Centro del emisor en XZ; la entidad no se mueve. */
  readonly x: number;
  readonly z: number;
  /** Hz de simulación asignados; -1 mientras no se haya calculado. */
  hz: number;
  hidden: boolean;
}

function internalsOf(entity: pc.Entity): EmitterInternals | null {
  const emitter = entity.particlesystem?.emitter as
    | EmitterInternals
    | null
    | undefined;
  return emitter?.meshInstance ? emitter : null;
}

export class AmbientParticleBudget {
  private readonly emitters: AmbientEmitter[] = [];
  private readonly settings = CONFIG.performance.ambientParticles;
  private timer = Infinity;

  constructor(root: pc.Entity) {
    for (const component of root.findComponents('particlesystem')) {
      const position = component.entity.getPosition();
      this.emitters.push({
        entity: component.entity,
        x: position.x,
        z: position.z,
        hz: -1,
        hidden: false
      });
    }

    // Todos los emisores del mundo se crean en el mismo instante, así que sus
    // simulaciones caen en el mismo frame y producen un pico periódico. Un
    // desfase inicial reparte las pasadas entre frames.
    const golden = 0.6180339887;
    this.emitters.forEach((emitter, index) => {
      const internals = internalsOf(emitter.entity);
      if (!internals) return;
      internals.simTime = ((index * golden) % 1) * internals.fixedTimeStep;
    });
  }

  /** Número de emisores ambientales del mapa (para pruebas y diagnóstico). */
  get count(): number {
    return this.emitters.length;
  }

  /**
   * Reparte las frecuencias de simulación según la cámara más cercana. Las
   * distancias se recalculan a `refreshSeconds` porque cambian despacio y el
   * coste de recorrer todos los emisores no es gratis.
   */
  update(cameras: readonly pc.Vec3[], fogFar: number, dt: number): void {
    if (cameras.length === 0) return;
    this.timer += dt;
    if (this.timer < this.settings.refreshSeconds) return;
    this.timer = 0;

    const { nearDistance, midDistance, nearHz, midHz, farHz } = this.settings;
    for (const emitter of this.emitters) {
      const internals = internalsOf(emitter.entity);
      if (!internals) continue;

      let nearest = Infinity;
      for (const camera of cameras) {
        const dx = emitter.x - camera.x;
        const dz = emitter.z - camera.z;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq < nearest) nearest = distanceSq;
      }
      const distance = Math.sqrt(nearest);

      // Más allá del final de la niebla el emisor es invisible: ocultarlo
      // ahorra la pasada de simulación y el dibujo.
      const hidden = distance > fogFar;
      if (hidden !== emitter.hidden) {
        emitter.hidden = hidden;
        internals.meshInstance.visible = !hidden;
      }
      if (hidden) continue;

      const hz =
        distance <= nearDistance
          ? nearHz
          : distance <= midDistance
            ? midHz
            : farHz;
      if (hz === emitter.hz) continue;
      emitter.hz = hz;
      internals.fixedTimeStep = 1 / hz;
      internals.maxSubSteps = 1;
      // Fase aleatoria dentro del paso nuevo para que los emisores de la misma
      // banda no vuelvan a simular todos a la vez.
      internals.simTime = Math.random() * internals.fixedTimeStep;
    }
  }
}
