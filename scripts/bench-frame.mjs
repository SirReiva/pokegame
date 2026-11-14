#!/usr/bin/env node
/**
 * Benchmark de frame real con Chrome headless.
 *
 * Requiere `pnpm build` previo. Levanta `vite preview`, abre
 * `performance/bench.html` con Chrome headless y lee `window.__benchResult`.
 *
 * Uso:
 *   node scripts/bench-frame.mjs --map caldera --views 8 --seconds 10
 *   node scripts/bench-frame.mjs --all
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--all') args.set('all', 'true');
  else if (arg.startsWith('--')) args.set(arg.slice(2), process.argv[++i]);
}

const chromePath =
  args.get('chrome') ??
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const previewPort = Number(args.get('port') ?? 4173);
const debugPort = Number(args.get('debug-port') ?? 9222);
const seconds = Number(args.get('seconds') ?? 10);
const useGpu = args.has('gpu');
const scenarios = args.has('all')
  ? ['arena', 'caldera', 'perf-256'].flatMap((map) =>
      [1, 4, 8].map((views) => ({ map, views }))
    )
  : [{ map: args.get('map') ?? 'arena', views: Number(args.get('views') ?? 1) }];

const tempProfile = mkdtempSync(path.join(os.tmpdir(), 'newpoke-bench-'));
const processes = [];

function kill(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], {
      stdio: 'ignore'
    });
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      /* ignore */
    }
  }
}

async function waitFor(url, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      /* ignore */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timeout esperando ${url}`);
}

function json(url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (cause) {
          reject(cause);
        }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

async function runScenario(chrome, scenario) {
  const url =
    `http://127.0.0.1:${previewPort}/performance/bench.html` +
    `?map=${encodeURIComponent(scenario.map)}` +
    `&views=${scenario.views}&seconds=${seconds}`;
  const tab = await json(
    `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`,
    'PUT'
  );
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();
  const eventWaiters = new Map();

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const waitEvent = (method, timeoutMs = 20000) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout ${method}`)), timeoutMs);
      const list = eventWaiters.get(method) ?? [];
      list.push((params) => {
        clearTimeout(timer);
        resolve(params);
      });
      eventWaiters.set(method, list);
    });

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) {
      if (message.method) {
        const list = eventWaiters.get(message.method);
        if (list?.length) {
          const waiter = list.shift();
          if (waiter) waiter(message.params);
        }
      }
      return;
    }
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  await send('Page.enable');
  await send('Runtime.enable');
  const loaded = waitEvent('Page.loadEventFired');
  await send('Page.navigate', { url });
  await loaded;

  const expression = `(async () => {
    const started = Date.now();
    while (Date.now() - started < 240000) {
      if (window.__benchError) return { error: window.__benchError };
      if (window.__benchResult) return { result: window.__benchResult };
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return { error: 'timeout' };
  })()`;

  const response = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  ws.close();
  await fetch(`http://127.0.0.1:${debugPort}/json/close/${tab.id}`, {
    method: 'PUT'
  }).catch(() => {});
  const value = response.result?.value;
  if (!value || value.error) {
    throw new Error(`${scenario.map}/${scenario.views}v: ${value?.error ?? 'sin resultado'}`);
  }
  return value.result;
}

async function main() {
  const preview = spawn(
    process.execPath,
    [
      path.join('node_modules', 'vite', 'bin', 'vite.js'),
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(previewPort),
      '--strictPort'
    ],
    { cwd: process.cwd(), stdio: 'ignore' }
  );
  processes.push(preview);
  await waitFor(`http://127.0.0.1:${previewPort}/`);

  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      ...(useGpu
        ? ['--enable-gpu']
        : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
      '--window-size=1280,720',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${tempProfile}`,
      'about:blank'
    ],
    { stdio: 'ignore' }
  );
  processes.push(chrome);
  await waitFor(`http://127.0.0.1:${debugPort}/json/version`);

  const results = [];
  for (const scenario of scenarios) {
    console.log(`Midiendo ${scenario.map} · ${scenario.views} vista(s)…`);
    results.push(await runScenario(chrome, scenario));
  }

  console.log('\n| Mapa | Vistas | FPS | frame ms | p50 | p95 | max |');
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const result of results) {
    console.log(
      `| ${result.mapId} | ${result.views} | ${result.fps.toFixed(1)} | ` +
        `${result.frameMs.toFixed(2)} | ${result.p50.toFixed(2)} | ` +
        `${result.p95.toFixed(2)} | ${result.max.toFixed(2)} |`
    );
  }
}

main()
  .catch((cause) => {
    console.error(cause);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const child of processes) kill(child.pid);
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      rmSync(tempProfile, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200
      });
    } catch {
      /* Chrome puede seguir soltando el perfil; no invalida la medición. */
    }
  });
