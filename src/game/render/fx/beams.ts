import type { FxRuntime } from './fxRuntime';
import * as pc from 'playcanvas';
import { DEG } from '../../config';
import { EffectBatch, MOTION_PSYCHIC_BEAM_BODY, MOTION_PSYCHIC_BEAM_FLASH, MOTION_PSYCHIC_BEAM_RINGS } from '../../effectBatch';
import type { EffectBatchInstance } from '../../effectBatch';
import { createLightningMesh } from './fxGeometry';

/**
   * Haz eléctrico: dos rayos zigzagueantes que giran en sentidos opuestos,
   * cruzándose mientras el haz se extiende desde el lanzador hacia delante.
   */
export function spawnElectricBeam(ctx: FxRuntime, x1: number,
    z1: number,
    x2: number,
    z2: number,
    color: readonly [number, number, number],
    width: number): void {
const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.max(0.1, Math.hypot(dx, dz));
    const root = new pc.Entity('beam');
    root.setPosition(x1, 0.7, z1);
    root.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    ctx.app.root.addChild(root);

    const strandMaterial = ctx.createMaterial(color, 0.95);
    const coreMaterial = ctx.createMaterial([255, 255, 255], 0.7);
    const materials = [strandMaterial, coreMaterial];

    const strandWidth = Math.max(0.02, width * 0.28);
    const segments = Math.max(10, Math.round(length * 2));
    const strands: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      // Malla unitaria cacheada: el largo se aplica con la escala Z.
      const mesh = ctx.cachedMesh(
        `lightning:${strandWidth.toFixed(3)}:${segments}:${index}`,
        () =>
          createLightningMesh(
            ctx.device,
            1,
            strandWidth,
            segments,
            3000 + index * 7919
          )
      );
      const strand = ctx.createEntity(mesh, [strandMaterial], root);
      strand.setLocalPosition(0, 0, length / 2);
      strand.setLocalScale(1, 1, length);
      strands.push(strand);
    }

    const core = ctx.createEntity(ctx.boxMesh, [coreMaterial], root);
    const coreWidth = Math.max(0.015, width * 0.34);
    core.setLocalPosition(0, 0, length / 2);
    core.setLocalScale(coreWidth, coreWidth, length);

    ctx.addEffect(root, materials, 0.34, (t) => {
      // El haz avanza desde el lanzador durante el primer tercio del efecto.
      const advance = Math.min(1, t / 0.34);
      const reveal = 1 - (1 - advance) * (1 - advance);
      for (const strand of strands) {
        strand.setLocalPosition(0, 0, (length / 2) * reveal);
        strand.setLocalScale(1, 1, Math.max(0.02, length * reveal));
      }
      core.setLocalPosition(0, 0, (length / 2) * reveal);
      core.setLocalScale(coreWidth, coreWidth, length * Math.max(0.02, reveal));

      const spin = t * 900;
      strands[0].setLocalEulerAngles(0, 0, spin);
      strands[1].setLocalEulerAngles(0, 0, -spin);

      const flicker = 0.78 + Math.random() * 0.22;
      const fade = 1 - Math.max(0, (t - 0.4) / 0.6);
      strandMaterial.opacity = 0.95 * flicker * fade;
      coreMaterial.opacity = 0.55 * flicker * fade;
      strandMaterial.update();
      coreMaterial.update();
    });
}

/**
   * Haz psíquico: una descarga mental con el lenguaje visual de los juegos
   * principales. El lanzador abre el disparo con un fogonazo blanco y un aro
   * que se expande; la línea se llena de aros de energía ondulados y la punta
   * estalla al llegar al final.
   *
   * Todo el movimiento vive en lotes instanciados y vertex shaders: el update
   * solo avanza `uEffectTime`, así que no se transforma ninguna entidad por
   * frame.
   */
