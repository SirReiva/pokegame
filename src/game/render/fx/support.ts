import type { FxRuntime } from './fxRuntime';
import * as pc from 'playcanvas';
import { DEG } from '../../config';
import { EffectBatch, MOTION_RECOVERY_MOTES } from '../../effectBatch';
import type { EffectBatchInstance } from '../../effectBatch';
import type { FxHandle } from '../../core/ports/fx';

/** Estela del desplazamiento de un dash. */
export function spawnDash(ctx: FxRuntime, x1: number,
    z1: number,
    x2: number,
    z2: number,
    color: readonly [number, number, number]): void {
const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.max(0.1, Math.hypot(dx, dz));
    const material = ctx.createMaterial(color, 0.7);
    const entity = ctx.createEntity(ctx.boxMesh, [material]);
    entity.setPosition((x1 + x2) / 2, 0.18, (z1 + z2) / 2);
    entity.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    entity.setLocalScale(0.8, 0.12, length);

    ctx.addEffect(
      entity,
      [material],
      0.35,
      (t) => {
        material.opacity = 0.7 * (1 - t);
      },
      [
        [x1, z1],
        [x2, z2]
      ]
    );
}

/** Aura circular para buffs, escudos y reapariciones. */
export function spawnBuff(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number): void {
const material = ctx.createMaterial(color, 0.8);
    const entity = ctx.createEntity(ctx.torusMesh, [material]);
    entity.setPosition(x, 0.15, z);

    ctx.addEffect(
      entity,
      [material],
      0.65,
      (t) => {
        const scale = Math.max(0.3, radius * 2) * (0.35 + 0.85 * t);
        entity.setLocalScale(scale, 1, scale);
        entity.setPosition(x, 0.15 + t * 0.8, z);
        material.opacity = 0.8 * (1 - t);
      },
      [[x, z]]
    );
}

/**
   * Aura tenue de armadura de casteo: un anillo bajo que sigue al lanzador
   * mientras la ventana está activa. Se destruye al terminar o cancelarse el
   * casteo; el pulso de absorción y la fractura van aparte.
   */
export function spawnArmorAura(ctx: FxRuntime, position: { x: number; z: number },
    color: readonly [number, number, number],
    radius: number,
    duration: number): FxHandle {
const material = ctx.createMaterial(color, 0.28);
    const ring = ctx.createEntity(ctx.torusMesh, [material]);
    const base = Math.max(0.45, radius);
    const anchor: [number, number] = [position.x, position.z];

    return ctx.addEffect(
      ring,
      [material],
      Math.max(0.1, duration),
      (t) => {
        anchor[0] = position.x;
        anchor[1] = position.z;
        ring.setPosition(position.x, 0.08, position.z);
        const pulse = 1 + Math.sin(t * Math.PI * 8) * 0.04;
        ring.setLocalScale(base * pulse, 1, base * pulse);
        material.opacity = 0.28 * (1 - t);
      },
      [anchor]
    );
}

/**
   * Pulso de armadura de casteo: un anillo bajo y un destello esférico que se
   * expanden y se apagan. Se dibuja cuando un golpe no rompe la armadura.
   */
export function spawnArmorPulse(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number): void {
const root = new pc.Entity('armor-pulse');
    root.setPosition(x, 0.05, z);
    ctx.app.root.addChild(root);

    const ringMaterial = ctx.createMaterial(color, 0.9);
    const glowMaterial = ctx.createShieldMaterial(
      color,
      0.3,
      pc.BLEND_ADDITIVEALPHA
    );
    const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
    const glow = ctx.createEntity(ctx.sphereMesh, [glowMaterial], root);
    const base = Math.max(0.45, radius);
    const glowHeight = Math.max(0.55, base * 0.9);
    glow.setLocalPosition(0, glowHeight, 0);
    const glowScale = base * 2;

    ctx.addEffect(
      root,
      [ringMaterial, glowMaterial],
      0.3,
      (t) => {
        const ease = 1 - (1 - t) * (1 - t);
        const ringScale = base * (0.7 + 1.4 * ease);
        ring.setLocalScale(ringScale, 1, ringScale);
        ringMaterial.opacity = 0.9 * (1 - t);
        const scale = glowScale * (0.8 + 0.4 * ease);
        glow.setLocalScale(scale, scale * 0.7, scale);
        glowMaterial.opacity = 0.3 * (1 - t);
      },
      [[x, z]]
    );
}

/**
   * La armadura se rompe: anillo del color del caster y destello blanco que se
   * abren rápido. El impacto normal y el control posterior siguen su curso.
   */
