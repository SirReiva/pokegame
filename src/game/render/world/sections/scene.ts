/** Sección del generador de mundo. */

import * as pc from 'playcanvas';
import { CONFIG } from '../../../config';
import type { WorldBuildContext } from '../context';

export function* buildScene(ctx: WorldBuildContext): Generator<number, void, void> {
  const { app } = ctx;
  yield 1;
  // --- Ajustes de escena -----------------------------------------------------
  app.scene.ambientLight = new pc.Color(0.46, 0.5, 0.55);
  const fog = app.scene.fog;
  fog.type = pc.FOG_LINEAR;
  fog.color = new pc.Color(...CONFIG.fog.color);
  fog.start = CONFIG.fog.near;
  fog.end = CONFIG.fog.far;
}
