import type { FxRuntime } from './fxRuntime';
import * as pc from 'playcanvas';
import { DEG } from '../../config';
import { EffectBatch, MOTION_BURROW_CRACKS, MOTION_BURROW_PUFFS, MOTION_BURROW_ROCKS, MOTION_BURROW_SLABS, MOTION_BURROW_WAVES, MOTION_FISSURE_BRANCHES, MOTION_FISSURE_PEBBLES, MOTION_FISSURE_SLABS, MOTION_FISSURE_SPIKES, MOTION_GROUND_CRACKS, MOTION_GROUND_PUFFS, MOTION_GROUND_ROCKS } from '../../effectBatch';
import type { EffectBatchInstance } from '../../effectBatch';
import { areaAnchors } from './fxGeometry';

/**
   * Área de tierra: disco agrietado, anillos de polvo y una lluvia de rocas
   * pequeñas que cae en oleadas y levanta polvo al impactar. Es el visual de
   * Terremoto.
   */
export function spawnGroundAoe(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number): void {
const life = Math.max(0.3, duration);
    const root = new pc.Entity('ground-aoe');
    root.setPosition(x, 0.03, z);
    ctx.app.root.addChild(root);

    const fillMaterial = ctx.createWaterMaterial([118, 98, 76], 0.16);
    const ringMaterial = ctx.createWaterMaterial(color, 0.5);
    const crackMaterial = ctx.createWaterMaterial([244, 206, 136], 0.62);
    const dustMaterial = ctx.createWaterMaterial([182, 162, 134], 0.34);
    const lightMaterial = ctx.createRockMaterial([198, 176, 140], 1);
    const darkMaterial = ctx.createRockMaterial([122, 104, 82], 1);
    const materials = [
      fillMaterial,
      ringMaterial,
      crackMaterial,
      dustMaterial,
      lightMaterial,
      darkMaterial
    ];

    const fill = ctx.createEntity(ctx.discMesh, [fillMaterial], root);
    fill.setLocalPosition(0, 0.01, 0);
    fill.setLocalScale(radius * 2, 1, radius * 2);

    const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.1, 0);
    ring.setLocalScale(radius * 2, 1, radius * 2);

    const crackInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 14; index++) {
      const angle = (index / 14) * Math.PI * 2 + Math.random() * 0.4;
      const length = radius * (0.35 + Math.random() * 0.55);
      crackInstances.push({
        anim0: [
          Math.sin(angle) * length * 0.5,
          0.035,
          Math.cos(angle) * length * 0.5,
          radius * (0.012 + Math.random() * 0.012)
        ],
        anim1: [
          length,
          angle / DEG,
          Math.random() * Math.PI * 2,
          0
        ]
      });
    }
    const crackBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.boxMesh,
      material: crackMaterial,
      instances: crackInstances,
      motion: MOTION_GROUND_CRACKS,
      radius,
      life
    });

    const rockLightInstances: EffectBatchInstance[] = [];
    const rockDarkInstances: EffectBatchInstance[] = [];
    const puffInstances: EffectBatchInstance[] = [];
    const rockCount = 28;
    for (let index = 0; index < rockCount; index++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = radius * (0.12 + Math.sqrt(Math.random()) * 0.82);
      const size = radius * (0.04 + Math.random() * 0.04);
      const fall = 0.3 + Math.random() * 0.2;
      const delay = Math.random() * Math.max(0.2, life - fall - 0.25);
      const startHeight = radius * (0.9 + Math.random() * 1.1);
      const puffSize = size * (2.2 + Math.random() * 1.6);
      const instance: EffectBatchInstance = {
        anim0: [angle, distance, size, delay],
        anim1: [startHeight, fall, (Math.random() - 0.5) * 720, 0]
      };
      if (index % 3 === 0) rockDarkInstances.push(instance);
      else rockLightInstances.push(instance);
      puffInstances.push({
        anim0: [angle, distance, puffSize, delay],
        anim1: [fall, 0, 0, 0]
      });
    }
    const rockBatches = [
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.rockChunkMesh,
        material: lightMaterial,
        instances: rockLightInstances,
        motion: MOTION_GROUND_ROCKS,
        radius,
        life
      }),
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.rockChunkMesh,
        material: darkMaterial,
        instances: rockDarkInstances,
        motion: MOTION_GROUND_ROCKS,
        radius,
        life
      })
    ];
    const puffBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: dustMaterial,
      instances: puffInstances,
      motion: MOTION_GROUND_PUFFS,
      radius,
      life
    });

    ctx.spawnSporeParticles(
      root,
      {
        y: 0.1,
        extents: [radius * 0.7, 0.08, radius * 0.7],
        velocity: [0, 0.45, 0],
        velocityEnd: [0, 1.8, 0],
        radialSpeed: 0.8,
        radialSpeedEnd: 2.3,
        sizeStart: radius * 0.07,
        sizeMid: radius * 0.14,
        sizeEnd: radius * 0.04,
        lifetime: 0.85,
        rate: 0.014,
        numParticles: 110,
        blendType: pc.BLEND_NORMAL
      },
      [178, 158, 130],
      ctx.dustTexture
    );

    let time = 0;
    const animate = (_t: number, dt: number): void => {
      time += dt;
      const fadeIn = Math.min(1, time / 0.16);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.3));
      const envelope = Math.min(fadeIn, fadeOut);
      const pulse = 0.5 + Math.sin(time * 8) * 0.18;

      fillMaterial.opacity = 0.14 * envelope;
      const fillScale = radius * 2 * (0.97 + pulse * 0.02);
      fill.setLocalScale(fillScale, 1, fillScale);

      ringMaterial.opacity = (0.28 + pulse * 0.2) * envelope;
      const ringScale = radius * 2 * (0.96 + pulse * 0.04);
      ring.setLocalScale(ringScale, 1, ringScale);
      ring.setLocalEulerAngles(0, time * 22, 0);
      crackMaterial.opacity = (0.38 + pulse * 0.26) * envelope;

      crackBatch.setTime(time);
      for (const batch of rockBatches) batch.setTime(time);
      puffBatch.setTime(time);

      lightMaterial.opacity = 0.86 * envelope;
      darkMaterial.opacity = 0.72 * envelope;
      dustMaterial.opacity = 0.3 * envelope;
    };
    ctx.addEffect(
      root,
      materials,
      life,
      animate,
      areaAnchors(x, z, radius)
    );
    animate(0, 0);
}

