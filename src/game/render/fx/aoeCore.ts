import type { FxRuntime } from './fxRuntime';
import * as pc from 'playcanvas';
import { EffectBatch, MOTION_EXPLOSION_DEBRIS, MOTION_EXPLOSION_SMOKE, MOTION_RING } from '../../effectBatch';
import type { EffectBatchInstance } from '../../effectBatch';
import { areaAnchors, createLightningMesh } from './fxGeometry';

/** Anillo de área genérico: crece y se desvanece en el suelo. */
export function spawnRingAoe(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number): void {
const life = Math.max(0.2, duration);
    const material = ctx.createMaterial(color, 0.8);
    const batch = new EffectBatch({
      app: ctx.app,
      parent: ctx.app.root,
      mesh: ctx.torusMesh,
      material,
      instances: [{ x, y: 0.12, z }],
      motion: MOTION_RING,
      radius,
      life
    });

    let time = 0;
    ctx.addEffect(
      batch.entity,
      [material],
      life,
      (_t, dt) => {
        time += dt;
        batch.setTime(time);
        const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.3));
        material.opacity =
          0.75 * fadeOut * (0.82 + Math.sin(time * 7) * 0.18);
      },
      [[x, z]]
    );
}

/**
   * Rayo celestial seguido de la explosión eléctrica. El bolt se dibuja como
   * una cinta zigzagueante vertical (con un halo más ancho) que crece desde la
   * altura del cielo hasta el centro del área; al tocar el suelo dispara
   * `spawnExplosionAoe`, así que la deflagración de siempre nace justo en el
   * punto de impacto. El rayo se apaga al cabo de unas décimas, mientras la
   * explosión sigue su propio ciclo de vida.
   */
export function spawnThunderAoe(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number): void {
const life = Math.max(0.3, duration);
    const skyHeight = 9;
    // Ancho de la cinta principal; el halo usa la misma malla escalada.
    const width = Math.max(0.035, radius * 0.014);
    const fall = 0.2;
    const boltLife = fall + 0.25;
    const root = new pc.Entity('thunder-aoe');
    root.setPosition(x, 0.03, z);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createMaterial([255, 255, 240], 0.95);
    const glowMaterial = ctx.createMaterial(color, 0.35);
    const materials = [coreMaterial, glowMaterial];

    // Tres variantes de zigzag para que dos Truenos seguidos no se vean
    // idénticos; la malla se genera una sola vez y se comparte por ancho.
    const variant = Math.floor(Math.random() * 3);
    const seed = 0x51ef + variant * 7919;
    const coreMesh = ctx.cachedMesh(
      `thunder-bolt-core:${width.toFixed(3)}:${variant}`,
      () => createLightningMesh(ctx.device, skyHeight, width, 18, seed)
    );
    const glowMesh = ctx.cachedMesh(
      `thunder-bolt-glow:${width.toFixed(3)}:${variant}`,
      () => createLightningMesh(ctx.device, skyHeight, width * 3.4, 18, seed)
    );

    const core = ctx.createEntity(coreMesh, [coreMaterial], root);
    const glow = ctx.createEntity(glowMesh, [glowMaterial], root);
    for (const bolt of [core, glow]) {
      // La malla se construye a lo largo de Z y centrada: al girarla -90° en X
      // su longitud pasa a ser vertical. Escalar Z acorta el rayo desde arriba
      // sin regenerar geometría.
      bolt.setLocalEulerAngles(-90, 0, 0);
      bolt.setLocalScale(1, 1, 0.001);
      bolt.setLocalPosition(0, skyHeight, 0);
    }

    let detonated = false;
    ctx.addEffect(root, materials, boltLife, (t) => {
      const elapsed = t * boltLife;
      if (elapsed < fall) {
        // El rayo cae acelerando: el extremo superior queda fijo en el cielo
        // y la punta baja hasta el centro del área.
        const grow = Math.min(1, elapsed / fall);
        const scale = Math.max(0.001, grow * grow);
        for (const bolt of [core, glow]) {
          bolt.setLocalScale(1, 1, scale);
          bolt.setLocalPosition(0, skyHeight - (skyHeight * scale) / 2, 0);
        }
        coreMaterial.opacity = 0.95;
        glowMaterial.opacity = 0.35;
        return;
      }

      if (!detonated) {
        detonated = true;
        for (const bolt of [core, glow]) {
          bolt.setLocalScale(1, 1, 1);
          bolt.setLocalPosition(0, skyHeight / 2, 0);
        }
        // La explosión se crea con las anclas del área completa para que se
        // dibuje en todas las vistas que ven su borde, no solo el centro.
        ctx.withAnchors(areaAnchors(x, z, radius), () => {
          const first = ctx.effects.length;
          spawnExplosionAoe(ctx, x, z, radius, color, life);
          // Fija el estado inicial (escalas y opacidades) en el mismo frame del
          // impacto; si no, el área se dibujaría un frame con la escala por
          // defecto antes de que el bucle de efectos la anime.
          ctx.effects[first]?.update(0, 0);
        });
      }

      // Fogonazo de impacto: parpadeo aditivo que se apaga rápido.
      const fade = Math.max(0, 1 - (elapsed - fall) / 0.25);
      const flicker = 0.55 + Math.random() * 0.45;
      coreMaterial.opacity = 0.95 * fade * flicker;
      glowMaterial.opacity = 0.35 * fade * flicker;
    });
}

