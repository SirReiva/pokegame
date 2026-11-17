/**
 * Catálogo de habilidades y asignación por Pokémon.
 *
 * La geometría y el comportamiento de cada habilidad viven en los módulos de
 * `abilities/`; este archivo es el índice que registra el catálogo completo,
 * aplica los números de `KIT_BALANCE` y construye los movesets finales.
 *
 * El motor lee las definiciones en tiempo de ejecución. Para añadir una
 * habilidad nueva basta con registrarla en su módulo y asignarla en
 * `MOVESETS`; no hay que tocar la lógica de combate mientras use una de las
 * formas soportadas (melee, projectile, beam, aoe, dash o self).
 */

import { ABILITIES, type AbilityDef, type AbilityId } from './abilities/base';

export * from './abilities/base';
export * from './abilities/common';

// Los módulos de definiciones se evalúan por su efecto: registran habilidades
// en `ABILITIES` al importarse.
import './abilities/roster/a';
import './abilities/roster/b';
import './abilities/roster/c';
import './abilities/roster/kits';

/**
 * Moveset base por id de Pokédex: [básica, habilidad 1, habilidad 2, definitiva].
 * `null` deja el hueco vacío. Los ids son la geometría y el comportamiento;
 * `KIT_BALANCE` aplica los números finales de `balance.md` y crea una variante
 * única por especie y slot. Así dos especies pueden compartir una habilidad con
 * potencias distintas sin duplicar definiciones.
 */
export const MOVESETS: Record<
  string,
  [AbilityId | null, AbilityId | null, AbilityId | null, AbilityId | null]
> = {
  '0001': ['semilladora', 'drenadoras', 'raicesEnredadoras', 'floracion'],
  '0004': ['aranazo', 'giroFuego', 'lanzallamas', 'anilloIgneo'],
  '0007': ['pistolaAgua', 'acuaJet', 'veloDeAgua', 'hidrobomba'],
  '0025': ['placaje', 'impactrueno', 'ataqueRapido', 'rayo'],
  '0059': ['mordisco', 'velocidadExtrema', 'colmilloIgneo', 'enviteIgneo'],
  '0094': ['lenguetazo', 'bolaSombra', 'bombaLodo', 'comeSuenos'],
  '0095': ['atadura', 'lanzarrocas', 'excavar', 'fisura'],
  '0100': ['rodamiento', 'rodar', 'ondaTruenoCircular', 'explosion'],
  '0123': ['golpeFuria', 'corteAereo', 'danzaEspada', 'tijeraX'],
  '0130': ['acuaCola', 'cascada', 'dragoaliento', 'hidrotormenta'],
  '0133': ['placajeEevee', 'adaptacion', 'ataqueRapidoEevee', 'ultimoRecurso'],
  '0144': ['golpeAla', 'rayoHielo', 'vientoGelido', 'ventisca'],
  '0145': ['electropico', 'ondaTruenoZapdos', 'descarga', 'trueno'],
  '0146': ['ataqueAereo', 'tajoAereo', 'ondaIgnea', 'ataqueCeleste'],
  '0150': ['telequinesis', 'teletransporte', 'psiquico', 'psicoataque'],
  '0151': ['psicogolpe', 'mimica', 'agilidad', 'recuperacion'],
  '0243': ['colmilloTrueno', 'rayoFulminante', 'rugidoTormenta', 'cazaRelampago'],
  '0244': ['garraVolcanica', 'embestidaVolcanica', 'estallido', 'caldera'],
  '0245': ['golpeCuerpo', 'veloAurora', 'chorroAgua', 'auroraBoreal'],
  '0248': ['triturar', 'avalancha', 'terremoto', 'rocaAfilada'],
  '0249': ['ondaMental', 'marea', 'ciclon', 'aerochorro'],
  '0250': ['golpeAlaHoOh', 'pajaroOsado', 'recuperacionHoOh', 'fuegoSagrado'],
  '0251': ['hojaMagica', 'rayoSolar', 'deseo', 'futuroSiniestro'],
  '0382': ['rafagaMarina', 'remolinoMarino', 'aguasCurativas', 'pulsoPrimigenio'],
  '0383': ['cuchillada', 'terremoto', 'filoAbismo', 'erupcionPrimigenia'],
  '0384': ['garraDraco', 'vueloDraco', 'furiaDraco', 'ascensoDraco'],
  '0448': ['garraMetal', 'velocidadExtrema', 'esferaAura', 'combateCercano'],
  '0658': ['shurikenAgua', 'tajoUmbro', 'sombraVil', 'pulsoUmbro']
};

