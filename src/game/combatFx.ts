/**
 * Efectos visuales procedurales del combate.
 *
 * No usan hojas de ataque externas: son mallas simples de PlayCanvas con
 * materiales aditivos. Cada habilidad nueva puede elegir su color y su forma,
 * y el motor reutiliza estas primitivas (proyectil, arco, haz, área, dash y
 * aura). Todos los efectos se dibujan en la capa `World`, así que se ven en
 * todos los viewports del splitscreen.
 */

import * as pc from 'playcanvas';
import type { ProjectileStyle } from './abilities';
import { DEG } from './config';

export interface EffectHandle {
  setPosition(x: number, z: number): void;
  update(dt: number): void;
  destroy(): void;
}

interface ActiveEffect {
  entity: pc.Entity;
  materials: pc.StandardMaterial[];
  duration: number;
  elapsed: number;
  update: (t: number, dt: number) => void;
}

interface ProjectileVisual {
  entity: pc.Entity;
  materials: pc.StandardMaterial[];
  update: (dt: number) => void;
}

function createArcMesh(
  device: pc.GraphicsDevice,
  radius: number,
  halfAngle: number,
  segments: number
): pc.Mesh {
  const positions: number[] = [0, 0, 0];
  const normals: number[] = [0, 1, 0];
  const uvs: number[] = [0.5, 0.5];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const angle = -halfAngle + (2 * halfAngle * i) / segments;
    positions.push(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
    normals.push(0, 1, 0);
    uvs.push(i / segments, 1);
  }
  for (let i = 1; i <= segments; i++) {
    indices.push(0, i, i + 1);
  }

  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setUvs(0, uvs);
  mesh.setIndices(indices);
  mesh.update();
  return mesh;
}

/**
 * Cinta zigzagueante en forma de cruz, para que el rayo se vea desde
 * cualquier ángulo de cámara. Se construye a lo largo de Z y se centra en 0.
 */
function createLightningMesh(
  device: pc.GraphicsDevice,
  length: number,
  width: number,
  segments: number,
  seed: number
): pc.Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let state = seed >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const taper = Math.sin(Math.PI * t);
    const z = (t - 0.5) * length;
    const x =
      i === 0 || i === segments
        ? 0
        : (random() - 0.5) * width * 5 * taper;
    const y =
      i === 0 || i === segments
        ? 0
        : (random() - 0.5) * width * 5 * taper;

    positions.push(x - width, y, z, x + width, y, z, x, y - width, z, x, y + width, z);
    normals.push(0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0);
    uvs.push(0, t, 1, t, 0, t, 1, t);

    if (i > 0) {
      const a = (i - 1) * 4;
      const b = i * 4;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
      indices.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
    }
  }

  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setUvs(0, uvs);
  mesh.setIndices(indices);
  mesh.update();
  return mesh;
}

export class CombatFx {
  private readonly app: pc.Application;
  private readonly layerId: number;
  private readonly device: pc.GraphicsDevice;
  private readonly effects: ActiveEffect[] = [];
  private readonly projectiles = new Set<ProjectileVisual>();
  private readonly sphereMesh: pc.Mesh;
  private readonly boxMesh: pc.Mesh;
  private readonly torusMesh: pc.Mesh;

  constructor(app: pc.Application, layerId: number) {
    this.app = app;
    this.layerId = layerId;
    this.device = app.graphicsDevice;
    this.sphereMesh = pc.createSphere(this.device, { radius: 0.5 });
    this.boxMesh = pc.createBox(this.device, {
      halfExtents: new pc.Vec3(0.5, 0.5, 0.5)
    });
    this.torusMesh = pc.createTorus(this.device, {
      ringRadius: 0.5,
      tubeRadius: 0.05
    });

    // PlayCanvas destruye una malla cuando su último MeshInstance desaparece.
    // Estas mallas son compartidas por muchos efectos, así que reservamos una
    // referencia propia para que sigan vivas entre proyectiles y golpes.
    this.sphereMesh.incRefCount();
    this.boxMesh.incRefCount();
    this.torusMesh.incRefCount();
  }

  private createMaterial(
    color: readonly [number, number, number],
    opacity: number
  ): pc.StandardMaterial {
    const material = new pc.StandardMaterial();
    material.useLighting = false;
    material.useSkybox = false;
    material.useFog = true;
    material.diffuse = new pc.Color(0, 0, 0);
    material.emissive = new pc.Color(color[0] / 255, color[1] / 255, color[2] / 255);
    material.emissiveIntensity = 1;
    material.opacity = opacity;
    material.blendType = pc.BLEND_ADDITIVEALPHA;
    material.depthWrite = false;
    material.depthTest = true;
    material.cull = pc.CULLFACE_NONE;
    material.update();
    return material;
  }

