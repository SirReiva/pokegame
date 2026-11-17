# Pasada de balance — v1.1 + ajustes v1.2

> Estado: **primera pasada cerrada + corrección de implementación v1.1 +
> ajustes v1.2 con pasivas activas**. Sustituye a los valores numéricos de las
> fichas cuando haya discrepancia.
>
> Modelo: rotación simple, objetivo de referencia de 1.000 PV con 100 DF/DE, sin
> esquivas, sin curaciones y sin pasivas. La v1.1 corrige un error del modelo
> anterior: las básicas especiales se calculaban con AF y ahora usan AE. La v1.2
> ajusta supervivencia y pasivas de Voltorb, Onix y Squirtle a partir de partidas
> headless. Es una herramienta de comparación, no una simulación frame a frame.
> Margen ±15 %.

## 1. Decisiones de la pasada

| Tema | Decisión |
|---|---|
| Escala | Media del roster = 100 en AF/AE/DF/DE. PV de referencia = 1.000 |
| Ancla de poder | Con 100 de ataque y 100 de defensa, `D ≈ B`. Los poderes de la tabla equivalen casi a daño final contra un objetivo medio |
| STAB | **No se aplica.** El ×1,5 del código se retiró en la implementación. El tipo ya influye en el daño vía efectividad |
| Recurso de definitiva | **Solo enfriamiento** en v1. La carga por daño/tiempo queda como variante futura |
| Nivel y XP | Siguen siendo decorativos (niveles 1-10 de partida) |
| Objetivo de TTK | Asesino 7-9 s · Luchador 7-9 s · Mago 7,5-9,5 s · Hostigador 8-10 s · Tanque 9,5-12,5 s · Apoyo 9,5-12,5 s |
| Excepción de apoyo híbrido | Ho-Oh (Apoyo/Luchador) se evalúa en 8,5-10,5 s por su rol secundario |

## 2. Métricas

- **eHP físico** = `PV × (100 + DF) / 200`.
- **eHP especial** = `PV × (100 + DE) / 200`.
- **Burst** = 3 básicos + H1 + H2 + definitiva, todo impactando y con el daño
  total potencial (DoT incluido).
- **TTK** = tiempo simulado para infligir 1.000 de daño con básicos continuos y
  habilidades al enfriarse; la definitiva se usa una vez.

## 3. Estadísticas finales

