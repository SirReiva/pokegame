/**
 * Calentamiento de render: precarga de shaders, modelos y mapa con la pantalla
 * de carga visible, y congelación de la cuenta atrás para dibujar la vista real.
 *
 * Todas las precargas son *best-effort*: si el compositor se bloquea o una
 * llamada falla, se avisa por consola y la carga continúa. Ninguna debe impedir
 * que la partida empiece.
 *
 * `Game` conserva el estado (mundo, cámara, vistas, objetos y efectos) y este
 * módulo solo aplica el orden de calentamiento, igual que `mapRuntime` o
 * `matchSession`.
 */

import * as pc from 'playcanvas';
import {
  ABILITIES,
  COMMON_ABILITIES,
  MOVESETS,
  type AbilityDef
} from '../abilities';
import { aoeGroupRadius } from '../aoeGroupFx';
import { aoeCirclesFrom } from '../aoeGeometry';
import type { ActorAsset } from '../actorAsset';
import type { CameraRig } from '../camera';
import type { CombatFx } from '../combatFx';
import { CONFIG } from '../config';
import type { DamageNumbers } from '../damageNumbers';
import { DeathMarker } from '../deathMarker';
import { FogView } from '../fog';
import { FOG_EXCLUDED_STENCIL } from '../fogStencil';
import { PlayerMarker } from '../marker';
import type { MatchPlayerState } from '../matchState';
import type { PickupField } from '../pickups';
import { ActorShadowBatch } from '../render/actorShadows';
import { applyModelShading } from '../render/modelShading';
import type { PlayerView } from '../render/playerView';
import { TeamOutline } from '../render/teamOutline';
import { maxHitRadius } from '../roster';
import { mapHalfDepth, mapHalfWidth } from '../terrain';
import type { World } from '../world';

/** Estado del juego que necesita el calentamiento. */
export interface WarmUpHost {
  readonly app: pc.AppBase;
  readonly world: World;
  readonly worldLayerId: number;
  readonly combatFx: CombatFx;
  readonly damageNumbers: DamageNumbers;
  readonly menuCamera: CameraRig;
  readonly assets: ReadonlyMap<string, ActorAsset>;
  /** Capas reales de las vistas, una por jugador. */
  readonly viewLayers: readonly pc.Layer[];
  readonly views: readonly MatchPlayerState[];
  readonly pickups: PickupField | null;
  /** El juego se destruyó: la carga en curso debe descartarse. */
  readonly disposed: boolean;
  /** Pokémon elegidos; sin ellos se calientan todos los movesets. */
  readonly pokemonIds: readonly string[] | undefined;

  emitLoad(percent: number, label: string): void;
  viewOf(player: MatchPlayerState): PlayerView;
  ensureFogMesh(): pc.Mesh;
}

export class WarmUp {
  /** Frames que quedan de calentamiento de la vista real. */
  private matchFrames = 0;
  /** Hay un número de daño de muestra esperando a retirarse. */
  private matchDamageNumbers = false;
  /** Retiran las esferas de precarga de blends de las capas reales. */
  private matchBlendCleanups: Array<() => void> = [];

  private readonly host: WarmUpHost;

  constructor(host: WarmUpHost) {
    this.host = host;
  }

