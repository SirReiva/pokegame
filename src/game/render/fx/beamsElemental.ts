import type { FxRuntime } from './fxRuntime';
import * as pc from 'playcanvas';
import { DEG } from '../../config';
import { EffectBatch, MOTION_ICE_BEAM_CRYSTALS, MOTION_ROCK_BEAM_SPIKES, MOTION_TINT_BEAM_BULGES, MOTION_TINT_BEAM_CYLINDER, MOTION_TINT_BEAM_DROPS, MOTION_TINT_BEAM_FEATHERS, MOTION_TINT_BEAM_FIRE_LICKS, MOTION_TINT_BEAM_FOAM, MOTION_TINT_BEAM_LAYER, MOTION_TINT_BEAM_LEAVES, MOTION_TINT_BEAM_MIST, MOTION_TINT_BEAM_RIBBONS, MOTION_TINT_BEAM_RINGS, MOTION_TINT_BEAM_STREAKS } from '../../effectBatch';
import type { EffectBatchInstance } from '../../effectBatch';
import { EffectTintBatch } from './effectTintBatch';
import type { TintEffectInstance } from './effectTintBatch';
import { tintColor } from './fxGeometry';

/**
   * Chorro de agua a presión: un cañón de agua grueso y turbulento, no un tubo
   * limpio. Mezcla una neblina exterior, un cuerpo azul con bultos que recorren
   * la línea, un núcleo blanco con vetas rápidas, espuma en la boca y una
   * salpicadura en la punta. Todo son transformaciones y opacidad sobre
   * geometría estática.
   */
