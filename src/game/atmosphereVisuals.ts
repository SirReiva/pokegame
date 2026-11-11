/**
 * Capa visual del estado atmosférico.
 *
 * `world.ts` construye el cielo, las luces y las texturas; este módulo toma
 * esas referencias y aplica el tinte, la niebla y las partículas del clima
 * activo. Los climas solo cambian al empezar o terminar una partida, así que
 * los sistemas de partículas se crean y se destruyen en `set`, no cada frame.
 */

import * as pc from 'playcanvas';
import { ATMOSPHERES, type AtmosphereId, type AtmosphereVisual } from './atmosphere';

type ParticleOptions = pc.ComponentOptions<'particlesystem'>;

export interface AtmosphereTextures {
  rain: pc.Texture;
  dust: pc.Texture;
  frost: pc.Texture;
  mist: pc.Texture;
  pollen: pc.Texture;
}

export interface AtmosphereVisualOptions {
  app: pc.AppBase;
  device: pc.GraphicsDevice;
  bounds: { x: number; z: number };
  sun: pc.Entity;
  fill: pc.Entity;
  skyMaterial: pc.StandardMaterial;
  textures: AtmosphereTextures;
}

export interface AtmosphereVisuals {
  set(id: AtmosphereId): void;
  update(dt: number): void;
  dispose(): void;
}

interface LightningState {
  root: pc.Entity;
  bolt: pc.Entity;
  light: pc.Entity;
  material: pc.StandardMaterial;
  meshes: pc.Mesh[];
  next: number;
  flash: number;
  duration: number;
}

function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function colorOf(rgb: readonly [number, number, number]): pc.Color {
  return new pc.Color(rgb[0], rgb[1], rgb[2]);
}

/**
 * Rayo de tormenta: una cinta vertical quebrada con dos planos cruzados para
 * que se lea desde cualquier ángulo de cámara. Es geometría pura y color por
 * vértice, igual que los rayos del páramo del mapa.
 */
function createBoltMesh(device: pc.GraphicsDevice, seed: number): pc.Mesh {
  const rand = random(seed);
  const height = 9;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const push = (x: number, y: number, z: number, color: [number, number, number]) => {
    positions.push(x, y, z);
    normals.push(0, 1, 0);
    colors.push(color[0], color[1], color[2], 1);
  };

  const ribbon = (path: Array<[number, number, number]>, width: number) => {
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      let dx = b[0] - a[0];
      let dy = b[1] - a[1];
      let dz = b[2] - a[2];
      const length = Math.hypot(dx, dy, dz) || 1;
      dx /= length;
      dy /= length;
      dz /= length;

      const plen = Math.hypot(-dz, dx) || 1;
      const px = -dz / plen;
      const pz = dx / plen;
      const qx = dy * pz;
      const qy = dz * px - dx * pz;
      const qz = -dy * px;

      for (const [ox, oy, oz] of [
        [px, 0, pz],
        [qx, qy, qz]
      ]) {
        const start = positions.length / 3;
        const color: [number, number, number] = [0.82, 0.92, 1];
        push(a[0] - ox * width, a[1] - oy * width, a[2] - oz * width, color);
        push(a[0] + ox * width, a[1] + oy * width, a[2] + oz * width, color);
        push(b[0] + ox * width, b[1] + oy * width, b[2] + oz * width, color);
        push(b[0] - ox * width, b[1] - oy * width, b[2] - oz * width, color);
        indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
      }
    }
  };

  const main: Array<[number, number, number]> = [];
  const steps = 13;
  let x = 0;
  let z = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (i > 0 && i < steps) {
      x += (rand() - 0.5) * 0.7;
      z += (rand() - 0.5) * 0.7;
    }
    main.push([x, height * (1 - t), z]);
  }
  main[0] = [x * 0.5, height, z * 0.5];
  main[steps] = [0, 0, 0];
  ribbon(main, 0.06);

  const branchRoot = main[4 + Math.floor(rand() * 4)];
  const branch: Array<[number, number, number]> = [branchRoot];
  const branchAngle = rand() * Math.PI * 2;
  let bx = branchRoot[0];
  let bz = branchRoot[2];
  const branchSteps = 4 + Math.floor(rand() * 3);
  for (let i = 1; i <= branchSteps; i++) {
    const t = i / branchSteps;
    const spread = 0.35 + rand() * 0.35;
    bx += Math.cos(branchAngle) * spread + (rand() - 0.5) * 0.3;
    bz += Math.sin(branchAngle) * spread + (rand() - 0.5) * 0.3;
    branch.push([
      bx,
      Math.max(0.5, branchRoot[1] - t * (1.4 + rand() * 1.4)),
      bz
    ]);
  }
  ribbon(branch, 0.035);

  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setColors(colors);
  mesh.setIndices(indices);
  mesh.update();
  return mesh;
}

