import type { FxRuntime } from './fxRuntime';
import * as pc from 'playcanvas';
import { EffectBatch, MOTION_FIGHTING_CORES, MOTION_FIGHTING_LINES, MOTION_FIRE_BURST_FLAMES, MOTION_FIRE_BURST_SPARKS, MOTION_IMPACT_PUFFS, MOTION_IMPACT_RADIAL, MOTION_IMPACT_RINGS, MOTION_JAW_SHARDS, MOTION_PROJECTILE_ARCS } from '../../effectBatch';
import type { EffectBatchInstance } from '../../effectBatch';
import { createLightningMesh } from './fxGeometry';
import { polar } from './fxTrig';
import type { Polar } from './fxTrig';

/** Impacto de un golpe. `effectiveness` tiñe el destello. */
export function spawnHit(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number): void {
const tint: [number, number, number] =
      effectiveness > 1
        ? [255, 244, 160]
        : effectiveness < 1
          ? [130, 148, 170]
          : [color[0], color[1], color[2]];
    const material = ctx.createMaterial(tint, 0.95);
    const entity = ctx.createEntity(ctx.sphereMesh, [material]);
    entity.setPosition(x, 0.65, z);

    ctx.addEffect(
      entity,
      [material],
      0.3,
      (t) => {
        const scale = 0.25 + t * (effectiveness > 1 ? 1.35 : 0.85);
        entity.setLocalScale(scale, scale, scale);
        entity.setPosition(x, 0.65 + t * 0.15, z);
        material.opacity = 0.95 * (1 - t);
      },
      [[x, z]]
    );
}

/**
   * Explosión de aura: núcleo claro, cuerpo azul que se expande, dos ondas y
   * motas que salen despedidas. La mezcla normal mantiene el azul legible.
   */
export function spawnAuraBurst(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number): void {
const root = new pc.Entity('aura-burst');
    root.setPosition(x, 0, z);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createMaterial([240, 250, 255], 0.95);
    const bodyMaterial = ctx.createAuraMaterial(color, 0.5);
    const ringMaterial = ctx.createAuraMaterial([196, 228, 255], 0.72);
    const moteMaterial = ctx.createAuraMaterial([220, 242, 255], 0.9);
    const materials = [coreMaterial, bodyMaterial, ringMaterial, moteMaterial];
    const power =
      effectiveness > 1 ? 1.25 : effectiveness < 1 ? 0.85 : 1;

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.65, 0);
    const body = ctx.createEntity(ctx.sphereMesh, [bodyMaterial], root);
    body.setLocalPosition(0, 0.65, 0);
    body.setLocalScale(0.2, 0.2, 0.2);

    const ringBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.torusMesh,
      material: ringMaterial,
      instances: [
        { anim0: [0.08, 0, 90, 180], anim1: [power, 0.25, 2.1, 0] },
        { anim0: [0.58, 0.45, 90, -140], anim1: [power, 0.25, 2.55, 0] }
      ],
      motion: MOTION_IMPACT_RINGS,
      life: 0.42
    });

    const moteInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 7; index++) {
      const size = 0.07 + (index % 3) * 0.025;
      moteInstances.push({
        anim0: [
          (index / 7) * Math.PI * 2 + Math.random() * 0.3,
          (0.55 + Math.random() * 0.55) * power,
          0.25 + Math.random() * 0.55,
          size
        ],
        anim1: [0.04, 0.8, 0.65, 0],
        anim2: [0, 1, 0, 0]
      });
    }
    const moteBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: moteMaterial,
      instances: moteInstances,
      motion: MOTION_IMPACT_RADIAL,
      life: 0.42
    });

    let time = 0;
    ctx.addEffect(root, materials, 0.42, (t, dt) => {
      time += dt;
      const ease = 1 - Math.pow(1 - t, 3);
      const coreScale = (0.2 + ease * 1.15) * power;
      core.setLocalScale(coreScale, coreScale, coreScale);
      const bodyScale = (0.2 + ease * 1.9) * power;
      body.setLocalScale(bodyScale, bodyScale, bodyScale);

      ringBatch.setTime(time);
      moteBatch.setTime(time);

      coreMaterial.opacity = 0.95 * (1 - t);
      bodyMaterial.opacity = 0.5 * (1 - t);
      ringMaterial.opacity = 0.72 * (1 - t);
      moteMaterial.opacity = 0.9 * (1 - t);
    });
}

