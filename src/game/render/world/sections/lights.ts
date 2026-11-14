/** Sección del generador de mundo. */

import * as pc from 'playcanvas';
import { CONFIG } from '../../../config';
import type { WorldBuildContext } from '../context';
import { hex } from '../worldParts';

export function* buildLights(ctx: WorldBuildContext): Generator<number, void, void> {
  const { worldRoot, created } = ctx;
  yield 1;
  // --- Luces ---------------------------------------------------------------
  const sun = new pc.Entity('sun');
  sun.addComponent('light', {
    type: 'directional',
    color: hex('#fff1d6'),
    intensity: 1.65,
    castShadows: CONFIG.sun.shadows,
    shadowResolution: CONFIG.sun.shadowResolution,
    shadowDistance: CONFIG.sun.shadowDistance,
    normalOffsetBias: CONFIG.sun.normalOffsetBias,
    shadowBias: CONFIG.sun.shadowBias
  });
  sun.setLocalEulerAngles(52, -34, 0);
  worldRoot.addChild(sun);
  created.push(sun);

  const fill = new pc.Entity('fill');
  fill.addComponent('light', {
    type: 'directional',
    color: hex('#9dc7ff'),
    intensity: 0.35,
    castShadows: false
  });
  fill.setLocalEulerAngles(30, 150, 0);
  worldRoot.addChild(fill);
  created.push(fill);
  ctx.sun = sun;
  ctx.fill = fill;
}
