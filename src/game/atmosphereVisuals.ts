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
import { BatchedParticles } from './batchedParticles';

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
  let weather: BatchedParticles | null = null;
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

  const clearEffects = () => {
    weather?.destroy();
    weather = null;
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
    material.name = 'atmosphere-lightning';
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

  /**
   * El clima usa el mismo lote analítico que las partículas ambientales del
   * mapa: sin `ParticleSystem`, sin pasada de simulación y con un draw call
   * por tipo. La lluvia, la nieve y la arena son billboards que caen o cruzan
   * el mapa calculados en el vertex shader.
   */
  const buildEffects = (id: AtmosphereId) => {
    const effect = ATMOSPHERES[id].visual.effect;
    if (!effect) return;

    const root = new pc.Entity(`atmosphere-${id}`);
    app.root.addChild(root);
    effectRoot = root;

    // `emitterExtents` era el tamaño completo de la caja. El lote analítico
    // reparte las motas en esa misma caja, así que se pasa el ancho del mapa
    // completo (2 × media anchura) y no la mitad.
    const spanX = bounds.x * 2 * 0.98;
    const spanZ = bounds.z * 2 * 0.98;
    const area = Math.max(1, bounds.x * bounds.z);
    const density = Math.max(0.55, Math.min(2.2, area / 420));
    const particles = new BatchedParticles();
    weather = particles;
    const box = (x: number, y: number, z: number): pc.Vec3 =>
      new pc.Vec3(x, y, z);

    switch (effect) {
      case 'sunMotes': {
        particles.define('sun-motes', {
          texture: textures.pollen,
          additive: true,
          colorStart: [0.88, 1, 0.94],
          colorEnd: [0.52, 1, 0.68],
          opacity: 0.56,
          sizeStart: 0.04,
          sizeMid: 0.09,
          sizeEnd: 0.05,
          lifetime: 9,
          fadeIn: 0.16,
          fadeOut: 0.8,
          drift: [0.2, 0.08, 0.14],
          sway: 0.35,
          swaySpeed: 0.4
        });
        particles.emit(
          'sun-motes',
          [0, 2.4, 0],
          box(spanX, 1.9, spanZ),
          Math.round(120 * density),
          0x51a3
        );
        break;
      }
      case 'rain':
      case 'downpour':
      case 'storm': {
        const heavy = effect !== 'rain';
        particles.define(`${effect}-rain`, {
          texture: textures.rain,
          colorStart: heavy ? [0.5, 1, 0.72] : [0.64, 1, 0.72],
          colorEnd: heavy ? [0.78, 1, 1] : [0.96, 1, 1],
          opacity: heavy ? 0.7 : 0.5,
          sizeStart: heavy ? 0.62 : 0.42,
          sizeMid: heavy ? 0.78 : 0.56,
          sizeEnd: 0.5,
          lifetime: heavy ? 1 : 1.18,
          fadeIn: 0.1,
          fadeOut: 0.8,
          drift: [0.85, heavy ? -26 : -20, 0.4],
          sway: 0.12,
          swaySpeed: 0.6
        });
        particles.emit(
          `${effect}-rain`,
          [0, 9, 0],
          box(spanX, 5.6, spanZ),
          Math.round((heavy ? 1000 : 650) * density),
          0x2f17 + (heavy ? 1 : 0)
        );
        if (effect !== 'rain') {
          particles.define(`${effect}-mist`, {
            texture: textures.mist,
            colorStart: [0.7, 1, 0.82],
            colorEnd: [0.84, 1, 0.94],
            opacity: 0.1,
            sizeStart: 2.4,
            sizeMid: 3.6,
            sizeEnd: 2.8,
            lifetime: 7.5,
            fadeIn: 0.2,
            fadeOut: 0.8,
            drift: [0.21, 0.05, 0.11],
            sway: 0.5,
            swaySpeed: 0.25
          });
          particles.emit(
            `${effect}-mist`,
            [0, 1.1, 0],
            box(spanX, 0.9, spanZ),
            Math.round(110 * density),
            0x6d21
          );
        }
        if (effect === 'storm') buildLightning(root);
        break;
      }
      case 'sand': {
        particles.define('sand-streaks', {
          texture: textures.dust,
          colorStart: [0.94, 1, 1],
          colorEnd: [0.34, 1, 0.42],
          opacity: 0.42,
          sizeStart: 0.18,
          sizeMid: 0.32,
          sizeEnd: 0.24,
          lifetime: 2.1,
          fadeIn: 0.15,
          fadeOut: 0.75,
          drift: [13, 0.3, 3],
          sway: 0.5,
          swaySpeed: 1.2
        });
        particles.emit(
          'sand-streaks',
          [0, 2.1, 0],
          box(spanX, 2.4, spanZ),
          Math.round(520 * density),
          0x3b11
        );
        particles.define('sand-haze', {
          texture: textures.mist,
          colorStart: [1, 1, 1],
          colorEnd: [0.48, 1, 0.54],
          opacity: 0.12,
          sizeStart: 2.8,
          sizeMid: 4.4,
          sizeEnd: 3.2,
          lifetime: 9,
          fadeIn: 0.2,
          fadeOut: 0.8,
          drift: [0.2, 0, 0.05],
          sway: 0.4,
          swaySpeed: 0.3
        });
        particles.emit(
          'sand-haze',
          [0, 1.2, 0],
          box(spanX, 0.8, spanZ),
          Math.round(80 * density),
          0x77c1
        );
        break;
      }
      case 'hail': {
        particles.define('hail', {
          texture: textures.frost,
          colorStart: [0.86, 1, 1],
          colorEnd: [1, 1, 1],
          opacity: 0.9,
          sizeStart: 0.12,
          sizeMid: 0.17,
          sizeEnd: 0.1,
          lifetime: 1.35,
          fadeIn: 0.08,
          fadeOut: 0.85,
          drift: [1.3, -17.5, 0.7],
          sway: 0.15,
          swaySpeed: 0.5
        });
        particles.emit(
          'hail',
          [0, 8, 0],
          box(spanX, 5, spanZ),
          Math.round(620 * density),
          0x4a9d
        );
        break;
      }
      case 'fog': {
        particles.define('fog-banks', {
          texture: textures.mist,
          colorStart: [0.92, 1, 1],
          colorEnd: [1, 1, 1],
          opacity: 0.12,
          sizeStart: 2.8,
          sizeMid: 4.6,
          sizeEnd: 3.4,
          lifetime: 15,
          fadeIn: 0.18,
          fadeOut: 0.8,
          drift: [0.24, 0.02, 0.14],
          sway: 0.6,
          swaySpeed: 0.2
        });
        particles.emit(
          'fog-banks',
          [0, 1.15, 0],
          box(spanX, 1, spanZ),
          Math.round(160 * density),
          0x1f6b
        );
        break;
      }
      case 'wind': {
        particles.define('wind-streaks', {
          texture: textures.dust,
          colorStart: [0.82, 1, 0.9],
          colorEnd: [0.78, 1, 0.88],
          opacity: 0.4,
          sizeStart: 0.14,
          sizeMid: 0.26,
          sizeEnd: 0.18,
          lifetime: 2.6,
          fadeIn: 0.14,
          fadeOut: 0.8,
          drift: [12.5, 0.4, 4],
          sway: 0.6,
          swaySpeed: 1.5
        });
        particles.emit(
          'wind-streaks',
          [0, 2.2, 0],
          box(spanX, 2.2, spanZ),
          Math.round(460 * density),
          0x5e2f
        );
        break;
      }
      case 'snow': {
        particles.define('snow', {
          texture: textures.frost,
          colorStart: [0.9, 1, 1],
          colorEnd: [1, 1, 1],
          opacity: 0.85,
          sizeStart: 0.08,
          sizeMid: 0.15,
          sizeEnd: 0.1,
          lifetime: 6.5,
          fadeIn: 0.12,
          fadeOut: 0.85,
          drift: [0.9, -2.2, 0.5],
          sway: 0.5,
          swaySpeed: 0.6
        });
        particles.emit(
          'snow',
          [0, 7, 0],
          box(spanX, 4.5, spanZ),
          Math.round(700 * density),
          0x2c81
        );
        break;
      }
    }

    particles.build(device, root, bounds);
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
      if (!currentVisual) return;
      weather?.update(dt, scene.fog);
      if (!lightning) return;
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