export function spawnPsychicBeam(ctx: FxRuntime, x1: number,
    z1: number,
    x2: number,
    z2: number,
    color: readonly [number, number, number],
    width: number): void {
const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.max(0.1, Math.hypot(dx, dz));
    const root = new pc.Entity('psychic-beam');
    root.setPosition(x1, 0.7, z1);
    root.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    ctx.app.root.addChild(root);

    const life = 0.52;
    const bodyMaterial = ctx.createMaterial(color, 0.18);
    const ringMaterial = ctx.createMaterial([255, 238, 255], 0.85);
    const flashMaterial = ctx.createMaterial([255, 250, 255], 0.95);
    const flashRingMaterial = ctx.createMaterial([255, 232, 255], 0.85);
    const materials = [
      bodyMaterial,
      ringMaterial,
      flashMaterial,
      flashRingMaterial
    ];

    // Tres capas concéntricas del cuerpo del haz: halo, cuerpo y núcleo. El
    // cuerpo es tenue para que manden los aros, como en la referencia.
    const bodyInstances: EffectBatchInstance[] = [
      { anim0: [width * 2.6, 0, 0, 0] },
      { anim0: [width * 0.95, 0, 0, 0] },
      { anim0: [width * 0.32, 0, 0, 0] }
    ];
    const bodyBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: bodyMaterial,
      instances: bodyInstances,
      motion: MOTION_PSYCHIC_BEAM_BODY,
      life,
      params: [length, width, 0, 0]
    });

    // Aros que recorren la línea. Alternan sentido de giro y fase.
    const ringInstances: EffectBatchInstance[] = [];
    const ringCount = 8;
    for (let index = 0; index < ringCount; index++) {
      ringInstances.push({
        anim0: [
          index / ringCount,
          (index % 3 - 1) * 12,
          (index % 2 === 0 ? 1 : -1) * (150 + index * 22),
          index * 1.7
        ],
        anim1: [Math.max(0.1, width * 3), 0, 0, 0]
      });
    }
    const ringBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.psychicRingMesh,
      material: ringMaterial,
      instances: ringInstances,
      motion: MOTION_PSYCHIC_BEAM_RINGS,
      life,
      params: [length, width, 0.06, 0]
    });

    // Fogonazos esféricos en el lanzador y en la punta.
    const flashSphereBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: flashMaterial,
      instances: [
        { anim0: [0.02, 0, Math.max(0.35, width * 2.4), 0] },
        { anim0: [length, 0.09, Math.max(0.35, width * 2.6), 0] }
      ],
      motion: MOTION_PSYCHIC_BEAM_FLASH,
      life,
      params: [0, 0, 0, 0]
    });

    // Aros de choque en el lanzador y en la punta, perpendiculares al haz.
    const flashRingBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.psychicRingMesh,
      material: flashRingMaterial,
      instances: [
        { anim0: [0.02, 0.02, Math.max(0.4, width * 3.2), 90] },
        { anim0: [length, 0.11, Math.max(0.4, width * 3.6), 90] }
      ],
      motion: MOTION_PSYCHIC_BEAM_FLASH,
      life,
      params: [0, 0, 0, 0]
    });

    ctx.addEffect(root, materials, life, (t) => {
      const now = t * life;
      bodyBatch.setTime(now);
      ringBatch.setTime(now);
      flashSphereBatch.setTime(now);
      flashRingBatch.setTime(now);
    });
}

/**
   * Haz de sombra: columna violeta con un núcleo claro, jirones de oscuridad
   * que orbitan la línea y anillos que viajan hacia la punta. La mezcla normal
   * mantiene el violeta legible sobre terreno claro.
   */