export function spawnWaterBeam(ctx: FxRuntime, x1: number,
    z1: number,
    x2: number,
    z2: number,
    color: readonly [number, number, number],
    width: number): void {
const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.max(0.1, Math.hypot(dx, dz));
    const root = new pc.Entity('water-beam');
    root.setPosition(x1, 0.7, z1);
    root.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    ctx.app.root.addChild(root);

    const coreColor: [number, number, number] = [236, 252, 255];
    const foamColor: [number, number, number] = [216, 245, 255];
    const streakColor: [number, number, number] = [250, 255, 255];

    const coreMaterial = ctx.createWaterMaterial(coreColor, 0.95);
    const ringMaterial = ctx.createWaterMaterial([200, 240, 255], 0.7);
    const materials = [coreMaterial, ringMaterial];

    const mistWidth = Math.max(0.14, width * 3.2);
    const bodyWidth = Math.max(0.1, width * 1.8);
    const coreWidth = Math.max(0.06, width * 0.9);
    const reveal = 0.09;
    const lengthHalf = length / 2;
    const lateralHalf = mistWidth * 1.5 + width * 3;

    // Capas del chorro: neblina, cuerpo y núcleo comparten la malla esférica.
    // Antes eran tres entidades con materiales distintos.
    const layerBatch = new EffectTintBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      instances: [
        { color, alpha: 0.16, anim0: [mistWidth, 0, 0, 0] },
        { color, alpha: 0.4, anim0: [bodyWidth, 0, 0, 0] },
        { color: coreColor, alpha: 0.92, anim0: [coreWidth, 0, 0, 0] }
      ],
      motion: MOTION_TINT_BEAM_LAYER,
      radius: length,
      life: 0.55,
      params: [reveal, width, 0, 0],
      boundsCenter: [0, 0, lengthHalf],
      boundsHalf: [lateralHalf, lateralHalf, lengthHalf + width * 3]
    });

    // Bultos que viajan por el chorro: rompen la silueta del tubo y transmiten
    // la presión del agua.
    const bulgeInstances: TintEffectInstance[] = [];
    for (let index = 0; index < 12; index++) {
      const size = bodyWidth * (0.55 + Math.random() * 0.3);
      bulgeInstances.push({
        color,
        alpha: 0.4,
        anim0: [
          Math.random(),
          2.1 + Math.random() * 1.1,
          14 + Math.random() * 10,
          size
        ],
        anim1: [coreWidth, 0, 0, 0]
      });
    }
    const bulgeBatch = new EffectTintBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      instances: bulgeInstances,
      motion: MOTION_TINT_BEAM_BULGES,
      radius: length,
      life: 0.55,
      params: [reveal, width, 0, 0],
      boundsCenter: [0, 0, lengthHalf],
      boundsHalf: [lateralHalf, lateralHalf, lengthHalf + width * 3]
    });

    // Vetas blancas rápidas dentro del núcleo, como agua a toda velocidad.
    const streakInstances: TintEffectInstance[] = [];
    for (let index = 0; index < 14; index++) {
      streakInstances.push({
        color: streakColor,
        alpha: 0.82,
        anim0: [
          Math.random(),
          4.2 + Math.random() * 2.2,
          (Math.random() - 0.5) * coreWidth * 0.9,
          (Math.random() - 0.5) * coreWidth * 0.7
        ],
        anim1: [width, length * (0.06 + Math.random() * 0.06), 0, 0]
      });
    }
    const streakBatch = new EffectTintBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.boxMesh,
      instances: streakInstances,
      motion: MOTION_TINT_BEAM_STREAKS,
      radius: length,
      life: 0.55,
      params: [reveal, width, 0, 0],
      boundsCenter: [0, 0, lengthHalf],
      boundsHalf: [lateralHalf, lateralHalf, lengthHalf + width * 3]
    });

    // Espuma en la boca del lanzador.
    const foamInstances: TintEffectInstance[] = [];
    for (let index = 0; index < 4; index++) {
      foamInstances.push({
        color: foamColor,
        alpha: 0.5,
        anim0: [
          bodyWidth * (0.5 + Math.random() * 0.45),
          Math.random() * Math.PI * 2,
          0.02 + Math.random() * 0.35,
          0
        ],
        anim1: [bodyWidth, 0, 0, 0]
      });
    }
    const foamBatch = new EffectTintBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      instances: foamInstances,
      motion: MOTION_TINT_BEAM_FOAM,
      radius: length,
      life: 0.55,
      params: [reveal, width, 0, 0],
      boundsCenter: [0, 0, lengthHalf],
      boundsHalf: [lateralHalf, lateralHalf, lengthHalf + width * 3]
    });

    // Salpicadura en la punta: casquete, dos ondas y gotas.
    const cap = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    const capScale = Math.max(0.12, width * 1.7);

    const splashRings: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
      ring.setLocalEulerAngles(90, 0, 0);
      splashRings.push(ring);
    }

    const dropInstances: TintEffectInstance[] = [];
    for (let index = 0; index < 12; index++) {
      dropInstances.push({
        color: foamColor,
        alpha: 0.5,
        anim0: [
          Math.random() * Math.PI * 2,
          width * (1.4 + Math.random() * 2.6),
          width * (1 + Math.random() * 2),
          Math.random()
        ],
        anim1: [
          width * (0.12 + Math.random() * 0.14),
          1.8 + Math.random() * 1.6,
          0,
          0
        ]
      });
    }
    const dropBatch = new EffectTintBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      instances: dropInstances,
      motion: MOTION_TINT_BEAM_DROPS,
      radius: length,
      life: 0.55,
      params: [reveal, width, 0, 0],
      boundsCenter: [0, 0, lengthHalf],
      boundsHalf: [lateralHalf, lateralHalf, lengthHalf + width * 3]
    });

    // Rocío localizado en la boca y en la punta: el chorro no lleva una niebla
    // continua en medio, solo salpicadura donde nace y donde impacta.
    ctx.spawnSporeParticles(
      root,
      {
        x: 0,
        y: 0,
        z: width * 0.6,
        extents: [width * 1.6, width * 1.4, width * 0.8],
        velocity: [0, 0.2, 1.5],
        velocityEnd: [0, 0.8, 3.4],
        radialSpeed: 0.6,
        radialSpeedEnd: 1.8,
        sizeStart: width * 0.8,
        sizeMid: width * 1.2,
        sizeEnd: width * 0.4,
        lifetime: 0.18,
        rate: 0.01,
        numParticles: 26,
        stretch: 0.3,
        localSpace: true,
        blendType: pc.BLEND_NORMAL
      },
      color,
      ctx.waterTexture
    );
    ctx.spawnSporeParticles(
      root,
      {
        x: 0,
        y: 0,
        z: length,
        extents: [width * 1.4, width * 1.2, width * 1.2],
        velocity: [0, 0.4, 0.6],
        velocityEnd: [0, 0.9, 1.2],
        radialSpeed: 1.4,
        radialSpeedEnd: 3.2,
        sizeStart: width * 0.9,
        sizeMid: width * 1.4,
        sizeEnd: width * 0.4,
        lifetime: 0.22,
        rate: 0.012,
        numParticles: 30,
        localSpace: true,
        blendType: pc.BLEND_NORMAL
      },
      color,
      ctx.waterTexture
    );

    let time = 0;
    ctx.addEffect(root, materials, 0.55, (_t, dt) => {
      time += dt;
      const fade = 1 - Math.max(0, (time - 0.3) / 0.25);
      // El chorro sale del lanzador en el primer tramo del efecto.
      const advance = Math.min(1, time / reveal);
      const revealEase = 1 - (1 - advance) * (1 - advance);
      const visibleLength = Math.max(0.04, length * revealEase);

      layerBatch.setTime(time);
      layerBatch.setOpacity(fade);
      bulgeBatch.setTime(time);
      bulgeBatch.setOpacity(fade);
      streakBatch.setTime(time);
      streakBatch.setOpacity(fade);
      foamBatch.setTime(time);
      foamBatch.setOpacity(fade);
      dropBatch.setTime(time);
      dropBatch.setOpacity(fade);

      const capPulse = 0.9 + Math.sin(time * 46) * 0.18;
      cap.setLocalPosition(0, 0, visibleLength);
      cap.setLocalScale(
        capScale * capPulse,
        capScale * capPulse,
        capScale * capPulse
      );

      splashRings.forEach((ring, index) => {
        const phase = (time * 2.6 + index * 0.5) % 1;
        const scale = Math.max(0.08, width * (1.6 + phase * 5));
        ring.setLocalPosition(0, 0, visibleLength);
        ring.setLocalScale(scale, scale, scale);
      });

      coreMaterial.opacity = 0.92 * fade;
      ringMaterial.opacity =
        0.62 * fade * Math.max(0, 1 - ((time * 2.6) % 1));
    });
}
/**
   * Chorro de fuego: partículas orientadas a cámara a lo largo del recorrido,
   * lenguas texturizadas que les dan silueta y un núcleo cálido. Avanza muy
   * rápido y se desvanece antes de desaparecer.
   */
