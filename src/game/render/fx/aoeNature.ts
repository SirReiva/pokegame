import type { FxRuntime } from './fxRuntime';
import * as pc from 'playcanvas';
import { EffectBatch, MOTION_GRASS_LEAVES, MOTION_POISON_BUBBLES, MOTION_POISON_DROPS, MOTION_POISON_POP_RINGS } from '../../effectBatch';
import type { EffectBatchInstance } from '../../effectBatch';

/**
   * Área de Planta: torbellino de hojas. Las hojas giran en espiral baja y
   * ancha, ocupando todo el radio del área, mientras un anillo tenue marca
   * el borde.
   */
export function spawnGrassAoe(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number): void {
const life = Math.max(0.2, duration);
    const root = new pc.Entity('grass-aoe');
    root.setPosition(x, 0.03, z);
    ctx.app.root.addChild(root);

    const ringMaterial = ctx.createMaterial(color, 0.3);
    const fillMaterial = ctx.createMaterial([84, 148, 56], 0.1);
    const leafMaterial = ctx.createLeafMaterial([226, 248, 190], 0.95);
    const hotLeafMaterial = ctx.createLeafMaterial([248, 255, 220], 0.95);
    const materials = [
      ringMaterial,
      fillMaterial,
      leafMaterial,
      hotLeafMaterial
    ];

    const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.1, 0);
    ring.setLocalScale(radius * 2, 1, radius * 2);

    const fill = ctx.createEntity(ctx.discMesh, [fillMaterial], root);
    fill.setLocalPosition(0, 0.03, 0);
    fill.setLocalScale(radius * 2, 1, radius * 2);

    ctx.spawnLeafParticles(
      root,
      {
        x: 0,
        y: 0.15,
        z: 0,
        extents: [radius * 0.7, 0.1, radius * 0.7],
        velocity: [0, 0.8, 0],
        velocityEnd: [0, 2, 0],
        radialSpeed: 0.9,
        radialSpeedEnd: 2.6,
        sizeStart: radius * 0.03,
        sizeMid: radius * 0.06,
        sizeEnd: radius * 0.025,
        lifetime: 0.8,
        rate: 0.012,
        numParticles: 120,
        localSpace: false
      },
      color
    );

    // El enjambre entero se dibuja con dos lotes instanciados (hojas normales y
    // hojas calientes). La posición, el giro y el fundido se calculan en el
    // vertex shader: la CPU no recorre 120 entidades por frame.
    const leafInstances: EffectBatchInstance[] = [];
    const hotLeafInstances: EffectBatchInstance[] = [];
    const leafCount = 120;
    for (let index = 0; index < leafCount; index++) {
      // Todas las hojas entran en el giro: se reparten por todo el radio y
      // ninguna forma una columna fija en el centro.
      const angle = Math.random() * Math.PI * 2;
      const radiusFactor = 0.32 + Math.sqrt(Math.random()) * 0.68;
      const size = radius * (0.045 + Math.random() * 0.05);
      const yaw = Math.random() * 360;
      const instance: EffectBatchInstance = {
        anim0: [
          angle,
          radiusFactor,
          Math.random(),
          0.7 + Math.random() * 0.55
        ],
        anim1: [0.8 + Math.random() * 0.5, size, yaw, 0]
      };
      if (index % 5 === 0) hotLeafInstances.push(instance);
      else leafInstances.push(instance);
    }
    const leafBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.leafMesh,
      material: leafMaterial,
      instances: leafInstances,
      motion: MOTION_GRASS_LEAVES,
      radius,
      life
    });
    const hotLeafBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.leafMesh,
      material: hotLeafMaterial,
      instances: hotLeafInstances,
      motion: MOTION_GRASS_LEAVES,
      radius,
      life
    });

    let time = 0;
    const animate = (_t: number, dt: number): void => {
      time += dt;
      const fadeIn = Math.min(1, time / 0.12);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.25));
      const envelope = Math.min(fadeIn, fadeOut);
      const pulse = 0.5 + Math.sin(time * 9) * 0.2;
      // Giro global del embudo, además del giro individual de cada hoja.
      root.setLocalEulerAngles(0, time * 1.4, 0);

      ringMaterial.opacity = (0.18 + pulse * 0.16) * envelope;
      fillMaterial.opacity = (0.05 + pulse * 0.04) * envelope;
      const ringScale = radius * 2 * (0.94 + pulse * 0.06);
      ring.setLocalScale(ringScale, 1, ringScale);

      leafBatch.setTime(time);
      hotLeafBatch.setTime(time);
      leafMaterial.opacity = 0.82 * envelope;
      hotLeafMaterial.opacity = 0.9 * envelope;
    };
    ctx.addEffect(root, materials, life, animate);
    animate(0, 0);
}

/**
   * Charco de lodo: disco de veneno en el suelo, sin aro, y burbujas 3D que
   * nacen del charco, suben y revientan durante toda la duración del área.
   * Cada burbuja es una esfera translúcida con dos brillos que giran sobre su
   * superficie (así se lee el volumen) y al reventar deja un aro y gotas del
   * color del veneno.
   */
