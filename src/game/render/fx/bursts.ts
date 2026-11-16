import type { FxRuntime } from './fxRuntime';
import * as pc from 'playcanvas';
import { DEG } from '../../config';
import { EffectBatch, MOTION_PSYCHIC_ORB_RINGS, MOTION_PSYCHIC_RAYS, MOTION_PSYCHIC_RIM, MOTION_PSYCHIC_SHELL, MOTION_PSYCHIC_SHARDS } from '../../effectBatch';
import type { EffectBatchInstance } from '../../effectBatch';
import { tintColor } from './fxGeometry';
import { polar } from './fxTrig';
import type { Polar } from './fxTrig';

/** Impacto de Planta: núcleo claro, hojas despedidas y anillo verde. */
export function spawnGrassBurst(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    _effectiveness: number): void {
const root = new pc.Entity('grass-burst');
    root.setPosition(x, 0.04, z);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createMaterial([236, 255, 208], 0.95);
    const ringMaterial = ctx.createMaterial(color, 0.5);
    const leafMaterial = ctx.createLeafMaterial(color, 0.95);
    const hotMaterial = ctx.createLeafMaterial([242, 255, 214], 0.95);
    const materials = [coreMaterial, ringMaterial, leafMaterial, hotMaterial];

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.68, 0);
    core.setLocalScale(0.28, 0.28, 0.28);

    const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.12, 0);
    ring.setLocalScale(0.5, 1, 0.5);

    ctx.spawnLeafParticles(
      root,
      {
        x: 0,
        y: 0.5,
        z: 0,
        extents: [0.16, 0.18, 0.16],
        velocity: [0, 1.4, 0],
        velocityEnd: [0, 2.2, 0],
        radialSpeed: 0.7,
        radialSpeedEnd: 1.7,
        sizeStart: 0.18,
        sizeMid: 0.3,
        sizeEnd: 0.16,
        lifetime: 0.42,
        rate: 0.02,
        numParticles: 26,
        localSpace: false
      },
      color
    );

    const leaves: (Polar & {
      entity: pc.Entity;
      dist: number;
      spin: number;
      size: number;
    })[] = [];
    for (let index = 0; index < 11; index++) {
      const angle = Math.random() * Math.PI * 2;
      const size = 0.2 + Math.random() * 0.16;
      const entity = ctx.createLeaf(
        root,
        index % 3 === 0 ? hotMaterial : leafMaterial,
        {
          x: Math.cos(angle) * 0.16,
          y: 0.55,
          z: Math.sin(angle) * 0.16,
          width: size,
          height: size * 1.75,
          yaw: Math.random() * 360,
          roll: Math.random() * 360
        }
      );
      leaves.push({
        entity,
        ...polar(angle),
        dist: 0.55 + Math.random() * 0.55,
        spin: 140 + Math.random() * 220,
        size
      });
    }

    ctx.addEffect(root, materials, 0.55, (t) => {
      const scale = 0.28 + t * 0.95;
      core.setLocalScale(scale, scale, scale);
      coreMaterial.opacity = 0.95 * (1 - t);

      const ringScale = 0.5 + t * 1.35;
      ring.setLocalScale(ringScale, 1, ringScale);
      ringMaterial.opacity = 0.5 * (1 - t);

      for (const leaf of leaves) {
        const distance = leaf.dist * (0.2 + t);
        leaf.entity.setLocalPosition(
          leaf.cos * distance,
          0.55 + t * 0.9 - t * t * 1.1,
          leaf.sin * distance
        );
        leaf.entity.setLocalEulerAngles(
          t * 180,
          leaf.spin * t,
          leaf.spin * 0.7 * t
        );
        const fade = Math.max(0, 1 - t * 1.15);
        leaf.entity.setLocalScale(
          leaf.size * fade,
          leaf.size * 1.75 * fade,
          leaf.size * fade
        );
      }
      leafMaterial.opacity = 0.95 * (1 - t);
      hotMaterial.opacity = 0.95 * (1 - t);
    });
}

