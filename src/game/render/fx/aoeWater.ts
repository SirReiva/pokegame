import type { FxRuntime } from './fxRuntime';
import * as pc from 'playcanvas';
import { EffectBatch, MOTION_PRESSURE_BAND, MOTION_PRESSURE_DOME, MOTION_PRESSURE_ORBIT, MOTION_PRIMORDIAL_POOL, MOTION_PRIMORDIAL_RING, MOTION_WATER_JETS } from '../../effectBatch';
import type { EffectBatchInstance } from '../../effectBatch';
import { createPressureDomeMesh, tintColor } from './fxGeometry';

/**
   * Área de agua: un disco tenue marca el radio, mientras varios chorros con
   * silueta de salpicadura brotan repartidos por toda la superficie. La textura
   * procedural dibuja la base estrecha, la corona ondulada, los brillos y las
   * gotas; los quads cruzados mantienen el volumen desde cualquier cámara. Los
   * chorros oscilan en altura y grosor con fases distintas para que el área
   * nunca parezca estática.
   */
export function spawnWaterAoe(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number): void {
const life = Math.max(0.3, duration);
    const root = new pc.Entity('water-aoe');
    root.setPosition(x, 0.03, z);
    ctx.app.root.addChild(root);

    const fillMaterial = ctx.createWaterMaterial(color, 0.07);
    const jetMaterial = ctx.createVertexColorMaterial(0.92);
    const materials = [fillMaterial, jetMaterial];

    const fill = ctx.createEntity(ctx.discMesh, [fillMaterial], root);
    fill.setLocalPosition(0, 0.01, 0);
    fill.setLocalScale(radius * 2, 1, radius * 2);

    // Los 18 chorros se reparten en cuatro lotes, uno por variante de malla.
    // Así se conservan las siluetas distintas con cuatro draw calls en vez de
    // dieciocho entidades animadas desde JavaScript.
    const jetInstances: EffectBatchInstance[][] = ctx.waterJetMeshes.map(
      () => []
    );
    const jetCount = 18;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let index = 0; index < jetCount; index++) {
      // Reparto por área (sqrt) para que los chorros no se apelotonen en el centro.
      const angle = index * goldenAngle + (Math.random() - 0.5) * 0.18;
      const distance =
        radius * (0.12 + Math.sqrt((index + 0.5) / jetCount) * 0.8);
      const px = Math.cos(angle) * distance;
      const pz = Math.sin(angle) * distance;
      const width = radius * (0.19 + Math.random() * 0.06);
      const height = radius * (0.35 + Math.random() * 0.18);
      const phase = (index / jetCount) * Math.PI * 2 + Math.random() * 0.5;
      // 2-3,2 ciclos/s: un sube y baja claramente más rápido que el respiradero
      // lento original, pero sin parpadear.
      const speed = 2 + Math.random() * 1.2;
      const spin = Math.random() * Math.PI;
      jetInstances[index % ctx.waterJetMeshes.length].push({
        anim0: [px, pz, phase, speed],
        anim1: [width, height, spin, 0]
      });
    }
    const jetBatches = jetInstances.map(
      (instances, index) =>
        new EffectBatch({
          app: ctx.app,
          parent: root,
          mesh: ctx.waterJetMeshes[index],
          material: jetMaterial,
          instances,
          motion: MOTION_WATER_JETS,
          radius,
          life
        })
    );

    let time = 0;
    const animate = (_t: number, dt: number): void => {
      time += dt;
      const fadeIn = Math.min(1, time / 0.12);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.25));
      const envelope = Math.min(fadeIn, fadeOut);

      fillMaterial.opacity = 0.06 * envelope;
      const fillScale = radius * 2 * (0.97 + Math.sin(time * 5) * 0.02);
      fill.setLocalScale(fillScale, 1, fillScale);

      for (const batch of jetBatches) batch.setTime(time);
      jetMaterial.opacity = 0.92 * envelope;
    };
    ctx.addEffect(root, materials, life, animate);
    animate(0, 0);
}

/**
   * Doble cúpula de presión de `Pulso Primigenio`, animada íntegramente en GPU.
   *
   * Cada pulso abre una semiesfera de agua comprimida que crece desde el suelo,
   * vibra como una membrana y colapsa antes del golpe siguiente. El estanque
   * mantiene el área entre beats; las bandas de refracción siguen la superficie
   * de la cúpula y las gotas orbitan dentro del volumen.
   * No hay chorros verticales: la CPU solo crea los lotes y avanza
   * `uEffectTime`, sin transforms ni opacidades por frame.
   */
