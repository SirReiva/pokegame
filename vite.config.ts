import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  // En GitHub Pages el sitio se sirve desde /<repo>/. El workflow de despliegue
  // define PUBLIC_BASE_PATH; en local se mantiene la raíz. Vite exige que el
  // base termine en "/", así que se normaliza aquí.
  base: normalizeBase(process.env.PUBLIC_BASE_PATH),
  // La versión del package.json se lee en build time y se inyecta en el bundle.
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
  },
  plugins: [react(), tailwindcss()],
});

function normalizeBase(value: string | undefined): string {
  const base = value?.trim() || "/";
  return base.endsWith("/") ? base : `${base}/`;
}
