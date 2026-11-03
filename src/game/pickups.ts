/**
 * Objetos recogibles en el mundo.
 *
 * Cada mapa declara sus `pickups` (tipo y posición). Este módulo convierte esa
 * lista en billboards con dos imágenes (disponible / usada), los hace flotar y
 * resuelve la recogida automática al pasar por encima.
 *
 * El estado es global: hay un solo objeto compartido por todos los jugadores.
 * Al recogerlo se cambia a la imagen usada y empieza su cooldown; al terminar,
 * vuelve a la imagen disponible en el mismo sitio.
 */

import * as pc from 'playcanvas';
import { CONFIG, DEG } from './config';
import {
  ITEM_DEFINITIONS,
  ITEM_IDS,
  type ItemDefinition,
  type ItemId,
  type ItemResolveContext,
  type PickupSpawn
} from './items';
import type { MatchPlayerState } from './matchState';
import { loadImage } from './sprite';
import type { GameMap } from './terrain';
import { textureFromCanvas } from './textures';
import type { PokemonEntry } from './types';

export interface ItemTextures {
  unused: pc.Texture;
  used: pc.Texture;
}

export type ItemTextureMap = Map<ItemId, ItemTextures>;

/** Handlers que conectan los objetos con el estado de la partida. */
export interface PickupHandlers {
  /** Entrada del Pokémon que controla el jugador, o `null` si no está cargado. */
  pokemonFor(player: MatchPlayerState): PokemonEntry | null;
  /** Cura PV y devuelve la cantidad realmente curada. */
  heal(player: MatchPlayerState, amount: number): number;
  /** Pinta el número de curación sobre el jugador. */
  showHeal(player: MatchPlayerState, amount: number): void;
  /** Efecto opcional al consumir el objeto (aura, partículas...). */
  onCollected?(player: MatchPlayerState, definition: ItemDefinition): void;
  /**
   * ¿Puede el jugador ver y alcanzar el objeto? El juego comprueba aquí los
   * colliders y la visibilidad del equipo; sin este handler la recogida vuelve
   * a depender solo de la distancia.
   */
  canReach?(player: MatchPlayerState, spawn: PickupSpawn): boolean;
}

interface PickupInstance {
  spawn: PickupSpawn;
  definition: ItemDefinition;
  textures: ItemTextures;
  /** Vista del menú (capa World), visible solo fuera de partida. */
  menuView: PickupView;
  /** Una copia por viewport durante la partida, en su capa de render. */
  views: PickupView[];
  cooldown: number;
  available: boolean;
}

function createPlaceholderTexture(
  device: pc.GraphicsDevice,
  color: string,
  name: string
): pc.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d');
  if (context) {
    context.clearRect(0, 0, 32, 32);
    context.fillStyle = color;
    context.beginPath();
    context.arc(16, 18, 11, 0, Math.PI * 2);
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = '#281a34';
    context.stroke();
  }
  return textureFromCanvas(device, canvas, {
    name,
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    flipY: true
  });
}

function createImageTexture(
  device: pc.GraphicsDevice,
  image: HTMLImageElement,
  name: string
): pc.Texture {
  const texture = new pc.Texture(device, {
    name,
    width: image.width,
    height: image.height,
    format: pc.PIXELFORMAT_RGBA8,
    srgb: true,
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: pc.ADDRESS_CLAMP_TO_EDGE,
    flipY: true
  });
  texture.setSource(image);
  return texture;
}

/**
 * Carga las texturas de todos los objetos del catálogo. Si una imagen falta, se
 * usa un círculo de color para que el mapa siga siendo jugable.
 */
export async function loadItemTextures(app: pc.Application): Promise<ItemTextureMap> {
  const device = app.graphicsDevice;
  const entries = await Promise.all(
    ITEM_IDS.map(async (id): Promise<[ItemId, ItemTextures]> => {
      const definition = ITEM_DEFINITIONS[id];
      const load = async (path: string, label: string): Promise<pc.Texture> => {
        try {
          const image = await loadImage(path);
          return createImageTexture(device, image, `item-${label}`);
        } catch (error) {
          console.warn(`[items] No se pudo cargar ${path}; usando placeholder.`, error);
          return createPlaceholderTexture(device, definition.color, `item-${label}`);
        }
      };
      const [unused, used] = await Promise.all([
        load(definition.unusedImage, `${id}-unused`),
        load(definition.usedImage, `${id}-used`)
      ]);
      return [id, { unused, used }];
    })
  );
  return new Map(entries);
}

