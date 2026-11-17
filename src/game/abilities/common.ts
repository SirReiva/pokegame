import type { AnimationName } from '../types';
import type { CommonAbilityId } from '../core/abilities/common';
import { ability, registerAbility, type AbilityDef } from './base';

export type { CommonAbilityId } from '../core/abilities/common';

/* ------------------------------------------------------------------------- */
/* Instintos comunes                                                         */
/* ------------------------------------------------------------------------- */

export const DEFAULT_COMMON_ABILITY: CommonAbilityId = 'proteccion';

/** Segundos oculto que exige Regeneración antes de empezar a curar. */
export const REGENERATION_DELAY_SECONDS = 2;

/** PV por segundo que recupera Regeneración mientras siga oculto. */
export const REGENERATION_HP_PER_SECOND = 5;

export interface CommonAbilityOption {
  id: CommonAbilityId;
  name: string;
  /** Nombre corto para el HUD. */
  short: string;
  /** `true` si no ocupa tecla y se resuelve solo. */
  passive: boolean;
  /** Cooldown para el HUD; 0 en pasivas. */
  cooldown: number;
  description: string;
}

export const COMMON_ABILITY_OPTIONS: readonly CommonAbilityOption[] = [
  {
    id: 'proteccion',
    name: 'Protección',
    short: 'Protección',
    passive: false,
    cooldown: 8,
    description:
      'Reduce un 60 % todo el daño recibido durante 2 s, ralentiza un 12 % y te impide usar otras habilidades mientras está activo. Genera un escudo esférico del color del Pokémon.'
  },
  {
    id: 'impulso',
    name: 'Impulso',
    short: 'Impulso',
    passive: false,
    cooldown: 3,
    description:
      'Dash corto de 2,2 u hacia delante. Se detiene en enemigos y separadores.'
  },
  {
    id: 'regeneracion',
    name: 'Regeneración',
    short: 'Regeneración',
    passive: true,
    cooldown: 0,
    description:
      'Tras 2 s oculto, recupera 5 PV/s mientras siga oculto. Se corta al perder HP, ser visto, atacar o usar una habilidad.'
  }
];

export function commonAbilityOption(
  id: CommonAbilityId
): CommonAbilityOption | null {
  return COMMON_ABILITY_OPTIONS.find((option) => option.id === id) ?? null;
}

export function isCommonAbilityId(value: string): value is CommonAbilityId {
  return COMMON_ABILITY_OPTIONS.some((option) => option.id === value);
}

/**
 * Habilidades comunes activas. `regeneracion` es pasiva y no tiene definición
 * de casteo; su lógica vive en el bucle de `Game`.
 */
/**
 * Overrides de animación por Pokémon. Sin entrada se usa la animación de la
 * definición; `null` desactiva la animación. Por defecto está vacío: Protección
 * no reproduce ninguna y Impulso usa `quickstrike`.
 */
export const COMMON_ANIMATION_OVERRIDES: Record<
  string,
  Partial<Record<CommonAbilityId, AnimationName | null>>
> = {};

export function commonAnimationFor(
  pokemonId: string,
  abilityId: CommonAbilityId,
  def: AbilityDef
): AnimationName | null {
  const override = COMMON_ANIMATION_OVERRIDES[pokemonId]?.[abilityId];
  return override === undefined ? def.animation : override;
}

export const COMMON_ABILITIES: Record<CommonAbilityId, AbilityDef | null> = {
  proteccion: registerAbility(
    ability('proteccion', 'Protección', 'Normal', 'status', 'self')
      .cooldown(8)
      .radius(1)
      .recovery(0.15)
      .shield(2, 0.6, 0.88)
      .preserveMomentum()
      .animation(null)
      .color(220, 240, 255)
      .description(
        'Reduce un 60 % todo el daño recibido durante 2 s, ralentiza un 12 % y bloquea el uso de otras habilidades mientras está activo. El escudo esférico usa el color del Pokémon.'
      )
  ),
  impulso: registerAbility(
    ability('impulso', 'Impulso', 'Normal', 'status', 'dash')
      .cooldown(3)
      .dash(2.2)
      .dashBlocksOnEnemies()
      .active(0.2)
      .recovery(0)
      .animation('quickstrike')
      .color(210, 235, 255)
      .description(
        'Dash corto de 2,2 u hacia delante. No hace daño y se detiene al chocar con enemigos o separadores.'
      )
  ),
  regeneracion: null
};
