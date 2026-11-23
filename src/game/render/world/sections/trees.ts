/** Sección del generador de mundo. */

import * as pc from 'playcanvas';
import {
  mountainAtInMap,
  terrainAtInMap,
  zoneContainsInset
} from '../../../terrain';
import type { WorldBuildContext } from '../context';
import { random } from '../random';
import { SPAWN_TREES } from '../tuning';
import { part, standard } from '../worldParts';

export function* buildTrees(ctx: WorldBuildContext): Generator<number, void, void> {
  const { map, terrainZones, HALF_X, HALF_Z, colliders, created, materials, worldRoot } = ctx;
  const { bark: barkTexture, leaves: leafTextures } = ctx.detailTextures;
  yield 1;
  // --- Vegetación ----------------------------------------------------------
  const trunkMaterial = standard({
    name: 'tree-trunk',
    diffuseMap: barkTexture,
    specular: '#000000',
    gloss: 0.05
  });
  const leafMaterials = leafTextures.map((texture, index) =>
    standard({
      name: `tree-leaf-${index}`,
      diffuseMap: texture,
      specular: '#0d1a0d',
      gloss: 0.12
    })
  );
  materials.push(trunkMaterial, ...leafMaterials);

  // Jungla: los árboles se reparten de forma determinista y se descartan los
  // que caen sobre carriles, bases, lago o calveros, para no tapar el mapa.
  const scatter = (count: number, seed: number, minGap: number) => {
    const rand = random(seed);
    const spots: Array<[number, number]> = [];
    for (let attempt = 0; attempt < count * 24 && spots.length < count; attempt++) {
      const x = (rand() * 2 - 1) * (HALF_X - 1.4);
      const z = (rand() * 2 - 1) * (HALF_Z - 1.4);
      if (terrainAtInMap(map, x, z) !== 'jungle') continue;
      if (mountainAtInMap(map, x, z)) continue;
      if (
        terrainZones.some((zone) => zoneContainsInset(zone, x, z, -1.1))
      ) {
        continue;
      }
      if (spots.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < minGap)) continue;
      spots.push([x, z]);
    }
    return spots;
  };

  const trees: Array<[number, number, number]> = SPAWN_TREES
    ? scatter(46, 0x7a11, 1.9).map(([x, z], index) => {
        const rand = random(index * 977 + 13);
        return [x, z, 0.72 + rand() * 0.38];
      })
    : [];

  trees.forEach(([x, z, scale], index) => {
    const tree = new pc.Entity(`tree-${index}`);
    tree.setPosition(x, 0, z);
    tree.setLocalScale(scale, scale, scale);
    tree.setLocalEulerAngles(0, (index * 47) % 360, 0);
    worldRoot.addChild(tree);
    created.push(tree);

    part(tree, 'cylinder', trunkMaterial, {
      position: [0, 1.35, 0],
      scale: [0.42, 2.7, 0.42]
    });

    const rand = random(index * 977 + 13);
    const blobs: Array<[number, number, number, number]> = [
      [0, 3.1, 0, 1.42],
      [0.85, 3.7, 0.35, 1.0],
      [-0.8, 3.55, -0.3, 0.92],
      [0.1, 4.3, -0.1, 0.78]
    ];
    blobs.forEach(([bx, by, bz, radius], blobIndex) => {
      part(tree, 'sphere', leafMaterials[(index + blobIndex) % leafMaterials.length], {
        position: [bx + (rand() - 0.5) * 0.2, by, bz + (rand() - 0.5) * 0.2],
        scale: [radius * 2, radius * 1.8, radius * 2],
        rotation: [0, rand() * 180, 0]
      });
    });

    colliders.push({ type: 'circle', x, z, radius: 0.55 * scale, sightRadius: 1.25 * scale });
  });
}