export function disposeItemTextures(textures: ItemTextureMap): void {
  for (const pair of textures.values()) {
    pair.unused.destroy();
    pair.used.destroy();
  }
  textures.clear();
}

function createItemMaterial(texture: pc.Texture, name: string): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.name = name;
  material.useLighting = false;
  material.useSkybox = false;
  material.useFog = true;
  material.diffuse = new pc.Color(0, 0, 0);
  material.emissive = new pc.Color(1, 1, 1);
  material.emissiveIntensity = 1;
  material.emissiveMap = texture;
  material.opacityMap = texture;
  material.opacityMapChannel = 'a';
  material.opacity = 1;
  material.alphaTest = 0.5;
  material.alphaToCoverage = CONFIG.sprite.alphaToCoverage;
  material.blendType = pc.BLEND_NONE;
  material.depthWrite = true;
  material.depthTest = true;
  material.cull = pc.CULLFACE_NONE;
  material.update();
  return material;
}

/** Billboard de un objeto con imagen de disponible y de usado. */
export class PickupView {
  readonly root: pc.Entity;
  private readonly pivot: pc.Entity;
  private readonly sprite: pc.Entity;
  private readonly shadow: pc.Entity;
  private readonly mesh: pc.Mesh;
  private readonly unusedMaterial: pc.StandardMaterial;
  private readonly usedMaterial: pc.StandardMaterial;
  private readonly instance: pc.MeshInstance;
  private elapsed: number;
  private used = false;

  constructor(
    app: pc.Application,
    textures: ItemTextures,
    height: number,
    x: number,
    z: number,
    shadowMaterial: pc.StandardMaterial,
    phase: number
  ) {
    this.elapsed = phase;
    const device = app.graphicsDevice;
    const aspect = textures.unused.width / Math.max(1, textures.unused.height);
    const width = height * aspect;

    this.root = new pc.Entity('pickup');
    this.pivot = new pc.Entity('pickup-billboard');
    this.root.addChild(this.pivot);
    app.root.addChild(this.root);

    this.mesh = new pc.Mesh(device);
    this.mesh.setPositions([
      -width / 2, 0, 0,
      width / 2, 0, 0,
      width / 2, height, 0,
      -width / 2, height, 0
    ]);
    this.mesh.setUvs(0, [0, 0, 1, 0, 1, 1, 0, 1]);
    this.mesh.setIndices([0, 1, 2, 0, 2, 3]);
    this.mesh.update();

    this.unusedMaterial = createItemMaterial(textures.unused, 'pickup-unused');
    this.usedMaterial = createItemMaterial(textures.used, 'pickup-used');

    const entity = new pc.Entity('pickup-sprite');
    entity.addComponent('render');
    const render = entity.render!;
    render.castShadows = false;
    render.receiveShadows = false;
    this.instance = new pc.MeshInstance(this.mesh, this.unusedMaterial);
    this.instance.castShadow = false;
    this.instance.receiveShadow = false;
    render.meshInstances = [this.instance];
    this.pivot.addChild(entity);
    this.sprite = entity;

    // Sombra de contacto compartida con el resto del mundo: ayuda a leer que el
    // objeto está apoyado en el suelo aunque el billboard flote un poco.
    const diameter = Math.max(0.55, height * 0.62);
    this.shadow = new pc.Entity('pickup-shadow');
    this.shadow.addComponent('render', { type: 'plane' });
    const shadowRender = this.shadow.render!;
    shadowRender.material = shadowMaterial;
    shadowRender.castShadows = false;
    shadowRender.receiveShadows = false;
    const shadowInstance = shadowRender.meshInstances[0];
    if (shadowInstance) shadowInstance.drawOrder = 2;
    this.shadow.setLocalScale(diameter, 1, diameter);
    this.shadow.setPosition(x, 0.052, z);
    app.root.addChild(this.shadow);

    this.root.setPosition(x, 0.04, z);
    this.setUsed(false);
  }