export function spawnFireBeam(ctx: FxRuntime, x1: number,
    z1: number,
    x2: number,
    z2: number,
    _color: readonly [number, number, number],
    width: number): void {
const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.max(0.1, Math.hypot(dx, dz));
    const root = new pc.Entity('fire-beam');
    root.setPosition(x1, 0.7, z1);
    root.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createMaterial([255, 226, 170], 0.5);
    const hotMaterial = ctx.createFlameMaterial([255, 242, 200], 0.55);
    const materials = [coreMaterial, hotMaterial];

    ctx.spawnFlameParticles(root, {
      x: 0,
      y: 0,
      z: length / 2,
      extents: [width * 2, width * 1.8, length * 0.5],
      velocity: [0, 0.25, 1.4],
      velocityEnd: [0, 0.9, 3.6],
      sizeStart: width * 1.6,
      sizeMid: width * 2.6,
      sizeEnd: width * 1.1,
      lifetime: 0.32,
      rate: 1.1,
      numParticles: 80,
      stretch: 0.55,
      localSpace: true
    });
    const reveal = 0.18;
    const lengthHalf = length / 2;
    const lateralHalf = width * 6;
    const coreWidth = Math.max(0.04, width * 0.28);
    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);

    // Lenguas tumbadas que se solapan a lo largo del chorro: son las que dan
    // la silueta irregular de fuego; el núcleo brillante solo las une. Las
    // llamas normales y las calientes se dibujan en dos lotes con tinte.
    const flameInstances: TintEffectInstance[] = [];
    const hotInstances: TintEffectInstance[] = [];
    const horizontalCount = Math.min(
      22,
      Math.max(6, Math.round(length / 0.8))
    );
    for (let index = 0; index < horizontalCount; index++) {
      const spread = ((index * 37) % 10) / 10;
      const pitch = index % 2 === 0 ? -90 : -72;
      const yaw = ((index * 53) % 30) - 15;
      const roll = ((index * 71) % 90) - 45;
      const instance: TintEffectInstance = {
        color: index % 3 === 0 ? [255, 242, 200] : [255, 255, 255],
        alpha: 0.28 + Math.random() * 0.16,
        anim0: [
          index * 1.7,
          ((index + 0.5) / horizontalCount) * length,
          Math.cos(index * 1.7) * width * 0.7,
          Math.sin(index * 2.3) * width * 0.55
        ],
        anim1: [
          width * (2.2 + spread * 1.5),
          width * (4.2 + spread * 3.2),
          pitch,
          yaw
        ],
        anim2: [roll, 0, 0, 0]
      };
      if (index % 3 === 0) hotInstances.push(instance);
      else flameInstances.push(instance);
    }

    // Algunas llamas verticales sobre el chorro rompen la línea recta.
    const verticalCount = Math.min(8, Math.max(3, Math.round(length / 2.2)));
    for (let index = 0; index < verticalCount; index++) {
      const spread = ((index * 29) % 10) / 10;
      flameInstances.push({
        color: [255, 255, 255],
        alpha: 0.28 + Math.random() * 0.16,
        anim0: [
          index * 2.3 + 0.8,
          ((index + 0.5) / verticalCount) * length,
          Math.cos(index * 2.1) * width * 1.1,
          0
        ],
        anim1: [
          width * (1.8 + spread * 1.4),
          width * (3.4 + spread * 2.6),
          0,
          (index * 67) % 360
        ],
        anim2: [0, 1, 0, 0]
      });
    }

    const flameBatch = new EffectTintBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.flameMesh,
      instances: flameInstances,
      motion: MOTION_TINT_BEAM_FIRE_LICKS,
      radius: length,
      life: 0.45,
      params: [reveal, width, 0, 0],
      additive: true,
      texture: ctx.flameTexture,
      intensity: 1.12,
      boundsCenter: [0, 0, lengthHalf],
      boundsHalf: [lateralHalf, width * 8, lengthHalf + width * 6]
    });
    const hotBatch = new EffectTintBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.flameMesh,
      instances: hotInstances,
      motion: MOTION_TINT_BEAM_FIRE_LICKS,
      radius: length,
      life: 0.45,
      params: [reveal, width, 0, 0],
      additive: true,
      texture: ctx.flameTexture,
      intensity: 1.12,
      boundsCenter: [0, 0, lengthHalf],
      boundsHalf: [lateralHalf, width * 8, lengthHalf + width * 6]
    });

    const tipWidth = width * 4;
    const tipHeight = width * 8;
    const tip = ctx.createFlame(root, hotMaterial, {
      x: 0,
      y: 0,
      z: 0,
      width: tipWidth,
      height: tipHeight,
      pitch: -90
    });

    let time = 0;
    const animate = (t: number, dt: number): void => {
      time += dt;
      const revealValue = Math.min(1, t / reveal);
      const revealEase = 1 - (1 - revealValue) * (1 - revealValue);
      const visibleLength = length * revealEase;

      core.setLocalPosition(0, 0, visibleLength / 2);
      core.setLocalScale(
        coreWidth * 2,
        coreWidth * 2,
        Math.max(0.02, visibleLength)
      );

      const fade = 1 - Math.max(0, (t - 0.45) / 0.55);
      flameBatch.setTime(time);
      flameBatch.setOpacity(fade);
      hotBatch.setTime(time);
      hotBatch.setOpacity(fade);

      tip.setLocalPosition(0, 0, visibleLength);
      const tipStretch = 0.82 + Math.sin(time * 24) * 0.24;
      const tipSway = 1 + Math.sin(time * 30) * 0.16;
      const tipVisible = visibleLength > 0.12 ? 1 : 0;
      tip.setLocalScale(
        tipWidth * tipSway * tipVisible,
        tipHeight * tipStretch * tipVisible,
        tipWidth * tipSway * tipVisible
      );
      tip.setLocalEulerAngles(-90, 0, Math.sin(time * 18) * 14);

      coreMaterial.opacity = 0.4 * fade * (0.85 + Math.random() * 0.15);
      hotMaterial.opacity = (0.34 + Math.random() * 0.18) * fade;
    };
    ctx.addEffect(root, materials, 0.45, animate);
    animate(0, 0);
}
/**
   * Haz de aire: columna blanca-cálida con tres hélices de viento que giran en
   * espiral, anillos que viajan hacia la punta y plumas arrastradas. El cuerpo
   * usa mezcla normal para conservar el blanco sobre el cielo.
   */