/** Impacto de agua: salpicadura con núcleo, ondas y gotas radiales. */
export function spawnWaterBurst(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    _effectiveness: number): void {
const root = new pc.Entity('water-burst');
    root.setPosition(x, 0.04, z);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createWaterMaterial([234, 251, 255], 0.95);
    const bodyMaterial = ctx.createWaterMaterial(color, 0.6);
    const ringMaterial = ctx.createWaterMaterial([205, 240, 255], 0.75);
    const dropMaterial = ctx.createWaterMaterial([224, 248, 255], 0.85);
    const materials = [coreMaterial, bodyMaterial, ringMaterial, dropMaterial];

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.62, 0);
    core.setLocalScale(0.24, 0.24, 0.24);

    const body = ctx.createEntity(ctx.sphereMesh, [bodyMaterial], root);
    body.setLocalPosition(0, 0.55, 0);
    body.setLocalScale(0.4, 0.34, 0.4);

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.1 + index * 0.06, 0);
      ring.setLocalScale(0.4, 1, 0.4);
      rings.push(ring);
    }

    const drops: (Polar & {
      entity: pc.Entity;
      distance: number;
      height: number;
      size: number;
      delay: number;
    })[] = [];
    for (let index = 0; index < 12; index++) {
      const drop = ctx.createEntity(ctx.sphereMesh, [dropMaterial], root);
      const size = 0.07 + Math.random() * 0.06;
      drop.setLocalScale(size, size, size);
      drops.push({
        entity: drop,
        ...polar(Math.random() * Math.PI * 2),
        distance: 0.55 + Math.random() * 0.7,
        height: 0.45 + Math.random() * 0.55,
        size,
        delay: Math.random() * 0.08
      });
    }

    ctx.addEffect(root, materials, 0.5, (t) => {
      const local = Math.min(1, Math.max(0, t));
      const ease = 1 - Math.pow(1 - local, 3);
      const coreScale = 0.24 + ease * 0.55;
      core.setLocalScale(coreScale, coreScale, coreScale);
      core.setLocalPosition(0, 0.62 + ease * 0.12, 0);
      coreMaterial.opacity = 0.95 * (1 - local);

      body.setLocalScale(
        0.4 + ease * 0.5,
        0.34 + ease * 0.4,
        0.4 + ease * 0.5
      );
      bodyMaterial.opacity = 0.55 * (1 - local);

      rings.forEach((ring, index) => {
        const ringT = Math.min(1, Math.max(0, (t - index * 0.06) / 0.32));
        const ringEase = 1 - Math.pow(1 - ringT, 2);
        const scale = 0.35 + ringEase * 1.5;
        ring.setLocalScale(scale, 1, scale);
        ring.setLocalPosition(0, 0.1 + ringEase * 0.18, 0);
      });
      ringMaterial.opacity = 0.7 * (1 - local);

      for (const drop of drops) {
        const dropT = Math.min(
          1,
          Math.max(0, (t - drop.delay) / 0.38)
        );
        const distance = drop.distance * (0.15 + dropT);
        const rise = Math.sin(dropT * Math.PI) * drop.height;
        drop.entity.setLocalPosition(
          drop.cos * distance,
          0.28 + rise,
          drop.sin * distance
        );
        const fade = Math.max(0, 1 - dropT);
        const size = drop.size * fade;
        drop.entity.setLocalScale(size, size, size);
      }
      dropMaterial.opacity = 0.85 * (1 - local);
    });
}

/**
   * Impacto psíquico: el objetivo queda envuelto en una esfera mental
   * translúcida. Dentro giran aros blancos deformados en el vertex shader —el
   * motivo central de la animación de Psíquico en los juegos principales— y
   * del núcleo salen rayos y esquirlas de energía.
   *
   * La esfera, los aros, los rayos y las esquirlas son lotes instanciados: el
   * update solo avanza `uEffectTime`.
   */
