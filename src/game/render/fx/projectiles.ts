import type { FxRuntime } from './fxRuntime';
import * as pc from 'playcanvas';
import { DEG } from '../../config';
import type { EffectHandle } from '../../core/ports/fx';
import {
  EffectBatch,
  MOTION_PROJECTILE_ARCS,
  MOTION_PROJECTILE_LEAF_RING,
  MOTION_PROJECTILE_ORBIT_XZ,
  MOTION_PROJECTILE_SPIN_RING,
  MOTION_STATIC
} from '../../effectBatch';
import type { EffectBatchInstance } from '../../effectBatch';
import type { ProjectileVisual } from './fxGeometry';
import { createLightningMesh } from './fxGeometry';

/** Proyectil genérico: esfera emisiva del color de la habilidad. */
export function spawnOrbProjectile(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number): EffectHandle {
const material = ctx.createMaterial(color, 0.95);
    const entity = ctx.createEntity(ctx.sphereMesh, [material]);
    entity.setPosition(x, 0.7, z);
    const scale = Math.max(0.12, radius * 2);
    entity.setLocalScale(scale, scale, scale);
    const visual: ProjectileVisual = {
      entity,
      materials: [material],
      update: () => {}
    };
    ctx.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => entity.setPosition(nextX, 0.7, nextZ),
      update: () => {},
      destroy: () => {
        if (!ctx.projectiles.delete(visual)) return;
        ctx.destroyFxRoot(entity);
        ctx.releaseMaterial(material);
      }
    };
}

/**
   * Proyectil eléctrico: núcleo, halo, tres arcos zigzagueantes y una estela
   * orientada hacia la dirección de vuelo. Los arcos giran y parpadean.
   */
export function spawnElectricProjectile(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    dirX: number,
    dirZ: number): EffectHandle {
const root = new pc.Entity('electric-projectile');
    root.setPosition(x, 0.7, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createMaterial([255, 255, 220], 0.95);
    const glowMaterial = ctx.createMaterial([255, 230, 90], 0.35);
    const arcMaterial = ctx.createMaterial([255, 245, 170], 0.9);
    const tailMaterial = ctx.createMaterial([255, 220, 80], 0.45);
    const materials = [coreMaterial, glowMaterial, arcMaterial, tailMaterial];

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalScale(radius * 1.9, radius * 1.9, radius * 1.9);

    const glow = ctx.createEntity(ctx.sphereMesh, [glowMaterial], root);
    glow.setLocalScale(radius * 4.2, radius * 4.2, radius * 4.2);

    const tail = ctx.createEntity(ctx.boxMesh, [tailMaterial], root);
    tail.setLocalPosition(0, 0, -radius * 2.8);
    tail.setLocalScale(radius * 1.1, radius * 1.1, radius * 5.5);

    const arcMesh = ctx.cachedMesh(
      `electric-arc:${radius.toFixed(3)}`,
      () =>
        createLightningMesh(
          ctx.device,
          radius * 5,
          Math.max(0.012, radius * 0.13),
          5,
          1000
        )
    );
    const arcBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: arcMesh,
      material: arcMaterial,
      instances: [0, 1, 2].map((index) => ({
        anim0: [index * 70, index * 130, index * 110, 0],
        anim1: [420, 560, 300, 1]
      })),
      motion: MOTION_PROJECTILE_ARCS,
      radius
    });

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        coreMaterial.opacity = 0.85 + Math.random() * 0.15;
        glowMaterial.opacity = 0.16 + Math.random() * 0.14;
        arcMaterial.opacity = 0.45 + Math.random() * 0.3;
        tailMaterial.opacity = 0.18 + Math.random() * 0.14;

        const pulse = 1 + Math.sin(time * 35) * 0.06;
        const glowPulse = 1 + Math.sin(time * 22) * 0.08;
        core.setLocalScale(
          radius * 1.9 * pulse,
          radius * 1.9 * pulse,
          radius * 1.9 * pulse
        );
        glow.setLocalScale(
          radius * 4.2 * glowPulse,
          radius * 4.2 * glowPulse,
          radius * 4.2 * glowPulse
        );

        coreMaterial.update();
        glowMaterial.update();
        arcMaterial.update();
        tailMaterial.update();
        arcBatch.setTime(time);
      }
    };
    ctx.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => root.setPosition(nextX, 0.7, nextZ),
      update: (dt) => visual.update(dt),
      destroy: () => {
        if (!ctx.projectiles.delete(visual)) return;
        ctx.destroyFxRoot(root);
        ctx.releaseMaterials(materials);
      }
    };
}