/**
   * Impacto fantasma: destello violáceo, cuerpo oscuro, dos ondas, jirones que
   * suben y un par de ojos que aparecen un instante antes de desvanecerse.
   */
export function spawnGhostBurst(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number): void {
const root = new pc.Entity('ghost-burst');
    root.setPosition(x, 0, z);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createMaterial([240, 230, 255], 0.95);
    const bodyMaterial = ctx.createWaterMaterial(color, 0.55);
    const ringMaterial = ctx.createWaterMaterial([198, 170, 255], 0.6);
    const wispMaterial = ctx.createWaterMaterial([158, 118, 226], 0.5);
    const eyeMaterial = ctx.createMaterial([255, 244, 198], 0.95);
    const materials = [
      coreMaterial,
      bodyMaterial,
      ringMaterial,
      wispMaterial,
      eyeMaterial
    ];
    const power =
      effectiveness > 1 ? 1.24 : effectiveness < 1 ? 0.86 : 1;

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.7, 0);
    const body = ctx.createEntity(ctx.sphereMesh, [bodyMaterial], root);
    body.setLocalPosition(0, 0.7, 0);

    const ringBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.torusMesh,
      material: ringMaterial,
      instances: [
        { anim0: [0.08, 0, 0, 0], anim1: [power, 0.2, 1.7, 0] },
        { anim0: [0.58, 0, 0, 0], anim1: [power, 0.2, 1.7, 0] }
      ],
      motion: MOTION_IMPACT_RINGS,
      life: 0.45
    });

    const wispInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 7; index++) {
      const size = 0.12 + Math.random() * 0.12;
      wispInstances.push({
        anim0: [
          (index / 7) * Math.PI * 2 + Math.random() * 0.4,
          (0.4 + Math.random() * 0.55) * power,
          0.5 + Math.random() * 0.5,
          size
        ],
        anim1: [0.04, 0.8, 0.35, 70],
        anim2: [1.4, 3.2, 45, 0]
      });
    }
    const wispBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.boxMesh,
      material: wispMaterial,
      instances: wispInstances,
      motion: MOTION_IMPACT_RADIAL,
      life: 0.45
    });

    const eyes: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const eye = ctx.createEntity(ctx.sphereMesh, [eyeMaterial], root);
      eye.setLocalPosition((index === 0 ? -1 : 1) * 0.18, 0.9, 0.12);
      eyes.push(eye);
    }

    let time = 0;
    ctx.addEffect(root, materials, 0.45, (t, dt) => {
      time += dt;
      const ease = 1 - Math.pow(1 - t, 3);
      const coreScale = (0.16 + ease * 0.62) * power;
      core.setLocalScale(coreScale, coreScale, coreScale);
      const bodyScale = (0.2 + ease * 1.15) * power;
      body.setLocalScale(bodyScale, bodyScale, bodyScale);

      ringBatch.setTime(time);
      wispBatch.setTime(time);

      const eyeFade = Math.max(0, 1 - Math.max(0, (t - 0.18) / 0.28));
      const eyeScale = 0.1 * power * eyeFade;
      for (const eye of eyes) {
        eye.setLocalScale(eyeScale, eyeScale, eyeScale * 0.7);
      }

      coreMaterial.opacity = 0.95 * (1 - t);
      bodyMaterial.opacity = 0.5 * (1 - t);
      ringMaterial.opacity = 0.6 * (1 - t);
      wispMaterial.opacity = 0.5 * (1 - t);
      eyeMaterial.opacity = 0.95 * eyeFade;
    });
}

/**
   * Impacto de sombra: núcleo claro, cuerpo violeta, tres tajos que se cruzan
   * y jirones que suben. La mezcla normal evita que el violeta se lave.
   */
