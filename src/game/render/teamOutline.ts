import * as pc from 'playcanvas';
import type { SplitRect } from '../multiplayer';

/**
 * Escala del render target del contorno respecto al viewport. A un cuarto de
 * resolución, cada téxel de la dilatación interna del motor ocupa cuatro
 * píxeles de pantalla: el borde queda en ~4 px, el doble que el de los
 * sprites, y se suaviza al componerlo.
 */
const OUTLINE_RENDER_SCALE = 0.45;

/**
 * Contorno de equipo para los cuerpos 3D.
 *
 * PlayCanvas trae un `OutlineRenderer` pensado para el editor: dibuja cada
 * entidad en una textura propia, detecta el borde de su silueta y lo compone
 * sobre la escena. Aquí se usa una instancia por viewport porque cada vista
 * tiene su cámara, su capa de actores y su viewport del splitscreen.
 *
 * El render target interno se ajusta al tamaño en píxeles del viewport (no al
 * de la pantalla completa), con `OUTLINE_RENDER_SCALE`, y la cámara interna
 * copia la transformación y la proyección de la cámara de la vista. Así el
 * contorno coincide con el cuerpo también cuando la pantalla está dividida.
 *
 * Los contornos se componen justo antes de la parte opaca de la capa de la
 * vista: se pintan sobre el mundo ya dibujado y los propios modelos los tapan
 * después, dejando solo el borde exterior. El pass no escribe profundidad, de
 * modo que no interfiere con el resto de la escena.
 */
export class TeamOutline {
  /** Capa exclusiva de la cámara interna; ninguna cámara de juego la dibuja. */
  readonly layer: pc.Layer;

  private readonly app: pc.AppBase;
  /** Capa de la vista: el contorno se compone antes de sus cuerpos opacos. */
  private readonly blendLayer: pc.Layer;
  private readonly renderer: pc.OutlineRenderer;
  private readonly outlined = new Set<pc.Entity>();
  private width = 1;
  private height = 1;

  constructor(app: pc.AppBase, name: string, blendLayer: pc.Layer) {
    this.app = app;
    this.blendLayer = blendLayer;
    this.layer = new pc.Layer({ name });
    app.scene.layers.push(this.layer);
    // Prioridad negativa: la cámara del contorno debe renderizar antes que la
    // cámara de la vista para que su textura esté lista al componerla.
    this.renderer = new pc.OutlineRenderer(app, this.layer, -1);
  }

  /**
   * Añade una entidad (y sus descendientes) al contorno con el color del
   * equipo. El color va en 0-255, como el `accent` del manifiesto.
   */
  add(entity: pc.Entity, accent: readonly [number, number, number]): void {
    const color = new pc.Color(
      accent[0] / 255,
      accent[1] / 255,
      accent[2] / 255
    );
    this.outlined.add(entity);
    this.renderer.addEntity(entity, color, true);
  }

  /** Deja de dibujar el contorno de una entidad. */
  remove(entity: pc.Entity): void {
    if (!this.outlined.delete(entity)) return;
    this.renderer.removeEntity(entity, true);
  }

  /**
   * Sincroniza la cámara interna con la de la vista y programa la composición
   * del contorno para este frame. Debe llamarse después de colocar la cámara.
   */
  frameUpdate(cameraEntity: pc.Entity, viewport: SplitRect): void {
    const sceneCamera = cameraEntity.camera;
    if (!sceneCamera) return;

    const device = this.app.graphicsDevice;
    const width = Math.max(
      1,
      Math.round(device.width * viewport.w * OUTLINE_RENDER_SCALE)
    );
    const height = Math.max(
      1,
      Math.round(device.height * viewport.h * OUTLINE_RENDER_SCALE)
    );
    if (width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      this.renderer.rt.resize(width, height);
      this.renderer.tempRt.resize(width, height);
    }

    const outlineEntity = this.renderer.outlineCameraEntity;
    const outlineCamera = outlineEntity.camera;
    if (!outlineCamera) return;
    outlineEntity.setPosition(cameraEntity.getPosition());
    outlineEntity.setRotation(cameraEntity.getRotation());
    outlineCamera.projection = sceneCamera.projection;
    outlineCamera.horizontalFov = sceneCamera.horizontalFov;
    outlineCamera.fov = sceneCamera.fov;
    outlineCamera.orthoHeight = sceneCamera.orthoHeight;
    outlineCamera.nearClip = sceneCamera.nearClip;
    outlineCamera.farClip = sceneCamera.farClip;

    this.renderer.blendCamera = sceneCamera;
    this.renderer.blendLayer = this.blendLayer;
    this.renderer.blendLayerTransparent = false;
  }

  destroy(): void {
    // `destroy` retira antes todas las entidades y libera texturas y cámara.
    this.renderer.destroy();
    this.outlined.clear();
    this.app.scene.layers.remove(this.layer);
  }
}
