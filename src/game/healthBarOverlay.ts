import * as pc from 'playcanvas';
import { DEG } from './config';
import type { HealthBarArt } from './healthBar';
import type { MatchPlayerState } from './matchState';

const worldPoint = new pc.Vec3();
const screenPoint = new pc.Vec3();

/**
 * Pinta las barras de vida en una capa 2D sobre el canvas del juego.
 *
 * Antes cada copia del splitscreen tenía tres quads 3D con su propia textura y
 * material. Ahora hay un canvas de barras por **jugador** y esta capa lo
 * proyecta una vez por frame en cada viewport: mismo aspecto, sin materiales ni
 * draw calls por copia y sin depender del número de vistas.
 *
 * El canvas vive en el DOM, encima del canvas de WebGL y debajo del HUD de
 * React. Se redimensiona solo cuando cambia el tamaño de la ventana o el DPR.
 */
export class HealthBarOverlay {
  private readonly canvas: HTMLCanvasElement | null;
  private readonly context: CanvasRenderingContext2D | null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  /** Zonas pintadas en el frame anterior; solo esas hay que limpiar. */
  private dirty: Array<{ x: number; y: number; w: number; h: number }> = [];
  private nextDirty: Array<{ x: number; y: number; w: number; h: number }> = [];

  constructor(canvas: HTMLCanvasElement | null) {
    this.canvas = canvas;
    this.context = canvas?.getContext('2d') ?? null;
  }

  /** Borra la capa; se usa al volver al menú o terminar la partida. */
  clear(): void {
    if (!this.context || this.width <= 0) return;
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.context.clearRect(0, 0, this.width, this.height);
    this.dirty.length = 0;
    this.nextDirty.length = 0;
  }

  /**
   * Proyecta y dibuja las barras de todos los jugadores en cada viewport.
   * `views` son las cámaras humanas y `players` todos los participantes.
   */
  render(views: MatchPlayerState[], players: MatchPlayerState[]): void {
    const context = this.context;
    if (!context) return;
    if (!this.resize()) {
      this.clear();
      return;
    }

    const width = this.width;
    const height = this.height;
    context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Limpiar solo lo que se pintó en el frame anterior evita marcar como
    // sucia toda la pantalla (y subir el canvas completo al compositor) cuando
    // solo hay unas pocas barras.
    this.clearDirty(context);
    this.nextDirty.length = 0;
    // Las barras se reducen con la distancia; suavizar la minificación evita
    // que el número de nivel salga dentado en las vistas pequeñas.
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    for (let viewIndex = 0; viewIndex < views.length; viewIndex++) {
      const viewer = views[viewIndex];
      const camera = viewer.camera.entity.camera;
      if (!camera) continue;

      const rect = viewer.viewport;
      const left = rect.x * width;
      const top = (1 - rect.y - rect.h) * height;
      const right = left + rect.w * width;
      const bottom = top + rect.h * height;
      if (right - left < 4 || bottom - top < 4) continue;

      context.save();
      context.beginPath();
      // Un píxel de margen para que la barra de una vista no se derrame en la
      // vecina cuando el actor queda justo en el borde.
      context.rect(left + 1, top + 1, right - left - 2, bottom - top - 2);
      context.clip();

      const cameraPosition = viewer.camera.position;
      const forward = viewer.camera.entity.forward;
      const halfTan = Math.tan((camera.fov * DEG) / 2);
      const viewportHeight = bottom - top;

      for (const player of players) {
        const copy = player.copies[viewIndex];
        const bar = player.bar;
        if (!copy || !copy.isVisible || !bar || !bar.isVisible) continue;

        worldPoint.set(player.x, copy.barAnchorY, player.z);
        camera.worldToScreen(worldPoint, screenPoint, width, height);

        // Profundidad a lo largo del eje de la cámara: es la que usa la
        // proyección para escalar la barra, no la distancia euclídea.
        const depth =
          (worldPoint.x - cameraPosition.x) * forward.x +
          (worldPoint.y - cameraPosition.y) * forward.y +
          (worldPoint.z - cameraPosition.z) * forward.z;
        if (depth <= camera.nearClip) continue;

        const pixelsPerWorld = viewportHeight / (2 * halfTan * depth);
        const bounds = drawBar(
          context,
          bar,
          screenPoint.x,
          screenPoint.y,
          pixelsPerWorld,
          this.dpr
        );
        if (!bounds) continue;
        // Solo se registra la parte que cae dentro del viewport: el resto del
        // quad lo recorta el clip y no necesita limpieza.
        const x = Math.max(left + 1, bounds.x);
        const y = Math.max(top + 1, bounds.y);
        const rightEdge = Math.min(right - 1, bounds.x + bounds.w);
        const bottomEdge = Math.min(bottom - 1, bounds.y + bounds.h);
        if (rightEdge > x && bottomEdge > y) {
          this.nextDirty.push({
            x,
            y,
            w: rightEdge - x,
            h: bottomEdge - y
          });
        }
      }

      context.restore();
    }

    // Reutiliza los arrays: el del frame actual pasa a ser el del siguiente.
    const previousDirty = this.dirty;
    this.dirty = this.nextDirty;
    this.nextDirty = previousDirty;
  }