export function spawnPsychicBurst(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    _effectiveness: number): void {
const life = 0.68;
    const centerY = 0.9;
    const shellDiameter = 1.95;
    const root = new pc.Entity('psychic-burst');
    root.setPosition(x, 0.04, z);
    ctx.app.root.addChild(root);

    const shellMaterial = ctx.createShieldMaterial(
      color,
      0.2,
      pc.BLEND_NORMAL
    );
    const haloMaterial = ctx.createShieldMaterial(
      [255, 210, 255],
      0.1,
      pc.BLEND_ADDITIVEALPHA
    );
    const coreMaterial = ctx.createMaterial([255, 244, 255], 0.85);
    const ringMaterial = ctx.createMaterial([255, 232, 255], 0.7);
    const rimMaterial = ctx.createShieldMaterial(
      color,
      0.95,
      pc.BLEND_NORMAL
    );
    const rimEdgeMaterial = ctx.createMaterial([255, 246, 255], 0.95);
    const rayMaterial = ctx.createMaterial([255, 226, 255], 0.8);
    const shardMaterial = ctx.createMaterial([246, 198, 255], 0.9);
    const materials = [
      shellMaterial,
      haloMaterial,
      coreMaterial,
      ringMaterial,
      rimMaterial,
      rimEdgeMaterial,
      rayMaterial,
      shardMaterial
    ];

    // Esfera translúcida y su halo. El núcleo comparte la misma animación de
    // crecimiento, con otro diámetro y un fundido más corto.
    const shellBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: shellMaterial,
      instances: [{ anim0: [shellDiameter, 0, 0.14, 0] }],
      motion: MOTION_PSYCHIC_SHELL,
      life,
      params: [centerY, 0.26, 0, 0]
    });
    const haloBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: haloMaterial,
      instances: [{ anim0: [shellDiameter * 1.06, 0, 0.14, 0] }],
      motion: MOTION_PSYCHIC_SHELL,
      life,
      params: [centerY, 0.26, 0, 0]
    });
    const coreBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: coreMaterial,
      instances: [{ anim0: [0.42, 0, 0.18, 0.3] }],
      motion: MOTION_PSYCHIC_SHELL,
      life,
      params: [centerY, 0.32, 0, 0]
    });

    // Aros concéntricos que miran a cámara, con pequeños desplazamientos para
    // que no queden perfectamente centrados, como en la referencia.
    const ringDefs = [
      { size: 1.85, offsetX: 0, offsetY: 0, spin: 14, delay: 0.02 },
      { size: 1.6, offsetX: 0.05, offsetY: 0.03, spin: -18, delay: 0.05 },
      { size: 1.38, offsetX: -0.04, offsetY: -0.02, spin: 22, delay: 0.08 },
      { size: 1.12, offsetX: 0.03, offsetY: -0.05, spin: -26, delay: 0.04 },
      { size: 0.88, offsetX: -0.02, offsetY: 0.04, spin: 24, delay: 0.1 }
    ];
    const ringInstances: EffectBatchInstance[] = ringDefs.map(
      (def, index) => ({
        anim0: [def.offsetX, def.offsetY, def.size, def.delay],
        anim1: [def.spin, index * 1.7, 0, 0]
      })
    );
    const ringBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.psychicRingMesh,
      material: ringMaterial,
      instances: ringInstances,
      motion: MOTION_PSYCHIC_ORB_RINGS,
      life,
      params: [centerY, 0, 0.035, 0]
    });

    // Aro exterior: el borde magenta con filo blanco que enmarca la esfera en
    // la referencia. El toro grueso y el aro fino comparten la animación de la
    // esfera, así que crecen y se apagan con ella.
    const rimBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.torusMesh,
      material: rimMaterial,
      instances: [{ anim0: [2.05, 0, 0.14, 0] }],
      motion: MOTION_PSYCHIC_RIM,
      life,
      params: [centerY, 0.26, 0, 0]
    });
    const rimEdgeBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.psychicRingMesh,
      material: rimEdgeMaterial,
      instances: [{ anim0: [2.05, 0, 0.14, 0] }],
      motion: MOTION_PSYCHIC_RIM,
      life,
      params: [centerY, 0.26, 0, 0]
    });

    // Rayos que salen del núcleo, como los destellos blancos de la referencia.
    const rayInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 12; index++) {
      rayInstances.push({
        anim0: [
          (index / 12) * Math.PI * 2 + Math.random() * 0.22,
          0.85 + Math.random() * 0.55,
          (Math.random() - 0.5) * 0.5,
          Math.random() * 0.04
        ],
        anim1: [0.014 + Math.random() * 0.018, 0, 0, 0]
      });
    }
    const rayBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: rayMaterial,
      instances: rayInstances,
      motion: MOTION_PSYCHIC_RAYS,
      life,
      params: [centerY, 0, 0, 0]
    });

    const shardInstances: EffectBatchInstance[] = [];
    const shardCount = 34;
    for (let index = 0; index < shardCount; index++) {
      shardInstances.push({
        anim0: [
          Math.random() * Math.PI * 2,
          0.2 + Math.random() * 0.85,
          0.35 + Math.random() * 0.65,
          Math.random() * 0.08
        ],
        anim1: [
          0.32 + Math.random() * 0.22,
          0.035 + Math.random() * 0.05,
          Math.random() * Math.PI * 2,
          0
        ]
      });
    }
    const shardBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: shardMaterial,
      instances: shardInstances,
      motion: MOTION_PSYCHIC_SHARDS,
      radius: 1.05,
      life
    });

    ctx.addEffect(root, materials, life, (t) => {
      const now = t * life;
      shellBatch.setTime(now);
      haloBatch.setTime(now);
      coreBatch.setTime(now);
      ringBatch.setTime(now);
      rimBatch.setTime(now);
      rimEdgeBatch.setTime(now);
      rayBatch.setTime(now);
      shardBatch.setTime(now);
    });
}

/** Impacto de Veneno: orbe turbio con burbujas que suben y anillo violeta. */
export function spawnPoisonBurst(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    _effectiveness: number): void {
const root = new pc.Entity('poison-burst');
    root.setPosition(x, 0.04, z);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createMaterial(color, 0.9);
    const ringMaterial = ctx.createMaterial([190, 116, 206], 0.5);
    const puffMaterial = ctx.createMaterial([232, 186, 244], 0.24);
    const materials = [coreMaterial, ringMaterial, puffMaterial];

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.68, 0);
    core.setLocalScale(0.34, 0.34, 0.34);

    const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.12, 0);
    ring.setLocalScale(0.5, 1, 0.5);

    ctx.spawnSporeParticles(
      root,
      {
        x: 0,
        y: 0.55,
        z: 0,
        extents: [0.22, 0.2, 0.22],
        velocity: [0, 0.9, 0],
        velocityEnd: [0, 1.8, 0],
        radialSpeed: 0.5,
        radialSpeedEnd: 1.3,
        sizeStart: 0.16,
        sizeMid: 0.28,
        sizeEnd: 0.12,
        lifetime: 0.45,
        rate: 0.02,
        numParticles: 28,
        localSpace: false
      },
      color
    );

    const bubbles: {
      entity: pc.Entity;
      baseX: number;
      baseZ: number;
      size: number;
      delay: number;
    }[] = [];
    for (let index = 0; index < 6; index++) {
      const angle = (index / 6) * Math.PI * 2 + Math.random();
      const size = 0.16 + Math.random() * 0.14;
      const bubble = ctx.createEntity(ctx.sphereMesh, [puffMaterial], root);
      bubble.setLocalScale(size, size, size);
      bubbles.push({
        entity: bubble,
        baseX: Math.cos(angle) * 0.28,
        baseZ: Math.sin(angle) * 0.28,
        size,
        delay: Math.random() * 0.2
      });
    }

    ctx.addEffect(root, materials, 0.5, (t) => {
      const scale = 0.34 + t * 1.05;
      core.setLocalScale(scale, scale, scale);
      coreMaterial.opacity = 0.9 * (1 - t);

      const ringScale = 0.5 + t * 1.4;
      ring.setLocalScale(ringScale, 1, ringScale);
      ringMaterial.opacity = 0.5 * (1 - t);
      puffMaterial.opacity = 0.26 * (1 - t);

      for (const bubble of bubbles) {
        const local = Math.max(0, (t - bubble.delay) / (1 - bubble.delay));
        bubble.entity.setLocalPosition(
          bubble.baseX * (1 + local * 0.9),
          0.5 + local * 0.9,
          bubble.baseZ * (1 + local * 0.9)
        );
        const fade = Math.max(0, 1 - local);
        bubble.entity.setLocalScale(
          bubble.size * (0.7 + local * 0.6) * fade,
          bubble.size * (0.7 + local * 0.6) * fade,
          bubble.size * (0.7 + local * 0.6) * fade
        );
      }
    });
}

