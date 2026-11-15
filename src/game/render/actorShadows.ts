/**
 * Sombras de contacto de los actores, instanciadas por viewport.
 *
 * Cada copia de un Pokémon en el splitscreen dibujaba su propia sombra: una
 * entidad, un componente de render y un draw call por copia (64 en una partida
 * de 8 vistas). Todas comparten malla, material y textura, y solo cambia la
 * matriz, así que se dibujan con una única instancia por viewport y un
 * `VertexBuffer` dinámico que se reescribe cuando alguien se mueve.
 *
 * La capa de la vista sigue siendo la misma que la de las copias: cada lote solo
 * lo ve la cámara de su viewport y el culling por frustum no se comparte entre
 * vistas.
 */

import * as pc from 'playcanvas';

/** Orden de dibujo de la sombra dentro de la capa transparente de la vista. */
const SHADOW_DRAW_ORDER = 2;
/** Una matriz de mundo (cuatro columnas) por instancia. */
const FLOATS_PER_INSTANCE = 16;

/**
 * Ranura de una copia dentro del lote. El actor solo publica su posición; el
 * lote decide cuántas instancias dibujar y compacta las visibles al principio
 * del buffer.
 */
export interface ActorShadowSlot {
  setShadow(
    x: number,
    y: number,
    z: number,
    diameter: number,
    enabled: boolean
  ): void;
}

interface SlotState {
  x: number;
  y: number;
  z: number;
  size: number;
  enabled: boolean;
}

/** Plano unitario en XZ, como la primitiva `plane` que usaba cada sombra. */
function createShadowPlane(device: pc.GraphicsDevice): pc.Mesh {
  const mesh = new pc.Mesh(device);
  mesh.setPositions([
    -0.5, 0, -0.5,
    0.5, 0, -0.5,
    0.5, 0, 0.5,
    -0.5, 0, 0.5
  ]);
  mesh.setUvs(0, [0, 0, 1, 0, 1, 1, 0, 1]);
  mesh.setIndices([0, 1, 2, 0, 2, 3]);
  mesh.update();
  return mesh;
}

export class ActorShadowBatch {
  private readonly data: Float32Array;
  private readonly buffer: pc.VertexBuffer;
  private readonly mesh: pc.Mesh;
  private readonly instance: pc.MeshInstance;
  private readonly entity: pc.Entity;
  private readonly slots: SlotState[] = [];
  private readonly capacity: number;
  private dirty = true;

  constructor(
    app: pc.AppBase,
    material: pc.Material,
    layerId: number,
    capacity: number
  ) {
    const device = app.graphicsDevice;
    const count = Math.max(1, capacity);
    this.capacity = count;
    this.data = new Float32Array(count * FLOATS_PER_INSTANCE);
    this.buffer = new pc.VertexBuffer(
      device,
      pc.VertexFormat.getDefaultInstancingFormat(device),
      count,
      { usage: pc.BUFFER_DYNAMIC, data: this.data }
    );
    this.mesh = createShadowPlane(device);
    this.instance = new pc.MeshInstance(this.mesh, material);
    this.instance.castShadows = false;
    this.instance.receiveShadows = false;
    this.instance.drawOrder = SHADOW_DRAW_ORDER;
    this.instance.setInstancing(this.buffer);
    this.instance.instancingCount = 0;
    this.instance.visible = false;

    this.entity = new pc.Entity('actor-shadows');
    this.entity.addComponent('render');
    const render = this.entity.render!;
    render.castShadows = false;
    render.receiveShadows = false;
    render.meshInstances = [this.instance];
    render.layers = [layerId];
    app.root.addChild(this.entity);
  }

  /** Reserva una ranura para una copia de este viewport. */
  allocate(): ActorShadowSlot {
    // Sin sitio en el buffer, la copia se queda sin sombra en vez de escribir
    // fuera de rango. En partida nunca pasa: `MAX_PLAYERS` es la capacidad.
    if (this.slots.length >= this.capacity) {
      return { setShadow: () => {} };
    }
    const state: SlotState = {
      x: 0,
      y: 0,
      z: 0,
      size: 1,
      enabled: false
    };
    this.slots.push(state);
    return {
      setShadow: (x, y, z, diameter, enabled) => {
        if (
          state.x === x &&
          state.y === y &&
          state.z === z &&
          state.size === diameter &&
          state.enabled === enabled
        ) {
          return;
        }
        state.x = x;
        state.y = y;
        state.z = z;
        state.size = diameter;
        state.enabled = enabled;
        this.dirty = true;
      }
    };
  }

  /**
   * Reescribe el buffer con las sombras activas. Lo llama `syncMatchView` una
   * vez por vista y frame, después de mover todas las copias de esa vista.
   */
  commit(): void {
    if (!this.dirty) return;
    this.dirty = false;

    let count = 0;
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const slot of this.slots) {
      if (!slot.enabled) continue;
      const offset = count * FLOATS_PER_INSTANCE;
      const size = slot.size;
      // Matriz de mundo en columnas: escala en X/Z y traslación al suelo.
      this.data[offset] = size;
      this.data[offset + 1] = 0;
      this.data[offset + 2] = 0;
      this.data[offset + 3] = 0;
      this.data[offset + 4] = 0;
      this.data[offset + 5] = 1;
      this.data[offset + 6] = 0;
      this.data[offset + 7] = 0;
      this.data[offset + 8] = 0;
      this.data[offset + 9] = 0;
      this.data[offset + 10] = size;
      this.data[offset + 11] = 0;
      this.data[offset + 12] = slot.x;
      this.data[offset + 13] = slot.y;
      this.data[offset + 14] = slot.z;
      this.data[offset + 15] = 1;
      if (slot.x < minX) minX = slot.x;
      if (slot.x > maxX) maxX = slot.x;
      if (slot.z < minZ) minZ = slot.z;
      if (slot.z > maxZ) maxZ = slot.z;
      count++;
    }

    this.instance.instancingCount = count;
    this.instance.visible = count > 0;
    if (count === 0) return;

    this.buffer.setData(this.data);
    // El nodo se coloca en el centro de la tanda: las matrices de instancia son
    // absolutas, pero PlayCanvas ordena las transparencias por la posición del
    // nodo. Sin esto, todas las sombras se ordenarían como si estuvieran en el
    // origen del mapa y podrían colarse por delante del agua.
    this.entity.setPosition(
      (minX + maxX) * 0.5,
      0,
      (minZ + maxZ) * 0.5
    );
  }

  destroy(): void {
    this.slots.length = 0;
    this.entity.destroy();
    this.mesh.destroy();
    this.buffer.destroy();
  }
}