export function spawnAirBeam(ctx: FxRuntime, x1: number,
    z1: number,
    x2: number,
    z2: number,
    color: readonly [number, number, number],
    width: number): void {
const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.max(0.1, Math.hypot(dx, dz));
    const root = new pc.Entity('air-beam');
    root.setPosition(x1, 0.8, z1);
    root.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    ctx.app.root.addChild(root);

    const coreColor = tintColor(color, 0.9);
    const ribbonColor = tintColor(color, 0.68);
    const ringColor = tintColor(color, 0.78);
    const featherColor = tintColor(color, 0.52);
    const reveal = 0.1;
    const lengthHalf = length / 2;
    const lateralHalf = width * 5;

    const beamMesh = pc.Mesh.fromGeometry(
      ctx.device,
      new pc.CylinderGeometry({
        radius: 0.5,
        height: 1,
        heightSegments: 1,
        capSegments: 14
      })
    );
    const bodyBatch = new EffectTintBatch({
      app: ctx.app,
      parent: root,
      mesh: beamMesh,
      instances: [
        { color, alpha: 0.2, anim0: [width * 2, width * 2, 0, 0] },
        { color: coreColor, alpha: 0.48, anim0: [width * 0.58, width * 0.58, 0, 0] }
      ],
      motion: MOTION_TINT_BEAM_CYLINDER,
      radius: length,
      life: 0.46,
      params: [reveal, 1, 0, 0],
      boundsCenter: [0, 0, lengthHalf],
      boundsHalf: [lateralHalf, lateralHalf, lengthHalf + width * 3]
    });

    // Tres hélices de viento: los segmentos normales y los calientes giran en
    // espiral alrededor del eje. Antes eran 42 entidades.
    const ribbonInstances: TintEffectInstance[] = [];
    const hotRibbonInstances: TintEffectInstance[] = [];
    const segments = 14;
    for (let helix = 0; helix < 3; helix++) {
      for (let index = 0; index < segments; index++) {
        const t = (index + 1) / segments;
        const instance: TintEffectInstance = {
          color: helix === 1 ? color : ribbonColor,
          alpha: helix === 1 ? 0.34 : 0.42,
          anim0: [
            (helix / 3) * Math.PI * 2,
            t,
            width * (1.05 + 0.12 * Math.sin(t * Math.PI)),
            0
          ],
          anim1: [width * 0.13, width * 0.82, 0, 0]
        };
        if (helix === 1) hotRibbonInstances.push(instance);
        else ribbonInstances.push(instance);
      }
    }
    const ribbonBatch = new EffectTintBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.boxMesh,
      instances: ribbonInstances,
      motion: MOTION_TINT_BEAM_RIBBONS,
      radius: length,
      life: 0.46,
      params: [reveal, 7, 5, 1],
      boundsCenter: [0, 0, lengthHalf],
      boundsHalf: [lateralHalf, lateralHalf, lengthHalf + width * 3]
    });
    const hotRibbonBatch = new EffectTintBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.boxMesh,
      instances: hotRibbonInstances,
      motion: MOTION_TINT_BEAM_RIBBONS,
      radius: length,
      life: 0.46,
      params: [reveal, 7, 5, 1],
      additive: true,
      boundsCenter: [0, 0, lengthHalf],
      boundsHalf: [lateralHalf, lateralHalf, lengthHalf + width * 3]
    });

    // Anillos que viajan hacia la punta.
    const ringBatch = new EffectTintBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.torusMesh,
      instances: [0, 1, 2, 3].map((index) => ({
        color: ringColor,
        alpha: 0.4,
        anim0: [index, 0, 0, 0]
      })),
      motion: MOTION_TINT_BEAM_RINGS,
      radius: length,
      life: 0.46,
      params: [reveal, 2.4, width, 1],
      boundsCenter: [0, 0, lengthHalf],
      boundsHalf: [lateralHalf, lateralHalf, lengthHalf + width * 3]
    });

    // Plumas arrastradas por el viento.
    const featherInstances: TintEffectInstance[] = [];
    for (let index = 0; index < 6; index++) {
      const size = width * (0.5 + Math.random() * 0.25);
      featherInstances.push({
        color: featherColor,
        alpha: 0.7,
        anim0: [
          (index / 6) * Math.PI * 2,
          Math.random(),
          size,
          Math.random() * Math.PI * 2
        ]
      });
    }
    const featherBatch = new EffectTintBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.leafMesh,
      instances: featherInstances,
      motion: MOTION_TINT_BEAM_FEATHERS,
      radius: length,
      life: 0.46,
      params: [reveal, width, 0, 0],
      texture: ctx.leafTexture,
      boundsCenter: [0, 0, lengthHalf],
      boundsHalf: [lateralHalf, lateralHalf, lengthHalf + width * 3]
    });

    let time = 0;
    ctx.addEffect(root, [], 0.46, (_t, dt) => {
      time += dt;
      const pulse = 0.86 + Math.random() * 0.14;
      const fade = 1 - Math.max(0, (time - 0.28) / 0.18);

      bodyBatch.setTime(time);
      bodyBatch.setParams(reveal, pulse, 0, 0);
      bodyBatch.setOpacity(pulse * fade);
      ribbonBatch.setTime(time);
      ribbonBatch.setParams(reveal, 7, 5, pulse);
      ribbonBatch.setOpacity(fade);
      hotRibbonBatch.setTime(time);
      hotRibbonBatch.setParams(reveal, 7, 5, pulse);
      hotRibbonBatch.setOpacity(fade);
      ringBatch.setTime(time);
      ringBatch.setParams(reveal, 2.4, width, pulse);
      ringBatch.setOpacity(fade);
      featherBatch.setTime(time);
      featherBatch.setOpacity(fade);
    });
}