  /**
   * Precarga los shaders de los efectos en una capa y cámara temporales. Las
   * compilaciones se hacen con la pantalla de carga visible, no en el primer
   * casteo de cada habilidad.
   */
  async warmUpShaders(): Promise<void> {
    if (!CONFIG.performance.warmUpShaders || this.host.disposed) return;

    const { app, world, combatFx, damageNumbers } = this.host;
    const layer = new pc.Layer({ name: 'shader-warmup' });
    app.scene.layers.pushTransparent(layer);

    const camera = new pc.Entity('shader-warmup-camera');
    camera.addComponent('camera', {
      nearClip: 0.1,
      farClip: 120,
      fov: 70
    });
    const cameraComponent = camera.camera;
    if (!cameraComponent) {
      app.scene.layers.remove(layer);
      return;
    }
    cameraComponent.layers = [layer.id];
    cameraComponent.clearColorBuffer = false;
    // Viewport mínimo: el coste de relleno es irrelevante, pero el shader se
    // compila igual al enviar la draw call.
    cameraComponent.rect = new pc.Vec4(0, 0, 0.01, 0.01);
    cameraComponent.scissorRect = new pc.Vec4(0, 0, 0.01, 0.01);
    camera.setPosition(0, 12, 12);
    camera.lookAt(new pc.Vec3(0, 0, 0));
    app.root.addChild(camera);

    // La capa de precarga debe recibir las mismas luces que la capa de la
    // vista real. La clave del shader incluye la lista de luces incluso en los
    // materiales `useLighting = false`, así que sin esto todos los efectos se
    // recompilaban en la primera partida (29 pipelines de `fx:basic`).
    world.addLightLayer(layer.id);

    combatFx.setWarmupLayer(layer.id);
    // El escudo y las garras usan estados de blend que nunca llegaban a
    // dibujarse en la precarga; estas esferas los compilan.
    const disposeBlendWarmup = combatFx.warmUpBlendStates(layer.id);

    // La marca de KO no pasa por `combatFx`: tiene su propio material (sin
    // niebla, con `emissiveMap`/`opacityMap` y `alphaTest`), una variante que
    // ningún efecto de combate usa. Se crea en la capa de precarga para que se
    // dibuje junto al resto y su shader quede compilado antes del primer KO.
    const deathMarker = new DeathMarker(app, 0, 0, 0, null);
    deathMarker.setLayer(layer.id);

    // El anillo de rumbo y su pasada de oclusión usan materiales propios con
    // `alphaTest`, profundidad invertida y una textura de canvas. Se dibuja uno
    // en la capa de precarga para que no compilen al aparecer el primer rival.
    const marker = new PlayerMarker(
      app,
      CONFIG.player.markerDiameter,
      CONFIG.player.markerHeight,
      CONFIG.player.markerOpacity
    );
    marker.setLayer(layer.id);
    marker.setPosition(0, 0);
    marker.setVisible(true);

    // Sombra de contacto compartida por actores y objetos (`contact-shadow`).
    // Se dibuja con el mismo lote instanciado que la partida: una primitiva
    // `plane` normal no compila la variante instanciada.
    const shadowWarmup = new ActorShadowBatch(
      app,
      world.shadowMaterial,
      layer.id,
      1
    );
    shadowWarmup.allocate().setShadow(0, 0.05, 0, 1, true);
    shadowWarmup.commit();

    // Niebla de pantalla: material propio de `ShaderMaterial`, independiente de
    // los StandardMaterial. Se dibuja un quad de muestra con la misma malla,
    // cámara y capa; la máscara real se crea al empezar la partida.
    const builtIn = (
      app.graphicsDevice as unknown as {
        builtInTextures?: { white?: pc.Texture };
      }
    ).builtInTextures;
    let fogWarmup: FogView | null = null;
    if (builtIn?.white) {
      fogWarmup = new FogView(
        app.graphicsDevice,
        this.host.ensureFogMesh(),
        camera,
        layer.id,
        0,
        builtIn.white
      );
      fogWarmup.update(
        cameraComponent,
        { x: 0, y: 0, w: 1, h: 1 },
        0,
        []
      );
    }

    // El atlas de números de daño también estrena material con el primer
    // impacto: se dibuja un número de muestra en la misma capa de precarga.
    damageNumbers.warmUp(cameraComponent, layer.id);

    const calls = this.buildWarmupCalls(this.collectWarmupAbilities());
    const batchSize = Math.max(1, CONFIG.performance.warmUpBatchSize);
    const batches = Math.ceil(calls.length / batchSize);

    try {
      for (
        let start = 0, batch = 0;
        start < calls.length;
        start += batchSize, batch++
      ) {
        const end = Math.min(start + batchSize, calls.length);
        for (let index = start; index < end; index++) calls[index]();
        // Un paso mínimo para que los materiales queden con opacidad/tiempo
        // iniciales y la draw call no se descarte por un estado transitorio.
        combatFx.update(1 / 60);

        // Dos frames: uno para enviar materiales y otro para que la
        // compilación/uso del shader quede resuelto antes de limpiar.
        await this.waitFrames(2);
        combatFx.clear();
        this.host.emitLoad(
          60 + ((batch + 1) / Math.max(1, batches)) * 15,
          'Precompilando efectos'
        );
        if (this.host.disposed) break;
      }
    } catch (error) {
      console.warn('[shaders] No se pudieron precargar todos los efectos', error);
    } finally {
      deathMarker.destroy();
      marker.destroy();
      disposeBlendWarmup();
      shadowWarmup.destroy();
      fogWarmup?.destroy();
      // Desactiva el número de muestra; la ranura queda en el pool.
      damageNumbers.clear();
      combatFx.clear();
      combatFx.setWarmupLayer(null);
      camera.destroy();
      world.resetLightLayers();
      app.scene.layers.remove(layer);
    }
  }

