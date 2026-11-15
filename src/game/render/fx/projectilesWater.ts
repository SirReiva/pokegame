import type { FxRuntime } from './fxRuntime';
import * as pc from 'playcanvas';
import { DEG } from '../../config';
import type { EffectHandle } from '../../core/ports/fx';
import {
  EffectBatch,
  MOTION_PROJECTILE_ORBIT,
  MOTION_PROJECTILE_RING,
  MOTION_PROJECTILE_WAKE
} from '../../effectBatch';
import type { EffectBatchInstance } from '../../effectBatch';
import type { ProjectileVisual } from './fxGeometry';

/**
   * Proyectil de agua: tres burbujas pequeñas que giran entre sí alrededor de
   * un centro común mientras avanzan, con destellos que patinan por su
   * superficie. Sin núcleo ni estela: el grupo de burbujas es todo el efecto.
   */
export function spawnWaterProjectile(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    dirX: number,
    dirZ: number,
    color: readonly [number, number, number]): EffectHandle {
const root = new pc.Entity('water-projectile');
    root.setPosition(x, 0.7, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    ctx.app.root.addChild(root);

    const bubbleMaterial = ctx.createWaterMaterial(color, 0.5);
    const shineMaterial = ctx.createWaterMaterial([246, 255, 255], 0.92);
    const materials = [bubbleMaterial, shineMaterial];

    const orbit = radius * 1.5;
    const sizes = [1, 0.8, 0.9];
    const bubbles: {
      entity: pc.Entity;
      body: pc.Entity;
      phase: number;
      size: number;
      orbit: number;
      bob: number;
    }[] = [];
    for (let index = 0; index < 3; index++) {
      const group = new pc.Entity('water-bubble');
      root.addChild(group);

      const size = radius * 1.5 * sizes[index];
      const body = ctx.createEntity(ctx.sphereMesh, [bubbleMaterial], group);
      body.setLocalScale(size, size, size);

      // Dos brillos pequeños: uno grande arriba a la izquierda y otro mínimo
      // abajo a la derecha. Al girar el grupo, recorren la burbuja como reflejos.
      const highlight = ctx.createEntity(
        ctx.sphereMesh,
        [shineMaterial],
        group
      );
      highlight.setLocalPosition(-size * 0.22, size * 0.3, -size * 0.18);
      highlight.setLocalScale(size * 0.3, size * 0.3, size * 0.3);

      const spark = ctx.createEntity(ctx.sphereMesh, [shineMaterial], group);
      spark.setLocalPosition(size * 0.2, -size * 0.16, -size * 0.22);
      spark.setLocalScale(size * 0.14, size * 0.14, size * 0.14);

      bubbles.push({
        entity: group,
        body,
        phase: (index / 3) * Math.PI * 2,
        size,
        orbit: orbit * (0.94 + index * 0.08),
        bob: Math.random() * Math.PI * 2
      });
    }

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        for (const bubble of bubbles) {
          // Las tres burbujas se persiguen en círculo en el plano perpendicular
          // a la dirección de vuelo, así que el grupo rueda mientras avanza.
          const angle = bubble.phase + time * 5.4;
          bubble.entity.setLocalPosition(
            Math.cos(angle) * bubble.orbit,
            Math.sin(angle) * bubble.orbit +
              Math.sin(time * 6 + bubble.bob) * radius * 0.12,
            Math.sin(angle * 2 + bubble.phase) * radius * 0.3
          );
          // El grupo gira sobre sí mismo para que los brillos patinen.
          bubble.entity.setLocalEulerAngles(
            time * 150 + bubble.phase * 40,
            time * 210 + bubble.phase * 30,
            0
          );
          const pulse = 1 + Math.sin(time * 14 + bubble.phase) * 0.09;
          const size = bubble.size * pulse;
          bubble.body.setLocalScale(size, size, size);
        }
        bubbleMaterial.opacity = 0.44 + Math.sin(time * 16) * 0.07;
        shineMaterial.opacity = 0.86 + Math.sin(time * 24) * 0.1;
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
   * Proyectil de chorro de agua: una gota alargada con núcleo blanco, cola de
   * gotas que se desprenden y dos anillos de presión. La punta apunta a +Z
   * local y la cola queda detrás, así que se orienta con la dirección de vuelo.
   */
export function spawnWaterJetProjectile(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    dirX: number,
    dirZ: number,
    color: readonly [number, number, number]): EffectHandle {
const root = new pc.Entity('water-jet-projectile');
    root.setPosition(x, 0.7, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createWaterMaterial([238, 253, 255], 0.95);
    const bodyMaterial = ctx.createWaterMaterial(color, 0.55);
    // El lote de gotas inyecta el shader instanciado en su material, así que no
    // puede compartirlo con la punta: cada malla normal conserva el suyo.
    const dropletMaterial = ctx.createWaterMaterial([210, 244, 255], 0.8);
    const noseMaterial = ctx.createWaterMaterial([210, 244, 255], 0.8);
    const mistMaterial = ctx.createWaterMaterial(color, 0.14);
    const trailMaterial = ctx.createWaterMaterial(color, 0.34);
    const ringMaterial = ctx.createWaterMaterial([204, 242, 255], 0.72);
    const materials = [
      coreMaterial,
      bodyMaterial,
      dropletMaterial,
      noseMaterial,
      mistMaterial,
      trailMaterial,
      ringMaterial
    ];

    // Halo translúcido: da volumen de agua sin tapar el núcleo.
    const halo = ctx.createEntity(ctx.sphereMesh, [mistMaterial], root);
    halo.setLocalPosition(0, 0, -radius * 0.3);
    halo.setLocalScale(radius * 3.4, radius * 3, radius * 5.2);

    // Cuerpo alargado en el eje de vuelo.
    const body = ctx.createEntity(ctx.sphereMesh, [bodyMaterial], root);
    body.setLocalScale(radius * 2.3, radius * 1.9, radius * 4.6);

    // Núcleo y punta: la parte que más brilla.
    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0, radius * 1.2);
    core.setLocalScale(radius * 1.2, radius * 1.2, radius * 2.6);

    const nose = ctx.createEntity(ctx.sphereMesh, [noseMaterial], root);
    nose.setLocalPosition(0, 0, radius * 2.7);
    nose.setLocalScale(radius, radius * 0.92, radius * 2);

    // Cola: cinco cuentas que se mecen y laten. Un solo lote instanciado en
    // lugar de cinco entidades; el shader las anima con `uEffectTime`.
    const tailInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 5; index++) {
      tailInstances.push({
        anim0: [
          index * 1.3,
          -radius * (2.7 + index * 1.05),
          radius * (1.45 - index * 0.22),
          1.7
        ],
        anim1: [radius * 0.22, radius * 0.14, 20, 0]
      });
    }
    const tailBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: trailMaterial,
      instances: tailInstances,
      motion: MOTION_PROJECTILE_WAKE,
      radius
    });

    // Gotas satélite: orbitan alrededor del eje. Otro lote, en vez de seis
    // entidades con su transformación por frame.
    const dropletInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 6; index++) {
      const orbit = 1.5 + Math.random() * 0.8;
      dropletInstances.push({
        z: -radius * (0.4 + index * 0.55),
        anim0: [
          (index / 6) * Math.PI * 2,
          2.4 + Math.random() * 1.8,
          orbit,
          Math.random() * Math.PI * 2
        ],
        anim1: [
          radius * (0.2 + Math.random() * 0.16),
          1,
          orbit * 0.7,
          0.35
        ],
        anim2: [1.4, 0, 0, 0]
      });
    }
    const dropletBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: dropletMaterial,
      instances: dropletInstances,
      motion: MOTION_PROJECTILE_ORBIT,
      radius
    });

    // Anillos de presión: dos aros que se expanden y avanzan.
    const ringInstances: EffectBatchInstance[] = [
      {
        z: radius * 0.6,
        anim0: [0, 0, 0, 0],
        anim1: [2.6, 1.8, 1.6, 0.9]
      },
      {
        z: radius * 1.7,
        anim0: [0.5, 0, 0, 0],
        anim1: [2.6, 1.8, 1.6, 0.9]
      }
    ];
    const ringBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.torusMesh,
      material: ringMaterial,
      instances: ringInstances,
      motion: MOTION_PROJECTILE_RING,
      radius
    });


    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;

        const bodyPulse = 1 + Math.sin(time * 18) * 0.045;
        const lengthPulse = 1 + Math.sin(time * 24 + 0.7) * 0.06;
        body.setLocalScale(
          radius * 2.3 * bodyPulse,
          radius * 1.9 * bodyPulse,
          radius * 4.6 * lengthPulse
        );

        const corePulse = 1 + Math.sin(time * 30) * 0.08;
        core.setLocalScale(
          radius * 1.2 * corePulse,
          radius * 1.2 * corePulse,
          radius * 2.6 * (1 + Math.sin(time * 26) * 0.1)
        );
        coreMaterial.opacity = 0.84 + Math.sin(time * 28) * 0.09;
        bodyMaterial.opacity = 0.48 + Math.sin(time * 21) * 0.06;
        dropletMaterial.opacity = 0.72 + Math.sin(time * 24) * 0.08;
        noseMaterial.opacity = 0.72 + Math.sin(time * 24) * 0.08;
        mistMaterial.opacity = 0.12 + Math.sin(time * 14) * 0.03;
        trailMaterial.opacity = 0.28 + Math.sin(time * 17) * 0.05;
        ringMaterial.opacity = 0.6 + Math.sin(time * 23) * 0.1;

        tailBatch.setTime(time);
        dropletBatch.setTime(time);
        ringBatch.setTime(time);

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
   * Proyectil shuriken: una estrella de cuatro hojas que gira sobre su eje de
   * vuelo. Las hojas y el núcleo son geometría estática; solo giran y laten.
   * Una estela corta de agua marca la trayectoria.
   */
