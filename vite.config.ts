import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // En GitHub Pages el sitio se sirve desde /<repo>/. El workflow de despliegue
  // define PUBLIC_BASE_PATH; en local se mantiene la raíz.
  base: process.env.PUBLIC_BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
})
