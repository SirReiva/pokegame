import type { FxRuntime } from './fxRuntime';
import * as pc from 'playcanvas';
import { DEG } from '../../config';
import { EffectBatch, MOTION_BLIZZARD_CRYSTALS, MOTION_BLIZZARD_PUFFS, MOTION_FLAME_JET, MOTION_ICE_MIST, MOTION_ICE_SPARKS, MOTION_ICE_SPIKES, MOTION_PULSE_SPHERE, MOTION_SHEER_COLD_BODY, MOTION_SNOWFLAKES } from '../../effectBatch';
import type { EffectBatchInstance } from '../../effectBatch';
import type { AoeFxHandle } from '../../core/ports/fx';
import { coneAnchors, createFlameConeMesh } from './fxGeometry';

/**
   * Área de hielo: anillos de escarcha, púas de cristal que brotan del suelo,
   * niebla fría y destellos. Es el visual de Viento Gélido y Ventisca.
   */
export function spawnIceAoe(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number): void {
const life = Math.max(0.2, duration);
    const root = new pc.Entity('ice-aoe');
    root.setPosition(x, 0.03, z);
    ctx.app.root.addChild(root);

    const ringMaterial = ctx.createWaterMaterial([150, 220, 255], 0.55);
    const floorMaterial = ctx.createWaterMaterial([120, 200, 250], 0.12);
    const spikeMaterial = ctx.createIceCrystalMaterial(
      [205, 242, 255],
      0.9
    );
    const deepMaterial = ctx.createIceCrystalMaterial(color, 0.74);
    const mistMaterial = ctx.createWaterMaterial([225, 248, 255], 0.26);
    const sparkMaterial = ctx.createMaterial([235, 250, 255], 0.8);
    const materials = [
      ringMaterial,
      floorMaterial,
      spikeMaterial,
      deepMaterial,
      mistMaterial,
      sparkMaterial
    ];

    const floor = ctx.createEntity(ctx.discMesh, [floorMaterial], root);
    floor.setLocalPosition(0, 0.02, 0);
    floor.setLocalScale(radius * 2, 1, radius * 2);

    const rings: pc.Entity[] = [];
    const ringMesh = ctx.cachedArcBand(0.955, 1, Math.PI, 64);
    for (let index = 0; index < 2; index++) {
      const ring = ctx.createEntity(ringMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.1 + index * 0.03, 0);
      rings.push(ring);
    }

    const spikeInstances: EffectBatchInstance[] = [];
    const deepSpikeInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 26; index++) {
      // Ángulo áureo + raíz del índice: cubre el disco de forma uniforme en
      // vez de amontonar las púas cerca del centro.
      const angle = index * 2.399963 + Math.random() * 0.35;
      const distance =
        Math.sqrt((index + 0.5) / 26) * radius * 0.92;
      const height = radius * (0.24 + Math.random() * 0.36);
      const width = radius * (0.1 + Math.random() * 0.06);
      const instance: EffectBatchInstance = {
        anim0: [
          Math.cos(angle) * distance,
          Math.sin(angle) * distance,
          width,
          Math.random() * 0.2
        ],
        anim1: [
          height,
          (Math.random() - 0.5) * 24,
          Math.random() * 360,
          (Math.random() - 0.5) * 24
        ]
      };
      if (index % 4 === 0) deepSpikeInstances.push(instance);
      else spikeInstances.push(instance);
    }
    const spikeBatches = [
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.iceCrystalMesh,
        material: spikeMaterial,
        instances: spikeInstances,
        motion: MOTION_ICE_SPIKES,
        radius,
        life
      }),
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.iceCrystalMesh,
        material: deepMaterial,
        instances: deepSpikeInstances,
        motion: MOTION_ICE_SPIKES,
        radius,
        life
      })
    ];

    const mistInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 10; index++) {
      const angle = (index / 10) * Math.PI * 2 + Math.random() * 0.4;
      const size = radius * (0.1 + Math.random() * 0.09);
      mistInstances.push({
        anim0: [
          angle,
          radius * (0.2 + Math.random() * 0.65),
          radius * (0.25 + Math.random() * 0.4),
          size
        ]
      });
    }
    const mistBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: mistMaterial,
      instances: mistInstances,
      motion: MOTION_ICE_MIST,
      radius,
      life
    });

    const sparkInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 12; index++) {
      const angle = (index / 12) * Math.PI * 2 + Math.random() * 0.4;
      sparkInstances.push({
        anim0: [
          angle,
          radius * (0.15 + Math.random() * 0.7),
          radius * (0.4 + Math.random() * 0.5),
          radius * (0.018 + Math.random() * 0.018)
        ]
      });
    }
    const sparkBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: sparkMaterial,
      instances: sparkInstances,
      motion: MOTION_ICE_SPARKS,
      radius,
      life
    });

    let time = 0;
    ctx.addEffect(root, materials, life, (_t, dt) => {
      time += dt;
      const fadeIn = Math.min(1, time / 0.16);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.3));
      const envelope = Math.min(fadeIn, fadeOut);
      const grow = 1 - Math.pow(1 - Math.min(1, time / 0.3), 2);
      const pulse = 0.55 + Math.sin(time * 8) * 0.2;

      ringMaterial.opacity = (0.3 + pulse * 0.15) * envelope;
      floorMaterial.opacity = 0.1 * envelope;
      const ringScale = radius * (0.5 + grow * 0.5);
      for (let index = 0; index < rings.length; index++) {
        const ring = rings[index];
        ring.setLocalScale(ringScale, 1, ringScale);
        ring.setLocalEulerAngles(0, time * (index === 0 ? 80 : -60), 0);
      }

      for (const batch of spikeBatches) batch.setTime(time);
      mistBatch.setTime(time);
      sparkBatch.setTime(time);

      spikeMaterial.opacity = 0.68 * envelope;
      deepMaterial.opacity = 0.46 * envelope;
      mistMaterial.opacity = 0.22 * envelope;
      sparkMaterial.opacity = 0.72 * envelope;
    });
}