| Pokémon | Rol | PV | AF | DF | AE | DE | VEL | VIS | eHP f | eHP e | TTK | Burst |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Bulbasaur | Apoyo | 1000 | 70 | 90 | 115 | 100 | 4,6 | 8,8 | 950 | 1000 | 9,1 | 384 |
| Charmander | Luchador | 1000 | 95 | 85 | 120 | 90 | 5,8 | 9,5 | 925 | 950 | 8,4 | 403 |
| Squirtle | Tanque | 1200 | 75 | 115 | 105 | 105 | 5,2 | 9,2 | 1290 | 1230 | 9,1 | 336 |
| Pikachu | Asesino | 900 | 100 | 75 | 125 | 80 | 6,9 | 11,0 | 788 | 810 | 8,2 | 384 |
| Voltorb | Hostigador | 1000 | 80 | 80 | 120 | 85 | 8,2 | 9,5 | 900 | 925 | 9,0 | 416 |
| Eevee | Hostigador | 1050 | 105 | 95 | 95 | 95 | 6,1 | 9,5 | 1024 | 1024 | 8,8 | 323 |
| Gengar | Asesino | 900 | 70 | 75 | 150 | 90 | 7,6 | 10,8 | 788 | 855 | 7,8 | 485 |
| Lucario | Luchador | 1050 | 120 | 90 | 115 | 85 | 6,5 | 10,5 | 998 | 971 | 7,8 | 405 |
| Greninja | Asesino | 950 | 115 | 75 | 120 | 85 | 7,4 | 11,5 | 831 | 879 | 7,1 | 322 |
| Arcanine | Luchador | 1100 | 120 | 105 | 70 | 90 | 6,4 | 11,0 | 1128 | 1045 | 7,2 | 495 |
| Mewtwo | Mago | 950 | 70 | 80 | 155 | 105 | 7,8 | 12,0 | 855 | 974 | 7,7 | 397 |
| Mew | Apoyo | 1000 | 95 | 95 | 110 | 100 | 7,0 | 11,0 | 975 | 1000 | 10,0 | 185 |
| Onix | Tanque | 1350 | 90 | 135 | 40 | 75 | 4,6 | 8,8 | 1586 | 1181 | 9,6 | 394 |
| Scyther | Asesino | 900 | 120 | 70 | 45 | 75 | 7,2 | 10,8 | 765 | 788 | 8,0 | 358 |
| Gyarados | Luchador | 1150 | 125 | 105 | 60 | 85 | 6,2 | 10,2 | 1179 | 1064 | 8,2 | 478 |
| Tyranitar | Tanque | 1250 | 100 | 110 | 70 | 90 | 4,5 | 9,6 | 1313 | 1188 | 9,3 | 434 |
| Articuno | Mago | 950 | 60 | 85 | 140 | 105 | 6,8 | 11,6 | 879 | 974 | 8,2 | 450 |
| Zapdos | Mago | 950 | 65 | 85 | 135 | 100 | 7,6 | 11,8 | 879 | 950 | 8,2 | 435 |
| Moltres | Mago | 900 | 105 | 75 | 120 | 85 | 7,0 | 11,5 | 788 | 833 | 8,4 | 374 |
| Raikou | Asesino | 900 | 120 | 70 | 80 | 80 | 7,7 | 11,9 | 765 | 810 | 7,8 | 407 |
| Entei | Luchador | 1200 | 130 | 105 | 85 | 90 | 6,0 | 10,4 | 1230 | 1140 | 8,2 | 520 |
| Suicune | Apoyo | 1100 | 70 | 105 | 120 | 115 | 7,0 | 11,6 | 1128 | 1183 | 12,0 | 199 |
| Lugia | Tanque | 1300 | 70 | 115 | 110 | 125 | 7,5 | 12,4 | 1398 | 1463 | 9,4 | 411 |
| Ho-Oh | Apoyo | 1200 | 100 | 100 | 105 | 115 | 6,9 | 11,9 | 1200 | 1290 | 8,4 | 379 |
| Celebi | Apoyo | 950 | 60 | 85 | 135 | 110 | 7,1 | 11,7 | 879 | 998 | 9,0 | 414 |
| Kyogre | Mago | 1050 | 60 | 90 | 140 | 120 | 5,9 | 12,2 | 998 | 1155 | 7,7 | 482 |
| Groudon | Tanque | 1400 | 115 | 140 | 70 | 80 | 5,6 | 10,6 | 1680 | 1260 | 9,3 | 413 |
| Rayquaza | Mago | 1050 | 130 | 90 | 120 | 90 | 7,6 | 12,6 | 998 | 998 | 7,7 | 451 |

**Medias por rol (v1.1):** Asesino 7,8 s · Luchador 8,0 s · Mago 8,0 s ·
Hostigador 8,9 s · Tanque 9,3 s · Apoyo 9,7 s.

**Lectura:** todas las especialidades caen dentro de su banda o a menos de
0,5 s de su borde. Ho-Oh (8,4 s) se mantiene como excepción declarada de apoyo
híbrido. El modelo corrige el TTK de las básicas especiales; por eso varias
cifras bajan respecto a la v1.

## 4. Poderes finales por slot

Potencia total esperada y enfriamiento. Las habilidades de utilidad se marcan
con `—`.

