import type { CSSProperties } from 'react';

export const TYPE_COLORS: Record<string, string> = {
  Normal: '#a8a77a',
  Fire: '#ee8130',
  Water: '#6390f0',
  Electric: '#f7d02c',
  Grass: '#7ac74c',
  Ice: '#96d9d6',
  Fighting: '#c22e28',
  Poison: '#a33ea1',
  Ground: '#e2bf65',
  Flying: '#a98ff3',
  Psychic: '#f95587',
  Bug: '#a6b91a',
  Rock: '#b6a136',
  Ghost: '#735797',
  Dragon: '#6f35fc',
  Dark: '#705746',
  Steel: '#b7b7ce',
  Fairy: '#d685ad'
};

export const TYPE_LABELS: Record<string, string> = {
  Normal: 'Normal',
  Fire: 'Fuego',
  Water: 'Agua',
  Electric: 'Eléctrico',
  Grass: 'Planta',
  Ice: 'Hielo',
  Fighting: 'Lucha',
  Poison: 'Veneno',
  Ground: 'Tierra',
  Flying: 'Volador',
  Psychic: 'Psíquico',
  Bug: 'Bicho',
  Rock: 'Roca',
  Ghost: 'Fantasma',
  Dragon: 'Dragón',
  Dark: 'Siniestro',
  Steel: 'Acero',
  Fairy: 'Hada'
};

/** Abreviaturas para espacios muy estrechos, como el HUD de 5+ jugadores. */
export const TYPE_SHORT_LABELS: Record<string, string> = {
  Normal: 'NOR',
  Fire: 'FUE',
  Water: 'AGU',
  Electric: 'ELE',
  Grass: 'PLA',
  Ice: 'HIE',
  Fighting: 'LUC',
  Poison: 'VEN',
  Ground: 'TIE',
  Flying: 'VOL',
  Psychic: 'PSI',
  Bug: 'BIC',
  Rock: 'ROC',
  Ghost: 'FAN',
  Dragon: 'DRA',
  Dark: 'SIN',
  Steel: 'ACE',
  Fairy: 'HAD'
};

const LIGHT_TYPES = new Set(['Normal', 'Electric', 'Ice', 'Ground', 'Steel', 'Fairy']);

export function typeStyle(type: string): CSSProperties {
  const color = TYPE_COLORS[type] ?? '#8a93a6';
  return {
    background: color,
    color: LIGHT_TYPES.has(type) ? '#161a22' : '#ffffff'
  };
}
