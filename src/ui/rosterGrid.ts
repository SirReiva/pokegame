/**
 * Número de columnas de la rejilla del selector de Pokémon.
 *
 * Debe coincidir con los breakpoints de la rejilla en `RosterScreen.tsx`:
 * - ≥ 1051px → 4 columnas (layout a pantalla completa sin scroll)
 * - 761px - 1050px → 3 columnas (layout apilado)
 * - ≤ 760px → 2 columnas
 *
 * El cursor de mando/teclado usa este valor para moverse arriba y abajo por
 * la rejilla real, así que si cambias las columnas en el componente actualízalo aquí.
 */
export function rosterColumns(): number {
  if (typeof window === 'undefined') return 3;
  if (window.matchMedia('(min-width: 1051px)').matches) return 4;
  if (window.matchMedia('(min-width: 761px)').matches) return 3;
  return 2;
}