  /**
   * Compila los materiales de los cuerpos 3D y sube sus texturas con la
   * pantalla de carga visible. Se instancia una copia de cada modelo en una
   * capa temporal que dibuja la cámara del menú y se dejan pasar dos frames: el
   * primero envía las draw calls y el segundo da tiempo a que terminen la
   * compilación y la subida antes de destruir las copias.
   *
   * Es el equivalente a `warmUpShaders` para los modelos. Sin esto, el primer
   * Pokémon que aparece en pantalla paga shaders y texturas en mitad del
   * combate (en la traza de v0.29.8, picos de 200-338 ms).
   */
  async warmUpModels(): Promise<void> {
    if (
      !CONFIG.performance.warmUpModels ||
      this.host.disposed ||
      this.host.assets.size === 0
    ) {
      return;
    }

    const { app, world, menuCamera } = this.host;
    const layer = new pc.Layer({ name: 'model-warmup' });
    // Los cuerpos son opacos: la capa va en la lista opaca de la composición.
    app.scene.layers.pushOpaque(layer);

    // Las luces forman parte de la clave del shader. La capa de precarga debe
    // llevar la misma lista que la capa real o el modelo compila otra variante
    // en cuanto aparece en partida (`Untitled`, 15 pipelines en la traza).
    world.addLightLayer(layer.id);
    // La cámara del menú es la que ya está dibujando el mundo durante la carga.
    // Se le añade la capa y los modelos se colocan en su punto de mira; así el
    // draw es seguro y no depende de una cámara temporal.
    const menuCameraComponent = menuCamera.entity.camera;
    const menuLayers = menuCameraComponent
      ? [...menuCameraComponent.layers]
      : null;
    if (menuCameraComponent) {
      menuCameraComponent.layers = [...menuCameraComponent.layers, layer.id];
    }
    const focus = menuCamera.focusPosition;

    const entities: pc.Entity[] = [];
    let outline: TeamOutline | null = null;
    try {
      const models = [...this.host.assets.values()];
      models.forEach((asset, index) => {
        const entity = asset.model.container.instantiateRenderEntity({
          castShadows: false,
          // El cuerpo real recibe sombras; es otra variante del material.
          receiveShadows: true
        });
        entity.setLocalScale(
          asset.model.scale,
          asset.model.scale,
          asset.model.scale
        );
        // En fila y dentro del frustum de la cámara temporal. La pose es la de
        // bind: interesa la variante skinned del material, no animar.
        entity.setPosition(
          focus.x + (index - (models.length - 1) / 2) * 2.5,
          0,
          focus.z
        );
        // La jerarquía del GLB puede traer nodos intermedios desactivados.
        const enableTree = (node: pc.Entity) => {
          node.enabled = true;
          for (const child of node.children) {
            if (child instanceof pc.Entity) enableTree(child);
          }
        };
        enableTree(entity);
        for (const render of entity.findComponents('render')) {
          // La jerarquía del GLB llega con los nodos de malla desactivados;
          // `ModelBillboard` los activa al asignar el primer clip. En la copia
          // de precarga no hay `AnimComponent`, así que se activan a mano.
          render.entity.enabled = true;
          render.layers = [layer.id];
          render.castShadows = false;
          render.receiveShadows = true;
          // El cuerpo visible escribe esténcil 1 en la partida; sin el mismo
          // estado, el pipeline del modelo no coincide con el real.
          if (app.graphicsDevice.supportsStencil) {
            for (const instance of render.meshInstances) {
              instance.stencilFront = FOG_EXCLUDED_STENCIL;
              instance.stencilBack = FOG_EXCLUDED_STENCIL;
            }
          }
          for (const instance of render.meshInstances) {
            applyModelShading(instance.material);
            instance.setParameter('uDesaturate', 0);
          }
        }
        app.root.addChild(entity);
        entities.push(entity);
      });

      // La pasada de contorno (`atlas-lit`, pass:5) no la dibuja ninguna de las
      // dos cámaras normales: la pinta `OutlineRenderer` en su propio render
      // target. Se registra cada modelo en un contorno temporal para compilar
      // esa variante con la pantalla de carga, incluidos los modelos que aún no
      // son visibles en la partida.
      outline = new TeamOutline(app, 'model-warmup-outline', layer);
      for (const entity of entities) {
        outline.add(entity, [255, 255, 255]);
      }
      outline.frameUpdate(menuCamera.entity, {
        x: 0,
        y: 0,
        w: 0.02,
        h: 0.02
      });

      // Un frame para enviar los draws y otro para que la compilación y la
      // subida de texturas terminen antes de destruir las copias.
      await this.waitFrames(2);
    } catch (error) {
      console.warn('[modelos] No se pudieron precargar todos los cuerpos', error);
    } finally {
      outline?.destroy();
      for (const entity of entities) entity.destroy();
      if (menuCameraComponent && menuLayers) {
        menuCameraComponent.layers = menuLayers;
      }
      world.resetLightLayers();
      app.scene.layers.remove(layer);
    }
  }

