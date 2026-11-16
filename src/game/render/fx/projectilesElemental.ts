import type { FxRuntime } from './fxRuntime';
import * as pc from 'playcanvas';
import { DEG } from '../../config';
import type { EffectHandle } from '../../core/ports/fx';
import {
  EffectBatch,
  MOTION_PROJECTILE_BLADES,
  MOTION_PROJECTILE_EYES,
  MOTION_PROJECTILE_FEATHERS,
  MOTION_PROJECTILE_ROCK,
  MOTION_PROJECTILE_TRAIL,
  MOTION_PROJECTILE_WISPS,
  MOTION_STATIC
} from '../../effectBatch';
import type { EffectBatchInstance } from '../../effectBatch';
import type { ProjectileVisual } from './fxGeometry';
import { tintColor } from './fxGeometry';

/**
   * Proyectil de aire: dos ruedas de aspas de viento cruzadas giran alrededor
   * del eje de vuelo, con núcleo blanco, halo cálido y una estela de plumas. La
   * mezcla normal mantiene el blanco legible sobre el cielo y la hierba.
   */
export function spawnAirProjectile(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    dirX: number,
    dirZ: number,
    color: readonly [number, number, number]): EffectHandle {
const root = new pc.Entity('air-projectile');
    root.setPosition(x, 0.82, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createWaterMaterial(tintColor(color, 0.9), 0.9);
    const glowMaterial = ctx.createWaterMaterial(color, 0.16);
    const bladeMaterial = ctx.createWaterMaterial(tintColor(color, 0.72), 0.62);
    const hotMaterial = ctx.createMaterial(color, 0.5);
    const featherMaterial = ctx.createLeafMaterial(tintColor(color, 0.52), 0.85);
    // Material propio para el lote de la estela: el `hotMaterial` queda para
    // las aspas calientes, que llevan otra animación instanciada.
    const trailMaterial = ctx.createMaterial(color, 0.5);
    const materials = [
      coreMaterial,
      glowMaterial,
      bladeMaterial,
      hotMaterial,
      featherMaterial,
      trailMaterial
    ];

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalScale(radius * 1.15, radius * 1.15, radius * 1.15);
    const glow = ctx.createEntity(ctx.sphereMesh, [glowMaterial], root);
    glow.setLocalScale(radius * 4, radius * 4, radius * 4);

    // Dos ruedas perpendiculares: una sola medialuna se vería de canto desde
    // media cámara; la cruz mantiene el aspa con volumen en el splitscreen.
    // Las seis aspas comparten una malla y dos lotes (normal y caliente): el
    // giro y la orientación de cada rueda se resuelven en el vertex shader.
    const bladeMesh = ctx.cachedWindBlade(radius * 5, 1.08, radius * 1.35, 10);
    const bladeInstances: EffectBatchInstance[] = [];
    const hotBladeInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 3; index++) {
      const blade: EffectBatchInstance = {
        anim0: [index * 120, 720, 0, 0],
        anim1: [1, 0, 0, 0]
      };
      if (index === 1) hotBladeInstances.push(blade);
      else bladeInstances.push(blade);

      const cross: EffectBatchInstance = {
        anim0: [index * 120 + 60, -590.4, 90, 0],
        anim1: [0.78, 0, 0, 0]
      };
      if (index === 2) hotBladeInstances.push(cross);
      else bladeInstances.push(cross);
    }
    const bladeBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: bladeMesh,
      material: bladeMaterial,
      instances: bladeInstances,
      motion: MOTION_PROJECTILE_BLADES,
      radius
    });
    const hotBladeBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: bladeMesh,
      material: hotMaterial,
      instances: hotBladeInstances,
      motion: MOTION_PROJECTILE_BLADES,
      radius
    });

    // Plumas de la estela: tres instancias en lugar de tres entidades.
    const featherInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 3; index++) {
      featherInstances.push({
        anim0: [
          (index - 1) * 1.1,
          index % 2 === 0 ? 0.35 : -0.35,
          -(2.4 + index * 1.2),
          index * 1.7
        ],
        anim1: [radius * 0.9, radius * 0.25, radius * 0.9, 120]
      });
    }
    const featherBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.leafMesh,
      material: featherMaterial,
      instances: featherInstances,
      motion: MOTION_PROJECTILE_FEATHERS,
      radius
    });

    // Dos jirones rectangulares que escoltan la estela.
    const trailInstances: EffectBatchInstance[] = [
      {
        anim0: [0, -1, 18, 0],
        anim1: [radius * 0.35, radius * 0.16, radius * 4.6, 0]
      },
      {
        anim0: [2, 1, -18, 0],
        anim1: [radius * 0.35, radius * 0.16, radius * 4.6, 0]
      }
    ];
    const trailBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.boxMesh,
      material: trailMaterial,
      instances: trailInstances,
      motion: MOTION_PROJECTILE_TRAIL,
      radius
    });

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        const pulse = 1 + Math.sin(time * 24) * 0.08;
        const coreScale = radius * 1.15 * pulse;
        core.setLocalScale(coreScale, coreScale, coreScale);
        const glowScale = radius * 4 * (1 + Math.sin(time * 16) * 0.1);
        glow.setLocalScale(glowScale, glowScale, glowScale);

        coreMaterial.opacity = 0.78 + Math.sin(time * 20) * 0.12;
        glowMaterial.opacity = 0.12 + Math.sin(time * 13) * 0.04;
        bladeMaterial.opacity = 0.5 + Math.sin(time * 17) * 0.11;
        hotMaterial.opacity = 0.34 + Math.sin(time * 21 + 1) * 0.09;
        featherMaterial.opacity = 0.62 + Math.sin(time * 12) * 0.14;
        trailMaterial.opacity = 0.34 + Math.sin(time * 21 + 1) * 0.09;

        bladeBatch.setTime(time);
        hotBladeBatch.setTime(time);
        featherBatch.setTime(time);
        trailBatch.setTime(time);

        for (const material of materials) material.update();
      }
    };
    visual.update(0);
    ctx.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => root.setPosition(nextX, 0.82, nextZ),
      update: (dt) => visual.update(dt),
      destroy: () => {
        if (!ctx.projectiles.delete(visual)) return;
        ctx.destroyFxRoot(root);
        ctx.releaseMaterials(materials);
      }
    };
}