  private createEntity(
    mesh: pc.Mesh,
    materials: pc.StandardMaterial[],
    parent: pc.Entity = this.app.root
  ): pc.Entity {
    const entity = new pc.Entity('combat-fx');
    entity.addComponent('render');
    const render = entity.render!;
    render.castShadows = false;
    render.receiveShadows = false;
    render.layers = [this.layerId];
    render.meshInstances = materials.map(
      (material) => new pc.MeshInstance(mesh, material)
    );
    parent.addChild(entity);
    return entity;
  }

  private addEffect(
    entity: pc.Entity,
    materials: pc.StandardMaterial[],
    duration: number,
    update: (t: number, dt: number) => void
  ): void {
    this.effects.push({
      entity,
      materials,
      duration,
      elapsed: 0,
      update
    });
  }

  /** Bola luminosa que avanza con un proyectil. */
  spawnProjectile(
    x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number,
    style: ProjectileStyle,
    dirX: number,
    dirZ: number
  ): EffectHandle {
    if (style === 'electric') {
      return this.spawnElectricProjectile(x, z, radius, dirX, dirZ);
    }

    const material = this.createMaterial(color, 0.95);
    const entity = this.createEntity(this.sphereMesh, [material]);
    entity.setPosition(x, 0.7, z);
    const scale = Math.max(0.12, radius * 2);
    entity.setLocalScale(scale, scale, scale);
    const visual: ProjectileVisual = {
      entity,
      materials: [material],
      update: () => {}
    };
    this.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => entity.setPosition(nextX, 0.7, nextZ),
      update: () => {},
      destroy: () => {
        if (!this.projectiles.delete(visual)) return;
        entity.destroy();
        material.destroy();
      }
    };
  }

  /**
   * Proyectil eléctrico: núcleo, halo, tres arcos zigzagueantes y una estela
   * orientada hacia la dirección de vuelo. Los arcos giran y parpadean.
   */
  private spawnElectricProjectile(
    x: number,
    z: number,
    radius: number,
    dirX: number,
    dirZ: number
  ): EffectHandle {
    const root = new pc.Entity('electric-projectile');
    root.setPosition(x, 0.7, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    this.app.root.addChild(root);

    const coreMaterial = this.createMaterial([255, 255, 220], 0.95);
    const glowMaterial = this.createMaterial([255, 230, 90], 0.35);
    const arcMaterial = this.createMaterial([255, 245, 170], 0.9);
    const tailMaterial = this.createMaterial([255, 220, 80], 0.45);
    const materials = [coreMaterial, glowMaterial, arcMaterial, tailMaterial];

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalScale(radius * 1.9, radius * 1.9, radius * 1.9);

    const glow = this.createEntity(this.sphereMesh, [glowMaterial], root);
    glow.setLocalScale(radius * 4.2, radius * 4.2, radius * 4.2);

    const tail = this.createEntity(this.boxMesh, [tailMaterial], root);
    tail.setLocalPosition(0, 0, -radius * 2.8);
    tail.setLocalScale(radius * 1.1, radius * 1.1, radius * 5.5);

    const arcs: pc.Entity[] = [];
    for (let index = 0; index < 3; index++) {
      const mesh = createLightningMesh(
        this.device,
        radius * 5,
        Math.max(0.012, radius * 0.13),
        5,
        1000 + index * 7919
      );
      const arc = this.createEntity(mesh, [arcMaterial], root);
      arc.setLocalEulerAngles(index * 60, index * 120, index * 45);
      arcs.push(arc);
    }

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        coreMaterial.opacity = 0.85 + Math.random() * 0.15;
        glowMaterial.opacity = 0.16 + Math.random() * 0.14;
        arcMaterial.opacity = 0.45 + Math.random() * 0.3;
        tailMaterial.opacity = 0.18 + Math.random() * 0.14;

        const pulse = 1 + Math.sin(time * 35) * 0.06;
        const glowPulse = 1 + Math.sin(time * 22) * 0.08;
        core.setLocalScale(
          radius * 1.9 * pulse,
          radius * 1.9 * pulse,
          radius * 1.9 * pulse
        );
        glow.setLocalScale(
          radius * 4.2 * glowPulse,
          radius * 4.2 * glowPulse,
          radius * 4.2 * glowPulse
        );

        coreMaterial.update();
        glowMaterial.update();
        arcMaterial.update();
        tailMaterial.update();

        for (let index = 0; index < arcs.length; index++) {
          arcs[index].setLocalEulerAngles(
            (time * 420 + index * 70) % 360,
            (time * 560 + index * 130) % 360,
            (time * 300 + index * 110) % 360
          );
        }
      }
    };
    this.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => root.setPosition(nextX, 0.7, nextZ),
      update: (dt) => visual.update(dt),
      destroy: () => {
        if (!this.projectiles.delete(visual)) return;
        root.destroy();
        for (const material of materials) material.destroy();
      }
    };
  }

  /** Arco de golpe cuerpo a cuerpo, orientado hacia el `facing` del actor. */
  spawnMelee(
    x: number,
    z: number,
    yaw: number,
    range: number,
    halfAngleDeg: number,
    color: readonly [number, number, number]
  ): void {
    const mesh = createArcMesh(
      this.device,
      range,
      Math.max(8, halfAngleDeg) * DEG,
      18
    );
    const material = this.createMaterial(color, 0.85);
    const entity = this.createEntity(mesh, [material]);
    entity.setPosition(x, 0.35, z);
    entity.setEulerAngles(0, yaw / DEG, 0);

    // La malla del arco es exclusiva de este efecto: al destruir la entidad,
    // su MeshInstance la libera y PlayCanvas se encarga de destruirla.
    this.addEffect(entity, [material], 0.28, (t) => {
      material.opacity = 0.85 * (1 - t);
      const scale = 0.92 + 0.12 * t;
      entity.setLocalScale(scale, 1, scale);
    });
  }

  /**
   * Haz instantáneo: dos rayos zigzagueantes que giran en sentidos opuestos,
   * cruzándose mientras el haz se extiende desde el lanzador hacia delante.
   */
  spawnBeam(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    color: readonly [number, number, number],
    width: number
  ): void {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.max(0.1, Math.hypot(dx, dz));
    const root = new pc.Entity('beam');
    root.setPosition(x1, 0.7, z1);
    root.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    this.app.root.addChild(root);

    const strandMaterial = this.createMaterial(color, 0.95);
    const coreMaterial = this.createMaterial([255, 255, 255], 0.7);
    const materials = [strandMaterial, coreMaterial];

    const strandWidth = Math.max(0.02, width * 0.28);
    const segments = Math.max(10, Math.round(length * 2));
    const strands: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const mesh = createLightningMesh(
        this.device,
        length,
        strandWidth,
        segments,
        3000 + index * 7919
      );
      const strand = this.createEntity(mesh, [strandMaterial], root);
      strand.setLocalPosition(0, 0, length / 2);
      strands.push(strand);
    }

    const core = this.createEntity(this.boxMesh, [coreMaterial], root);
    const coreWidth = Math.max(0.015, width * 0.34);
    core.setLocalPosition(0, 0, length / 2);
    core.setLocalScale(coreWidth, coreWidth, length);

    this.addEffect(root, materials, 0.34, (t) => {
      // El haz avanza desde el lanzador durante el primer tercio del efecto.
      const advance = Math.min(1, t / 0.34);
      const reveal = 1 - (1 - advance) * (1 - advance);
      for (const strand of strands) {
        strand.setLocalPosition(0, 0, (length / 2) * reveal);
        strand.setLocalScale(1, 1, Math.max(0.02, reveal));
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

  /** Anillo de área en el suelo, centrado delante del lanzador. */
  spawnAoe(
    x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number]
  ): void {
    const material = this.createMaterial(color, 0.8);
    const entity = this.createEntity(this.torusMesh, [material]);
    entity.setPosition(x, 0.12, z);

    this.addEffect(entity, [material], 0.5, (t) => {
      const scale = Math.max(0.2, radius * 2) * (0.55 + 0.45 * t);
      entity.setLocalScale(scale, 1, scale);
      material.opacity = 0.8 * (1 - t);
    });
  }

  /** Estela del desplazamiento de un dash. */
  spawnDash(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    color: readonly [number, number, number]
  ): void {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.max(0.1, Math.hypot(dx, dz));
    const material = this.createMaterial(color, 0.7);
    const entity = this.createEntity(this.boxMesh, [material]);
    entity.setPosition((x1 + x2) / 2, 0.18, (z1 + z2) / 2);
    entity.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    entity.setLocalScale(0.8, 0.12, length);

    this.addEffect(entity, [material], 0.35, (t) => {
      material.opacity = 0.7 * (1 - t);
    });
  }

  /** Aura circular para buffs, escudos y reapariciones. */
  spawnBuff(
    x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number
  ): void {
    const material = this.createMaterial(color, 0.8);
    const entity = this.createEntity(this.torusMesh, [material]);
    entity.setPosition(x, 0.15, z);

    this.addEffect(entity, [material], 0.65, (t) => {
      const scale = Math.max(0.3, radius * 2) * (0.35 + 0.85 * t);
      entity.setLocalScale(scale, 1, scale);
      entity.setPosition(x, 0.15 + t * 0.8, z);
      material.opacity = 0.8 * (1 - t);
    });
  }

  /** Impacto de un golpe. `effectiveness` tiñe el destello. */
  spawnHit(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number
  ): void {
    const tint: [number, number, number] =
      effectiveness > 1
        ? [255, 244, 160]
        : effectiveness < 1
          ? [130, 148, 170]
          : [color[0], color[1], color[2]];
    const material = this.createMaterial(tint, 0.95);
    const entity = this.createEntity(this.sphereMesh, [material]);
    entity.setPosition(x, 0.65, z);

    this.addEffect(entity, [material], 0.3, (t) => {
      const scale = 0.25 + t * (effectiveness > 1 ? 1.35 : 0.85);
      entity.setLocalScale(scale, scale, scale);
      entity.setPosition(x, 0.65 + t * 0.15, z);
      material.opacity = 0.95 * (1 - t);
    });
  }

  /** Explosión eléctrica pequeña: núcleo, halo, arcos cortos y anillo. */
  spawnElectricBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number
  ): void {
    const root = new pc.Entity('electric-burst');
    root.setPosition(x, 0, z);
    this.app.root.addChild(root);

    const coreMaterial = this.createMaterial([255, 255, 225], 0.95);
    const glowMaterial = this.createMaterial(color, 0.5);
    const arcMaterial = this.createMaterial([255, 245, 170], 0.9);
    const ringMaterial = this.createMaterial(color, 0.45);
    const materials = [coreMaterial, glowMaterial, arcMaterial, ringMaterial];

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.65, 0);
    const glow = this.createEntity(this.sphereMesh, [glowMaterial], root);
    glow.setLocalPosition(0, 0.65, 0);

    const arcs: pc.Entity[] = [];
    for (let index = 0; index < 3; index++) {
      const mesh = createLightningMesh(
        this.device,
        0.9,
        0.025,
        4,
        2000 + index * 3571
      );
      const arc = this.createEntity(mesh, [arcMaterial], root);
      arc.setLocalPosition(0, 0.65, 0);
      arc.setLocalEulerAngles(index * 70, index * 110, index * 45);
      arcs.push(arc);
    }

    const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.08, 0);

    this.addEffect(root, materials, 0.32, (t) => {
      const scale = 0.15 + t * (effectiveness > 1 ? 0.95 : 0.7);
      core.setLocalScale(scale, scale, scale);
      const glowScale = 0.4 + t * (effectiveness > 1 ? 1.6 : 1.2);
      glow.setLocalScale(glowScale, glowScale, glowScale);
      coreMaterial.opacity = 0.95 * (1 - t);
      glowMaterial.opacity = 0.5 * (1 - t);
      arcMaterial.opacity = 0.9 * (1 - t);
      const ringScale = 0.5 + t * 1.1;
      ring.setLocalScale(ringScale, 1, ringScale);
      ringMaterial.opacity = 0.45 * (1 - t);

      for (let index = 0; index < arcs.length; index++) {
        arcs[index].setLocalEulerAngles(
          (index * 70 + t * 220) % 360,
          (index * 110 + t * 300) % 360,
          (index * 45 + t * 180) % 360
        );
      }
    });
  }

  update(dt: number): void {
    for (let index = this.effects.length - 1; index >= 0; index--) {
      const effect = this.effects[index];
      effect.elapsed += dt;
      const t = Math.min(1, effect.elapsed / effect.duration);
      effect.update(t, dt);
      // `opacity` es un uniforme del material: sin update() el fundido no
      // llega a la GPU igual que ocurre con los offsets de textura del sprite.
      for (const material of effect.materials) material.update();
      if (effect.elapsed < effect.duration) continue;

      effect.entity.destroy();
      for (const material of effect.materials) material.destroy();
      this.effects.splice(index, 1);
    }
  }

  /** Elimina todos los efectos activos. */
  clear(): void {
    for (const effect of this.effects) {
      effect.entity.destroy();
      for (const material of effect.materials) material.destroy();
    }
    this.effects.length = 0;

    for (const visual of this.projectiles) {
      visual.entity.destroy();
      for (const material of visual.materials) material.destroy();
    }
    this.projectiles.clear();
  }

  destroy(): void {
    this.clear();
    this.sphereMesh.destroy();
    this.boxMesh.destroy();
    this.torusMesh.destroy();
  }
}