  /**
   * Dibuja el mapa entero desde una cámara temporal durante la carga. La
   * cámara de partida recorta con la niebla (~50 u), así que los materiales de
   * zonas que el jugador no ve al aparecer (ciénaga, volcán, hielo) no llegaban
   * a dibujarse en la precarga y estrenaban su pipeline en mitad del combate
   * (169–193 ms). Un frame desde arriba los compila todos con la pantalla de
   * carga por delante. La cámara es temporal: addComponent('camera') y destroy
   * en el mismo frame.
   */
  async warmUpWorldView(): Promise<void> {
    if (!CONFIG.performance.warmUpWorldView || this.host.disposed) return;

    const { app, worldLayerId } = this.host;
    const radius = Math.hypot(mapHalfWidth(), mapHalfDepth());
    // Inclinada, no cenital pura: `lookAt` con el up del mundo no admite mirar
    // recto hacia abajo. FOV y recorte no forman parte de la firma del
    // pipeline, así que basta con que el mapa entero entre en el frustum.
    const height = radius * 2.4;
    const camera = new pc.Entity('world-warmup-camera');
    camera.addComponent('camera', {
      clearColor: new pc.Color(0, 0, 0),
      clearColorBuffer: false,
      fov: 55,
      nearClip: 0.5,
      farClip: height * 2,
      layers: [worldLayerId]
    });
    camera.setPosition(0, height, height * 0.55);
    camera.lookAt(0, 0, 0);
    app.root.addChild(camera);
    try {
      // Un frame para enviar los draws y otro para que la compilación termine.
      await this.waitFrames(2);
    } catch (error) {
      console.warn('[mundo] No se pudo precargar el mapa completo', error);
    } finally {
      camera.destroy();
    }
  }

  /**
   * Calienta la vista real justo después de crear cámaras, niebla, contornos,
   * anillos, copias de actores y objetos. La cuenta atrás se queda congelada
   * unos frames mientras se dibuja la escena de verdad: así los pipelines de
   * `fog-of-war`, `player-marker`, `atlas-lit` (pasada de contorno),
   * `pickup-unused` y `damage-numbers` se compilan con el overlay visible y no
   * en mitad del primer combate.
   */
  beginMatchWarmUp(): void {
    if (!CONFIG.performance.matchWarmUp) {
      this.matchFrames = 0;
      return;
    }
    this.matchFrames = Math.max(1, CONFIG.performance.matchWarmUpFrames);
    this.host.pickups?.beginWarmUp();
    // Un número de daño por vista con la cámara y la capa reales. Se retira al
    // terminar el calentamiento; la ranura y el material quedan en el pool.
    this.matchDamageNumbers = this.host.views.length > 0;
    for (let index = 0; index < this.host.views.length; index++) {
      const player = this.host.views[index];
      const view = this.host.viewOf(player);
      const camera = view.camera.entity.camera;
      const layer = this.host.viewLayers[index];
      if (!camera || !layer) continue;
      this.host.damageNumbers.warmUp(
        camera,
        layer.id,
        player.x,
        1.5,
        player.z
      );
      // La capa real tiene su propia lista de luces; los blends de efecto
      // calentados en la capa de carga no coinciden con su clave de shader.
      // Una esfera por vista, delante del jugador, compila el estado real.
      this.matchBlendCleanups.push(
        this.host.combatFx.warmUpBlendStates(layer.id, player.x, player.z)
      );
    }
  }

