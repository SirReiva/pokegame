/**
 * Resuelve rutas de `public/` contra el `base` de Vite.
 *
 * En GitHub Pages el sitio se sirve desde `/<repo>/`, no desde la raíz del
 * dominio. Cualquier ruta absoluta del tipo `/sprites/0001/idle.png` acabaría
 * en `https://<usuario>.github.io/sprites/...` (404). Por eso las rutas que
 * vienen de JSON (manifiesto de sprites, mapas...) deben pasar por aquí.
 *
 * Se dejan intactas las URLs absolutas (`http:`, `https:`, `data:`, `blob:`,
 * `//cdn...`) y las rutas ya relativas.
 */
const BASE_URL = import.meta.env.BASE_URL;

export function publicUrl(path: string): string {
  if (/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(path)) return path;
  return `${BASE_URL}${path.replace(/^\/+/, '')}`;
}
