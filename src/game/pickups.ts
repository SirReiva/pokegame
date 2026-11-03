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
}

interface PickupInstance {
  spawn: PickupSpawn;
  definition: ItemDefinition;
  view: PickupView;
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

  update(dt: number, cameraPosition: pc.Vec3): void {
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
      this.items.push({
        spawn,
        definition,
        view: new PickupView(
          this.app,
          textures,
          definition.height,
          spawn.x,
          spawn.z,
          this.shadowMaterial,
          index * 1.7
        ),
        cooldown: 0,
        available: true
      });
    });
  }

  /** Devuelve todos los objetos a su estado disponible (nueva partida). */
  reset(): void {
    for (const item of this.items) {
      item.available = true;
      item.cooldown = 0;
      item.view.setUsed(false);
    }
  }

  /** Avanza cooldowns y anima los billboards hacia la cámara indicada. */
  update(dt: number, cameraPosition: pc.Vec3): void {
    for (const item of this.items) {
      if (!item.available) {
        item.cooldown = Math.max(0, item.cooldown - dt);
        if (item.cooldown === 0) {
          item.available = true;
          item.view.setUsed(false);
        }
      }
      item.view.update(dt, cameraPosition);
    }
  }

  /**
   * Recogida automática. Se recorre cada objeto disponible y se consume con el
   * primer jugador vivo que lo toque y pueda usarlo (por ejemplo, un Pokémon
   * con la vida completa no gasta una poción).
   */
  collect(players: readonly MatchPlayerState[], handlers: PickupHandlers): void {
    for (const item of this.items) {
      if (!item.available) continue;
      const definition = item.definition;

      for (const player of players) {
        if (!player.alive) continue;
        const reach = definition.pickupRadius + CONFIG.player.radius;
        const dx = player.x - item.spawn.x;
        const dz = player.z - item.spawn.z;
        if (dx * dx + dz * dz > reach * reach) continue;

        const pokemon = handlers.pokemonFor(player);
        if (!pokemon) continue;

        const pickupContext = { player, pokemon };
        if (!definition.canPickup(pickupContext)) continue;

        const resolveContext: ItemResolveContext = {
          ...pickupContext,
          heal: (amount) => handlers.heal(player, amount),
          showHeal: (amount) => handlers.showHeal(player, amount)
        };
        definition.resolve(resolveContext);

        item.available = false;
        item.cooldown = definition.cooldownSeconds;
        item.view.setUsed(true);
        handlers.onCollected?.(player, definition);
        break;
      }
    }
  }

  dispose(): void {
    for (const item of this.items) item.view.destroy();
    this.items = [];
  }
}
