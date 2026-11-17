import type { FxRuntime } from './fxRuntime';
import * as pc from 'playcanvas';
import { EffectBatch, MOTION_GHOST_EYES, MOTION_GHOST_WISPS, MOTION_PSYCHIC_RINGS, MOTION_PSYCHIC_SHARDS } from '../../effectBatch';
import type { EffectBatchInstance } from '../../effectBatch';

/**
   * Área psíquica: implosión central y estallido de ondas y esquirlas de
   * energía que se abren hasta el borde del círculo. Un disco tenue marca el
   * radio.
   */
export function spawnPsychicAoe(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number): void {
const life = Math.max(0.2, duration);
    const root = new pc.Entity('psychic-aoe');
    root.setPosition(x, 0.03, z);
    ctx.app.root.addChild(root);

    const fillMaterial = ctx.createMaterial([148, 88, 220], 0.12);
    const coreMaterial = ctx.createMaterial([255, 232, 255], 0.95);
    const shardMaterial = ctx.createMaterial([240, 186, 255], 0.9);
    const materials = [
      fillMaterial,
      coreMaterial,
      shardMaterial
    ];

    const fill = ctx.createEntity(ctx.discMesh, [fillMaterial], root);
    fill.setLocalPosition(0, 0.03, 0);
    fill.setLocalScale(radius * 2, 1, radius * 2);

    // Tres ondas de choque que se expanden hacia el borde.
    const waveMaterial = ctx.createMaterial(color, 0.42);
    materials.push(waveMaterial);
    const waveBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.torusMesh,
      material: waveMaterial,
      instances: [0, 1, 2].map((index) => ({
        anim0: [index * 0.09, 0.42, 0.14 + index * 0.06, 0]
      })),
      motion: MOTION_PSYCHIC_RINGS,
      radius,
      life
    });

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.7, 0);
    core.setLocalScale(0.4, 0.4, 0.4);

    const shardInstances: EffectBatchInstance[] = [];
    const shardCount = 54;
    for (let index = 0; index < shardCount; index++) {
      shardInstances.push({
        anim0: [
          Math.random() * Math.PI * 2,
          0.15 + Math.random() * 0.8,
          radius * (0.45 + Math.random() * 0.55),
          Math.random() * 0.1
        ],
        anim1: [
          0.38 + Math.random() * 0.24,
          0.08 + Math.random() * 0.1,
          Math.random() * Math.PI * 2,
          0
        ]
      });
    }
    const shardBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: shardMaterial,
      instances: shardInstances,
      motion: MOTION_PSYCHIC_SHARDS,
      radius,
      life
    });

    let time = 0;
    ctx.addEffect(root, materials, life, (_t, dt) => {
      time += dt;
      const fadeOut = Math.min(1, Math.max(0, (life - time) / (life * 0.45)));
      const pulse = 0.5 + Math.sin(time * 24) * 0.2;

      fillMaterial.opacity = (0.06 + pulse * 0.06) * fadeOut;
      waveMaterial.opacity = (0.22 + pulse * 0.24) * fadeOut;
      waveBatch.setTime(time);

      // El núcleo se contrae durante la implosión y luego estalla.
      const implosion = Math.min(1, time / 0.14);
      const burst = Math.max(0, Math.min(1, (time - 0.14) / 0.32));
      const coreScale =
        radius *
        (0.5 * (1 - implosion) + 0.34 * Math.sin(burst * Math.PI));
      core.setLocalScale(
        Math.max(0.01, coreScale),
        Math.max(0.01, coreScale),
        Math.max(0.01, coreScale)
      );
      core.setLocalPosition(0, 0.7 + Math.sin(burst * Math.PI) * 0.6, 0);
      coreMaterial.opacity =
        0.95 * (implosion < 1 ? 1 : Math.max(0, 1 - burst));

      shardBatch.setTime(time);
    });
}

/**
   * Área fantasma: disco tenue, jirones que suben del suelo y ojos que se
   * encienden y se apagan alrededor del borde. Disponible para futuras
   * habilidades de área de tipo Fantasma.
   */
export function spawnGhostAoe(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number): void {
const life = Math.max(0.2, duration);
    const root = new pc.Entity('ghost-aoe');
    root.setPosition(x, 0.03, z);
    ctx.app.root.addChild(root);

    const fillMaterial = ctx.createWaterMaterial(color, 0.1);
    const wispMaterial = ctx.createWaterMaterial([158, 118, 226], 0.45);
    const eyeMaterial = ctx.createMaterial([255, 244, 198], 0.9);
    const materials = [
      fillMaterial,
      wispMaterial,
      eyeMaterial
    ];

    const fill = ctx.createEntity(ctx.discMesh, [fillMaterial], root);
    fill.setLocalPosition(0, 0.03, 0);
    fill.setLocalScale(radius * 2, 1, radius * 2);

    const wispInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 10; index++) {
      wispInstances.push({
        anim0: [
          (index / 10) * Math.PI * 2 + Math.random() * 0.4,
          radius * (0.25 + Math.random() * 0.6),
          Math.random() * 0.5,
          radius * (0.35 + Math.random() * 0.4)
        ],
        anim1: [radius * (0.05 + Math.random() * 0.05), 0, 0, 0]
      });
    }
    const wispBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.boxMesh,
      material: wispMaterial,
      instances: wispInstances,
      motion: MOTION_GHOST_WISPS,
      radius,
      life
    });

    const eyeInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 4; index++) {
      const angle = (index / 4) * Math.PI * 2 + 0.6;
      eyeInstances.push({
        x: Math.cos(angle) * radius * 0.72,
        y: 0.45,
        z: Math.sin(angle) * radius * 0.72,
        anim0: [index * 1.4, 0, 0, 0]
      });
    }
    const eyeBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: eyeMaterial,
      instances: eyeInstances,
      motion: MOTION_GHOST_EYES,
      radius,
      life
    });

    let time = 0;
    ctx.addEffect(root, materials, life, (_t, dt) => {
      time += dt;
      const pulse = 0.5 + Math.sin(time * 6) * 0.2;
      fillMaterial.opacity = (0.06 + pulse * 0.04) * (1 - time / life);

      wispBatch.setTime(time);
      eyeBatch.setTime(time);
      eyeMaterial.opacity = 0.85 * (1 - time / life);
    });
}