/**
   * Haz de Planta: columna verde con un núcleo claro y tres hélices de hojas
   * que giran en espiral alrededor de la línea, con anillos de polen que viajan
   * hasta la punta. La mezcla normal mantiene el verde legible sobre hierba o
   * arena clara.
   */
export function spawnGrassBeam(ctx: FxRuntime, x1: number,
    z1: number,
    x2: number,
    z2: number,
    color: readonly [number, number, number],
    width: number): void {
const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.max(0.1, Math.hypot(dx, dz));
    const root = new pc.Entity('grass-beam');
    root.setPosition(x1, 0.75, z1);
    root.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    ctx.app.root.addChild(root);

    const coreColor: [number, number, number] = [244, 255, 206];
    const ringColor: [number, number, number] = [214, 248, 160];
    const leafColor: [number, number, number] = [226, 250, 184];
    const hotLeafColor: [number, number, number] = [248, 255, 222];
    const reveal = 0.1;
    const lengthHalf = length / 2;
    const lateralHalf = width * 5;

    const beamMesh = pc.Mesh.fromGeometry(
      ctx.device,
      new pc.CylinderGeometry({
        radius: 0.5,
        height: 1,
        heightSegments: 1,
        capSegments: 14
      })
    );
    const bodyBatch = new EffectTintBatch({
      app: ctx.app,
      parent: root,
      mesh: beamMesh,
      instances: [
        { color, alpha: 0.2, anim0: [width * 2, width * 2, 0, 0] },
        { color: coreColor, alpha: 0.48, anim0: [width * 0.58, width * 0.58, 0, 0] }
      ],
      motion: MOTION_TINT_BEAM_CYLINDER,
      radius: length,
      life: 0.46,
      params: [reveal, 1, 0, 0],
      boundsCenter: [0, 0, lengthHalf],
      boundsHalf: [lateralHalf, lateralHalf, lengthHalf + width * 3]
    });

    // Tres hélices de hojas; las hojas calientes van en el mismo lote con su
    // propio tinte por instancia.
    const leafInstances: TintEffectInstance[] = [];
    const segments = 14;
    for (let helix = 0; helix < 3; helix++) {
      for (let index = 0; index < segments; index++) {
        const size = width * (0.32 + Math.random() * 0.14);
        const offset = (index + 1) / segments;
        leafInstances.push({
          color: helix === 1 ? hotLeafColor : leafColor,
          alpha: 0.82,
          anim0: [
            (helix / 3) * Math.PI * 2,
            offset,
            width * (1.05 + Math.sin(offset * Math.PI) * 0.18),
            Math.random() * Math.PI * 2
          ],
          anim1: [size, 0, 0, 0]
        });
      }
    }
    const leafBatch = new EffectTintBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.leafMesh,
      instances: leafInstances,
      motion: MOTION_TINT_BEAM_LEAVES,
      radius: length,
      life: 0.46,
      params: [reveal, 8, 6, 1],
      texture: ctx.leafTexture,
      boundsCenter: [0, 0, lengthHalf],
      boundsHalf: [lateralHalf, lateralHalf, lengthHalf + width * 3]
    });

    const ringBatch = new EffectTintBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.torusMesh,
      instances: [0, 1, 2, 3].map((index) => ({
        color: ringColor,
        alpha: 0.4,
        anim0: [index, 0, 0, 0]
      })),
      motion: MOTION_TINT_BEAM_RINGS,
      radius: length,
      life: 0.46,
      params: [reveal, 2.4, width, 1],
      boundsCenter: [0, 0, lengthHalf],
      boundsHalf: [lateralHalf, lateralHalf, lengthHalf + width * 3]
    });

    let time = 0;
    ctx.addEffect(root, [], 0.46, (_t, dt) => {
      time += dt;
      const pulse = 0.86 + Math.random() * 0.14;
      const fade = 1 - Math.max(0, (time - 0.28) / 0.18);

      bodyBatch.setTime(time);
      bodyBatch.setParams(reveal, pulse, 0, 0);
      bodyBatch.setOpacity(pulse * fade);
      leafBatch.setTime(time);
      leafBatch.setParams(reveal, 8, 6, pulse);
      leafBatch.setOpacity(fade);
      ringBatch.setTime(time);
      ringBatch.setParams(reveal, 2.4, width, pulse);
      ringBatch.setOpacity(fade);
    });
}

