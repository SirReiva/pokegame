# Pruebas de efectos GPU

Los efectos con muchos elementos repetidos ya no animan una entidad por
elemento: usan lotes instanciados (`src/game/effectBatch.ts`) y la animación se
resuelve en el vertex shader. Para verificar que el cambio no rompe ninguna
habilidad, prueba esta lista.

## Cómo montar la partida

- Partida local con **8 jugadores** (humanos o bots) para que el splitscreen
  reproduzca el peor caso de draw calls.
- Activa bots en ambos equipos y deja que usen sus habilidades.
- Repite cada prueba también con **2 jugadores**; así distingues un problema de
  efecto de uno de rendimiento del splitscreen.
- Si puedes, abre el perfilador de Chrome y mira `CombatFx.update`, los
  `setLocal*` y el tiempo de submit.

## Habilidades que usan los efectos migrados

| Pokémon | Habilidad | Efecto nuevo | Qué comprobar |
| --- | --- | --- | --- |
| Bulbasaur | **Lluevehojas** | 120 hojas en dos lotes instanciados | Que las hojas sigan girando en espiral, abriéndose en embudo y sin quedarse quietas ni todas alineadas. |
| Bulbasaur | **Paralizador** | 104 motas de espora en un lote | Que el rocío salga del vértice del cono, cubra toda la abertura y desaparezca al llegar al borde. |
| Charmander | **Anillo Ígneo** | 36 llamas en dos lotes | Que las llamas broten del suelo, parpadeen y se mezan; el centro debe conservar su llama más alta. |
| Charmander | **Giro Fuego** | 27 llamas en dos lotes | Que las llamas recorran los tres brazos espirales y que el remolino gire sin saltos. |
| Moltres | **Onda Ígnea** | 44 llamas, 10 brasas y 6 aspas en lotes | Llamas en tres anillos, brasas subiendo y aspas de viento girando por encima. |
| Lugia | **Marea** | 18 chorros repartidos en cuatro lotes (uno por variante de malla) | Que se sigan viendo las cuatro siluetas de chorro, que respiren en altura/grosor y que giren suavemente. |
| Lugia | **Ciclón** | 74 nubes y 12 brazos en lotes | Que el huracán mantenga volumen, que las nubes suban/bajen con fases distintas y que los brazos giren con el vórtice. |
| Mewtwo | **Psicoataque** | 54 esquirlas en un lote | Que las esquirlas salgan del centro, se abran, giren y se apaguen; el núcleo y las ondas deben seguir igual. |
| Mew | **Premonición** | 54 esquirlas en un lote | Mismo chequeo que Psicoataque, con el retardo de la marca previa. |
| Celebi | **Futuro Siniestro** | 54 esquirlas en un lote | Mismo chequeo, con el radio y el color de Celebi. |
| Articuno | **Ventisca** | 26 cristales, 26 puffs y 24 copos en lotes | Que los cristales caigan, se claven y se asienten; que los puffs de nieve aparezcan al impactar y que los copos caigan con deriva. |
| Onix | **Fisura** | Grietas, losas, estalagmitas y piedras en lotes | Que las losas emerjan con retardos, las estalagmitas broten del suelo, las piedras salten y todo se hunda al final. |
| Mewtwo | **Telequinesis** | Onda psíquica deformada en vertex shader | Que la cinta del cono ondulo en altura y se retuerza entre borde interior y exterior, sin que la malla se quede plana. |
| Mew | **Golpe Psíquico** | Onda psíquica deformada en vertex shader | Mismo chequeo, con el color y alcance de Mew. |
| Pikachu | **Rayo** | Rayos unitarios cacheados y escalados | Que el haz siga avanzando desde el lanzador, que los dos rayos giren en sentidos opuestos y que no se vea estirado ni cortado. |

## Pruebas de estrés

1. **Lluevehojas + Ciclón + Ventisca + Fisura** a la vez, con 8 jugadores.
   Es el peor caso de partículas/instancias transparentes.
2. **Marea + Onda Ígnea + Giro Fuego** en la misma zona. Comprueba que no se
   dispara el tiempo de CPU al acumular áreas.
3. **Rayo + Telequinesis + Golpe Psíquico** repetidos. Aquí se comprueban el
   shader de la onda y la caché de rayos.
4. Repite con **4 vistas** y con **8 vistas**; el número de capas por efecto es
   lo que más multiplica los draw calls.

## Efectos que siguen en el camino anterior

Estos no se han migrado en esta pasada; si algo falla en ellos, no es por los
lotes instanciados:

- Áreas `explosion`, `ghost`, `poison`, `ice`, `ground`, `air`, `recovery` y
  `ring`.
- Haces `fire`, `grass`, `water`, `ice`, `dark`, `ghost`, `air`, `rock` y
  `psychic` (salvo el haz eléctrico cacheado).
- Proyectiles e impactos pequeños.
- Hojas del golpe melee de tipo Planta (9 hojas), zarpas, mandíbula, shuriken y
  demás golpes con pocas entidades.

## Señales de que algo va mal

- Una habilidad no dibuja nada: revisa que el material del lote no se comparta
  con dos animaciones distintas.
- Un efecto se ve en una sola vista: revisa `applyVisibility` y las capas del
  `render` del lote.
- Las transparencias se ordenan mal: es el límite conocido de instancing; las
  instancias de un lote no se ordenan individualmente por distancia.
- El efecto se queda congelado: comprueba que `setTime()` se llame en el
  `animate` del efecto y que el material esté en la lista `materials` del
  `addEffect`.
