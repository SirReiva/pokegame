import type { FxRuntime } from './fxRuntime';
import * as pc from 'playcanvas';
import { DEG } from '../../config';
import type { EffectHandle } from '../../core/ports/fx';
import type { ProjectileVisual } from './fxGeometry';
import { tintColor } from './fxGeometry';

/**
   * Proyectil de aire: dos ruedas de aspas de viento cruzadas giran alrededor
   * del eje de vuelo, con núcleo blanco, halo cálido y una estela de plumas. La
   * mezcla normal mantiene el blanco legible sobre el cielo y la hierba.
   */
export function spawnAirProjectile(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    dirX: number,
    dirZ: number,
    color: readonly [number, number, number]): EffectHandle {
const root = new pc.Entity('air-projectile');
    root.setPosition(x, 0.82, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createWaterMaterial(tintColor(color, 0.9), 0.9);
    const glowMaterial = ctx.createWaterMaterial(color, 0.16);
    const bladeMaterial = ctx.createWaterMaterial(tintColor(color, 0.72), 0.62);
    const hotMaterial = ctx.createMaterial(color, 0.5);
    const featherMaterial = ctx.createLeafMaterial(tintColor(color, 0.52), 0.85);
    const materials = [
      coreMaterial,
      glowMaterial,
      bladeMaterial,
      hotMaterial,
      featherMaterial
    ];

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalScale(radius * 1.15, radius * 1.15, radius * 1.15);
    const glow = ctx.createEntity(ctx.sphereMesh, [glowMaterial], root);
    glow.setLocalScale(radius * 4, radius * 4, radius * 4);

    // Dos ruedas perpendiculares: una sola medialuna se vería de canto desde
    // media cámara; la cruz mantiene el aspa con volumen en el splitscreen.
    const wheel = new pc.Entity('air-wheel');
    root.addChild(wheel);
    const crossWheel = new pc.Entity('air-wheel-cross');
    crossWheel.setLocalEulerAngles(0, 90, 0);
    root.addChild(crossWheel);
    for (let index = 0; index < 3; index++) {
      const blade = ctx.createEntity(
        ctx.cachedWindBlade(radius * 5, 1.08, radius * 1.35, 10),
        [index === 1 ? hotMaterial : bladeMaterial],
        wheel
      );
      blade.setLocalEulerAngles(0, 0, index * 120);
      const cross = ctx.createEntity(
        ctx.cachedWindBlade(radius * 3.9, 0.98, radius * 1.05, 10),
        [index === 2 ? hotMaterial : bladeMaterial],
        crossWheel
      );
      cross.setLocalEulerAngles(0, 0, index * 120 + 60);
    }

    const feathers: {
      entity: pc.Entity;
      phase: number;
      baseY: number;
      baseZ: number;
    }[] = [];
    for (let index = 0; index < 3; index++) {
      const baseZ = -radius * (2.4 + index * 1.2);
      const feather = ctx.createLeaf(root, featherMaterial, {
        x: (index - 1) * radius * 1.1,
        y: (index % 2 === 0 ? 1 : -1) * radius * 0.35,
        z: baseZ,
        width: radius * 0.9,
        height: radius * 2.2,
        yaw: index * 55,
        roll: 25 + index * 20
      });
      feathers.push({
        entity: feather,
        phase: index * 1.7,
        baseY: feather.getLocalPosition().y,
        baseZ
      });
    }

    const trails: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const trail = ctx.createEntity(ctx.boxMesh, [hotMaterial], root);
      trail.setLocalPosition(0, (index === 0 ? -1 : 1) * radius * 0.45, -radius * 2.2);
      trail.setLocalScale(radius * 0.35, radius * 0.16, radius * 4.6);
      trails.push(trail);
    }

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        const spin = time * 720;
        wheel.setLocalEulerAngles(0, 0, spin);
        crossWheel.setLocalEulerAngles(0, 90, -spin * 0.82);

        const pulse = 1 + Math.sin(time * 24) * 0.08;
        const coreScale = radius * 1.15 * pulse;
        core.setLocalScale(coreScale, coreScale, coreScale);
        const glowScale = radius * 4 * (1 + Math.sin(time * 16) * 0.1);
        glow.setLocalScale(glowScale, glowScale, glowScale);

        coreMaterial.opacity = 0.78 + Math.sin(time * 20) * 0.12;
        glowMaterial.opacity = 0.12 + Math.sin(time * 13) * 0.04;
        bladeMaterial.opacity = 0.5 + Math.sin(time * 17) * 0.11;
        hotMaterial.opacity = 0.34 + Math.sin(time * 21 + 1) * 0.09;
        featherMaterial.opacity = 0.62 + Math.sin(time * 12) * 0.14;
        for (const material of materials) material.update();

        for (const feather of feathers) {
          feather.entity.setLocalPosition(
            Math.sin(time * 9 + feather.phase) * radius * 0.9,
            feather.baseY + Math.sin(time * 7 + feather.phase) * radius * 0.25,
            feather.baseZ
          );
          feather.entity.setLocalEulerAngles(
            Math.sin(time * 8 + feather.phase) * 25,
            time * 120 + feather.phase * 40,
            Math.cos(time * 7 + feather.phase) * 30
          );
        }
        for (let index = 0; index < trails.length; index++) {
          trails[index].setLocalEulerAngles(
            0,
            Math.sin(time * 10 + index * 2) * 14,
            index === 0 ? 18 : -18
          );
        }
      }
    };
    visual.update(0);
    ctx.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => root.setPosition(nextX, 0.82, nextZ),
      update: (dt) => visual.update(dt),
      destroy: () => {
        if (!ctx.projectiles.delete(visual)) return;
        ctx.destroyFxRoot(root);
        ctx.releaseMaterials(materials);
      }
    };
}