export function spawnDarkBurst(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number): void {
const root = new pc.Entity('dark-burst');
    root.setPosition(x, 0, z);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createMaterial([232, 216, 255], 0.95);
    const bodyMaterial = ctx.createWaterMaterial(color, 0.55);
    const slashMaterial = ctx.createWaterMaterial([210, 180, 255], 0.85);
    const ringMaterial = ctx.createWaterMaterial([196, 164, 255], 0.6);
    const wispMaterial = ctx.createWaterMaterial([160, 124, 226], 0.45);
    const smokeMaterial = ctx.createWaterMaterial([74, 46, 126], 0.4);
    const materials = [
      coreMaterial,
      bodyMaterial,
      slashMaterial,
      ringMaterial,
      wispMaterial,
      smokeMaterial
    ];
    const power =
      effectiveness > 1 ? 1.24 : effectiveness < 1 ? 0.86 : 1;

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.65, 0);
    const body = ctx.createEntity(ctx.sphereMesh, [bodyMaterial], root);
    body.setLocalPosition(0, 0.65, 0);

    const slashes: { entity: pc.Entity; yaw: number; roll: number; delay: number }[] =
      [];
    for (let index = 0; index < 3; index++) {
      const slash = ctx.createEntity(ctx.boxMesh, [slashMaterial], root);
      slash.setLocalPosition(0, 0.65, 0);
      slashes.push({
        entity: slash,
        yaw: index * 60 + 30,
        roll: (index - 1) * 26,
        delay: index * 0.03
      });
    }

    const ringBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.torusMesh,
      material: ringMaterial,
      instances: [
        { anim0: [0.08, 0, 90, 220], anim1: [power, 0.2, 1.8, 0] },
        { anim0: [0.58, 0, 90, 220], anim1: [power, 0.2, 1.8, 0] }
      ],
      motion: MOTION_IMPACT_RINGS,
      life: 0.4
    });

    const wispInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 7; index++) {
      const size = 0.16 + Math.random() * 0.16;
      wispInstances.push({
        anim0: [
          (index / 7) * Math.PI * 2 + Math.random() * 0.35,
          (0.5 + Math.random() * 0.55) * power,
          0.35 + Math.random() * 0.5,
          size
        ],
        anim1: [0.04, 0.8, 0.4, 0],
        anim2: [0, 1, 0, 0]
      });
    }
    const wispBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: wispMaterial,
      instances: wispInstances,
      motion: MOTION_IMPACT_RADIAL,
      life: 0.4
    });

    const smoke: (Polar & {
      entity: pc.Entity;
      distance: number;
      rise: number;
      size: number;
    })[] = [];
    for (let index = 0; index < 4; index++) {
      const puff = ctx.createEntity(ctx.sphereMesh, [smokeMaterial], root);
      const size = 0.35 + Math.random() * 0.25;
      puff.setLocalScale(size, size * 0.7, size);
      smoke.push({
        entity: puff,
        ...polar((index / 4) * Math.PI * 2 + Math.random() * 0.5),
        distance: (0.25 + Math.random() * 0.35) * power,
        rise: 0.25 + Math.random() * 0.35,
        size
      });
    }

    let time = 0;
    ctx.addEffect(root, materials, 0.4, (t, dt) => {
      time += dt;
      const ease = 1 - Math.pow(1 - t, 3);
      const coreScale = (0.16 + ease * 0.62) * power;
      core.setLocalScale(coreScale, coreScale, coreScale);
      const bodyScale = (0.18 + ease * 1.1) * power;
      body.setLocalScale(bodyScale, bodyScale, bodyScale);

      slashes.forEach((slash) => {
        const local = Math.min(
          1,
          Math.max(0, (t - slash.delay) / 0.38)
        );
        const length = (0.45 + local * 1.35) * power;
        const thickness = 0.09 * (1 - local * 0.35);
        slash.entity.setLocalScale(thickness, thickness, length);
        slash.entity.setLocalEulerAngles(
          0,
          slash.yaw + local * 20,
          slash.roll + local * 32
        );
      });

      ringBatch.setTime(time);
      wispBatch.setTime(time);

      for (const puff of smoke) {
        const local = Math.min(1, Math.max(0, t / 0.9));
        const distance = puff.distance * (0.4 + local * 1.2);
        puff.entity.setLocalPosition(
          puff.cos * distance,
          0.4 + local * puff.rise,
          puff.sin * distance
        );
        const grow = 0.8 + local * 0.9;
        const fade = Math.max(0, 1 - local);
        puff.entity.setLocalScale(
          puff.size * grow * fade,
          puff.size * 0.7 * grow * fade,
          puff.size * grow * fade
        );
      }

      coreMaterial.opacity = 0.95 * (1 - t);
      bodyMaterial.opacity = 0.32 * (1 - t);
      slashMaterial.opacity = 0.9 * (1 - t);
      ringMaterial.opacity = 0.6 * (1 - t);
      wispMaterial.opacity = 0.45 * (1 - t);
      smokeMaterial.opacity = 0.4 * (1 - t);
    });
}