/**
   * Ventisca: los cristales caen desde arriba, se clavan en el suelo y quedan
   * sobresaliendo mientras el área se enfría. La marca previa ya avisa del
   * radio; este efecto empieza con el impacto.
   */
export function spawnBlizzardAoe(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number): void {
const life = Math.max(0.3, duration);
    const root = new pc.Entity('blizzard-aoe');
    root.setPosition(x, 0.03, z);
    ctx.app.root.addChild(root);

    const ringMaterial = ctx.createWaterMaterial(color, 0.5);
    const floorMaterial = ctx.createWaterMaterial([120, 200, 250], 0.1);
    const crystalMaterial = ctx.createIceCrystalMaterial(
      [215, 245, 255],
      0.9
    );
    const deepMaterial = ctx.createIceCrystalMaterial([96, 176, 230], 0.76);
    const snowMaterial = ctx.createWaterMaterial([235, 250, 255], 0.34);
    // Copos y puffs comparten aspecto, pero necesitan shaders de animación
    // distintos; un material por lote evita que el último chunk pise al otro.
    const flakeMaterial = ctx.createWaterMaterial([235, 250, 255], 0.34);
    const flashMaterial = ctx.createMaterial([200, 240, 255], 0.55);
    const materials = [
      ringMaterial,
      floorMaterial,
      crystalMaterial,
      deepMaterial,
      snowMaterial,
      flakeMaterial,
      flashMaterial
    ];

    const floor = ctx.createEntity(ctx.discMesh, [floorMaterial], root);
    floor.setLocalPosition(0, 0.02, 0);
    floor.setLocalScale(radius * 2, 1, radius * 2);

    const rings: pc.Entity[] = [];
    const ringMesh = ctx.cachedArcBand(0.955, 1, Math.PI, 64);
    for (let index = 0; index < 2; index++) {
      const ring = ctx.createEntity(ringMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.1 + index * 0.03, 0);
      rings.push(ring);
    }

    const flash = ctx.createEntity(ctx.sphereMesh, [flashMaterial], root);
    flash.setLocalPosition(0, 0.75, 0);

    const crystalInstances: EffectBatchInstance[] = [];
    const deepCrystalInstances: EffectBatchInstance[] = [];
    const puffInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 26; index++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * radius * 0.9;
      const targetX = Math.cos(angle) * distance;
      const targetZ = Math.sin(angle) * distance;
      const height = radius * (0.24 + Math.random() * 0.34);
      const width = radius * (0.09 + Math.random() * 0.055);
      // El centro queda por debajo de la superficie: la punta inferior se
      // entierra y la superior sobresale, como un cristal clavado.
      const landY = height * 0.28;
      const startY = radius * (1.3 + Math.random() * 1.2) + height;
      const tiltX = (Math.random() - 0.5) * 18;
      const tiltZ = (Math.random() - 0.5) * 18;
      const yaw = Math.random() * 360;
      const delay = Math.random() * 0.06;
      const fall = 0.1 + Math.random() * 0.06;
      const crystal: EffectBatchInstance = {
        x: targetX,
        z: targetZ,
        rx: tiltX,
        ry: yaw,
        rz: tiltZ,
        anim0: [startY, landY, delay, fall],
        anim1: [width, height, 0, 0]
      };
      if (index % 4 === 0) deepCrystalInstances.push(crystal);
      else crystalInstances.push(crystal);

      const puffSize = radius * (0.045 + Math.random() * 0.04);
      puffInstances.push({
        x: targetX,
        y: 0.12,
        z: targetZ,
        anim0: [puffSize, delay, fall, 0]
      });
    }

    const flakeInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 24; index++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * radius * 0.95;
      const size = radius * (0.014 + Math.random() * 0.016);
      flakeInstances.push({
        x: Math.cos(angle) * distance,
        z: Math.sin(angle) * distance,
        anim0: [
          radius * (1.4 + Math.random() * 1.6),
          0.65 + Math.random() * 0.35,
          Math.random() * Math.PI * 2,
          size
        ]
      });
    }
    const crystalBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.iceCrystalMesh,
      material: crystalMaterial,
      instances: crystalInstances,
      motion: MOTION_BLIZZARD_CRYSTALS,
      radius,
      life
    });
    const deepCrystalBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.iceCrystalMesh,
      material: deepMaterial,
      instances: deepCrystalInstances,
      motion: MOTION_BLIZZARD_CRYSTALS,
      radius,
      life
    });
    const puffBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: snowMaterial,
      instances: puffInstances,
      motion: MOTION_BLIZZARD_PUFFS,
      radius,
      life
    });
    const flakeBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: flakeMaterial,
      instances: flakeInstances,
      motion: MOTION_SNOWFLAKES,
      radius,
      life
    });

    let time = 0;
    ctx.addEffect(root, materials, life, (_t, dt) => {
      time += dt;
      const fadeIn = Math.min(1, time / 0.12);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.24));
      const envelope = Math.min(fadeIn, fadeOut);
      const grow = 1 - Math.pow(1 - Math.min(1, time / 0.4), 2);
      const pulse = 0.55 + Math.sin(time * 8) * 0.18;

      ringMaterial.opacity = (0.28 + pulse * 0.15) * envelope;
      floorMaterial.opacity = 0.09 * envelope;
      const ringScale = radius * (0.55 + grow * 0.55);
      for (let index = 0; index < rings.length; index++) {
        const ring = rings[index];
        ring.setLocalScale(ringScale, 1, ringScale);
        ring.setLocalEulerAngles(0, time * (index === 0 ? 70 : -50), 0);
      }

      const flashIn = Math.min(1, time / 0.14);
      const flashScale = radius * (0.1 + flashIn * 0.28);
      flash.setLocalScale(flashScale, flashScale, flashScale);
      flashMaterial.opacity = 0.5 * Math.max(0, 1 - time / 0.2);

      crystalBatch.setTime(time);
      deepCrystalBatch.setTime(time);
      puffBatch.setTime(time);
      flakeBatch.setTime(time);

      crystalMaterial.opacity = 0.86 * envelope;
      deepMaterial.opacity = 0.72 * envelope;
      snowMaterial.opacity = 0.3 * envelope;
      flakeMaterial.opacity = 0.3 * envelope;
    });
}

