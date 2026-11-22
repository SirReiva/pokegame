import * as pc from "playcanvas";

/**
 * Visor de los modelos Pokémon convertidos con tools/blender/export_pm_glb.py.
 *
 * Los GLB ya traen los materiales horneados (albedo × AO y ojos) y todas las
 * animaciones del armature. El selector carga el modelo elegido, reconstruye la
 * lista de clips y ajusta la cámara a la escala de cada uno.
 */

type ModelConfig = {
  id: string;
  name: string;
  species: string;
  url: string;
  scale: number;
  offsetY: number;
  camera: {
    targetY: number;
    targetZ: number;
    distance: number;
    yaw: number;
    pitch: number;
  };
};

const MODELS: ModelConfig[] = [
  {
    id: "pm0001_00",
    name: "PM0001_00",
    species: "Bulbasaur",
    url: `${import.meta.env.BASE_URL}models/pm0001/pm0001_00.glb`,
    scale: 2.2,
    offsetY: 0.105,
    camera: { targetY: 0.9, targetZ: 0.05, distance: 4.55, yaw: 0.58, pitch: 0.22 }
  },
  {
    id: "pm0002_00",
    name: "PM0002_00",
    species: "Ivysaur",
    url: `${import.meta.env.BASE_URL}models/pm0002/pm0002_00.glb`,
    scale: 2.0,
    offsetY: 0.02,
    camera: { targetY: 1.25, targetZ: 0, distance: 5.8, yaw: 0.58, pitch: 0.18 }
  },
  {
    id: "pm0004_00",
    name: "PM0004_00",
    species: "Charmander",
    url: `${import.meta.env.BASE_URL}models/pm0004/pm0004_00.glb`,
    scale: 4.2,
    offsetY: 0,
    camera: { targetY: 1.2, targetZ: 0.05, distance: 5.2, yaw: 0.58, pitch: 0.2 }
  },
  {
    id: "pm0007_00",
    name: "PM0007_00",
    species: "Squirtle",
    url: `${import.meta.env.BASE_URL}models/pm0007/pm0007_00.glb`,
    scale: 5.6,
    offsetY: 0,
    camera: { targetY: 1.2, targetZ: 0, distance: 5.2, yaw: 0.58, pitch: 0.2 }
  },
  {
    id: "pm0025",
    name: "PM0025",
    species: "Pikachu",
    url: `${import.meta.env.BASE_URL}models/pm0025/pm0025.glb`,
    scale: 5.4,
    offsetY: 0,
    camera: { targetY: 1.25, targetZ: 0.05, distance: 5.5, yaw: 0.58, pitch: 0.2 }
  },
  {
    id: "pm0094_00",
    name: "PM0094_00",
    species: "Gengar",
    url: `${import.meta.env.BASE_URL}models/pm0094/pm0094_00.glb`,
    scale: 1.62,
    offsetY: 0,
    camera: { targetY: 1.25, targetZ: 0.05, distance: 5.5, yaw: 0.58, pitch: 0.2 }
  },
  {
    id: "pm0095_00",
    name: "PM0095_00",
    species: "Onix",
    url: `${import.meta.env.BASE_URL}models/pm0095/pm0095_00.glb`,
    scale: 0.49,
    offsetY: 0.02,
    camera: { targetY: 1.25, targetZ: 0.05, distance: 5.5, yaw: 0.58, pitch: 0.2 }
  },
  {
    id: "pm0100_00",
    name: "PM0100_00",
    species: "Voltorb",
    url: `${import.meta.env.BASE_URL}models/pm0100/pm0100_00.glb`,
    scale: 5.02,
    offsetY: -0.01,
    camera: { targetY: 1.25, targetZ: 0.05, distance: 5.5, yaw: 0.58, pitch: 0.2 }
  },
  {
    id: "pm0123",
    name: "PM0123",
    species: "Scyther",
    url: `${import.meta.env.BASE_URL}models/pm0123/pm0123.glb`,
    scale: 1.33,
    offsetY: 0.1,
    camera: { targetY: 1.25, targetZ: 0.05, distance: 5.5, yaw: 0.58, pitch: 0.2 }
  },
  {
    id: "pm0130",
    name: "PM0130",
    species: "Gyarados",
    url: `${import.meta.env.BASE_URL}models/pm0130/pm0130.glb`,
    scale: 0.79,
    offsetY: -0.32,
    camera: { targetY: 1.07, targetZ: 0.05, distance: 5.85, yaw: 0.58, pitch: 0.2 }
  },
  {
    id: "pm0133_00",
    name: "PM0133_00",
    species: "Eevee",
    url: `${import.meta.env.BASE_URL}models/pm0133/pm0133_00.glb`,
    scale: 6.79,
    offsetY: 0.02,
    camera: { targetY: 1.25, targetZ: 0.05, distance: 5.5, yaw: 0.58, pitch: 0.2 }
  },
  {
    id: "pm0144_00",
    name: "PM0144_00",
    species: "Articuno",
    url: `${import.meta.env.BASE_URL}models/pm0144/pm0144_00.glb`,
    scale: 1.18,
    offsetY: 0.02,
    camera: { targetY: 0.93, targetZ: 0.05, distance: 5.85, yaw: 0.58, pitch: 0.2 }
  },
  {
    id: "pm0145_00",
    name: "PM0145_00",
    species: "Zapdos",
    url: `${import.meta.env.BASE_URL}models/pm0145/pm0145_00.glb`,
    scale: 1.49,
    offsetY: 0,
    camera: { targetY: 1.14, targetZ: 0.05, distance: 5.85, yaw: 0.58, pitch: 0.2 }
  },
  {
    id: "pm0146_00",
    name: "PM0146_00",
    species: "Moltres",
    url: `${import.meta.env.BASE_URL}models/pm0146/pm0146_00.glb`,
    scale: 0.93,
    offsetY: 0,
    camera: { targetY: 1.24, targetZ: 0.05, distance: 5.85, yaw: 0.58, pitch: 0.2 }
  },
  {
    id: "pm0150_00",
    name: "PM0150_00",
    species: "Mewtwo",
    url: `${import.meta.env.BASE_URL}models/pm0150/pm0150_00.glb`,
    scale: 1.2,
    offsetY: 0.01,
    camera: { targetY: 1.25, targetZ: 0.05, distance: 5.5, yaw: 0.58, pitch: 0.2 }
  },
  {
    id: "pm0151_00",
    name: "PM0151_00",
    species: "Mew",
    url: `${import.meta.env.BASE_URL}models/pm0151/pm0151_00.glb`,
    scale: 5.36,
    offsetY: -0.01,
    camera: { targetY: 1.25, targetZ: 0.05, distance: 5.5, yaw: 0.58, pitch: 0.2 }
  },
  {
    id: "pm0243",
    name: "PM0243",
    species: "Raikou",
    url: `${import.meta.env.BASE_URL}models/pm0243/pm0243.glb`,
    scale: 1.41,
    offsetY: 0.01,
    camera: { targetY: 1.25, targetZ: 0.05, distance: 5.5, yaw: 0.58, pitch: 0.2 }
  },
  {
    id: "pm0244",
    name: "PM0244",
    species: "Entei",
    url: `${import.meta.env.BASE_URL}models/pm0244/pm0244.glb`,
    scale: 1.16,
    offsetY: 0.01,
    camera: { targetY: 1.25, targetZ: 0.05, distance: 5.5, yaw: 0.58, pitch: 0.2 }
  },
  {
    id: "pm0245",
    name: "PM0245",
    species: "Suicune",
    url: `${import.meta.env.BASE_URL}models/pm0245/pm0245.glb`,
    scale: 1.18,
    offsetY: 0,
    camera: { targetY: 1.25, targetZ: 0.05, distance: 5.5, yaw: 0.58, pitch: 0.2 }
  },
  {
    id: "pm0248",
    name: "PM0248",
    species: "Tyranitar",
    url: `${import.meta.env.BASE_URL}models/pm0248/pm0248.glb`,
    scale: 1.23,
    offsetY: 0,
    camera: { targetY: 1.25, targetZ: 0.05, distance: 5.5, yaw: 0.58, pitch: 0.2 }
  },
  {
    id: "pm0249",
    name: "PM0249",
    species: "Lugia",
    url: `${import.meta.env.BASE_URL}models/pm0249/pm0249.glb`,
    scale: 0.52,
    offsetY: 0.01,
    camera: { targetY: 1.25, targetZ: 0.05, distance: 5.5, yaw: 0.58, pitch: 0.2 }
  },
  {
    id: "pm0250",
    name: "PM0250",
    species: "Ho-Oh",
    url: `${import.meta.env.BASE_URL}models/pm0250/pm0250.glb`,
    scale: 0.53,
    offsetY: 0,
    camera: { targetY: 1.15, targetZ: 0.05, distance: 5.85, yaw: 0.58, pitch: 0.2 }
  },
  {
    id: "pm0251_00",
    name: "PM0251_00",
    species: "Celebi",
    url: `${import.meta.env.BASE_URL}models/pm0251/pm0251_00.glb`,
    scale: 3.97,
    offsetY: -1.51,
    camera: { targetY: 1.25, targetZ: 0.05, distance: 5.5, yaw: 0.58, pitch: 0.2 }
  },
  {
    id: "pm0382",
    name: "PM0382",
    species: "Kyogre",
    url: `${import.meta.env.BASE_URL}models/pm0382/pm0382.glb`,
    scale: 0.7,
    offsetY: -0.01,
    camera: { targetY: 0.51, targetZ: 0.05, distance: 5.85, yaw: 0.58, pitch: 0.2 }
  },
  {
    id: "pm0383_00",
    name: "PM0383_00",
    species: "Groudon",
    url: `${import.meta.env.BASE_URL}models/pm0383/pm0383_00.glb`,
    scale: 0.7,
    offsetY: 0,
    camera: { targetY: 1.25, targetZ: 0.05, distance: 5.5, yaw: 0.58, pitch: 0.2 }
  },
  {
    id: "pm0384",
    name: "PM0384",
    species: "Rayquaza",
    url: `${import.meta.env.BASE_URL}models/pm0384/pm0384.glb`,
    scale: 0.67,
    offsetY: -0.07,
    camera: { targetY: 1.25, targetZ: 0.05, distance: 5.5, yaw: 0.58, pitch: 0.2 }
  },
  {
    id: "pm0448",
    name: "PM0448",
    species: "Lucario",
    url: `${import.meta.env.BASE_URL}models/pm0448/pm0448.glb`,
    scale: 1.99,
    offsetY: -0.01,
    camera: { targetY: 1.25, targetZ: 0.05, distance: 5.5, yaw: 0.58, pitch: 0.2 }
  },
  {
    id: "pm0658",
    name: "PM0658",
    species: "Greninja",
    url: `${import.meta.env.BASE_URL}models/pm0658/pm0658.glb`,
    scale: 1.0,
    offsetY: 0,
    camera: { targetY: 1.4, targetZ: 0.05, distance: 5.5, yaw: 0.58, pitch: 0.2 }
  }
];

