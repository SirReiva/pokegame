import type { FxRuntime } from './fxRuntime';
import * as pc from 'playcanvas';
import type { ImpactStyle } from '../../abilities';
import { DEG } from '../../config';
import { EffectBatch, applyVertexEffectShader, MOTION_PSYCHIC_WAVE, MOTION_SPORE_SWARM } from '../../effectBatch';
import type { EffectBatchInstance } from '../../effectBatch';
import { MELEE_ARC_OPACITY, createArcBandMesh, createArcMesh, createSlashStreakMesh } from './fxGeometry';

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
    const leaves: {
      entity: pc.Entity;
      x: number;
      z: number;
      yaw: number;
      roll: number;
    }[] = [];
    if (style === 'grass') {
      // Hojas que salen despedidas dentro del arco para dar cuerpo al latigazo.
      const leafMaterial = ctx.createLeafMaterial(color, 0.95);
      materials.push(leafMaterial);
      for (let index = 0; index < 9; index++) {
        const angle = -halfAngle + (index / 8) * halfAngle * 2;
        const distance = range * (0.45 + ((index * 7) % 10) / 10 * 0.5);
        const leafYaw = (index * 47) % 360;
        const leaf = ctx.createLeaf(entity, leafMaterial, {
          x: Math.sin(angle) * distance,
          y: 0.05,
          z: Math.cos(angle) * distance,
          width: 0.24 + (index % 3) * 0.05,
          height: 0.42 + (index % 4) * 0.06,
          yaw: leafYaw,
          roll: -20 + (index % 5) * 10
        });
        leaves.push({
          entity: leaf,
          x: leaf.getLocalPosition().x,
          z: leaf.getLocalPosition().z,
          yaw: leafYaw,
          roll: -20 + (index % 5) * 10
        });
      }
    }

    const psychicWaves: {
      entity: pc.Entity;
      material: pc.StandardMaterial;
      delay: number;
      travel: number;
      opacity: number;
      lift: number;
      phase: number;
      amplitude: number;
      ripple: number;
    }[] = [];
    if (style === 'psychic') {
      // Onda sonora psíquica: frentes curvos que nacen en el lanzador y
      // recorren el cono hasta su borde. Cada frente se deforma en Y como una
      // cinta ondulada. Se usan dos tonos del color de la habilidad y mezcla
      // normal: con aditivo el violeta se lavaba a blanco sobre terrenos claros.
      effectDuration = 0.75;
      material.opacity = 0.14;
      const highlightTint: [number, number, number] = [
        Math.round(color[0] + (255 - color[0]) * 0.32),
        Math.round(color[1] + (255 - color[1]) * 0.32),
        Math.round(color[2] + (255 - color[2]) * 0.32)
      ];
      const waveCount = 5;
      const segments = 30;
      for (let index = 0; index < waveCount; index++) {
        const highlight = index % 2 === 0;
        const waveMaterial = ctx.createMaterial(
          highlight ? highlightTint : color,
          highlight ? 0.9 : 0.75
        );
        waveMaterial.blendType = pc.BLEND_NORMAL;
        waveMaterial.opacity = 0;
        applyVertexEffectShader(waveMaterial, MOTION_PSYCHIC_WAVE);
        materials.push(waveMaterial);
        const { mesh: waveMesh } = createArcBandMesh(
          ctx.device,
          0.94,
          1,
          halfAngle,
          segments
        );
        const wave = ctx.createEntity(waveMesh, [waveMaterial], entity);
        const lift = 0.12 + index * 0.012;
        wave.setLocalPosition(0, lift, 0);
        wave.setLocalScale(0.001, 1, 0.001);
        psychicWaves.push({
          entity: wave,
          material: waveMaterial,
          delay: index * 0.07,
          travel: 0.42,
          opacity: highlight ? 0.9 : 0.75,
          lift,
          phase: index * 1.7,
          amplitude: 0.14 + index * 0.012,
          ripple: 4 + (index % 3)
        });
      }
    }

    const slashSlices: {
      material: pc.StandardMaterial;
      revealAt: number;
      peak: number;
    }[] = [];
    if (
      style === 'slash' ||
      style === 'steel' ||
      style === 'dark' ||
      style === 'ghost'
    ) {
      // Tres zarpas blancas paralelas tumbadas sobre el cono: cubren su
      // superficie desde el lanzador hasta el borde y comparten apertura, así
      // que se leen como un único tajo de tres filos dentro del área de golpe.
      // Cada garra se parte en tramos estáticos que se encienden de derecha a
      // izquierda, de modo que el trazo parece dibujarse sobre el cono. La Garra
      // Metal usa dos filos de acero, el Tajo Umbrío dos violetas y el
      // Lengüetazo tres trazos fantasmales.
      const steel = style === 'steel';
      const dark = style === 'dark';
      const ghost = style === 'ghost';
      effectDuration = steel ? 0.3 : dark ? 0.32 : ghost ? 0.34 : 0.38;
      material.opacity = steel ? 0.08 : dark ? 0.09 : ghost ? 0.08 : 0.1;
      const span = halfAngle * 1.9;
      const start = -span * 0.5;
      const slices = 10;
      const drawTime = steel ? 0.08 : dark ? 0.07 : ghost ? 0.08 : 0.1;
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
      for (let index = 0; index < claws.length; index++) {
        const claw = claws[index];
        for (let slice = 0; slice < slices; slice++) {
          const tStart = slice / slices;
          const tEnd = (slice + 1) / slices;
          const sliceMaterial = ctx.createMaterial(clawTint, 0);
          sliceMaterial.blendType = pc.BLEND_NORMAL;
          sliceMaterial.opacity = 0;
          sliceMaterial.update();
          materials.push(sliceMaterial);
          ctx.createEntity(
            createSlashStreakMesh(
              ctx.device,
              range * claw.inner,
              range * claw.outer,
              range * 0.07,
              start,
              span,
              4,
              0.1,
              0.2,
              0.04,
              index * 1.9,
              tStart,
              tEnd
            ),
            [sliceMaterial],
            entity
          );
          slashSlices.push({
            material: sliceMaterial,
            // De derecha (t = 1) a izquierda (t = 0).
            revealAt:
              claw.delay + ((slices - 1 - slice) / slices) * drawTime,
            peak: claw.peak
          });
        }
      }
    }

    const attackArcs: {
      entity: pc.Entity;
      material: pc.StandardMaterial;
      delay: number;
      travel: number;
      peak: number;
    }[] = [];
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
      for (let index = 0; index < frontCount; index++) {
        const arcMaterial = ctx.createMaterial(color, 0);
        arcMaterial.blendType = pc.BLEND_NORMAL;
        arcMaterial.opacity = 0;
        arcMaterial.update();
        materials.push(arcMaterial);
        const { mesh: arcMesh } = createArcBandMesh(
          ctx.device,
          0.84,
          1,
          halfAngle,
          26
        );
        const arc = ctx.createEntity(arcMesh, [arcMaterial], entity);
        arc.setLocalPosition(0, 0.12 + index * 0.035, 0);
        arc.setLocalScale(0.001, 1, 0.001);
        attackArcs.push({
          entity: arc,
          material: arcMaterial,
          delay: index * (fighting ? 0.035 : 0.05),
          travel: fighting ? 0.17 : 0.2,
          peak: 1 - index * (fighting ? 0.14 : 0.15)
        });
      }
    }

    const puffs: {
      entity: pc.Entity;
      baseX: number;
      baseY: number;
      baseZ: number;
      size: number;
      yaw: number;
    }[] = [];
    let cloudMaterial: pc.StandardMaterial | null = null;
    let cloudHotMaterial: pc.StandardMaterial | null = null;
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

      for (let index = 0; index < 7; index++) {
        const spread = (-1 + (index / 6) * 2) * halfAngle * 0.72;
        const distance = range * (0.32 + ((index * 3) % 10) / 10 * 0.42);
        const size = 0.3 + ((index * 7) % 10) / 10 * 0.28;
        const puff = ctx.createEntity(
          ctx.sphereMesh,
          [index % 3 === 0 ? cloudHotMaterial : cloudMaterial],
          entity
        );
        puff.setLocalPosition(
          Math.sin(spread) * distance,
          0.4 + ((index * 5) % 10) / 10 * 0.35,
          Math.cos(spread) * distance
        );
        puff.setLocalScale(size, size * 0.82, size);
        const yaw = Math.random() * 360;
        puff.setLocalEulerAngles(0, yaw, 0);
        puffs.push({
          entity: puff,
          baseX: puff.getLocalPosition().x,
          baseY: puff.getLocalPosition().y,
          baseZ: puff.getLocalPosition().z,
          size,
          yaw
        });
      }
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
      for (const arc of attackArcs) {
        const local = Math.min(
          1,
          Math.max(0, (time - arc.delay) / arc.travel)
        );
        const ease = 1 - Math.pow(1 - local, 3);
        const radius = range * (0.28 + 0.72 * ease);
        arc.entity.setLocalScale(radius, 1, radius);
        const fade = Math.min(1, local / 0.18) * (1 - local);
        arc.material.opacity = arc.peak * Math.max(0, fade);
      }
      const now = t * effectDuration;
      for (const slice of slashSlices) {
        const appear = Math.min(
          1,
          Math.max(0, (now - slice.revealAt) / 0.012)
        );
        const fadeOut =
          1 - Math.min(1, Math.max(0, (now - 0.2) / (effectDuration - 0.2)));
        slice.material.opacity = slice.peak * appear * Math.max(0, fadeOut);
      }
      for (const leaf of leaves) {
        leaf.entity.setLocalPosition(
          leaf.x * (1 + t * 0.35),
          0.05 + t * 0.9,
          leaf.z + t * 1.1
        );
        leaf.entity.setLocalEulerAngles(
          t * 80,
          leaf.yaw + t * 260,
          leaf.roll + t * 140
        );
      }

      sporeBatch?.setTime(time);

      for (const wave of psychicWaves) {
        const local = Math.min(
          1,
          Math.max(0, (time - wave.delay) / wave.travel)
        );
        const ease = 1 - (1 - local) * (1 - local);
        const radius = range * (0.1 + 0.95 * ease);
        wave.entity.setLocalScale(radius, 1, radius);
        const fade =
          local <= 0
            ? 0
            : Math.min(1, local / 0.12) * Math.min(1, (1 - local) / 0.3);
        wave.material.opacity = wave.opacity * Math.max(0, fade);

        // La ondulación de la cinta vive en el vertex shader: solo se suben
        // tres uniformes por onda en vez de reescribir la malla cada frame.
        wave.material.setParameter('uEffectTime', time);
        wave.material.setParameter('uEffectParam0', wave.phase);
        wave.material.setParameter('uEffectParam1', wave.amplitude);
        wave.material.setParameter('uEffectParam2', wave.ripple);

        wave.entity.setLocalPosition(
          0,
          wave.lift + Math.sin(time * 8 + wave.phase) * 0.025,
          0
        );
      }

      if (cloudMaterial) cloudMaterial.opacity = 0.26 * (1 - t);
      if (cloudHotMaterial) cloudHotMaterial.opacity = 0.2 * (1 - t);
      for (const puff of puffs) {
        const grow = 0.65 + Math.min(1, t * 2.2) * 0.55;
        puff.entity.setLocalPosition(
          puff.baseX * (1 + t * 0.45),
          puff.baseY + t * 0.45,
          puff.baseZ + t * 0.85
        );
        puff.entity.setLocalScale(
          puff.size * grow,
          puff.size * 0.82 * grow,
          puff.size * grow
        );
        puff.entity.setLocalEulerAngles(
          0,
          puff.yaw + t * 40,
          Math.sin(t * 12 + puff.baseX) * 12
        );
      }
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

    const addToothRow = (row: pc.Entity, facingUp: boolean): void => {
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
        const tooth = ctx.createEntity(
          ctx.rockSpikeMesh,
          [toothMaterial],
          row
        );
        tooth.setLocalPosition(
          Math.sin(angle) * arcRadius,
          (facingUp ? 1 : -1) * length * 0.5,
          arcCenterZ + Math.cos(angle) * arcRadius
        );
        tooth.setLocalScale(width, length, width);
        // Los colmillos se abren en abanico hacia fuera de la boca.
        const fan = (angle / DEG) * 0.35;
        tooth.setLocalEulerAngles(facingUp ? 0 : 180, 0, -fan);
      }
    };
    addToothRow(upper, false);
    addToothRow(lower, true);

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
