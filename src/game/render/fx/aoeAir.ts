import type { FxRuntime } from './fxRuntime';
import * as pc from 'playcanvas';
import { EffectBatch, MOTION_AIR_BLADES, MOTION_AIR_EMBERS, MOTION_AIR_FEATHERS, MOTION_CYCLONE_PUFFS, MOTION_STATIC } from '../../effectBatch';
import type { EffectBatchInstance } from '../../effectBatch';
import { createWindBladeMesh, tintColor } from './fxGeometry';

/**
   * Área de aire: aspas que giran dentro del radio y plumas que suben en
   * espiral. Es la base visual de Onda Ígnea y Ataque Celeste, con el naranja
   * de la habilidad como cuerpo y blanco cálido en los filos.
   */
export function spawnAirAoe(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number): void {
const life = Math.max(0.2, duration);
    const root = new pc.Entity('air-aoe');
    root.setPosition(x, 0.03, z);
    ctx.app.root.addChild(root);

    const bladeMaterial = ctx.createWaterMaterial(tintColor(color, 0.78), 0.58);
    const hotMaterial = ctx.createMaterial(color, 0.4);
    // Las brasas comparten color con las aspas calientes, pero necesitan otro
    // shader de animación; un material propio evita pisar el chunk.
    const emberMaterial = ctx.createMaterial(color, 0.4);
    const featherMaterial = ctx.createLeafMaterial(tintColor(color, 0.5), 0.8);
    const materials = [
      bladeMaterial,
      hotMaterial,
      emberMaterial,
      featherMaterial
    ];

    const bladeInstances: EffectBatchInstance[] = [];
    const hotBladeInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 8; index++) {
      const angle = (index / 8) * Math.PI * 2 + Math.random() * 0.35;
      const instance: EffectBatchInstance = {
        anim0: [
          angle,
          (index % 2 === 0 ? 1 : -1) * (0.8 + Math.random() * 0.7),
          radius * (0.18 + Math.random() * 0.45),
          radius *
            (0.42 + Math.random() * 0.2) *
            (0.75 + Math.random() * 0.4)
        ]
      };
      if (index % 3 === 0) hotBladeInstances.push(instance);
      else bladeInstances.push(instance);
    }
    const bladeBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.cachedMesh('wind-blade:air', () =>
        createWindBladeMesh(ctx.device, 1, 1.25, 0.24, 10)
      ),
      material: bladeMaterial,
      instances: bladeInstances,
      motion: MOTION_AIR_BLADES,
      radius,
      life
    });
    const hotBladeBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.cachedMesh('wind-blade:air', () =>
        createWindBladeMesh(ctx.device, 1, 1.25, 0.24, 10)
      ),
      material: hotMaterial,
      instances: hotBladeInstances,
      motion: MOTION_AIR_BLADES,
      radius,
      life
    });

    const featherInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 12; index++) {
      const angle = (index / 12) * Math.PI * 2 + Math.random() * 0.5;
      featherInstances.push({
        anim0: [
          angle,
          radius * (0.25 + Math.random() * 0.68),
          radius * (0.4 + Math.random() * 0.55),
          Math.random() * 0.45
        ],
        anim1: [
          radius * (0.035 + Math.random() * 0.03),
          Math.random() * Math.PI * 2,
          0,
          0
        ]
      });
    }
    const featherBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.leafMesh,
      material: featherMaterial,
      instances: featherInstances,
      motion: MOTION_AIR_FEATHERS,
      radius,
      life
    });

    const emberInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 6; index++) {
      emberInstances.push({
        anim0: [
          (index / 6) * Math.PI * 2 + 0.5,
          radius * (0.35 + Math.random() * 0.4),
          0,
          0
        ]
      });
    }
    const emberBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: emberMaterial,
      instances: emberInstances,
      motion: MOTION_AIR_EMBERS,
      radius,
      life
    });

    let time = 0;
    ctx.addEffect(root, materials, life, (_t, dt) => {
      time += dt;
      const fadeIn = Math.min(1, time / 0.16);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.3));
      const envelope = Math.min(fadeIn, fadeOut);
      const pulse = 0.55 + Math.sin(time * 8) * 0.2;

      bladeMaterial.opacity = (0.4 + pulse * 0.2) * envelope;
      hotMaterial.opacity = (0.3 + pulse * 0.16) * envelope;
      featherMaterial.opacity = (0.52 + pulse * 0.2) * envelope;

      bladeBatch.setTime(time);
      hotBladeBatch.setTime(time);
      featherBatch.setTime(time);
      emberBatch.setTime(time);
    });
}