export function spawnArmorBreak(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number): void {
const root = new pc.Entity('armor-break');
    root.setPosition(x, 0.05, z);
    ctx.app.root.addChild(root);

    const ringMaterial = ctx.createMaterial(color, 1);
    const flashMaterial = ctx.createShieldMaterial(
      [255, 255, 255],
      0.85,
      pc.BLEND_ADDITIVEALPHA
    );
    const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
    const flash = ctx.createEntity(ctx.sphereMesh, [flashMaterial], root);
    const base = Math.max(0.5, radius);
    const flashHeight = Math.max(0.55, base * 0.9);
    flash.setLocalPosition(0, flashHeight, 0);

    ctx.addEffect(
      root,
      [ringMaterial, flashMaterial],
      0.22,
      (t) => {
        const ease = 1 - (1 - t) * (1 - t);
        const ringScale = base * (0.8 + 2.2 * ease);
        ring.setLocalScale(ringScale, 1, ringScale);
        ringMaterial.opacity = 1 - t;
        const scale = base * 2 * (1 - 0.55 * ease);
        flash.setLocalScale(scale, scale * 0.7, scale);
        flashMaterial.opacity = 0.85 * (1 - t);
      },
      [[x, z]]
    );
}

/**
   * Escudo esférico de Protección. Sigue al Pokémon, usa su color accent y
   * mantiene la esfera centrada en el cuerpo durante toda la duración. No
   * dibuja anillo horizontal: solo la esfera y su halo.
   */
export function spawnProtectionShield(ctx: FxRuntime, position: { x: number; z: number },
    color: readonly [number, number, number],
    radius: number,
    centerY: number,
    duration: number): FxHandle {
const root = new pc.Entity('protection-shield');
    root.setPosition(position.x, centerY, position.z);
    ctx.app.root.addChild(root);

    const baseMaterial = ctx.createShieldMaterial(color, 0.12, pc.BLEND_NORMAL);
    const glowMaterial = ctx.createShieldMaterial(
      color,
      0.1,
      pc.BLEND_ADDITIVEALPHA
    );

    const base = ctx.createEntity(ctx.sphereMesh, [baseMaterial], root);
    const glow = ctx.createEntity(ctx.sphereMesh, [glowMaterial], root);
    const baseScale = radius * 2;
    base.setLocalScale(baseScale, baseScale, baseScale);
    glow.setLocalScale(baseScale * 1.06, baseScale * 1.06, baseScale * 1.06);

    const anchor: [number, number] = [position.x, position.z];
    return ctx.addEffect(
      root,
      [baseMaterial, glowMaterial],
      duration,
      (t) => {
        anchor[0] = position.x;
        anchor[1] = position.z;
        root.setPosition(position.x, centerY, position.z);
        const fadeIn = Math.min(1, t * 10);
        const fadeOut = t > 0.8 ? Math.max(0, (1 - t) / 0.2) : 1;
        const fade = fadeIn * fadeOut;
        const pulse = 1 + Math.sin(t * Math.PI * 8) * 0.015;
        baseMaterial.opacity = 0.12 * fade;
        glowMaterial.opacity = 0.1 * fade;
        base.setLocalScale(baseScale * pulse, baseScale * pulse, baseScale * pulse);
        glow.setLocalScale(
          baseScale * 1.06 * pulse,
          baseScale * 1.06 * pulse,
          baseScale * 1.06 * pulse
        );
      },
      [anchor]
    );
}

/** Curación de Mew: anillos rosas que suben y motas que se elevan y se apagan. */
export function spawnHeal(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number): void {
const root = new pc.Entity('heal-burst');
    root.setPosition(x, 0.04, z);
    ctx.app.root.addChild(root);

    const ringMaterial = ctx.createMaterial(color, 0.65);
    const coreMaterial = ctx.createMaterial([255, 232, 250], 0.85);
    const sparkMaterial = ctx.createMaterial([255, 190, 238], 0.95);
    const materials = [ringMaterial, coreMaterial, sparkMaterial];
    const sizeScale = Math.max(0.8, radius);

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.55, 0);
    core.setLocalScale(0.3, 0.3, 0.3);

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.08 + index * 0.32, 0);
      ring.setLocalScale(0.5, 1, 0.5);
      rings.push(ring);
    }

    const sparks: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      lift: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 14; index++) {
      const angle = (index / 14) * Math.PI * 2 + Math.random() * 0.4;
      const size = 0.06 + Math.random() * 0.06;
      const spark = ctx.createEntity(ctx.sphereMesh, [sparkMaterial], root);
      spark.setLocalScale(size, size, size);
      sparks.push({
        entity: spark,
        angle,
        distance: 0.15 + Math.random() * 0.35,
        lift: 0.7 + Math.random() * 0.8,
        size
      });
    }

    ctx.addEffect(root, materials, 0.85, (t) => {
      const coreScale = 0.3 + t * 0.35;
      core.setLocalScale(coreScale, coreScale, coreScale);
      core.setLocalPosition(0, 0.55 + t * 0.35, 0);
      coreMaterial.opacity = 0.85 * (1 - t);

      rings.forEach((ring, index) => {
        const scale = sizeScale * (0.5 + t * (1.55 + index * 0.35));
        ring.setLocalScale(scale, 1, scale);
        ring.setLocalPosition(0, 0.08 + index * 0.32 + t * 0.5, 0);
        ringMaterial.opacity = 0.65 * (1 - t) * (index === 0 ? 1 : 0.7);
      });

      for (const spark of sparks) {
        const spread = (spark.distance + t * 0.55) * sizeScale;
        spark.entity.setLocalPosition(
          Math.cos(spark.angle) * spread,
          0.2 + t * spark.lift,
          Math.sin(spark.angle) * spread
        );
        const fade = Math.sin(Math.min(1, t * 1.15) * Math.PI);
        const size = spark.size * (0.6 + fade * 0.9);
        spark.entity.setLocalScale(size, size, size);
      }
      sparkMaterial.opacity = 0.95 * (1 - t * 0.9);
    }, [[x, z]]);
}