type ClipInfo = {
  state: string;
  track: pc.AnimTrack;
  name: string;
  label: string;
  group: string;
  duration: number;
  loop: boolean;
};

type ClipMeta = { label: string; group: string };

/** Nombres legibles y agrupación de los clips (los dos modelos comparten IDs). */
const CLIP_META: Record<string, ClipMeta> = {
  "00000_defaultwait01_loop": { label: "Espera", group: "Espera" },
  "00001_battlewait01_loop": { label: "Espera de combate", group: "Espera" },
  "00010_defaultidle01": { label: "Idle 1", group: "Espera" },
  "00011_defaultidle02": { label: "Idle 2", group: "Espera" },
  "00021_turn_r090": { label: "Giro a la derecha", group: "Movimiento" },
  "00024_turn_l090": { label: "Giro a la izquierda", group: "Movimiento" },
  "00030_walk01_loop": { label: "Caminar", group: "Movimiento" },
  "00100_run01_loop": { label: "Correr", group: "Movimiento" },
  "00145_stepout01_start": { label: "Paso · Inicio", group: "Movimiento" },
  "00146_stepout01": { label: "Paso", group: "Movimiento" },
  "00147_stepout01_end": { label: "Paso · Fin", group: "Movimiento" },
  "00150_jumpup01_start": { label: "Salto · Inicio", group: "Movimiento" },
  "00151_jumpup01_loop": { label: "Salto · Aire", group: "Movimiento" },
  "00152_jumpdown01_start": { label: "Caída · Inicio", group: "Movimiento" },
  "00153_jumpdown01_loop": { label: "Caída", group: "Movimiento" },
  "00155_land02": { label: "Aterrizaje", group: "Movimiento" },
  "00270_rest01_start": { label: "Descanso · Inicio", group: "Descanso" },
  "00271_rest01_loop": { label: "Descanso", group: "Descanso" },
  "00272_rest01_end": { label: "Descanso · Fin", group: "Descanso" },
  "00280_sleep01_start": { label: "Dormir · Inicio", group: "Descanso" },
  "00281_sleep01_loop": { label: "Dormir", group: "Descanso" },
  "00282_sleep01_end": { label: "Dormir · Fin", group: "Descanso" },
  "00290_eat01_start": { label: "Comer · Inicio", group: "Descanso" },
  "00291_eat01_loop": { label: "Comer", group: "Descanso" },
  "00292_eat01_end": { label: "Comer · Fin", group: "Descanso" },
  "00293_eat02_start": { label: "Comer 2 · Inicio", group: "Descanso" },
  "00294_eat02_loop": { label: "Comer 2", group: "Descanso" },
  "00295_eat02_end": { label: "Comer 2 · Fin", group: "Descanso" },
  "00260_wildbool02_start": { label: "Salvaje · Inicio", group: "Reacciones" },
  "00261_wildbool02_loop": { label: "Salvaje", group: "Reacciones" },
  "00262_wildbool02_end": { label: "Salvaje · Fin", group: "Reacciones" },
  "00300_roar01": { label: "Rugido", group: "Combate" },
  "00320_refresh01": { label: "Refresco", group: "Combate" },
  "00400_attack01": { label: "Ataque físico", group: "Combate" },
  "00410_attack02": { label: "Ataque físico 2", group: "Combate" },
  "00450_rangeattack01": { label: "Ataque a distancia", group: "Combate" },
  "00460_rangeattack02_start": { label: "Rayo · Inicio", group: "Combate" },
  "00461_rangeattack02_loop": { label: "Rayo · Canalizar", group: "Combate" },
  "00462_rangeattack02_end": { label: "Rayo · Fin", group: "Combate" },
  "00500_damage01": { label: "Daño", group: "Combate" },
  "00501_damage02": { label: "Daño fuerte", group: "Combate" },
  "00510_stun01_start": { label: "Aturdido · Inicio", group: "Combate" },
  "00511_stun01_loop": { label: "Aturdido", group: "Combate" },
  "00512_stun01_end": { label: "Aturdido · Fin", group: "Combate" },
  "00520_down01_start": { label: "Debilitado · Inicio", group: "Combate" },
  "00521_down01_loop": { label: "Debilitado", group: "Combate" },
  "00522_down01_end": { label: "Debilitado · Fin", group: "Combate" },
  "00550_glad01": { label: "Alegría", group: "Reacciones" },
  "00560_notice01": { label: "Atención", group: "Reacciones" },
  "00563_hate01": { label: "Enfado", group: "Reacciones" },
  "08000_eye01": { label: "Parpadeo", group: "Rostro" },
  "08100_mouth01": { label: "Boca", group: "Rostro" }
};