/**
   * Proyectil de fuego: núcleo blanco-amarillo, dos halos naranjas y una cola
   * de llamas texturizadas que parpadea. La cola apunta hacia atrás (−Z local).
   */
export function spawnFireProjectile(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    dirX: number,
    dirZ: number): EffectHandle {
const root = new pc.Entity('fire-projectile');
    root.setPosition(x, 0.7, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createMaterial([255, 248, 216], 0.9);
    const innerMaterial = ctx.createMaterial([255, 176, 64], 0.45);
    const glowMaterial = ctx.createMaterial([255, 84, 24], 0.22);
    const flameMaterial = ctx.createFlameMaterial([255, 255, 255], 0.55);
    const innerFlameMaterial = ctx.createFlameMaterial([255, 244, 205], 0.6);
    const materials = [
      coreMaterial,
      innerMaterial,
      glowMaterial,
      flameMaterial,
      innerFlameMaterial
    ];

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalScale(radius * 1.5, radius * 1.5, radius * 1.5);

    const inner = ctx.createEntity(ctx.sphereMesh, [innerMaterial], root);
    inner.setLocalScale(radius * 2.6, radius * 2.6, radius * 2.6);

    const glow = ctx.createEntity(ctx.sphereMesh, [glowMaterial], root);
    glow.setLocalScale(radius * 4.5, radius * 4.5, radius * 4.5);

    // Dos lenguas tumbadas hacia atrás: la exterior ancha y la interior más
    // corta y clara, para que la estela tenga cuerpo y no sea un halo.
    const tailWidth = radius * 3.4;
    const tailLength = radius * 7.6;
    const tail = ctx.createFlame(root, flameMaterial, {
      x: 0,
      y: 0,
      z: radius * 0.35,
      width: tailWidth,
      height: tailLength,
      pitch: -90
    });
    const innerTail = ctx.createFlame(root, innerFlameMaterial, {
      x: 0,
      y: radius * 0.2,
      z: radius * 0.45,
      width: radius * 2,
      height: radius * 4.6,
      pitch: -90,
      roll: 35
    });

    ctx.spawnFlameParticles(root, {
      extents: [radius * 0.7, radius * 0.7, radius * 0.7],
      velocity: [-dirX * 1.6, 0.25, -dirZ * 1.6],
      velocityEnd: [-dirX * 3.2, 0.55, -dirZ * 3.2],
      sizeStart: radius * 2.2,
      sizeMid: radius * 3.2,
      sizeEnd: radius * 1.2,
      lifetime: 0.24,
      rate: 1.2,
      numParticles: 30,
      stretch: 0.5,
      localSpace: false,
      worldSpaceTrail: true
    });

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        coreMaterial.opacity = 0.78 + Math.random() * 0.15;
        innerMaterial.opacity = 0.3 + Math.random() * 0.18;
        glowMaterial.opacity = 0.12 + Math.random() * 0.1;
        flameMaterial.opacity = 0.3 + Math.random() * 0.15;
        innerFlameMaterial.opacity = 0.35 + Math.random() * 0.18;

        const pulse = 1 + Math.sin(time * 32) * 0.07;
        const innerPulse = 1 + Math.sin(time * 22) * 0.09;
        const glowPulse = 1 + Math.sin(time * 17) * 0.11;
        core.setLocalScale(
          radius * 1.5 * pulse,
          radius * 1.5 * pulse,
          radius * 1.5 * pulse
        );
        inner.setLocalScale(
          radius * 2.6 * innerPulse,
          radius * 2.6 * innerPulse,
          radius * 2.6 * innerPulse
        );
        glow.setLocalScale(
          radius * 4.5 * glowPulse,
          radius * 4.5 * glowPulse,
          radius * 4.5 * glowPulse
        );

        const tailStretch = 0.82 + Math.sin(time * 21) * 0.2;
        const tailSway = 1 + Math.sin(time * 27) * 0.14;
        tail.setLocalScale(
          tailWidth * tailSway,
          tailLength * tailStretch,
          tailWidth * tailSway
        );
        tail.setLocalEulerAngles(-90, 0, Math.sin(time * 13) * 12);

        const innerStretch = 0.78 + Math.sin(time * 29 + 1.2) * 0.26;
        const innerSway = 1 + Math.sin(time * 33 + 0.5) * 0.2;
        innerTail.setLocalScale(
          radius * 2 * innerSway,
          radius * 4.6 * innerStretch,
          radius * 2 * innerSway
        );
        innerTail.setLocalEulerAngles(
          -90,
          0,
          35 + Math.sin(time * 19) * 18
        );
      }
    };
    visual.update(0);
    ctx.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => root.setPosition(nextX, 0.7, nextZ),
      update: (dt) => visual.update(dt),
      destroy: () => {
        if (!ctx.projectiles.delete(visual)) return;
        ctx.destroyFxRoot(root);
        ctx.releaseMaterials(materials);
      }
    };
}

