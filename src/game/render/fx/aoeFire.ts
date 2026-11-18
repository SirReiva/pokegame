import type { FxRuntime } from './fxRuntime';
import * as pc from 'playcanvas';
import { DEG } from '../../config';
import { EffectBatch, MOTION_FIRE_WHIRL_FLAMES, MOTION_FLAME_JET, MOTION_HEAT_BLADES, MOTION_HEAT_EMBERS, MOTION_HEAT_FLAMES, MOTION_PULSE_SPHERE, MOTION_SACRED_FLAME_BODY } from '../../effectBatch';
import type { EffectBatchInstance } from '../../effectBatch';
import type { AoeFxHandle } from '../../core/ports/fx';
import { coneAnchors, createFlameConeMesh, createWindBladeMesh } from './fxGeometry';
import type { FxAnchors } from './fxGeometry';

/**
   * Área de fuego: resplandor central y lenguas de fuego texturizadas que
   * crecen, se mecen y se apagan. El conjunto gira lentamente para dar la
   * sensación de remolino.
   */
export function spawnFireAoe(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    _color: readonly [number, number, number],
    duration: number): void {
const life = Math.max(0.2, duration);
    const root = new pc.Entity('fire-aoe');
    root.setPosition(x, 0.03, z);
    ctx.app.root.addChild(root);

    const glowMaterial = ctx.createMaterial([255, 104, 30], 0.14);
    const flameMaterial = ctx.createFlameMaterial([255, 200, 140], 0.5);
    const hotMaterial = ctx.createFlameMaterial([255, 232, 185], 0.55);
    const materials = [glowMaterial, flameMaterial, hotMaterial];

    const shortBurst = life < 1;
    ctx.spawnFlameParticles(root, {
      x: 0,
      y: 0.14,
      z: 0,
      extents: [radius * 0.9, 0.18, radius * 0.9],
      velocity: [0, 1, 0],
      velocityEnd: [0, 2.4, 0],
      radialSpeed: 0.25,
      radialSpeedEnd: 0.8,
      sizeStart: radius * 0.2,
      sizeMid: radius * 0.46,
      sizeEnd: radius * 0.14,
      lifetime: shortBurst ? 0.32 : 0.58,
      rate: shortBurst ? 2.4 : 1.5,
      numParticles: shortBurst ? 80 : 130,
      localSpace: false
    });
    const glow = ctx.createEntity(ctx.sphereMesh, [glowMaterial], root);
    glow.setLocalPosition(0, 0.14, 0);
    glow.setLocalScale(radius * 1.15, radius * 0.22, radius * 1.15);

    const flameInstances: EffectBatchInstance[] = [];
    const hotFlameInstances: EffectBatchInstance[] = [];
    // Tres anillos concéntricos con desfase: cubren todo el disco y evitan
    // el hueco que dejaba una sola corona de llamas.
    const flameRings = [
      { count: 8, dist: 0.18, width: 0.24, height: 0.5 },
      { count: 12, dist: 0.43, width: 0.28, height: 0.62 },
      { count: 16, dist: 0.68, width: 0.31, height: 0.72 }
    ];
    for (let ringIndex = 0; ringIndex < flameRings.length; ringIndex++) {
      const spec = flameRings[ringIndex];
      const offset = ringIndex * 0.5;
      for (let index = 0; index < spec.count; index++) {
        const angle = ((index + offset) / spec.count) * Math.PI * 2;
        const variation = ((index * 7 + ringIndex * 3) % 10) / 10;
        const dist = radius * spec.dist * (0.92 + variation * 0.16);
        const baseWidth =
          radius * spec.width * (0.9 + variation * 0.2);
        const baseHeight =
          radius * spec.height * (0.88 + variation * 0.24);
        const yaw = (index * 47 + ringIndex * 31) % 360;
        const instance: EffectBatchInstance = {
          anim0: [index * 1.3 + ringIndex * 2.1, angle, dist, yaw],
          anim1: [baseWidth, baseHeight, 0, 0]
        };
        if ((index + ringIndex) % 4 === 0) hotFlameInstances.push(instance);
        else flameInstances.push(instance);
      }
    }
    const flameParams: [number, number, number, number] = [
      Math.min(0.22, life * 0.3),
      Math.min(0.35, life * 0.35),
      Math.min(0.25, life * 0.3),
      0
    ];
    const flameBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.flameMesh,
      material: flameMaterial,
      instances: flameInstances,
      motion: MOTION_HEAT_FLAMES,
      radius,
      life,
      params: flameParams
    });
    const hotFlameBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.flameMesh,
      material: hotMaterial,
      instances: hotFlameInstances,
      motion: MOTION_HEAT_FLAMES,
      radius,
      life,
      params: flameParams
    });

    // Llama central más alta: da el pico de calor en el centro del anillo.
    const centerWidth = radius * 0.6;
    const centerHeight = radius * 1.05;
    const centerFlame = ctx.createFlame(root, hotMaterial, {
      x: 0,
      y: 0,
      z: 0,
      width: centerWidth,
      height: centerHeight,
      yaw: 15
    });

    let time = 0;
    const animate = (_t: number, dt: number): void => {
      time += dt;
      const fadeInTime = Math.min(0.22, life * 0.3);
      const fadeOutTime = Math.min(0.35, life * 0.35);
      const growTime = Math.min(0.3, life * 0.5);
      const fadeIn = Math.min(1, time / fadeInTime);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / fadeOutTime));
      const envelope = Math.min(fadeIn, fadeOut);
      const grow = 1 - Math.pow(1 - Math.min(1, time / growTime), 2);
      const sin7 = Math.sin(time * 7);
      const pulse = 0.5 + sin7 * 0.2;

      const glowScale = radius * 1.15 * (0.7 + 0.5 * grow);
      glow.setLocalScale(
        glowScale,
        radius * 0.22 * (0.7 + 0.7 * grow),
        glowScale
      );
      glow.setLocalPosition(0, 0.14 + grow * 0.2, 0);
      glowMaterial.opacity = (0.08 + pulse * 0.08) * envelope;

      root.setLocalEulerAngles(0, time * 6, 0);

      flameBatch.setTime(time);
      hotFlameBatch.setTime(time);

      const centerIn = Math.min(1, time / Math.min(0.3, life * 0.4));
      const centerLife = centerIn * envelope;
      // Un solo seno por frecuencia alimenta las tres escalas y el balanceo.
      const sway = Math.sin(time * 9) * 0.1;
      centerFlame.setLocalScale(
        centerWidth * centerLife * (1 + sway),
        centerHeight * centerLife * (1 + sin7 * 0.12),
        centerWidth * centerLife * (1 + sway)
      );
      centerFlame.setLocalEulerAngles(
        0,
        15 + time * 14,
        Math.sin(time * 5) * 7
      );

      flameMaterial.opacity =
        0.4 * envelope * (0.85 + Math.random() * 0.15);
      hotMaterial.opacity =
        0.44 * envelope * (0.85 + Math.random() * 0.15);
    };
    ctx.addEffect(root, materials, life, animate);
    animate(0, 0);
}

