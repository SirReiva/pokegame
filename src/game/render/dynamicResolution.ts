/**
 * Resolución dinámica por FPS.
 *
 * Solo cambia `device.maxPixelRatio`: no toca la simulación ni los efectos.
 * Las bajadas son más rápidas que las subidas para no oscilar cuando el FPS
 * ronda el umbral.
 */

import type * as pc from 'playcanvas';
import { CONFIG } from '../config';

export class DynamicResolution {
  private baseline = 1;
  private scale = 1;
  private timer = 0;
  private lowTime = 0;
  private highTime = 0;

  private readonly app: pc.AppBase;

  constructor(app: pc.AppBase) {
    this.app = app;
  }

  /** Fija el presupuesto de píxeles del modo actual y reinicia la escala. */
  setBaseline(baseline: number): void {
    this.baseline = baseline;
    this.scale = 1;
    this.timer = 0;
    this.lowTime = 0;
    this.highTime = 0;
    this.apply();
  }

  /** Ajusta la escala según el FPS con histéresis. */
  update(dt: number, fps: number): void {
    const settings = CONFIG.performance.dynamicResolution;
    if (!settings.enabled) return;

    this.timer += dt;
    if (this.timer < settings.sampleSeconds) return;
    this.timer = 0;

    if (fps < settings.lowerFps) {
      this.highTime = 0;
      this.lowTime += settings.sampleSeconds;
      if (
        this.lowTime >= settings.lowerDelay &&
        this.scale > settings.minScale + 0.001
      ) {
        this.scale = Math.max(settings.minScale, this.scale - settings.step);
        this.apply();
        this.lowTime = 0;
      }
      return;
    }

    if (fps > settings.raiseFps) {
      this.lowTime = 0;
      this.highTime += settings.sampleSeconds;
      if (
        this.highTime >= settings.raiseDelay &&
        this.scale < 1 - 0.001
      ) {
        this.scale = Math.min(1, this.scale + settings.step);
        this.apply();
        this.highTime = 0;
      }
      return;
    }

    this.lowTime = 0;
    this.highTime = 0;
  }

  /**
   * Aplica la escala actual. `maxPixelRatio` solo se usa en el próximo
   * `resizeCanvas`, así que hay que forzar el recálculo del canvas.
   */
  private apply(): void {
    const device = this.app.graphicsDevice;
    const ratio = this.baseline * this.scale;
    if (Math.abs(device.maxPixelRatio - ratio) < 0.001) return;
    device.maxPixelRatio = ratio;
    this.app.updateCanvasSize();
  }
}