| Pokémon | Básico | H1 | H2 | Definitiva |
|---|---|---|---|---|
| Bulbasaur | 45 / 0,70 | 80 / 8 | 60 / 9 | 110 / 16 |
| Charmander | 40 / 0,60 | 70 / 6 | 80 / 6,5 | 110 / 14 |
| Squirtle | 50 / 0,65 | 70 / 7 | — / 11 | 140 / 15 |
| Pikachu | 40 / 0,55 | 65 / 6 | 50 / 7 | 125 / 15 |
| Voltorb | 40 / 0,60 | 55 / 6 | 65 / 8 | 170 / 16 |
| Eevee | 45 / 0,55 | — / 8 | 60 / 7 | 120 / 15 |
| Gengar | 48 / 0,60 | 85 / 7 | 85 / 9 | 120 / 15 |
| Lucario | 45 / 0,60 | 55 / 7 | 70 / 8 | 110 / 15 |
| Greninja | 36 / 0,55 | 60 / 1,4 | 50 / 7 | 80 / 15 |
| Arcanine | 50 / 0,60 | 55 / 7 | 95 / 8 | 150 / 15 |
| Mewtwo | 42 / 0,70 | — / 6 | 90 / 7 | 125 / 15 |
| Mew | 40 / 0,50 | 65 / 9 | — / 8 | — / 15 |
| Onix | 55 / 0,80 | 55 / 4,5 | 65 / 10 | 130 / 14 |
| Scyther | 40 / 0,50 | 55 / 6,5 | — / 11 | 150 / 14 |
| Gyarados | 50 / 0,75 | 60 / 5,5 | 75 / 8 | 140 / 16 |
| Tyranitar | 58 / 0,85 | 55 / 6 | 65 / 9 | 140 / 15 |
| Articuno | 45 / 0,55 | 95 / 7 | 55 / 8 | 135 / 16 |
| Zapdos | 42 / 0,65 | 60 / 8 | 75 / 8 | 140 / 15 |
| Moltres | 45 / 0,60 | 55 / 7 | 60 / 8 | 110 / 15 |
| Raikou | 50 / 0,60 | 70 / 8 | — / 12 | 150 / 16 |
| Entei | 55 / 0,80 | 70 / 8 | 90 / 9 | 180 / 16 |
| Suicune | 48 / 0,60 | — / 10 | 70 / 8 | — / 18 |
| Lugia | 46 / 0,85 | 40 / 9 | 110 / 9 | 120 / 16 |
| Ho-Oh | 48 / 0,60 | 75 / 8 | — / 13 | 160 / 17 |
| Celebi | 40 / 0,75 | 110 / 8 | — / 12 | 150 / 16 |
| Kyogre | 46 / 0,70 | 110 / 8 | — / 12 | 200 / 16 |
| Groudon | 58 / 0,85 | 55 / 9 | 65 / 10 | 90 / 16 |
| Rayquaza | 50 / 0,70 | 60 / 6 | 75 / 9 | 110 / 16 |

**Notas de desglose:**

- Las potencias de áreas `overTime` son **daño por segundo**; el total del
  lanzamiento es `potencia × duración`. En las tablas de la ficha se muestra el
  total, pero el motor guarda la DPS para que `aoeDuration` sea la única fuente
  de verdad.
- Arcanine: Colmillo Ígneo 95 = impacto + quemadura; Envite 150 = impacto +
  explosión.
- Onix: Fisura 130 = impacto + zona.
- Gengar: Bomba Lodo 85 = daño periódico total.
- Lugia: Ciclón 110 = total durante 2,5 s.
- Kyogre: Remolino 110 = total; Pulso 200 = dos pulsos.
- Celebi: Rayo Solar 110 = haz + eco.
- Mew: Mímica 65 = media de una habilidad copiada al 70 %.

## 5. Comprobaciones de letalidad

- **Ningún personaje mata de una rotación a otro sano.** El mayor burst es 520
  (Entei) y el objetivo más frágil tiene 900 PV: 58 % de su barra.
- **Los asesinos matan a un mago en 7-8 s**, no en 3. El caso más rápido es
  Greninja (7,1 s) y el más lento Gengar (7,8 s).
