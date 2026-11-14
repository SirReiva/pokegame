/** Superficies planas trianguladas (agua, ciénaga y brumas de región). */

import * as pc from 'playcanvas';
import { triangulatePolygon } from '../../terrain';
import type { WorldBuildContext } from './context';

export function buildSurfaceMesh(
  ctx: WorldBuildContext,
  points: Array<[number, number]>,
  y: number,
  uvScale: number
): pc.Mesh | null {
  const indices = triangulatePolygon(points);
  if (indices.length === 0) return null;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (const [x, z] of points) {
    positions.push(x, y, z);
    normals.push(0, 1, 0);
    uvs.push(x / uvScale, z / uvScale);
  }

  const mesh = new pc.Mesh(ctx.device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setUvs(0, uvs);
  mesh.setIndices(indices);
  mesh.update();
  ctx.surfaceMeshes.push(mesh);
  return mesh;
}

export function addSurface(
  ctx: WorldBuildContext,
  mesh: pc.Mesh,
  material: pc.StandardMaterial,
  drawOrder: number,
  name: string
): void {
  const entity = new pc.Entity(name);
  entity.addComponent('render');
  entity.render!.castShadows = false;
  entity.render!.receiveShadows = false;
  const instance = new pc.MeshInstance(mesh, material);
  instance.castShadows = false;
  instance.receiveShadows = false;
  instance.drawOrder = drawOrder;
  entity.render!.meshInstances = [instance];
  ctx.worldRoot.addChild(entity);
  ctx.created.push(entity);
}