/**
   * Aliento helado de `Frío Polar`: un cono de niebla con cristales de hielo y
   * copos que recorren el abanico desde el vértice hasta la base.
   */
export function spawnSheerColdCone(ctx: FxRuntime, x: number,
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
    // El aliento vuela a la altura del pecho, no pegado al suelo.
    const jetY = 1.05;
    const tanHalf = Math.tan(half);

    const root = new pc.Entity('sheer-cold-cone');
    root.setPosition(x, 0, z);
    root.setEulerAngles(0, yaw / DEG, 0);
    ctx.app.root.addChild(root);

    const hazeMaterial = ctx.createWaterMaterial(color, 0.07);
    const mistMaterial = ctx.createWaterMaterial(color, 0.12);
    const bodyMaterial = ctx.createWaterMaterial([214, 244, 255], 0.18);
    const coreMaterial = ctx.createWaterMaterial([240, 253, 255], 0.26);
    const plumeMaterial = ctx.createWaterMaterial([222, 248, 255], 0.16);
    const puffMaterial = ctx.createWaterMaterial(color, 0.07);
    const shardMaterial = ctx.createIceCrystalMaterial([222, 248, 255], 0.9);
    const deepMaterial = ctx.createIceCrystalMaterial([118, 198, 242], 0.75);
    const snowMaterial = ctx.createWaterMaterial([236, 250, 255], 0.4);
    const glowMaterial = ctx.createMaterial(color, 0.18);
    const materials = [
      hazeMaterial,
      mistMaterial,
      bodyMaterial,
      coreMaterial,
      plumeMaterial,
      puffMaterial,
      shardMaterial,
      deepMaterial,
      snowMaterial,
      glowMaterial
    ];

    // Cuerpo del aliento: cuatro conos anidados de niebla que van del vértice
    // a la base. El más externo sobresale un poco del AoE para que el borde
    // del abanico también tenga volumen y no se lea como una línea fina.
    const bodyMesh = ctx.cachedMesh('sheer-cold-body', () =>
      createFlameConeMesh(ctx.device, 0.06, 1, 28, 10)
    );
    const bodyRadius = reach * tanHalf;
    const bodySpecs = [
      { material: hazeMaterial, scale: 1 },
      { material: mistMaterial, scale: 0.92 },
      { material: bodyMaterial, scale: 0.68 },
      { material: coreMaterial, scale: 0.36 }
    ];
    const batches: EffectBatch[] = [];
    for (let index = 0; index < bodySpecs.length; index++) {
      const spec = bodySpecs[index];
      batches.push(
        new EffectBatch({
          app: ctx.app,
          parent: root,
          mesh: bodyMesh,
          material: spec.material,
          instances: [
            {
              y: jetY,
              anim0: [
                reach,
                bodyRadius * spec.scale,
                index * 1.7,
                18 + index * 3
              ]
            }
          ],
          motion: MOTION_SHEER_COLD_BODY,
          radius: reach,
          life,
          params: [0.1, 0.25, 0, 0]
        })
      );
    }

    // Reparto determinista en espiral: cristales y copos no se apelotonan en
    // el eje y todas las vistas dibujan la misma silueta.
    const makeInstances = (
      count: number,
      radialMax: number,
      sizeScale: number,
      seed: number
    ): EffectBatchInstance[] => {
      const instances: EffectBatchInstance[] = [];
      for (let index = 0; index < count; index++) {
        const phase = (index * 0.61803398875 + seed) % 1;
        const azimuth = index * 2.399963229728653 + seed * Math.PI * 2;
        const radial = ((index * 0.754877666 + seed * 0.3) % 1) * radialMax;
        const speed = 1.1 + ((index * 13 + seed * 17) % 9) * 0.06;
        const size = reach * sizeScale * (0.7 + radial * 0.9);
        instances.push({
          anim0: [phase, azimuth, 0, speed],
          anim1: [size, size, radial, 0]
        });
      }
      return instances;
    };

    // Todos los lotes viajan en el espacio local del cono: el vértice queda en
    // z=0 y la base en z=reach. Así la pluma siempre respeta el ángulo del AoE.
    batches.push(
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.iceCrystalMesh,
        material: shardMaterial,
        instances: makeInstances(90, 0.98, 0.03, 0.17),
        motion: MOTION_FLAME_JET,
        radius: reach,
        life,
        params: [tanHalf * 0.9, 0.12, 0.3, jetY]
      })
    );
    batches.push(
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.iceCrystalMesh,
        material: deepMaterial,
        instances: makeInstances(36, 1, 0.024, 0.53),
        motion: MOTION_FLAME_JET,
        radius: reach,
        life,
        params: [tanHalf * 0.9, 0.14, 0.32, jetY]
      })
    );
    batches.push(
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.sphereMesh,
        material: snowMaterial,
        instances: makeInstances(180, 1, 0.01, 0.71),
        motion: MOTION_FLAME_JET,
        radius: reach,
        life,
        params: [tanHalf, 0.18, 0.36, jetY]
      })
    );
    // Niebla media: rellena el cuerpo del cono y sustituye la pluma continua,
    // que podía desalinearse del ángulo del AoE.
    batches.push(
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.sphereMesh,
        material: plumeMaterial,
        instances: makeInstances(70, 1, 0.045, 0.29),
        motion: MOTION_FLAME_JET,
        radius: reach,
        life,
        params: [tanHalf, 0.12, 0.32, jetY]
      })
    );
    // Velo exterior: puffs grandes y muy transparentes que dan amplitud al
    // abanico y se salen un poco del borde para suavizarlo.
    batches.push(
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.sphereMesh,
        material: puffMaterial,
        instances: makeInstances(32, 0.92, 0.07, 0.91),
        motion: MOTION_FLAME_JET,
        radius: reach,
        life,
        params: [tanHalf, 0.1, 0.3, jetY]
      })
    );

    // Boca del aliento: núcleo brillante en el vértice, con pulso y fundido
    // también en GPU.
    batches.push(
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.sphereMesh,
        material: glowMaterial,
        instances: [
          {
            y: jetY,
            z: 0.14,
            anim0: [0.34, 18, 0.12, 0],
            anim1: [0.8, 0, 0, 0]
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
      // Toda la animación vive en el vertex shader; solo avanza el reloj.
      time += dt;
      for (const batch of batches) batch.setTime(time);
    };

    const anchors = coneAnchors(x, z, dirX, dirZ, reach, half);
    const firstEffect = ctx.effects.length;
    ctx.withAnchors(anchors, () =>
      ctx.addEffect(root, materials, life, animate, anchors)
    );
    const created = ctx.effects.slice(firstEffect);
    animate(0, 0);
    return {
      setCenter: (nextX, nextZ) => {
        root.setPosition(nextX, root.getPosition().y, nextZ);
        const nextAnchors = coneAnchors(
          nextX,
          nextZ,
          dirX,
          dirZ,
          reach,
          half
        );
        for (const effect of created) effect.anchors = nextAnchors;
      },
      destroy: () => {
        for (const effect of created) ctx.disposeEffect(effect);
      }
    };
}