export function spawnShurikenProjectile(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number,
    dirX: number,
    dirZ: number): EffectHandle {
const root = new pc.Entity('shuriken-projectile');
    root.setPosition(x, 0.7, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    ctx.app.root.addChild(root);

    const bladeMaterial = ctx.createWaterMaterial([196, 240, 255], 0.95);
    const edgeMaterial = ctx.createMaterial([236, 252, 255], 0.9);
    const coreMaterial = ctx.createMaterial([255, 255, 255], 0.95);
    const glowMaterial = ctx.createWaterMaterial(color, 0.22);
    const trailMaterial = ctx.createWaterMaterial(color, 0.32);
    const materials = [
      bladeMaterial,
      edgeMaterial,
      coreMaterial,
      glowMaterial,
      trailMaterial
    ];

    const glow = ctx.createEntity(ctx.sphereMesh, [glowMaterial], root);
    glow.setLocalScale(radius * 3, radius * 3, radius * 3);

    const star = ctx.createEntity(
      ctx.cachedShuriken(radius * 2.1, radius * 0.56),
      [bladeMaterial],
      root
    );
    const starEdge = ctx.createEntity(
      ctx.cachedShuriken(radius * 1.62, radius * 0.42),
      [edgeMaterial],
      star
    );
    starEdge.setLocalScale(0.94, 0.94, 0.94);
    starEdge.setLocalEulerAngles(0, 0, 16);

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalScale(radius * 0.9, radius * 0.9, radius * 0.9);

    const trail: pc.Entity[] = [];
    for (let index = 0; index < 3; index++) {
      const puff = ctx.createEntity(ctx.sphereMesh, [trailMaterial], root);
      puff.setLocalPosition(0, 0, -radius * (1.8 + index * 1.35));
      const scale = radius * (0.75 - index * 0.16);
      puff.setLocalScale(scale, scale, scale);
      trail.push(puff);
    }

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        star.setLocalEulerAngles(0, 0, time * 900);
        const pulse = 1 + Math.sin(time * 22) * 0.08;
        core.setLocalScale(
          radius * 0.9 * pulse,
          radius * 0.9 * pulse,
          radius * 0.9 * pulse
        );
        const glowPulse = 1 + Math.sin(time * 14) * 0.12;
        glow.setLocalScale(
          radius * 3 * glowPulse,
          radius * 3 * glowPulse,
          radius * 3 * glowPulse
        );

        bladeMaterial.opacity = 0.9 + Math.sin(time * 26) * 0.05;
        edgeMaterial.opacity = 0.7 + Math.sin(time * 31) * 0.12;
        coreMaterial.opacity = 0.9 + Math.sin(time * 24) * 0.08;
        glowMaterial.opacity = 0.18 + Math.sin(time * 12) * 0.05;
        trailMaterial.opacity = 0.18 + Math.sin(time * 16) * 0.05;
        for (let index = 0; index < trail.length; index++) {
          const puff = trail[index];
          const scale =
            radius * (0.75 - index * 0.16) * (1 + Math.sin(time * 18 + index) * 0.12);
          puff.setLocalScale(scale, scale, scale);
        }
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
