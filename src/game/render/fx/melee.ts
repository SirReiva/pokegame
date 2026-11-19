import type { FxRuntime } from './fxRuntime';
import * as pc from 'playcanvas';
import type { ImpactStyle } from '../../abilities';
import { DEG } from '../../config';
import { EffectBatch, MOTION_MELEE_LEAVES, MOTION_MELEE_PUFFS, MOTION_SPORE_SWARM, MOTION_STATIC, MOTION_TINT_MELEE_ARCS, MOTION_TINT_MELEE_WAVES } from '../../effectBatch';
import type { EffectBatchInstance } from '../../effectBatch';
import { EffectTintBatch } from './effectTintBatch';
import type { TintEffectInstance } from './effectTintBatch';
import { MELEE_ARC_OPACITY, createArcMesh, createSlashStreakSetMesh } from './fxGeometry';
import type { SlashStreakSpec } from './fxGeometry';
import { spawnVineWhip } from './vineWhip';

/**
   * Arco de golpe cuerpo a cuerpo, orientado hacia el `facing` del actor.
   * `markerColor` tiñe solo la guía del área (el cono); el resto del efecto
   * conserva el color de la habilidad.
   */
export function spawnMelee(ctx: FxRuntime, x: number,
    z: number,
    yaw: number,
    range: number,
    halfAngleDeg: number,
    color: readonly [number, number, number],
    style: ImpactStyle = 'hit',
    markerColor?: readonly [number, number, number]): void {
// La mordida materializa una mandíbula 3D en el centro del cono, pero
    // mantiene el arco melee como guía del área de golpe.
    if (style === 'jaw') {
      const forward = range * 0.3;
      const centerX = x + Math.sin(yaw) * forward;
      const centerZ = z + Math.cos(yaw) * forward;
      ctx.withAnchors(
        [
          [x, z],
          [centerX, centerZ]
        ],
        () => {
          spawnJawBite(ctx, centerX, centerZ, yaw, range * 0.56, 1);
        }
      );
    }

    // El Látigo Cepa sustituye el abanico plano por dos zarcillos 3D. El arco
    // se mantiene como guía tenue del alcance (ver `MELEE_ARC_OPACITY.vine`).
    if (style === 'vine') {
      spawnVineWhip(ctx, x, z, yaw, range, halfAngleDeg, color);
    }

    const mesh = createArcMesh(
      ctx.device,
      range,
      Math.max(8, halfAngleDeg) * DEG,
      18
    );
    // La mordida mantiene el cono como guía, pero en blanco como los colmillos.
    // Si llega el color del equipo, manda sobre ambos: la guía del área debe
    // identificar al lanzador.
    const arcColor: readonly [number, number, number] =
      markerColor ?? (style === 'jaw' ? [255, 255, 255] : color);
    const material = ctx.createMaterial(arcColor, 0.85);
    const entity = ctx.createEntity(mesh, [material]);
    entity.setPosition(x, 0.35, z);
    entity.setEulerAngles(0, yaw / DEG, 0);

    const materials = [material];
    const halfAngle = Math.max(8, halfAngleDeg) * DEG;
    let effectDuration = 0.28;
    let leafBatch: EffectBatch | null = null;
    if (style === 'grass') {
      // Hojas que salen despedidas dentro del arco para dar cuerpo al latigazo.
      const leafMaterial = ctx.createLeafMaterial(color, 0.95);
      materials.push(leafMaterial);
      const leafInstances: EffectBatchInstance[] = [];
      for (let index = 0; index < 9; index++) {
        const angle = -halfAngle + (index / 8) * halfAngle * 2;
        const distance = range * (0.45 + ((index * 7) % 10) / 10 * 0.5);
        leafInstances.push({
          anim0: [
            Math.sin(angle) * distance,
            Math.cos(angle) * distance,
            (index * 47) % 360,
            -20 + (index % 5) * 10
          ],
          anim1: [
            0.24 + (index % 3) * 0.05,
            0.42 + (index % 4) * 0.06,
            0,
            0
          ]
        });
      }
      leafBatch = new EffectBatch({
        app: ctx.app,
        parent: entity,
        mesh: ctx.leafMesh,
        material: leafMaterial,
        instances: leafInstances,
        motion: MOTION_MELEE_LEAVES,
        life: effectDuration
      });
    }

    let waveBatch: EffectTintBatch | null = null;
    if (style === 'psychic') {
      // Onda sonora psíquica: frentes curvos que nacen en el lanzador y
      // recorren el cono hasta su borde. Cada frente se deforma en Y como una
      // cinta ondulada. Se usan dos tonos del color de la habilidad y mezcla
      // normal: con aditivo el violeta se lavaba a blanco sobre terrenos claros.
      // Las cinco ondas se dibujan en un único lote con tinte y alfa por
      // instancia.
      effectDuration = 0.75;
      material.opacity = 0.14;
      const highlightTint: [number, number, number] = [
        Math.round(color[0] + (255 - color[0]) * 0.32),
        Math.round(color[1] + (255 - color[1]) * 0.32),
        Math.round(color[2] + (255 - color[2]) * 0.32)
      ];
      const travel = 0.42;
      const waveInstances: TintEffectInstance[] = [];
      for (let index = 0; index < 5; index++) {
        const highlight = index % 2 === 0;
        const delay = index * 0.07;
        waveInstances.push({
          color: highlight ? highlightTint : color,
          alpha: highlight ? 0.9 : 0.75,
          fade: [delay, travel * 0.12, travel * 0.7, travel * 0.3],
          anim0: [delay, travel, 0.12 + index * 0.012, 0],
          anim1: [0.14 + index * 0.012, index * 1.7, 4 + (index % 3), 0]
        });
      }
      waveBatch = new EffectTintBatch({
        app: ctx.app,
        parent: entity,
        mesh: ctx.cachedArcBand(0.94, 1, halfAngle, 30),
        instances: waveInstances,
        motion: MOTION_TINT_MELEE_WAVES,
        radius: range,
        life: effectDuration,
        boundsHalf: [range + 1, 1, range + 1]
      });
    }

    let clawMaterial: pc.StandardMaterial | null = null;
    if (
      style === 'slash' ||
      style === 'steel' ||
      style === 'dark' ||
      style === 'ghost'
    ) {
      // Tres zarpas blancas paralelas tumbadas sobre el cono: cubren su
      // superficie desde el lanzador hasta el borde y comparten apertura, así
      // que se leen como un único tajo de tres filos dentro del área de golpe.
      // Cada zarpa es una sola cinta continua que se enciende de golpe con un
      // pequeño retardo respecto a la anterior. Antes se partía en diez tramos
      // con un material por tramo y se encendían de uno en uno: en los frames
      // intermedios solo se veían trozos sueltos y el zarpazo parecía roto o
      // flotando. La Garra Metal usa dos filos de acero, el Tajo Umbrío dos
      // violetas y el Lengüetazo tres trazos fantasmales.
      const steel = style === 'steel';
      const dark = style === 'dark';
      const ghost = style === 'ghost';
      effectDuration = steel ? 0.3 : dark ? 0.32 : ghost ? 0.34 : 0.38;
      material.opacity = steel ? 0.08 : dark ? 0.09 : ghost ? 0.08 : 0.1;
      const span = halfAngle * 1.9;
      const start = -span * 0.5;
      const clawTint: [number, number, number] = steel
        ? [214, 232, 255]
        : dark
          ? [210, 180, 255]
          : ghost
            ? [206, 178, 255]
            : [255, 255, 255];
      const claws: {
        inner: number;
        outer: number;
        delay: number;
        peak: number;
      }[] =
        steel || dark
          ? [
              { inner: 0.66, outer: 0.99, delay: 0, peak: 1 },
              { inner: 0.2, outer: 0.58, delay: 0.04, peak: 0.9 }
            ]
          : [
              { inner: 0.74, outer: 0.99, delay: 0, peak: 1 },
              { inner: 0.42, outer: 0.68, delay: 0.03, peak: 0.95 },
              { inner: 0.1, outer: 0.36, delay: 0.06, peak: 0.9 }
            ];
      // La zarpa fantasma se mantiene pegada al cono: a media altura de un
      // cuerpo pequeño parecía flotar sobre el suelo, sobre todo con la cámara
      // inclinada.
      const liftStart = ghost ? 0.04 : 0.1;
      const liftEnd = ghost ? 0.09 : 0.2;
      const bow = ghost ? 0.02 : 0.04;
      const materialForClaws = ctx.createMaterial(clawTint, 0);
      materialForClaws.blendType = pc.BLEND_NORMAL;
      materialForClaws.opacity = 0;
      materialForClaws.update();
      materials.push(materialForClaws);
      clawMaterial = materialForClaws;

      // Las garras comparten material y se funden en una sola malla: el
      // zarpazo completo cuesta una entidad en vez de una por filo. La
      // geometría se cachea por estilo y alcance.
      const specs: SlashStreakSpec[] = claws.map((claw, index) => ({
        innerRadius: range * claw.inner,
        outerRadius: range * claw.outer,
        halfThickness: range * 0.07,
        angleStart: start,
        angleSweep: span,
        segments: 32,
        liftStart,
        liftEnd,
        bow,
        phase: index * 1.9
      }));
      const clawMesh = ctx.cachedMesh(
        `slash-streak-set:${range.toFixed(3)}:${span.toFixed(3)}:${liftStart}:${liftEnd}:${bow}:${claws.map((claw) => `${claw.inner}-${claw.outer}`).join('|')}`,
        () => createSlashStreakSetMesh(ctx.device, specs)
      );
      ctx.createEntity(clawMesh, [materialForClaws], entity);
    }

    let attackArcBatch: EffectTintBatch | null = null;
    if (style === 'arc' || style === 'fighting' || style === 'air') {
      // Arco de ataque: tres frentes curvos que salen del lanzador y recorren
      // el cono hasta su borde, marcando la dirección y el alcance del golpe.
      // La geometría es estática (radio 1) y solo se escala, así el trazo es
      // barato y se ve desde cualquier cámara. Combate Cercano añade un cuarto
      // frente y los acelera para que se lea como una ráfaga. Ataque Aéreo usa
      // los mismos frentes con el blanco cálido del viento.
      const fighting = style === 'fighting';
      effectDuration = fighting ? 0.4 : 0.34;
      material.opacity = 0.16;
      const frontCount = fighting ? 4 : 3;
      const travel = fighting ? 0.17 : 0.2;
      const arcInstances: TintEffectInstance[] = [];
      for (let index = 0; index < frontCount; index++) {
        const delay = index * (fighting ? 0.035 : 0.05);
        arcInstances.push({
          color,
          alpha: 1 - index * (fighting ? 0.14 : 0.15),
          fade: [delay, travel * 0.18, travel * 0.18, travel * 0.82],
          anim0: [delay, travel, 0.28, 0.12 + index * 0.035]
        });
      }
      attackArcBatch = new EffectTintBatch({
        app: ctx.app,
        parent: entity,
        mesh: ctx.cachedArcBand(0.84, 1, halfAngle, 26),
        instances: arcInstances,
        motion: MOTION_TINT_MELEE_ARCS,
        radius: range,
        life: effectDuration,
        boundsHalf: [range + 1, 1, range + 1]
      });
    }

    let cloudMaterial: pc.StandardMaterial | null = null;
    let cloudHotMaterial: pc.StandardMaterial | null = null;
    let cloudBatch: EffectBatch | null = null;
    let cloudHotBatch: EffectBatch | null = null;
    let sporeBatch: EffectBatch | null = null;
    if (style === 'spore') {
      // Rocío en abanico: cada partícula nace en el vértice del cono y viaja
      // hacia un ángulo distinto del borde, cubriendo toda la abertura. El
      // enjambre entero se resuelve en un solo lote instanciado.
      effectDuration = 1;
      material.opacity = 0.28;
      const sporeMaterial = ctx.createSporeMaterial([92, 158, 70], 0.92);
      materials.push(sporeMaterial);
      const sporeInstances: EffectBatchInstance[] = [];
      const sporeCount = 104;
      for (let index = 0; index < sporeCount; index++) {
        const angle =
          -halfAngle * 0.95 +
          (index / (sporeCount - 1)) * halfAngle * 1.9 +
          (Math.random() - 0.5) * 0.03;
        const size = 0.055 + Math.random() * 0.07;
        sporeInstances.push({
          anim0: [
            angle,
            range * (0.6 + Math.random() * 0.4),
            0.18 + Math.random() * 0.62,
            Math.random() * 0.16
          ],
          anim1: [
            0.42 + Math.random() * 0.28,
            size,
            Math.random() * Math.PI * 2,
            0
          ]
        });
      }
      sporeBatch = new EffectBatch({
        app: ctx.app,
        parent: entity,
        mesh: ctx.leafMesh,
        material: sporeMaterial,
        instances: sporeInstances,
        motion: MOTION_SPORE_SWARM
      });
    }
    if (style === 'poison') {
      // Nube violeta: puffs esféricos que avanzan por el cono y motas aditivas
      // que se dispersan hacia delante y hacia arriba.
      effectDuration = 0.62;
      cloudMaterial = ctx.createMaterial([146, 78, 186], 0.26);
      cloudHotMaterial = ctx.createMaterial([214, 168, 236], 0.2);
      materials.push(cloudMaterial, cloudHotMaterial);

      ctx.spawnSporeParticles(
        entity,
        {
          x: 0,
          y: 0.5,
          z: range * 0.55,
          extents: [range * 0.42, 0.3, range * 0.35],
          velocity: [0, 0.35, 0.5],
          velocityEnd: [0, 0.9, 1.3],
          radialSpeed: 0.2,
          radialSpeedEnd: 0.95,
          sizeStart: 0.2,
          sizeMid: 0.44,
          sizeEnd: 0.18,
          lifetime: 0.5,
          rate: 0.03,
          numParticles: 44,
          localSpace: true
        },
        color
      );

      const cloudInstances: EffectBatchInstance[] = [];
      const cloudHotInstances: EffectBatchInstance[] = [];
      for (let index = 0; index < 7; index++) {
        const spread = (-1 + (index / 6) * 2) * halfAngle * 0.72;
        const distance = range * (0.32 + ((index * 3) % 10) / 10 * 0.42);
        const size = 0.3 + ((index * 7) % 10) / 10 * 0.28;
        const yaw = Math.random() * 360;
        const instance: EffectBatchInstance = {
          anim0: [
            Math.sin(spread) * distance,
            0.4 + ((index * 5) % 10) / 10 * 0.35,
            Math.cos(spread) * distance,
            yaw
          ],
          anim1: [size, 0, 0, 0]
        };
        if (index % 3 === 0) cloudHotInstances.push(instance);
        else cloudInstances.push(instance);
      }
      cloudBatch = new EffectBatch({
        app: ctx.app,
        parent: entity,
        mesh: ctx.sphereMesh,
        material: cloudMaterial,
        instances: cloudInstances,
        motion: MOTION_MELEE_PUFFS,
        life: effectDuration
      });
      cloudHotBatch = new EffectBatch({
        app: ctx.app,
        parent: entity,
        mesh: ctx.sphereMesh,
        material: cloudHotMaterial,
        instances: cloudHotInstances,
        motion: MOTION_MELEE_PUFFS,
        life: effectDuration
      });
    }

    // La malla del arco es exclusiva de este efecto: al destruir la entidad,
    // su MeshInstance la libera y PlayCanvas se encarga de destruirla.
    const arcOpacity = MELEE_ARC_OPACITY[style] ?? 0.85;
    let time = 0;
    ctx.addEffect(entity, materials, effectDuration, (t, dt) => {
      time += dt;
      material.opacity = arcOpacity * (1 - t);
      if (
        style !== 'psychic' &&
        style !== 'slash' &&
        style !== 'steel' &&
        style !== 'arc' &&
        style !== 'fighting' &&
        style !== 'dark' &&
        style !== 'ghost' &&
        style !== 'air'
      ) {
        const scale = 0.92 + 0.12 * t;
        entity.setLocalScale(scale, 1, scale);
      }
      attackArcBatch?.setTime(time);
      const now = t * effectDuration;
      if (clawMaterial) {
        // Encendido rápido y continuo de la zarpa completa, con el desfase
        // mínimo del primer filo.
        const appear = Math.min(1, Math.max(0, now / 0.05));
        const fadeOut =
          1 - Math.min(1, Math.max(0, (now - 0.2) / (effectDuration - 0.2)));
        clawMaterial.opacity = appear * Math.max(0, fadeOut);
      }
      leafBatch?.setTime(time);
      sporeBatch?.setTime(time);
      waveBatch?.setTime(time);

      if (cloudMaterial) cloudMaterial.opacity = 0.26 * (1 - t);
      if (cloudHotMaterial) cloudHotMaterial.opacity = 0.2 * (1 - t);
      cloudBatch?.setTime(time);
      cloudHotBatch?.setTime(time);
    }, [
      [x, z],
      [x + Math.sin(yaw) * range, z + Math.cos(yaw) * range]
    ]);
}