  setUsed(used: boolean): void {
    if (this.used === used) return;
    this.used = used;
    // El frasco vacío se ve un poco más apagado incluso cuando la textura ya es
    // gris; así el cooldown se distingue de lejos.
    this.usedMaterial.opacity = used ? 0.86 : 1;
    this.usedMaterial.update();
    this.instance.material = used ? this.usedMaterial : this.unusedMaterial;
  }

  setVisible(visible: boolean): void {
    if (this.root.enabled === visible) return;
    this.root.enabled = visible;
    this.shadow.enabled = visible;
  }

  /** Capa de render exclusiva del viewport que debe ver esta copia. */
  setLayer(layerId: number): void {
    const sprite = this.sprite.render;
    if (sprite) sprite.layers = [layerId];
    const shadow = this.shadow.render;
    if (shadow) shadow.layers = [layerId];
  }

  update(dt: number, cameraPosition: pc.Vec3): void {
    if (!this.root.enabled) return;
    this.elapsed += dt;
    const bob = Math.sin(this.elapsed * 2.1) * 0.045;
    this.pivot.setLocalPosition(0, bob, 0);

    const dx = cameraPosition.x - this.root.getPosition().x;
    const dz = cameraPosition.z - this.root.getPosition().z;
    this.pivot.setLocalEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
  }

  destroy(): void {
    this.root.destroy();
    this.shadow.destroy();
    this.mesh.destroy();
    this.unusedMaterial.destroy();
    this.usedMaterial.destroy();
  }
}

/** Gestiona todos los objetos del mapa activo y sus cooldowns. */
export class PickupField {
  private items: PickupInstance[] = [];
  private readonly app: pc.Application;
  private readonly shadowMaterial: pc.StandardMaterial;
  private readonly textures: ItemTextureMap;

  constructor(
    app: pc.Application,
    shadowMaterial: pc.StandardMaterial,
    textures: ItemTextureMap
  ) {
    this.app = app;
    this.shadowMaterial = shadowMaterial;
    this.textures = textures;
  }

  /** Crea una vista más del objeto (copia o vista del menú). */
  private createView(item: PickupInstance, phase: number): PickupView {
    return new PickupView(
      this.app,
      item.textures,
      item.definition.height,
      item.spawn.x,
      item.spawn.z,
      this.shadowMaterial,
      phase
    );
  }

  private setItemUsed(item: PickupInstance, used: boolean): void {
    item.menuView.setUsed(used);
    for (const view of item.views) view.setUsed(used);
  }

  /** Reconstruye los objetos del mapa indicado. */
  setMap(map: GameMap): void {
    this.dispose();
    map.pickups.forEach((spawn, index) => {
      const definition = ITEM_DEFINITIONS[spawn.type];
      const textures = this.textures.get(spawn.type);
      if (!definition || !textures) {
        console.warn(`[items] Objeto sin definición o textura: ${spawn.type}`);
        return;
      }
      const menuView = new PickupView(
        this.app,
        textures,
        definition.height,
        spawn.x,
        spawn.z,
        this.shadowMaterial,
        index * 1.7
      );
      this.items.push({
        spawn,
        definition,
        textures,
        menuView,
        views: [],
        cooldown: 0,
        available: true
      });
    });
  }

  /**
   * Crea una copia del objeto por viewport, igual que los actores. Cada copia
   * vive en la capa de render de su vista y solo se muestra cuando el equipo de
   * esa vista ve el punto. La vista del menú se oculta durante la partida.
   */
  setViewLayers(layerIds: readonly number[]): void {
    for (const item of this.items) {
      for (const view of item.views) view.destroy();
      item.views = layerIds.map((layerId, index) => {
        const view = this.createView(item, index * 1.3);
        view.setLayer(layerId);
        view.setUsed(!item.available);
        view.setVisible(false);
        return view;
      });
      item.menuView.setVisible(false);
    }
  }

  /** Vuelve a dejar solo la vista del menú (fin de partida o cambio de mapa). */
  clearViewLayers(): void {
    for (const item of this.items) {
      for (const view of item.views) view.destroy();
      item.views = [];
      item.menuView.setVisible(true);
    }
  }