/**
 * Números de `balance.md` por especie y slot:
 * `[potencia, enfriamiento, armadura, extra?]`.
 *
 * En áreas `overTime` la potencia es **daño por segundo** (el motor multiplica
 * por `aoeDuration`); por eso algunas entradas usan `dps(total, duración)`.
 * Las definitivas y las instantáneas usan la potencia total de la tabla.
 */
type SlotTuning = readonly [
  power: number,
  cooldown: number,
  armor: number,
  extra?: Partial<Omit<AbilityDef, 'id' | 'name' | 'type' | 'category'>>
];

const dps = (total: number, duration: number): number => total / duration;

const KIT_BALANCE: Record<
  string,
  readonly [SlotTuning, SlotTuning, SlotTuning, SlotTuning]
> = {
  '0001': [[45, 0.7, 0], [80, 8, 0], [dps(60, 2.5), 9, 0], [dps(110, 2.5), 16, 30]],
  '0004': [[40, 0.6, 0], [dps(70, 2.4), 6, 25], [80, 6.5, 0], [110, 14, 40]],
  '0007': [[50, 0.65, 0], [70, 7, 20], [0, 11, 25], [140, 15, 40]],
  '0025': [[40, 0.55, 0], [65, 6, 10], [50, 7, 15], [125, 15, 35]],
  '0059': [[50, 0.6, 0], [55, 7, 20], [95, 8, 15], [150, 15, 35]],
  '0094': [[48, 0.6, 0], [85, 7, 10], [dps(85, 2.5), 9, 15], [120, 15, 40]],
  '0095': [[55, 0.8, 0], [55, 4.5, 10], [65, 10, 0], [130, 14, 40]],
  '0100': [[40, 0.6, 0], [55, 6, 15], [65, 8, 20], [170, 16, 40, { selfDamage: 0.2 }]],
  '0123': [[40, 0.5, 0], [55, 6.5, 15], [0, 11, 20], [150, 14, 40]],
  '0130': [
    [50, 0.75, 0],
    [60, 5.5, 20],
    [
      75,
      8,
      20,
      {
        shape: 'aoe',
        aoeShape: 'cone',
        range: 0,
        radius: 4.5,
        halfAngle: 55,
        aoeDamageMode: 'instant',
        aoeDuration: 0.5,
        slow: { multiplier: 0.7, duration: 2 }
      }
    ],
    [dps(140, 4), 16, 40]
  ],
  '0133': [[45, 0.55, 0], [0, 8, 0], [60, 7, 15], [120, 15, 30]],
  '0144': [[45, 0.55, 0], [95, 7, 10], [55, 8, 20], [135, 16, 40]],
  '0145': [[42, 0.65, 0], [60, 8, 0], [75, 8, 0], [140, 15, 40]],
  '0146': [[45, 0.6, 0], [55, 7, 20], [60, 8, 20], [110, 15, 40]],
  '0150': [[42, 0.7, 0], [0, 6, 15], [90, 7, 10], [125, 15, 40]],
  '0151': [[40, 0.5, 0], [65, 9, 0], [0, 8, 15], [0, 15, 40]],
  '0243': [[50, 0.6, 0], [70, 8, 20], [0, 12, 0], [150, 16, 40]],
  '0244': [[55, 0.8, 0], [70, 8, 25], [90, 9, 20], [dps(90, 3), 16, 40]],
  '0245': [[48, 0.6, 0], [0, 10, 20], [70, 8, 20], [0, 18, 40]],
  '0248': [[58, 0.85, 0], [55, 6, 10], [dps(65, 2.5), 9, 0], [140, 15, 40]],
  '0249': [[46, 0.85, 0], [dps(40, 2.5), 9, 20], [dps(110, 2.5), 9, 25], [120, 16, 40]],
  '0250': [
    [48, 0.6, 0],
    [75, 8, 30, { selfDamage: 0.1 }],
    [0, 13, 40],
    [dps(160, 3), 17, 40, { aoeDuration: 3 }]
  ],
  '0251': [[40, 0.75, 0], [110, 8, 20], [0, 12, 40], [150, 16, 40]],
  '0382': [[46, 0.7, 0], [dps(110, 2.5), 8, 25], [0, 12, 40], [200, 16, 50]],
  '0383': [[58, 0.85, 0], [dps(55, 2.5), 9, 30], [65, 10, 30], [90, 16, 40]],
  '0384': [[50, 0.7, 0], [60, 6, 20], [75, 9, 35], [110, 16, 40]],
  '0448': [[45, 0.6, 0], [55, 7, 20], [70, 8, 20], [110, 15, 40]],
  '0658': [[36, 0.55, 0], [60, 1.4, 0], [50, 7, 15], [80, 15, 35]]
};