/**
   * Explosión eléctrica: destello central, cúpula de energía, tres ondas de
   * choque en el suelo, arcos que cruzan el diámetro, escombros que salen
   * despedidos y humo que se eleva. El relleno del suelo y la cúpula crecen
   * hasta el radio completo para que la deflagración ocupe toda el área
   * afectada, no solo el núcleo. Todo son transformaciones sobre geometría
   * estática; la silueta la marcan las ondas y los escombros.
   */
export function spawnExplosionAoe(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number): void {
const life = Math.max(0.3, duration);
    const root = new pc.Entity('explosion-aoe');
    root.setPosition(x, 0.03, z);
    ctx.app.root.addChild(root);

    const coreMaterial = ctx.createMaterial([255, 255, 236], 0.95);
    const hotMaterial = ctx.createMaterial([255, 232, 128], 0.5);
    const arcMaterial = ctx.createMaterial([170, 232, 255], 0.95);
    const fillMaterial = ctx.createWaterMaterial([255, 214, 92], 0.16);
    const flashMaterial = ctx.createMaterial([255, 250, 220], 0.32);
    const debrisMaterial = ctx.createWaterMaterial([255, 186, 64], 0.95);
    const smokeMaterial = ctx.createWaterMaterial([92, 80, 72], 0.4);
    const materials = [
      coreMaterial,
      hotMaterial,
      arcMaterial,
      fillMaterial,
      flashMaterial,
      debrisMaterial,
      smokeMaterial
    ];

    const core = ctx.createEntity(ctx.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.55, 0);

    const dome = ctx.createEntity(ctx.sphereMesh, [hotMaterial], root);
    dome.setLocalPosition(0, 0.5, 0);

    // Dos discos de suelo: el relleno tiñe todo el círculo de daño y el
    // destello barre el área en el primer instante. Sin ellos la deflagración
    // se quedaba concentrada en el centro y el borde del aro salía vacío.
    const fill = ctx.createEntity(ctx.discMesh, [fillMaterial], root);
    fill.setLocalPosition(0, 0.02, 0);
    const flashDisc = ctx.createEntity(ctx.discMesh, [flashMaterial], root);
    flashDisc.setLocalPosition(0, 0.03, 0);

    const rings: {
      entity: pc.Entity;
      material: pc.StandardMaterial;
      delay: number;
    }[] = [];
    for (let index = 0; index < 3; index++) {
      const material = ctx.createWaterMaterial(color, 0.8);
      materials.push(material);
      const ring = ctx.createEntity(ctx.torusMesh, [material], root);
      ring.setLocalPosition(0, 0.08 + index * 0.05, 0);
      rings.push({ entity: ring, material, delay: index * 0.11 });
    }

    const arcs: { entity: pc.Entity; yaw: number; speed: number }[] = [];
    const arcWidth = Math.max(0.018, radius * 0.02);
    for (let index = 0; index < 4; index++) {
      // Cada arco cruza el diámetro completo: al girar barren todo el
      // círculo, no solo el núcleo central. La malla es unitaria y se estira
      // en Z; así no se genera geometría nueva por casteo.
      const mesh = ctx.cachedMesh(
        `explosion-arc:${arcWidth.toFixed(3)}:${index}`,
        () =>
          createLightningMesh(
            ctx.device,
            1,
            arcWidth,
            8,
            7000 + index * 6151
          )
      );
      const arc = ctx.createEntity(mesh, [arcMaterial], root);
      arc.setLocalPosition(0, 0.45 + index * 0.05, 0);
      arc.setLocalScale(1, 1, radius * 2);
      arcs.push({
        entity: arc,
        yaw: (index / 4) * 360 + 22,
        speed: 40 + index * 35
      });
    }

    const debrisInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 14; index++) {
      const size = radius * (0.035 + Math.random() * 0.045);
      debrisInstances.push({
        anim0: [
          (index / 14) * Math.PI * 2 + Math.random() * 0.4,
          radius * (0.68 + Math.random() * 0.55),
          0.35 + Math.random() * 0.85,
          size
        ],
        anim1: [
          Math.random() * 360,
          (Math.random() - 0.5) * 160,
          0,
          0
        ]
      });
    }
    const debrisBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.boxMesh,
      material: debrisMaterial,
      instances: debrisInstances,
      motion: MOTION_EXPLOSION_DEBRIS,
      radius,
      life
    });

    const smokeInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 8; index++) {
      smokeInstances.push({
        anim0: [
          (index / 8) * Math.PI * 2 + Math.random() * 0.5,
          radius * (0.25 + Math.random() * 0.5),
          0.5 + Math.random() * 0.8,
          radius * (0.18 + Math.random() * 0.16)
        ]
      });
    }
    const smokeBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: smokeMaterial,
      instances: smokeInstances,
      motion: MOTION_EXPLOSION_SMOKE,
      radius,
      life
    });

    ctx.addEffect(root, materials, life, (t) => {
      const ease = 1 - Math.pow(1 - t, 3);
      const flash = Math.max(0, 1 - t / 0.22);

      // El relleno nace casi a tamaño completo para que el área afectada se
      // lea entera desde el primer frame; el destello la recorre aún más
      // rápido antes de apagarse.
      const fillGrow = Math.min(1, t / 0.12);
      const fillScale =
        radius * 2 * (0.2 + (1 - Math.pow(1 - fillGrow, 3)) * 0.8);
      fill.setLocalScale(fillScale, 1, fillScale);
      const flashGrow = Math.min(1, t / 0.08);
      const flashScale =
        radius * 2 * (0.3 + (1 - Math.pow(1 - flashGrow, 2)) * 0.7);
      flashDisc.setLocalScale(flashScale, 1, flashScale);

      const coreScale = radius * (0.32 + ease * 0.58);
      core.setLocalScale(coreScale, coreScale, coreScale);
      // La cúpula se abre hasta el borde del área y sigue visible mientras
      // crece, no solo durante el fogonazo inicial.
      const domeGrow = 1 - Math.pow(1 - Math.min(1, t / 0.45), 3);
      const domeScale = radius * (0.4 + domeGrow * 1.6);
      dome.setLocalScale(domeScale, domeScale * 0.6, domeScale);

      for (const ring of rings) {
        const local = Math.min(
          1,
          Math.max(0, (t - ring.delay) / 0.5)
        );
        const scale = radius * 2 * (0.14 + local * 0.86);
        ring.entity.setLocalScale(scale, 1, scale);
        // La onda mantiene brillo casi hasta el borde y se apaga justo al
        // cruzar el límite del área, para que el aro nunca quede vacío.
        const ringFade = Math.min(1, Math.max(0, 1 - local) * 3.2);
        ring.material.opacity =
          0.8 * ringFade * Math.max(0, 1 - t * 0.35);
      }

      const arcReveal = Math.min(1, t / 0.14);
      const arcFade = Math.max(0, 1 - t / 0.55);
      for (const arc of arcs) {
        arc.entity.setLocalEulerAngles(
          0,
          arc.yaw + t * arc.speed,
          Math.sin(t * 22 + arc.speed) * 12
        );
        arc.entity.setLocalScale(
          0.35 + arcReveal * 0.65,
          0.4 + arcReveal * 0.6,
          radius * 2 * (0.35 + arcReveal * 0.65)
        );
      }

      debrisBatch.setTime(t * life);
      smokeBatch.setTime(t * life);

      coreMaterial.opacity = 0.95 * flash;
      hotMaterial.opacity = 0.35 * Math.pow(1 - t, 1.2);
      arcMaterial.opacity = 0.95 * arcFade;
      fillMaterial.opacity = 0.16 * (1 - t);
      flashMaterial.opacity = 0.32 * flash * flash;
      debrisMaterial.opacity = 0.95 * (1 - t);
      smokeMaterial.opacity = 0.4 * (1 - t);
    });
}