/**
   * Haz de hielo: columna azul con núcleo blanco, cristales incrustados que
   * giran, anillos de escarcha que viajan y una punta de cristales.
   */
export function spawnIceBeam(ctx: FxRuntime, x1: number,
    z1: number,
    x2: number,
    z2: number,
    color: readonly [number, number, number],
    width: number): void {
const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.max(0.1, Math.hypot(dx, dz));
    const root = new pc.Entity('ice-beam');
    root.setPosition(x1, 0.8, z1);
    root.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    ctx.app.root.addChild(root);

    const coreColor: [number, number, number] = [242, 252, 255];
    const mistColor: [number, number, number] = [225, 247, 255];
    const crystalColor: [number, number, number] = [205, 242, 255];
    const deepColor: [number, number, number] = [96, 176, 230];
    const reveal = 0.1;
    const lengthHalf = length / 2;
    const lateralHalf = width * 4;

    const crystalBatchLight = ctx.createIceCrystalMaterial(crystalColor, 0.66);
    const crystalBatchDeep = ctx.createIceCrystalMaterial(deepColor, 0.44);
    const crystalRing = ctx.createIceCrystalMaterial(crystalColor, 0.66);
    const materials = [crystalBatchLight, crystalBatchDeep, crystalRing];

    const beamMesh = pc.Mesh.fromGeometry(
      ctx.device,
      new pc.CylinderGeometry({
        radius: 0.5,
        height: 1,
        heightSegments: 1,
        capSegments: 14
      })
    );
    const bodyBatch = new EffectTintBatch({
      app: ctx.app,
      parent: root,
      mesh: beamMesh,
      instances: [
        { color, alpha: 0.26, anim0: [width * 2.1, width * 2.1, 0, 0] },
        { color: coreColor, alpha: 0.52, anim0: [width * 0.62, width * 0.62, 0, 0] }
      ],
      motion: MOTION_TINT_BEAM_CYLINDER,
      radius: length,
      life: 0.48,
      params: [reveal, 1, 0, 0],
      boundsCenter: [0, 0, lengthHalf],
      boundsHalf: [lateralHalf, lateralHalf, lengthHalf + width * 3]
    });

    // Cristales incrustados y de la punta: la misma malla y el mismo material,
    // con el tipo codificado en anim1.y.
    const lightCrystals: EffectBatchInstance[] = [];
    const deepCrystals: EffectBatchInstance[] = [];
    for (let index = 0; index < 12; index++) {
      const size = width * (0.5 + Math.random() * 0.35);
      const instance: EffectBatchInstance = {
        anim0: [
          (index + 0.5) / 12,
          (index / 12) * Math.PI * 2 + Math.random() * 0.4,
          width * (0.7 + Math.random() * 0.6),
          size
        ],
        anim1: [Math.random() * Math.PI * 2, 0, 0, 0]
      };
      if (index % 3 === 0) deepCrystals.push(instance);
      else lightCrystals.push(instance);
    }
    for (let index = 0; index < 3; index++) {
      const size = width * (0.7 + index * 0.15);
      const instance: EffectBatchInstance = {
        anim0: [0, (index / 3) * Math.PI * 2, 0, size],
        anim1: [0, 1, 0, 0]
      };
      if (index === 0) lightCrystals.push(instance);
      else deepCrystals.push(instance);
    }
    const crystalLightBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.iceCrystalMesh,
      material: crystalBatchLight,
      instances: lightCrystals,
      motion: MOTION_ICE_BEAM_CRYSTALS,
      radius: length,
      life: 0.48,
      params: [reveal, 1, width * 0.5, 0]
    });
    const crystalDeepBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.iceCrystalMesh,
      material: crystalBatchDeep,
      instances: deepCrystals,
      motion: MOTION_ICE_BEAM_CRYSTALS,
      radius: length,
      life: 0.48,
      params: [reveal, 1, width * 0.5, 0]
    });

    // Anillos de escarcha que viajan hacia la punta.
    const ringBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.torusMesh,
      material: crystalRing,
      instances: [0, 1, 2, 3].map((index) => ({
        anim0: [index, 0, 0, 0]
      })),
      motion: MOTION_TINT_BEAM_RINGS,
      radius: length,
      life: 0.48,
      params: [reveal, 2.2, width, 1]
    });

    // Neblina que gira alrededor de la columna.
    const mistInstances: TintEffectInstance[] = [];
    for (let index = 0; index < 5; index++) {
      mistInstances.push({
        color: mistColor,
        alpha: 0.2,
        anim0: [
          (index + 0.5) / 5,
          Math.random() * Math.PI * 2,
          width * (0.8 + Math.random() * 0.5),
          0
        ]
      });
    }
    const mistBatch = new EffectTintBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      instances: mistInstances,
      motion: MOTION_TINT_BEAM_MIST,
      radius: length,
      life: 0.48,
      params: [reveal, width, 0, 0],
      boundsCenter: [0, 0, lengthHalf],
      boundsHalf: [lateralHalf, lateralHalf, lengthHalf + width * 3]
    });

    let time = 0;
    ctx.addEffect(root, materials, 0.48, (_t, dt) => {
      time += dt;
      const fade = 1 - Math.max(0, (time - 0.28) / 0.2);
      const pulse = 0.86 + Math.random() * 0.14;

      bodyBatch.setTime(time);
      bodyBatch.setParams(reveal, pulse, 0, 0);
      bodyBatch.setOpacity(pulse * fade);
      crystalLightBatch.setTime(time);
      crystalLightBatch.setParams(reveal, pulse, width * 0.5, 0);
      crystalDeepBatch.setTime(time);
      crystalDeepBatch.setParams(reveal, pulse, width * 0.5, 0);
      ringBatch.setTime(time);
      ringBatch.setParams(reveal, 2.2, width, pulse);
      mistBatch.setTime(time);
      mistBatch.setOpacity(fade);

      crystalBatchLight.opacity = 0.66 * fade;
      crystalBatchDeep.opacity = 0.44 * fade;
      crystalRing.opacity = 0.66 * fade;
    });
}

