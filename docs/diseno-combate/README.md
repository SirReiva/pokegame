# Diseño de combate — Índice

Documento canónico del rediseño de combate de **newpoke**. Sustituye al chat
original como fuente de verdad.

## Estructura

```
docs/diseno-combate/
├── README.md          ← este índice
├── sistema.md         ← reglas comunes (v0.2)
├── balance.md         ← pasada numérica v1.1 (TTK, escala, poderes)
├── implementacion.md  ← estado real en el código y fase 2
└── pokemon/           ← una ficha por Pokémon
```

## Estado

- **Roster: 28 / 28 fichas cerradas.**
- **Sistema: v0.2 cerrada en concepto.**
- **Balance: v1.1 + ajustes v1.2.** Escala 100, PV de referencia 1.000, STAB
  eliminado, básicas especiales corregidas y bandas de TTK por rol. La v1.2
  ajusta Voltorb, Onix y Squirtle con pasivas activas. Ver
  [balance.md](balance.md).
- **Implementación: fases 1 y 2 completadas.** Núcleo determinista, 28 movesets,
  motor de estados (DoT, marcas, raíces, silencios, escudos, anti-heal, clones,
  ecos de haz y reflejo de control), las 28 pasivas, Mímica, Adaptabilidad y HUD
  de estados. El catálogo está dividido en módulos y Arcanine ya tiene sprites.
  Ver [implementacion.md](implementacion.md).
- **Números: los de `balance.md` mandan** cuando difieran de una ficha.
- **Código: fases 1 y 2 implementadas y aproximaciones cerradas.**

## Roster

| # | Pokémon | Tipos | Roles | Ficha |
|---|---|---|---|---|
| 1 | Bulbasaur | Planta / Veneno | Apoyo / Controlador | [01](pokemon/01-bulbasaur.md) |
| 2 | Charmander | Fuego | Luchador / Hostigador | [02](pokemon/02-charmander.md) |
| 3 | Squirtle | Agua | Tanque / Protector | [03](pokemon/03-squirtle.md) |
| 4 | Pikachu | Eléctrico | Asesino / Hostigador | [04](pokemon/04-pikachu.md) |
| 5 | Voltorb | Eléctrico | Hostigador / Mago | [05](pokemon/05-voltorb.md) |
| 6 | Eevee | Normal | Hostigador / Luchador | [06](pokemon/06-eevee.md) |
| 7 | Gengar | Fantasma / Veneno | Asesino / Mago | [07](pokemon/07-gengar.md) |
| 8 | Lucario | Lucha / Acero | Luchador / Duelista | [08](pokemon/08-lucario.md) |
| 9 | Greninja | Agua / Siniestro | Asesino / Hostigador | [09](pokemon/09-greninja.md) |
| 10 | Arcanine | Fuego | Luchador / Tanque | [10](pokemon/10-arcanine.md) |
| 11 | Mewtwo | Psíquico | Mago / Controlador | [11](pokemon/11-mewtwo.md) |
| 12 | Mew | Psíquico | Apoyo / Versátil | [12](pokemon/12-mew.md) |
| 13 | Onix | Roca / Tierra | Tanque / Controlador | [13](pokemon/13-onix.md) |
| 14 | Scyther | Bicho / Volador | Asesino / Duelista | [14](pokemon/14-scyther.md) |
| 15 | Gyarados | Agua / Volador | Luchador / Iniciador | [15](pokemon/15-gyarados.md) |
| 16 | Tyranitar | Roca / Siniestro | Tanque / Luchador | [16](pokemon/16-tyranitar.md) |
| 17 | Articuno | Hielo / Volador | Mago / Controlador | [17](pokemon/17-articuno.md) |
| 18 | Zapdos | Eléctrico / Volador | Mago / Hostigador | [18](pokemon/18-zapdos.md) |
| 19 | Moltres | Fuego / Volador | Mago / Asesino | [19](pokemon/19-moltres.md) |
| 20 | Raikou | Eléctrico | Asesino / Cazador | [20](pokemon/20-raikou.md) |
| 21 | Entei | Fuego | Luchador / Controlador | [21](pokemon/21-entei.md) |
| 22 | Suicune | Agua | Apoyo / Tanque | [22](pokemon/22-suicune.md) |
| 23 | Lugia | Psíquico / Volador | Tanque / Protector | [23](pokemon/23-lugia.md) |
| 24 | Ho-Oh | Fuego / Volador | Apoyo / Luchador | [24](pokemon/24-ho-oh.md) |
| 25 | Celebi | Psíquico / Planta | Apoyo / Controlador | [25](pokemon/25-celebi.md) |
| 26 | Kyogre | Agua | Mago / Apoyo | [26](pokemon/26-kyogre.md) |
| 27 | Groudon | Tierra | Tanque / Asediador | [27](pokemon/27-groudon.md) |
| 28 | Rayquaza | Dragón / Volador | Luchador / Asesino | [28](pokemon/28-rayquaza.md) |

> Nota: Arcanine ya está registrado en `pokedex.ts`, `abilities.ts`,
> `roster.ts`, `vision.ts` y el manifiesto de sprites.

## Convenciones de las fichas

Cada ficha sigue la misma plantilla:

1. Identidad.
2. Clasificación.
3. Estadísticas.
4. Pasiva.
5. Ataque básico.
6. Habilidades.
7. Interrupción y armadura.
8. Efectividades.
9. Balance.
10. Decisiones cerradas.

Los valores numéricos de las fichas son de diseño. La pasada de balance v1 los
normaliza y, cuando discrepan, manda `balance.md`. Las fichas 1-9, que se
cerraron antes de la regla de tipos dobles, ya tienen estadísticas y números de
balance asignados.

La pasada de balance v1 está en [balance.md](balance.md): estadísticas finales,
poderes por slot, TTK por rol y comprobaciones de letalidad. Si una ficha y
`balance.md` discrepan en un número, manda `balance.md`.

## Orden de trabajo pendiente

1. Playtest del balance v1.2 con esquivas, pasivas, escudos, anti-heal y partidas 4v4.
2. Medir el roster completo con `pnpm balance` y `pnpm balance:teams` tras el rediseño.
3. Cerrar los flecos de `sistema.md` que sigan abiertos (objetos, modos y tamaño de equipo).