/** Proyectil de hojas: núcleo verde y un anillo de hojas que gira. */
export function spawnGrassProjectile(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    dirX: number,
    dirZ: number,
    color: readonly [number, number, number]): EffectHandle {
const root = new pc.Entity('grass-projectile');
    root.setPosition(x, 0.7, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createMaterial([230, 255, 200], 0.95);
    const glowMaterial = ctx.createMaterial(color, 0.25);
    const leafMaterial = ctx.createLeafMaterial(color, 0.95);
    const materials = [coreMaterial, glowMaterial, leafMaterial];

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalScale(radius * 1.7, radius * 1.7, radius * 1.7);
    const glow = ctx.createEntity(ctx.sphereMesh, [glowMaterial], root);
    glow.setLocalScale(radius * 4, radius * 4, radius * 4);

    const leafInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 5; index++) {
      const angle = (index / 5) * Math.PI * 2;
      leafInstances.push({
        anim0: [
          angle,
          1.7,
          90 - (angle * 180) / Math.PI,
          20
        ],
        anim1: [radius * 1.1, radius * 1.8, 0, 0]
      });
    }
    const leafBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.leafMesh,
      material: leafMaterial,
      instances: leafInstances,
      motion: MOTION_PROJECTILE_LEAF_RING,
      radius
    });

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        const pulse = 1 + Math.sin(time * 26) * 0.08;
        core.setLocalScale(
          radius * 1.7 * pulse,
          radius * 1.7 * pulse,
          radius * 1.7 * pulse
        );
        glow.setLocalScale(
          radius * 4 * (1 + Math.sin(time * 15) * 0.1),
          radius * 4 * (1 + Math.sin(time * 15) * 0.1),
          radius * 4 * (1 + Math.sin(time * 15) * 0.1)
        );
        leafBatch.setTime(time);
        leafMaterial.opacity = 0.75 + Math.random() * 0.25;
        leafMaterial.update();
      }
    };
    visual.update(0);
    ctx.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => root.setPosition(nextX, 0.7, nextZ),
      update: (dt) => visual.update(dt),
      destroy: () => {
        if (!ctx.projectiles.delete(visual)) return;
        ctx.destroyFxRoot(root);
        ctx.releaseMaterials(materials);
      }
    };
}

/** Proyectil de veneno: orbe turbio con una nube de esporas a su alrededor. */
export function spawnPoisonProjectile(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    dirX: number,
    dirZ: number,
    color: readonly [number, number, number]): EffectHandle {
const root = new pc.Entity('poison-projectile');
    root.setPosition(x, 0.7, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createMaterial(color, 0.9);
    const glowMaterial = ctx.createMaterial([196, 118, 214], 0.24);
    const materials = [coreMaterial, glowMaterial];

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalScale(radius * 1.9, radius * 1.9, radius * 1.9);
    const glow = ctx.createEntity(ctx.sphereMesh, [glowMaterial], root);
    glow.setLocalScale(radius * 4.4, radius * 4.4, radius * 4.4);

    ctx.spawnSporeParticles(
      root,
      {
        extents: [radius * 1.4, radius * 1.4, radius * 1.4],
        velocity: [0, 0.15, 0],
        velocityEnd: [0, 0.5, 0],
        sizeStart: radius * 0.5,
        sizeMid: radius * 0.9,
        sizeEnd: radius * 0.3,
        lifetime: 0.32,
        rate: 0.03,
        numParticles: 36,
        localSpace: false,
        worldSpaceTrail: true
      },
      color
    );

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        const pulse = 1 + Math.sin(time * 22) * 0.1;
        core.setLocalScale(
          radius * 1.9 * pulse,
          radius * 1.9 * pulse,
          radius * 1.9 * pulse
        );
        glowMaterial.opacity = 0.18 + Math.random() * 0.12;
      }
    };
    visual.update(0);
    ctx.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => root.setPosition(nextX, 0.7, nextZ),
      update: (dt) => visual.update(dt),
      destroy: () => {
        if (!ctx.projectiles.delete(visual)) return;
        ctx.destroyFxRoot(root);
        ctx.releaseMaterials(materials);
      }
    };
}

