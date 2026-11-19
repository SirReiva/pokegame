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

type Rgb = readonly [number, number, number];

/** Datos comunes a todas las variantes del arco melee. */
interface MeleeSpawn {
  ctx: FxRuntime;
  x: number;
  z: number;
  yaw: number;
  range: number;
  halfAngle: number;
  halfAngleDeg: number;
  color: Rgb;
}

/** Contexto de una variante que ya puede colgar geometría del arco base. */
interface MeleeBase extends MeleeSpawn {
  entity: pc.Entity;
  material: pc.StandardMaterial;
  materials: pc.StandardMaterial[];
}

/** Actualización por frame que devuelve una variante. */
type MeleeStyleUpdate = (time: number, t: number, dt: number) => void;

/**
 * Estrategia de un estilo melee. El arco base es común; cada entrada solo
 * declara lo que cambia: duración, color de la guía, escalado y capas extra.
 */
interface MeleeStyleFx {
  duration?: number;
  arcColor?: Rgb;
  scaleArc?: boolean;
  /** Efectos que deben crearse antes que el arco base (mandíbula, cepas). */
  before?(spawn: MeleeSpawn): void;
  /** Capas que cuelgan del arco base; devuelve su animación por frame. */
  build?(base: MeleeBase): MeleeStyleUpdate | void;
}

const MELEE_DEFAULT_DURATION = 0.28;

interface ClawSpec {
  inner: number;
  outer: number;
}

interface ClawStyleConfig {
  duration: number;
  tint: Rgb;
  claws: readonly ClawSpec[];
  liftStart: number;
  liftEnd: number;
  bow: number;
}

/** Garras: una sola malla y un material que se enciende y se apaga en bloque. */
function clawStyle(config: ClawStyleConfig): MeleeStyleFx {
  return {
    duration: config.duration,
    scaleArc: false,
    build({ ctx, entity, materials, range, halfAngle }) {
      const span = halfAngle * 1.9;
      const start = -span * 0.5;
      const materialForClaws = ctx.createMaterial(config.tint, 0);
      materialForClaws.blendType = pc.BLEND_NORMAL;
      materialForClaws.opacity = 0;
      materialForClaws.update();
      materials.push(materialForClaws);

      // Las garras comparten material y se funden en una sola malla: el
      // zarpazo completo cuesta una entidad en vez de una por filo. La
      // geometría se cachea por estilo y alcance.
      const specs: SlashStreakSpec[] = config.claws.map((claw, index) => ({
        innerRadius: range * claw.inner,
        outerRadius: range * claw.outer,
        halfThickness: range * 0.07,
        angleStart: start,
        angleSweep: span,
        segments: 32,
        liftStart: config.liftStart,
        liftEnd: config.liftEnd,
        bow: config.bow,
        phase: index * 1.9
      }));
      const clawMesh = ctx.cachedMesh(
        `slash-streak-set:${range.toFixed(3)}:${span.toFixed(3)}:${config.liftStart}:${config.liftEnd}:${config.bow}:${config.claws.map((claw) => `${claw.inner}-${claw.outer}`).join('|')}`,
        () => createSlashStreakSetMesh(ctx.device, specs)
      );
      ctx.createEntity(clawMesh, [materialForClaws], entity);

      return (_time, t) => {
        const now = t * config.duration;
        const appear = Math.min(1, Math.max(0, now / 0.05));
        const fadeOut =
          1 - Math.min(1, Math.max(0, (now - 0.2) / (config.duration - 0.2)));
        materialForClaws.opacity = appear * Math.max(0, fadeOut);
      };
    }
  };
}

interface AttackArcConfig {
  duration: number;
  frontCount: number;
  travel: number;
  delayStep: number;
  alphaStep: number;
}

/** Frentes curvos que recorren el cono hasta su borde. */
function attackArcStyle(config: AttackArcConfig): MeleeStyleFx {
  return {
    duration: config.duration,
    scaleArc: false,
    build({ ctx, entity, color, range, halfAngle }) {
      const instances: TintEffectInstance[] = [];
      for (let index = 0; index < config.frontCount; index++) {
        const delay = index * config.delayStep;
        instances.push({
          color,
          alpha: 1 - index * config.alphaStep,
          fade: [
            delay,
            config.travel * 0.18,
            config.travel * 0.18,
            config.travel * 0.82
          ],
          anim0: [delay, config.travel, 0.28, 0.12 + index * 0.035]
        });
      }
      const batch = new EffectTintBatch({
        app: ctx.app,
        parent: entity,
        mesh: ctx.cachedArcBand(0.84, 1, halfAngle, 26),
        instances,
        motion: MOTION_TINT_MELEE_ARCS,
        radius: range,
        life: config.duration,
        boundsHalf: [range + 1, 1, range + 1]
      });
      return (time) => batch.setTime(time);
    }
  };
}