/**
   * Área de curación: disco y aro rosas que marcan todo el radio, ondas que
   * recorren el área y motas que ascienden desde cualquier punto curado.
   */
export function spawnRecoveryAoe(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number): void {
const life = Math.max(0.2, duration);
    const root = new pc.Entity('recovery-aoe');
    root.setPosition(x, 0.03, z);
    ctx.app.root.addChild(root);

    // Los tintes claros salen del color de la habilidad para que el área de
    // curación acompañe a cada Pokémon: rosa en Mew, verde en Celebi.
    const lighten = (
      amount: number
    ): readonly [number, number, number] => [
      Math.round(color[0] + (255 - color[0]) * amount),
      Math.round(color[1] + (255 - color[1]) * amount),
      Math.round(color[2] + (255 - color[2]) * amount)
    ];

    const ringMaterial = ctx.createMaterial(color, 0.55);
    const fillMaterial = ctx.createMaterial(lighten(0.55), 0.12);
    const waveMaterial = ctx.createMaterial(lighten(0.35), 0.7);
    const moteMaterial = ctx.createMaterial(lighten(0.75), 0.95);
    const materials = [ringMaterial, fillMaterial, waveMaterial, moteMaterial];

    const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.1, 0);
    ring.setLocalScale(radius * 2, 1, radius * 2);

    const fill = ctx.createEntity(ctx.discMesh, [fillMaterial], root);
    fill.setLocalPosition(0, 0.03, 0);
    fill.setLocalScale(radius * 2, 1, radius * 2);

    const waves: pc.Entity[] = [];
    for (let index = 0; index < 3; index++) {
      const wave = ctx.createEntity(ctx.torusMesh, [waveMaterial], root);
      wave.setLocalPosition(0, 0.12 + index * 0.06, 0);
      waves.push(wave);
    }

    const moteInstances: EffectBatchInstance[] = [];
    const moteCount = 56;
    for (let index = 0; index < moteCount; index++) {
      moteInstances.push({
        anim0: [
          Math.random() * Math.PI * 2,
          // Reparto uniforme por la superficie del círculo, no concentrado en
          // el centro, para que toda el área se lea como zona curada.
          Math.sqrt(Math.random()) * radius * 0.95,
          Math.random() * 0.28,
          radius * (0.3 + Math.random() * 0.45)
        ],
        anim1: [0.05 + Math.random() * 0.07, 0, 0, 0]
      });
    }
    const moteBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: moteMaterial,
      instances: moteInstances,
      motion: MOTION_RECOVERY_MOTES,
      radius,
      life
    });

    let time = 0;
    ctx.addEffect(root, materials, life, (_t, dt) => {
      time += dt;
      const fadeOut = Math.max(0, 1 - time / life);
      const pulse = 0.5 + Math.sin(time * 18) * 0.25;

      ringMaterial.opacity = (0.35 + pulse * 0.25) * fadeOut;
      fillMaterial.opacity = (0.07 + pulse * 0.05) * fadeOut;
      waveMaterial.opacity = 0.65 * fadeOut;
      const groundScale = radius * 2 * (0.98 + pulse * 0.04);
      ring.setLocalScale(groundScale, 1, groundScale);

      for (let index = 0; index < waves.length; index++) {
        const progress = Math.min(
          1,
          Math.max(0, (time - index * 0.1) / 0.55)
        );
        const ease = 1 - (1 - progress) * (1 - progress);
        const scale = Math.max(0.01, radius * 2 * ease);
        waves[index].setLocalScale(scale, 1, scale);
      }

      moteBatch.setTime(time);
      moteMaterial.opacity = 0.95 * fadeOut;
    });
}
