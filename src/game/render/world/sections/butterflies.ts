/** Sección del generador de mundo. */

import * as pc from 'playcanvas';
import {
  randomPointInZone,
  zoneArea,
  zoneBounds
} from '../../../terrain';
import type { Butterfly, ButterflyBatch } from '../butterfly';
import { writeButterflyBody, writeButterflyWing } from '../butterfly';
import type { WorldBuildContext } from '../context';
import { random } from '../random';
import { standard } from '../worldParts';

export function* buildButterflies(ctx: WorldBuildContext): Generator<number, void, void> {
  const { device, worldRoot, created, materials } = ctx;
  const fairyZones = ctx.fairyZones!;
  yield 1;
  // --- Mariposas del claro feérico ------------------------------------------
  // Pequeñas mariposas 3D: un cuerpo fino y dos alas horizontales con color por
  // vértice (más oscuras junto al cuerpo, casi blancas en la punta). Cada una
  // vuela hacia un objetivo dentro del calvero y, al llegar, elige otro, de
  // modo que revolotean sobre las flores sin salirse de la zona.
  const butterflyBodyMaterial = standard({
    name: 'butterfly-body',
    diffuse: '#4a2f3c',
    specular: '#0a0a0a',
    gloss: 0.12
  });
  materials.push(butterflyBodyMaterial);

  const butterflyWingMaterial = standard({
    name: 'butterfly-wing',
    diffuse: '#f4b6cf',
    specular: '#3a1f2e',
    gloss: 0.3,
    cull: pc.CULLFACE_NONE
  });
  butterflyWingMaterial.diffuseVertexColor = true;
  butterflyWingMaterial.update();
  materials.push(butterflyWingMaterial);

  const buildButterflyWing = (side: number): pc.Mesh => {
    const mesh = new pc.Mesh(device);
    mesh.setPositions([
      0, 0, -0.13,
      side * 0.36, 0, -0.15,
      side * 0.3, 0, 0.16,
      0, 0, 0.13
    ]);
    mesh.setNormals([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
    mesh.setColors([
      0.72, 0.42, 0.55, 1,
      1, 0.86, 0.95, 1,
      1, 0.86, 0.95, 1,
      0.72, 0.42, 0.55, 1
    ]);
    mesh.setIndices([0, 1, 2, 0, 2, 3]);
    mesh.update();
    return mesh;
  };
  const butterflyWingRight = buildButterflyWing(1);
  const butterflyWingLeft = buildButterflyWing(-1);
  // Caja unitaria para el cuerpo; la escala real va en la matriz de instancia.
  const butterflyBodyMesh = pc.Mesh.fromGeometry(device, new pc.BoxGeometry());
  const butterflyInstanceFormat = pc.VertexFormat.getDefaultInstancingFormat(device);

  const butterflies: Butterfly[] = [];
  const butterflyBatches: ButterflyBatch[] = [];

  for (let zoneIndex = 0; zoneIndex < fairyZones.length; zoneIndex++) {
    const zone = fairyZones[zoneIndex];
    const rand = random(0x7e3a + zoneIndex * 3559);
    // Antes eran 8 fijas por zona: en un claro pequeño bastaba, pero en un
    // mapa entero de claro feérico se perdían. Ahora la densidad se escala con
    // el área (con un mínimo de 2 y un tope para no disparar la CPU).
    const count = Math.max(
      2,
      Math.min(2000, Math.round(zoneArea(zone) * 0.025))
    );

    const body = new Float32Array(count * 16);
    const right = new Float32Array(count * 16);
    const left = new Float32Array(count * 16);
    const bodyBuffer = new pc.VertexBuffer(device, butterflyInstanceFormat, count, {
      data: body,
      usage: pc.BUFFER_DYNAMIC
    });
    const rightBuffer = new pc.VertexBuffer(device, butterflyInstanceFormat, count, {
      data: right,
      usage: pc.BUFFER_DYNAMIC
    });
    const leftBuffer = new pc.VertexBuffer(device, butterflyInstanceFormat, count, {
      data: left,
      usage: pc.BUFFER_DYNAMIC
    });
    const batch: ButterflyBatch = { body, right, left, bodyBuffer, rightBuffer, leftBuffer };
    butterflyBatches.push(batch);

    const entity = new pc.Entity(`fairy-butterflies-${zoneIndex}`);
    entity.addComponent('render');
    entity.render!.castShadows = false;
    entity.render!.receiveShadows = false;

    const bodyInstance = new pc.MeshInstance(butterflyBodyMesh, butterflyBodyMaterial);
    bodyInstance.castShadows = false;
    bodyInstance.receiveShadows = false;
    bodyInstance.setInstancing(bodyBuffer, true);

    const rightInstance = new pc.MeshInstance(butterflyWingRight, butterflyWingMaterial);
    rightInstance.castShadows = false;
    rightInstance.receiveShadows = false;
    rightInstance.setInstancing(rightBuffer, true);

    const leftInstance = new pc.MeshInstance(butterflyWingLeft, butterflyWingMaterial);
    leftInstance.castShadows = false;
    leftInstance.receiveShadows = false;
    leftInstance.setInstancing(leftBuffer, true);

    entity.render!.meshInstances = [bodyInstance, rightInstance, leftInstance];
    const bounds = zoneBounds(zone);
    entity.render!.customAabb = new pc.BoundingBox(
      new pc.Vec3(bounds.cx, 1.0, bounds.cz),
      new pc.Vec3(bounds.width / 2 + 1, 1.25, bounds.depth / 2 + 1)
    );
    worldRoot.addChild(entity);
    created.push(entity);

    for (let i = 0; i < count; i++) {
      const [x, z] = randomPointInZone(zone, rand, 0.3);
      const y = 0.5 + rand() * 1.0;
      // Pequeñas: la escala baja el cuerpo y las alas a la vez, sin tocar la
      // amplitud del aleteo ni la velocidad de vuelo.
      const butterfly: Butterfly = {
        batch,
        index: i,
        zone,
        rand: random(0x9c51 + zoneIndex * 4813 + i * 197),
        target: new pc.Vec3(x, y, z),
        x,
        y,
        z,
        scale: 0.5 + rand() * 0.2,
        speed: 0.5 + rand() * 0.5,
        flapSpeed: 9 + rand() * 5,
        phase: rand() * Math.PI * 2,
        yaw: rand() * 360
      };
      butterflies.push(butterfly);

      // Matrices iniciales para que el primer frame también sea válido.
      const yawRadians = (butterfly.yaw * Math.PI) / 180;
      const flapRadians = (Math.sin(butterfly.phase) * 30 * Math.PI) / 180;
      const offset = butterfly.index * 16;
      writeButterflyBody(body, offset, butterfly, yawRadians);
      writeButterflyWing(right, offset, butterfly, yawRadians, flapRadians);
      writeButterflyWing(left, offset, butterfly, yawRadians, -flapRadians);
      if ((i & 63) === 63) yield 1;
    }
  }
  ctx.butterflies = butterflies;
  ctx.butterflyBatches = butterflyBatches;
  ctx.butterflyBodyMesh = butterflyBodyMesh;
  ctx.butterflyWingRight = butterflyWingRight;
  ctx.butterflyWingLeft = butterflyWingLeft;
}