  /** Devuelve todos los objetos a su estado disponible (nueva partida). */
  reset(): void {
    for (const item of this.items) {
      item.available = true;
      item.cooldown = 0;
      this.setItemUsed(item, false);
    }
  }

  /**
   * Avanza cooldowns y anima los billboards. Cada copia se orienta hacia la
   * cámara de su propio viewport; la vista del menú usa la primera cámara.
   */
  update(dt: number, cameraPositions: readonly pc.Vec3[]): void {
    const first = cameraPositions[0];
    if (!first) return;
    for (const item of this.items) {
      if (!item.available) {
        item.cooldown = Math.max(0, item.cooldown - dt);
        if (item.cooldown === 0) {
          item.available = true;
          this.setItemUsed(item, false);
        }
      }
      item.menuView.update(dt, first);
      item.views.forEach((view, index) => {
        view.update(dt, cameraPositions[index] ?? first);
      });
    }
  }

  /**
   * Aplica la visibilidad de cada copia según la niebla. El callback recibe el
   * objeto y el índice de la vista; el juego decide qué equipos lo ven.
   */
  updateVisibility(
    isVisible: (spawn: PickupSpawn, viewIndex: number) => boolean
  ): void {
    for (const item of this.items) {
      if (item.views.length === 0) continue;
      item.views.forEach((view, index) => {
        view.setVisible(isVisible(item.spawn, index));
      });
    }
  }

  /** Recorre los objetos existentes (posición y tipo), sin revelar su estado. */
  forEachSpawn(visit: (spawn: PickupSpawn) => void): void {
    for (const item of this.items) visit(item.spawn);
  }

  /**
   * Disponibilidad de un objeto. Solo debe consultarse para puntos que el
   * equipo ya ve; el estado de los objetos fuera de visión no se expone.
   */
  isAvailableAt(x: number, z: number): boolean {
    for (const item of this.items) {
      if (item.spawn.x === x && item.spawn.z === z) return item.available;
    }
    return false;
  }

  /**
   * Recogida automática. Se recorre cada objeto disponible y se consume con el
   * jugador vivo más cercano que lo toque y pueda usarlo (por ejemplo, un
   * Pokémon con la vida completa no gasta una poción). Si dos jugadores están a
   * la misma distancia, gana el primero en `players` (orden estable de la
   * partida). La comprobación de alcance usa el hurtbox de cada especie, no el
   * radio de movimiento global.
   */
  collect(players: readonly MatchPlayerState[], handlers: PickupHandlers): void {
    for (const item of this.items) {
      if (!item.available) continue;
      const definition = item.definition;

      let collector: MatchPlayerState | null = null;
      let collectorPokemon: PokemonEntry | null = null;
      let collectorDistanceSq = Infinity;

      for (const player of players) {
        if (!player.alive) continue;
        const reach = definition.pickupRadius + player.hitRadius;
        const dx = player.x - item.spawn.x;
        const dz = player.z - item.spawn.z;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq > reach * reach) continue;
        // El más cercano gana; el empate exacto se queda con el primero.
        if (distanceSq >= collectorDistanceSq) continue;

        const pokemon = handlers.pokemonFor(player);
        if (!pokemon) continue;

        const pickupContext = { player, pokemon };
        if (!definition.canPickup(pickupContext)) continue;
        if (handlers.canReach && !handlers.canReach(player, item.spawn)) continue;

        collector = player;
        collectorPokemon = pokemon;
        collectorDistanceSq = distanceSq;
      }

      if (!collector || !collectorPokemon) continue;

      const resolveContext: ItemResolveContext = {
        player: collector,
        pokemon: collectorPokemon,
        heal: (amount) => handlers.heal(collector, amount),
        showHeal: (amount) => handlers.showHeal(collector, amount)
      };
      definition.resolve(resolveContext);

      item.available = false;
      item.cooldown = definition.cooldownSeconds;
      this.setItemUsed(item, true);
      handlers.onCollected?.(collector, definition);
    }
  }

  dispose(): void {
    for (const item of this.items) {
      item.menuView.destroy();
      for (const view of item.views) view.destroy();
    }
    this.items = [];
  }
}