/**
   * Haz de roca: una línea de estalagmitas que brota del suelo desde el
   * lanzador hasta el objetivo, con una grieta luminosa y polvo a lo largo del
   * recorrido. El daño lo resuelve la forma `beam` como cualquier haz.
   */
export function spawnRockBeam(ctx: FxRuntime, x1: number,
    z1: number,
    x2: number,
    z2: number,
    color: readonly [number, number, number],
    width: number): void {
const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.max(0.1, Math.hypot(dx, dz));
    const root = new pc.Entity('rock-beam');
    root.setPosition(x1, 0.02, z1);
    root.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    ctx.app.root.addChild(root);

    const ridgeMaterial = ctx.createWaterMaterial([92, 76, 58], 0.5);
    const crackMaterial = ctx.createWaterMaterial(color, 0.68);
    const lightMaterial = ctx.createRockMaterial([206, 184, 148], 1);
    const darkMaterial = ctx.createRockMaterial([126, 108, 86], 1);
    const materials = [ridgeMaterial, crackMaterial, lightMaterial, darkMaterial];

    const ridge = ctx.createEntity(ctx.boxMesh, [ridgeMaterial], root);
    ridge.setLocalPosition(0, 0.02, length / 2);
    ridge.setLocalScale(width * 3.4, 0.04, length);

    const glow = ctx.createEntity(ctx.boxMesh, [crackMaterial], root);
    glow.setLocalPosition(0, 0.06, length / 2);
    glow.setLocalScale(width * 1.4, 0.025, length);

    const spikeCount = Math.max(7, Math.round(length * 1.5));
    const lightSpikes: EffectBatchInstance[] = [];
    const darkSpikes: EffectBatchInstance[] = [];
    for (let index = 0; index < spikeCount; index++) {
      const t = (index + 0.5) / spikeCount;
      const height = width * (1.6 + Math.random() * 1.4);
      const spikeWidth = width * (0.7 + Math.random() * 0.5);
      const delay = t * 0.14;
      const instance: EffectBatchInstance = {
        anim0: [
          t * length,
          (index % 2 === 0 ? 1 : -1) * width * (0.25 + Math.random() * 0.8),
          height,
          spikeWidth
        ],
        anim1: [delay, (Math.random() - 0.5) * 18, Math.sin(delay * 20) * 30, 0]
      };
      if (index % 3 === 0) darkSpikes.push(instance);
      else lightSpikes.push(instance);
    }
    const lightSpikeBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.rockSpikeMesh,
      material: lightMaterial,
      instances: lightSpikes,
      motion: MOTION_ROCK_BEAM_SPIKES,
      radius: width
    });
    const darkSpikeBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.rockSpikeMesh,
      material: darkMaterial,
      instances: darkSpikes,
      motion: MOTION_ROCK_BEAM_SPIKES,
      radius: width
    });

    ctx.spawnSporeParticles(
      root,
      {
        z: length / 2,
        y: 0.12,
        extents: [width * 1.8, 0.1, length * 0.5],
        velocity: [0, 0.45, 0],
        velocityEnd: [0, 1.5, 0],
        radialSpeed: 0.5,
        radialSpeedEnd: 1.6,
        sizeStart: width * 0.8,
        sizeMid: width * 1.5,
        sizeEnd: width * 0.4,
        lifetime: 0.7,
        rate: 0.02,
        numParticles: 100,
        blendType: pc.BLEND_NORMAL,
        localSpace: true
      },
      [178, 160, 134],
      ctx.dustTexture
    );

    let time = 0;
    ctx.addEffect(root, materials, 0.62, (_t, dt) => {
      time += dt;
      const fade = Math.max(0, 1 - Math.max(0, time - 0.34) / 0.24);
      ridgeMaterial.opacity = 0.4 * fade;
      crackMaterial.opacity = (0.4 + Math.sin(time * 26) * 0.18) * fade;

      lightSpikeBatch.setTime(time);
      darkSpikeBatch.setTime(time);

      lightMaterial.opacity = 0.9 * fade;
      darkMaterial.opacity = 0.76 * fade;
    });
}