/**
   * Impacto de acero: tres tajos largos que se cruzan, esquirlas metálicas y
   * chispas. El destello es pequeño para que la silueta la den los filos.
   */
export function spawnSteelBurst(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number): void {
const root = new pc.Entity('steel-burst');
    root.setPosition(x, 0, z);
    ctx.app.root.addChild(root);

    const flashMaterial = ctx.createMaterial([246, 251, 255], 0.9);
    const slashMaterial = ctx.createMaterial([224, 242, 255], 0.9);
    const steelMaterial = ctx.createAuraMaterial(color, 0.8);
    const ringMaterial = ctx.createAuraMaterial(color, 0.55);
    const sparkMaterial = ctx.createMaterial([255, 250, 218], 0.95);
    const materials = [
      flashMaterial,
      slashMaterial,
      steelMaterial,
      ringMaterial,
      sparkMaterial
    ];
    const power =
      effectiveness > 1 ? 1.22 : effectiveness < 1 ? 0.86 : 1;

    const flash = ctx.createEntity(ctx.sphereMesh, [flashMaterial], root);
    flash.setLocalPosition(0, 0.65, 0);

    const slashes: {
      entity: pc.Entity;
      yaw: number;
      roll: number;
      delay: number;
    }[] = [];
    for (let index = 0; index < 3; index++) {
      const slash = ctx.createEntity(ctx.boxMesh, [slashMaterial], root);
      slashes.push({
        entity: slash,
        yaw: index * 60 + 15,
        roll: (index - 1) * 24,
        delay: index * 0.025
      });
    }

    const ringBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.torusMesh,
      material: ringMaterial,
      instances: [
        { anim0: [0.08, 0, 90, 240], anim1: [power, 0.2, 1.7, 0] },
        { anim0: [0.58, 0, 90, 240], anim1: [power, 0.2, 1.7, 0] }
      ],
      motion: MOTION_IMPACT_RINGS,
      life: 0.34
    });

    const shards: (Polar & {
      entity: pc.Entity;
      distance: number;
      rise: number;
      length: number;
      yaw: number;
      roll: number;
    })[] = [];
    for (let index = 0; index < 6; index++) {
      const shard = ctx.createEntity(ctx.boxMesh, [steelMaterial], root);
      shards.push({
        entity: shard,
        ...polar((index / 6) * Math.PI * 2 + 0.35),
        distance: (0.45 + Math.random() * 0.5) * power,
        rise: 0.12 + Math.random() * 0.35,
        length: 0.28 + Math.random() * 0.26,
        yaw: Math.random() * 360,
        roll: (Math.random() - 0.5) * 120
      });
    }

    const sparkInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 8; index++) {
      const size = 0.05 + Math.random() * 0.04;
      sparkInstances.push({
        anim0: [
          Math.random() * Math.PI * 2,
          (0.55 + Math.random() * 0.8) * power,
          0.25 + Math.random() * 0.55,
          size
        ],
        anim1: [0.02, 0.82, 0.65, 0],
        anim2: [0, 1, 0, 0]
      });
    }
    const sparkBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: sparkMaterial,
      instances: sparkInstances,
      motion: MOTION_IMPACT_RADIAL,
      life: 0.34
    });

    let time = 0;
    ctx.addEffect(root, materials, 0.34, (t, dt) => {
      time += dt;
      const ease = 1 - Math.pow(1 - t, 3);
      const flashScale = (0.14 + ease * 0.42) * power;
      flash.setLocalScale(flashScale, flashScale, flashScale);

      slashes.forEach((slash) => {
        const local = Math.min(
          1,
          Math.max(0, (t - slash.delay) / 0.42)
        );
        const length = (0.3 + local * 1.05) * power;
        const thickness = 0.05 * (1 - local * 0.45);
        slash.entity.setLocalScale(thickness, thickness, length);
        slash.entity.setLocalEulerAngles(
          0,
          slash.yaw + local * 18,
          slash.roll + local * 30
        );
      });

      ringBatch.setTime(time);
      sparkBatch.setTime(time);

      // Tiempo, arco y fundido son iguales para todas las esquirlas: fuera del bucle.
      const shardLocal = Math.min(1, Math.max(0, (t - 0.03) / 0.75));
      const shardArc = Math.sin(shardLocal * Math.PI);
      const shardFade = Math.max(0, 1 - shardLocal);
      for (const shard of shards) {
        const distance = shard.distance * shardLocal;
        shard.entity.setLocalPosition(
          shard.cos * distance,
          0.65 + shardArc * shard.rise,
          shard.sin * distance
        );
        shard.entity.setLocalScale(
          0.07 * shardFade,
          0.07 * shardFade,
          shard.length * shardFade
        );
        shard.entity.setLocalEulerAngles(
          shard.yaw + t * 180,
          shard.yaw + t * 240,
          shard.roll
        );
      }

      flashMaterial.opacity = 0.9 * (1 - t);
      slashMaterial.opacity = 0.9 * (1 - t);
      steelMaterial.opacity = 0.8 * (1 - t);
      ringMaterial.opacity = 0.55 * (1 - t);
      sparkMaterial.opacity = 0.95 * (1 - t);
    });
}