/**
   * Proyectil de hielo: grupo de cristales que gira alrededor de un núcleo
   * blanco, con halo azul y estela de esquirlas. Disponible para futuros
   * ataques a distancia de tipo Hielo.
   */
export function spawnIceProjectile(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    dirX: number,
    dirZ: number,
    color: readonly [number, number, number]): EffectHandle {
const root = new pc.Entity('ice-projectile');
    root.setPosition(x, 0.8, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createWaterMaterial([242, 252, 255], 0.92);
    const glowMaterial = ctx.createWaterMaterial(color, 0.2);
    const crystalMaterial = ctx.createIceCrystalMaterial(
      [200, 240, 255],
      0.88
    );
    const deepMaterial = ctx.createIceCrystalMaterial([86, 168, 226], 0.72);
    const trailMaterial = ctx.createIceCrystalMaterial(
      [220, 248, 255],
      0.56
    );
    const materials = [
      coreMaterial,
      glowMaterial,
      crystalMaterial,
      deepMaterial,
      trailMaterial
    ];

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalScale(radius * 1.35, radius * 1.35, radius * 1.35);
    const glow = ctx.createEntity(ctx.sphereMesh, [glowMaterial], root);
    glow.setLocalScale(radius * 3.6, radius * 3.6, radius * 3.6);

    const wheel = new pc.Entity('ice-wheel');
    root.addChild(wheel);
    const shards: {
      entity: pc.Entity;
      phase: number;
      baseAngle: number;
      baseWidth: number;
      baseHeight: number;
    }[] = [];
    for (let index = 0; index < 5; index++) {
      const angle = (index / 5) * Math.PI * 2;
      const baseWidth = radius * 0.75;
      const baseHeight = radius * 2.1;
      const shard = ctx.createEntity(
        ctx.iceCrystalMesh,
        [index % 2 === 0 ? crystalMaterial : deepMaterial],
        wheel
      );
      shard.setLocalPosition(
        Math.cos(angle) * radius * 1.4,
        Math.sin(angle) * radius,
        0
      );
      shard.setLocalEulerAngles(0, 0, angle / DEG);
      shard.setLocalScale(baseWidth, baseHeight, baseWidth);
      shards.push({
        entity: shard,
        phase: index * 1.3,
        baseAngle: angle,
        baseWidth,
        baseHeight
      });
    }

    const trailShards: { entity: pc.Entity; phase: number; baseZ: number }[] = [];
    for (let index = 0; index < 3; index++) {
      const baseZ = -radius * (2 + index * 1.1);
      const shard = ctx.createEntity(
        ctx.iceCrystalMesh,
        [trailMaterial],
        root
      );
      shard.setLocalPosition(
        (index - 1) * radius * 0.35,
        (index % 2 === 0 ? 1 : -1) * radius * 0.3,
        baseZ
      );
      shard.setLocalScale(radius * 0.5, radius * 1.2, radius * 0.5);
      shard.setLocalEulerAngles(70 + index * 25, index * 60, 20);
      trailShards.push({ entity: shard, phase: index * 1.7, baseZ });
    }

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        wheel.setLocalEulerAngles(0, 0, time * 520);

        const pulse = 1 + Math.sin(time * 22) * 0.08;
        const coreScale = radius * 1.35 * pulse;
        core.setLocalScale(coreScale, coreScale, coreScale);
        const glowScale = radius * 3.6 * (1 + Math.sin(time * 15) * 0.1);
        glow.setLocalScale(glowScale, glowScale, glowScale);

        coreMaterial.opacity = 0.78 + Math.sin(time * 19) * 0.12;
        glowMaterial.opacity = 0.14 + Math.sin(time * 12) * 0.05;
        crystalMaterial.opacity = 0.62 + Math.sin(time * 16) * 0.12;
        deepMaterial.opacity = 0.38 + Math.sin(time * 18 + 1) * 0.1;
        trailMaterial.opacity = 0.26 + Math.sin(time * 10) * 0.08;
        for (const material of materials) material.update();

        for (const shard of shards) {
          const flicker = 0.9 + Math.sin(time * 13 + shard.phase) * 0.12;
          shard.entity.setLocalScale(
            shard.baseWidth * flicker,
            shard.baseHeight * flicker,
            shard.baseWidth * flicker
          );
          shard.entity.setLocalEulerAngles(
            0,
            0,
            shard.baseAngle / DEG + time * 55 + Math.sin(time * 6 + shard.phase) * 8
          );
        }
        for (const shard of trailShards) {
          shard.entity.setLocalPosition(
            Math.sin(time * 8 + shard.phase) * radius * 0.25,
            Math.sin(time * 7 + shard.phase) * radius * 0.2,
            shard.baseZ
          );
          shard.entity.setLocalEulerAngles(
            70 + Math.sin(time * 6 + shard.phase) * 15,
            time * 90 + shard.phase * 40,
            20
          );
        }
      }
    };
    visual.update(0);
    ctx.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => root.setPosition(nextX, 0.8, nextZ),
      update: (dt) => visual.update(dt),
      destroy: () => {
        if (!ctx.projectiles.delete(visual)) return;
        ctx.destroyFxRoot(root);
        ctx.releaseMaterials(materials);
      }
    };
}