/** Separador de las variantes afinadas: `<pokemon>/<habilidadBase>`. */
const TUNED_SEPARATOR = '/';

/**
 * Id base de una habilidad afinada. El audio y los assets indexan por el id del
 * catálogo original; con esto una variante de balance sigue sonando igual que
 * su habilidad base.
 */
export function baseAbilityId(id: string): string {
  const index = id.lastIndexOf(TUNED_SEPARATOR);
  return index < 0 ? id : id.slice(index + 1);
}

const tunedIdsCache = new Map<string, string>();

function tunedAbility(
  pokemonId: string,
  baseId: string,
  tuning: SlotTuning
): string {
  const cacheKey = `${pokemonId}${TUNED_SEPARATOR}${baseId}`;
  const cached = tunedIdsCache.get(cacheKey);
  if (cached) return cached;

  const base = ABILITIES[baseId];
  if (!base) return baseId;

  const [power, cooldown, armor, extra] = tuning;
  const id = cacheKey;
  const merged = { ...base, ...extra };
  ABILITIES[id] = {
    ...merged,
    id,
    power,
    cooldown,
    armorPool: armor,
    // Una habilidad instantánea o un dash sin preparación no tiene ventana de
    // `startup`: si lleva armadura, debe cubrir todo el casteo para que exista.
    armorWindow:
      armor > 0 && merged.startup <= 0 ? 'cast' : merged.armorWindow,
    // El balance usa una cadencia fija para las básicas; la rampa por repetición
    // queda fuera del rediseño.
    repeatCooldown: null
  };
  tunedIdsCache.set(cacheKey, id);
  return id;
}

for (const [pokemonId, moveset] of Object.entries(MOVESETS)) {
  const tuning = KIT_BALANCE[pokemonId];
  if (!tuning) continue;
  for (let slot = 0; slot < moveset.length; slot++) {
    const baseId = moveset[slot];
    if (!baseId) continue;
    moveset[slot] = tunedAbility(pokemonId, baseId, tuning[slot]);
  }
}

export function abilityForSlot(
  pokemonId: string,
  slotIndex: number
): AbilityDef | null {
  const moveset = MOVESETS[pokemonId];
  const id = moveset?.[slotIndex] ?? null;
  return id ? (ABILITIES[id] ?? null) : null;
}

/**
 * ¿El Pokémon tiene al menos una habilidad realmente definida en su moveset?
 * Los que todavía no tienen movimientos asignados no se pueden elegir en el
 * carrusel del roster.
 */
export function hasAssignedAbilities(pokemonId: string): boolean {
  const moveset = MOVESETS[pokemonId];
  if (!moveset) return false;
  return moveset.some((id) => id !== null && ABILITIES[id] !== undefined);
}