export function spawnPoisonAoe(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number): void {
const life = Math.max(0.2, duration);
    const root = new pc.Entity('poison-aoe');
    root.setPosition(x, 0.03, z);
    ctx.app.root.addChild(root);

    const fillMaterial = ctx.createWaterMaterial(color, 0.1);
    // Las burbujas aclaran el color del veneno para que el volumen se lea
    // sobre el charco oscuro; los brillos casi blancos marcan el reflejo.
    const bubbleColor: [number, number, number] = [
      Math.min(255, color[0] + 52),
      Math.min(255, color[1] + 44),
      Math.min(255, color[2] + 48)
    ];
    const popColor: [number, number, number] = [
      Math.min(255, color[0] + 88),
      Math.min(255, color[1] + 76),
      Math.min(255, color[2] + 72)
    ];
    const bubbleMaterial = ctx.createWaterMaterial(bubbleColor, 0.42);
    const shineMaterial = ctx.createWaterMaterial([244, 224, 255], 0.9);
    const dropMaterial = ctx.createWaterMaterial(popColor, 0.85);
    // Un único material para todos los aros de pop: el desvanecido por
    // burbuja se sustituye por escala y por el fundido global del área.
    const popRingMaterial = ctx.createWaterMaterial(popColor, 0.8);
    const materials = [
      fillMaterial,
      bubbleMaterial,
      shineMaterial,
      dropMaterial,
      popRingMaterial
    ];

    const fill = ctx.createEntity(ctx.discMesh, [fillMaterial], root);
    fill.setLocalPosition(0, 0.03, 0);
    fill.setLocalScale(radius * 2, 1, radius * 2);

    const bubbleInstances: EffectBatchInstance[] = [];
    const highlightInstances: EffectBatchInstance[] = [];
    const popRingInstances: EffectBatchInstance[] = [];
    const dropInstances: EffectBatchInstance[] = [];
    const bubbleCount = Math.max(10, Math.round(radius * 8));
    // Los nacimientos se reparten por toda la duración para que el charco
    // burbujee sin pausas hasta el final.
    const latestBirth = Math.max(0, life - 0.6);
    for (let index = 0; index < bubbleCount; index++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = radius * Math.sqrt(Math.random()) * 0.82;
      const baseX = Math.cos(angle) * distance;
      const baseZ = Math.sin(angle) * distance;
      const size = radius * (0.06 + Math.random() * 0.1);
      const phase = Math.random() * Math.PI * 2;
      const birth = (index / bubbleCount) * latestBirth + Math.random() * 0.1;
      const rise = 0.62 + Math.random() * 0.4;
      const height = size * (1.8 + Math.random() * 2);
      const wobble = radius * (0.03 + Math.random() * 0.03);
      const anim0: [number, number, number, number] = [
        baseX,
        baseZ,
        size,
        birth
      ];
      const anim1: [number, number, number, number] = [
        rise,
        height,
        wobble,
        phase
      ];

      bubbleInstances.push({ anim0, anim1 });
      // Los dos brillos giran con la burbuja: la matriz base guarda su
      // desplazamiento y su escala relativa.
      highlightInstances.push({
        x: -0.22,
        y: 0.3,
        z: -0.18,
        sx: 0.3,
        sy: 0.3,
        sz: 0.3,
        anim0,
        anim1
      });
      highlightInstances.push({
        x: 0.2,
        y: -0.16,
        z: -0.22,
        sx: 0.13,
        sy: 0.13,
        sz: 0.13,
        anim0,
        anim1
      });
      popRingInstances.push({ anim0, anim1 });
      for (let dropIndex = 0; dropIndex < 3; dropIndex++) {
        dropInstances.push({
          anim0,
          anim1,
          anim2: [dropIndex, 0, 0, 0]
        });
      }
    }

    const bubbleBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: bubbleMaterial,
      instances: bubbleInstances,
      motion: MOTION_POISON_BUBBLES,
      radius,
      life
    });
    const highlightBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: shineMaterial,
      instances: highlightInstances,
      motion: MOTION_POISON_BUBBLES,
      radius,
      life
    });
    const popRingBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.torusMesh,
      material: popRingMaterial,
      instances: popRingInstances,
      motion: MOTION_POISON_POP_RINGS,
      radius,
      life
    });
    const dropBatch = new EffectBatch({
      app: ctx.app,
      parent: root,
      mesh: ctx.sphereMesh,
      material: dropMaterial,
      instances: dropInstances,
      motion: MOTION_POISON_DROPS,
      radius,
      life
    });

    let time = 0;
    const animate = (_t: number, dt: number): void => {
      time += dt;
      const fadeIn = Math.min(1, time / 0.16);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.3));
      const envelope = Math.min(fadeIn, fadeOut);
      const pulse = 0.5 + Math.sin(time * 7) * 0.2;

      // Sin aro, el disco es el que marca el área: sube la opacidad para que
      // el violeta se lea como un charco lleno y no como un tinte tenue.
      fillMaterial.opacity = (0.18 + pulse * 0.06) * envelope;
      bubbleMaterial.opacity = (0.34 + pulse * 0.1) * envelope;
      shineMaterial.opacity = 0.9 * envelope;
      dropMaterial.opacity = 0.85 * envelope;

      bubbleBatch.setTime(time);
      highlightBatch.setTime(time);
      popRingBatch.setTime(time);
      dropBatch.setTime(time);
      popRingMaterial.opacity = 0.8 * envelope;
    };
    ctx.addEffect(root, materials, life, animate);
    animate(0, 0);
}