export function spawnDarkBeam(ctx: FxRuntime, x1: number,
    z1: number,
    x2: number,
    z2: number,
    color: readonly [number, number, number],
    width: number): void {
const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.max(0.1, Math.hypot(dx, dz));
    const root = new pc.Entity('dark-beam');
    root.setPosition(x1, 0.7, z1);
    root.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    ctx.app.root.addChild(root);

    const mistMaterial = ctx.createWaterMaterial(
      [
        Math.round(color[0] * 0.55),
        Math.round(color[1] * 0.55),
        Math.round(color[2] * 0.7)
      ],
      0.26
    );
    const bodyMaterial = ctx.createWaterMaterial(color, 0.55);
    const coreMaterial = ctx.createWaterMaterial([218, 200, 255], 0.95);
    const wispMaterial = ctx.createWaterMaterial([178, 144, 244], 0.55);
    const ringMaterial = ctx.createWaterMaterial([202, 172, 255], 0.65);
    const materials = [
      mistMaterial,
      bodyMaterial,
      coreMaterial,
      wispMaterial,
      ringMaterial
    ];

    const mistWidth = Math.max(0.12, width * 2.4);
    const bodyWidth = Math.max(0.08, width * 1.25);
    const coreWidth = Math.max(0.04, width * 0.45);

    const beamMesh = pc.Mesh.fromGeometry(
      ctx.device,
      new pc.CylinderGeometry({
        radius: 0.5,
        height: 1,
        heightSegments: 1,
        capSegments: 14
      })
    );
    const sheath = ctx.createEntity(beamMesh, [mistMaterial], root);
    const body = ctx.createEntity(beamMesh, [bodyMaterial], root);
    const core = ctx.createEntity(beamMesh, [coreMaterial], root);
    sheath.setLocalEulerAngles(90, 0, 0);
    body.setLocalEulerAngles(90, 0, 0);
    core.setLocalEulerAngles(90, 0, 0);

    const wisps: {
      entity: pc.Entity;
      phase: number;
      speed: number;
      orbit: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 6; index++) {
      const wisp = ctx.createEntity(ctx.boxMesh, [wispMaterial], root);
      const size = bodyWidth * (0.18 + Math.random() * 0.1);
      wisp.setLocalScale(size, size * 0.4, size * 4.6);
      wisps.push({
        entity: wisp,
        phase: Math.random(),
        speed: 1.8 + Math.random() * 1.4,
        orbit: bodyWidth * (0.45 + Math.random() * 0.35),
        size
      });
    }

    const rings: pc.Entity[] = [];
    const ringCount = 6;
    for (let index = 0; index < ringCount; index++) {
      const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
      ring.setLocalEulerAngles(90, 0, 0);
      rings.push(ring);
    }

    const tip = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);

    let time = 0;
    ctx.addEffect(root, materials, 0.48, (_t, dt) => {
      time += dt;
      const advance = Math.min(1, time / 0.1);
      const reveal = 1 - (1 - advance) * (1 - advance);
      const pulse = 0.84 + Math.random() * 0.16;
      const fade = 1 - Math.max(0, (time - 0.28) / 0.2);

      sheath.setLocalPosition(0, 0, (length * reveal) / 2);
      sheath.setLocalScale(
        mistWidth * pulse,
        Math.max(0.02, length * reveal),
        mistWidth * pulse
      );
      body.setLocalPosition(0, 0, (length * reveal) / 2);
      body.setLocalScale(
        bodyWidth * pulse,
        Math.max(0.02, length * reveal),
        bodyWidth * pulse
      );
      core.setLocalPosition(0, 0, (length * reveal) / 2);
      core.setLocalScale(
        coreWidth,
        Math.max(0.02, length * reveal),
        coreWidth
      );

      for (const wisp of wisps) {
        const path = (time * wisp.speed + wisp.phase) % 1;
        const angle = time * 4.2 + wisp.phase * Math.PI * 2;
        wisp.entity.setLocalPosition(
          Math.cos(angle) * wisp.orbit,
          Math.sin(angle) * wisp.orbit,
          length * reveal * path
        );
        wisp.entity.setLocalEulerAngles(
          0,
          angle / DEG,
          Math.sin(angle * 1.5) * 35
        );
      }

      for (let index = 0; index < rings.length; index++) {
        const ring = rings[index];
        const path = (time * 1.9 + index / ringCount) % 1;
        ring.setLocalPosition(0, 0, length * reveal * (0.1 + path * 0.9));
        const ringScale =
          width * 0.85 * (1.3 + pulse * 0.8) * (0.6 + Math.sin(path * Math.PI) * 0.8);
        ring.setLocalScale(ringScale, ringScale, ringScale);
        ring.setLocalEulerAngles(90, 0, time * 260 + index * 48);
      }

      tip.setLocalPosition(0, 0, length * reveal);
      const tipScale = width * (1.4 + Math.sin(time * 34) * 0.25);
      tip.setLocalScale(tipScale, tipScale, tipScale);

      mistMaterial.opacity = 0.22 * pulse * fade;
      bodyMaterial.opacity = 0.42 * pulse * fade;
      coreMaterial.opacity = 0.9 * pulse * fade;
      wispMaterial.opacity = 0.5 * fade;
      ringMaterial.opacity = 0.65 * fade;
    });
}

/**
   * Haz fantasma: columna morada con núcleo claro, jirones que orbitan la
   * línea, anillos que viajan hacia la punta y un par de ojos en la boca del
   * haz. Disponible para futuras habilidades de haz de tipo Fantasma.
   */