/**
   * Impacto de aire: destello blanco, tres ondas que se abren, seis ráfagas de
   * viento que salen en círculo y plumas que suben y caen. El cuerpo cálido usa
   * mezcla normal para no lavarse sobre el terreno claro.
   */
export function spawnAirBurst(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number): void {
const root = new pc.Entity('air-burst');
    root.setPosition(x, 0, z);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createMaterial(tintColor(color, 0.92), 0.92);
    const glowMaterial = ctx.createWaterMaterial(color, 0.3);
    const ringMaterial = ctx.createMaterial(tintColor(color, 0.78), 0.55);
    const bladeMaterial = ctx.createWaterMaterial(tintColor(color, 0.68), 0.66);
    const featherMaterial = ctx.createLeafMaterial(tintColor(color, 0.52), 0.85);
    const materials = [
      coreMaterial,
      glowMaterial,
      ringMaterial,
      bladeMaterial,
      featherMaterial
    ];
    const power = effectiveness > 1 ? 1.24 : effectiveness < 1 ? 0.86 : 1;

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.62, 0);
    const glow = ctx.createEntity(ctx.sphereMesh, [glowMaterial], root);
    glow.setLocalPosition(0, 0.62, 0);

    const rings: pc.Entity[] = [];
    const ringMesh = ctx.cachedArcBand(0.955, 1, Math.PI, 64);
    for (let index = 0; index < 3; index++) {
      const ring = ctx.createEntity(ringMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.1 + index * 0.02, 0);
      rings.push(ring);
    }

    const blades: (Polar & {
      entity: pc.Entity;
      angle: number;
      size: number;
      delay: number;
    })[] = [];
    for (let index = 0; index < 6; index++) {
      const angle = (index / 6) * Math.PI * 2 + 0.3;
      const blade = ctx.createEntity(
        ctx.cachedWindBlade(0.55, 1.15, 0.16, 10),
        [bladeMaterial],
        root
      );
      blade.setLocalEulerAngles(90, angle / DEG, 0);
      blades.push({
        entity: blade,
        ...polar(angle),
        angle,
        size: 0.9 + ((index * 7) % 10) / 10 * 0.3,
        delay: index * 0.012
      });
    }

    const feathers: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      lift: number;
      size: number;
      phase: number;
    }[] = [];
    for (let index = 0; index < 8; index++) {
      const angle = (index / 8) * Math.PI * 2 + Math.random() * 0.4;
      const size = 0.12 + Math.random() * 0.09;
      const feather = ctx.createLeaf(root, featherMaterial, {
        x: Math.cos(angle) * 0.22,
        y: 0.45,
        z: Math.sin(angle) * 0.22,
        width: size,
        height: size * 2.2,
        yaw: angle / DEG
      });
      feathers.push({
        entity: feather,
        angle,
        distance: (0.5 + Math.random() * 0.6) * power,
        lift: 0.5 + Math.random() * 0.55,
        size,
        phase: Math.random() * Math.PI * 2
      });
    }

    ctx.addEffect(root, materials, 0.52, (t) => {
      const ease = 1 - Math.pow(1 - t, 3);
      const flash = Math.max(0, 1 - t / 0.35);
      const coreScale = (0.14 + ease * 0.85) * power;
      core.setLocalScale(coreScale, coreScale, coreScale);
      coreMaterial.opacity = 0.92 * flash;
      const glowScale = (0.18 + ease * 1.85) * power;
      glow.setLocalScale(glowScale, glowScale, glowScale);
      glowMaterial.opacity = 0.28 * (1 - t);

      for (let index = 0; index < rings.length; index++) {
        const ring = rings[index];
        const scale = (0.3 + ease * (2.2 + index * 0.45)) * power;
        ring.setLocalScale(scale, 1, scale);
        ring.setLocalEulerAngles(0, index * 40 + t * 30, 0);
      }
      ringMaterial.opacity = 0.44 * (1 - t);

      for (const blade of blades) {
        const local = Math.max(0, Math.min(1, (t - blade.delay) / 0.8));
        const distance = (0.1 + local * 1.85) * power;
        blade.entity.setLocalPosition(
          blade.cos * distance,
          0.18 + local * 0.55,
          blade.sin * distance
        );
        const fade = Math.max(0, 1 - local);
        const scale = blade.size * fade * (0.7 + local * 0.8);
        blade.entity.setLocalScale(scale, scale, scale);
        blade.entity.setLocalEulerAngles(
          90,
          blade.angle / DEG + local * 210,
          Math.sin(local * 9 + blade.angle) * 22
        );
      }

      // El avance de las plumas es común: solo el ángulo base cambia por pluma.
      const featherLocal = Math.min(1, Math.max(0, (t - 0.03) / 0.85));
      const featherEase = 1 - Math.pow(1 - featherLocal, 2);
      const featherArc = Math.sin(featherLocal * Math.PI);
      const featherFade = Math.max(0, 1 - featherLocal);
      for (const feather of feathers) {
        const distance = feather.distance * featherEase;
        const angle = feather.angle + featherLocal * 1.5;
        const y =
          0.45 + feather.lift * featherArc - featherLocal * featherLocal * 0.5;
        feather.entity.setLocalPosition(
          Math.cos(angle) * distance,
          Math.max(0.05, y),
          Math.sin(angle) * distance
        );
        feather.entity.setLocalScale(
          feather.size * featherFade,
          feather.size * 2.2 * featherFade,
          feather.size * featherFade
        );
        feather.entity.setLocalEulerAngles(
          featherLocal * 80,
          angle / DEG + featherLocal * 180,
          Math.sin(featherLocal * 7 + feather.phase) * 55
        );
      }

      bladeMaterial.opacity = 0.66 * (1 - t);
      featherMaterial.opacity = 0.8 * (1 - t);
    });
}

