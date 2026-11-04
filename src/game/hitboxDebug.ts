import * as pc from 'playcanvas';

/**
 * Círculo de depuración que muestra el hurtbox de un Pokémon en el suelo.
 *
 * Se crea una instancia por copia de vista (igual que el anillo de rumbo) para
 * que cada viewport la dibuje en su propia capa. Solo se activa con
 * `CONFIG.debug.showHitboxes`; no participa en el combate.
 */

/** Altura sobre el suelo, por encima de la sombra y del anillo de rumbo. */
const HITBOX_HEIGHT = 0.09;
/** Color fijo, independiente del equipo, para distinguirlo del anillo de rumbo. */
const HITBOX_COLOR: readonly [number, number, number] = [255, 40, 200];
/** Opacidad del relleno y del borde. */
const FILL_OPACITY = 0.22;
const RING_OPACITY = 0.9;

function createDiscMesh(
  device: pc.GraphicsDevice,
  radius: number,
  segments = 40
): pc.Mesh {
  const positions: number[] = [0, 0, 0];
  const normals: number[] = [0, 1, 0];
  const indices: number[] = [];

  for (let index = 0; index <= segments; index++) {
    const angle = (index / segments) * Math.PI * 2;
    positions.push(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
    normals.push(0, 1, 0);
  }
  for (let index = 1; index <= segments; index++) {
    indices.push(0, index, index + 1);
  }

  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setIndices(indices);
  mesh.update();
  return mesh;
}

function createRingMesh(
  device: pc.GraphicsDevice,
  radius: number,
  width: number,
  segments = 48
): pc.Mesh {
  const inner = Math.max(0, radius - width);
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (let index = 0; index <= segments; index++) {
    const angle = (index / segments) * Math.PI * 2;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    positions.push(sin * inner, 0, cos * inner);
    positions.push(sin * radius, 0, cos * radius);
    normals.push(0, 1, 0, 0, 1, 0);
  }
  for (let index = 0; index < segments; index++) {
    const base = index * 2;
    indices.push(base, base + 1, base + 2);
    indices.push(base + 1, base + 3, base + 2);
  }

  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setIndices(indices);
  mesh.update();
  return mesh;
}

function createDebugMaterial(
  color: readonly [number, number, number],
  opacity: number
): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.name = 'hitbox-debug';
  material.useLighting = false;
  material.useSkybox = false;
  material.useFog = false;
  material.diffuse = new pc.Color(0, 0, 0);
  material.emissive = new pc.Color(
    color[0] / 255,
    color[1] / 255,
    color[2] / 255
  );
  material.emissiveIntensity = 1;
  material.blendType = pc.BLEND_NORMAL;
  material.opacity = opacity;
  material.depthWrite = false;
  material.depthTest = true;
  material.cull = pc.CULLFACE_NONE;
  material.update();
  return material;
}

export class HitboxDebug {
  private readonly root: pc.Entity;
  private readonly fillMesh: pc.Mesh;
  private readonly ringMesh: pc.Mesh;
  private readonly fillMaterial: pc.StandardMaterial;
  private readonly ringMaterial: pc.StandardMaterial;

  constructor(app: pc.Application, radius: number) {
    const device = app.graphicsDevice;
    const band = Math.max(0.025, Math.min(0.06, radius * 0.12));

    this.fillMesh = createDiscMesh(device, radius);
    this.ringMesh = createRingMesh(device, radius, band);
    this.fillMaterial = createDebugMaterial(HITBOX_COLOR, FILL_OPACITY);
    this.ringMaterial = createDebugMaterial(HITBOX_COLOR, RING_OPACITY);

    this.root = new pc.Entity('hitbox-debug');
    this.root.addComponent('render');
    const render = this.root.render!;
    render.castShadows = false;
    render.receiveShadows = false;

    const fill = new pc.MeshInstance(this.fillMesh, this.fillMaterial);
    fill.castShadow = false;
    fill.receiveShadow = false;
    fill.drawOrder = 4;
    const ring = new pc.MeshInstance(this.ringMesh, this.ringMaterial);
    ring.castShadow = false;
    ring.receiveShadow = false;
    ring.drawOrder = 5;
    render.meshInstances = [fill, ring];

    this.root.setLocalPosition(0, HITBOX_HEIGHT, 0);
    app.root.addChild(this.root);
  }

  setPosition(x: number, z: number): void {
    this.root.setPosition(x, HITBOX_HEIGHT, z);
  }

  setVisible(visible: boolean): void {
    this.root.enabled = visible;
  }

  /** Asigna el círculo a la capa de render del viewport al que pertenece. */
  setLayer(layerId: number): void {
    const render = this.root.render;
    if (render) render.layers = [layerId];
  }

  destroy(): void {
    this.root.destroy();
    this.fillMesh.destroy();
    this.ringMesh.destroy();
    this.fillMaterial.destroy();
    this.ringMaterial.destroy();
  }
}

/**
 * Cuelga un anillo de depuración de la raíz de un proyectil, a la altura del
 * suelo. El radio es el de colisión del proyectil: cuando este anillo toca el
 * círculo de hurtbox de un rival, el impacto está garantizado. Devuelve la
 * función para liberar malla y material.
 */
export function attachProjectileHitbox(
  app: pc.Application,
  root: pc.Entity,
  radius: number
): () => void {
  const device = app.graphicsDevice;
  const band = Math.max(0.02, Math.min(0.05, radius * 0.18));
  const mesh = createRingMesh(device, radius, band);
  const material = createDebugMaterial(HITBOX_COLOR, RING_OPACITY);
  const entity = new pc.Entity('projectile-hitbox-debug');
  entity.addComponent('render');
  const render = entity.render!;
  render.castShadows = false;
  render.receiveShadows = false;
  const instance = new pc.MeshInstance(mesh, material);
  instance.castShadow = false;
  instance.receiveShadow = false;
  instance.drawOrder = 5;
  render.meshInstances = [instance];
  // La raíz del proyectil vuela a ~0,7 u; el anillo debe quedar en el suelo.
  const rootY = root.getPosition().y;
  entity.setLocalPosition(0, HITBOX_HEIGHT - rootY, 0);
  root.addChild(entity);
  return () => {
    entity.destroy();
    mesh.destroy();
    material.destroy();
  };
}