  /** Cierra el calentamiento: los objetos vuelven a depender de la niebla. */
  endMatchWarmUp(): void {
    if (this.matchFrames > 0) this.matchFrames = 0;
    this.host.pickups?.endWarmUp();
    if (this.matchBlendCleanups.length > 0) {
      for (const dispose of this.matchBlendCleanups) dispose();
      this.matchBlendCleanups = [];
    }
    if (this.matchDamageNumbers) {
      this.matchDamageNumbers = false;
      this.host.damageNumbers.clear();
    }
  }

  /**
   * Avanza un frame de la cuenta atrás. Devuelve `true` mientras la cuenta
   * atrás debe seguir congelada; en el frame en que termina también devuelve
   * `true` (se dibuja una última vez sin consumir tiempo visible).
   */
  freezeCountdownFrame(): boolean {
    if (this.matchFrames <= 0) return false;
    this.matchFrames -= 1;
    if (this.matchFrames === 0) this.endMatchWarmUp();
    return true;
  }

  /**
   * Habilidades que pueden lanzarse en esta partida. Se deduplican por id y se
   * calientan con sus valores reales (radio, ángulo y color) para que las
   * mallas y los emisores queden cacheados antes del primer casteo.
   */
  private collectWarmupAbilities(): AbilityDef[] {
    const abilities = new Map<string, AbilityDef>();
    const add = (def: AbilityDef | null | undefined) => {
      if (def) abilities.set(def.id, def);
    };

    const ids = this.host.pokemonIds;
    if (ids && ids.length > 0) {
      for (const id of ids) {
        for (const abilityId of MOVESETS[id] ?? []) {
          if (abilityId) add(ABILITIES[abilityId]);
        }
      }
    } else {
      for (const moveset of Object.values(MOVESETS)) {
        for (const abilityId of moveset) {
          if (abilityId) add(ABILITIES[abilityId]);
        }
      }
    }
    for (const def of Object.values(COMMON_ABILITIES)) add(def);

    return [...abilities.values()];
  }