/**
   * Impacto de hielo: destello blanco, cuerpo azul, dos ondas de escarcha,
   * esquirlas que salen despedidas y copos que flotan. El azul usa mezcla
   * normal para leerse sobre cualquier terreno.
   */
export function spawnIceBurst(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number): void {
const root = new pc.Entity('ice-burst');
    root.setPosition(x, 0, z);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createMaterial([240, 252, 255], 0.92);
    const bodyMaterial = ctx.createWaterMaterial(color, 0.4);
    const ringMaterial = ctx.createMaterial([180, 238, 255], 0.5);
    const shardMaterial = ctx.createIceCrystalMaterial(
      [210, 245, 255],
      0.88
    );
    const deepMaterial = ctx.createIceCrystalMaterial([92, 172, 228], 0.74);
    const snowMaterial = ctx.createWaterMaterial([226, 248, 255], 0.32);
    const materials = [
      coreMaterial,
      bodyMaterial,
      ringMaterial,
      shardMaterial,
      deepMaterial,
      snowMaterial
    ];
    const power = effectiveness > 1 ? 1.24 : effectiveness < 1 ? 0.86 : 1;

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.6, 0);
    const body = ctx.createEntity(ctx.sphereMesh, [bodyMaterial], root);
    body.setLocalPosition(0, 0.6, 0);

    const rings: pc.Entity[] = [];
    const ringMesh = ctx.cachedArcBand(0.955, 1, Math.PI, 64);
    for (let index = 0; index < 2; index++) {
      const ring = ctx.createEntity(ringMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.1 + index * 0.03, 0);
      rings.push(ring);
    }

    const shards: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      lift: number;
      size: number;
      delay: number;
      spin: number;
    }[] = [];
    for (let index = 0; index < 9; index++) {
      const angle = (index / 9) * Math.PI * 2 + Math.random() * 0.4;
      const size = 0.12 + Math.random() * 0.12;
      const shard = ctx.createEntity(
        ctx.iceCrystalMesh,
        [index % 3 === 0 ? deepMaterial : shardMaterial],
        root
      );
      shard.setLocalPosition(0, 0.55, 0);
      shard.setLocalScale(size * 0.7, size * 1.8, size * 0.7);
      shards.push({
        entity: shard,
        angle,
        distance: (0.5 + Math.random() * 0.8) * power,
        lift: 0.5 + Math.random() * 0.7,
        size,
        delay: index * 0.012,
        spin: (Math.random() - 0.5) * 540
      });
    }

    const snow: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      size: number;
      delay: number;
    }[] = [];
    for (let index = 0; index < 6; index++) {
      const angle = (index / 6) * Math.PI * 2 + Math.random() * 0.5;
      const size = 0.14 + Math.random() * 0.12;
      const puff = ctx.createEntity(ctx.sphereMesh, [snowMaterial], root);
      puff.setLocalPosition(0, 0.45, 0);
      puff.setLocalScale(size, size, size);
      snow.push({
        entity: puff,
        angle,
        distance: (0.35 + Math.random() * 0.55) * power,
        rise: 0.35 + Math.random() * 0.45,
        size,
        delay: Math.random() * 0.08
      });
    }

    ctx.addEffect(root, materials, 0.54, (t) => {
      const ease = 1 - Math.pow(1 - t, 3);
      const flash = Math.max(0, 1 - t / 0.32);
      const coreScale = (0.12 + ease * 0.72) * power;
      core.setLocalScale(coreScale, coreScale, coreScale);
      coreMaterial.opacity = 0.92 * flash;
      const bodyScale = (0.18 + ease * 1.25) * power;
      body.setLocalScale(bodyScale, bodyScale, bodyScale);
      bodyMaterial.opacity = 0.36 * (1 - t);

      for (let index = 0; index < rings.length; index++) {
        const ring = rings[index];
        const scale = (0.3 + ease * (2 + index * 0.4)) * power;
        ring.setLocalScale(scale, 1, scale);
        ring.setLocalEulerAngles(0, t * 40 + index * 30, 0);
      }
      ringMaterial.opacity = 0.48 * (1 - t);

      for (const shard of shards) {
        const local = Math.max(0, Math.min(1, (t - shard.delay) / 0.82));
        const distance = shard.distance * local;
        const angle = shard.angle + local * 0.7;
        const y =
          0.55 + shard.lift * Math.sin(local * Math.PI) - local * local * 0.7;
        shard.entity.setLocalPosition(
          Math.cos(angle) * distance,
          Math.max(0.05, y),
          Math.sin(angle) * distance
        );
        const fade = Math.max(0, 1 - local);
        shard.entity.setLocalScale(
          shard.size * 0.7 * fade,
          shard.size * 1.8 * fade,
          shard.size * 0.7 * fade
        );
        shard.entity.setLocalEulerAngles(
          local * 120,
          angle / DEG + local * 240,
          local * shard.spin
        );
      }

      for (const puff of snow) {
        const local = Math.max(0, Math.min(1, (t - puff.delay) / 0.9));
        const angle = puff.angle + local * 1.1;
        const distance = puff.distance * local;
        puff.entity.setLocalPosition(
          Math.cos(angle) * distance,
          0.35 + local * puff.rise,
          Math.sin(angle) * distance
        );
        const fade = Math.max(0, 1 - local);
        const scale = puff.size * (0.7 + local * 0.9) * fade;
        puff.entity.setLocalScale(scale, scale, scale);
      }

      shardMaterial.opacity = 0.72 * (1 - t);
      deepMaterial.opacity = 0.5 * (1 - t);
      snowMaterial.opacity = 0.28 * (1 - t);
    });
}