const GROUP_ORDER = ["Espera", "Movimiento", "Descanso", "Combate", "Reacciones", "Rostro"];

/**
 * Los clips con prefijo numérico comparten la etiqueta del sufijo: 00000,
 * 10000 y 20000 son rutinas distintas del mismo movimiento (por ejemplo,
 * `10030_walk01_loop` es el caminar de Gyarados y `00030_walk01_loop` el de los
 * modelos PMD).
 */
const CLIP_META_BY_SUFFIX: Record<string, ClipMeta> = Object.fromEntries(
  Object.entries(CLIP_META).map(([name, meta]) => [name.replace(/^\d{5}_/, ""), meta])
);

/** Clips de los modelos PMD que no usan el prefijo numérico (Onix, Celebi…). */
const PMD_CLIP_META: Record<string, ClipMeta> = {
  ba01_landA01: { label: "Aterrizaje A", group: "Movimiento" },
  ba01_landB01: { label: "Aterrizaje B", group: "Movimiento" },
  ba01_landC01: { label: "Aterrizaje C", group: "Movimiento" },
  ba02_roar01: { label: "Rugido", group: "Combate" },
  ba10_waitA01: { label: "Espera A", group: "Espera" },
  ba10_waitB01: { label: "Espera B", group: "Espera" },
  ba20_buturi01: { label: "Ataque físico", group: "Combate" },
  ba21_tokusyu01: { label: "Ataque especial 1", group: "Combate" },
  ba21_tokusyu02: { label: "Ataque especial 2", group: "Combate" },
  ba21_tokusyu03: { label: "Ataque especial 3", group: "Combate" },
  ba30_damageS01: { label: "Daño", group: "Combate" },
  ba41_down01: { label: "Debilitado", group: "Combate" },
  eye01: { label: "Parpadeo", group: "Rostro" },
  fi01_wait01: { label: "Espera", group: "Espera" },
  fi20_walk01: { label: "Caminar", group: "Movimiento" },
  fi21_run01: { label: "Correr", group: "Movimiento" },
  kw01_wait01: { label: "Espera", group: "Espera" },
  kw20_drowseA01: { label: "Somnoliento A", group: "Descanso" },
  kw20_drowseB01: { label: "Somnoliento B", group: "Descanso" },
  kw20_drowseC01: { label: "Somnoliento C", group: "Descanso" },
  kw21_sleepA01: { label: "Dormir A", group: "Descanso" },
  kw21_sleepB01: { label: "Dormir B", group: "Descanso" },
  kw30_hate01: { label: "Enfado", group: "Reacciones" },
  kw32_happyA01: { label: "Alegría A", group: "Reacciones" },
  kw32_happyB01: { label: "Alegría B", group: "Reacciones" },
  kw32_happyC01: { label: "Alegría C", group: "Reacciones" },
  kw33_moveA01: { label: "Jugar A", group: "Reacciones" },
  kw33_moveC01: { label: "Jugar C", group: "Reacciones" },
  kw34_lonely01: { label: "Soledad", group: "Reacciones" },
  kw35_playA01: { label: "Jugar", group: "Reacciones" },
  kw36_mad01: { label: "Enfado", group: "Reacciones" },
  kw50_eatA01: { label: "Comer A", group: "Descanso" },
  kw50_eatB01: { label: "Comer B", group: "Descanso" },
  kw50_eatC01: { label: "Comer C", group: "Descanso" },
  kw60_touch01: { label: "Tocar", group: "Reacciones" },
  loop01: { label: "Bucle", group: "Otros" },
  loop01_loop: { label: "Bucle", group: "Otros" },
  mouth01: { label: "Boca", group: "Rostro" }
};