/**
   * Impacto de lucha: tres focos de golpe escalonados con líneas de impacto
   * cruzadas, una onda en el suelo y polvo de aura. Se lee como una ráfaga de
   * puñetazos, no como una única explosión.
   */
export function spawnFightingBurst(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number): void {
const root = new pc.Entity('fighting-burst');
    root.setPosition(x, 0, z);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createMaterial([255, 246, 224], 0.9);
    const lineMaterial = ctx.createMaterial([236, 248, 255], 0.9);
    const ringMaterial = ctx.createAuraMaterial(color, 0.65);
    const puffMaterial = ctx.createAuraMaterial([196, 226, 255], 0.34);
    const materials = [coreMaterial, lineMaterial, ringMaterial, puffMaterial];
    const power =
      effectiveness > 1 ? 1.25 : effectiveness < 1 ? 0.85 : 1;

    const coreInstances: EffectBatchInstance[] = [];
    const lineInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 3; index++) {
      const angle = (index / 3) * Math.PI * 2 + 0.4;
      const offset = (0.12 + index * 0.06) * power;
      const cx = Math.cos(angle) * offset;
      const cy = 0.68 + index * 0.04;
      const cz = Math.sin(angle) * offset;
      coreInstances.push({
        anim0: [cx, cy, cz, index * 0.05],
        anim1: [power, 0, 0, 0]
      });
      for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
        lineInstances.push({
          anim0: [
            cx,
            cy,
            cz,
            (lineIndex / 4) * Math.PI * 2 + index * 0.5
          ],
          anim1: [index * 0.05, 0.32, power, 0]
        });
      }
    }
    const coreBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: coreMaterial,
      instances: coreInstances,
      motion: MOTION_FIGHTING_CORES,
      life: 0.42
    });
    const lineBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.boxMesh,
      material: lineMaterial,
      instances: lineInstances,
      motion: MOTION_FIGHTING_LINES,
      life: 0.42
    });

    const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.08, 0);

    const puffInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 7; index++) {
      const size = 0.2 + Math.random() * 0.18;
      puffInstances.push({
        anim0: [
          (index / 7) * Math.PI * 2 + Math.random() * 0.35,
          (0.55 + Math.random() * 0.55) * power,
          0.25 + Math.random() * 0.45,
          size
        ],
        anim1: [0.03, 0.78, 0.35, 0.8],
        anim2: [0.6, 0, 0, 0]
      });
    }
    const puffBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: puffMaterial,
      instances: puffInstances,
      motion: MOTION_IMPACT_PUFFS,
      life: 0.42
    });

    let time = 0;
    ctx.addEffect(root, materials, 0.42, (t, dt) => {
      time += dt;
      const ease = 1 - Math.pow(1 - t, 3);
      const ringScale = (0.22 + ease * 2.1) * power;
      ring.setLocalScale(ringScale, 1, ringScale);
      ring.setLocalEulerAngles(90, t * 160, 0);

      coreBatch.setTime(time);
      lineBatch.setTime(time);
      puffBatch.setTime(time);

      coreMaterial.opacity = 0.9 * (1 - t);
      lineMaterial.opacity = 0.9 * (1 - t);
      ringMaterial.opacity = 0.65 * (1 - t);
      puffMaterial.opacity = 0.34 * (1 - t);
    });
}