/**
   * Impacto de roca: núcleo claro, dos ondas de polvo, esquirlas que salen
   * despedidas y grietas radiales en el suelo. La mezcla normal mantiene el
   * marrón legible sobre hierba, arena o asfalto.
   */
export function spawnRockBurst(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number): void {
const root = new pc.Entity('rock-burst');
    root.setPosition(x, 0, z);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createMaterial([244, 232, 208], 0.78);
    const dustMaterial = ctx.createWaterMaterial([178, 158, 128], 0.33);
    const ringMaterial = ctx.createWaterMaterial(color, 0.48);
    const crackMaterial = ctx.createWaterMaterial([116, 100, 80], 0.55);
    const lightMaterial = ctx.createRockMaterial([206, 186, 150], 1);
    const darkMaterial = ctx.createRockMaterial([122, 106, 86], 1);
    const materials = [
      coreMaterial,
      dustMaterial,
      ringMaterial,
      crackMaterial,
      lightMaterial,
      darkMaterial
    ];
    const power = effectiveness > 1 ? 1.24 : effectiveness < 1 ? 0.86 : 1;

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.5, 0);

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.08 + index * 0.03, 0);
      rings.push(ring);
    }

    const cracks: pc.Entity[] = [];
    for (let index = 0; index < 7; index++) {
      const angle = (index / 7) * Math.PI * 2 + Math.random() * 0.4;
      const length = (0.55 + Math.random() * 0.75) * power;
      const crack = ctx.createEntity(ctx.boxMesh, [crackMaterial], root);
      crack.setLocalPosition(
        Math.sin(angle) * length * 0.5,
        0.035,
        Math.cos(angle) * length * 0.5
      );
      crack.setLocalEulerAngles(0, angle / DEG, 0);
      crack.setLocalScale(0.05 + Math.random() * 0.05, 0.02, length);
      cracks.push(crack);
    }

    const shards: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      lift: number;
      size: number;
      delay: number;
      spin: number;
    }[] = [];
    for (let index = 0; index < 9; index++) {
      const angle = (index / 9) * Math.PI * 2 + Math.random() * 0.4;
      const size = 0.16 + Math.random() * 0.16;
      const shard = ctx.createEntity(
        ctx.rockSpikeMesh,
        [index % 3 === 0 ? darkMaterial : lightMaterial],
        root
      );
      shard.setLocalPosition(0, 0.5, 0);
      shard.setLocalScale(size * 0.8, size * 1.7, size * 0.8);
      shards.push({
        entity: shard,
        angle,
        distance: (0.55 + Math.random() * 0.9) * power,
        lift: 0.55 + Math.random() * 0.8,
        size,
        delay: index * 0.012,
        spin: (Math.random() - 0.5) * 620
      });
    }

    const puffs: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      size: number;
      delay: number;
    }[] = [];
    for (let index = 0; index < 7; index++) {
      const angle = (index / 7) * Math.PI * 2 + Math.random() * 0.5;
      const size = 0.18 + Math.random() * 0.16;
      const puff = ctx.createEntity(ctx.sphereMesh, [dustMaterial], root);
      puff.setLocalPosition(0, 0.35, 0);
      puff.setLocalScale(size, size * 0.7, size);
      puffs.push({
        entity: puff,
        angle,
        distance: (0.35 + Math.random() * 0.7) * power,
        rise: 0.35 + Math.random() * 0.55,
        size,
        delay: Math.random() * 0.08
      });
    }

    ctx.spawnSporeParticles(
      root,
      {
        y: 0.12,
        extents: [0.35, 0.08, 0.35],
        velocity: [0, 0.45, 0],
        velocityEnd: [0, 1.6, 0],
        radialSpeed: 1.1,
        radialSpeedEnd: 2.4,
        sizeStart: 0.12,
        sizeMid: 0.2,
        sizeEnd: 0.06,
        lifetime: 0.6,
        rate: 0.03,
        numParticles: 50,
        blendType: pc.BLEND_NORMAL
      },
      [176, 158, 130],
      ctx.dustTexture
    );

    ctx.addEffect(root, materials, 0.54, (t) => {
      const ease = 1 - Math.pow(1 - t, 3);
      const flash = Math.max(0, 1 - t / 0.3);
      const coreScale = (0.14 + ease * 0.7) * power;
      core.setLocalScale(coreScale, coreScale, coreScale);
      coreMaterial.opacity = 0.7 * flash;

      for (let index = 0; index < rings.length; index++) {
        const ring = rings[index];
        const scale = (0.3 + ease * (1.9 + index * 0.5)) * power;
        ring.setLocalScale(scale, 1, scale);
        ring.setLocalEulerAngles(0, t * 55 + index * 25, 0);
      }
      ringMaterial.opacity = 0.42 * (1 - t);
      crackMaterial.opacity = 0.5 * (1 - t * 0.85);

      for (const shard of shards) {
        const local = Math.max(0, Math.min(1, (t - shard.delay) / 0.8));
        const distance = shard.distance * local;
        const angle = shard.angle + local * 0.55;
        const y =
          0.5 + shard.lift * Math.sin(local * Math.PI) - local * local * 0.75;
        shard.entity.setLocalPosition(
          Math.sin(angle) * distance,
          Math.max(0.05, y),
          Math.cos(angle) * distance
        );
        const fade = Math.max(0, 1 - local);
        shard.entity.setLocalScale(
          shard.size * 0.8 * fade,
          shard.size * 1.7 * fade,
          shard.size * 0.8 * fade
        );
        shard.entity.setLocalEulerAngles(
          local * 160,
          angle / DEG + local * 300,
          local * shard.spin
        );
      }

      for (const puff of puffs) {
        const local = Math.max(0, Math.min(1, (t - puff.delay) / 0.9));
        const angle = puff.angle + local * 1.2;
        const distance = puff.distance * local;
        puff.entity.setLocalPosition(
          Math.sin(angle) * distance,
          0.35 + local * puff.rise,
          Math.cos(angle) * distance
        );
        const fade = Math.max(0, 1 - local);
        const scale = puff.size * (0.7 + local * 1.1) * fade;
        puff.entity.setLocalScale(scale, scale * 0.7, scale);
      }

      lightMaterial.opacity = 0.82 * (1 - t);
      darkMaterial.opacity = 0.68 * (1 - t);
      dustMaterial.opacity = 0.26 * (1 - t);
    });
}