/** Resuelve la etiqueta de un clip quitando prefijos y sufijos de duplicado. */
function clipMetaFor(name: string): ClipMeta | undefined {
  const clean = name.replace(/\.\d{3}$/, "");
  return (
    CLIP_META[clean] ??
    CLIP_META_BY_SUFFIX[clean.replace(/^\d{5}_/, "")] ??
    PMD_CLIP_META[clean]
  );
}

/** Los clips sin nombre del .blend original llegan como hash hexadecimal. */
function isHashedClip(name: string): boolean {
  return /^[0-9A-F]{8,}\[FullHash=/i.test(name);
}

function $(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`No se encontró #${id}`);
  return element;
}

const canvasElement = document.getElementById("viewer");
if (!(canvasElement instanceof HTMLCanvasElement)) {
  throw new Error("No se encontró el canvas del visor");
}
const canvas: HTMLCanvasElement = canvasElement;

const loader = $("loader");
const loaderFill = $("loader-fill");
const loaderStatus = $("loader-status");
const loaderTitle = loader.querySelector("h2");
const modelSelectElement = $("model-select");
if (!(modelSelectElement instanceof HTMLSelectElement)) {
  throw new Error("No se encontró el selector de modelo");
}
const modelSelect: HTMLSelectElement = modelSelectElement;
const modelName = $("model-name");
const modelSubtitle = $("model-subtitle");
const description = document.querySelector('meta[name="description"]');

const clipList = $("clip-list");
const clipsPanel = $("clips-panel");
const clipsToggle = $("clips-toggle");
const clipsClose = $("clips-close");
const clipsMeta = $("clips-meta");

const playPause = $("play-pause");
const clipName = $("clip-name");
const clipGroup = $("clip-group");
const clipTime = $("clip-time");
const timeline = $("timeline");
const timelineFill = $("timeline-fill");
const timelineKnob = $("timeline-knob");
const speedInput = $("speed") as HTMLInputElement;
const speedValue = $("speed-value");
const loopInput = $("loop") as HTMLInputElement;
const orbitInput = $("orbit") as HTMLInputElement;
const resetCamera = $("reset-camera");

const statFps = $("stat-fps");
const statTris = $("stat-tris");
const statBones = $("stat-bones");
const statClips = $("stat-clips");
const engineVersion = $("engine-version");

engineVersion.textContent = `PlayCanvas ${pc.version}`;

function setLoaderProgress(progress: number, status?: string): void {
  loaderFill.style.width = `${Math.round(Math.min(1, Math.max(0.02, progress)) * 100)}%`;
  if (status) loaderStatus.textContent = status;
}

function showError(message: string): void {
  loader.classList.remove("is-hidden");
  loaderStatus.classList.add("is-error");
  loaderStatus.textContent = message;
  loaderFill.style.width = "100%";
  loaderFill.style.background = "linear-gradient(90deg, #b4543f, #ff9d8a)";
  console.error(message);
}

function formatDuration(seconds: number): string {
  return seconds > 0 ? `${seconds.toFixed(1)}s` : "–";
}

/** Lee los nombres glTF de las animaciones desde el JSON embebido del GLB. */
function readGlbAnimationNames(buffer: ArrayBuffer): string[] {
  const view = new DataView(buffer);
  if (buffer.byteLength < 12 || view.getUint32(0, true) !== 0x46546c67) return [];
  let offset = 12;
  while (offset + 8 <= buffer.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    if (type === 0x4e4f534a) {
      try {
        const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, offset + 8, length)));
        return (json.animations ?? []).map((animation: { name?: string }) => animation.name ?? "");
      } catch {
        return [];
      }
    }
    offset += 8 + length;
  }
  return [];
}

function clipStateName(index: number): string {
  return `state_${index}`;
}

