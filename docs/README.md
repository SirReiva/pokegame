# Documentación

Índice de la documentación de NewPoke. El [README](../README.md) de la raíz es la
visión general y el punto de entrada; aquí están los documentos de diseño,
arquitectura y rendimiento.

## Diseño de combate

El rediseño de combate es la fuente de verdad de las reglas, los números y las
fichas de cada especie.

- [diseno-combate/README.md](diseno-combate/README.md) — índice, roster y estado del rediseño.
  - [sistema.md](diseno-combate/sistema.md) — reglas canónicas del combate.
  - [balance.md](diseno-combate/balance.md) — escala, TTK, poderes y ajustes v1.1/v1.2.
  - [implementacion.md](diseno-combate/implementacion.md) — qué hay implementado y qué queda.
  - [pokemon/](diseno-combate/pokemon/) — una ficha por especie (28).

## Sistemas

- [arquitectura.md](arquitectura.md) — propuesta de monolito modular y diagramas de capas, estado y bucle de juego.
- [animaciones-habilidades.md](animaciones-habilidades.md) — fases, marcadores y plan de casteo de las habilidades.
- [common-abilities.md](common-abilities.md) — instintos comunes (Protección, Impulso y Regeneración).
- [graficos-webgpu.md](graficos-webgpu.md) — backends WebGL2/WebGPU, shaders y pruebas manuales de efectos.
- [rendimiento.md](rendimiento.md) — baseline de CPU y frame, carga de mapas y propuestas de optimización.
- [items.md](items.md) — objetos recogibles, contrato actual y hoja de ruta.
- [modos-de-juego.md](modos-de-juego.md) — modos implementados y propuestas.
- [mejoras-bots.md](mejoras-bots.md) — estado y pendientes de la IA.

## Histórico

Los informes anteriores al rediseño de combate se retiraron porque describían el
modelo antiguo (nivel 50, IV/EV, críticos y STAB) y ya no coincidían con el
código: `combat-balance.md`, `balance-simulacion.md`, `balance-equipos.md`,
`tabla-danos-por-ataque.md` y `dps-por-habilidad.md`. Siguen disponibles en el
historial de Git.

Los informes de balance se regeneran con `pnpm balance`, `pnpm balance:teams` y
`node scripts/generate-damage-matrix.mjs` cuando haga falta una foto nueva.