/**
   * Remolino de fuego: tres brazos espirales de llamas que giran alrededor del
   * centro. Las llamas exteriores son más altas y se inclinan ligeramente para
   * dar forma de embudo, mientras una columna central marca el eje.
   */
export function spawnFireWhirl(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    _color: readonly [number, number, number],
    duration: number): void {
const life = Math.max(0.2, duration);
    const root = new pc.Entity('fire-whirl');
    root.setPosition(x, 0.03, z);
    ctx.app.root.addChild(root);

    const glowMaterial = ctx.createMaterial([255, 104, 30], 0.12);
    const flameMaterial = ctx.createFlameMaterial([255, 200, 140], 0.48);
    const hotMaterial = ctx.createFlameMaterial([255, 232, 185], 0.54);
    const materials = [glowMaterial, flameMaterial, hotMaterial];

    const glow = ctx.createEntity(ctx.sphereMesh, [glowMaterial], root);
    glow.setLocalPosition(0, 0.12, 0);
    glow.setLocalScale(radius * 0.7, radius * 0.16, radius * 0.7);

    ctx.spawnFlameParticles(root, {
      x: 0,
      y: 0.12,
      z: 0,
      extents: [radius * 0.6, 0.12, radius * 0.6],
      velocity: [0, 1.2, 0],
      velocityEnd: [0, 3, 0],
      radialSpeed: 0.15,
      radialSpeedEnd: 0.6,
      sizeStart: radius * 0.14,
      sizeMid: radius * 0.3,
      sizeEnd: radius * 0.1,
      lifetime: 0.5,
      rate: 1.4,
      numParticles: 110,
      localSpace: false
    });
    const flameInstances: EffectBatchInstance[] = [];
    const hotFlameInstances: EffectBatchInstance[] = [];

    const arms = 3;
    const perArm = 9;
    const spiralTurns = 1.35;
    for (let arm = 0; arm < arms; arm++) {
      for (let index = 0; index < perArm; index++) {
        const f = (index + 0.5) / perArm;
        const dist = radius * (0.1 + 0.8 * f);
        const baseAngle =
          (arm / arms) * Math.PI * 2 + f * spiralTurns * Math.PI * 2;
        const baseWidth = radius * (0.26 + 0.22 * f);
        const baseHeight = radius * (0.35 + 0.5 * f);
        const instance: EffectBatchInstance = {
          anim0: [baseAngle, dist, 4 + f * 8, arm * 2.3 + index * 1.1],
          anim1: [baseWidth, baseHeight, 0, 0]
        };
        if ((index + arm) % 4 === 0) hotFlameInstances.push(instance);
        else flameInstances.push(instance);
      }
    }
    const flameParams: [number, number, number, number] = [
      Math.min(0.22, life * 0.3),
      Math.min(0.4, life * 0.35),
      Math.min(0.24, life * 0.3),
      0
    ];
    const flameBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.flameMesh,
      material: flameMaterial,
      instances: flameInstances,
      motion: MOTION_FIRE_WHIRL_FLAMES,
      radius,
      life,
      params: flameParams
    });
    const hotFlameBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.flameMesh,
      material: hotMaterial,
      instances: hotFlameInstances,
      motion: MOTION_FIRE_WHIRL_FLAMES,
      radius,
      life,
      params: flameParams
    });

    // Columna central más alta: marca el eje del remolino.
    const centerWidth = radius * 0.52;
    const centerHeight = radius * 0.95;
    const centerFlame = ctx.createFlame(root, hotMaterial, {
      x: 0,
      y: 0,
      z: 0,
      width: centerWidth,
      height: centerHeight,
      yaw: 0
    });

    let time = 0;
    const animate = (_t: number, dt: number): void => {
      time += dt;
      const fadeInTime = Math.min(0.22, life * 0.3);
      const fadeOutTime = Math.min(0.4, life * 0.35);
      const fadeIn = Math.min(1, time / fadeInTime);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / fadeOutTime));
      const envelope = Math.min(fadeIn, fadeOut);
      const pulse = 0.5 + Math.sin(time * 8) * 0.2;

      glowMaterial.opacity = (0.08 + pulse * 0.05) * envelope;

      flameBatch.setTime(time);
      hotFlameBatch.setTime(time);

      const centerIn = Math.min(1, time / Math.min(0.3, life * 0.4));
      const centerScale = centerIn * envelope;
      // Un solo seno por frecuencia para las escalas y el balanceo.
      const sin5 = Math.sin(time * 5);
      const sin7 = Math.sin(time * 7);
      centerFlame.setLocalScale(
        centerWidth * centerScale * (1 + sin7 * 0.1),
        centerHeight * centerScale * (1 + sin5 * 0.12),
        centerWidth * centerScale * (1 + sin7 * 0.1)
      );
      centerFlame.setLocalEulerAngles(6, time * 60, sin5 * 8);

      flameMaterial.opacity =
        0.44 * envelope * (0.85 + Math.random() * 0.15);
      hotMaterial.opacity =
        0.5 * envelope * (0.85 + Math.random() * 0.15);
    };
    ctx.addEffect(root, materials, life, animate);
    animate(0, 0);
}

