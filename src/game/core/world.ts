/** Colisión del mundo en el plano XZ. */

export type Collider =
  | { type: 'circle'; x: number; z: number; radius: number; sightRadius?: number }
  | {
      type: 'segment';
      ax: number;
      az: number;
      bx: number;
      bz: number;
      radius: number;
      sightRadius?: number;
    };