export function createAtmosphereVisuals(
  options: AtmosphereVisualOptions
): AtmosphereVisuals {
  const { app, device, bounds, sun, fill, skyMaterial, textures } = options;
  const scene = app.scene;

  const baseAmbient = new pc.Color(
    scene.ambientLight.r,
    scene.ambientLight.g,
    scene.ambientLight.b
  );
  const baseFogColor = new pc.Color(scene.fog.color.r, scene.fog.color.g, scene.fog.color.b);
  const baseFogNear = scene.fog.start;
  const baseFogFar = scene.fog.end;
  const baseSky = new pc.Color(
    skyMaterial.emissive.r,
    skyMaterial.emissive.g,
    skyMaterial.emissive.b
  );
  const baseSunColor = new pc.Color(sun.light!.color.r, sun.light!.color.g, sun.light!.color.b);
  const baseSunIntensity = sun.light!.intensity;
  const baseFillColor = new pc.Color(
    fill.light!.color.r,
    fill.light!.color.g,
    fill.light!.color.b
  );
  const baseFillIntensity = fill.light!.intensity;

  let currentId: AtmosphereId | null = null;
  let currentVisual: AtmosphereVisual | null = null;
  let effectRoot: pc.Entity | null = null;
  let lightning: LightningState | null = null;

  const applyLights = (visual: AtmosphereVisual, flash = 0) => {
    scene.ambientLight = new pc.Color(
      visual.ambient[0] + flash * 0.18,
      visual.ambient[1] + flash * 0.2,
      visual.ambient[2] + flash * 0.24
    );
    scene.fog.color = colorOf(visual.fogColor);
    scene.fog.start = visual.fogNear;
    scene.fog.end = visual.fogFar;
    sun.light!.color = colorOf(visual.sunColor);
    sun.light!.intensity = visual.sunIntensity + flash * 1.8;
    fill.light!.color = colorOf(visual.fillColor);
    fill.light!.intensity = visual.fillIntensity + flash * 0.35;
    skyMaterial.emissive = colorOf(visual.skyTint);
    skyMaterial.update();
  };

  const restoreBase = () => {
    scene.ambientLight = baseAmbient.clone();
    scene.fog.color = baseFogColor.clone();
    scene.fog.start = baseFogNear;
    scene.fog.end = baseFogFar;
    sun.light!.color = baseSunColor.clone();
    sun.light!.intensity = baseSunIntensity;
    fill.light!.color = baseFillColor.clone();
    fill.light!.intensity = baseFillIntensity;
    skyMaterial.emissive = baseSky.clone();
    skyMaterial.update();
  };

  const addParticles = (
    parent: pc.Entity,
    name: string,
    position: [number, number, number],
    particleOptions: ParticleOptions
  ): pc.Entity => {
    const entity = new pc.Entity(name);
    entity.setPosition(position[0], position[1], position[2]);
    entity.addComponent('particlesystem', {
      loop: true,
      preWarm: true,
      autoPlay: true,
      blendType: pc.BLEND_NORMAL,
      depthWrite: false,
      useFog: true,
      lighting: false,
      intensity: 1,
      orientation: pc.PARTICLEORIENTATION_SCREEN,
      ...particleOptions
    });
    parent.addChild(entity);
    return entity;
  };

  const clearEffects = () => {
    if (lightning) {
      for (const mesh of lightning.meshes) mesh.destroy();
      lightning.material.destroy();
      lightning = null;
    }
    effectRoot?.destroy();
    effectRoot = null;
  };

  const buildLightning = (root: pc.Entity) => {
    const material = new pc.StandardMaterial();
    material.useMetalness = false;
    material.diffuse = new pc.Color(1, 1, 1);
    material.emissive = new pc.Color(0, 0, 0);
    material.specular = new pc.Color(0, 0, 0);
    material.gloss = 0;
    material.useLighting = false;
    material.useSkybox = false;
    material.useFog = false;
    material.blendType = pc.BLEND_ADDITIVE;
    material.depthWrite = false;
    material.cull = pc.CULLFACE_NONE;
    material.diffuseVertexColor = true;
    material.update();

    const meshes = [0, 1, 2].map((variant) =>
      createBoltMesh(device, 0x7a1f + variant * 6353)
    );

    const bolt = new pc.Entity('atmosphere-lightning');
    bolt.addComponent('render');
    bolt.render!.castShadows = false;
    bolt.render!.receiveShadows = false;
    bolt.render!.meshInstances = [new pc.MeshInstance(meshes[0], material)];
    bolt.enabled = false;
    root.addChild(bolt);

    const light = new pc.Entity('atmosphere-lightning-light');
    light.addComponent('light', {
      type: 'omni',
      color: new pc.Color(0.72, 0.84, 1),
      intensity: 0,
      range: 26,
      castShadows: false
    });
    root.addChild(light);

    lightning = {
      root,
      bolt,
      light,
      material,
      meshes,
      next: 1.5 + Math.random() * 2.5,
      flash: 0,
      duration: 0.4
    };
  };

  const buildEffects = (id: AtmosphereId) => {
    const effect = ATMOSPHERES[id].visual.effect;
    if (!effect) return;

    const root = new pc.Entity(`atmosphere-${id}`);
    app.root.addChild(root);
    effectRoot = root;

    // `emitterExtents` es el tamaño completo de la caja: PlayCanvas reparte
    // las partículas en [-0.5, 0.5] y luego multiplica por esos valores. Por
    // eso se pasa el ancho del mapa completo (2 × media anchura) y no la mitad.
    const spanX = bounds.x * 2 * 0.98;
    const spanZ = bounds.z * 2 * 0.98;
    const area = Math.max(1, bounds.x * bounds.z);
    const density = Math.max(0.55, Math.min(2.2, area / 420));

    switch (effect) {
      case 'sunMotes': {
        addParticles(root, 'sun-motes', [0, 2.4, 0], {
          numParticles: Math.round(120 * density),
          lifetime: 9,
          rate: 0.055,
          rate2: 0.08,
          emitterShape: pc.EMITTERSHAPE_BOX,
          emitterExtents: new pc.Vec3(spanX, 1.9, spanZ),
          colorMap: textures.pollen,
          colorGraph: {
            type: pc.CURVE_LINEAR,
            keys: [
              [0, 1, 1, 1],
              [0, 0.88, 1, 0.94],
              [0, 0.52, 1, 0.68]
            ]
          },
          alphaGraph: {
            type: pc.CURVE_LINEAR,
            keys: [0, 0, 0.16, 0.7, 0.8, 0.45, 1, 0]
          },
          scaleGraph: {
            type: pc.CURVE_LINEAR,
            keys: [0, 0.04, 0.5, 0.09, 1, 0.05]
          },
          velocityGraph: {
            type: pc.CURVE_LINEAR,
            keys: [
              [0, 0.12, 1, 0.28],
              [0, 0.05, 1, 0.12],
              [0, 0.08, 1, 0.2]
            ]
          },
          blendType: pc.BLEND_ADDITIVE,
          intensity: 0.8
        });
        break;
      }
      case 'rain':
      case 'downpour':
      case 'storm': {
        const heavy = effect !== 'rain';
        addParticles(root, `${effect}-rain`, [0, 9, 0], {
          numParticles: Math.round((heavy ? 1000 : 650) * density),
          lifetime: heavy ? 1.0 : 1.18,
          rate: heavy ? 0.0008 : 0.0016,
          rate2: heavy ? 0.0012 : 0.0022,
          emitterShape: pc.EMITTERSHAPE_BOX,
          emitterExtents: new pc.Vec3(spanX, 5.6, spanZ),
          colorMap: textures.rain,
          colorGraph: {
            type: pc.CURVE_LINEAR,
            keys: [
              [0, heavy ? 0.5 : 0.64, 1, 0.72],
              [0, heavy ? 0.62 : 0.78, 1, 0.84],
              [0, heavy ? 0.78 : 0.96, 1, 1]
            ]
          },
          alphaGraph: {
            type: pc.CURVE_LINEAR,
            keys: [0, 0, 0.1, heavy ? 0.7 : 0.5, 0.8, 0.32, 1, 0]
          },
          scaleGraph: {
            type: pc.CURVE_LINEAR,
            keys: [0, heavy ? 0.62 : 0.42, 0.5, heavy ? 0.78 : 0.56, 1, 0.5]
          },
          velocityGraph: {
            type: pc.CURVE_LINEAR,
            keys: [
              [0, 0.5, 1, 1.2],
              [0, heavy ? -23 : -17, 1, heavy ? -29 : -22],
              [0, 0.2, 1, 0.6]
            ]
          }
        });
        if (effect !== 'rain') {
          addParticles(root, `${effect}-mist`, [0, 1.1, 0], {
            numParticles: Math.round(110 * density),
            lifetime: 7.5,
            rate: 0.06,
            rate2: 0.09,
            emitterShape: pc.EMITTERSHAPE_BOX,
            emitterExtents: new pc.Vec3(spanX, 0.9, spanZ),
            colorMap: textures.mist,
            colorGraph: {
              type: pc.CURVE_LINEAR,
              keys: [
                [0, 0.7, 1, 0.82],
                [0, 0.76, 1, 0.88],
                [0, 0.84, 1, 0.94]
              ]
            },
            alphaGraph: {
              type: pc.CURVE_LINEAR,
              keys: [0, 0, 0.2, 0.1, 0.8, 0.08, 1, 0]
            },
            scaleGraph: {
              type: pc.CURVE_LINEAR,
              keys: [0, 2.4, 0.5, 3.6, 1, 2.8]
            },
            velocityGraph: {
              type: pc.CURVE_LINEAR,
              keys: [
                [0, 0.12, 1, 0.3],
                [0, 0.02, 1, 0.06],
                [0, 0.06, 1, 0.16]
              ]
            }
          });
        }
        if (effect === 'storm') buildLightning(root);
        break;
      }
      case 'sand': {
        addParticles(root, 'sand-streaks', [0, 2.1, 0], {
          numParticles: Math.round(520 * density),
          lifetime: 2.1,
          rate: 0.003,
          rate2: 0.0045,
          emitterShape: pc.EMITTERSHAPE_BOX,
          emitterExtents: new pc.Vec3(spanX, 2.4, spanZ),
          colorMap: textures.dust,
          colorGraph: {
            type: pc.CURVE_LINEAR,
            keys: [
              [0, 0.94, 1, 1],
              [0, 0.64, 1, 0.72],
              [0, 0.34, 1, 0.42]
            ]
          },
          alphaGraph: {
            type: pc.CURVE_LINEAR,
            keys: [0, 0, 0.15, 0.42, 0.75, 0.3, 1, 0]
          },
          scaleGraph: {
            type: pc.CURVE_LINEAR,
            keys: [0, 0.18, 0.5, 0.32, 1, 0.24]
          },
          velocityGraph: {
            type: pc.CURVE_LINEAR,
            keys: [
              [0, 10, 1, 17],
              [0, -1.2, 1, 0.4],
              [0, 1.5, 1, 4.5]
            ]
          }
        });
        addParticles(root, 'sand-haze', [0, 1.2, 0], {
          numParticles: Math.round(80 * density),
          lifetime: 9,
          rate: 0.1,
          rate2: 0.15,
          emitterShape: pc.EMITTERSHAPE_BOX,
          emitterExtents: new pc.Vec3(spanX, 0.8, spanZ),
          colorMap: textures.mist,
          colorGraph: {
            type: pc.CURVE_LINEAR,
            keys: [
              [0, 1, 1, 1],
              [0, 0.76, 1, 0.82],
              [0, 0.48, 1, 0.54]
            ]
          },
          alphaGraph: {
            type: pc.CURVE_LINEAR,
            keys: [0, 0, 0.2, 0.12, 0.8, 0.09, 1, 0]
          },
          scaleGraph: {
            type: pc.CURVE_LINEAR,
            keys: [0, 2.8, 0.5, 4.4, 1, 3.2]
          },
          velocityGraph: {
            type: pc.CURVE_LINEAR,
            keys: [
              [0, 1.2, 1, 2.2],
              [0, 0, 1, 0.08],
              [0, 0.2, 1, 0.6]
            ]
          }
        });
        break;
      }
      case 'hail': {
        addParticles(root, 'hail', [0, 8, 0], {
          numParticles: Math.round(620 * density),
          lifetime: 1.35,
          rate: 0.0018,
          rate2: 0.0026,
          emitterShape: pc.EMITTERSHAPE_BOX,
          emitterExtents: new pc.Vec3(spanX, 5, spanZ),
          colorMap: textures.frost,
          colorGraph: {
            type: pc.CURVE_LINEAR,
            keys: [
              [0, 0.86, 1, 1],
              [0, 0.92, 1, 1],
              [0, 1, 1, 1]
            ]
          },
          alphaGraph: {
            type: pc.CURVE_LINEAR,
            keys: [0, 0, 0.08, 0.9, 0.85, 0.6, 1, 0]
          },
          scaleGraph: {
            type: pc.CURVE_LINEAR,
            keys: [0, 0.12, 0.5, 0.17, 1, 0.1]
          },
          velocityGraph: {
            type: pc.CURVE_LINEAR,
            keys: [
              [0, 0.8, 1, 1.8],
              [0, -15, 1, -20],
              [0, 0.4, 1, 1]
            ]
          }
        });
        break;
      }
      case 'fog': {
        addParticles(root, 'fog-banks', [0, 1.15, 0], {
          numParticles: Math.round(160 * density),
          lifetime: 15,
          rate: 0.08,
          rate2: 0.12,
          emitterShape: pc.EMITTERSHAPE_BOX,
          emitterExtents: new pc.Vec3(spanX, 1, spanZ),
          colorMap: textures.mist,
          colorGraph: {
            type: pc.CURVE_LINEAR,
            keys: [
              [0, 0.92, 1, 1],
              [0, 0.96, 1, 1],
              [0, 1, 1, 1]
            ]
          },
          alphaGraph: {
            type: pc.CURVE_LINEAR,
            keys: [0, 0, 0.18, 0.12, 0.8, 0.09, 1, 0]
          },
          scaleGraph: {
            type: pc.CURVE_LINEAR,
            keys: [0, 2.8, 0.5, 4.6, 1, 3.4]
          },
          velocityGraph: {
            type: pc.CURVE_LINEAR,
            keys: [
              [0, 0.14, 1, 0.34],
              [0, 0.01, 1, 0.04],
              [0, 0.08, 1, 0.2]
            ]
          }
        });
        break;
      }
      case 'wind': {
        addParticles(root, 'wind-streaks', [0, 2.2, 0], {
          numParticles: Math.round(460 * density),
          lifetime: 2.6,
          rate: 0.005,
          rate2: 0.0075,
          emitterShape: pc.EMITTERSHAPE_BOX,
          emitterExtents: new pc.Vec3(spanX, 2.2, spanZ),
          colorMap: textures.dust,
          colorGraph: {
            type: pc.CURVE_LINEAR,
            keys: [
              [0, 0.82, 1, 0.9],
              [0, 0.94, 1, 1],
              [0, 0.78, 1, 0.88]
            ]
          },
          alphaGraph: {
            type: pc.CURVE_LINEAR,
            keys: [0, 0, 0.14, 0.4, 0.8, 0.26, 1, 0]
          },
          scaleGraph: {
            type: pc.CURVE_LINEAR,
            keys: [0, 0.14, 0.5, 0.26, 1, 0.18]
          },
          velocityGraph: {
            type: pc.CURVE_LINEAR,
            keys: [
              [0, 9, 1, 16],
              [0, -0.8, 1, 1.6],
              [0, 2, 1, 6]
            ]
          }
        });
        break;
      }
      case 'snow': {
        addParticles(root, 'snow', [0, 7, 0], {
          numParticles: Math.round(700 * density),
          lifetime: 6.5,
          rate: 0.007,
          rate2: 0.01,
          emitterShape: pc.EMITTERSHAPE_BOX,
          emitterExtents: new pc.Vec3(spanX, 4.5, spanZ),
          colorMap: textures.frost,
          colorGraph: {
            type: pc.CURVE_LINEAR,
            keys: [
              [0, 0.9, 1, 1],
              [0, 0.95, 1, 1],
              [0, 1, 1, 1]
            ]
          },
          alphaGraph: {
            type: pc.CURVE_LINEAR,
            keys: [0, 0, 0.12, 0.85, 0.85, 0.55, 1, 0]
          },
          scaleGraph: {
            type: pc.CURVE_LINEAR,
            keys: [0, 0.08, 0.5, 0.15, 1, 0.1]
          },
          velocityGraph: {
            type: pc.CURVE_LINEAR,
            keys: [
              [0, 0.5, 1, 1.3],
              [0, -1.8, 1, -2.6],
              [0, 0.2, 1, 0.8]
            ]
          }
        });
        break;
      }
    }
  };

  const triggerLightning = () => {
    if (!lightning) return;
    const x = (Math.random() * 2 - 1) * bounds.x * 0.78;
    const z = (Math.random() * 2 - 1) * bounds.z * 0.78;
    const bolt = lightning.bolt;
    bolt.setPosition(x, 0, z);
    bolt.setLocalEulerAngles(0, Math.random() * 360, 0);
    const instance = bolt.render!.meshInstances[0];
    if (instance) {
      instance.mesh =
        lightning.meshes[Math.floor(Math.random() * lightning.meshes.length)];
    }
    bolt.enabled = true;
    lightning.light.setPosition(x, 4.5, z);
    lightning.duration = 0.38 + Math.random() * 0.2;
    lightning.flash = lightning.duration;
    lightning.next = 2.6 + Math.random() * 4.8;
  };

  return {
    set(id: AtmosphereId) {
      if (currentId === id) return;
      currentId = id;
      currentVisual = ATMOSPHERES[id].visual;
      clearEffects();
      applyLights(currentVisual);
      buildEffects(id);
    },
    update(dt: number) {
      if (!currentVisual || !lightning) return;
      if (lightning.flash > 0) {
        lightning.flash = Math.max(0, lightning.flash - dt);
        const progress = 1 - lightning.flash / lightning.duration;
        const flicker = Math.sin(progress * 58) > -0.25 ? 0.9 : 0.18;
        const power = (1 - progress) * (1 - progress) * flicker;
        lightning.material.opacity = power;
        lightning.material.update();
        lightning.light.light!.intensity = power * 3.4;
        applyLights(currentVisual, power);
        if (lightning.flash === 0) {
          lightning.bolt.enabled = false;
          lightning.light.light!.intensity = 0;
          applyLights(currentVisual);
        }
      } else {
        lightning.next -= dt;
        if (lightning.next <= 0) triggerLightning();
      }
    },
    dispose() {
      clearEffects();
      restoreBase();
      currentId = null;
      currentVisual = null;
    }
  };
}
