import * as pc from 'playcanvas';
import type { FxRuntime } from './fxRuntime';
import {
  EffectBatch,
  MOTION_MELEE_LEAVES
} from '../../effectBatch';
import type { EffectBatchInstance } from '../../effectBatch';
import { DEG } from '../../config';
import { createVineWhipMesh } from './vineGeometry';

/** Curva de entrada/salida suave, equivalente a la de los shaders. */
function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Látigo Cepa: dos zarcillos 3D simétricos que brotan a los lados del lanzador,
 * se abren en arco y chasquean hacia el centro. La geometría de cada zarcillo
 * se deforma en cada frame: una onda recorre el tubo y la punta se cruza y
 * rebota como un latigazo. Unas hojas sueltas completan la lectura de Planta.
 */
export function spawnVineWhip(
  ctx: FxRuntime,
  x: number,
  z: number,
  yaw: number,
  range: number,
  halfAngleDeg: number,
  color: readonly [number, number, number]
): void {
  const duration = 0.36;
  const root = new pc.Entity('vine-whip');
  root.setPosition(x, 0, z);
  root.setEulerAngles(0, yaw / DEG, 0);
  ctx.app.root.addChild(root);

  const mainMaterial = ctx.createVertexColorMaterial(0.97);
  const materials = [mainMaterial];

  const vines = ([-1, 1] as const).map((side) => {
    const group = new pc.Entity(`vine-side-${side}`);
    root.addChild(group);
    // La geometría es dinámica: cada casteo tiene su propia onda viajera.
    const vine = createVineWhipMesh(ctx.device, range, side);
    ctx.createEntity(vine.mesh, [mainMaterial], group);
    return { side, group, update: vine.update };
  });

  // Hojas que acompañan al golpe, repartidas dentro del cono.
  const leafMaterial = ctx.createLeafMaterial(color, 0.9);
  materials.push(leafMaterial);
  const leafInstances: EffectBatchInstance[] = [];
  for (let index = 0; index < 6; index++) {
    const side = index % 2 === 0 ? -1 : 1;
    leafInstances.push({
      anim0: [
        side * (0.35 + ((index * 37) % 10) / 10 * 0.55),
        0.4 + ((index * 53) % 10) / 10 * 1.1,
        (index * 71) % 360,
        -25 + ((index * 13) % 5) * 12
      ],
      anim1: [
        0.18 + ((index * 17) % 5) * 0.015,
        0.3 + ((index * 23) % 5) * 0.022,
        0,
        0
      ]
    });
  }
  const leafBatch = new EffectBatch({
    app: ctx.app,
    parent: root,
    mesh: ctx.leafMesh,
    material: leafMaterial,
    instances: leafInstances,
    motion: MOTION_MELEE_LEAVES,
    life: duration
  });

  // El barrido del conjunto acompaña al chasquido de la geometría: abre los
  // zarcillos y los lleva hacia el centro, pero el latigazo real lo dibuja la
  // onda que recorre el tubo.
  const outer = Math.max(8, Math.min(14, halfAngleDeg * 0.25));
  const inner = -outer * 0.1;

  let time = 0;
  ctx.addEffect(
    root,
    materials,
    duration,
    (t, dt) => {
      time += dt;
      const appear = smoothstep(0, 0.14, t);
      const fade = 1 - smoothstep(0.7, 1, t);
      // Arranca casi extendido: las cepas deben cubrir el cono desde el golpe,
      // y el estirón de `extend` remata el alcance en el cruce.
      const grow = 0.72 + 0.28 * (1 - Math.pow(1 - appear, 3));
      // Latigazo vertical: sube y vuelve a bajar mientras barre.
      const crack = Math.sin(Math.min(1, t / 0.62) * Math.PI);

      for (const vine of vines) {
        const delay = vine.side < 0 ? 0 : 0.12;
        const local = Math.max(0, Math.min(1, (t - delay) / 0.7));
        const sweep = smoothstep(0.05, 0.62, local);
        const yawOffset = vine.side * (outer + (inner - outer) * sweep);
        const scale = grow * (1 + 0.015 * Math.sin(local * 20));
        // Estirón del latigazo: alarga el eje del zarcillo justo en el cruce.
        const extend =
          1 + 0.035 * Math.sin(Math.min(1, local / 0.55) * Math.PI);
        // El pivote es la base del zarcillo en el bulbo: al girar en Y barre
        // lateralmente y al inclinarse en X levanta la punta sin despegar la
        // base del cuerpo del lanzador.
        vine.group.setLocalEulerAngles(
          -crack * (vine.side < 0 ? 4 : 3),
          yawOffset,
          0
        );
        vine.group.setLocalPosition(vine.side * 0.18, 0.8, 0.06);
        vine.group.setLocalScale(scale, scale, scale * extend);
        vine.update(t);
      }

      mainMaterial.opacity = 0.97 * appear * fade;
      leafBatch.setTime(time);
    },
    [
      [x, z],
      [x + Math.sin(yaw) * range, z + Math.cos(yaw) * range]
    ]
  );
}