/**
   * Impacto de shuriken: cuatro hojas de agua que salen girando desde el punto
   * de golpe, con un destello central, dos ondas y gotas pequeñas.
   */
export function spawnShurikenBurst(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number): void {
const root = new pc.Entity('shuriken-burst');
    root.setPosition(x, 0, z);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createMaterial([255, 255, 255], 0.95);
    const bladeMaterial = ctx.createWaterMaterial([196, 240, 255], 0.95);
    const ringMaterial = ctx.createWaterMaterial(color, 0.6);
    const dropMaterial = ctx.createWaterMaterial([220, 246, 255], 0.8);
    const materials = [
      coreMaterial,
      bladeMaterial,
      ringMaterial,
      dropMaterial
    ];
    const power =
      effectiveness > 1 ? 1.24 : effectiveness < 1 ? 0.86 : 1;

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.62, 0);

    const starPivot = new pc.Entity('shuriken-impact-pivot');
    starPivot.setLocalPosition(0, 0.62, 0);
    root.addChild(starPivot);
    const star = ctx.createEntity(
      ctx.cachedShuriken(0.95, 0.26),
      [bladeMaterial],
      starPivot
    );
    star.setLocalEulerAngles(90, 0, 0);
    const innerStar = ctx.createEntity(
      ctx.cachedShuriken(0.58, 0.16),
      [coreMaterial],
      star
    );
    innerStar.setLocalEulerAngles(0, 0, 22);

    const ringBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.torusMesh,
      material: ringMaterial,
      instances: [
        { anim0: [0.06, 0, 90, 200], anim1: [power, 0.18, 1.7, 0] },
        { anim0: [0.51, 0, 90, 200], anim1: [power, 0.18, 1.7, 0] }
      ],
      motion: MOTION_IMPACT_RINGS,
      life: 0.34
    });

    const dropInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 8; index++) {
      const size = 0.06 + Math.random() * 0.05;
      dropInstances.push({
        anim0: [
          (index / 8) * Math.PI * 2 + Math.random() * 0.4,
          (0.55 + Math.random() * 0.6) * power,
          0.25 + Math.random() * 0.45,
          size
        ],
        anim1: [0.02, 0.8, 0.4, 0],
        anim2: [0, 1, 0, 0]
      });
    }
    const dropBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: dropMaterial,
      instances: dropInstances,
      motion: MOTION_IMPACT_RADIAL,
      life: 0.34
    });

    let time = 0;
    ctx.addEffect(root, materials, 0.34, (t, dt) => {
      time += dt;
      const ease = 1 - Math.pow(1 - t, 3);
      const coreScale = (0.14 + ease * 0.5) * power;
      core.setLocalScale(coreScale, coreScale, coreScale);

      const starScale = (0.22 + ease * 1.25) * power;
      starPivot.setLocalScale(starScale, starScale, starScale);
      starPivot.setLocalEulerAngles(0, t * 300, 0);

      ringBatch.setTime(time);
      dropBatch.setTime(time);

      coreMaterial.opacity = 0.95 * (1 - t);
      bladeMaterial.opacity = 0.95 * (1 - t);
      ringMaterial.opacity = 0.6 * (1 - t);
      dropMaterial.opacity = 0.8 * (1 - t);
    });
}

/**
   * Impacto de mordida: tres marcas de colmillos cruzadas y esquirlas blancas.
   * Sin núcleos, aros ni destellos, para conservar la paleta limpia.
   */