export function spawnPrimordialPulseAoe(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number): void {
// La vida visual sobrevive un poco al último tick para que la segunda
    // cúpula pueda colapsar sin cortarse en seco. Los dos golpes siguen
    // ocurriendo a 0 s y 0,5 s; esto solo cambia la forma de apagarse.
    const life = Math.max(1, duration + 0.35);
    const root = new pc.Entity('primordial-pulse-aoe');
    root.setPosition(x, 0.03, z);
    ctx.app.root.addChild(root);

    // El estanque usa un azul más profundo que el color de la habilidad; la
    // cúpula y las crestas se aclaran hacia el blanco para separar capas.
    const deepColor: [number, number, number] = [
      Math.round(color[0] * 0.44),
      Math.round(color[1] * 0.54),
      Math.round(color[2] * 0.78)
    ];
    const glowColor = tintColor(color, 0.45);
    const whiteColor: [number, number, number] = [236, 253, 255];
    // Verde-cyan reservado para la curación: no comparte tono con el daño.
    const healColor: [number, number, number] = [104, 246, 198];
    const healCoreColor: [number, number, number] = [186, 255, 228];

    const poolMaterial = ctx.createWaterMaterial(deepColor, 0.18);
    const shimmerMaterial = ctx.createWaterMaterial(glowColor, 0.07);
    const domeMaterial = ctx.createVertexColorMaterial(0.13);
    const innerDomeMaterial = ctx.createVertexColorMaterial(
      0.2,
      pc.BLEND_ADDITIVEALPHA
    );
    const coreDomeMaterial = ctx.createVertexColorMaterial(
      0.26,
      pc.BLEND_ADDITIVEALPHA
    );
    const bandMaterial = ctx.createWaterMaterial(whiteColor, 0.42);
    const dropletMaterial = ctx.createMaterial(whiteColor, 0.42);
    const shockMaterial = ctx.createWaterMaterial(whiteColor, 0.8);
    const healCoreMaterial = ctx.createWaterMaterial(healCoreColor, 0.75);
    const healHaloMaterial = ctx.createWaterMaterial(healColor, 0.22);
    const materials = [
      poolMaterial,
      shimmerMaterial,
      domeMaterial,
      innerDomeMaterial,
      coreDomeMaterial,
      bandMaterial,
      dropletMaterial,
      shockMaterial,
      healCoreMaterial,
      healHaloMaterial
    ];

    const batches: EffectBatch[] = [];
    const addBatch = (
      mesh: pc.Mesh,
      material: pc.StandardMaterial,
      motion: string,
      instance: EffectBatchInstance,
      params?: readonly [number, number, number, number]
    ): void => {
      batches.push(
        new EffectBatch({
          app: ctx.app,
          parent: root,
          mesh,
          material,
          instances: [instance],
          motion,
          radius,
          life,
          params
        })
      );
    };

    // --- Estanque y borde -------------------------------------------------
    // El disco profundo mantiene el área legible entre los dos golpes.
    addBatch(
      ctx.discMesh,
      poolMaterial,
      MOTION_PRIMORDIAL_POOL,
      { anim0: [0.34, 0, 0, 0], anim1: [0.6, 1, 0.025, 0] },
      [0.22, 0.12, 0.35, 0]
    );
    addBatch(
      ctx.discMesh,
      shimmerMaterial,
      MOTION_PRIMORDIAL_POOL,
      { anim0: [0.52, 1.7, 0, 0], anim1: [0.44, 0.84, 0.05, 0] },
      [0.18, 0.16, 0.32, 0]
    );

    // --- Cúpulas de presión ----------------------------------------------
    // Cada beat tiene tres cáscaras: volumen oscuro, membrana luminosa y
    // núcleo brillante. La segunda cúpula es más ancha y más alta.
    type Beat = readonly [number, number, number, number];
    const firstBeat: Beat = [0, 0.06, 0.3, 0.16];
    const secondBeat: Beat = [0.36, 0.14, 0.64, 0.32];
    const domeMesh = ctx.cachedMesh('pressure-dome', () =>
      createPressureDomeMesh(ctx.device)
    );
    const addDome = (
      material: pc.StandardMaterial,
      beat: Beat,
      peakScale: number,
      heightScale: number,
      wobble: number,
      phase: number
    ): void => {
      batches.push(
        new EffectBatch({
          app: ctx.app,
          parent: root,
          mesh: domeMesh,
          material,
          instances: [
            {
              anim0: [beat[0], beat[1], beat[2], beat[3]],
              anim1: [peakScale, heightScale, wobble, phase]
            }
          ],
          motion: MOTION_PRESSURE_DOME,
          radius,
          life
        })
      );
    };
    addDome(domeMaterial, firstBeat, 0.82, 0.55, 0.025, 0);
    addDome(innerDomeMaterial, firstBeat, 0.68, 0.48, 0.04, 0.9);
    addDome(coreDomeMaterial, firstBeat, 0.34, 0.4, 0.06, 1.7);
    addDome(domeMaterial, secondBeat, 1, 0.62, 0.035, 2.4);
    addDome(innerDomeMaterial, secondBeat, 0.86, 0.56, 0.05, 3.3);
    addDome(coreDomeMaterial, secondBeat, 0.46, 0.46, 0.075, 4.1);

    // --- Refracción sobre la cúpula --------------------------------------
    // Un solo lote para las seis bandas: siguen la escala del beat y su
    // latitud, así que se leen pegadas a la superficie mientras crece.
    const bandInstances: EffectBatchInstance[] = [];
    const addBands = (
      beat: Beat,
      peakScale: number,
      heightScale: number
    ): void => {
      const heights = [0.26, 0.56, 0.84];
      for (let index = 0; index < heights.length; index++) {
        bandInstances.push({
          anim0: [beat[0], beat[1], beat[2], beat[3]],
          anim1: [
            heights[index],
            peakScale * 0.98,
            peakScale * heightScale,
            index * 0.018
          ]
        });
      }
    };
    addBands(firstBeat, 0.82, 0.55);
    addBands(secondBeat, 1, 0.62);
    batches.push(
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.torusMesh,
        material: bandMaterial,
        instances: bandInstances,
        motion: MOTION_PRESSURE_BAND,
        radius,
        life
      })
    );

    // --- Gotas suspendidas ------------------------------------------------
    // Reparto determinista en espiral: orbitan dentro del volumen y se
    // encogen en el hueco entre pulsos, sin salir nunca hacia arriba.
    const dropletInstances: EffectBatchInstance[] = [];
    const dropletCount = 52;
    for (let index = 0; index < dropletCount; index++) {
      const angle = index * 2.399963229728653;
      const radial = 0.32 + ((index * 0.61803398875) % 1) * 0.62;
      const height = ((index * 0.754877666) % 1) * 0.94;
      const speed = 0.32 + ((index * 7) % 9) * 0.05;
      const size = radius * (0.009 + ((index * 11) % 5) * 0.0018);
      dropletInstances.push({
        anim0: [angle, radial, height, speed],
        anim1: [size, index * 0.73, 0, 0]
      });
    }
    batches.push(
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.sphereMesh,
        material: dropletMaterial,
        instances: dropletInstances,
        motion: MOTION_PRESSURE_ORBIT,
        radius,
        life
      })
    );

    // --- Ondas de choque en el suelo --------------------------------------
    batches.push(
      new EffectBatch({
        app: ctx.app,
        parent: root,
        mesh: ctx.torusMesh,
        material: shockMaterial,
        instances: [
          { anim0: [0, 0.26, 0.1, 1.03], anim1: [0.04, 0.05, 0, 0] },
          { anim0: [0.4, 0.34, 0.18, 1.06], anim1: [0.06, 0.05, 0, 0] }
        ],
        motion: MOTION_PRIMORDIAL_RING,
        radius,
        life,
        params: [0.08, 0.34, 0, 0]
      })
    );

    // --- Onda curativa del segundo pulso ----------------------------------
    // Verde-cyan para distinguirla del daño; nace con el tick que cura.
    addBatch(
      ctx.torusMesh,
      healCoreMaterial,
      MOTION_PRIMORDIAL_RING,
      { anim0: [0.44, 0.42, 0.22, 1.02], anim1: [0.05, 0.07, 0.04, 0] },
      [0.04, 0.3, 0, 0]
    );
    addBatch(
      ctx.psychicRingMesh,
      healHaloMaterial,
      MOTION_PRIMORDIAL_RING,
      { anim0: [0.46, 0.48, 0.3, 1.08], anim1: [0.08, 0.04, 0.02, 0] },
      [0.06, 0.34, 0, 0]
    );

    let time = 0;
    const animate = (_t: number, dt: number): void => {
      // Toda la animación vive en el vertex shader; solo avanza el reloj.
      time += dt;
      for (const batch of batches) batch.setTime(time);
    };
    ctx.addEffect(root, materials, life, animate);
    animate(0, 0);
}