/**
   * Proyectil de roca: un pedrusco facetado que gira en el aire, con dos
   * esquirlas en órbita y una estela de polvo. La piedra usa materiales
   * iluminados para conservar volumen en todas las vistas.
   */
export function spawnRockProjectile(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    dirX: number,
    dirZ: number,
    _color: readonly [number, number, number]): EffectHandle {
const root = new pc.Entity('rock-projectile');
    root.setPosition(x, 0.8, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    ctx.app.root.addChild(root);

    // Un único boulder: cuatro fragmentos de la misma roca, solapados y con el
    // mismo material. Antes eran cajas de colores distintos separadas, que se
    // leían como dos proyectiles.
    const rockMaterial = ctx.createRockMaterial([172, 152, 124], 1);
    const materials = [rockMaterial];
    const mainScale = [radius * 2.6, radius * 2.2, radius * 2.8] as const;
    const rocks: EffectBatchInstance[] = [
      {
        anim0: [18, 0, 10, 0],
        anim1: [150, 190, 230, 0],
        anim2: [mainScale[0], mainScale[1], mainScale[2], 0]
      },
      {
        x: radius * 0.75,
        y: radius * 0.15,
        z: -radius * 0.35,
        anim0: [40, 20, -15, 0],
        anim1: [200, -160, 120, 0],
        anim2: [radius * 1.5, radius * 1.3, radius * 1.4, 0]
      },
      {
        x: -radius * 0.65,
        y: -radius * 0.1,
        z: radius * 0.3,
        anim0: [-25, 60, 30, 0],
        anim1: [-180, 220, -140, 0],
        anim2: [radius * 1.3, radius * 1.05, radius * 1.2, 0]
      },
      {
        x: radius * 0.9,
        y: radius * 0.05,
        z: radius * 0.55,
        anim0: [10, 0, -20, 0],
        anim1: [120, -200, 90, 0],
        anim2: [radius * 0.9, radius * 0.8, radius * 1.4, 0]
      }
    ];
    const rockBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.rockChunkMesh,
      material: rockMaterial,
      instances: rocks,
      motion: MOTION_PROJECTILE_ROCK,
      radius
    });
    rockBatch.entity.render!.customAabb = new pc.BoundingBox(
      new pc.Vec3(0, 0, 0),
      new pc.Vec3(radius * 3.4, radius * 3.2, radius * 3.6)
    );

    // Polvo pegado a la parte trasera del boulder: sin el hueco que dejaba la
    // entrada del alfa, para que no parezca una segunda roca persiguiéndola.
    ctx.spawnSporeParticles(
      root,
      {
        z: -radius * 1.1,
        extents: [radius * 0.4, radius * 0.4, radius * 0.2],
        velocity: [-dirX * 1.0, 0.1, -dirZ * 1.0],
        velocityEnd: [-dirX * 2.0, 0.4, -dirZ * 2.0],
        sizeStart: radius * 0.45,
        sizeMid: radius * 0.8,
        sizeEnd: radius * 0.2,
        lifetime: 0.34,
        rate: 0.025,
        numParticles: 40,
        blendType: pc.BLEND_NORMAL,
        worldSpaceTrail: true,
        fadeIn: 0.02,
        fadeOut: 0.6,
        opacity: 0.55
      },
      [176, 158, 130],
      ctx.dustTexture
    );

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        rockBatch.setTime(time);
      }
    };
    visual.update(0);
    ctx.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => root.setPosition(nextX, 0.8, nextZ),
      update: (dt) => visual.update(dt),
      destroy: () => {
        if (!ctx.projectiles.delete(visual)) return;
        ctx.destroyFxRoot(root);
        ctx.releaseMaterials(materials);
      }
    };
}

