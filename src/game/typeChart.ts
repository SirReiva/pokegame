/**
 * Puente de compatibilidad: la tabla de tipos vive en `core/typeChart.ts`.
 *
 * Se conserva este módulo para no romper los imports existentes de la capa
 * `game` mientras terminan de migrarse.
 */

export * from './core/typeChart';