/**
   * Proyectil de aura: núcleo blanco, cuerpo azul translúcido, dos anillos
   * girados que envuelven la esfera y cuatro motas que orbitan. Una estela corta
   * de esferas que se apagan detrás transmite el avance. Todo son
   * transformaciones sobre geometría estática.
   */
export function spawnAuraProjectile(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number,
    dirX: number,
    dirZ: number): EffectHandle {
const root = new pc.Entity('aura-projectile');
    root.setPosition(x, 0.7, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createMaterial([238, 250, 255], 0.95);
    const bodyMaterial = ctx.createAuraMaterial(color, 0.55);
    const haloMaterial = ctx.createMaterial(color, 0.16);
    const ringMaterial = ctx.createAuraMaterial([194, 226, 255], 0.7);
    const moteMaterial = ctx.createAuraMaterial([220, 240, 255], 0.85);
    const trailMaterial = ctx.createAuraMaterial(color, 0.3);
    const materials = [
      coreMaterial,
      bodyMaterial,
      haloMaterial,
      ringMaterial,
      moteMaterial,
      trailMaterial
    ];

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalScale(radius * 1.5, radius * 1.5, radius * 1.5);

    const body = ctx.createEntity(ctx.sphereMesh, [bodyMaterial], root);
    body.setLocalScale(radius * 2.7, radius * 2.7, radius * 2.7);

    const halo = ctx.createEntity(ctx.sphereMesh, [haloMaterial], root);
    halo.setLocalScale(radius * 5.2, radius * 5.2, radius * 5.2);

    // Aros, motas y estela se dibujan con lotes instanciados: la rotación, la
    // órbita y el pulso viven en el vertex shader.
    const ringInstances: EffectBatchInstance[] = [
      {
        anim0: [70, 0, 0, 0],
        anim1: [0, 210, 120, radius * 3.6]
      },
      {
        anim0: [-60, 90, 0, 0],
        anim1: [0, 260, 90, radius * 4.1]
      }
    ];
    const ringBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.torusMesh,
      material: ringMaterial,
      instances: ringInstances,
      motion: MOTION_PROJECTILE_SPIN_RING,
      radius
    });

    const moteInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 4; index++) {
      moteInstances.push({
        anim0: [
          (index / 4) * Math.PI * 2,
          4.6,
          2.6 + (index % 3) * 0.35,
          index * 1.6
        ],
        anim1: [radius * (0.28 + (index % 2) * 0.1), 1.6, 0.9, 0]
      });
    }
    const moteBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: moteMaterial,
      instances: moteInstances,
      motion: MOTION_PROJECTILE_ORBIT_XZ,
      radius
    });

    const trailInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 3; index++) {
      const scale = radius * (1.9 - index * 0.45);
      trailInstances.push({
        z: -radius * (2.4 + index * 2.1),
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
        const corePulse = 1 + Math.sin(time * 24) * 0.1;
        const bodyPulse = 1 + Math.sin(time * 16) * 0.07;
        core.setLocalScale(
          radius * 1.5 * corePulse,
          radius * 1.5 * corePulse,
          radius * 1.5 * corePulse
        );
        body.setLocalScale(
          radius * 2.7 * bodyPulse,
          radius * 2.7 * bodyPulse,
          radius * 2.7 * bodyPulse
        );
        const haloPulse = 1 + Math.sin(time * 11) * 0.12;
        halo.setLocalScale(
          radius * 5.2 * haloPulse,
          radius * 5.2 * haloPulse,
          radius * 5.2 * haloPulse
        );

        ringBatch.setTime(time);
        moteBatch.setTime(time);

        coreMaterial.opacity = 0.9 + Math.sin(time * 30) * 0.08;
        bodyMaterial.opacity = 0.48 + Math.sin(time * 14) * 0.08;
        haloMaterial.opacity = 0.12 + Math.sin(time * 9) * 0.05;
        ringMaterial.opacity = 0.58 + Math.sin(time * 18) * 0.12;
        trailMaterial.opacity = 0.22 + Math.sin(time * 12) * 0.06;
        for (const material of materials) material.update();
      }
    };
    visual.update(0);
    ctx.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => root.setPosition(nextX, 0.7, nextZ),
      update: (dt) => visual.update(dt),
      destroy: () => {
        if (!ctx.projectiles.delete(visual)) return;
        ctx.destroyFxRoot(root);
        ctx.releaseMaterials(materials);
      }
    };
}