function fallbackLabel(name: string): string {
  return name
    .replace(/^\d+_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function populateModelSelect(): void {
  modelSelect.replaceChildren(
    ...MODELS.map((model) => {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = `${model.id.split("_")[0].toUpperCase()} · ${model.species}`;
      return option;
    })
  );
}

function applyModelChrome(config: ModelConfig): void {
  const [family, ...rest] = config.id.split("_");
  const form = rest.join("_");
  modelName.innerHTML = form
    ? `${family.toUpperCase()}<span>_${form}</span>`
    : family.toUpperCase();
  modelSubtitle.textContent = `${config.species} · visor de animaciones`;
  document.title = `${config.name} · Visor GLB con PlayCanvas`;
  description?.setAttribute(
    "content",
    `Visor del modelo ${config.name} (${config.species}) convertido a GLB y reproducido con PlayCanvas: animaciones, cámara orbital y estadísticas en vivo.`
  );
  modelSelect.value = config.id;
  if (loaderTitle) loaderTitle.textContent = `${config.name}.glb`;
}

async function start(): Promise<void> {
  populateModelSelect();

  setLoaderProgress(0.04, "Creando dispositivo WebGL 2…");

  const device = await pc.createGraphicsDevice(canvas, {
    deviceTypes: [pc.DEVICETYPE_WEBGL2],
    antialias: true,
    alpha: false,
    powerPreference: "high-performance"
  });

  const app = new pc.AppBase(canvas);
  const options = new pc.AppOptions();
  options.graphicsDevice = device;
  options.componentSystems = [
    pc.RenderComponentSystem,
    pc.CameraComponentSystem,
    pc.LightComponentSystem,
    pc.AnimComponentSystem
  ];
  options.resourceHandlers = [pc.ContainerHandler, pc.TextureHandler];
  app.init(options);

  app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  app.start();

  // Escena: niebla, ambiente y cámara.
  const bg = new pc.Color(0.02, 0.045, 0.036);
  app.scene.ambientLight = new pc.Color(0.22, 0.25, 0.24);
  app.scene.exposure = 1.15;
  app.scene.fog.type = pc.FOG_LINEAR;
  app.scene.fog.color = bg;
  app.scene.fog.start = 7;
  app.scene.fog.end = 18;

  const camera = new pc.Entity("camera");
  camera.addComponent("camera", {
    clearColor: bg,
    fov: 36,
    nearClip: 0.05,
    farClip: 60,
    toneMapping: pc.TONEMAP_NEUTRAL
  });
  app.root.addChild(camera);
  camera.setPosition(2, 1.6, 3);

  // Luces: clave con sombras, relleno frío y contraluz verde.
  const keyLight = new pc.Entity("key-light");
  keyLight.addComponent("light", {
    type: "directional",
    color: new pc.Color(1.0, 0.97, 0.92),
    intensity: 2.1,
    castShadows: true,
    shadowDistance: 10,
    shadowResolution: 2048,
    shadowBias: 0.18,
    normalOffsetBias: 0.35
  });
  keyLight.setPosition(3.2, 5.4, 4.2);
  keyLight.lookAt(0, 0.7, 0);
  app.root.addChild(keyLight);

  const fillLight = new pc.Entity("fill-light");
  fillLight.addComponent("light", {
    type: "directional",
    color: new pc.Color(0.8, 0.88, 0.92),
    intensity: 0.75,
    castShadows: false
  });
  fillLight.setPosition(-4, 2.4, 2.5);
  fillLight.lookAt(0, 0.8, 0);
  app.root.addChild(fillLight);

  const rimLight = new pc.Entity("rim-light");
  rimLight.addComponent("light", {
    type: "directional",
    color: new pc.Color(0.82, 1.0, 0.9),
    intensity: 1.15,
    castShadows: false
  });
  rimLight.setPosition(-0.5, 3.2, -5.5);
  rimLight.lookAt(0, 0.9, 0);
  app.root.addChild(rimLight);

  const rimFill = new pc.Entity("rim-fill");
  rimFill.addComponent("light", {
    type: "omni",
    color: new pc.Color(0.7, 1.0, 0.82),
    intensity: 0.45,
    range: 6,
    castShadows: false
  });
  rimFill.setPosition(-0.8, 2.0, -3.2);
  app.root.addChild(rimFill);

  // Suelo con viñeta radial procedural.
  const floor = new pc.Entity("floor");
  const floorMaterial = createFloorMaterial(device);
  const floorMesh = pc.Mesh.fromGeometry(
    device,
    new pc.PlaneGeometry({ halfExtents: new pc.Vec2(30, 30), widthSegments: 1, lengthSegments: 1 })
  );
  floor.addComponent("render", {
    meshInstances: [new pc.MeshInstance(floorMesh, floorMaterial)]
  });
  floor.setPosition(0, -0.002, 0);
  app.root.addChild(floor);

  // Estado de la cámara orbital (depende del modelo activo).
  const cameraState = {
    target: new pc.Vec3(0, 0.9, 0.05),
    yaw: 0.58,
    pitch: 0.22,
    distance: 4.55,
    yawTarget: 0.58,
    pitchTarget: 0.22,
    distanceTarget: 4.55,
    baseDistance: 4.55,
    dragging: false,
    pinching: false
  };
  let autoOrbit = orbitInput.checked;

  type ViewerState = {
    config: ModelConfig;
    asset: pc.Asset;
    root: pc.Entity;
    anim: pc.AnimComponent;
    layer: pc.AnimComponentLayer;
    clips: ClipInfo[];
    buttons: HTMLButtonElement[];
    order: number[];
    activeIndex: number;
  };

  let viewer: ViewerState | null = null;
  let currentConfig: ModelConfig = MODELS[0];
  let loadToken = 0;

  function aspect(): number {
    return window.innerWidth / Math.max(window.innerHeight, 1);
  }

  function baseDistanceFor(config: ModelConfig): number {
    return config.camera.distance * Math.max(1, 0.72 / aspect());
  }

  function clampDistance(value: number, base = cameraState.baseDistance): number {
    return pc.math.clamp(value, base * 0.42, base * 1.8);
  }

  function applyCamera(): void {
    const cosPitch = Math.cos(cameraState.pitch);
    camera.setPosition(
      cameraState.target.x + Math.sin(cameraState.yaw) * cosPitch * cameraState.distance,
      cameraState.target.y + Math.sin(cameraState.pitch) * cameraState.distance,
      cameraState.target.z + Math.cos(cameraState.yaw) * cosPitch * cameraState.distance
    );
    camera.lookAt(cameraState.target);
  }

  function setCameraConfig(config: ModelConfig, snap = false): void {
    currentConfig = config;
    cameraState.target.set(0, config.camera.targetY, config.camera.targetZ);
    cameraState.yaw = cameraState.yawTarget = config.camera.yaw;
    cameraState.pitch = cameraState.pitchTarget = config.camera.pitch;
    cameraState.baseDistance = baseDistanceFor(config);
    cameraState.distanceTarget = cameraState.baseDistance;
    if (snap) cameraState.distance = cameraState.baseDistance;
    applyCamera();
  }

  function resetView(): void {
    cameraState.yawTarget = currentConfig.camera.yaw;
    cameraState.pitchTarget = currentConfig.camera.pitch;
    cameraState.distanceTarget = cameraState.baseDistance;
  }

  function resetClipUi(): void {
    clipList.replaceChildren();
    clipName.textContent = "Cargando modelo…";
    clipGroup.textContent = "—";
    clipTime.textContent = "0.0 / 0.0 s";
    timelineFill.style.width = "0%";
    timelineKnob.style.left = "0%";
    timeline.setAttribute("aria-valuenow", "0");
    statTris.textContent = "–";
    statBones.textContent = "–";
    statClips.textContent = "–";
    clipsMeta.textContent = "Cargando…";
  }

  function updatePlayButton(): void {
    const playing = viewer?.anim.playing ?? false;
    playPause.classList.toggle("is-playing", playing);
    playPause.setAttribute("aria-label", playing ? "Pausar animación" : "Reproducir animación");
  }

  function updateNowPlaying(): void {
    const current = viewer;
    const clip = current?.clips[current.activeIndex];
    if (!clip) return;
    clipName.textContent = clip.label;
    clipGroup.textContent = clip.group;
  }

  function highlight(index: number): void {
    viewer?.buttons.forEach((button, buttonIndex) => {
      button.classList.toggle("is-active", buttonIndex === index);
    });
    viewer?.buttons[index]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function playClip(index: number, immediate = false): void {
    if (!viewer) return;
    const clip = viewer.clips[index];
    if (!clip) return;

    if (viewer.layer.activeState === clip.state) {
      viewer.layer.activeStateCurrentTime = 0;
      if (!viewer.anim.playing) viewer.anim.playing = true;
    } else {
      viewer.anim.assignAnimation(clip.state, clip.track, undefined, 1, loopInput.checked);
      viewer.layer.transition(clip.state, immediate ? 0 : 0.16);
    }

    viewer.activeIndex = index;
    updateNowPlaying();
    highlight(index);
    updatePlayButton();
  }

  type ContainerAssets = {
    animations?: pc.Asset[];
    materials?: pc.Asset[];
    renders?: pc.Asset[];
  };

  function disposeViewer(): void {
    if (!viewer) return;
    const { root, asset } = viewer;
    viewer = null;
    root.destroy();

    // El contenedor glTF registra sus animaciones, materiales y mallas como
    // assets independientes: hay que quitarlos para no acumularlos al cambiar.
    const subAssets = asset.resource as unknown as ContainerAssets;
    for (const subAsset of [
      ...(subAssets.animations ?? []),
      ...(subAssets.materials ?? []),
      ...(subAssets.renders ?? [])
    ]) {
      subAsset.unload();
      app.assets.remove(subAsset);
    }

    asset.unload();
    app.assets.remove(asset);
    resetClipUi();
  }

  function buildClipList(clips: ClipInfo[]): { buttons: HTMLButtonElement[]; order: number[] } {
    clipList.replaceChildren();
    const groups = new Map<string, ClipInfo[]>();
    for (const clip of clips) {
      const list = groups.get(clip.group) ?? [];
      list.push(clip);
      groups.set(clip.group, list);
    }
    const orderedGroups = [...groups.keys()].sort((a, b) => {
      const ai = GROUP_ORDER.indexOf(a);
      const bi = GROUP_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    // `buttons` va indexado por el índice del clip, no por la posición visual:
    // los grupos reordenan la lista y el resaltado debe seguir al clip real.
    const buttons: HTMLButtonElement[] = [];
    const order: number[] = [];
    for (const group of orderedGroups) {
      const groupClips = groups.get(group) ?? [];
      const section = document.createElement("section");
      section.className = "clip-group";

      const heading = document.createElement("h3");
      heading.textContent = group;
      const count = document.createElement("span");
      count.textContent = String(groupClips.length).padStart(2, "0");
      heading.append(count);
      section.append(heading);

      for (const clip of groupClips) {
        const index = clips.indexOf(clip);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "clip-item";
        button.title = clip.name;
        button.dataset.index = String(index);
        button.innerHTML = `
          <span class="clip-index">${clip.name.slice(0, 5)}</span>
          <span class="clip-label"></span>
          <span class="clip-duration">${formatDuration(clip.duration)}</span>
          ${
            clip.loop
              ? '<span class="clip-loop" title="Loop"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></span>'
              : ""
          }
        `;
        const label = button.querySelector(".clip-label");
        if (label) label.textContent = clip.label;
        button.addEventListener("click", () => {
          playClip(index);
          if (window.matchMedia("(max-width: 980px)").matches) setPanelOpen(false);
        });
        buttons[index] = button;
        order.push(index);
        section.append(button);
      }
      clipList.append(section);
    }
    return { buttons, order };
  }

  function showModel(asset: pc.Asset, animationNames: string[], config: ModelConfig): void {
    disposeViewer();

    const container = asset.resource as unknown as pc.ContainerResource;
    const model = container.instantiateRenderEntity({
      castShadows: true,
      receiveShadows: true
    });

    const root = new pc.Entity("model-root");
    root.setLocalScale(config.scale, config.scale, config.scale);
    root.setLocalPosition(0, config.offsetY, 0);
    root.addChild(model);

    try {
      const animations = container.animations ?? [];
      if (animations.length === 0) {
        throw new Error("El GLB no contiene animaciones.");
      }

      const clips: ClipInfo[] = animations
        .map((animationAsset, index) => {
          const assetName = animationAsset.name ?? "";
          const rawName = animationNames[index] ?? assetName;
          const name = rawName.replace(/\.gfbanm$/, "").replace(/^pm\d+_\d+_\d+_/, "");
          const meta = clipMetaFor(name);
          const track = animationAsset.resource as pc.AnimTrack;
          return {
            state: clipStateName(index),
            track,
            name,
            label:
              meta?.label ??
              (isHashedClip(name)
                ? `Clip especial ${name.slice(0, 4)}`
                : fallbackLabel(name || `Clip ${index + 1}`)),
            group: meta?.group ?? "Otros",
            duration: track.duration ?? 0,
            loop: name.endsWith("_loop")
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      // Estadísticas.
      let triangles = 0;
      let bones = 0;
      for (const render of model.findComponents("render")) {
        for (const meshInstance of render.meshInstances) {
          const mesh = meshInstance.mesh;
          if (mesh) {
            for (const primitive of mesh.primitive) {
              triangles += (primitive.count ?? 0) / 3;
            }
          }
          if (!bones && meshInstance.skinInstance) {
            bones = meshInstance.skinInstance.bones.length;
          }
        }
      }
      statTris.textContent = triangles.toLocaleString("es-ES");
      statBones.textContent = String(bones);
      statClips.textContent = String(clips.length);
      clipsMeta.textContent = `${clips.length} clips · ${bones} huesos · GLB`;

      model.addComponent("anim", { activate: true, speed: Number(speedInput.value) });
      const anim = model.anim;
      if (!anim) {
        throw new Error("No se pudo crear el componente de animación.");
      }
      anim.assignAnimation(clips[0].state, clips[0].track, undefined, 1, loopInput.checked);
      const layer = anim.baseLayer;
      if (!layer) {
        throw new Error("No se pudo crear el grafo de animación.");
      }
      for (const clip of clips.slice(1)) {
        anim.assignAnimation(clip.state, clip.track, undefined, 1, loopInput.checked);
      }

      const { buttons, order } = buildClipList(clips);
      app.root.addChild(root);
      viewer = { config, asset, root, anim, layer, clips, buttons, order, activeIndex: -1 };

      // Arranca en una pose de espera: los PMD no tienen `defaultwait` y, sin
      // esto, Onix o Celebi empezaban en un rugido o en un clip sin nombre.
      let defaultIndex = clips.findIndex((clip) =>
        /(defaultwait|battlewait|_waitA01|_waitB01|_wait01)/.test(clip.name)
      );
      if (defaultIndex < 0) defaultIndex = clips.findIndex((clip) => clip.group === "Espera");
      if (defaultIndex < 0) defaultIndex = 0;
      playClip(defaultIndex, true);
      anim.playing = true;
      updatePlayButton();

      setCameraConfig(config, true);
    } catch (error) {
      viewer = null;
      root.destroy();
      throw error;
    }
  }

  function syncUrl(config: ModelConfig): void {
    const url = new URL(window.location.href);
    url.searchParams.set("model", config.id);
    history.replaceState(null, "", url);
  }

  async function loadModel(config: ModelConfig): Promise<void> {
    const token = ++loadToken;
    currentConfig = config;
    applyModelChrome(config);
    syncUrl(config);

    modelSelect.disabled = true;
    loaderStatus.classList.remove("is-error");
    loaderFill.style.background = "";
    loader.classList.remove("is-hidden");
    setLoaderProgress(0.04, `Descargando ${config.name}.glb…`);

    try {
      const response = await fetch(config.url);
      if (!response.ok) throw new Error(`No se pudo descargar el GLB (HTTP ${response.status}).`);
      const total = Number(response.headers.get("content-length")) || 0;
      const chunks: Uint8Array[] = [];
      let received = 0;
      if (response.body) {
        const reader = response.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            received += value.byteLength;
            if (token === loadToken) {
              const progress = total > 0 ? Math.min(received / total, 0.98) : 0.5;
              setLoaderProgress(0.08 + progress * 0.7, `Descargando ${config.name}.glb… ${Math.round(progress * 100)}%`);
            }
          }
        }
      } else {
        chunks.push(new Uint8Array(await response.arrayBuffer()));
      }
      if (token !== loadToken) return;

      const buffer = new Blob(chunks as BlobPart[], { type: "model/gltf-binary" });
      const animationNames = readGlbAnimationNames(await buffer.arrayBuffer());
      if (token !== loadToken) return;

      setLoaderProgress(0.8, "Procesando mallas, texturas y animaciones…");
      const blobUrl = URL.createObjectURL(buffer);
      app.assets.loadFromUrl(blobUrl, "container", (err, asset) => {
        URL.revokeObjectURL(blobUrl);

        if (token !== loadToken) {
          if (asset) {
            asset.unload();
            app.assets.remove(asset);
          }
          return;
        }

        if (err || !asset) {
          modelSelect.disabled = false;
          showError(`PlayCanvas no pudo procesar el GLB. ${err ?? ""}`);
          return;
        }

        try {
          showModel(asset, animationNames, config);
          setLoaderProgress(1, "Listo");
          loader.classList.add("is-hidden");
        } catch (error) {
          asset.unload();
          app.assets.remove(asset);
          showError(error instanceof Error ? error.message : "Error al preparar el modelo.");
        } finally {
          modelSelect.disabled = false;
        }
      });
    } catch (error) {
      if (token !== loadToken) return;
      modelSelect.disabled = false;
      showError(error instanceof Error ? error.message : "Error al descargar el modelo.");
    }
  }

  function setPanelOpen(open: boolean): void {
    clipsPanel.classList.toggle("is-open", open);
    clipsToggle.setAttribute("aria-expanded", String(open));
  }

  function seekFromPointer(event: PointerEvent): void {
    if (!viewer) return;
    const rect = timeline.getBoundingClientRect();
    const ratio = pc.math.clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const duration = viewer.layer.activeStateDuration;
    if (duration > 0) viewer.layer.activeStateCurrentTime = ratio * duration;
  }

  let scrubbing = false;
  const pointers = new Map<number, { x: number; y: number }>();
  let lastX = 0;
  let lastY = 0;
  let pinchDistance = 0;

  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      cameraState.dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
    } else if (pointers.size === 2) {
      cameraState.pinching = true;
      const [a, b] = [...pointers.values()];
      pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (cameraState.pinching && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const next = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance > 0) {
        cameraState.distanceTarget = clampDistance(
          cameraState.distanceTarget * (pinchDistance / Math.max(next, 1))
        );
      }
      pinchDistance = next;
      return;
    }

    if (!cameraState.dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    cameraState.yawTarget -= dx * 0.007;
    cameraState.pitchTarget = pc.math.clamp(cameraState.pitchTarget + dy * 0.006, 0.02, 1.25);
  });

  function endPointer(event: PointerEvent): void {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) {
      cameraState.pinching = false;
      pinchDistance = 0;
    }
    if (pointers.size === 0) cameraState.dragging = false;
  }

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", (event) => {
    if (event.buttons === 0) endPointer(event);
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      cameraState.distanceTarget = clampDistance(
        cameraState.distanceTarget * Math.exp(event.deltaY * 0.0011)
      );
    },
    { passive: false }
  );

  orbitInput.addEventListener("change", () => {
    autoOrbit = orbitInput.checked;
  });

  resetCamera.addEventListener("click", resetView);

  modelSelect.addEventListener("change", () => {
    const config = MODELS.find((model) => model.id === modelSelect.value);
    if (config) void loadModel(config);
  });

  playPause.addEventListener("click", () => {
    if (!viewer) return;
    viewer.anim.playing = !viewer.anim.playing;
    updatePlayButton();
  });

  loopInput.addEventListener("change", () => {
    if (!viewer) return;
    const clip = viewer.clips[viewer.activeIndex];
    if (!clip) return;
    viewer.anim.assignAnimation(clip.state, clip.track, undefined, 1, loopInput.checked);
    viewer.layer.transition(clip.state, 0);
  });

  speedInput.addEventListener("input", () => {
    const speed = Number(speedInput.value);
    if (viewer) viewer.anim.speed = speed;
    speedValue.textContent = `${speed.toFixed(1)}×`;
  });

  timeline.addEventListener("pointerdown", (event) => {
    scrubbing = true;
    timeline.setPointerCapture(event.pointerId);
    seekFromPointer(event);
  });
  timeline.addEventListener("pointermove", (event) => {
    if (scrubbing) seekFromPointer(event);
  });
  timeline.addEventListener("pointerup", () => {
    scrubbing = false;
  });
  timeline.addEventListener("pointercancel", () => {
    scrubbing = false;
  });
  timeline.addEventListener("keydown", (event) => {
    if (!viewer) return;
    const duration = viewer.layer.activeStateDuration;
    if (duration <= 0) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const step = duration * 0.05 * (event.key === "ArrowLeft" ? -1 : 1);
      viewer.layer.activeStateCurrentTime = pc.math.clamp(
        viewer.layer.activeStateCurrentTime + step,
        0,
        Math.max(duration - 0.001, 0)
      );
    }
  });

  clipsToggle.addEventListener("click", () => {
    setPanelOpen(!clipsPanel.classList.contains("is-open"));
  });
  clipsClose.addEventListener("click", () => setPanelOpen(false));

  window.addEventListener("keydown", (event) => {
    const target = event.target;
    if (
      target === timeline ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLButtonElement
    ) {
      return;
    }
    if (!viewer) return;

    if (event.code === "Space") {
      event.preventDefault();
      viewer.anim.playing = !viewer.anim.playing;
      updatePlayButton();
    } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const position = viewer.order.indexOf(viewer.activeIndex);
      const next = viewer.order[(position + delta + viewer.order.length) % viewer.order.length];
      playClip(next);
    } else if (event.key.toLowerCase() === "r") {
      resetView();
    }
  });

  window.addEventListener("resize", () => {
    // PlayCanvas no escucha el resize por su cuenta: hay que redimensionar el
    // canvas o el buffer se queda con el tamaño anterior al girar el móvil.
    app.resizeCanvas();
    const nextBase = baseDistanceFor(currentConfig);
    const ratio = nextBase / cameraState.baseDistance;
    cameraState.baseDistance = nextBase;
    cameraState.distanceTarget = clampDistance(cameraState.distanceTarget * ratio);
    cameraState.distance = clampDistance(cameraState.distance * ratio);
  });

  // Bucle de cámara, estadísticas y timeline.
  let fpsFrames = 0;
  let fpsElapsed = 0;
  app.on("update", (dt: number) => {
    const step = Math.min(dt, 0.1);

    if (autoOrbit && !cameraState.dragging && !cameraState.pinching) {
      cameraState.yawTarget += step * 0.15;
    }

    const damping = 1 - Math.exp(-step * 9);
    cameraState.yaw += (cameraState.yawTarget - cameraState.yaw) * damping;
    cameraState.pitch += (cameraState.pitchTarget - cameraState.pitch) * damping;
    cameraState.distance += (cameraState.distanceTarget - cameraState.distance) * damping;
    applyCamera();

    fpsFrames += 1;
    fpsElapsed += step;
    if (fpsElapsed >= 0.5) {
      statFps.textContent = String(Math.round(fpsFrames / fpsElapsed));
      fpsFrames = 0;
      fpsElapsed = 0;
    }

    if (!viewer) return;
    const duration = viewer.layer.activeStateDuration;
    const current = viewer.layer.activeStateCurrentTime;
    const progress = duration > 0 ? pc.math.clamp(current / duration, 0, 1) : 0;
    timelineFill.style.width = `${(progress * 100).toFixed(2)}%`;
    timelineKnob.style.left = `${(progress * 100).toFixed(2)}%`;
    clipTime.textContent = `${current.toFixed(1)} / ${duration.toFixed(1)} s`;
    timeline.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
  });

  resetClipUi();
  const requested = new URLSearchParams(window.location.search).get("model");
  const initial = MODELS.find((model) => model.id === requested) ?? MODELS[0];
  setLoaderProgress(0.1, "Preparando el visor…");
  await loadModel(initial);
}

function createFloorMaterial(device: pc.GraphicsDevice): pc.StandardMaterial {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo crear el contexto 2D del suelo.");

  const gradient = context.createRadialGradient(
    size * 0.5,
    size * 0.5,
    size * 0.03,
    size * 0.5,
    size * 0.5,
    size * 0.5
  );
  gradient.addColorStop(0, "#244c39");
  gradient.addColorStop(0.3, "#112a20");
  gradient.addColorStop(0.65, "#081811");
  gradient.addColorStop(1, "#050d0a");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new pc.Texture(device, {
    width: size,
    height: size,
    format: pc.PIXELFORMAT_RGBA8,
    mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: pc.ADDRESS_CLAMP_TO_EDGE,
    srgb: true
  });
  texture.setSource(canvas);

  const material = new pc.StandardMaterial();
  material.diffuseMap = texture;
  material.diffuse = new pc.Color(1, 1, 1);
  material.useMetalness = true;
  material.metalness = 0.05;
  material.gloss = 0.2;
  material.update();
  return material;
}

start().catch((error) => {
  showError(error instanceof Error ? error.message : "Error inesperado al iniciar el visor.");
});