export function spawnJawBurst(ctx: FxRuntime, x: number,
    z: number,
    effectiveness: number): void {
const root = new pc.Entity('jaw-impact');
    root.setPosition(x, 0.65, z);
    ctx.app.root.addChild(root);

    const power = effectiveness > 1 ? 1.2 : effectiveness < 1 ? 0.9 : 1;
    const shardMaterial = ctx.createRockMaterial([255, 255, 255], 1);
    shardMaterial.emissive = new pc.Color(0.88, 0.88, 0.92);
    shardMaterial.emissiveIntensity = 1;
    shardMaterial.update();
    const streakMaterial = ctx.createWaterMaterial([255, 255, 255], 0.9);
    const materials = [shardMaterial, streakMaterial];

    const streaks: {
      entity: pc.Entity;
      yaw: number;
      roll: number;
      delay: number;
    }[] = [];
    for (let index = 0; index < 3; index++) {
      const streak = ctx.createEntity(ctx.boxMesh, [streakMaterial], root);
      streaks.push({
        entity: streak,
        yaw: index * 60 + 30,
        roll: (index - 1) * 26,
        delay: index * 0.03
      });
    }

    const shardInstances: EffectBatchInstance[] = [];
    const count = 7;
    for (let index = 0; index < count; index++) {
      const length = (0.2 + (index % 3) * 0.06) * power;
      shardInstances.push({
        anim0: [
          (index / count) * Math.PI * 2 + 0.35,
          0.55 + (index % 3) * 0.16,
          0.5 + (index % 2) * 0.35,
          length
        ],
        anim1: [
          index * 0.02,
          (index % 2 === 0 ? 1 : -1) * (260 + index * 40),
          power,
          0
        ]
      });
    }
    const shardBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.rockSpikeMesh,
      material: shardMaterial,
      instances: shardInstances,
      motion: MOTION_JAW_SHARDS,
      life: 0.38
    });

    let time = 0;
    ctx.addEffect(root, materials, 0.38, (t, dt) => {
      time += dt;
      const fade = Math.max(0, 1 - t);

      for (const streak of streaks) {
        const local = Math.min(
          1,
          Math.max(0, (t - streak.delay) / 0.35)
        );
        const length = (0.45 + local * 1.35) * power;
        const thickness = 0.09 * (1 - local * 0.35);
        streak.entity.setLocalScale(thickness, thickness, length);
        streak.entity.setLocalEulerAngles(
          0,
          streak.yaw + local * 20,
          streak.roll + local * 32
        );
      }
      streakMaterial.opacity = 0.62 * fade;
      shardBatch.setTime(time);
      shardMaterial.opacity = fade;
    });
}

/** Explosión eléctrica pequeña: núcleo, halo, arcos cortos y anillo. */
export function spawnElectricBurst(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number): void {
const root = new pc.Entity('electric-burst');
    root.setPosition(x, 0, z);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createMaterial([255, 255, 225], 0.95);
    const glowMaterial = ctx.createMaterial(color, 0.5);
    const arcMaterial = ctx.createMaterial([255, 245, 170], 0.9);
    const ringMaterial = ctx.createMaterial(color, 0.45);
    const materials = [coreMaterial, glowMaterial, arcMaterial, ringMaterial];

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.65, 0);
    const glow = ctx.createEntity(ctx.sphereMesh, [glowMaterial], root);
    glow.setLocalPosition(0, 0.65, 0);

    const arcMesh = ctx.cachedMesh(
      'electric-burst-arc',
      () => createLightningMesh(ctx.device, 0.9, 0.025, 4, 2000)
    );
    const arcBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: arcMesh,
      material: arcMaterial,
      instances: [0, 1, 2].map((index) => ({
        y: 0.65,
        anim0: [index * 70, index * 110, index * 45, 0],
        anim1: [220, 300, 180, 1]
      })),
      motion: MOTION_PROJECTILE_ARCS
    });

    const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.08, 0);

    let time = 0;
    ctx.addEffect(root, materials, 0.32, (t, dt) => {
      time += dt;
      const scale = 0.15 + t * (effectiveness > 1 ? 0.95 : 0.7);
      core.setLocalScale(scale, scale, scale);
      const glowScale = 0.4 + t * (effectiveness > 1 ? 1.6 : 1.2);
      glow.setLocalScale(glowScale, glowScale, glowScale);
      coreMaterial.opacity = 0.95 * (1 - t);
      glowMaterial.opacity = 0.5 * (1 - t);
      arcMaterial.opacity = 0.9 * (1 - t);
      const ringScale = 0.5 + t * 1.1;
      ring.setLocalScale(ringScale, 1, ringScale);
      ringMaterial.opacity = 0.45 * (1 - t);
      arcBatch.setTime(time);
    });
}

