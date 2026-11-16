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
  MOTION_STATIC,
  MOTION_TINT_PROJECTILE_BODY,
  MOTION_TINT_PROJECTILE_FLAME_TAIL,
  MOTION_TINT_PROJECTILE_ORBIT_WISPS
} from '../../effectBatch';
import type { EffectBatchInstance } from '../../effectBatch';
import { EffectTintBatch } from './effectTintBatch';
import type { TintEffectInstance } from './effectTintBatch';
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

    const arcMaterial = ctx.createMaterial([255, 245, 170], 0.9);
    const tailMaterial = ctx.createMaterial([255, 220, 80], 0.45);
    const materials = [arcMaterial, tailMaterial];

    // Núcleo y halo comparten esfera y se dibujan en un lote con su propio
    // pulso por instancia.
    const bodyBatch = new EffectTintBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      instances: [
        {
          color: [255, 255, 220],
          alpha: 0.9,
          sx: radius * 1.9,
          sy: radius * 1.9,
          sz: radius * 1.9,
          anim0: [35, 0, 0.06, 0]
        },
        {
          color: [255, 230, 90],
          alpha: 0.25,
          sx: radius * 4.2,
          sy: radius * 4.2,
          sz: radius * 4.2,
          anim0: [22, 0, 0.08, 0]
        }
      ],
      motion: MOTION_TINT_PROJECTILE_BODY,
      additive: true,
      boundsHalf: [radius * 5, radius * 5, radius * 9]
    });

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
        arcMaterial.opacity = 0.45 + Math.random() * 0.3;
        tailMaterial.opacity = 0.18 + Math.random() * 0.14;
        bodyBatch.setTime(time);
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

    // Núcleo, halo interior y halo exterior comparten la malla esférica y se
    // dibujan en un lote con color y alfa por instancia.
    const bodyBatch = new EffectTintBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      instances: [
        {
          color: [255, 248, 216],
          alpha: 0.9,
          sx: radius * 1.5,
          sy: radius * 1.5,
          sz: radius * 1.5,
          anim0: [32, 0, 0.07, 0]
        },
        {
          color: [255, 176, 64],
          alpha: 0.45,
          sx: radius * 2.6,
          sy: radius * 2.6,
          sz: radius * 2.6,
          anim0: [22, 0, 0.09, 0]
        },
        {
          color: [255, 84, 24],
          alpha: 0.22,
          sx: radius * 4.5,
          sy: radius * 4.5,
          sz: radius * 4.5,
          anim0: [17, 0, 0.11, 0]
        }
      ],
      motion: MOTION_TINT_PROJECTILE_BODY,
      additive: true,
      boundsHalf: [radius * 5.5, radius * 5.5, radius * 5.5]
    });

    // Dos lenguas tumbadas hacia atrás: la exterior ancha y la interior más
    // corta y clara, para que la estela tenga cuerpo y no sea un halo.
    const tailBatch = new EffectTintBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.flameMesh,
      instances: [
        {
          z: radius * 0.35,
          color: [255, 255, 255],
          alpha: 0.37,
          anim0: [21, 27, 0, 0],
          anim1: [radius * 3.4, radius * 7.6, 0, 0.82],
          anim2: [0.14, 12, 13, 0]
        },
        {
          y: radius * 0.2,
          z: radius * 0.45,
          color: [255, 244, 205],
          alpha: 0.44,
          anim0: [29, 33, 1.2, 0.5],
          anim1: [radius * 2, radius * 4.6, 35, 0.78],
          anim2: [0.2, 18, 19, 0]
        }
      ],
      motion: MOTION_TINT_PROJECTILE_FLAME_TAIL,
      additive: true,
      texture: ctx.flameTexture,
      intensity: 1.12,
      boundsHalf: [radius * 5, radius * 5, radius * 9]
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
      materials: [],
      update: (dt) => {
        time += dt;
        bodyBatch.setTime(time);
        tailBatch.setTime(time);
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
        ctx.releaseMaterials(visual.materials);
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

    const leafMaterial = ctx.createLeafMaterial(color, 0.95);
    const materials = [leafMaterial];

    const bodyBatch = new EffectTintBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      instances: [
        {
          color: [230, 255, 200],
          alpha: 0.9,
          sx: radius * 1.7,
          sy: radius * 1.7,
          sz: radius * 1.7,
          anim0: [26, 0, 0.08, 0]
        },
        {
          color,
          alpha: 0.25,
          sx: radius * 4,
          sy: radius * 4,
          sz: radius * 4,
          anim0: [15, 0, 0.1, 0]
        }
      ],
      motion: MOTION_TINT_PROJECTILE_BODY,
      additive: true,
      boundsHalf: [radius * 5, radius * 5, radius * 5]
    });

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
        bodyBatch.setTime(time);
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

    // Núcleo y halo en un lote: el halo queda casi estático y el núcleo late.
    const bodyBatch = new EffectTintBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      instances: [
        {
          color,
          alpha: 0.9,
          sx: radius * 1.9,
          sy: radius * 1.9,
          sz: radius * 1.9,
          anim0: [22, 0, 0.1, 0]
        },
        {
          color: [196, 118, 214],
          alpha: 0.24,
          sx: radius * 4.4,
          sy: radius * 4.4,
          sz: radius * 4.4,
          anim0: [22, 0, 0, 0]
        }
      ],
      motion: MOTION_TINT_PROJECTILE_BODY,
      additive: true,
      boundsHalf: [radius * 5, radius * 5, radius * 5]
    });

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
      materials: [],
      update: (dt) => {
        time += dt;
        bodyBatch.setTime(time);
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
        ctx.releaseMaterials(visual.materials);
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

    // Núcleo blanco aditivo, cuerpo y estela translúcidos, y jirones en órbita.
    const coreBatch = new EffectTintBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      instances: [
        {
          color: [226, 208, 255],
          alpha: 0.95,
          sx: radius * 1.5,
          sy: radius * 1.5,
          sz: radius * 1.5,
          anim0: [20, 0, 0.09, 0]
        }
      ],
      motion: MOTION_TINT_PROJECTILE_BODY,
      additive: true,
      boundsHalf: [radius * 4, radius * 4, radius * 8]
    });

    const bodyInstances: TintEffectInstance[] = [
      {
        color,
        alpha: 0.55,
        sx: radius * 3,
        sy: radius * 3,
        sz: radius * 3,
        anim0: [13, 0, 0.08, 0]
      }
    ];
    for (let index = 0; index < 3; index++) {
      const scale = radius * (1.7 - index * 0.4);
      bodyInstances.push({
        z: -radius * (2.6 + index * 2.2),
        color,
        alpha: 0.26,
        sx: scale,
        sy: scale,
        sz: scale,
        anim0: [11, 0, 0, 0]
      });
    }
    const bodyBatch = new EffectTintBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      instances: bodyInstances,
      motion: MOTION_TINT_PROJECTILE_BODY,
      boundsHalf: [radius * 4, radius * 4, radius * 10]
    });

    const wispInstances: TintEffectInstance[] = [];
    for (let index = 0; index < 3; index++) {
      wispInstances.push({
        color: [176, 142, 240],
        alpha: 0.5,
        anim0: [(index / 3) * Math.PI * 2, radius * (2.2 + index * 0.4), 0, 0],
        anim1: [radius * 0.35, radius * 1.6, 0, 0]
      });
    }
    const wispBatch = new EffectTintBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.boxMesh,
      instances: wispInstances,
      motion: MOTION_TINT_PROJECTILE_ORBIT_WISPS,
      radius,
      boundsHalf: [radius * 4, radius * 4, radius * 4]
    });

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials: [],
      update: (dt) => {
        time += dt;
        coreBatch.setTime(time);
        bodyBatch.setTime(time);
        wispBatch.setTime(time);
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
        ctx.releaseMaterials(visual.materials);
      }
    };
}