/**
   * `Fuego Sagrado`: llamarada 3D que sale del vértice del cono y avanza hasta
   * su base.
   *
   * El cuerpo del chorro son lenguas instanciadas que viajan en espacio local
   * desde el vértice (`z = 0`) hasta la punta (`z = reach`), abriéndose en
   * abanico según la apertura del cono. Se suman brasas, chispas y una luz
   * cálida en la boca para que se lea como un aliento de fuego a presión y no
   * como una zona ardiente en el suelo.
   */
export function spawnSacredFlameCone(ctx: FxRuntime, x: number,
    z: number,
    dirX: number,
    dirZ: number,
    length: number,
    halfAngleDeg: number,
    color: readonly [number, number, number],
    duration: number): AoeFxHandle {
const life = Math.max(0.2, duration);
    const clampedHalfAngle = Math.max(8, Math.min(60, halfAngleDeg));
    const half = clampedHalfAngle * DEG;
    const reach = Math.max(0.5, length);
    const yaw = Math.atan2(dirX, dirZ);
    // Altura de la boca: el chorro vuela a la altura del pecho del lanzador en
    // vez de arrastrarse por el suelo.
    const jetY = 1.1;

    const root = new pc.Entity('sacred-flame-cone');
    root.setPosition(x, 0, z);
    root.setEulerAngles(0, yaw / DEG, 0);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createFlameMaterial([255, 248, 214], 0.72);
    const flameMaterial = ctx.createFlameMaterial([255, 190, 86], 0.58);
    const outerMaterial = ctx.createFlameMaterial(color, 0.44);
    const bodyCoreMaterial = ctx.createFlameMaterial([255, 248, 214], 0.42);
    const bodyFlameMaterial = ctx.createFlameMaterial([255, 190, 86], 0.36);
    const bodyOuterMaterial = ctx.createFlameMaterial(color, 0.28);
    const glowMaterial = ctx.createMaterial([255, 120, 36], 0.12);
    const materials = [
      coreMaterial,
      flameMaterial,
      outerMaterial,
      bodyCoreMaterial,
      bodyFlameMaterial,
      bodyOuterMaterial,
      glowMaterial
    ];

    // Cuerpo continuo del chorro: tres conos anidados que crecen desde la boca,
    // ondulan en el vertex shader y se retraen al final.
    const tanHalf = Math.tan(half);
    const bodyMesh = ctx.cachedMesh('sacred-cone-body', () =>
      createFlameConeMesh(ctx.device, 0.16, 1, 24, 8)
    );
    const bodyRadius = reach * tanHalf;
    const bodySpecs = [
      { material: bodyOuterMaterial, scale: 1, phase: 0, speed: 11 },
      { material: bodyFlameMaterial, scale: 0.68, phase: 1.3, speed: 15 },
      { material: bodyCoreMaterial, scale: 0.36, phase: 2.7, speed: 19 }
    ];
    const batches: EffectBatch[] = [];
    for (let index = 0; index < bodySpecs.length; index++) {
      const spec = bodySpecs[index];
      // El tiling de la textura de llama se mantiene; lo que desaparece es su
      // scroll por CPU, sustituido por la ondulación de vértices.
      spec.material.emissiveMapTiling = new pc.Vec2(3, 2);
      spec.material.opacityMapTiling = new pc.Vec2(3, 2);
      batches.push(
        new EffectBatch({
          app: ctx.app,
          parent: root,
          mesh: bodyMesh,
          material: spec.material,
          instances: [
            {
              y: jetY,
              anim0: [reach, bodyRadius * spec.scale, spec.phase, spec.speed]
            }
          ],
          motion: MOTION_SACRED_FLAME_BODY,
          radius: reach,
          life,
          params: [0.12, 0.3, 0, 0]
        })
      );
    }

    // Lenguas del chorro: cada instancia recorre el cono del vértice a la base
    // con fase propia. Las más claras van pegadas al eje y las exteriores se
    // abren hacia los bordes para llenar el abanico completo.
    const makeInstances = (
      count: number,
      radialMax: number,
      widthScale: number,
      heightScale: number,
      seed: number
    ): EffectBatchInstance[] => {
      const instances: EffectBatchInstance[] = [];
      for (let index = 0; index < count; index++) {
        // Reparto determinista en espiral: el chorro no depende de
        // Math.random y todas las vistas dibujan la misma llamarada.
        const phase = (index * 0.61803398875 + seed) % 1;
        const azimuth = index * 2.399963229728653 + seed * Math.PI * 2;
        const radial =
          ((index * 0.754877666 + seed * 0.3) % 1) * radialMax;
        const speed = 0.85 + ((index * 13 + seed * 17) % 9) * 0.055;
        const width = reach * widthScale * (0.8 + radial * 0.45);
        const height = reach * heightScale * (0.75 + radial * 0.5);
        instances.push({
          anim0: [phase, azimuth, 0, speed],
          anim1: [width, height, radial, 0]
        });
      }
      return instances;
    };
    batches.push(
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.flameMesh,
        material: flameMaterial,
        instances: makeInstances(140, 0.92, 0.06, 0.15, 0.13),
        motion: MOTION_FLAME_JET,
        radius: reach,
        life,
        params: [tanHalf, 0.14, 0.3, jetY]
      })
    );
    batches.push(
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.flameMesh,
        material: coreMaterial,
        instances: makeInstances(40, 0.6, 0.05, 0.13, 0.57),
        motion: MOTION_FLAME_JET,
        radius: reach,
        life,
        params: [tanHalf, 0.14, 0.3, jetY]
      })
    );
    batches.push(
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.flameMesh,
        material: outerMaterial,
        instances: makeInstances(90, 1, 0.07, 0.17, 0.81),
        motion: MOTION_FLAME_JET,
        radius: reach,
        life,
        params: [tanHalf, 0.18, 0.32, jetY]
      })
    );

    // Resplandor en la boca con pulso y fundido en GPU.
    batches.push(
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.sphereMesh,
        material: glowMaterial,
        instances: [
          {
            y: jetY,
            z: 0.18,
            anim0: [0.25, 24, 0.16, 0],
            anim1: [0.75, 0, 0, 0]
          }
        ],
        motion: MOTION_PULSE_SPHERE,
        radius: reach,
        life,
        params: [0.08, 0.2, 0, 0]
      })
    );

    let time = 0;
    const animate = (_t: number, dt: number): void => {
      time += dt;

      // La geometría y los fundidos viven en el vertex shader; no hay luces
      // de escena que actualizar.
      for (const batch of batches) batch.setTime(time);
    };

    const anchors = coneAnchors(x, z, dirX, dirZ, reach, half);
    const firstEffect = ctx.effects.length;
    ctx.withAnchors(anchors, () =>
      ctx.addEffect(root, materials, life, animate, anchors)
    );
    const created = ctx.effects.slice(firstEffect);
    animate(0, 0);
    let centerX = x;
    let centerZ = z;
    let currentDirX = dirX;
    let currentDirZ = dirZ;
    const updateAnchors = (): FxAnchors => {
      const nextAnchors = coneAnchors(
        centerX,
        centerZ,
        currentDirX,
        currentDirZ,
        reach,
        half
      );
      for (const effect of created) effect.anchors = nextAnchors;
      return nextAnchors;
    };
    return {
      setCenter: (nextX, nextZ) => {
        centerX = nextX;
        centerZ = nextZ;
        root.setPosition(nextX, root.getPosition().y, nextZ);
        updateAnchors();
      },
      setDirection: (nextDirX, nextDirZ) => {
        const length = Math.hypot(nextDirX, nextDirZ);
        if (length < 0.0001) return;
        currentDirX = nextDirX / length;
        currentDirZ = nextDirZ / length;
        root.setEulerAngles(0, Math.atan2(currentDirX, currentDirZ) / DEG, 0);
        updateAnchors();
      },
      destroy: () => {
        for (const effect of created) ctx.disposeEffect(effect);
      }
    };
}

