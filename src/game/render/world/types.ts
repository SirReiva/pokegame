/** Contrato del mundo construido para una partida. */

import type * as pc from 'playcanvas';
import type { AtmosphereId } from '../../atmosphere';
import type { Collider } from '../../core/world';

export interface World {
  colliders: Collider[];
  /** Límites de movimiento: media anchura y media profundidad del mapa. */
  bounds: { x: number; z: number };
  waterHeight: number;
  shadowMaterial: pc.StandardMaterial;
  /** Malla y material del cielo, compartidos por las vistas del splitscreen. */
  skyMesh: pc.Mesh;
  skyMaterial: pc.StandardMaterial;

  /** Aplica el clima indicado al cielo, las luces y las partículas. */
  setAtmosphere(id: AtmosphereId): void;
  /**
   * Avanza las partículas ambientales por lotes. El movimiento se calcula en
   * el vertex shader, así que aquí solo se actualiza el tiempo y la niebla.
   */
  updateAmbient(dt: number): void;
  update(dt: number): void;
  dispose(): void;
}