/**
   * Mandíbula espectral: dos filas de colmillos 3D que giran sobre una bisagra
   * en la garganta, así que la boca se abre y se cierra como una mordida de
   * verdad. Los dientes reutilizan el cono compartido de roca y el efecto es
   * barato.
   */
export function spawnJawBite(ctx: FxRuntime, x: number,
    z: number,
    yaw: number,
    radius: number,
    effectiveness: number): void {
const root = new pc.Entity('jaw-bite');
    root.setPosition(x, 0, z);
    root.setEulerAngles(0, yaw / DEG, 0);
    ctx.app.root.addChild(root);

    const power = effectiveness > 1 ? 1.16 : effectiveness < 1 ? 0.9 : 1;
    const size = Math.max(0.5, radius * power);
    const arcRadius = size * 0.72;
    const arcCenterZ = size * 0.12;
    const halfAngle = 0.95;
    const hinge = size * 0.16;

    // Colmillos blancos con facetas: emisión alta para que no se apaguen a gris
    // en las caras en sombra.
    const toothMaterial = ctx.createRockMaterial([255, 255, 255], 1);
    toothMaterial.emissive = new pc.Color(0.88, 0.88, 0.92);
    toothMaterial.emissiveIntensity = 1;
    toothMaterial.update();
    const materials = [toothMaterial];

    const mouth = new pc.Entity('jaw-mouth');
    root.addChild(mouth);
    mouth.setLocalPosition(0, 1.02, 0);
    // La abertura se inclina un poco hacia la cámara para que las dos filas de
    // colmillos se lean como una boca abierta y no solo su canto superior.
    mouth.setLocalEulerAngles(-18, 0, 0);

    const upper = new pc.Entity('jaw-upper');
    const lower = new pc.Entity('jaw-lower');
    // Las filas se separan un poco en profundidad: así los colmillos se
    // intercalan al cerrarse en vez de atravesarse.
    upper.setLocalPosition(0, hinge, size * 0.03);
    lower.setLocalPosition(0, -hinge, -size * 0.03);
    mouth.addChild(upper);
    mouth.addChild(lower);

    const upperInstances: EffectBatchInstance[] = [];
    const lowerInstances: EffectBatchInstance[] = [];
    const addToothRow = (
      facingUp: boolean,
      target: EffectBatchInstance[]
    ): void => {
      // La fila inferior va desfasada media pieza para que los colmillos se
      // intercalen al cerrarse, como una cremallera.
      const count = facingUp ? 10 : 11;
      const step = (2 * halfAngle) / 10;
      const start = facingUp ? -halfAngle + step * 0.5 : -halfAngle;
      for (let index = 0; index < count; index++) {
        const angle = start + step * index;
        if (Math.abs(angle) > halfAngle + 0.001) continue;
        const center = 1 - Math.abs(angle) / halfAngle;
        const length = size * (0.25 + center * 0.1 + (index % 2) * 0.02);
        const width = size * (0.095 + center * 0.04);
        // Los colmillos se abren en abanico hacia fuera de la boca.
        const fan = (angle / DEG) * 0.35;
        target.push({
          x: Math.sin(angle) * arcRadius,
          y: (facingUp ? 1 : -1) * length * 0.5,
          z: arcCenterZ + Math.cos(angle) * arcRadius,
          sx: width,
          sy: length,
          sz: width,
          rx: facingUp ? 0 : 180,
          rz: -fan
        });
      }
    };
    addToothRow(false, upperInstances);
    addToothRow(true, lowerInstances);

    new EffectBatch({
      app: ctx.app,
      parent: upper,
      mesh: ctx.rockSpikeMesh,
      material: toothMaterial,
      instances: upperInstances,
      motion: MOTION_STATIC
    });
    new EffectBatch({
      app: ctx.app,
      parent: lower,
      mesh: ctx.rockSpikeMesh,
      material: toothMaterial,
      instances: lowerInstances,
      motion: MOTION_STATIC
    });

    ctx.addEffect(root, materials, 0.5, (t) => {
      const grow = Math.min(1, t / 0.14);
      const scale = 0.5 + grow * 0.5;
      mouth.setLocalScale(scale, scale, scale);

      // Se abre del todo y se cierra de golpe al tercio del efecto. Después
      // rebota un poco, como una mandíbula que acaba de triturar.
      let open: number;
      if (t < 0.18) open = 0.55 + (0.45 * t) / 0.18;
      else if (t < 0.3) {
        const close = (t - 0.18) / 0.12;
        open = 1 - close * close;
      } else if (t < 0.38) {
        open = -0.05 * Math.sin(((t - 0.3) / 0.08) * Math.PI);
      } else {
        open = 0;
      }
      upper.setLocalEulerAngles((-0.66 * open) / DEG, 0, 0);
      lower.setLocalEulerAngles((0.6 * open) / DEG, 0, 0);

      const shake = t > 0.3 && t < 0.42 ? Math.sin(t * 260) * 0.012 : 0;
      mouth.setLocalPosition(
        shake,
        1.02 + Math.sin(t * 46) * 0.008,
        Math.sin(t * 37) * 0.006
      );

      const fade = t < 0.62 ? 1 : 1 - (t - 0.62) / 0.38;
      // Blanco ligeramente translúcido: conserva el volumen sin verse macizo.
      toothMaterial.opacity = 0.8 * fade;
    });
}