/**
   * Proyectil fantasma: orbe morado oscuro con núcleo claro, tres jirones que
   * ondulan detrás, dos ojos que parpadean en la parte delantera y una estela
   * de esferas que se apagan. La mezcla normal mantiene legible el morado.
   */
export function spawnGhostProjectile(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number,
    dirX: number,
    dirZ: number): EffectHandle {
const root = new pc.Entity('ghost-projectile');
    root.setPosition(x, 0.75, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createMaterial([238, 226, 255], 0.95);
    const bodyMaterial = ctx.createWaterMaterial(color, 0.6);
    const wispMaterial = ctx.createWaterMaterial([168, 128, 238], 0.5);
    const eyeMaterial = ctx.createMaterial([255, 244, 198], 0.95);
    const trailMaterial = ctx.createWaterMaterial([104, 70, 156], 0.28);
    const materials = [
      coreMaterial,
      bodyMaterial,
      wispMaterial,
      eyeMaterial,
      trailMaterial
    ];

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalScale(radius * 1.35, radius * 1.35, radius * 1.35);

    const body = ctx.createEntity(ctx.sphereMesh, [bodyMaterial], root);
    body.setLocalScale(radius * 3, radius * 3, radius * 3);

    // Jirones, ojos y estela en lotes instanciados. El ondeo, el parpadeo y la
    // posición se calculan en el vertex shader.
    const wispInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 3; index++) {
      wispInstances.push({
        anim0: [index * 1.7, -(1.7 + index * 1.25), 0.55 - index * 0.08, 0]
      });
    }
    const wispBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.boxMesh,
      material: wispMaterial,
      instances: wispInstances,
      motion: MOTION_PROJECTILE_WISPS,
      radius
    });

    const eyeInstances: EffectBatchInstance[] = [
      { anim0: [-0.65, 0.35, 2.1, 0], anim1: [0.5, 0.5, 0.35, 0] },
      { anim0: [0.65, 0.35, 2.1, 0], anim1: [0.5, 0.5, 0.35, 0] }
    ];
    const eyeBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: eyeMaterial,
      instances: eyeInstances,
      motion: MOTION_PROJECTILE_EYES,
      radius
    });

    const trailInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 3; index++) {
      const scale = radius * (1.4 - index * 0.35);
      trailInstances.push({
        z: -radius * (2.8 + index * 1.7),
        sx: scale,
        sy: scale,
        sz: scale
      });
    }
    new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: trailMaterial,
      instances: trailInstances,
      motion: MOTION_STATIC,
      radius
    });

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        const pulse = 1 + Math.sin(time * 19) * 0.08;
        core.setLocalScale(
          radius * 1.35 * pulse,
          radius * 1.35 * pulse,
          radius * 1.35 * pulse
        );
        const bodyPulse = 1 + Math.sin(time * 12) * 0.07;
        body.setLocalScale(
          radius * 3 * bodyPulse,
          radius * 3 * bodyPulse,
          radius * 3 * bodyPulse
        );

        wispBatch.setTime(time);
        eyeBatch.setTime(time);

        coreMaterial.opacity = 0.9 + Math.sin(time * 27) * 0.08;
        bodyMaterial.opacity = 0.52 + Math.sin(time * 14) * 0.08;
        wispMaterial.opacity = 0.42 + Math.sin(time * 17) * 0.1;
        eyeMaterial.opacity = 0.95;
        trailMaterial.opacity = 0.2 + Math.sin(time * 11) * 0.05;
        for (const material of materials) material.update();
      }
    };
    visual.update(0);
    ctx.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => root.setPosition(nextX, 0.75, nextZ),
      update: (dt) => visual.update(dt),
      destroy: () => {
        if (!ctx.projectiles.delete(visual)) return;
        ctx.destroyFxRoot(root);
        ctx.releaseMaterials(materials);
      }
    };
}