/**
   * Proyectil de hielo: grupo de cristales que gira alrededor de un núcleo
   * blanco, con halo azul y estela de esquirlas. Disponible para futuros
   * ataques a distancia de tipo Hielo.
   */
export function spawnIceProjectile(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    dirX: number,
    dirZ: number,
    color: readonly [number, number, number]): EffectHandle {
const root = new pc.Entity('ice-projectile');
    root.setPosition(x, 0.8, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createWaterMaterial([242, 252, 255], 0.92);
    const glowMaterial = ctx.createWaterMaterial(color, 0.2);
    const crystalMaterial = ctx.createIceCrystalMaterial(
      [200, 240, 255],
      0.88
    );
    const deepMaterial = ctx.createIceCrystalMaterial([86, 168, 226], 0.72);
    const trailMaterial = ctx.createIceCrystalMaterial(
      [220, 248, 255],
      0.56
    );
    const materials = [
      coreMaterial,
      glowMaterial,
      crystalMaterial,
      deepMaterial,
      trailMaterial
    ];

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalScale(radius * 1.35, radius * 1.35, radius * 1.35);
    const glow = ctx.createEntity(ctx.sphereMesh, [glowMaterial], root);
    glow.setLocalScale(radius * 3.6, radius * 3.6, radius * 3.6);

    const wheel = new pc.Entity('ice-wheel');
    root.addChild(wheel);
    const shards: {
      entity: pc.Entity;
      phase: number;
      baseAngle: number;
      baseWidth: number;
      baseHeight: number;
    }[] = [];
    for (let index = 0; index < 5; index++) {
      const angle = (index / 5) * Math.PI * 2;
      const baseWidth = radius * 0.75;
      const baseHeight = radius * 2.1;
      const shard = ctx.createEntity(
        ctx.iceCrystalMesh,
        [index % 2 === 0 ? crystalMaterial : deepMaterial],
        wheel
      );
      shard.setLocalPosition(
        Math.cos(angle) * radius * 1.4,
        Math.sin(angle) * radius,
        0
      );
      shard.setLocalEulerAngles(0, 0, angle / DEG);
      shard.setLocalScale(baseWidth, baseHeight, baseWidth);
      shards.push({
        entity: shard,
        phase: index * 1.3,
        baseAngle: angle,
        baseWidth,
        baseHeight
      });
    }

    const trailShards: { entity: pc.Entity; phase: number; baseZ: number }[] = [];
    for (let index = 0; index < 3; index++) {
      const baseZ = -radius * (2 + index * 1.1);
      const shard = ctx.createEntity(
        ctx.iceCrystalMesh,
        [trailMaterial],
        root
      );
      shard.setLocalPosition(
        (index - 1) * radius * 0.35,
        (index % 2 === 0 ? 1 : -1) * radius * 0.3,
        baseZ
      );
      shard.setLocalScale(radius * 0.5, radius * 1.2, radius * 0.5);
      shard.setLocalEulerAngles(70 + index * 25, index * 60, 20);
      trailShards.push({ entity: shard, phase: index * 1.7, baseZ });
    }

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        wheel.setLocalEulerAngles(0, 0, time * 520);

        const pulse = 1 + Math.sin(time * 22) * 0.08;
        const coreScale = radius * 1.35 * pulse;
        core.setLocalScale(coreScale, coreScale, coreScale);
        const glowScale = radius * 3.6 * (1 + Math.sin(time * 15) * 0.1);
        glow.setLocalScale(glowScale, glowScale, glowScale);

        coreMaterial.opacity = 0.78 + Math.sin(time * 19) * 0.12;
        glowMaterial.opacity = 0.14 + Math.sin(time * 12) * 0.05;
        crystalMaterial.opacity = 0.62 + Math.sin(time * 16) * 0.12;
        deepMaterial.opacity = 0.38 + Math.sin(time * 18 + 1) * 0.1;
        trailMaterial.opacity = 0.26 + Math.sin(time * 10) * 0.08;
        for (const material of materials) material.update();

        for (const shard of shards) {
          const flicker = 0.9 + Math.sin(time * 13 + shard.phase) * 0.12;
          shard.entity.setLocalScale(
            shard.baseWidth * flicker,
            shard.baseHeight * flicker,
            shard.baseWidth * flicker
          );
          shard.entity.setLocalEulerAngles(
            0,
            0,
            shard.baseAngle / DEG + time * 55 + Math.sin(time * 6 + shard.phase) * 8
          );
        }
        for (const shard of trailShards) {
          shard.entity.setLocalPosition(
            Math.sin(time * 8 + shard.phase) * radius * 0.25,
            Math.sin(time * 7 + shard.phase) * radius * 0.2,
            shard.baseZ
          );
          shard.entity.setLocalEulerAngles(
            70 + Math.sin(time * 6 + shard.phase) * 15,
            time * 90 + shard.phase * 40,
            20
          );
        }
      }
    };
    visual.update(0);
    ctx.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => root.setPosition(nextX, 0.8, nextZ),
      update: (dt) => visual.update(dt),
      destroy: () => {
        if (!ctx.projectiles.delete(visual)) return;
        ctx.destroyFxRoot(root);
        ctx.releaseMaterials(materials);
      }
    };
}

