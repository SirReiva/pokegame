import type { FxRuntime } from './fxRuntime';
import * as pc from 'playcanvas';
import { DEG } from '../../config';
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

    const mistMaterial = ctx.createWaterMaterial(color, 0.18);
    const bodyMaterial = ctx.createWaterMaterial(color, 0.42);
    const coreMaterial = ctx.createWaterMaterial([236, 252, 255], 0.95);
    const foamMaterial = ctx.createWaterMaterial([216, 245, 255], 0.55);
    const streakMaterial = ctx.createWaterMaterial([250, 255, 255], 0.9);
    const ringMaterial = ctx.createWaterMaterial([200, 240, 255], 0.7);
    const materials = [
      mistMaterial,
      bodyMaterial,
      coreMaterial,
      foamMaterial,
      streakMaterial,
      ringMaterial
    ];

    const mistWidth = Math.max(0.14, width * 3.2);
    const bodyWidth = Math.max(0.1, width * 1.8);
    const coreWidth = Math.max(0.06, width * 0.9);

    const sheath = ctx.createEntity(ctx.sphereMesh, [mistMaterial], root);
    const body = ctx.createEntity(ctx.sphereMesh, [bodyMaterial], root);
    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);

    // Bultos que viajan por el chorro: rompen la silueta del tubo y transmiten
    // la presión del agua.
    const bulges: {
      entity: pc.Entity;
      phase: number;
      speed: number;
      wobble: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 12; index++) {
      const bulge = ctx.createEntity(ctx.sphereMesh, [bodyMaterial], root);
      const size = bodyWidth * (0.55 + Math.random() * 0.3);
      bulge.setLocalScale(size, size, size * 1.6);
      bulges.push({
        entity: bulge,
        phase: Math.random(),
        speed: 2.1 + Math.random() * 1.1,
        wobble: 14 + Math.random() * 10,
        size
      });
    }

    // Vetas blancas rápidas dentro del núcleo, como agua a toda velocidad.
    const streaks: {
      entity: pc.Entity;
      phase: number;
      speed: number;
      x: number;
      y: number;
      length: number;
    }[] = [];
    for (let index = 0; index < 14; index++) {
      const streak = ctx.createEntity(ctx.boxMesh, [streakMaterial], root);
      streaks.push({
        entity: streak,
        phase: Math.random(),
        speed: 4.2 + Math.random() * 2.2,
        x: (Math.random() - 0.5) * coreWidth * 0.9,
        y: (Math.random() - 0.5) * coreWidth * 0.7,
        length: length * (0.06 + Math.random() * 0.06)
      });
    }

    // Espuma en la boca del lanzador.
    const foam: {
      entity: pc.Entity;
      size: number;
      phase: number;
      z: number;
    }[] = [];
    for (let index = 0; index < 4; index++) {
      const bubble = ctx.createEntity(ctx.sphereMesh, [foamMaterial], root);
      const size = bodyWidth * (0.5 + Math.random() * 0.45);
      bubble.setLocalScale(size, size, size);
      foam.push({
        entity: bubble,
        size,
        phase: Math.random() * Math.PI * 2,
        z: 0.02 + Math.random() * 0.35
      });
    }

    // Salpicadura en la punta: casquete, dos ondas y gotas.
    const cap = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    cap.setLocalPosition(0, 0, length);
    const capScale = Math.max(0.12, width * 1.7);
    cap.setLocalScale(capScale, capScale, capScale);

    const splashRings: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
      ring.setLocalEulerAngles(90, 0, 0);
      splashRings.push(ring);
    }

    const drops: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      size: number;
      phase: number;
      speed: number;
    }[] = [];
    for (let index = 0; index < 12; index++) {
      const drop = ctx.createEntity(ctx.sphereMesh, [foamMaterial], root);
      const size = width * (0.12 + Math.random() * 0.14);
      drop.setLocalScale(size, size, size);
      drops.push({
        entity: drop,
        angle: Math.random() * Math.PI * 2,
        distance: width * (1.4 + Math.random() * 2.6),
        rise: width * (1 + Math.random() * 2),
        size,
        phase: Math.random(),
        speed: 1.8 + Math.random() * 1.6
      });
    }

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
      // El chorro sale del lanzador en el primer tramo del efecto.
      const advance = Math.min(1, time / 0.09);
      const reveal = 1 - (1 - advance) * (1 - advance);
      const visibleLength = Math.max(0.04, length * reveal);

      sheath.setLocalPosition(0, 0, visibleLength / 2);
      sheath.setLocalScale(mistWidth, mistWidth, visibleLength);
      body.setLocalPosition(0, 0, visibleLength / 2);
      body.setLocalScale(bodyWidth, bodyWidth, visibleLength);
      core.setLocalPosition(0, 0, visibleLength / 2);
      core.setLocalScale(coreWidth, coreWidth, visibleLength);

      for (const bulge of bulges) {
        const phase = (bulge.phase + time * bulge.speed) % 1;
        const wobble = Math.sin(time * bulge.wobble + bulge.phase * 6.28);
        const size = bulge.size * (0.82 + wobble * 0.22);
        bulge.entity.setLocalPosition(
          Math.sin(time * 13 + bulge.phase * 6.28) * coreWidth * 0.7,
          Math.cos(time * 11 + bulge.phase * 6.28) * coreWidth * 0.5,
          phase * visibleLength
        );
        bulge.entity.setLocalScale(size, size, size * 1.6);
      }

      for (const streak of streaks) {
        const phase = (streak.phase + time * streak.speed) % 1;
        streak.entity.setLocalPosition(
          streak.x,
          streak.y,
          phase * visibleLength
        );
        streak.entity.setLocalScale(
          Math.max(0.02, width * 0.09),
          Math.max(0.02, width * 0.09),
          Math.max(0.04, streak.length)
        );
      }

      for (const bubble of foam) {
        const pulse = 0.8 + Math.sin(time * 34 + bubble.phase) * 0.28;
        const size = bubble.size * pulse;
        bubble.entity.setLocalPosition(
          Math.sin(time * 18 + bubble.phase) * bodyWidth * 0.28,
          Math.cos(time * 16 + bubble.phase) * bodyWidth * 0.22,
          bubble.z * reveal
        );
        bubble.entity.setLocalScale(size, size, size);
      }

      const tipZ = visibleLength;
      const capPulse = 0.9 + Math.sin(time * 46) * 0.18;
      cap.setLocalPosition(0, 0, tipZ);
      cap.setLocalScale(
        capScale * capPulse,
        capScale * capPulse,
        capScale * capPulse
      );

      splashRings.forEach((ring, index) => {
        const phase = (time * 2.6 + index * 0.5) % 1;
        const scale = Math.max(0.08, width * (1.6 + phase * 5));
        ring.setLocalPosition(0, 0, tipZ);
        ring.setLocalScale(scale, scale, scale);
      });

      for (const drop of drops) {
        const phase = (drop.phase + time * drop.speed) % 1;
        const distance = drop.distance * phase;
        drop.entity.setLocalPosition(
          Math.cos(drop.angle) * distance,
          Math.sin(phase * Math.PI) * drop.rise,
          tipZ + Math.sin(drop.angle) * distance * 0.55
        );
        const fade = Math.max(0, 1 - phase);
        drop.entity.setLocalScale(
          drop.size * fade,
          drop.size * fade,
          drop.size * fade
        );
      }

      const fade = 1 - Math.max(0, (time - 0.3) / 0.25);
      mistMaterial.opacity = 0.16 * fade;
      bodyMaterial.opacity = 0.4 * fade;
      coreMaterial.opacity = 0.92 * fade;
      foamMaterial.opacity = 0.5 * fade;
      streakMaterial.opacity = 0.82 * fade;
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
    color: readonly [number, number, number],
    width: number): void {
const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.max(0.1, Math.hypot(dx, dz));
    const root = new pc.Entity('fire-beam');
    root.setPosition(x1, 0.7, z1);
    root.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createMaterial([255, 226, 170], 0.5);
    const flameMaterial = ctx.createFlameMaterial([255, 255, 255], 0.5);
    const hotMaterial = ctx.createFlameMaterial([255, 242, 200], 0.55);
    const glowMaterial = ctx.createMaterial(color, 0.16);
    const materials = [coreMaterial, flameMaterial, hotMaterial, glowMaterial];

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
    const beamLight = ctx.createFireLight(
      root,
      0,
      0.8,
      length / 2,
      1.3,
      6.5
    );

    const coreWidth = Math.max(0.04, width * 0.28);
    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);

    // Lenguas tumbadas que se solapan a lo largo del chorro: son las que dan
    // la silueta irregular de fuego; el núcleo brillante solo las une.
    const licks: {
      entity: pc.Entity;
      baseWidth: number;
      baseHeight: number;
      phase: number;
      offsetZ: number;
      offsetX: number;
      offsetY: number;
      pitch: number;
      yaw: number;
      roll: number;
      vertical: boolean;
    }[] = [];
    const horizontalCount = Math.min(
      22,
      Math.max(6, Math.round(length / 0.8))
    );
    for (let index = 0; index < horizontalCount; index++) {
      const spread = ((index * 37) % 10) / 10;
      const baseWidth = width * (2.2 + spread * 1.5);
      const baseHeight = width * (4.2 + spread * 3.2);
      const pitch = index % 2 === 0 ? -90 : -72;
      // Yaw pequeño: las lenguas deben alargarse a lo largo del chorro, no
      // cruzándose en cualquier dirección.
      const yaw = ((index * 53) % 30) - 15;
      const roll = ((index * 71) % 90) - 45;
      const entity = ctx.createFlame(root, index % 3 === 0 ? hotMaterial : flameMaterial, {
        x: 0,
        y: 0,
        z: 0,
        width: baseWidth,
        height: baseHeight,
        pitch,
        yaw,
        roll
      });
      licks.push({
        entity,
        baseWidth,
        baseHeight,
        phase: index * 1.7,
        offsetZ: ((index + 0.5) / horizontalCount) * length,
        offsetX: Math.cos(index * 1.7) * width * 0.7,
        offsetY: Math.sin(index * 2.3) * width * 0.55,
        pitch,
        yaw,
        roll,
        vertical: false
      });
    }

    // Algunas llamas verticales sobre el chorro rompen la línea recta.
    const verticalCount = Math.min(8, Math.max(3, Math.round(length / 2.2)));
    for (let index = 0; index < verticalCount; index++) {
      const spread = ((index * 29) % 10) / 10;
      const baseWidth = width * (1.8 + spread * 1.4);
      const baseHeight = width * (3.4 + spread * 2.6);
      const yaw = (index * 67) % 360;
      licks.push({
        entity: ctx.createFlame(root, flameMaterial, {
          x: 0,
          y: 0,
          z: 0,
          width: baseWidth,
          height: baseHeight,
          yaw
        }),
        baseWidth,
        baseHeight,
        phase: index * 2.3 + 0.8,
        offsetZ: ((index + 0.5) / verticalCount) * length,
        offsetX: Math.cos(index * 2.1) * width * 1.1,
        offsetY: 0,
        pitch: 0,
        yaw,
        roll: 0,
        vertical: true
      });
    }

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
      // El chorro sale muy rápido: en el primer 18 % ya está casi entero.
      const reveal = Math.min(1, t / 0.18);
      const revealEase = 1 - (1 - reveal) * (1 - reveal);
      const visibleLength = length * revealEase;

      core.setLocalPosition(0, 0, visibleLength / 2);
      core.setLocalScale(
        coreWidth * 2,
        coreWidth * 2,
        Math.max(0.02, visibleLength)
      );

      for (const lick of licks) {
        if (lick.offsetZ > visibleLength) {
          lick.entity.setLocalScale(0, 0, 0);
          continue;
        }
        const pulse = 0.78 + Math.sin(time * 21 + lick.phase) * 0.24;
        const stretch = 0.86 + Math.sin(time * 17 + lick.phase * 1.3) * 0.22;
        const sway = Math.sin(time * 11 + lick.phase) * width * 0.55;
        const rise = Math.cos(time * 8 + lick.phase) * width * 0.55;
        const widthNow = lick.baseWidth * pulse;
        const heightNow = lick.baseHeight * stretch;
        lick.entity.setLocalPosition(
          lick.offsetX + sway,
          lick.offsetY + rise,
          lick.offsetZ
        );
        lick.entity.setLocalScale(widthNow, heightNow, widthNow);
        if (lick.vertical) {
          lick.entity.setLocalEulerAngles(
            0,
            lick.yaw + Math.sin(time * 6 + lick.phase) * 18,
            Math.sin(time * 13 + lick.phase) * 8
          );
        } else {
          lick.entity.setLocalEulerAngles(
            lick.pitch,
            lick.yaw + Math.sin(time * 9 + lick.phase) * 14,
            lick.roll + Math.sin(time * 15 + lick.phase) * 12
          );
        }
      }

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

      const fade = 1 - Math.max(0, (t - 0.45) / 0.55);
      coreMaterial.opacity = 0.4 * fade * (0.85 + Math.random() * 0.15);
      flameMaterial.opacity = (0.28 + Math.random() * 0.16) * fade;
      hotMaterial.opacity = (0.34 + Math.random() * 0.18) * fade;
      glowMaterial.opacity = 0.14 * fade * (0.7 + Math.random() * 0.3);
      beamLight.light!.intensity =
        1.3 * fade * (0.68 + Math.random() * 0.32);
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

    const bodyMaterial = ctx.createWaterMaterial(color, 0.24);
    const coreMaterial = ctx.createWaterMaterial(tintColor(color, 0.9), 0.52);
    const ribbonMaterial = ctx.createWaterMaterial(tintColor(color, 0.68), 0.48);
    const hotMaterial = ctx.createMaterial(color, 0.42);
    const ringMaterial = ctx.createMaterial(tintColor(color, 0.78), 0.42);
    const featherMaterial = ctx.createLeafMaterial(tintColor(color, 0.52), 0.78);
    const materials = [
      bodyMaterial,
      coreMaterial,
      ribbonMaterial,
      hotMaterial,
      ringMaterial,
      featherMaterial
    ];

    const beamMesh = pc.Mesh.fromGeometry(
      ctx.device,
      new pc.CylinderGeometry({
        radius: 0.5,
        height: 1,
        heightSegments: 1,
        capSegments: 14
      })
    );
    const body = ctx.createEntity(beamMesh, [bodyMaterial], root);
    const core = ctx.createEntity(beamMesh, [coreMaterial], root);
    body.setLocalEulerAngles(90, 0, 0);
    core.setLocalEulerAngles(90, 0, 0);

    const ribbons: {
      entity: pc.Entity;
      baseAngle: number;
      offset: number;
      radius: number;
    }[] = [];
    const segments = 14;
    for (let helix = 0; helix < 3; helix++) {
      for (let index = 0; index < segments; index++) {
        const ribbon = ctx.createEntity(
          ctx.boxMesh,
          [helix === 1 ? hotMaterial : ribbonMaterial],
          root
        );
        const t = (index + 1) / segments;
        ribbon.setLocalScale(width * 0.13, width * 0.13, width * 0.82);
        ribbons.push({
          entity: ribbon,
          baseAngle: (helix / 3) * Math.PI * 2,
          offset: t,
          radius: width * (1.05 + 0.12 * Math.sin(t * Math.PI))
        });
      }
    }

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 4; index++) {
      const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
      ring.setLocalEulerAngles(90, 0, 0);
      rings.push(ring);
    }

    const feathers: {
      entity: pc.Entity;
      angle: number;
      offset: number;
      size: number;
      phase: number;
    }[] = [];
    for (let index = 0; index < 6; index++) {
      const size = width * (0.5 + Math.random() * 0.25);
      const feather = ctx.createLeaf(root, featherMaterial, {
        x: 0,
        y: 0,
        z: length * 0.5,
        width: size,
        height: size * 2.1,
        yaw: Math.random() * 360
      });
      feathers.push({
        entity: feather,
        angle: (index / 6) * Math.PI * 2,
        offset: Math.random(),
        size,
        phase: Math.random() * Math.PI * 2
      });
    }

    let time = 0;
    ctx.addEffect(root, materials, 0.46, (_t, dt) => {
      time += dt;
      const reveal = 1 - Math.pow(1 - Math.min(1, time / 0.1), 2);
      const fade = 1 - Math.max(0, (time - 0.28) / 0.18);
      const pulse = 0.86 + Math.random() * 0.14;
      const visibleLength = Math.max(0.02, length * reveal);

      body.setLocalPosition(0, 0, visibleLength / 2);
      body.setLocalScale(
        width * 2 * pulse,
        visibleLength,
        width * 2 * pulse
      );
      core.setLocalPosition(0, 0, visibleLength / 2);
      core.setLocalScale(
        width * 0.58 * pulse,
        visibleLength,
        width * 0.58 * pulse
      );

      for (const ribbon of ribbons) {
        const z = ribbon.offset * visibleLength;
        const angle =
          ribbon.baseAngle + time * 7 + ribbon.offset * Math.PI * 5;
        ribbon.entity.setLocalPosition(
          Math.cos(angle) * ribbon.radius * (0.85 + pulse * 0.2),
          Math.sin(angle) * ribbon.radius * (0.85 + pulse * 0.2),
          z
        );
        ribbon.entity.setLocalEulerAngles(0, -angle / DEG, angle / DEG + 20);
      }

      for (let index = 0; index < rings.length; index++) {
        const ring = rings[index];
        const path = (time * 2.4 + index / rings.length) % 1;
        ring.setLocalPosition(0, 0, visibleLength * (0.08 + path * 0.92));
        const ringScale =
          width * (1.4 + Math.sin(path * Math.PI) * 1.1) * pulse;
        ring.setLocalScale(ringScale, ringScale, ringScale);
        ring.setLocalEulerAngles(90, 0, time * 180 + index * 40);
      }

      for (const feather of feathers) {
        const local = Math.min(1, time / 0.4);
        const angle = feather.angle + time * 3.2;
        feather.entity.setLocalPosition(
          Math.cos(angle) * width * (1.2 + local * 0.7),
          Math.sin(angle) * width * (1.2 + local * 0.7),
          feather.offset * visibleLength
        );
        feather.entity.setLocalEulerAngles(
          Math.sin(time * 9 + feather.phase) * 35,
          angle / DEG + time * 160,
          Math.cos(time * 8 + feather.phase) * 45
        );
        const scale = feather.size * Math.max(0, 1 - local * 0.7);
        feather.entity.setLocalScale(scale, scale * 2.1, scale);
      }

      bodyMaterial.opacity = 0.2 * pulse * fade;
      coreMaterial.opacity = 0.48 * pulse * fade;
      ribbonMaterial.opacity = 0.42 * fade;
      hotMaterial.opacity = 0.34 * fade;
      ringMaterial.opacity = 0.4 * fade;
      featherMaterial.opacity = 0.7 * fade;
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

    const bodyMaterial = ctx.createWaterMaterial(color, 0.22);
    const coreMaterial = ctx.createWaterMaterial([244, 255, 206], 0.5);
    const ringMaterial = ctx.createMaterial([214, 248, 160], 0.4);
    const leafMaterial = ctx.createLeafMaterial([226, 250, 184], 0.9);
    const hotLeafMaterial = ctx.createLeafMaterial([248, 255, 222], 0.9);
    const materials = [
      bodyMaterial,
      coreMaterial,
      ringMaterial,
      leafMaterial,
      hotLeafMaterial
    ];

    const beamMesh = pc.Mesh.fromGeometry(
      ctx.device,
      new pc.CylinderGeometry({
        radius: 0.5,
        height: 1,
        heightSegments: 1,
        capSegments: 14
      })
    );
    const body = ctx.createEntity(beamMesh, [bodyMaterial], root);
    const core = ctx.createEntity(beamMesh, [coreMaterial], root);
    body.setLocalEulerAngles(90, 0, 0);
    core.setLocalEulerAngles(90, 0, 0);

    // Tres hélices de hojas: cada una gira alrededor del eje del haz mientras
    // avanza a lo largo de la línea.
    const leaves: {
      entity: pc.Entity;
      angle: number;
      offset: number;
      size: number;
      phase: number;
    }[] = [];
    const segments = 14;
    for (let helix = 0; helix < 3; helix++) {
      for (let index = 0; index < segments; index++) {
        const size = width * (0.32 + Math.random() * 0.14);
        const leaf = ctx.createLeaf(
          root,
          helix === 1 ? hotLeafMaterial : leafMaterial,
          {
            x: 0,
            y: 0,
            z: 0,
            width: size,
            height: size * 1.8,
            yaw: Math.random() * 360
          }
        );
        leaves.push({
          entity: leaf,
          angle: (helix / 3) * Math.PI * 2,
          offset: (index + 1) / segments,
          size,
          phase: Math.random() * Math.PI * 2
        });
      }
    }

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 4; index++) {
      const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
      ring.setLocalEulerAngles(90, 0, 0);
      rings.push(ring);
    }

    let time = 0;
    ctx.addEffect(root, materials, 0.46, (_t, dt) => {
      time += dt;
      const reveal = 1 - Math.pow(1 - Math.min(1, time / 0.1), 2);
      const fade = 1 - Math.max(0, (time - 0.28) / 0.18);
      const pulse = 0.86 + Math.random() * 0.14;
      const visibleLength = Math.max(0.02, length * reveal);

      body.setLocalPosition(0, 0, visibleLength / 2);
      body.setLocalScale(
        width * 2 * pulse,
        visibleLength,
        width * 2 * pulse
      );
      core.setLocalPosition(0, 0, visibleLength / 2);
      core.setLocalScale(
        width * 0.58 * pulse,
        visibleLength,
        width * 0.58 * pulse
      );

      for (const leaf of leaves) {
        const z = leaf.offset * visibleLength;
        const angle = leaf.angle + time * 8 + leaf.offset * Math.PI * 6;
        const radius = width * (1.05 + Math.sin(leaf.offset * Math.PI) * 0.18);
        leaf.entity.setLocalPosition(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          z
        );
        leaf.entity.setLocalEulerAngles(
          Math.sin(time * 10 + leaf.phase) * 35,
          angle / DEG + time * 220,
          Math.cos(time * 8 + leaf.phase) * 45
        );
        const scale = leaf.size * (0.8 + pulse * 0.2);
        leaf.entity.setLocalScale(scale, scale * 1.8, scale);
      }

      for (let index = 0; index < rings.length; index++) {
        const ring = rings[index];
        const path = (time * 2.4 + index / rings.length) % 1;
        ring.setLocalPosition(0, 0, visibleLength * (0.08 + path * 0.92));
        const ringScale =
          width * (1.4 + Math.sin(path * Math.PI) * 1.1) * pulse;
        ring.setLocalScale(ringScale, ringScale, ringScale);
        ring.setLocalEulerAngles(90, 0, time * 180 + index * 40);
      }

      bodyMaterial.opacity = 0.2 * pulse * fade;
      coreMaterial.opacity = 0.48 * pulse * fade;
      ringMaterial.opacity = 0.4 * fade;
      leafMaterial.opacity = 0.82 * fade;
      hotLeafMaterial.opacity = 0.82 * fade;
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

    const bodyMaterial = ctx.createWaterMaterial(color, 0.3);
    const coreMaterial = ctx.createWaterMaterial([242, 252, 255], 0.56);
    const crystalMaterial = ctx.createIceCrystalMaterial(
      [205, 242, 255],
      0.86
    );
    const deepMaterial = ctx.createIceCrystalMaterial([96, 176, 230], 0.7);
    const mistMaterial = ctx.createWaterMaterial([225, 247, 255], 0.24);
    const materials = [
      bodyMaterial,
      coreMaterial,
      crystalMaterial,
      deepMaterial,
      mistMaterial
    ];

    const beamMesh = pc.Mesh.fromGeometry(
      ctx.device,
      new pc.CylinderGeometry({
        radius: 0.5,
        height: 1,
        heightSegments: 1,
        capSegments: 14
      })
    );
    const body = ctx.createEntity(beamMesh, [bodyMaterial], root);
    const core = ctx.createEntity(beamMesh, [coreMaterial], root);
    body.setLocalEulerAngles(90, 0, 0);
    core.setLocalEulerAngles(90, 0, 0);

    const crystals: {
      entity: pc.Entity;
      offset: number;
      angle: number;
      radius: number;
      size: number;
      phase: number;
    }[] = [];
    for (let index = 0; index < 12; index++) {
      const crystal = ctx.createEntity(
        ctx.iceCrystalMesh,
        [index % 3 === 0 ? deepMaterial : crystalMaterial],
        root
      );
      const size = width * (0.5 + Math.random() * 0.35);
      crystal.setLocalScale(size * 0.7, size * 1.9, size * 0.7);
      crystals.push({
        entity: crystal,
        offset: (index + 0.5) / 12,
        angle: (index / 12) * Math.PI * 2 + Math.random() * 0.4,
        radius: width * (0.7 + Math.random() * 0.6),
        size,
        phase: Math.random() * Math.PI * 2
      });
    }

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 4; index++) {
      const ring = ctx.createEntity(ctx.torusMesh, [crystalMaterial], root);
      ring.setLocalEulerAngles(90, 0, 0);
      rings.push(ring);
    }

    const tipCrystals: { entity: pc.Entity; angle: number; size: number }[] = [];
    for (let index = 0; index < 3; index++) {
      const size = width * (0.7 + index * 0.15);
      const crystal = ctx.createEntity(
        ctx.iceCrystalMesh,
        [index === 0 ? crystalMaterial : deepMaterial],
        root
      );
      crystal.setLocalScale(size * 0.65, size * 2, size * 0.65);
      tipCrystals.push({
        entity: crystal,
        angle: (index / 3) * Math.PI * 2,
        size
      });
    }

    const mist: { entity: pc.Entity; offset: number; angle: number; size: number }[] = [];
    for (let index = 0; index < 5; index++) {
      const size = width * (0.8 + Math.random() * 0.5);
      const puff = ctx.createEntity(ctx.sphereMesh, [mistMaterial], root);
      puff.setLocalScale(size, size * 0.7, size);
      mist.push({
        entity: puff,
        offset: (index + 0.5) / 5,
        angle: Math.random() * Math.PI * 2,
        size
      });
    }

    let time = 0;
    ctx.addEffect(root, materials, 0.48, (_t, dt) => {
      time += dt;
      const reveal = 1 - Math.pow(1 - Math.min(1, time / 0.1), 2);
      const fade = 1 - Math.max(0, (time - 0.28) / 0.2);
      const pulse = 0.86 + Math.random() * 0.14;
      const visibleLength = Math.max(0.02, length * reveal);

      body.setLocalPosition(0, 0, visibleLength / 2);
      body.setLocalScale(
        width * 2.1 * pulse,
        visibleLength,
        width * 2.1 * pulse
      );
      core.setLocalPosition(0, 0, visibleLength / 2);
      core.setLocalScale(
        width * 0.62 * pulse,
        visibleLength,
        width * 0.62 * pulse
      );

      for (const crystal of crystals) {
        const angle = crystal.angle + time * 4.5 + crystal.phase;
        const radius = crystal.radius * (0.85 + pulse * 0.25);
        crystal.entity.setLocalPosition(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          crystal.offset * visibleLength
        );
        crystal.entity.setLocalEulerAngles(
          time * 120 + crystal.phase * 40,
          angle / DEG,
          time * 80
        );
        const scale = crystal.size * (0.75 + Math.sin(time * 8 + crystal.phase) * 0.2);
        crystal.entity.setLocalScale(scale * 0.7, scale * 1.9, scale * 0.7);
      }

      for (let index = 0; index < rings.length; index++) {
        const ring = rings[index];
        const path = (time * 2.2 + index / rings.length) % 1;
        ring.setLocalPosition(0, 0, visibleLength * (0.08 + path * 0.92));
        const ringScale =
          width * (1.3 + Math.sin(path * Math.PI) * 1.1) * pulse;
        ring.setLocalScale(ringScale, ringScale, ringScale);
        ring.setLocalEulerAngles(90, 0, time * 160 + index * 45);
      }

      for (const tip of tipCrystals) {
        const angle = tip.angle + time * 3;
        tip.entity.setLocalPosition(
          Math.cos(angle) * width * 0.5,
          Math.sin(angle) * width * 0.5,
          visibleLength
        );
        tip.entity.setLocalEulerAngles(time * 160, angle / DEG, time * 90);
      }

      for (const puff of mist) {
        const angle = puff.angle + time * 2.4;
        puff.entity.setLocalPosition(
          Math.cos(angle) * width * 1.2,
          Math.sin(angle) * width * 0.8,
          puff.offset * visibleLength
        );
        const scale = puff.size * (0.7 + Math.sin(time * 5 + puff.angle) * 0.2) * fade;
        puff.entity.setLocalScale(scale, scale * 0.7, scale);
      }

      bodyMaterial.opacity = 0.26 * pulse * fade;
      coreMaterial.opacity = 0.52 * pulse * fade;
      crystalMaterial.opacity = 0.66 * fade;
      deepMaterial.opacity = 0.44 * fade;
      mistMaterial.opacity = 0.2 * fade;
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
    const spikes: {
      entity: pc.Entity;
      z: number;
      offset: number;
      height: number;
      width: number;
      delay: number;
      tilt: number;
    }[] = [];
    for (let index = 0; index < spikeCount; index++) {
      const t = (index + 0.5) / spikeCount;
      const height = width * (1.6 + Math.random() * 1.4);
      const spikeWidth = width * (0.7 + Math.random() * 0.5);
      const spike = ctx.createEntity(
        ctx.rockSpikeMesh,
        [index % 3 === 0 ? darkMaterial : lightMaterial],
        root
      );
      spike.setLocalScale(Math.max(0.001, spikeWidth), 0.001, Math.max(0.001, spikeWidth));
      spikes.push({
        entity: spike,
        z: t * length,
        offset: (index % 2 === 0 ? 1 : -1) * width * (0.25 + Math.random() * 0.8),
        height,
        width: spikeWidth,
        delay: t * 0.14,
        tilt: (Math.random() - 0.5) * 18
      });
    }

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

      for (const spike of spikes) {
        const local = Math.max(0, Math.min(1, (time - spike.delay) / 0.16));
        const pop = 1 - Math.pow(1 - local, 3);
        const height = spike.height * pop * fade;
        const spikeWidth = spike.width * (0.45 + pop * 0.55) * fade;
        spike.entity.setLocalScale(
          Math.max(0.001, spikeWidth),
          Math.max(0.001, height),
          Math.max(0.001, spikeWidth)
        );
        spike.entity.setLocalPosition(
          spike.offset,
          height * (pop - 0.5),
          spike.z
        );
        spike.entity.setLocalEulerAngles(
          spike.tilt * pop,
          Math.sin(spike.delay * 20) * 30,
          spike.tilt * 0.4 * pop
        );
      }

      lightMaterial.opacity = 0.9 * fade;
      darkMaterial.opacity = 0.76 * fade;
    });
}
