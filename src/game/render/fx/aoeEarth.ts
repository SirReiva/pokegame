import type { FxRuntime } from './fxRuntime';
import * as pc from 'playcanvas';
import { DEG } from '../../config';
import { EffectBatch, MOTION_BURROW_CRACKS, MOTION_BURROW_PUFFS, MOTION_BURROW_ROCKS, MOTION_BURROW_SLABS, MOTION_BURROW_WAVES, MOTION_FISSURE_BRANCHES, MOTION_FISSURE_PEBBLES, MOTION_FISSURE_SLABS, MOTION_FISSURE_SPIKES, MOTION_GROUND_CRACKS, MOTION_GROUND_PUFFS, MOTION_GROUND_ROCKS } from '../../effectBatch';
import type { EffectBatchInstance } from '../../effectBatch';
import { areaAnchors, createFissureCraterMesh, createFissureMagmaMesh, FISSURE_CRACK_ANGLES } from './fxGeometry';

/**
   * Área de tierra: disco agrietado y una lluvia de rocas pequeñas que cae en
   * oleadas y levanta polvo al impactar. Es el visual de Terremoto.
   */
export function spawnGroundAoe(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    _color: readonly [number, number, number],
    duration: number): void {
const life = Math.max(0.3, duration);
    const root = new pc.Entity('ground-aoe');
    root.setPosition(x, 0.03, z);
    ctx.app.root.addChild(root);

    const fillMaterial = ctx.createWaterMaterial([118, 98, 76], 0.16);
    const crackMaterial = ctx.createWaterMaterial([244, 206, 136], 0.62);
    const dustMaterial = ctx.createWaterMaterial([182, 162, 134], 0.34);
    const lightMaterial = ctx.createRockMaterial([198, 176, 140], 1);
    const darkMaterial = ctx.createRockMaterial([122, 104, 82], 1);
    const materials = [
      fillMaterial,
      crackMaterial,
      dustMaterial,
      lightMaterial,
      darkMaterial
    ];

    const fill = ctx.createEntity(ctx.discMesh, [fillMaterial], root);
    fill.setLocalPosition(0, 0.01, 0);
    fill.setLocalScale(radius * 2, 1, radius * 2);

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

/** Altura local de la superficie del cráter en una fracción de su radio. */
function fissureSurfaceY(t: number): number {
  if (t >= 0.9) return 0.1 + Math.min(1, (t - 0.9) / 0.085) * 0.12;
  if (t >= 0.72) return -0.012 + ((t - 0.72) / 0.18) * 0.112;
  return -0.018;
}

/**
 * Área de fisura: el suelo se abre en un cráter con borde irregular y fondo
 * hundido. Las grietas nacen del magma y continúan fuera del cráter, y del
 * fondo brotan estalagmitas, losas y esquirlas. Es el visual de Fisura; a
 * diferencia de Terremoto, no cae ninguna roca del cielo.
 */
export function spawnFissureAoe(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    _color: readonly [number, number, number],
    duration: number): void {
    const life = Math.max(0.3, duration);
    const root = new pc.Entity('fissure-aoe');
    root.setPosition(x, 0.03, z);
    ctx.app.root.addChild(root);

    // El cráter es opaco: escribe profundidad y se dibuja antes que las capas
    // transparentes, así las losas y estalagmitas quedan realmente dentro de él
    // y la grieta no depende del orden de las transparencias.
    const craterMaterial = ctx.createVertexColorMaterial(1);
    craterMaterial.blendType = pc.BLEND_NONE;
    craterMaterial.depthWrite = true;
    craterMaterial.update();
    const poolMaterial = ctx.createVertexColorMaterial(
      0.85,
      pc.BLEND_ADDITIVEALPHA
    );
    const magmaMaterial = ctx.createMaterial([255, 166, 62], 0.85);
    const lipLight = ctx.createRockMaterial([124, 100, 70], 1);
    const lipDark = ctx.createRockMaterial([82, 64, 44], 1);
    const slabLight = ctx.createRockMaterial([116, 98, 74], 1);
    const slabDark = ctx.createRockMaterial([74, 61, 46], 1);
    const spikeLight = ctx.createRockMaterial([116, 98, 74], 1);
    const spikeDark = ctx.createRockMaterial([74, 61, 46], 1);
    const pebbleLight = ctx.createRockMaterial([176, 156, 122], 1);
    const pebbleDark = ctx.createRockMaterial([110, 92, 70], 1);
    const dustMaterial = ctx.createWaterMaterial([190, 170, 138], 0.32);
    const materials = [
      craterMaterial,
      poolMaterial,
      magmaMaterial,
      lipLight,
      lipDark,
      slabLight,
      slabDark,
      spikeLight,
      spikeDark,
      pebbleLight,
      pebbleDark,
      dustMaterial
    ];

    const crater = ctx.createEntity(
      ctx.cachedMesh('fissure-crater', () => createFissureCraterMesh(ctx.device)),
      [craterMaterial],
      root
    );
    crater.setLocalScale(radius * 0.3, 1, radius * 0.3);

    const magmaPool = ctx.createEntity(
      ctx.cachedMesh('fissure-magma', () => createFissureMagmaMesh(ctx.device)),
      [poolMaterial],
      root
    );
    magmaPool.setLocalPosition(0, -0.012, 0);

    // Grietas: cajas finas con el pivote en el extremo interior. El shader las
    // afina hacia la punta y las abre hacia fuera, así se leen como cortes y no
    // como tablones apoyados en el suelo.
    const lipLightInstances: EffectBatchInstance[] = [];
    const lipDarkInstances: EffectBatchInstance[] = [];
    const glowInstances: EffectBatchInstance[] = [];
    let crackIndex = 0;
    const addCrack = (
      angle: number,
      inner: number,
      length: number,
      width: number,
      y: number,
      delay: number
    ): void => {
      const instance: EffectBatchInstance = {
        x: Math.sin(angle) * inner,
        y,
        z: Math.cos(angle) * inner,
        sx: width,
        sy: 0.012,
        sz: length,
        ry: angle / DEG,
        anim0: [delay, 0, 0, 0]
      };
      if (crackIndex % 3 === 0) lipDarkInstances.push(instance);
      else lipLightInstances.push(instance);
      glowInstances.push({
        ...instance,
        sx: width * 0.34,
        sy: 0.008,
        y: y + 0.006
      });
      crackIndex++;
    };

    for (const baseAngle of FISSURE_CRACK_ANGLES) {
      // Grieta interior: dos tramos con un quiebro para que no sea una estrella.
      let angle = baseAngle + (Math.random() - 0.5) * 0.14;
      let inner = radius * 0.04;
      for (let part = 0; part < 2; part++) {
        const length = radius * (0.26 + Math.random() * 0.08);
        addCrack(
          angle,
          inner,
          length,
          radius * (0.028 + Math.random() * 0.012),
          -0.013,
          0.02 + part * 0.03 + Math.random() * 0.03
        );
        inner += length * 0.9;
        angle += (Math.random() - 0.5) * 0.18;
      }
      // Grieta exterior: cruza la cresta y se bifurca en el terreno.
      const outerAngle = baseAngle + (Math.random() - 0.5) * 0.12;
      addCrack(
        outerAngle,
        radius * 1.0,
        radius * (0.2 + Math.random() * 0.1),
        radius * (0.022 + Math.random() * 0.01),
        -0.018,
        0.04 + Math.random() * 0.04
      );
      addCrack(
        outerAngle + 0.3 + Math.random() * 0.2,
        radius * 1.04,
        radius * (0.12 + Math.random() * 0.08),
        radius * (0.014 + Math.random() * 0.008),
        -0.018,
        0.08 + Math.random() * 0.04
      );
    }

    const slabLightInstances: EffectBatchInstance[] = [];
    const slabDarkInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 8; index++) {
      const angle = Math.random() * Math.PI * 2;
      // Todas las losas nacen en el fondo plano: sobre la pared o la cresta
      // quedarían medio enterradas por la pendiente irregular del cráter.
      const band = 0.15 + Math.random() * 0.5;
      const distance = radius * band;
      const instance: EffectBatchInstance = {
        x: Math.sin(angle) * distance,
        y: fissureSurfaceY(band) + 0.012,
        z: Math.cos(angle) * distance,
        sx: radius * (0.1 + Math.random() * 0.07),
        sy: 0.05,
        sz: radius * (0.14 + Math.random() * 0.08),
        ry: angle / DEG,
        anim0: [
          0.05 + Math.random() * 0.1,
          (3 + Math.random() * 5) * (index % 2 === 0 ? 1 : -1),
          0,
          0
        ]
      };
      if (index % 2 === 0) slabLightInstances.push(instance);
      else slabDarkInstances.push(instance);
    }

    const spikeLightInstances: EffectBatchInstance[] = [];
    const spikeDarkInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 7; index++) {
      const angle = Math.random() * Math.PI * 2;
      const band = 0.25 + Math.random() * 0.62;
      const distance = radius * band;
      const instance: EffectBatchInstance = {
        x: Math.sin(angle) * distance,
        y: fissureSurfaceY(band) - 0.012,
        z: Math.cos(angle) * distance,
        ry: Math.random() * 360,
        anim0: [
          radius * (0.2 + Math.random() * 0.14),
          radius * (0.07 + Math.random() * 0.04),
          0.06 + Math.random() * 0.12,
          (Math.random() - 0.5) * 10
        ]
      };
      if (index % 3 === 0) spikeDarkInstances.push(instance);
      else spikeLightInstances.push(instance);
    }

    const pebbleLightInstances: EffectBatchInstance[] = [];
    const pebbleDarkInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 16; index++) {
      const angle = Math.random() * Math.PI * 2;
      const size = radius * (0.016 + Math.random() * 0.02);
      const instance: EffectBatchInstance = {
        anim0: [
          angle,
          radius * (0.35 + Math.random() * 0.7),
          radius * (0.14 + Math.random() * 0.16),
          0.05 + Math.random() * 0.1
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
        material: lipLight,
        instances: lipLightInstances,
        motion: MOTION_FISSURE_BRANCHES,
        radius,
        life
      }),
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.boxMesh,
        material: lipDark,
        instances: lipDarkInstances,
        motion: MOTION_FISSURE_BRANCHES,
        radius,
        life
      }),
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.boxMesh,
        material: magmaMaterial,
        instances: glowInstances,
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

    let time = 0;
    const animate = (_t: number, dt: number): void => {
      time += dt;
      const fadeIn = Math.min(1, time / 0.05);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.16));
      const envelope = Math.min(fadeIn, fadeOut);
      const open = 1 - Math.pow(1 - Math.min(1, time / 0.13), 3);
      const pulse = 0.5 + Math.sin(time * 26) * 0.28;

      // El cráter se abre desde el centro y, al final, se hunde bajo el suelo:
      // la tierra se cierra sobre la grieta en lugar de desvanecerse.
      const close = Math.min(1, Math.max(0, (time - (life - 0.18)) / 0.18));
      root.setPosition(x, 0.03 - close * 0.32, z);
      const craterScale = radius * (0.28 + open * 0.72);
      crater.setLocalScale(craterScale, 1, craterScale);

      const poolScale = radius * 0.7 * (0.94 + pulse * 0.06);
      magmaPool.setLocalScale(poolScale, 1, poolScale);
      poolMaterial.opacity = (0.6 + pulse * 0.3) * envelope;

      for (const batch of branchBatches) batch.setTime(time);
      for (const batch of slabBatches) batch.setTime(time);
      for (const batch of spikeBatches) batch.setTime(time);
      for (const batch of pebbleBatches) batch.setTime(time);

      magmaMaterial.opacity = (0.6 + pulse * 0.3) * envelope;
      lipLight.opacity = 0.92 * envelope;
      lipDark.opacity = 0.82 * envelope;
      slabLight.opacity = 0.92 * envelope;
      slabDark.opacity = 0.82 * envelope;
      spikeLight.opacity = 0.92 * envelope;
      spikeDark.opacity = 0.82 * envelope;
      pebbleLight.opacity = 0.9 * envelope;
      pebbleDark.opacity = 0.78 * envelope;
      dustMaterial.opacity = 0.3 * envelope;
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