/**
   * Onda de calor: fuego real repartido por el disco (tres anillos de llamas y
   * una columna central) con un vórtice de viento que gira por encima. Es el
   * estilo de `Onda Ígnea`: manda el naranja de la habilidad y el blanco del
   * aire solo marca el frente de la onda.
   */
export function spawnHeatAoe(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    _color: readonly [number, number, number],
    duration: number): void {
const life = Math.max(0.2, duration);
    const root = new pc.Entity('heat-aoe');
    root.setPosition(x, 0.03, z);
    ctx.app.root.addChild(root);

    const glowMaterial = ctx.createMaterial([255, 112, 34], 0.16);
    const flameMaterial = ctx.createFlameMaterial([255, 204, 148], 0.5);
    const hotMaterial = ctx.createFlameMaterial([255, 240, 202], 0.58);
    const windMaterial = ctx.createWaterMaterial([255, 232, 190], 0.42);
    const emberMaterial = ctx.createMaterial([255, 176, 76], 0.85);
    const materials = [
      glowMaterial,
      flameMaterial,
      hotMaterial,
      windMaterial,
      emberMaterial
    ];

    ctx.spawnFlameParticles(root, {
      x: 0,
      y: 0.14,
      z: 0,
      extents: [radius * 0.9, 0.18, radius * 0.9],
      velocity: [0, 1, 0],
      velocityEnd: [0, 2.8, 0],
      radialSpeed: 0.3,
      radialSpeedEnd: 1.2,
      sizeStart: radius * 0.2,
      sizeMid: radius * 0.5,
      sizeEnd: radius * 0.14,
      lifetime: 0.55,
      rate: 1.8,
      numParticles: 140,
      localSpace: false
    });

    const glow = ctx.createEntity(ctx.sphereMesh, [glowMaterial], root);
    glow.setLocalPosition(0, 0.14, 0);

    const flameInstances: EffectBatchInstance[] = [];
    const hotFlameInstances: EffectBatchInstance[] = [];
    const flameRings = [
      { count: 10, dist: 0.2, width: 0.18, height: 0.42 },
      { count: 14, dist: 0.45, width: 0.22, height: 0.56 },
      { count: 20, dist: 0.7, width: 0.26, height: 0.66 }
    ];
    for (let ringIndex = 0; ringIndex < flameRings.length; ringIndex++) {
      const spec = flameRings[ringIndex];
      const offset = ringIndex * 0.5;
      for (let index = 0; index < spec.count; index++) {
        const angle = ((index + offset) / spec.count) * Math.PI * 2;
        const variation = ((index * 7 + ringIndex * 3) % 10) / 10;
        const dist = radius * spec.dist * (0.92 + variation * 0.16);
        const baseWidth =
          radius * spec.width * (0.9 + variation * 0.2);
        const baseHeight =
          radius * spec.height * (0.88 + variation * 0.24);
        const yaw = (index * 47 + ringIndex * 31) % 360;
        const instance: EffectBatchInstance = {
          anim0: [index * 1.3 + ringIndex * 2.1, angle, dist, yaw],
          anim1: [baseWidth, baseHeight, 0, 0]
        };
        if ((index + ringIndex) % 4 === 0) hotFlameInstances.push(instance);
        else flameInstances.push(instance);
      }
    }
    const flameParams: [number, number, number, number] = [
      0.16,
      0.3,
      Math.min(0.25, life * 0.3),
      0
    ];
    const flameBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.flameMesh,
      material: flameMaterial,
      instances: flameInstances,
      motion: MOTION_HEAT_FLAMES,
      radius,
      life,
      params: flameParams
    });
    const hotFlameBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.flameMesh,
      material: hotMaterial,
      instances: hotFlameInstances,
      motion: MOTION_HEAT_FLAMES,
      radius,
      life,
      params: flameParams
    });

    const centerWidth = radius * 0.58;
    const centerHeight = radius * 1.05;
    const centerFlame = ctx.createFlame(root, hotMaterial, {
      x: 0,
      y: 0,
      z: 0,
      width: centerWidth,
      height: centerHeight,
      yaw: 15
    });

    // Vórtice de aire sobre las llamas: da el "frente de onda" sin quitarles
    // protagonismo al fuego.
    const swirl = new pc.Entity('heat-swirl');
    swirl.setLocalPosition(0, radius * 0.34, 0);
    root.addChild(swirl);
    const bladeInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 6; index++) {
      const angle = (index / 6) * Math.PI * 2;
      const size = radius * (0.32 + (index % 3) * 0.07);
      bladeInstances.push({
        x: Math.cos(angle) * radius * 0.45,
        y: Math.sin(angle * 2) * radius * 0.05,
        z: Math.sin(angle) * radius * 0.45,
        anim0: [size, index * 1.2, 0, 0]
      });
    }
    const bladeBatch = new EffectBatch({
      app: ctx.app,
      parent: swirl,
      mesh: ctx.cachedMesh('wind-blade:unit', () =>
        createWindBladeMesh(ctx.device, 0.52, 1.25, 0.1, 10)
      ),
      material: windMaterial,
      instances: bladeInstances,
      motion: MOTION_HEAT_BLADES,
      radius,
      life,
      params: [0.16, 0.3, 0.32, 0]
    });

    const emberInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 10; index++) {
      const angle = (index / 10) * Math.PI * 2 + Math.random() * 0.5;
      const size = radius * (0.035 + Math.random() * 0.03);
      emberInstances.push({
        anim0: [
          angle,
          radius * (0.2 + Math.random() * 0.65),
          radius * (0.5 + Math.random() * 0.6),
          Math.random() * Math.PI * 2
        ],
        anim1: [size, 0, 0, 0]
      });
    }
    const emberBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: emberMaterial,
      instances: emberInstances,
      motion: MOTION_HEAT_EMBERS,
      radius,
      life
    });

    let time = 0;
    const animate = (_t: number, dt: number): void => {
      time += dt;
      const fadeIn = Math.min(1, time / 0.16);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.3));
      const envelope = Math.min(fadeIn, fadeOut);
      const grow = 1 - Math.pow(1 - Math.min(1, time / 0.32), 2);
      const sin7 = Math.sin(time * 7);
      const pulse = 0.5 + Math.sin(time * 8) * 0.2;

      const glowScale = radius * 1.1 * (0.7 + 0.5 * grow);
      glow.setLocalScale(
        glowScale,
        radius * 0.22 * (0.7 + 0.7 * grow),
        glowScale
      );
      glowMaterial.opacity = (0.1 + pulse * 0.08) * envelope;

      swirl.setLocalEulerAngles(0, time * 90, 0);
      bladeBatch.setTime(time);
      flameBatch.setTime(time);
      hotFlameBatch.setTime(time);
      emberBatch.setTime(time);

      const centerIn = Math.min(1, time / Math.min(0.3, life * 0.4));
      const centerLife = centerIn * envelope;
      // Un solo seno por frecuencia alimenta las tres escalas y el balanceo.
      const sway = Math.sin(time * 9) * 0.1;
      centerFlame.setLocalScale(
        centerWidth * centerLife * (1 + sway),
        centerHeight * centerLife * (1 + sin7 * 0.12),
        centerWidth * centerLife * (1 + sway)
      );
      centerFlame.setLocalEulerAngles(
        0,
        15 + time * 14,
        Math.sin(time * 5) * 7
      );

      flameMaterial.opacity =
        0.42 * envelope * (0.85 + Math.random() * 0.15);
      hotMaterial.opacity =
        0.46 * envelope * (0.85 + Math.random() * 0.15);
      windMaterial.opacity = 0.3 * envelope;
      emberMaterial.opacity = 0.78 * envelope;
    };
    ctx.addEffect(root, materials, life, animate);
    animate(0, 0);
}