/**
   * Área de fisura: el suelo se parte desde el centro y se hunde. Varias ramas
   * de grieta se abren hacia el borde con magma en el fondo, seguidas de
   * estalagmitas, polvo y esquirlas. Es el visual de Fisura; a diferencia de
   * Terremoto, no cae ninguna roca del cielo.
   */
export function spawnFissureAoe(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number): void {
const life = Math.max(0.3, duration);
    const root = new pc.Entity('fissure-aoe');
    root.setPosition(x, 0.03, z);
    ctx.app.root.addChild(root);

    const pitMaterial = ctx.createWaterMaterial([34, 27, 22], 0.62);
    const pitDeepMaterial = ctx.createWaterMaterial([18, 14, 12], 0.55);
    const rimMaterial = ctx.createWaterMaterial(color, 0.45);
    const magmaMaterial = ctx.createMaterial([255, 166, 62], 0.8);
    const slabLight = ctx.createRockMaterial([116, 98, 74], 1);
    const slabDark = ctx.createRockMaterial([74, 61, 46], 1);
    const dustMaterial = ctx.createWaterMaterial([190, 170, 138], 0.32);
    const pebbleLight = ctx.createRockMaterial([176, 156, 122], 1);
    const pebbleDark = ctx.createRockMaterial([110, 92, 70], 1);
    // Cada familia de instancias necesita su propio material: el chunk de
    // animación es distinto para grietas, losas, estalagmitas y piedras.
    const branchLight = ctx.createRockMaterial([116, 98, 74], 1);
    const branchDark = ctx.createRockMaterial([74, 61, 46], 1);
    const spikeLight = ctx.createRockMaterial([116, 98, 74], 1);
    const spikeDark = ctx.createRockMaterial([74, 61, 46], 1);
    const materials = [
      pitMaterial,
      pitDeepMaterial,
      rimMaterial,
      magmaMaterial,
      slabLight,
      slabDark,
      dustMaterial,
      pebbleLight,
      pebbleDark,
      branchLight,
      branchDark,
      spikeLight,
      spikeDark
    ];

    const pit = ctx.createEntity(ctx.discMesh, [pitMaterial], root);
    pit.setLocalPosition(0, 0.005, 0);
    pit.setLocalScale(radius * 2, 1, radius * 2);

    const pitDeep = ctx.createEntity(ctx.discMesh, [pitDeepMaterial], root);
    pitDeep.setLocalPosition(0, 0.006, 0);
    pitDeep.setLocalScale(radius * 1.15, 1, radius * 1.15);

    const rim = ctx.createEntity(ctx.torusMesh, [rimMaterial], root);
    rim.setLocalPosition(0, 0.07, 0);
    rim.setLocalScale(radius * 2, 1, radius * 2);

    const branchLightInstances: EffectBatchInstance[] = [];
    const branchDarkInstances: EffectBatchInstance[] = [];
    const branchGlowInstances: EffectBatchInstance[] = [];
    let branchCount = 0;
    const addBranch = (
      angle: number,
      distance: number,
      length: number,
      width: number,
      delay: number
    ): void => {
      const tilt = (Math.random() - 0.5) * 16;
      const x = Math.sin(angle) * distance;
      const z = Math.cos(angle) * distance;
      const instance: EffectBatchInstance = {
        x,
        y: 0.05,
        z,
        sx: width,
        sy: 0.035,
        sz: length,
        ry: angle / DEG,
        anim0: [delay, tilt, 0, 0]
      };
      if (branchCount % 4 === 0) branchLightInstances.push(instance);
      else branchDarkInstances.push(instance);
      branchGlowInstances.push({
        x,
        y: 0.078,
        z,
        sx: width * 0.38,
        sy: 0.012,
        sz: length * 0.8,
        ry: angle / DEG,
        anim0: [delay, tilt, 0, 0]
      });
      branchCount++;
    };

    const mainBranches = 5;
    for (let branch = 0; branch < mainBranches; branch++) {
      const baseAngle =
        (branch / mainBranches) * Math.PI * 2 + Math.random() * 0.55;
      const segments = 3 + (branch % 2);
      for (let index = 0; index < segments; index++) {
        const t = (index + 0.5) / segments;
        const angle = baseAngle + (Math.random() - 0.5) * 0.5;
        addBranch(
          angle,
          radius * t * (0.82 + Math.random() * 0.14),
          radius * (0.24 + Math.random() * 0.16),
          radius * (0.035 + Math.random() * 0.035),
          t * 0.2 + Math.random() * 0.02
        );
      }
      // Bifurcación corta para que la grieta no parezca una estrella regular.
      if (branch % 2 === 0) {
        addBranch(
          baseAngle + 0.5 + Math.random() * 0.4,
          radius * (0.36 + Math.random() * 0.22),
          radius * (0.18 + Math.random() * 0.12),
          radius * (0.024 + Math.random() * 0.024),
          0.14 + Math.random() * 0.08
        );
      }
    }

    const slabLightInstances: EffectBatchInstance[] = [];
    const slabDarkInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 7; index++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = radius * (0.28 + Math.random() * 0.5);
      const width = radius * (0.12 + Math.random() * 0.08);
      const length = radius * (0.16 + Math.random() * 0.1);
      const instance: EffectBatchInstance = {
        x: Math.sin(angle) * distance,
        y: 0.05,
        z: Math.cos(angle) * distance,
        sx: width,
        sy: 0.07,
        sz: length,
        ry: angle / DEG,
        anim0: [
          0.03 + Math.random() * 0.12,
          (8 + Math.random() * 10) * (index % 2 === 0 ? 1 : -1),
          0,
          0
        ]
      };
      if (index % 2 === 0) slabLightInstances.push(instance);
      else slabDarkInstances.push(instance);
    }

    const spikeLightInstances: EffectBatchInstance[] = [];
    const spikeDarkInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 8; index++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = radius * (0.12 + Math.sqrt(Math.random()) * 0.62);
      const height = radius * (0.18 + Math.random() * 0.2);
      const width = radius * (0.045 + Math.random() * 0.035);
      const instance: EffectBatchInstance = {
        x: Math.sin(angle) * distance,
        z: Math.cos(angle) * distance,
        ry: Math.random() * 360,
        anim0: [
          height,
          width,
          0.06 + Math.random() * 0.16,
          (Math.random() - 0.5) * 22
        ]
      };
      if (index % 3 === 0) spikeDarkInstances.push(instance);
      else spikeLightInstances.push(instance);
    }

    const pebbleLightInstances: EffectBatchInstance[] = [];
    const pebbleDarkInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 18; index++) {
      const angle = Math.random() * Math.PI * 2;
      const size = radius * (0.018 + Math.random() * 0.022);
      const instance: EffectBatchInstance = {
        anim0: [
          angle,
          radius * (0.2 + Math.random() * 0.8),
          radius * (0.12 + Math.random() * 0.22),
          0.04 + Math.random() * 0.12
        ],
        anim1: [size, (Math.random() - 0.5) * 540, 0, 0]
      };
      if (index % 3 === 0) pebbleDarkInstances.push(instance);
      else pebbleLightInstances.push(instance);
    }

    const branchBatches = [
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.boxMesh,
        material: branchLight,
        instances: branchLightInstances,
        motion: MOTION_FISSURE_BRANCHES,
        radius,
        life
      }),
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.boxMesh,
        material: branchDark,
        instances: branchDarkInstances,
        motion: MOTION_FISSURE_BRANCHES,
        radius,
        life
      }),
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.boxMesh,
        material: magmaMaterial,
        instances: branchGlowInstances,
        motion: MOTION_FISSURE_BRANCHES,
        radius,
        life
      })
    ];
    const slabBatches = [
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.boxMesh,
        material: slabLight,
        instances: slabLightInstances,
        motion: MOTION_FISSURE_SLABS,
        radius,
        life
      }),
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.boxMesh,
        material: slabDark,
        instances: slabDarkInstances,
        motion: MOTION_FISSURE_SLABS,
        radius,
        life
      })
    ];
    const spikeBatches = [
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.rockSpikeMesh,
        material: spikeLight,
        instances: spikeLightInstances,
        motion: MOTION_FISSURE_SPIKES,
        radius,
        life
      }),
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.rockSpikeMesh,
        material: spikeDark,
        instances: spikeDarkInstances,
        motion: MOTION_FISSURE_SPIKES,
        radius,
        life
      })
    ];
    const pebbleBatches = [
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.rockChunkMesh,
        material: pebbleLight,
        instances: pebbleLightInstances,
        motion: MOTION_FISSURE_PEBBLES,
        radius,
        life
      }),
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.rockChunkMesh,
        material: pebbleDark,
        instances: pebbleDarkInstances,
        motion: MOTION_FISSURE_PEBBLES,
        radius,
        life
      })
    ];

    ctx.spawnSporeParticles(
      root,
      {
        y: 0.1,
        extents: [radius * 0.7, 0.08, radius * 0.7],
        velocity: [0, 0.35, 0],
        velocityEnd: [0, 1.5, 0],
        radialSpeed: 1.1,
        radialSpeedEnd: 2.8,
        sizeStart: radius * 0.08,
        sizeMid: radius * 0.16,
        sizeEnd: radius * 0.035,
        lifetime: 0.55,
        rate: 0.011,
        numParticles: 120,
        blendType: pc.BLEND_NORMAL,
        preWarm: false
      },
      [190, 170, 138],
      ctx.dustTexture
    );

    const light = ctx.createFireLight(root, 0, 0.7, 0, 1.1, radius * 2.1);

    let time = 0;
    const animate = (_t: number, dt: number): void => {
      time += dt;
      const fadeIn = Math.min(1, time / 0.06);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.2));
      const envelope = Math.min(fadeIn, fadeOut);
      const pulse = 0.5 + Math.sin(time * 28) * 0.22;

      pitMaterial.opacity = 0.58 * envelope;
      pitDeepMaterial.opacity = 0.5 * envelope;
      const pitScale = radius * 2 * (0.9 + Math.min(1, time / 0.14) * 0.1);
      pit.setLocalScale(pitScale, 1, pitScale);
      const deepScale = radius * 1.15 * (0.86 + Math.min(1, time / 0.16) * 0.14);
      pitDeep.setLocalScale(deepScale, 1, deepScale);

      rimMaterial.opacity = (0.22 + pulse * 0.18) * envelope;
      rim.setLocalEulerAngles(0, time * 10, 0);
      magmaMaterial.opacity = (0.5 + pulse * 0.3) * envelope;
      light.light!.intensity = 1.1 * envelope * (0.65 + Math.random() * 0.35);

      for (const batch of branchBatches) batch.setTime(time);
      for (const batch of slabBatches) batch.setTime(time);
      for (const batch of spikeBatches) batch.setTime(time);
      for (const batch of pebbleBatches) batch.setTime(time);

      slabLight.opacity = 0.92 * envelope;
      slabDark.opacity = 0.82 * envelope;
      dustMaterial.opacity = 0.3 * envelope;
      pebbleLight.opacity = 0.9 * envelope;
      pebbleDark.opacity = 0.78 * envelope;
      branchLight.opacity = 0.92 * envelope;
      branchDark.opacity = 0.82 * envelope;
      spikeLight.opacity = 0.92 * envelope;
      spikeDark.opacity = 0.82 * envelope;
    };
    ctx.addEffect(root, materials, life, animate, areaAnchors(x, z, radius));
    animate(0, 0);
}

