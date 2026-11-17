import { Game } from '../game/game';
import type { MatchPlayerConfig } from '../game/multiplayer';
import type { PlayerMatchStats } from '../game/multiplayer';

declare global {
  interface Window {
    __benchResult?: Record<string, unknown>;
    __benchError?: string;
  }
}

const params = new URLSearchParams(window.location.search);
const mapId = params.get('map') ?? 'arena';
const views = Math.max(1, Math.min(8, Number(params.get('views') ?? 1)));
const seconds = Math.max(3, Math.min(60, Number(params.get('seconds') ?? 10)));
const players = 8;

const pokemonIds = ['0025', '0004', '0007', '0001', '0094', '0133', '0448', '0658'];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function configsFor(): MatchPlayerConfig[] {
  return Array.from({ length: players }, (_, index) => {
    const team = index < players / 2 ? 'red' : 'blue';
    const isHuman = index < views;
    return {
      slot: index,
      name: isHuman ? `J${index}` : `Bot${index}`,
      deviceId: isHuman ? `bench-${index}` : `bot-${index}`,
      deviceKind: 'gamepad',
      team,
      pokemonId: pokemonIds[index % pokemonIds.length],
      commonAbilityId: 'proteccion',
      isBot: !isHuman,
      botDifficulty: isHuman ? undefined : 'normal'
    };
  });
}

async function measure(): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%';
  document.body.appendChild(canvas);

  let readyResolve: (() => void) | null = null;
  const ready = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });

  const game = await Game.create(
    canvas,
    {
      onReady: () => readyResolve?.(),
      onProgress: () => {},
      onError: (message) => {
        window.__benchError = message;
      },
      onDevicesChanged: () => {},
      onMenuInput: () => {},
      onPauseRequest: () => {},
      onMatchStats: (_stats: PlayerMatchStats[]) => {},
      onMatchEnd: () => {},
      onCountdown: () => {},
      onAtmosphere: () => {}
    },
    {
      mapId,
      modeId: 'tdm',
      modeSettings: { koTarget: 9999 },
      timeLimitSeconds: 0,
      atmosphereEnabled: false,
      pokemonIds,
      // El bench debe cargar las hojas con la misma densidad que la partida
      // real: es lo que mide el coste de memoria y de subida a GPU.
      humanViews: views
    }
  );

  await game.init();
  await ready;
  const started = game.startMatch(configsFor());
  if (!started) throw new Error('startMatch devolvió false');

  // Deja pasar la cuenta atrás y el primer calentamiento de shaders.
  await wait(4200);

  const deltas: number[] = [];
  let last = performance.now();
  const deadline = last + seconds * 1000;
  await new Promise<void>((resolve) => {
    const frame = (now: number) => {
      deltas.push(now - last);
      last = now;
      if (now >= deadline) resolve();
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  deltas.sort((a, b) => a - b);
  const p = (q: number) => deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * q))] ?? 0;
  const total = deltas.reduce((sum, value) => sum + value, 0);
  window.__benchResult = {
    mapId,
    views,
    players,
    seconds,
    frames: deltas.length,
    fps: deltas.length / (total / 1000),
    frameMs: total / Math.max(1, deltas.length),
    p50: p(0.5),
    p95: p(0.95),
    max: deltas[deltas.length - 1] ?? 0
  };

  game.dispose();
}

measure().catch((cause: unknown) => {
  window.__benchError = cause instanceof Error ? cause.message : String(cause);
  console.error(cause);
});
