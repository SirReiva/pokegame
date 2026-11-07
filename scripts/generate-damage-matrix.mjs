/**
 * Genera la tabla de daño por Pokémon y ataque contra el resto del roster.
 *
 * Uso: node scripts/generate-damage-matrix.mjs
 * Salida: docs/tabla-danos-por-ataque.md
 *
 * Carga los módulos TypeScript del juego con Vite (SSR) para usar exactamente
 * la fórmula, los tipos y los movesets reales, sin duplicar constantes.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom'
});

try {
  const { MOVESETS, abilityForSlot } = await server.ssrLoadModule(
    '/src/game/abilities.ts'
  );
  const { baseStatsFor, combatStatsFor } = await server.ssrLoadModule(
    '/src/game/pokedex.ts'
  );
  const { computeDamage } = await server.ssrLoadModule('/src/game/combat.ts');
  const { typeEffectiveness } = await server.ssrLoadModule(
    '/src/game/typeChart.ts'
  );

  const manifest = JSON.parse(
    readFileSync(join(root, 'public/sprites/manifest.json'), 'utf8')
  );
  const roster = manifest.pokemon.map((entry) => ({
    ...entry,
    stats: combatStatsFor(baseStatsFor(entry.id))
  }));
  const byId = new Map(roster.map((entry) => [entry.id, entry]));

  const CRIT_CHANCE = 1 / 24;
  const RANDOM_FACTOR = 0.925;

  /** Esperanza de daño de un impacto, con crítico y precisión. */
  function expectedHit(attacker, defender, def, power) {
    if (power <= 0 || def.category === 'status') return 0;
    const base = {
      moveType: def.type,
      category: def.category,
      power,
      attacker: attacker.stats,
      defender: defender.stats,
      attackerTypes: attacker.types,
      defenderTypes: defender.types,
      randomFactor: RANDOM_FACTOR
    };
    const normal = computeDamage({ ...base, critical: false }).damage;
    const critical = computeDamage({ ...base, critical: true }).damage;
    const perHit = normal * (1 - CRIT_CHANCE) + critical * CRIT_CHANCE;
    const accuracy = def.accuracy > 0 ? def.accuracy / 100 : 1;
    return perHit * accuracy;
  }

  /** Daño total esperado de un lanzamiento completo de la habilidad. */
  function expectedCast(attacker, defender, def) {
    if (def.power <= 0 || def.category === 'status') return 0;
    if (def.shape === 'aoe' && def.aoeDamageMode === 'overTime') {
      const interval = Math.max(0.05, Math.min(def.aoeTickInterval, def.aoeDuration));
      const ticks = Math.ceil(def.aoeDuration / interval);
      return expectedHit(attacker, defender, def, def.power * interval) * ticks;
    }
    return expectedHit(attacker, defender, def, def.power);
  }

  const CATEGORY_LABEL = {
    physical: 'Fís',
    special: 'Esp',
    status: 'Estado'
  };
  const SLOT_LABEL = ['Básica', 'Habilidad 1', 'Habilidad 2', 'Definitiva'];

  function multiplierLabel(multiplier) {
    if (multiplier === 0) return '×0';
    if (multiplier === 0.25) return '×¼';
    if (multiplier === 0.5) return '×½';
    if (multiplier === 1) return '×1';
    if (multiplier === 2) return '×2';
    if (multiplier === 4) return '×4';
    return `×${multiplier}`;
  }

  /** Mediana de una lista; con un número par promedia los dos centrales. */
  function median(values) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = sorted.length >> 1;
    return sorted.length % 2 === 1
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  /** Rivales de un atacante, sin contar el mirror. */
  function rivalsOf(attacker) {
    return roster.filter((target) => target.id !== attacker.id);
  }

  /** Mediana del daño de un ataque contra todos los rivales. */
  function medianDamage(attacker, def) {
    if (!def || def.power <= 0 || def.category === 'status') return null;
    return median(
      rivalsOf(attacker).map((rival) => expectedCast(attacker, rival, def))
    );
  }

  /** Mediana de la efectividad de un ataque contra todos los rivales. */
  function medianEffectiveness(attacker, def) {
    if (!def) return null;
    return median(
      rivalsOf(attacker).map((rival) =>
        typeEffectiveness(def.type, rival.types)
      )
    );
  }

  /** Mediana del daño combinado de los cuatro ataques contra cada rival. */
  function medianCombo(attacker, defs) {
    return median(
      rivalsOf(attacker).map((rival) =>
        defs.reduce(
          (total, def) => total + (def ? expectedCast(attacker, rival, def) : 0),
          0
        )
      )
    );
  }

  function formatCell(attacker, defender, def) {
    if (attacker.id === defender.id) return '—';
    const multiplier = typeEffectiveness(def.type, defender.types);
    if (def.power <= 0 || def.category === 'status') {
      return multiplier === 0 ? 'Estado (×0)' : 'Estado';
    }
    const damage = expectedCast(attacker, defender, def);
    return `${Math.round(damage)} ${multiplierLabel(multiplier)}`;
  }

  const attackerIds = Object.keys(MOVESETS).filter((id) =>
    [0, 1, 2, 3].some((slot) => abilityForSlot(id, slot))
  );

  const targets = roster;
  const lines = [];

  lines.push('# Tabla de daño por Pokémon y ataque');
  lines.push('');
  lines.push(
    '> Generado automáticamente por `node scripts/generate-damage-matrix.mjs` ' +
      'a partir de `abilities.ts`, `pokedex.ts`, `combat.ts`, `typeChart.ts` y ' +
      'el manifiesto de sprites. No editar a mano.'
  );
  lines.push('');
  lines.push('## Cómo leer las tablas');
  lines.push('');
  lines.push(
    '- **Agrupación**: una sección por Pokémon atacante y una fila por rival. ' +
      'Cada columna es uno de sus cuatro ataques.'
  );
  lines.push(
    '- **Celda**: daño esperado de un lanzamiento completo y, al lado, la ' +
      'efectividad de ese tipo contra el rival.'
  );
  lines.push(
    '- **Daño esperado**: nivel 50, IV 31, EV 0, naturaleza neutra, sin buffs, ' +
      'random medio 0,925, crítico 1/24 (×1,5) y precisión aplicada. STAB incluido.'
  );
  lines.push(
    '- **Áreas**: se valoran con el rival en el centro (100 %). En el borde el ' +
      'daño radial baja hasta `radialMinDamage`.'
  );
  lines.push(
    '- **Áreas `overTime`**: el total suma todos los ticks ' +
      '(`ceil(duración / intervalo)`) con potencia por tick = `power × intervalo`.'
  );
  lines.push(
    '- **Estado**: la habilidad no hace daño. `Estado (×0)` indica que el tipo ' +
      'es inmune y el estado tampoco se aplica.'
  );
  lines.push(
    '- **—**: el rival es el propio atacante (no se calcula el mirror).'
  );
  lines.push(
    '- **Mediana**: valor central del daño esperado contra los 24 rivales ' +
      '(con un número par, media de los dos centrales). La fila de efectividad ' +
      'mediana resume el matchup típico del ataque.'
  );
  lines.push(
    '- Son una **cota superior**: suponen que la habilidad conecta y que el ' +
      'rival no esquiva ni sale del área.'
  );
  lines.push('');
  lines.push('**Efectividades**: ×0 inmune · ×¼ doble resistencia · ×½ resiste · ' +
    '×1 neutro · ×2 débil · ×4 doble debilidad.');
  lines.push('');

  lines.push('## Índice');
  lines.push('');
  for (const id of attackerIds) {
    const pokemon = byId.get(id);
    const anchor = pokemon.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    lines.push(`- [${pokemon.name}](#${anchor})`);
  }
  lines.push('');

  for (const id of attackerIds) {
    const attacker = byId.get(id);
    if (!attacker) continue;

    lines.push(`## ${attacker.name}`);
    lines.push('');
    lines.push(
      `Tipos: **${attacker.types.join(' / ')}** · ` +
        `HP ${attacker.stats.hp} · Atk ${attacker.stats.attack} · ` +
        `Def ${attacker.stats.defense} · SpA ${attacker.stats.spAttack} · ` +
        `SpD ${attacker.stats.spDefense} · Vel ${attacker.stats.speed}`
    );
    lines.push('');

    const defs = [0, 1, 2, 3].map((slot) => abilityForSlot(id, slot));
    const headers = defs.map((def, slot) => {
      if (!def) return `${SLOT_LABEL[slot]}<br>Sin asignar`;
      const perSecond =
        def.shape === 'aoe' && def.aoeDamageMode === 'overTime';
      const power =
        def.category === 'status'
          ? '—'
          : `${def.power}${perSecond ? '/s' : ''}`;
      return (
        `${SLOT_LABEL[slot]}: ${def.name}<br>` +
        `${def.type} · ${CATEGORY_LABEL[def.category]} · Pot ${power}`
      );
    });

    lines.push(`| Rival | ${headers.join(' | ')} |`);
    lines.push(`| --- | ${defs.map(() => '---:').join(' | ')} |`);

    for (const defender of targets) {
      if (defender.id === attacker.id) continue;
      const cells = defs.map((def) =>
        def ? formatCell(attacker, defender, def) : '—'
      );
      lines.push(`| ${defender.name} | ${cells.join(' | ')} |`);
    }

    const medianCells = defs.map((def) => {
      const value = medianDamage(attacker, def);
      return value === null ? '—' : `${Math.round(value)}`;
    });
    lines.push(`| **Mediana de daño** | ${medianCells.join(' | ')} |`);

    const effectivenessCells = defs.map((def) => {
      const value = medianEffectiveness(attacker, def);
      return value === null ? '—' : multiplierLabel(value);
    });
    lines.push(
      `| **Efectividad mediana** | ${effectivenessCells.join(' | ')} |`
    );
    lines.push('');
  }

  lines.push('## Medianas por Pokémon');
  lines.push('');
  lines.push(
    'Resumen de las medianas de cada sección. `Combo` es la mediana del daño ' +
      'de los cuatro ataques sumados contra cada rival; las habilidades de ' +
      'estado cuentan como 0 en esa columna.'
  );
  lines.push('');
  lines.push(
    '| Pokémon | Básica | Habilidad 1 | Habilidad 2 | Definitiva | Combo |'
  );
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const id of attackerIds) {
    const attacker = byId.get(id);
    if (!attacker) continue;
    const defs = [0, 1, 2, 3].map((slot) => abilityForSlot(id, slot));
    const cells = defs.map((def) => {
      const value = medianDamage(attacker, def);
      return value === null ? '—' : `${Math.round(value)}`;
    });
    const combo = Math.round(medianCombo(attacker, defs));
    lines.push(`| ${attacker.name} | ${cells.join(' | ')} | ${combo} |`);
  }
  lines.push('');

  const withoutMoveset = roster.filter(
    (pokemon) => !attackerIds.includes(pokemon.id)
  );
  if (withoutMoveset.length > 0) {
    lines.push('## Pokémon sin moveset');
    lines.push('');
    lines.push(
      'Estas especies del roster todavía no tienen ataques asignados en ' +
        '`MOVESETS`, así que no pueden usarse como atacantes. Sí aparecen como ' +
        'rivales en las tablas anteriores porque el daño recibido solo depende ' +
        'de sus tipos y estadísticas.'
    );
    lines.push('');
    lines.push('| Pokémon | Tipos |');
    lines.push('| --- | --- |');
    for (const pokemon of withoutMoveset) {
      lines.push(`| ${pokemon.name} | ${pokemon.types.join(' / ')} |`);
    }
    lines.push('');
  }

  lines.push('## Cobertura');
  lines.push('');
  lines.push(
    `Atacantes con moveset asignado: **${attackerIds.length}** de ` +
      `${roster.length} especies del roster. Los rivales incluyen las ` +
      `${roster.length} especies, tengan o no moveset, porque el daño solo ` +
      'depende de sus tipos y estadísticas.'
  );
  lines.push('');

  const output = join(root, 'docs/tabla-danos-por-ataque.md');
  writeFileSync(output, lines.join('\n'), 'utf8');
  console.log(`Escrito ${output} (${lines.length} líneas)`);

  /* ----------------------------------------------------------------------- */
  /* Tabla de daño por segundo (DPS) por habilidad                           */
  /* ----------------------------------------------------------------------- */

  /** Defensor sin tipos y con 100 en todo, para comparar habilidades. */
  const NEUTRAL_TARGET = {
    id: 'neutral',
    name: 'Objetivo neutro',
    types: [],
    stats: {
      hp: 100,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100
    }
  };

  /** Número con una decimal como máximo y coma decimal. */
  function formatNumber(value) {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded)
      ? String(rounded)
      : rounded.toFixed(1).replace('.', ',');
  }

  /** Cooldown con hasta dos decimales y coma decimal (0,25 s, 8 s, 0,9 s). */
  function formatCooldown(value) {
    const rounded = Math.round(value * 100) / 100;
    return String(rounded).replace('.', ',');
  }

  /**
   * DPS de una habilidad contra un defensor: daño esperado de un lanzamiento
   * completo dividido por su cooldown. El cooldown empieza al iniciar el
   * lanzamiento, así que es la cadencia máxima de la habilidad.
   */
  function dpsOf(attacker, defender, def) {
    if (!def || def.power <= 0 || def.category === 'status') return null;
    return expectedCast(attacker, defender, def) / Math.max(0.05, def.cooldown);
  }

  /** Mediana del DPS de un ataque contra todos los rivales. */
  function medianDps(attacker, def) {
    if (!def || def.power <= 0 || def.category === 'status') return null;
    return median(
      rivalsOf(attacker)
        .map((rival) => dpsOf(attacker, rival, def))
        .filter((value) => value !== null)
    );
  }

  const dpsLines = [];
  dpsLines.push('# Daño por segundo por Pokémon y habilidad');
  dpsLines.push('');
  dpsLines.push(
    '> Generado automáticamente por `node scripts/generate-damage-matrix.mjs` ' +
      'a partir de `abilities.ts`, `pokedex.ts`, `combat.ts`, `typeChart.ts` y ' +
      'el manifiesto de sprites. No editar a mano.'
  );
  dpsLines.push('');
  dpsLines.push('## Cómo leer las tablas');
  dpsLines.push('');
  dpsLines.push(
    '- **Agrupación**: una sección por Pokémon atacante y una fila por rival. ' +
      'Cada columna es uno de sus cuatro ataques.'
  );
  dpsLines.push(
    '- **Celda**: daño esperado por segundo (`daño de un lanzamiento / cooldown`). ' +
      'La efectividad de cada celda está en ' +
      '[`tabla-danos-por-ataque.md`](tabla-danos-por-ataque.md).'
  );
  dpsLines.push(
    '- **Cooldown**: es el valor de la definición de la habilidad y empieza al ' +
      'iniciar el lanzamiento. El DPS no descuenta el `startup`, el `active`, el ' +
      '`recovery` ni el tiempo de movimiento entre ataques, así que es una ' +
      '**cota superior**.'
  );
  dpsLines.push(
    '- **Daño esperado**: nivel 50, IV 31, EV 0, naturaleza neutra, sin buffs, ' +
      'random medio 0,925, crítico 1/24 (×1,5) y precisión aplicada. STAB incluido.'
  );
  dpsLines.push(
    '- **Áreas**: se valoran con el rival en el centro (100 %). En el borde el ' +
      'daño radial baja hasta `radialMinDamage`.'
  );
  dpsLines.push(
    '- **Áreas `overTime`**: el daño de un lanzamiento suma todos los ticks ' +
      '(`ceil(duración / intervalo)`) con potencia por tick = `power × intervalo`.'
  );
  dpsLines.push(
    '- **Estado**: la habilidad no hace daño; la celda muestra `Estado`.'
  );
  dpsLines.push(
    '- **—**: hueco sin asignar o valor que no aplica.'
  );
  dpsLines.push(
    '- **Mediana**: valor central del DPS contra los 24 rivales (con un número ' +
      'par, media de los dos centrales).'
  );
  dpsLines.push('');
  dpsLines.push('## Índice');
  dpsLines.push('');
  for (const id of attackerIds) {
    const pokemon = byId.get(id);
    const anchor = pokemon.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    dpsLines.push(`- [${pokemon.name}](#${anchor})`);
  }
  dpsLines.push('');

  for (const id of attackerIds) {
    const attacker = byId.get(id);
    if (!attacker) continue;

    dpsLines.push(`## ${attacker.name}`);
    dpsLines.push('');
    dpsLines.push(
      `Tipos: **${attacker.types.join(' / ')}** · ` +
        `HP ${attacker.stats.hp} · Atk ${attacker.stats.attack} · ` +
        `Def ${attacker.stats.defense} · SpA ${attacker.stats.spAttack} · ` +
        `SpD ${attacker.stats.spDefense} · Vel ${attacker.stats.speed}`
    );
    dpsLines.push('');

    const defs = [0, 1, 2, 3].map((slot) => abilityForSlot(id, slot));
    const headers = defs.map((def, slot) => {
      if (!def) return `${SLOT_LABEL[slot]}<br>Sin asignar`;
      const perSecond =
        def.shape === 'aoe' && def.aoeDamageMode === 'overTime';
      const power =
        def.category === 'status'
          ? '—'
          : `${def.power}${perSecond ? '/s' : ''}`;
      return (
        `${SLOT_LABEL[slot]}: ${def.name}<br>` +
        `${def.type} · ${CATEGORY_LABEL[def.category]} · Pot ${power} · ` +
        `CD ${formatCooldown(def.cooldown)} s`
      );
    });

    dpsLines.push(`| Rival | ${headers.join(' | ')} |`);
    dpsLines.push(`| --- | ${defs.map(() => '---:').join(' | ')} |`);

    for (const defender of targets) {
      if (defender.id === attacker.id) continue;
      const cells = defs.map((def) => {
        if (!def) return '—';
        if (def.power <= 0 || def.category === 'status') return 'Estado';
        return formatNumber(dpsOf(attacker, defender, def));
      });
      dpsLines.push(`| ${defender.name} | ${cells.join(' | ')} |`);
    }

    const medianCells = defs.map((def) => {
      const value = medianDps(attacker, def);
      return value === null ? '—' : formatNumber(value);
    });
    dpsLines.push(`| **Mediana de DPS** | ${medianCells.join(' | ')} |`);
    dpsLines.push('');
  }

  dpsLines.push('## DPS por habilidad contra un objetivo neutro');
  dpsLines.push('');
  dpsLines.push(
    'Objetivo sin tipos y con 100 en todas las estadísticas: sirve para ' +
      'comparar la potencia bruta de cada habilidad sin que el matchup de tipos ' +
      'distorsione el resultado. STAB incluido.'
  );
  dpsLines.push('');
  dpsLines.push(
    '| Pokémon | Básica | Habilidad 1 | Habilidad 2 | Definitiva | DPS sostenido |'
  );
  dpsLines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const id of attackerIds) {
    const attacker = byId.get(id);
    if (!attacker) continue;
    const defs = [0, 1, 2, 3].map((slot) => abilityForSlot(id, slot));
    const cells = defs.map((def) => {
      if (!def) return '—';
      const value = dpsOf(attacker, NEUTRAL_TARGET, def);
      return value === null ? `${def.name} —` : `${def.name} ${formatNumber(value)}`;
    });
    const total = defs.reduce(
      (sum, def) => sum + (dpsOf(attacker, NEUTRAL_TARGET, def) ?? 0),
      0
    );
    dpsLines.push(
      `| ${attacker.name} | ${cells.join(' | ')} | ${formatNumber(total)} |`
    );
  }
  dpsLines.push('');
  dpsLines.push(
    '**DPS sostenido** es la suma del DPS de las cuatro habilidades contra el ' +
      'objetivo neutro. Supone que se pueden encadenar sin solaparse; el bloqueo ' +
      'global de casteo hace que el valor real sea algo menor.'
  );
  dpsLines.push('');
  dpsLines.push(
    `Atacantes con moveset asignado: **${attackerIds.length}** de ` +
      `${roster.length} especies del roster.`
  );
  dpsLines.push('');

  const dpsOutput = join(root, 'docs/dps-por-habilidad.md');
  writeFileSync(dpsOutput, dpsLines.join('\n'), 'utf8');
  console.log(`Escrito ${dpsOutput} (${dpsLines.length} líneas)`);
} finally {
  await server.close();
}