/**
   * Proyectil de roca: un pedrusco facetado que gira en el aire, con dos
   * esquirlas en órbita y una estela de polvo. La piedra usa materiales
   * iluminados para conservar volumen en todas las vistas.
   */
export function spawnRockProjectile(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    dirX: number,
    dirZ: number,
    color: readonly [number, number, number]): EffectHandle {
const root = new pc.Entity('rock-projectile');
    root.setPosition(x, 0.8, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createRockMaterial(color, 1);
    const darkMaterial = ctx.createRockMaterial([112, 96, 76], 1);
    const lightMaterial = ctx.createRockMaterial([214, 194, 158], 1);
    const spikeMaterial = ctx.createRockMaterial([236, 218, 184], 0.95);
    const materials = [coreMaterial, darkMaterial, lightMaterial, spikeMaterial];

    const core = ctx.createEntity(ctx.boxMesh, [coreMaterial], root);
    core.setLocalScale(radius * 2.2, radius * 1.8, radius * 2.4);
    core.setLocalEulerAngles(18, 0, 10);

    const chunkA = ctx.createEntity(ctx.boxMesh, [darkMaterial], root);
    chunkA.setLocalPosition(radius * 0.95, radius * 0.4, -radius * 0.25);
    chunkA.setLocalScale(radius * 1.3, radius * 1.1, radius * 1.2);

    const chunkB = ctx.createEntity(ctx.boxMesh, [lightMaterial], root);
    chunkB.setLocalPosition(-radius * 0.85, -radius * 0.3, radius * 0.2);
    chunkB.setLocalScale(radius * 1.05, radius * 0.85, radius * 1.1);

    const spike = ctx.createEntity(ctx.rockSpikeMesh, [spikeMaterial], root);
    spike.setLocalPosition(0, 0, radius * 1.1);
    spike.setLocalScale(radius * 0.9, radius * 1.5, radius * 0.9);
    spike.setLocalEulerAngles(90, 0, 0);

    ctx.spawnSporeParticles(
      root,
      {
        extents: [radius * 0.8, radius * 0.8, radius * 0.4],
        velocity: [-dirX * 1.8, 0.2, -dirZ * 1.8],
        velocityEnd: [-dirX * 3.4, 0.7, -dirZ * 3.4],
        sizeStart: radius * 1.1,
        sizeMid: radius * 1.9,
        sizeEnd: radius * 0.5,
        lifetime: 0.45,
        rate: 0.04,
        numParticles: 40,
        blendType: pc.BLEND_NORMAL
      },
      [176, 158, 130],
      ctx.dustTexture
    );

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        core.setLocalEulerAngles(18 + time * 150, time * 190, 10 + time * 230);
        chunkA.setLocalEulerAngles(time * 260, 24 + time * 180, time * 140);
        chunkB.setLocalEulerAngles(64 - time * 220, time * 150, time * 300);
        const pulse = 0.92 + Math.sin(time * 18) * 0.08;
        core.setLocalScale(
          radius * 2.2 * pulse,
          radius * 1.8 * pulse,
          radius * 2.4 * pulse
        );
        spike.setLocalEulerAngles(90, 0, Math.sin(time * 12) * 18);
        coreMaterial.opacity = 0.96;
        darkMaterial.opacity = 0.94;
        lightMaterial.opacity = 0.92;
        spikeMaterial.opacity = 0.8 + Math.sin(time * 15) * 0.1;
        for (const material of materials) material.update();
      }
    };
    visual.update(0);
    ctx.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => root.setPosition(nextX, 0.8, nextZ),
      update: (dt) => visual.update(dt),
      destroy: () => {
        if (!ctx.projectiles.delete(visual)) return;
        ctx.destroyFxRoot(root);
        ctx.releaseMaterials(materials);
      }
    };
}