export function spawnGhostBeam(ctx: FxRuntime, x1: number,
    z1: number,
    x2: number,
    z2: number,
    color: readonly [number, number, number],
    width: number): void {
const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.max(0.1, Math.hypot(dx, dz));
    const root = new pc.Entity('ghost-beam');
    root.setPosition(x1, 0.75, z1);
    root.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    ctx.app.root.addChild(root);

    const mistMaterial = ctx.createWaterMaterial([76, 50, 118], 0.26);
    const bodyMaterial = ctx.createWaterMaterial(color, 0.55);
    const coreMaterial = ctx.createWaterMaterial([228, 216, 255], 0.92);
    const wispMaterial = ctx.createWaterMaterial([172, 132, 240], 0.5);
    const ringMaterial = ctx.createWaterMaterial([204, 176, 255], 0.6);
    const eyeMaterial = ctx.createMaterial([255, 246, 206], 0.95);
    const materials = [
      mistMaterial,
      bodyMaterial,
      coreMaterial,
      wispMaterial,
      ringMaterial,
      eyeMaterial
    ];

    const mistWidth = Math.max(0.12, width * 2.4);
    const bodyWidth = Math.max(0.08, width * 1.25);
    const coreWidth = Math.max(0.04, width * 0.45);

    const beamMesh = pc.Mesh.fromGeometry(
      ctx.device,
      new pc.CylinderGeometry({
        radius: 0.5,
        height: 1,
        heightSegments: 1,
        capSegments: 14
      })
    );
    const sheath = ctx.createEntity(beamMesh, [mistMaterial], root);
    const body = ctx.createEntity(beamMesh, [bodyMaterial], root);
    const core = ctx.createEntity(beamMesh, [coreMaterial], root);
    sheath.setLocalEulerAngles(90, 0, 0);
    body.setLocalEulerAngles(90, 0, 0);
    core.setLocalEulerAngles(90, 0, 0);

    const wisps: {
      entity: pc.Entity;
      phase: number;
      speed: number;
      orbit: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 7; index++) {
      const wisp = ctx.createEntity(ctx.boxMesh, [wispMaterial], root);
      const size = bodyWidth * (0.18 + Math.random() * 0.1);
      wisp.setLocalScale(size, size * 0.4, size * 4.6);
      wisps.push({
        entity: wisp,
        phase: Math.random(),
        speed: 1.6 + Math.random() * 1.4,
        orbit: bodyWidth * (0.45 + Math.random() * 0.35),
        size
      });
    }

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 5; index++) {
      const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
      ring.setLocalEulerAngles(90, 0, 0);
      rings.push(ring);
    }

    const tip = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    const eyes: { entity: pc.Entity; side: number }[] = [];
    for (let index = 0; index < 2; index++) {
      const eye = ctx.createEntity(ctx.sphereMesh, [eyeMaterial], root);
      eyes.push({ entity: eye, side: index === 0 ? -1 : 1 });
    }

    let time = 0;
    ctx.addEffect(root, materials, 0.48, (_t, dt) => {
      time += dt;
      const advance = Math.min(1, time / 0.1);
      const reveal = 1 - (1 - advance) * (1 - advance);
      const pulse = 0.84 + Math.random() * 0.16;
      const fade = 1 - Math.max(0, (time - 0.28) / 0.2);

      const sheathLength = Math.max(0.02, length * reveal);
      sheath.setLocalPosition(0, 0, sheathLength / 2);
      sheath.setLocalScale(
        mistWidth * pulse,
        sheathLength,
        mistWidth * pulse
      );
      body.setLocalPosition(0, 0, sheathLength / 2);
      body.setLocalScale(
        bodyWidth * pulse,
        sheathLength,
        bodyWidth * pulse
      );
      core.setLocalPosition(0, 0, sheathLength / 2);
      core.setLocalScale(coreWidth, sheathLength, coreWidth);

      for (const wisp of wisps) {
        const path = (time * wisp.speed + wisp.phase) % 1;
        const angle = time * 4.6 + wisp.phase * Math.PI * 2;
        wisp.entity.setLocalPosition(
          Math.cos(angle) * wisp.orbit,
          Math.sin(angle) * wisp.orbit,
          length * reveal * path
        );
        wisp.entity.setLocalEulerAngles(
          0,
          angle / DEG,
          Math.sin(angle * 1.6) * 38
        );
      }

      for (let index = 0; index < rings.length; index++) {
        const ring = rings[index];
        const path = (time * 2 + index / rings.length) % 1;
        ring.setLocalPosition(0, 0, length * reveal * (0.1 + path * 0.9));
        const ringScale =
          width * 0.9 * (1.3 + pulse * 0.8) * (0.55 + Math.sin(path * Math.PI) * 0.85);
        ring.setLocalScale(ringScale, ringScale, ringScale);
        ring.setLocalEulerAngles(90, 0, time * 220 + index * 42);
      }

      tip.setLocalPosition(0, 0, length * reveal);
      const tipScale = width * (1.6 + Math.sin(time * 30) * 0.25);
      tip.setLocalScale(tipScale, tipScale, tipScale);
      for (const eye of eyes) {
        const blink = Math.sin(time * 9 + eye.side) > 0.9 ? 0.15 : 1;
        eye.entity.setLocalPosition(
          eye.side * width * 0.45,
          width * 0.3,
          length * reveal
        );
        eye.entity.setLocalScale(
          width * 0.3 * blink,
          width * 0.3 * blink,
          width * 0.2 * blink
        );
      }

      mistMaterial.opacity = 0.22 * pulse * fade;
      bodyMaterial.opacity = 0.5 * pulse * fade;
      coreMaterial.opacity = 0.9 * pulse * fade;
      wispMaterial.opacity = 0.46 * fade;
      ringMaterial.opacity = 0.6 * fade;
      eyeMaterial.opacity = 0.95 * fade;
    });
}