/**
   * Área de excavación: la tierra revienta desde debajo del lanzador. Se abre
   * un cráter con grietas, las losas y rocas salen despedidas y una columna de
   * polvo se deshace sobre el punto. Es el impacto de `Excavar`.
   */
export function spawnBurrowAoe(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number): void {
const life = Math.max(0.4, duration);
    const root = new pc.Entity('burrow-aoe');
    root.setPosition(x, 0.02, z);
    ctx.app.root.addChild(root);

    const pitMaterial = ctx.createWaterMaterial([40, 31, 23], 0.66);
    const rimMaterial = ctx.createWaterMaterial(color, 0.5);
    const waveMaterial = ctx.createWaterMaterial(color, 0.42);
    const crackMaterial = ctx.createWaterMaterial([238, 206, 150], 0.55);
    const dustMaterial = ctx.createWaterMaterial([188, 164, 128], 0.38);
    const rockLight = ctx.createRockMaterial([192, 168, 128], 1);
    const rockDark = ctx.createRockMaterial([118, 96, 72], 1);
    // Losas y rocas comparten paleta, pero necesitan materiales propios: cada
    // lote instanciado guarda su animación en el vertex shader del material.
    const slabLight = ctx.createRockMaterial([192, 168, 128], 1);
    const slabDark = ctx.createRockMaterial([118, 96, 72], 1);
    const materials = [
      pitMaterial,
      rimMaterial,
      waveMaterial,
      crackMaterial,
      dustMaterial,
      rockLight,
      rockDark,
      slabLight,
      slabDark
    ];

    const pit = ctx.createEntity(ctx.discMesh, [pitMaterial], root);
    pit.setLocalPosition(0, 0.006, 0);
    pit.setLocalScale(0.001, 1, 0.001);

    const rim = ctx.createEntity(ctx.torusMesh, [rimMaterial], root);
    rim.setLocalPosition(0, 0.055, 0);
    rim.setLocalScale(0.001, 1, 0.001);

    const waveInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 2; index++) {
      waveInstances.push({
        anim0: [index, 0.07 + index * 0.025, 0, 0]
      });
    }
    const waveBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.torusMesh,
      material: waveMaterial,
      instances: waveInstances,
      motion: MOTION_BURROW_WAVES,
      radius,
      life
    });

    const crackInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 11; index++) {
      const angle =
        (index / 11) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      crackInstances.push({
        anim0: [
          angle,
          radius * (0.45 + Math.random() * 0.5),
          0,
          radius * (0.025 + Math.random() * 0.02)
        ]
      });
    }
    const crackBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.boxMesh,
      material: crackMaterial,
      instances: crackInstances,
      motion: MOTION_BURROW_CRACKS,
      radius,
      life
    });

    const slabLightInstances: EffectBatchInstance[] = [];
    const slabDarkInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 9; index++) {
      const angle = (index / 9) * Math.PI * 2 + Math.random() * 0.5;
      const instance: EffectBatchInstance = {
        anim0: [
          angle,
          radius * (0.12 + Math.random() * 0.55),
          radius * (0.1 + Math.random() * 0.09),
          radius * (0.35 + Math.random() * 0.55)
        ],
        anim1: [
          (Math.random() - 0.5) * 620,
          Math.random() * 0.07,
          0,
          0
        ]
      };
      if (index % 2 === 0) slabLightInstances.push(instance);
      else slabDarkInstances.push(instance);
    }
    const slabLightBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.boxMesh,
      material: slabLight,
      instances: slabLightInstances,
      motion: MOTION_BURROW_SLABS,
      radius,
      life
    });
    const slabDarkBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.boxMesh,
      material: slabDark,
      instances: slabDarkInstances,
      motion: MOTION_BURROW_SLABS,
      radius,
      life
    });

    const rockLightInstances: EffectBatchInstance[] = [];
    const rockDarkInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 20; index++) {
      const angle = Math.random() * Math.PI * 2;
      const instance: EffectBatchInstance = {
        anim0: [
          angle,
          radius * (0.2 + Math.random() * 0.75),
          radius * (0.03 + Math.random() * 0.045),
          radius * (0.55 + Math.random() * 0.9)
        ],
        anim1: [
          (Math.random() - 0.5) * 760,
          Math.random() * 0.06,
          0,
          0
        ]
      };
      if (index % 3 === 0) rockDarkInstances.push(instance);
      else rockLightInstances.push(instance);
    }
    const rockLightBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.rockChunkMesh,
      material: rockLight,
      instances: rockLightInstances,
      motion: MOTION_BURROW_ROCKS,
      radius,
      life
    });
    const rockDarkBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.rockChunkMesh,
      material: rockDark,
      instances: rockDarkInstances,
      motion: MOTION_BURROW_ROCKS,
      radius,
      life
    });

    const puffInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 11; index++) {
      puffInstances.push({
        anim0: [
          Math.random() * Math.PI * 2,
          radius * (0.04 + Math.random() * 0.3),
          radius * (0.16 + Math.random() * 0.18),
          radius * (0.45 + Math.random() * 0.85)
        ],
        anim1: [0, Math.random() * 0.08, 0, 0]
      });
    }
    const puffBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: dustMaterial,
      instances: puffInstances,
      motion: MOTION_BURROW_PUFFS,
      radius,
      life
    });

    const burrowBatches = [
      waveBatch,
      crackBatch,
      slabLightBatch,
      slabDarkBatch,
      rockLightBatch,
      rockDarkBatch,
      puffBatch
    ];

    ctx.spawnSporeParticles(
      root,
      {
        y: 0.12,
        extents: [radius * 0.5, 0.08, radius * 0.5],
        velocity: [0, 0.8, 0],
        velocityEnd: [0, 2.4, 0],
        radialSpeed: 1.4,
        radialSpeedEnd: 3.4,
        sizeStart: radius * 0.08,
        sizeMid: radius * 0.18,
        sizeEnd: radius * 0.03,
        lifetime: 0.55,
        rate: 0.01,
        numParticles: 120,
        blendType: pc.BLEND_NORMAL,
        preWarm: false
      },
      [192, 168, 132],
      ctx.dustTexture
    );

    let time = 0;
    const animate = (_t: number, dt: number): void => {
      time += dt;
      const open = Math.min(1, time / 0.12);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / (life * 0.55)));
      const burst = 1 - Math.pow(1 - open, 3);
      const waveT = Math.min(1, time / 0.4);

      pitMaterial.opacity = 0.64 * fadeOut;
      const craterScale = radius * 2.2 * (0.3 + burst * 0.7);
      pit.setLocalScale(
        Math.max(0.001, craterScale),
        1,
        Math.max(0.001, craterScale)
      );

      rimMaterial.opacity = (0.28 + (1 - burst) * 0.28) * fadeOut;
      const rimScale = radius * 2.16 * (0.45 + burst * 0.55);
      rim.setLocalScale(
        Math.max(0.001, rimScale),
        1,
        Math.max(0.001, rimScale)
      );
      rim.setLocalEulerAngles(0, time * 12, 0);

      waveMaterial.opacity = 0.42 * Math.max(0, 1 - waveT) * fadeOut;
      crackMaterial.opacity = 0.5 * burst * fadeOut;

      for (const batch of burrowBatches) batch.setTime(time);

      dustMaterial.opacity = 0.34 * fadeOut;
      rockLight.opacity = 0.92 * fadeOut;
      rockDark.opacity = 0.8 * fadeOut;
      slabLight.opacity = 0.92 * fadeOut;
      slabDark.opacity = 0.82 * fadeOut;
    };
    ctx.addEffect(root, materials, life, animate, areaAnchors(x, z, radius));
    animate(0, 0);
}