/**
   * Impacto de tierra: rocas pequeñas que caen sobre el punto, losas de suelo
   * que se levantan y un anillo marrón. Es el golpe por objetivo de Terremoto.
   */
export function spawnGroundBurst(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number): void {
const root = new pc.Entity('ground-burst');
    root.setPosition(x, 0, z);
    ctx.app.root.addChild(root);

    const dustMaterial = ctx.createWaterMaterial([186, 166, 136], 0.42);
    const ringMaterial = ctx.createWaterMaterial(color, 0.5);
    const crackMaterial = ctx.createWaterMaterial([108, 92, 72], 0.6);
    const lightMaterial = ctx.createRockMaterial([198, 176, 140], 1);
    const darkMaterial = ctx.createRockMaterial([126, 108, 86], 1);
    const materials = [
      dustMaterial,
      ringMaterial,
      crackMaterial,
      lightMaterial,
      darkMaterial
    ];
    const power = effectiveness > 1 ? 1.22 : effectiveness < 1 ? 0.88 : 1;

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.07 + index * 0.04, 0);
      rings.push(ring);
    }

    const cracks: pc.Entity[] = [];
    for (let index = 0; index < 8; index++) {
      const angle = (index / 8) * Math.PI * 2 + Math.random() * 0.35;
      const length = (0.7 + Math.random() * 0.9) * power;
      const crack = ctx.createEntity(ctx.boxMesh, [crackMaterial], root);
      crack.setLocalPosition(
        Math.sin(angle) * length * 0.5,
        0.035,
        Math.cos(angle) * length * 0.5
      );
      crack.setLocalEulerAngles(0, angle / DEG, 0);
      crack.setLocalScale(0.06 + Math.random() * 0.06, 0.02, length);
      cracks.push(crack);
    }

    const slabs: (Polar & {
      entity: pc.Entity;
      angle: number;
      distance: number;
      lift: number;
      tilt: number;
      delay: number;
      size: number;
    })[] = [];
    for (let index = 0; index < 5; index++) {
      const angle = (index / 5) * Math.PI * 2 + Math.random() * 0.5;
      const slab = ctx.createEntity(
        ctx.boxMesh,
        [index % 2 === 0 ? lightMaterial : darkMaterial],
        root
      );
      const size = 0.28 + Math.random() * 0.22;
      slab.setLocalScale(size, 0.12, size * 0.8);
      slab.setLocalPosition(0, 0.02, 0);
      slabs.push({
        entity: slab,
        ...polar(angle),
        angle,
        distance: (0.35 + Math.random() * 0.65) * power,
        lift: 0.2 + Math.random() * 0.35,
        tilt: (Math.random() - 0.5) * 70,
        delay: index * 0.03,
        size
      });
    }

    const rocks: (Polar & {
      entity: pc.Entity;
      angle: number;
      distance: number;
      size: number;
      startHeight: number;
      delay: number;
      fall: number;
      spin: number;
    })[] = [];
    for (let index = 0; index < 6; index++) {
      const angle = (index / 6) * Math.PI * 2 + Math.random() * 0.6;
      const size = 0.09 + Math.random() * 0.09;
      const rock = ctx.createEntity(
        ctx.rockChunkMesh,
        [index % 2 === 0 ? lightMaterial : darkMaterial],
        root
      );
      rock.setLocalScale(0.001, 0.001, 0.001);
      rocks.push({
        entity: rock,
        ...polar(angle),
        angle,
        distance: (0.3 + Math.random() * 0.65) * power,
        size,
        startHeight: 0.7 + Math.random() * 0.8,
        delay: Math.random() * 0.14,
        fall: 0.28 + Math.random() * 0.16,
        spin: (Math.random() - 0.5) * 720
      });
    }

    const puffs: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      size: number;
      delay: number;
    }[] = [];
    for (let index = 0; index < 8; index++) {
      const angle = (index / 8) * Math.PI * 2 + Math.random() * 0.5;
      const size = 0.2 + Math.random() * 0.2;
      const puff = ctx.createEntity(ctx.sphereMesh, [dustMaterial], root);
      puff.setLocalPosition(0, 0.25, 0);
      puff.setLocalScale(size, size * 0.65, size);
      puffs.push({
        entity: puff,
        angle,
        distance: (0.4 + Math.random() * 0.8) * power,
        rise: 0.3 + Math.random() * 0.5,
        size,
        delay: Math.random() * 0.1
      });
    }

    ctx.spawnSporeParticles(
      root,
      {
        y: 0.1,
        extents: [0.45, 0.06, 0.45],
        velocity: [0, 0.4, 0],
        velocityEnd: [0, 1.5, 0],
        radialSpeed: 1.3,
        radialSpeedEnd: 2.8,
        sizeStart: 0.14,
        sizeMid: 0.24,
        sizeEnd: 0.07,
        lifetime: 0.65,
        rate: 0.025,
        numParticles: 60,
        blendType: pc.BLEND_NORMAL
      },
      [180, 160, 132],
      ctx.dustTexture
    );

    ctx.addEffect(root, materials, 0.62, (t) => {
      const ease = 1 - Math.pow(1 - t, 3);
      ringMaterial.opacity = 0.44 * (1 - t);
      for (let index = 0; index < rings.length; index++) {
        const ring = rings[index];
        const scale = (0.25 + ease * (2.2 + index * 0.6)) * power;
        ring.setLocalScale(scale, 1, scale);
        ring.setLocalEulerAngles(0, t * 45 + index * 35, 0);
      }
      crackMaterial.opacity = 0.55 * (1 - t * 0.8);
      dustMaterial.opacity = 0.3 * (1 - t);

      for (const slab of slabs) {
        const local = Math.max(0, Math.min(1, (t - slab.delay) / 0.55));
        const distance = slab.distance * local;
        slab.entity.setLocalPosition(
          slab.sin * distance,
          0.02 + local * slab.lift,
          slab.cos * distance
        );
        slab.entity.setLocalEulerAngles(
          slab.tilt * local,
          slab.angle / DEG + local * 40,
          slab.tilt * 0.6 * local
        );
        const fade = Math.max(0, 1 - local * 0.8) * (1 - t * 0.5);
        slab.entity.setLocalScale(
          slab.size * fade,
          0.12 * (0.6 + local),
          slab.size * 0.8 * fade
        );
      }

      for (const rock of rocks) {
        const local = Math.max(0, Math.min(1, (t - rock.delay) / rock.fall));
        if (local <= 0) {
          rock.entity.setLocalScale(0.001, 0.001, 0.001);
          continue;
        }
        const drop = local * local;
        const scale = rock.size * (0.85 + local * 0.15) * (1 - t * 0.35);
        rock.entity.setLocalPosition(
          rock.sin * rock.distance,
          rock.startHeight * (1 - drop) + rock.size * 0.45,
          rock.cos * rock.distance
        );
        rock.entity.setLocalScale(
          Math.max(0.001, scale),
          Math.max(0.001, scale * 0.78),
          Math.max(0.001, scale * 0.92)
        );
        rock.entity.setLocalEulerAngles(
          local * 320,
          rock.angle / DEG + local * rock.spin,
          local * 210
        );
      }

      for (const puff of puffs) {
        const local = Math.max(0, Math.min(1, (t - puff.delay) / 0.9));
        const angle = puff.angle + local * 1.1;
        const distance = puff.distance * local;
        puff.entity.setLocalPosition(
          Math.sin(angle) * distance,
          0.25 + local * puff.rise,
          Math.cos(angle) * distance
        );
        const fade = Math.max(0, 1 - local);
        const scale = puff.size * (0.8 + local * 1.2) * fade;
        puff.entity.setLocalScale(scale, scale * 0.65, scale);
      }

      lightMaterial.opacity = 0.8 * (1 - t);
      darkMaterial.opacity = 0.66 * (1 - t);
    });
}