/**
   * Proyectil fantasma: orbe morado oscuro con núcleo claro, tres jirones que
   * ondulan detrás, dos ojos que parpadean en la parte delantera y una estela
   * de esferas que se apagan. La mezcla normal mantiene legible el morado.
   */
export function spawnGhostProjectile(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number,
    dirX: number,
    dirZ: number): EffectHandle {
const root = new pc.Entity('ghost-projectile');
    root.setPosition(x, 0.75, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createMaterial([238, 226, 255], 0.95);
    const bodyMaterial = ctx.createWaterMaterial(color, 0.6);
    const wispMaterial = ctx.createWaterMaterial([168, 128, 238], 0.5);
    const eyeMaterial = ctx.createMaterial([255, 244, 198], 0.95);
    const trailMaterial = ctx.createWaterMaterial([104, 70, 156], 0.28);
    const materials = [
      coreMaterial,
      bodyMaterial,
      wispMaterial,
      eyeMaterial,
      trailMaterial
    ];

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalScale(radius * 1.35, radius * 1.35, radius * 1.35);

    const body = ctx.createEntity(ctx.sphereMesh, [bodyMaterial], root);
    body.setLocalScale(radius * 3, radius * 3, radius * 3);

    const wisps: {
      entity: pc.Entity;
      phase: number;
      baseZ: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 3; index++) {
      const wisp = ctx.createEntity(ctx.boxMesh, [wispMaterial], root);
      wisp.setLocalScale(radius * 0.5, radius * 0.5, radius * 1.7);
      wisps.push({
        entity: wisp,
        phase: index * 1.7,
        baseZ: -radius * (1.7 + index * 1.25),
        size: radius * (0.55 - index * 0.08)
      });
    }

    const eyes: { entity: pc.Entity; side: number }[] = [];
    for (let index = 0; index < 2; index++) {
      const eye = ctx.createEntity(ctx.sphereMesh, [eyeMaterial], root);
      const side = index === 0 ? -1 : 1;
      eye.setLocalPosition(side * radius * 0.65, radius * 0.35, radius * 2.1);
      eye.setLocalScale(radius * 0.5, radius * 0.5, radius * 0.35);
      eyes.push({ entity: eye, side });
    }

    const trail: pc.Entity[] = [];
    for (let index = 0; index < 3; index++) {
      const puff = ctx.createEntity(ctx.sphereMesh, [trailMaterial], root);
      puff.setLocalPosition(0, 0, -radius * (2.8 + index * 1.7));
      const scale = radius * (1.4 - index * 0.35);
      puff.setLocalScale(scale, scale, scale);
      trail.push(puff);
    }

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        const pulse = 1 + Math.sin(time * 19) * 0.08;
        core.setLocalScale(
          radius * 1.35 * pulse,
          radius * 1.35 * pulse,
          radius * 1.35 * pulse
        );
        const bodyPulse = 1 + Math.sin(time * 12) * 0.07;
        body.setLocalScale(
          radius * 3 * bodyPulse,
          radius * 3 * bodyPulse,
          radius * 3 * bodyPulse
        );

        for (const wisp of wisps) {
          const wave = Math.sin(time * 8 + wisp.phase);
          wisp.entity.setLocalPosition(
            wave * radius * 0.55,
            Math.sin(time * 5 + wisp.phase) * radius * 0.45,
            wisp.baseZ
          );
          wisp.entity.setLocalEulerAngles(
            0,
            wave * 22,
            Math.sin(time * 7 + wisp.phase) * 18
          );
          const scale = wisp.size * (0.85 + Math.sin(time * 13 + wisp.phase) * 0.15);
          wisp.entity.setLocalScale(scale, scale, scale * 2.4);
        }

        const blink = Math.sin(time * 4.2) > 0.965 ? 0.08 : 1;
        for (const eye of eyes) {
          eye.entity.setLocalScale(
            radius * 0.5,
            radius * 0.5 * blink,
            radius * 0.35
          );
          eye.entity.setLocalPosition(
            eye.side * radius * 0.65,
            radius * 0.35,
            radius * 2.1
          );
        }

        coreMaterial.opacity = 0.9 + Math.sin(time * 27) * 0.08;
        bodyMaterial.opacity = 0.52 + Math.sin(time * 14) * 0.08;
        wispMaterial.opacity = 0.42 + Math.sin(time * 17) * 0.1;
        eyeMaterial.opacity = 0.95;
        trailMaterial.opacity = 0.2 + Math.sin(time * 11) * 0.05;
        for (const material of materials) material.update();
      }
    };
    visual.update(0);
    ctx.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => root.setPosition(nextX, 0.75, nextZ),
      update: (dt) => visual.update(dt),
      destroy: () => {
        if (!ctx.projectiles.delete(visual)) return;
        ctx.destroyFxRoot(root);
        ctx.releaseMaterials(materials);
      }
    };
}
