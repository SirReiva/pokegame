import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Sincroniza la versión de `package.json` con los metadatos de escritorio.
 * Lo usa el workflow de release después de `pnpm version`.
 *
 * Uso: node scripts/set-desktop-version.mjs 0.8.2
 */
const version = process.argv[2];

if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error(`Versión inválida: ${version ?? '(vacía)'}. Se espera x.y.z`);
  process.exit(1);
}

function replaceInFile(path, pattern, replacement) {
  const content = readFileSync(path, 'utf8');
  if (!pattern.test(content)) {
    console.warn(`Aviso: no se encontró la versión en ${path}`);
    return;
  }
  writeFileSync(path, content.replace(pattern, replacement));
}

// `info.version` de build/config.yml (el `version: '3'` de arriba usa comillas simples).
replaceInFile('build/config.yml', /^(\s*version:\s*)"[^"]*"/m, `$1"${version}"`);

// Metadatos del .exe de Windows.
const infoPath = 'build/windows/info.json';
const info = JSON.parse(readFileSync(infoPath, 'utf8').replace(/^\uFEFF/, ''));
info.fixed.file_version = version;
for (const lang of Object.keys(info.info ?? {})) {
  info.info[lang].ProductVersion = version;
}
writeFileSync(infoPath, `${JSON.stringify(info, null, '\t')}\n`);

// Instalador NSIS.
replaceInFile(
  'build/windows/nsis/wails_tools.nsh',
  /(!define INFO_PRODUCTVERSION\s+)"[^"]*"/,
  `$1"${version}"`,
);

// Paquetes Linux (.deb / .rpm).
replaceInFile('build/linux/nfpm/nfpm.yaml', /^version:\s*"[^"]*"/m, `version: "${version}"`);

console.log(`Versión de escritorio actualizada a ${version}`);