  private buildWarmupCalls(abilities: AbilityDef[]): Array<() => void> {
    const combatFx = this.host.combatFx;
    const calls: Array<() => void> = [];
    const white: [number, number, number] = [255, 255, 255];
    const x = 0;
    const z = 0;
    const seen = new Set<string>();
    const push = (key: string, call: () => void) => {
      if (seen.has(key)) return;
      seen.add(key);
      calls.push(call);
    };

    for (const def of abilities) {
      const radius = Math.max(0.08, def.radius);
      const padding = maxHitRadius();
      const colorKey = `${def.color[0]},${def.color[1]},${def.color[2]}`;

      push(`impact:${def.impactStyle}:${colorKey}`, () =>
        combatFx.spawnImpact(x, z, def.color, 1, def.impactStyle)
      );

      if (def.shape === 'projectile') {
        push(
          `projectile:${def.projectileStyle}:${radius.toFixed(3)}:${colorKey}`,
          () =>
            combatFx.spawnProjectile(
              x,
              z,
              def.color,
              radius,
              def.projectileStyle,
              1,
              0
            )
        );
      } else if (def.shape === 'beam') {
        push(`beam:${def.beamStyle}:${radius.toFixed(3)}:${colorKey}`, () =>
          combatFx.spawnBeam(-1, 0, 1, 0, def.color, radius, def.beamStyle)
        );
      } else if (def.shape === 'aoe') {
        const length = radius + padding;
        if (def.aoeShape === 'cone') {
          push(
            `aoe-cone:${def.aoeStyle}:${length.toFixed(3)}:${def.halfAngle}:${colorKey}`,
            () => {
              combatFx.spawnAoeCone(
                x,
                z,
                0,
                1,
                length,
                def.halfAngle,
                def.color,
                def.aoeStyle,
                Math.max(0.1, def.aoeDuration)
              );
              combatFx.spawnAoeConeTelegraph(
                x,
                z,
                0,
                1,
                length,
                def.halfAngle,
                def.color,
                0.4,
                0.4
              );
            }
          );
        } else {
          const circles =
            def.aoeCircles.length === 0
              ? [{ x, z, radius }]
              : def.aoeCircleFx === 'grouped'
                ? [{ x, z, radius: aoeGroupRadius(def, x, z, 0, 1) }]
                : aoeCirclesFrom(def, x, z, 0, 1);
          circles.forEach((circle, index) => {
            const length = Math.max(0.08, circle.radius) + padding;
            push(`aoe:${def.aoeStyle}:${length.toFixed(3)}:${colorKey}:${index}`, () =>
              combatFx.spawnAoe(
                x,
                z,
                length,
                def.color,
                def.aoeStyle,
                Math.max(0.1, def.aoeDuration)
              )
            );
          });
        }
      } else if (def.shape === 'melee') {
        push(
          `melee:${def.impactStyle}:${(def.range + padding).toFixed(3)}:${def.halfAngle}:${colorKey}`,
          () =>
            combatFx.spawnMelee(
              x,
              z,
              0,
              def.range + padding,
              def.halfAngle,
              def.color,
              def.impactStyle
            )
        );
        if (def.startup > 0) {
          push(
            `melee-telegraph:${(def.range + padding).toFixed(3)}:${def.halfAngle}:${colorKey}`,
            () =>
              combatFx.spawnAoeConeTelegraph(
                x,
                z,
                0,
                1,
                def.range + padding,
                def.halfAngle,
                def.color,
                0.4,
                0.15
              )
          );
        }
      } else if (def.shape === 'dash') {
        push(`dash:${colorKey}`, () =>
          combatFx.spawnDash(-1, 0, 1, 0, def.color)
        );
      } else if (!def.shield && def.healSelf <= 0) {
        push(`buff:${colorKey}`, () =>
          combatFx.spawnBuff(x, z, def.color, Math.max(0.8, def.radius))
        );
      }
    }

    // Efectos compartidos que no dependen de una habilidad concreta.
    push('lane', () =>
      combatFx.spawnBeamLane(-1, 0, 1, 0, 0.3, white, 0, 'electric')
    );
    push('telegraph', () =>
      combatFx.spawnAoeTelegraph(x, z, 1.5, white, 0.6, 0.6)
    );
    push('dash', () => combatFx.spawnDash(-1, 0, 1, 0, white));
    push('buff', () => combatFx.spawnBuff(x, z, white, 1));
    push('heal', () => combatFx.spawnHeal(x, z, white, 1));

    // Feedback de la armadura de casteo. No depende de una habilidad concreta
    // (usa el `accent` del Pokémon que la lleva), así que no entra en el bucle
    // de `abilities`. El color es un uniform, no una variante de shader, así
    // que basta con calentar las mallas y los materiales una vez: sin esto, el
    // primer golpe absorbido compilaba a mitad de combate.
    push('armor-aura', () =>
      combatFx.spawnArmorAura({ x, z }, white, 1, 0.3)
    );
    push('armor-pulse', () => combatFx.spawnArmorPulse(x, z, white, 1));
    push('armor-break', () => combatFx.spawnArmorBreak(x, z, white, 1));

    return calls;
  }

  private waitFrames(count: number, timeoutMs = 2000): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      let remaining = count;
      const step = () => {
        remaining -= 1;
        if (remaining <= 0) {
          finish();
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      // Compilar/rasterizar una textura grande puede bloquear el compositor y
      // dejar de entregar rAF. La precarga es best-effort: si eso pasa, se
      // continúa para que la pantalla de carga no se quede clavada.
      setTimeout(() => {
        if (settled) return;
        console.warn('[shaders] rAF bloqueado durante la precarga; se continúa');
        finish();
      }, timeoutMs);
    });
  }
}