- **Los tanques sobreviven dos rotaciones** de un asesino y necesitan 9,3-9,6 s
  para matar. Onix es el más resistente al físico (1.586 eHP) y el más vulnerable
  al especial (1.181), como debe ser.
- **Los apoyos no ganan peleas solos**: Mew (10,0 s) y Suicune (12,0 s) superan
  los 10 s. Bulbasaur (9,1 s) y Celebi (9,0 s) quedan algo por debajo de la banda
  de apoyo, pero su valor está en escudos, curación y control, no en el duelo.

## 6. Cambios respecto a las fichas

**Estadísticas ajustadas:** Mewtwo AE 155 · Mew AE 110 · Onix AF 90 · Tyranitar
AF 100 · Articuno AE 140 · Zapdos AE 135 · Groudon AF 115 · Ho-Oh AF 100 ·
Suicune AE 120 · Celebi AE 135 · Kyogre AE 140.

**Ajustes de la v1.1 (básicas):** Mewtwo 42 / 0,70 · Zapdos 42 / 0,65 · Lugia
46 / 0,85 · Celebi 40 / 0,75. Corrigen el TTK de las básicas especiales tras
arreglar el modelo.

**Potencias ajustadas:** todas las de la tabla de §4. Las fichas conservan el
desglose narrativo; cuando difieran, manda esta tabla.

**Armaduras:** presupuesto aplicado:

| Tipo de habilidad | Armadura |
|---|---:|
| Básico | 0 |
| Dash o casteo corto | 10-25 |
| Casteo medio | 20-30 |
| Definitiva o canalización | 35-50 |
| Habilidad de apoyo con casteo | 40 |

## 7. Riesgos y pendientes

1. **El modelo no simula esquivas.** Un personaje con proyectiles lentos rendirá
   menos de lo que dice su TTK.
2. **Las pasivas están implementadas pero no en este modelo.** Gyarados,
   Charmander, Lucario, Scyther y Rayquaza ganan un 10-25 % real con sus
   medidores; los apoyos ganan supervivencia. La pasada v1.2 ya ajustó Voltorb,
   Onix y Squirtle con partidas headless, pero falta el playtest 4v4.
3. **El anti-heal ya existe:** Bomba Lodo de Gengar aplica −40 % durante 3 s.
   El modelo de TTK no lo simula.
4. **Los escudos a aliados** (Squirtle, Suicune, Lugia) no están en el modelo de
   TTK; su valor real es mayor. El tope global es el 35 % de PV máximos.
5. **Pendiente de playtest:** duraciones de control, resistencia progresiva
   (−30 % por acumulación, máx. 3), escudos y anti-heal.
6. **STAB retirado en la implementación.** No se debe reintroducir sin repetir
   esta pasada: rompería el ancla `D ≈ B`.
7. **Estados, pasivas, ecos, Mímica, Adaptación, Corriente Celeste y HUD de
   estados implementados**; ver [implementacion.md](implementacion.md). Queda el
   playtest con los sistemas nuevos activos.

### Ajustes v1.2 con pasivas activas

- **Voltorb:** 1000 PV, 80 DF y 85 DE. Explosión baja al 20 % de autodaño y
  Núcleo Resonante marca con cualquier golpe directo. En la muestra 1v1 de
  cinco especies pasa de 0 % a 17 % de victorias.
- **Onix:** las placas de Cuerpo Rocoso bajan de 70 a 60 PV. Su winrate 1v1
  pasa del 46 % al 42 %, sin perder el papel de muro.
- **Squirtle:** Caparazón Guardián baja al 8 % de PV máximos y exige 4 s sin
  daño. Su winrate 1v1 pasa del 38 % al 25 %.
- El arnés 1v1 termina en el primer KO y favorece a los tanques; estos ajustes
  corrigen los outliers más claros, no sustituyen un playtest 4v4. En la misma
  muestra Pikachu baja al 8 %: es un pool cerrado y de cero suma, así que el
  siguiente paso es medir el roster completo y no solo estas cinco especies.