/**
   * Proyectil de sombra: orbe violeta con un borde oscuro, tres jirones que
   * orbitan y una estela de esferas que se apagan. Disponible para futuros
   * ataques a distancia de tipo Sombra.
   */
export function spawnShadowProjectile(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number,
    dirX: number,
    dirZ: number): EffectHandle {
const root = new pc.Entity('shadow-projectile');
    root.setPosition(x, 0.7, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createMaterial([226, 208, 255], 0.95);
    const bodyMaterial = ctx.createWaterMaterial(color, 0.6);
    const wispMaterial = ctx.createWaterMaterial([176, 142, 240], 0.55);
    const trailMaterial = ctx.createWaterMaterial(color, 0.28);
    const materials = [
      coreMaterial,
      bodyMaterial,
      wispMaterial,
      trailMaterial
    ];

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalScale(radius * 1.5, radius * 1.5, radius * 1.5);
    const body = ctx.createEntity(ctx.sphereMesh, [bodyMaterial], root);
    body.setLocalScale(radius * 3, radius * 3, radius * 3);

    const wisps: { entity: pc.Entity; phase: number; orbit: number }[] = [];
    for (let index = 0; index < 3; index++) {
      const wisp = ctx.createEntity(ctx.boxMesh, [wispMaterial], root);
      wisp.setLocalScale(radius * 0.35, radius * 0.35, radius * 1.6);
      wisps.push({
        entity: wisp,
        phase: (index / 3) * Math.PI * 2,
        orbit: radius * (2.2 + index * 0.4)
      });
    }

    const trail: pc.Entity[] = [];
    for (let index = 0; index < 3; index++) {
      const puff = ctx.createEntity(ctx.sphereMesh, [trailMaterial], root);
      puff.setLocalPosition(0, 0, -radius * (2.6 + index * 2.2));
      const scale = radius * (1.7 - index * 0.4);
      puff.setLocalScale(scale, scale, scale);
      trail.push(puff);
    }

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        const pulse = 1 + Math.sin(time * 20) * 0.09;
        core.setLocalScale(
          radius * 1.5 * pulse,
          radius * 1.5 * pulse,
          radius * 1.5 * pulse
        );
        const bodyPulse = 1 + Math.sin(time * 13) * 0.08;
        body.setLocalScale(
          radius * 3 * bodyPulse,
          radius * 3 * bodyPulse,
          radius * 3 * bodyPulse
        );
        for (const wisp of wisps) {
          const angle = wisp.phase + time * 5.2;
          wisp.entity.setLocalPosition(
            Math.cos(angle) * wisp.orbit,
            Math.sin(angle * 1.4) * radius * 0.8,
            Math.sin(angle) * wisp.orbit
          );
          wisp.entity.setLocalEulerAngles(
            0,
            -angle / DEG,
            Math.sin(angle * 2) * 40
          );
        }
        coreMaterial.opacity = 0.9 + Math.sin(time * 28) * 0.08;
        bodyMaterial.opacity = 0.5 + Math.sin(time * 15) * 0.08;
        wispMaterial.opacity = 0.45 + Math.sin(time * 19) * 0.12;
        trailMaterial.opacity = 0.22 + Math.sin(time * 11) * 0.06;
        for (const material of materials) material.update();
      }
    };
    visual.update(0);
    ctx.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => root.setPosition(nextX, 0.7, nextZ),
      update: (dt) => visual.update(dt),
      destroy: () => {
        if (!ctx.projectiles.delete(visual)) return;
        ctx.destroyFxRoot(root);
        ctx.releaseMaterials(materials);
      }
    };
}