/**
   * Huracán de `Ciclón`: un vórtice de nubes 3D con ojo oscuro. Tres brazos
   * espirales de cinta abombada giran alrededor del centro, reforzados por
   * nubes volumétricas. El ojo queda libre y se marca con un disco azul oscuro.
   */
export function spawnCycloneAoe(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number): void {
const life = Math.max(0.2, duration);
    const root = new pc.Entity('cyclone-aoe');
    root.setPosition(x, 0.03, z);
    ctx.app.root.addChild(root);

    const vortex = new pc.Entity('cyclone-vortex');
    root.addChild(vortex);

    // Capas de cintas a distintas alturas: el vórtice tiene volumen en Y.
    const ribbonMaterials = [
      ctx.createVertexColorMaterial(0.28),
      ctx.createVertexColorMaterial(0.24),
      ctx.createVertexColorMaterial(0.2),
      ctx.createVertexColorMaterial(0.16)
    ];
    const puffMaterial = ctx.createWaterMaterial(tintColor(color, 0.84), 0.2);
    const puffShadeMaterial = ctx.createWaterMaterial(
      tintColor(color, 0.58),
      0.16
    );
    const eyeMaterial = ctx.createWaterMaterial([18, 55, 92], 0.55);
    const eyeRingMaterial = ctx.createMaterial(tintColor(color, 0.55), 0.32);
    const materials = [
      ...ribbonMaterials,
      puffMaterial,
      puffShadeMaterial,
      eyeMaterial,
      eyeRingMaterial
    ];

    // Ojo del huracán.
    const eye = ctx.createEntity(ctx.discMesh, [eyeMaterial], root);
    eye.setLocalPosition(0, 0.06, 0);
    eye.setLocalScale(radius * 0.3, 1, radius * 0.3);
    const eyeRing = ctx.createEntity(ctx.torusMesh, [eyeRingMaterial], root);
    eyeRing.setLocalPosition(0, 0.07, 0);
    eyeRing.setLocalScale(radius * 0.3, 1, radius * 0.3);

    const arms = 3;
    const ribbonLayers = [
      { y: 0.02, scale: 0.86, twist: 0 },
      { y: 0.32, scale: 0.94, twist: 14 },
      { y: 0.64, scale: 1, twist: 28 },
      { y: 0.94, scale: 1.02, twist: 42 }
    ];
    const armInstances: EffectBatchInstance[][] = ribbonLayers.map(() => []);
    for (let layerIndex = 0; layerIndex < ribbonLayers.length; layerIndex++) {
      const layer = ribbonLayers[layerIndex];
      for (let armIndex = 0; armIndex < arms; armIndex++) {
        armInstances[layerIndex].push({
          x: 0,
          y: layer.y,
          z: 0,
          sx: radius * layer.scale,
          sy: 1,
          sz: radius * layer.scale,
          ry: (armIndex / arms) * 360 + layer.twist
        });
      }
    }
    for (let layerIndex = 0; layerIndex < armInstances.length; layerIndex++) {
      new EffectBatch({
        app: ctx.app,
        parent: vortex,
        mesh: ctx.cycloneArmMeshes[layerIndex % ctx.cycloneArmMeshes.length],
        material: ribbonMaterials[layerIndex],
        instances: armInstances[layerIndex],
        motion: MOTION_STATIC,
        radius,
        life
      });
    }

    // Nubes volumétricas a lo largo de los brazos y en la banda exterior.
    const puffInstances: EffectBatchInstance[] = [];
    const puffShadeInstances: EffectBatchInstance[] = [];
    const addPuff = (
      angle: number,
      distance: number,
      y: number,
      size: number,
      shade: boolean,
      tall: boolean
    ): void => {
      const sx = size * (1.35 + Math.random() * 0.35);
      const sy = size * (tall ? 1.4 + Math.random() * 0.7 : 0.55 + Math.random() * 0.3);
      const sz = size * (1.35 + Math.random() * 0.35);
      const instance: EffectBatchInstance = {
        x: Math.cos(angle) * distance,
        y,
        z: Math.sin(angle) * distance,
        sx,
        sy,
        sz,
        anim0: [Math.random() * Math.PI * 2, y, 0, 0]
      };
      if (shade) puffShadeInstances.push(instance);
      else puffInstances.push(instance);
    };

    const turns = 1.5;
    for (let armIndex = 0; armIndex < arms; armIndex++) {
      const baseAngle = (armIndex / arms) * Math.PI * 2;
      for (let puffIndex = 0; puffIndex < 10; puffIndex++) {
        const t =
          0.16 + (puffIndex / 9) * 0.84 + (Math.random() - 0.5) * 0.03;
        const angle = baseAngle + t * turns * Math.PI * 2;
        const distance = (0.17 + 0.76 * t) * radius;
        const y =
          0.14 + Math.random() * 0.98 + 0.12 * (puffIndex / 9);
        const size = radius * (0.05 + Math.random() * 0.05);
        addPuff(
          angle,
          distance,
          y,
          size,
          puffIndex % 3 === 0,
          puffIndex % 2 === 0
        );
      }
    }
    for (let index = 0; index < 16; index++) {
      const angle = (index / 16) * Math.PI * 2 + Math.random() * 0.3;
      const distance = radius * (0.8 + Math.random() * 0.2);
      const y = 0.1 + Math.random() * 0.28;
      const size = radius * (0.06 + Math.random() * 0.06);
      addPuff(angle, distance, y, size, index % 2 === 0, false);
    }
    for (let index = 0; index < 10; index++) {
      const angle = (index / 10) * Math.PI * 2 + Math.random() * 0.4;
      const distance = radius * (0.62 + Math.random() * 0.25);
      const y = 0.55 + Math.random() * 0.45;
      const size = radius * (0.06 + Math.random() * 0.05);
      addPuff(angle, distance, y, size, index % 2 === 0, true);
    }
    // Muro del ojo: dos anillos de nubes altas alrededor del centro.
    for (let ring = 0; ring < 2; ring++) {
      const wallRadius = radius * (0.28 + ring * 0.04);
      const wallY = 0.28 + ring * 0.5;
      for (let index = 0; index < 9; index++) {
        const angle = (index / 9) * Math.PI * 2 + ring * 0.35;
        const size = radius * (0.045 + Math.random() * 0.03);
        addPuff(
          angle,
          wallRadius,
          wallY + Math.random() * 0.08,
          size,
          false,
          true
        );
      }
    }

    const puffBatch = new EffectBatch({
      app: ctx.app,
      parent: vortex,
      mesh: ctx.sphereMesh,
      material: puffMaterial,
      instances: puffInstances,
      motion: MOTION_CYCLONE_PUFFS,
      radius,
      life
    });
    const puffShadeBatch = new EffectBatch({
      app: ctx.app,
      parent: vortex,
      mesh: ctx.sphereMesh,
      material: puffShadeMaterial,
      instances: puffShadeInstances,
      motion: MOTION_CYCLONE_PUFFS,
      radius,
      life
    });

    let time = 0;
    const animate = (_t: number, dt: number): void => {
      time += dt;
      const fadeIn = Math.min(1, time / 0.18);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.3));
      const envelope = Math.min(fadeIn, fadeOut);
      const grow = 0.86 + 0.14 * Math.min(1, time / 0.35);
      const verticalBreath = 0.92 + 0.08 * Math.sin(time * 2.2);

      // El vórtice gira, crece y respira en vertical.
      vortex.setLocalEulerAngles(0, time * 300, 0);
      vortex.setLocalScale(grow, verticalBreath, grow);

      const ribbonOpacity = [0.26, 0.22, 0.18, 0.14];
      for (let index = 0; index < ribbonMaterials.length; index++) {
        ribbonMaterials[index].opacity = ribbonOpacity[index] * envelope;
      }
      puffMaterial.opacity = (0.18 + Math.sin(time * 4) * 0.03) * envelope;
      puffShadeMaterial.opacity =
        (0.14 + Math.sin(time * 3.4 + 1) * 0.025) * envelope;
      eyeMaterial.opacity = 0.5 * envelope;
      eyeRingMaterial.opacity = (0.24 + Math.sin(time * 6) * 0.06) * envelope;

      puffBatch.setTime(time);
      puffShadeBatch.setTime(time);
    };
    ctx.addEffect(root, materials, life, animate);
    animate(0, 0);
}