/** Explosión de fuego: núcleo, halo, llamas que suben y anillo en el suelo. */
export function spawnFireBurst(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number): void {
const root = new pc.Entity('fire-burst');
    root.setPosition(x, 0, z);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createMaterial([255, 250, 220], 0.9);
    const glowMaterial = ctx.createMaterial(color, 0.4);
    const flameMaterial = ctx.createFlameMaterial([255, 255, 255], 0.55);
    const hotMaterial = ctx.createFlameMaterial([255, 246, 214], 0.6);
    const sparkMaterial = ctx.createMaterial([255, 205, 120], 0.95);
    const ringMaterial = ctx.createMaterial(color, 0.4);
    const materials = [
      coreMaterial,
      glowMaterial,
      flameMaterial,
      hotMaterial,
      sparkMaterial,
      ringMaterial
    ];

    ctx.spawnFlameParticles(root, {
      x: 0,
      y: 0.3,
      z: 0,
      extents: [0.12, 0.12, 0.12],
      velocity: [0, 0.8, 0],
      velocityEnd: [0, 1.8, 0],
      radialSpeed: 1.4,
      radialSpeedEnd: 2.8,
      sizeStart: 0.16,
      sizeMid: 0.36,
      sizeEnd: 0.06,
      lifetime: 0.38,
      rate: 1.5,
      numParticles: 52,
      localSpace: false,
      preWarm: false
    });
    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.62, 0);
    const glow = ctx.createEntity(ctx.sphereMesh, [glowMaterial], root);
    glow.setLocalPosition(0, 0.62, 0);

    const flameInstances: EffectBatchInstance[] = [];
    const hotFlameInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 5; index++) {
      const angle = (index / 5) * Math.PI * 2 + 0.4;
      const dist = 0.1 + ((index * 13) % 10) / 10 * 0.16;
      const instance: EffectBatchInstance = {
        anim0: [
          Math.cos(angle) * dist,
          Math.sin(angle) * dist,
          index * 1.4,
          (index * 53) % 360
        ],
        anim1: [
          0.28 + ((index * 17) % 10) / 10 * 0.16,
          0.55 + ((index * 29) % 10) / 10 * 0.35,
          0,
          0
        ]
      };
      if (index % 3 === 0) hotFlameInstances.push(instance);
      else flameInstances.push(instance);
    }
    const flameBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.flameMesh,
      material: flameMaterial,
      instances: flameInstances,
      motion: MOTION_FIRE_BURST_FLAMES,
      life: 0.45
    });
    const hotFlameBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.flameMesh,
      material: hotMaterial,
      instances: hotFlameInstances,
      motion: MOTION_FIRE_BURST_FLAMES,
      life: 0.45
    });

    const sparkInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 7; index++) {
      const angle = (index / 7) * Math.PI * 2 + 0.9;
      sparkInstances.push({
        anim0: [
          Math.cos(angle),
          Math.sin(angle),
          0.8 + ((index * 7) % 10) / 10 * 1.1,
          1.4 + ((index * 3) % 10) / 10 * 1.2
        ],
        anim1: [index * 1.9, 0.1, 0, 0]
      });
    }
    const sparkBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: sparkMaterial,
      instances: sparkInstances,
      motion: MOTION_FIRE_BURST_SPARKS,
      life: 0.45
    });

    const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.08, 0);

    let time = 0;
    const animate = (t: number, dt: number): void => {
      time += dt;
      const boost = effectiveness > 1 ? 1.35 : 1;
      const scale = (0.18 + t * 0.95) * boost;
      core.setLocalScale(scale, scale, scale);
      const glowScale = (0.45 + t * 1.7) * boost;
      glow.setLocalScale(glowScale, glowScale, glowScale);
      coreMaterial.opacity = 0.9 * (1 - t);
      glowMaterial.opacity = 0.4 * (1 - t);

      flameBatch.setTime(time);
      hotFlameBatch.setTime(time);
      sparkBatch.setTime(time);

      sparkMaterial.opacity = 0.9 * (1 - t);

      flameMaterial.opacity = 0.5 * (1 - t) * (0.85 + Math.random() * 0.15);
      hotMaterial.opacity = 0.55 * (1 - t) * (0.85 + Math.random() * 0.15);

      const ringScale = (0.5 + t * 1.15) * boost;
      ring.setLocalScale(ringScale, 1, ringScale);
      ringMaterial.opacity = 0.4 * (1 - t);
    };
    ctx.addEffect(root, materials, 0.45, animate);
    animate(0, 0);
}