/**
 * Estrategias por estilo. Los estilos sin entrada usan solo el arco base.
 * El registro sustituye la cadena de `if` y la lista negra de escalado.
 */
const MELEE_STYLE_FX: Partial<Record<ImpactStyle, MeleeStyleFx>> = {
  jaw: {
    arcColor: [255, 255, 255],
    before({ ctx, x, z, yaw, range }) {
      // La mordida materializa una mandíbula 3D en el centro del cono, pero
      // mantiene el arco melee como guía del área de golpe.
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
  },

  vine: {
    before({ ctx, x, z, yaw, range, halfAngleDeg, color }) {
      // El Látigo Cepa sustituye el abanico plano por dos zarcillos 3D. El arco
      // se mantiene como guía tenue del alcance (ver `MELEE_ARC_OPACITY.vine`).
      spawnVineWhip(ctx, x, z, yaw, range, halfAngleDeg, color);
    }
  },

  grass: {
    build({ ctx, entity, materials, color, range, halfAngle }) {
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
      const leafBatch = new EffectBatch({
        app: ctx.app,
        parent: entity,
        mesh: ctx.leafMesh,
        material: leafMaterial,
        instances: leafInstances,
        motion: MOTION_MELEE_LEAVES,
        life: MELEE_DEFAULT_DURATION
      });
      return (time) => leafBatch.setTime(time);
    }
  },

  psychic: {
    duration: 0.75,
    scaleArc: false,
    build({ ctx, entity, color, range, halfAngle }) {
      // Onda sonora psíquica: frentes curvos que nacen en el lanzador y
      // recorren el cono hasta su borde. Cada frente se deforma en Y como una
      // cinta ondulada. Se usan dos tonos del color de la habilidad y mezcla
      // normal: con aditivo el violeta se lavaba a blanco sobre terrenos claros.
      // Las cinco ondas se dibujan en un único lote con tinte y alfa por
      // instancia.
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
      const waveBatch = new EffectTintBatch({
        app: ctx.app,
        parent: entity,
        mesh: ctx.cachedArcBand(0.94, 1, halfAngle, 30),
        instances: waveInstances,
        motion: MOTION_TINT_MELEE_WAVES,
        radius: range,
        life: 0.75,
        boundsHalf: [range + 1, 1, range + 1]
      });
      return (time) => waveBatch.setTime(time);
    }
  },

  slash: clawStyle({
    duration: 0.38,
    tint: [255, 255, 255],
    claws: [
      { inner: 0.74, outer: 0.99 },
      { inner: 0.42, outer: 0.68 },
      { inner: 0.1, outer: 0.36 }
    ],
    liftStart: 0.1,
    liftEnd: 0.2,
    bow: 0.04
  }),

  steel: clawStyle({
    duration: 0.3,
    tint: [214, 232, 255],
    claws: [
      { inner: 0.66, outer: 0.99 },
      { inner: 0.2, outer: 0.58 }
    ],
    liftStart: 0.1,
    liftEnd: 0.2,
    bow: 0.04
  }),

  dark: clawStyle({
    duration: 0.32,
    tint: [210, 180, 255],
    claws: [
      { inner: 0.66, outer: 0.99 },
      { inner: 0.2, outer: 0.58 }
    ],
    liftStart: 0.1,
    liftEnd: 0.2,
    bow: 0.04
  }),

  ghost: clawStyle({
    duration: 0.34,
    tint: [206, 178, 255],
    claws: [
      { inner: 0.74, outer: 0.99 },
      { inner: 0.42, outer: 0.68 },
      { inner: 0.1, outer: 0.36 }
    ],
    // La zarpa fantasma se mantiene pegada al cono: a media altura de un
    // cuerpo pequeño parecía flotar sobre el suelo, sobre todo con la cámara
    // inclinada.
    liftStart: 0.04,
    liftEnd: 0.09,
    bow: 0.02
  }),

  arc: attackArcStyle({
    duration: 0.34,
    frontCount: 3,
    travel: 0.2,
    delayStep: 0.05,
    alphaStep: 0.15
  }),

  fighting: attackArcStyle({
    duration: 0.4,
    frontCount: 4,
    travel: 0.17,
    delayStep: 0.035,
    alphaStep: 0.14
  }),

  air: attackArcStyle({
    duration: 0.34,
    frontCount: 3,
    travel: 0.2,
    delayStep: 0.05,
    alphaStep: 0.15
  }),

  spore: {
    duration: 1,
    build({ ctx, entity, materials, range, halfAngle }) {
      // Rocío en abanico: cada partícula nace en el vértice del cono y viaja
      // hacia un ángulo distinto del borde, cubriendo toda la abertura. El
      // enjambre entero se resuelve en un solo lote instanciado.
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
      const sporeBatch = new EffectBatch({
        app: ctx.app,
        parent: entity,
        mesh: ctx.leafMesh,
        material: sporeMaterial,
        instances: sporeInstances,
        motion: MOTION_SPORE_SWARM
      });
      return (time) => sporeBatch.setTime(time);
    }
  },

  poison: {
    duration: 0.62,
    build({ ctx, entity, materials, color, range, halfAngle }) {
      // Nube violeta: puffs esféricos que avanzan por el cono y motas aditivas
      // que se dispersan hacia delante y hacia arriba.
      const cloudMaterial = ctx.createMaterial([146, 78, 186], 0.26);
      const cloudHotMaterial = ctx.createMaterial([214, 168, 236], 0.2);
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
      const cloudBatch = new EffectBatch({
        app: ctx.app,
        parent: entity,
        mesh: ctx.sphereMesh,
        material: cloudMaterial,
        instances: cloudInstances,
        motion: MOTION_MELEE_PUFFS,
        life: 0.62
      });
      const cloudHotBatch = new EffectBatch({
        app: ctx.app,
        parent: entity,
        mesh: ctx.sphereMesh,
        material: cloudHotMaterial,
        instances: cloudHotInstances,
        motion: MOTION_MELEE_PUFFS,
        life: 0.62
      });

      return (time, t) => {
        cloudMaterial.opacity = 0.26 * (1 - t);
        cloudHotMaterial.opacity = 0.2 * (1 - t);
        cloudBatch.setTime(time);
        cloudHotBatch.setTime(time);
      };
    }
  }
};

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
    const halfAngle = Math.max(8, halfAngleDeg) * DEG;
    const styleFx = MELEE_STYLE_FX[style];
    const spawn: MeleeSpawn = {
      ctx,
      x,
      z,
      yaw,
      range,
      halfAngle,
      halfAngleDeg,
      color
    };
    // Mandíbula y cepas se crean antes que la guía, como hasta ahora.
    styleFx?.before?.(spawn);

    const mesh = createArcMesh(ctx.device, range, halfAngle, 18);
    // Si llega el color del equipo, manda sobre el color del estilo: la guía
    // del área debe identificar al lanzador.
    const arcColor: Rgb = markerColor ?? styleFx?.arcColor ?? color;
    const arcOpacity = MELEE_ARC_OPACITY[style] ?? 0.85;
    const material = ctx.createMaterial(arcColor, arcOpacity);
    const entity = ctx.createEntity(mesh, [material]);
    entity.setPosition(x, 0.35, z);
    entity.setEulerAngles(0, yaw / DEG, 0);

    const materials = [material];
    const updateStyle = styleFx?.build?.({
      ...spawn,
      entity,
      material,
      materials
    });
    const effectDuration = styleFx?.duration ?? MELEE_DEFAULT_DURATION;
    const scaleArc = styleFx?.scaleArc ?? true;

    // La malla del arco es exclusiva de este efecto: al destruir la entidad,
    // su MeshInstance la libera y PlayCanvas se encarga de destruirla.
    let time = 0;
    ctx.addEffect(entity, materials, effectDuration, (t, dt) => {
      time += dt;
      material.opacity = arcOpacity * (1 - t);
      if (scaleArc) {
        const scale = 0.92 + 0.12 * t;
        entity.setLocalScale(scale, 1, scale);
      }
      updateStyle?.(time, t, dt);
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
