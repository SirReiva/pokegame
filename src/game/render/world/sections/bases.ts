/** Sección del generador de mundo. */

import * as pc from 'playcanvas';
import { TEAM_INFO } from '../../../multiplayer';
import { BASE_COLLIDER_RADIUS } from '../../../terrain';
import type { WorldBuildContext } from '../context';
import { hex, part, standard } from '../worldParts';

export function* buildBases(ctx: WorldBuildContext): Generator<number, void, void> {
  const { bases, worldRoot, created, materials, colliders } = ctx;
  yield 1;
  // --- Nexos de las bases ---------------------------------------------------
  // Pedestal de piedra con un cristal emisivo del color del equipo y una luz
  // corta que tiñe la plataforma. Marcan el centro de cada base.
  const stoneMaterial = standard({
    name: 'base-stone',
    diffuse: '#8b8375',
    specular: '#1a1a1a',
    gloss: 0.14
  });
  materials.push(stoneMaterial);
  for (const base of bases) {
    const color = TEAM_INFO[base.team].color;
    const crystalMaterial = standard({
      name: `base-crystal-${base.team}`,
      diffuse: '#22303f',
      emissive: color,
      specular: '#ffffff',
      gloss: 0.8
    });
    materials.push(crystalMaterial);

    const nexus = new pc.Entity(`nexus-${base.team}`);
    nexus.setPosition(base.x, 0, base.z);
    worldRoot.addChild(nexus);
    created.push(nexus);

    part(nexus, 'cylinder', stoneMaterial, {
      position: [0, 0.24, 0],
      scale: [1.6, 0.48, 1.6]
    });
    part(nexus, 'cylinder', stoneMaterial, {
      position: [0, 0.62, 0],
      scale: [1.05, 0.3, 1.05]
    });
    const crystal = part(nexus, 'sphere', crystalMaterial, {
      position: [0, 1.35, 0],
      scale: [0.62, 0.92, 0.62]
    });
    crystal.render!.castShadows = false;

    const glow = new pc.Entity(`nexus-light-${base.team}`);
    glow.addComponent('light', {
      type: 'omni',
      color: hex(color),
      intensity: 0.9,
      range: 7,
      castShadows: false
    });
    glow.setPosition(base.x, 1.7, base.z);
    worldRoot.addChild(glow);
    created.push(glow);

    colliders.push({
      type: 'circle',
      x: base.x,
      z: base.z,
      radius: BASE_COLLIDER_RADIUS
    });
  }
}