  /**
   * Borra únicamente las zonas que se pintaron en el frame anterior. El
   * rectángulo se redondea hacia fuera porque `drawImage` pinta bordes
   * suavizados de hasta un píxel por fuera de las coordenadas fraccionarias:
   * sin ese margen, las barras en movimiento dejan estelas de 1 px.
   */
  private clearDirty(context: CanvasRenderingContext2D): void {
    for (const rect of this.dirty) {
      const x = Math.floor(rect.x) - 2;
      const y = Math.floor(rect.y) - 2;
      context.clearRect(x, y, Math.ceil(rect.w) + 4, Math.ceil(rect.h) + 4);
    }
  }

  /** Ajusta el buffer del canvas al tamaño CSS y al DPR actuales. */
  private resize(): boolean {
    const canvas = this.canvas;
    if (!canvas) return false;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    if (cssWidth <= 0 || cssHeight <= 0) return false;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(cssWidth * dpr);
    const pixelHeight = Math.round(cssHeight * dpr);
    if (
      this.width !== cssWidth ||
      this.height !== cssHeight ||
      this.dpr !== dpr ||
      canvas.width !== pixelWidth ||
      canvas.height !== pixelHeight
    ) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      this.width = cssWidth;
      this.height = cssHeight;
      this.dpr = dpr;
      // El cambio de tamaño ya limpia el bitmap; no quedan zonas pendientes.
      this.dirty.length = 0;
      this.nextDirty.length = 0;
    }
    return true;
  }
}

/**
 * Dibuja una barra completa. `bottom` es el punto proyectado donde apoya la
 * barra de vida, así que el resto se coloca hacia arriba y hacia los lados en
 * píxeles, igual que hacían los quads 3D.
 *
 * Todas las medidas se alinean al píxel **físico** del canvas: con coordenadas
 * fraccionarias, `drawImage` remuestrea la barra en cada frame y sus bordes
 * vibran mientras el Pokémon se mueve (se ve como ruido dentro del contorno).
 */
function drawBar(
  context: CanvasRenderingContext2D,
  bar: HealthBarArt,
  centerX: number,
  bottom: number,
  pixelsPerWorld: number,
  dpr: number
): { x: number; y: number; w: number; h: number } | null {
  const layout = bar.layout;
  // Redondeo a píxel de dispositivo: la barra queda nítida y estable.
  const snap = (value: number) => Math.round(value * dpr) / dpr;
  const snapSize = (value: number) =>
    Math.max(1 / dpr, Math.round(value * dpr) / dpr);

  const barWidth = snapSize(layout.width * pixelsPerWorld);
  const barHeight = snapSize(layout.height * pixelsPerWorld);
  if (barWidth < 3 || barHeight < 1) return null;

  const anchor = snap(bottom);
  const left = snap(centerX - barWidth / 2);

  // La barra de XP va debajo del punto de apoyo.
  const xpWidth = snapSize(layout.xpWidth * pixelsPerWorld);
  const xpHeight = snapSize(layout.xpHeight * pixelsPerWorld);
  const xpGap = snap(layout.xpGap * pixelsPerWorld);
  context.drawImage(
    bar.xpCanvas,
    snap(centerX - xpWidth / 2),
    anchor + xpGap,
    xpWidth,
    xpHeight
  );

  // Barra de vida: el punto de apoyo es su borde inferior.
  context.drawImage(
    bar.barCanvas,
    left,
    anchor - barHeight,
    barWidth,
    barHeight
  );

  // Distintivo de nivel, centrado verticalmente con la barra y a su izquierda.
  const badge = snapSize(layout.badgeSize * pixelsPerWorld);
  const gap = snap(layout.badgeGap * pixelsPerWorld);
  const hasBadge = badge >= 2;
  const badgeLeft = snap(left - gap - badge);
  const badgeTop = snap(anchor - barHeight / 2 - badge / 2);
  if (hasBadge) {
    context.drawImage(
      bar.badgeCanvas,
      badgeLeft,
      badgeTop,
      badge,
      badge
    );
  }

  // Caja que ocupa todo lo pintado, para limpiar solo esa zona el próximo
  // frame. El distintivo puede sobresalir por arriba y por la izquierda.
  const minX = hasBadge ? badgeLeft : left;
  const minY = hasBadge
    ? Math.min(anchor - barHeight, badgeTop)
    : anchor - barHeight;
  const maxX = left + barWidth;
  const maxY = hasBadge
    ? Math.max(anchor + xpGap + xpHeight, badgeTop + badge)
    : anchor + xpGap + xpHeight;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
