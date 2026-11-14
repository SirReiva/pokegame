import type { FxRuntime } from './fxRuntime';
import * as pc from 'playcanvas';
import { DEG } from '../../config';
import { createLightningMesh } from './fxGeometry';

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

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.08 + index * 0.5, 0);
      rings.push(ring);
    }

    const motes: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 7; index++) {
      const mote = ctx.createEntity(ctx.sphereMesh, [moteMaterial], root);
      const size = 0.07 + (index % 3) * 0.025;
      mote.setLocalScale(size, size, size);
      motes.push({
        entity: mote,
        angle: (index / 7) * Math.PI * 2 + Math.random() * 0.3,
        distance: (0.55 + Math.random() * 0.55) * power,
        rise: 0.25 + Math.random() * 0.55,
        size
      });
    }

    ctx.addEffect(root, materials, 0.42, (t) => {
      const ease = 1 - Math.pow(1 - t, 3);
      const coreScale = (0.2 + ease * 1.15) * power;
      core.setLocalScale(coreScale, coreScale, coreScale);
      const bodyScale = (0.2 + ease * 1.9) * power;
      body.setLocalScale(bodyScale, bodyScale, bodyScale);

      rings.forEach((ring, index) => {
        const scale = (0.25 + ease * (2.1 + index * 0.45)) * power;
        ring.setLocalScale(scale, 1, scale);
        ring.setLocalEulerAngles(90, t * (index === 0 ? 180 : -140), 0);
      });

      for (const mote of motes) {
        const local = Math.min(1, Math.max(0, (t - 0.04) / 0.8));
        const distance = mote.distance * local;
        mote.entity.setLocalPosition(
          Math.cos(mote.angle) * distance,
          0.65 + Math.sin(local * Math.PI) * mote.rise,
          Math.sin(mote.angle) * distance
        );
        const fade = Math.max(0, 1 - local);
        mote.entity.setLocalScale(
          mote.size * fade,
          mote.size * fade,
          mote.size * fade
        );
      }

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

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.08 + index * 0.5, 0);
      rings.push(ring);
    }

    const wisps: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 7; index++) {
      const wisp = ctx.createEntity(ctx.boxMesh, [wispMaterial], root);
      const size = 0.12 + Math.random() * 0.12;
      wisp.setLocalScale(size, size, size * 3);
      wisps.push({
        entity: wisp,
        angle: (index / 7) * Math.PI * 2 + Math.random() * 0.4,
        distance: (0.4 + Math.random() * 0.55) * power,
        rise: 0.5 + Math.random() * 0.5,
        size
      });
    }

    const eyes: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const eye = ctx.createEntity(ctx.sphereMesh, [eyeMaterial], root);
      eye.setLocalPosition((index === 0 ? -1 : 1) * 0.18, 0.9, 0.12);
      eyes.push(eye);
    }

    ctx.addEffect(root, materials, 0.45, (t) => {
      const ease = 1 - Math.pow(1 - t, 3);
      const coreScale = (0.16 + ease * 0.62) * power;
      core.setLocalScale(coreScale, coreScale, coreScale);
      const bodyScale = (0.2 + ease * 1.15) * power;
      body.setLocalScale(bodyScale, bodyScale, bodyScale);

      for (const ring of rings) {
        const scale = (0.2 + ease * 1.7) * power;
        ring.setLocalScale(scale, 1, scale);
      }

      for (const wisp of wisps) {
        const local = Math.min(1, Math.max(0, (t - 0.04) / 0.8));
        const distance = wisp.distance * local;
        const angle = wisp.angle + local * 1.4;
        wisp.entity.setLocalPosition(
          Math.cos(angle) * distance,
          0.35 + Math.sin(local * Math.PI) * wisp.rise,
          Math.sin(angle) * distance
        );
        const fade = Math.max(0, 1 - local);
        wisp.entity.setLocalScale(
          wisp.size * fade,
          wisp.size * fade,
          wisp.size * 3.2 * fade
        );
        wisp.entity.setLocalEulerAngles(
          local * 70,
          angle / DEG,
          local * 45
        );
      }

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

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.08 + index * 0.5, 0);
      rings.push(ring);
    }

    const wisps: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 7; index++) {
      const wisp = ctx.createEntity(ctx.sphereMesh, [wispMaterial], root);
      const size = 0.16 + Math.random() * 0.16;
      wisp.setLocalScale(size, size * 0.7, size);
      wisps.push({
        entity: wisp,
        angle: (index / 7) * Math.PI * 2 + Math.random() * 0.35,
        distance: (0.5 + Math.random() * 0.55) * power,
        rise: 0.35 + Math.random() * 0.5,
        size
      });
    }

    const smoke: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 4; index++) {
      const puff = ctx.createEntity(ctx.sphereMesh, [smokeMaterial], root);
      const size = 0.35 + Math.random() * 0.25;
      puff.setLocalScale(size, size * 0.7, size);
      smoke.push({
        entity: puff,
        angle: (index / 4) * Math.PI * 2 + Math.random() * 0.5,
        distance: (0.25 + Math.random() * 0.35) * power,
        rise: 0.25 + Math.random() * 0.35,
        size
      });
    }

    ctx.addEffect(root, materials, 0.4, (t) => {
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

      for (const ring of rings) {
        const scale = (0.2 + ease * 1.8) * power;
        ring.setLocalScale(scale, 1, scale);
        ring.setLocalEulerAngles(90, t * 220, 0);
      }

      for (const wisp of wisps) {
        const local = Math.min(1, Math.max(0, (t - 0.04) / 0.8));
        const distance = wisp.distance * local;
        wisp.entity.setLocalPosition(
          Math.cos(wisp.angle) * distance,
          0.4 + Math.sin(local * Math.PI) * wisp.rise,
          Math.sin(wisp.angle) * distance
        );
        const grow = 0.7 + local * 0.8;
        const fade = Math.max(0, 1 - local);
        wisp.entity.setLocalScale(
          wisp.size * grow * fade,
          wisp.size * 0.7 * grow * fade,
          wisp.size * grow * fade
        );
      }

      for (const puff of smoke) {
        const local = Math.min(1, Math.max(0, t / 0.9));
        const distance = puff.distance * (0.4 + local * 1.2);
        puff.entity.setLocalPosition(
          Math.cos(puff.angle) * distance,
          0.4 + local * puff.rise,
          Math.sin(puff.angle) * distance
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

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.08 + index * 0.5, 0);
      rings.push(ring);
    }

    const shards: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      length: number;
      yaw: number;
      roll: number;
    }[] = [];
    for (let index = 0; index < 6; index++) {
      const shard = ctx.createEntity(ctx.boxMesh, [steelMaterial], root);
      shards.push({
        entity: shard,
        angle: (index / 6) * Math.PI * 2 + 0.35,
        distance: (0.45 + Math.random() * 0.5) * power,
        rise: 0.12 + Math.random() * 0.35,
        length: 0.28 + Math.random() * 0.26,
        yaw: Math.random() * 360,
        roll: (Math.random() - 0.5) * 120
      });
    }

    const sparks: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 8; index++) {
      const spark = ctx.createEntity(ctx.sphereMesh, [sparkMaterial], root);
      const size = 0.05 + Math.random() * 0.04;
      spark.setLocalScale(size, size, size);
      sparks.push({
        entity: spark,
        angle: Math.random() * Math.PI * 2,
        distance: (0.55 + Math.random() * 0.8) * power,
        rise: 0.25 + Math.random() * 0.55,
        size
      });
    }

    ctx.addEffect(root, materials, 0.34, (t) => {
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

      for (const ring of rings) {
        const scale = (0.2 + ease * 1.7) * power;
        ring.setLocalScale(scale, 1, scale);
        ring.setLocalEulerAngles(90, t * 240, 0);
      }

      for (const shard of shards) {
        const local = Math.min(1, Math.max(0, (t - 0.03) / 0.75));
        const distance = shard.distance * local;
        shard.entity.setLocalPosition(
          Math.cos(shard.angle) * distance,
          0.65 + Math.sin(local * Math.PI) * shard.rise,
          Math.sin(shard.angle) * distance
        );
        const fade = Math.max(0, 1 - local);
        shard.entity.setLocalScale(
          0.07 * fade,
          0.07 * fade,
          shard.length * fade
        );
        shard.entity.setLocalEulerAngles(
          shard.yaw + t * 180,
          shard.yaw + t * 240,
          shard.roll
        );
      }

      for (const spark of sparks) {
        const local = Math.min(1, Math.max(0, (t - 0.02) / 0.82));
        const distance = spark.distance * local;
        spark.entity.setLocalPosition(
          Math.cos(spark.angle) * distance,
          0.65 + Math.sin(local * Math.PI) * spark.rise,
          Math.sin(spark.angle) * distance
        );
        const fade = Math.max(0, 1 - local);
        spark.entity.setLocalScale(
          spark.size * fade,
          spark.size * fade,
          spark.size * fade
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

    const clusters: {
      core: pc.Entity;
      lines: { entity: pc.Entity; angle: number }[];
      delay: number;
    }[] = [];
    for (let index = 0; index < 3; index++) {
      const angle = (index / 3) * Math.PI * 2 + 0.4;
      const offset = (0.12 + index * 0.06) * power;
      const cluster = new pc.Entity('fighting-cluster');
      cluster.setLocalPosition(
        Math.cos(angle) * offset,
        0.68 + index * 0.04,
        Math.sin(angle) * offset
      );
      root.addChild(cluster);

      const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], cluster);
      const lines: { entity: pc.Entity; angle: number }[] = [];
      for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
        const line = ctx.createEntity(ctx.boxMesh, [lineMaterial], cluster);
        lines.push({
          entity: line,
          angle: (lineIndex / 4) * Math.PI * 2 + index * 0.5
        });
      }
      clusters.push({ core, lines, delay: index * 0.05 });
    }

    const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.08, 0);

    const puffs: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 7; index++) {
      const puff = ctx.createEntity(ctx.sphereMesh, [puffMaterial], root);
      const size = 0.2 + Math.random() * 0.18;
      puff.setLocalScale(size, size * 0.8, size);
      puffs.push({
        entity: puff,
        angle: (index / 7) * Math.PI * 2 + Math.random() * 0.35,
        distance: (0.55 + Math.random() * 0.55) * power,
        rise: 0.25 + Math.random() * 0.45,
        size
      });
    }

    ctx.addEffect(root, materials, 0.42, (t) => {
      const ease = 1 - Math.pow(1 - t, 3);
      const ringScale = (0.22 + ease * 2.1) * power;
      ring.setLocalScale(ringScale, 1, ringScale);
      ring.setLocalEulerAngles(90, t * 160, 0);

      for (const cluster of clusters) {
        const local = Math.min(
          1,
          Math.max(0, (t - cluster.delay) / 0.32)
        );
        const appear = local <= 0 ? 0 : 1;
        const fade = Math.max(0, 1 - local);
        const coreScale = (0.08 + local * 0.42) * appear;
        cluster.core.setLocalScale(coreScale, coreScale, coreScale);

        for (const line of cluster.lines) {
          const distance = (0.1 + local * 0.45) * power;
          line.entity.setLocalPosition(
            Math.sin(line.angle) * distance,
            0,
            Math.cos(line.angle) * distance
          );
          line.entity.setLocalScale(
            0.035 * fade,
            0.035 * fade,
            (0.16 + local * 0.42) * fade
          );
          line.entity.setLocalEulerAngles(0, line.angle / DEG, 0);
        }
      }

      for (const puff of puffs) {
        const local = Math.min(1, Math.max(0, (t - 0.03) / 0.78));
        const distance = puff.distance * local;
        puff.entity.setLocalPosition(
          Math.cos(puff.angle) * distance,
          0.35 + Math.sin(local * Math.PI) * puff.rise,
          Math.sin(puff.angle) * distance
        );
        const grow = 0.7 + local * 0.6;
        const fade = Math.max(0, 1 - local);
        puff.entity.setLocalScale(
          puff.size * grow * fade,
          puff.size * 0.8 * grow * fade,
          puff.size * grow * fade
        );
      }

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

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.06 + index * 0.45, 0);
      rings.push(ring);
    }

    const drops: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 8; index++) {
      const drop = ctx.createEntity(ctx.sphereMesh, [dropMaterial], root);
      const size = 0.06 + Math.random() * 0.05;
      drop.setLocalScale(size, size, size);
      drops.push({
        entity: drop,
        angle: (index / 8) * Math.PI * 2 + Math.random() * 0.4,
        distance: (0.55 + Math.random() * 0.6) * power,
        rise: 0.25 + Math.random() * 0.45,
        size
      });
    }

    ctx.addEffect(root, materials, 0.34, (t) => {
      const ease = 1 - Math.pow(1 - t, 3);
      const coreScale = (0.14 + ease * 0.5) * power;
      core.setLocalScale(coreScale, coreScale, coreScale);

      const starScale = (0.22 + ease * 1.25) * power;
      starPivot.setLocalScale(starScale, starScale, starScale);
      starPivot.setLocalEulerAngles(0, t * 300, 0);

      for (const ring of rings) {
        const scale = (0.18 + ease * 1.7) * power;
        ring.setLocalScale(scale, 1, scale);
        ring.setLocalEulerAngles(90, t * 200, 0);
      }

      for (const drop of drops) {
        const local = Math.min(1, Math.max(0, (t - 0.02) / 0.8));
        const distance = drop.distance * local;
        drop.entity.setLocalPosition(
          Math.cos(drop.angle) * distance,
          0.4 + Math.sin(local * Math.PI) * drop.rise,
          Math.sin(drop.angle) * distance
        );
        const fade = Math.max(0, 1 - local);
        drop.entity.setLocalScale(
          drop.size * fade,
          drop.size * fade,
          drop.size * fade
        );
      }

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

    const shards: {
      entity: pc.Entity;
      angle: number;
      rise: number;
      distance: number;
      length: number;
      spin: number;
      delay: number;
    }[] = [];
    const count = 7;
    for (let index = 0; index < count; index++) {
      const shard = ctx.createEntity(
        ctx.rockSpikeMesh,
        [shardMaterial],
        root
      );
      const length = (0.2 + (index % 3) * 0.06) * power;
      shard.setLocalScale(0.09 * power, length, 0.09 * power);
      shards.push({
        entity: shard,
        angle: (index / count) * Math.PI * 2 + 0.35,
        rise: 0.5 + (index % 2) * 0.35,
        distance: 0.55 + (index % 3) * 0.16,
        length,
        spin: (index % 2 === 0 ? 1 : -1) * (260 + index * 40),
        delay: index * 0.02
      });
    }

    ctx.addEffect(root, materials, 0.38, (t) => {
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

      for (const shard of shards) {
        const shardT = Math.min(
          1,
          Math.max(0, (t - shard.delay) / 0.7)
        );
        const travel = 1 - (1 - shardT) * (1 - shardT);
        shard.entity.setLocalPosition(
          Math.cos(shard.angle) * shard.distance * travel,
          0.1 + shard.rise * travel,
          Math.sin(shard.angle) * shard.distance * travel
        );
        shard.entity.setLocalEulerAngles(
          (shardT * 320) % 360,
          (shardT * shard.spin) % 360,
          (shardT * 180) % 360
        );
        const grow = 1 - shardT * 0.6;
        shard.entity.setLocalScale(
          0.09 * power * grow,
          shard.length * grow,
          0.09 * power * grow
        );
      }
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

    const arcs: pc.Entity[] = [];
    for (let index = 0; index < 3; index++) {
      const mesh = createLightningMesh(
        ctx.device,
        0.9,
        0.025,
        4,
        2000 + index * 3571
      );
      const arc = ctx.createEntity(mesh, [arcMaterial], root);
      arc.setLocalPosition(0, 0.65, 0);
      arc.setLocalEulerAngles(index * 70, index * 110, index * 45);
      arcs.push(arc);
    }

    const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.08, 0);

    ctx.addEffect(root, materials, 0.32, (t) => {
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

      for (let index = 0; index < arcs.length; index++) {
        arcs[index].setLocalEulerAngles(
          (index * 70 + t * 220) % 360,
          (index * 110 + t * 300) % 360,
          (index * 45 + t * 180) % 360
        );
      }
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
    const burstLight = ctx.createFireLight(root, 0, 0.55, 0, 1.1, 4);

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.62, 0);
    const glow = ctx.createEntity(ctx.sphereMesh, [glowMaterial], root);
    glow.setLocalPosition(0, 0.62, 0);

    const flames: {
      entity: pc.Entity;
      offsetX: number;
      offsetZ: number;
      baseWidth: number;
      baseHeight: number;
      yaw: number;
      phase: number;
    }[] = [];
    for (let index = 0; index < 5; index++) {
      const angle = (index / 5) * Math.PI * 2 + 0.4;
      const dist = 0.1 + ((index * 13) % 10) / 10 * 0.16;
      const baseWidth = 0.28 + ((index * 17) % 10) / 10 * 0.16;
      const baseHeight = 0.55 + ((index * 29) % 10) / 10 * 0.35;
      const yaw = (index * 53) % 360;
      const entity = ctx.createFlame(
        root,
        index % 3 === 0 ? hotMaterial : flameMaterial,
        {
          x: Math.cos(angle) * dist,
          y: 0.08,
          z: Math.sin(angle) * dist,
          width: baseWidth,
          height: baseHeight,
          yaw
        }
      );
      flames.push({
        entity,
        offsetX: Math.cos(angle) * dist,
        offsetZ: Math.sin(angle) * dist,
        baseWidth,
        baseHeight,
        yaw,
        phase: index * 1.4
      });
    }

    const sparks: {
      entity: pc.Entity;
      dirX: number;
      dirZ: number;
      speed: number;
      lift: number;
      phase: number;
    }[] = [];
    for (let index = 0; index < 7; index++) {
      const angle = (index / 7) * Math.PI * 2 + 0.9;
      const spark = ctx.createEntity(ctx.sphereMesh, [sparkMaterial], root);
      const size = 0.05 + ((index * 11) % 10) / 10 * 0.05;
      spark.setLocalScale(size, size, size);
      sparks.push({
        entity: spark,
        dirX: Math.cos(angle),
        dirZ: Math.sin(angle),
        speed: 0.8 + ((index * 7) % 10) / 10 * 1.1,
        lift: 1.4 + ((index * 3) % 10) / 10 * 1.2,
        phase: index * 1.9
      });
    }

    const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.08, 0);

    const animate = (t: number): void => {
      const boost = effectiveness > 1 ? 1.35 : 1;
      const scale = (0.18 + t * 0.95) * boost;
      core.setLocalScale(scale, scale, scale);
      const glowScale = (0.45 + t * 1.7) * boost;
      glow.setLocalScale(glowScale, glowScale, glowScale);
      coreMaterial.opacity = 0.9 * (1 - t);
      glowMaterial.opacity = 0.4 * (1 - t);

      for (const flame of flames) {
        const life =
          Math.min(1, t / 0.12) *
          (1 - Math.max(0, (t - 0.3) / 0.7));
        const sway = Math.sin(t * 21 + flame.phase) * 0.2;
        const scaleNow = Math.max(0.001, life);
        flame.entity.setLocalScale(
          flame.baseWidth * scaleNow * (1 + sway * 0.3),
          flame.baseHeight * scaleNow * (1.05 + sway),
          flame.baseWidth * scaleNow * (1 + sway * 0.3)
        );
        flame.entity.setLocalPosition(
          flame.offsetX * (1 + t * 0.4),
          0.08 + t * 1.05,
          flame.offsetZ * (1 + t * 0.4)
        );
        flame.entity.setLocalEulerAngles(
          0,
          flame.yaw + t * 70,
          Math.sin(t * 18 + flame.phase) * 10
        );
      }

      for (const spark of sparks) {
        const travel = t * 0.42;
        const y = spark.lift * travel - 4.2 * travel * travel;
        spark.entity.setLocalPosition(
          spark.dirX * spark.speed * travel,
          Math.max(0.03, 0.35 + y),
          spark.dirZ * spark.speed * travel
        );
        const sparkLife = Math.max(0, 1 - t) * (0.8 + Math.sin(t * 30 + spark.phase) * 0.2);
        spark.entity.setLocalScale(
          sparkLife * 0.1,
          sparkLife * 0.1,
          sparkLife * 0.1
        );
      }
      sparkMaterial.opacity = 0.9 * (1 - t);

      flameMaterial.opacity = 0.5 * (1 - t) * (0.85 + Math.random() * 0.15);
      hotMaterial.opacity = 0.55 * (1 - t) * (0.85 + Math.random() * 0.15);
      burstLight.light!.intensity =
        1.1 * (1 - t) * (0.65 + Math.random() * 0.35);

      const ringScale = (0.5 + t * 1.15) * boost;
      ring.setLocalScale(ringScale, 1, ringScale);
      ringMaterial.opacity = 0.4 * (1 - t);
    };
    ctx.addEffect(root, materials, 0.45, animate);
    animate(0);
}
