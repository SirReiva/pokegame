import { spawnSync } from 'node:child_process';

/**
 * Lanza pnpm para el frontend de escritorio.
 *
 * Fuerza `PUBLIC_BASE_PATH="/"` porque Wails sirve `dist/` (o el servidor de
 * Vite) desde la raíz. La versión web se sigue compilando con `pnpm build`
 * directamente, así que el workflow de GitHub Pages no se ve afectado.
 *
 * Uso:
 *   node scripts/desktop-frontend.mjs build
 *   node scripts/desktop-frontend.mjs build:dev
 *   node scripts/desktop-frontend.mjs dev --port 9245 --strictPort
 */
const [mode = 'build', ...extraArgs] = process.argv.slice(2);
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const args = mode === 'dev' ? ['dev', ...extraArgs] : ['run', mode];

const result = spawnSync(pnpm, args, {
  stdio: 'inherit',
  // En Windows pnpm es un .cmd y Node no puede ejecutarlo sin shell.
  shell: process.platform === 'win32',
  env: { ...process.env, PUBLIC_BASE_PATH: '/' },
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
