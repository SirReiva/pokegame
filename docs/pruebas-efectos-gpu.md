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
| Charmander | **Giro Fuego** | 27 llamas en dos lotes | Que las llamas recorran los tres brazos espirales, que el remolino gire sin saltos y que siga a Charmander sin despegarse de él mientras se mueve. |
| Moltres | **Onda Ígnea** | 44 llamas, 10 brasas y 6 aspas en lotes | Llamas en tres anillos, brasas subiendo y aspas de viento girando por encima. |
| Lugia | **Marea** | 18 chorros repartidos en cuatro lotes (uno por variante de malla) | Que se sigan viendo las cuatro siluetas de chorro, que respiren en altura/grosor y que giren suavemente. |
| Lugia | **Ciclón** | 74 nubes y 12 brazos en lotes | Que el huracán mantenga volumen, que las nubes suban/bajen con fases distintas y que los brazos giren con el vórtice. |
| Mewtwo | **Psicoataque** | 54 esquirlas en un lote | Que las esquirlas salgan del centro, se abran, giren y se apaguen; el núcleo y las ondas deben seguir igual. |
| Mew | **Premonición** | 54 esquirlas en un lote | Mismo chequeo que Psicoataque, con el retardo de la marca previa. |
| Celebi | **Futuro Siniestro** | 54 esquirlas en un lote | Mismo chequeo, con el radio y el color de Celebi. |
| Articuno | **Ventisca** | 26 cristales, 26 puffs y 24 copos en lotes | Que los cristales caigan, se claven y se asienten; que los puffs de nieve aparezcan al impactar y que los copos caigan con deriva. |
| Onix | **Fisura** | Grietas, losas, estalagmitas y piedras en lotes | Que las losas emerjan con retardos, las estalagmitas broten del suelo, las piedras salten y todo se hunda al final. |
| Voltorb | **Explosión** | Escombros y humo en lotes; arcos cacheados | Que la deflagración llene el radio, que los escombros salgan despedidos y que los cuatro arcos giren sin geometría nueva. |
| Gengar | **Bomba Lodo** | Burbujas, brillos, aros de pop y gotas en lotes | Que las burbujas nazcan, suban, revienten y dejen sus gotas; el charco debe seguir burbujeando hasta el final. |
| Mew | **Recuperación** | 56 motas en un lote | Que las motas suban desde todo el círculo y se apaguen con el área. |
| Celebi | **Deseo** | 56 motas en un lote | Mismo chequeo, con el color verde de Celebi. |
| Moltres | **Ataque Celeste** | 8 aspas, 12 plumas y 6 brasas en lotes | Que las aspas giren, las plumas suban con su deriva y las brasas se apaguen. |
| Articuno | **Viento Gélido** | 26 púas, 10 nieblas y 12 chispas en lotes | Que las púas broten del suelo, la niebla se abra y las chispas suban y se apaguen. |
| Tyranitar | **Terremoto** | 28 rocas, 28 puffs y 14 grietas en lotes | Que las rocas caigan, levanten polvo y las grietas oscilen. |
| Groudon | **Filo del Abismo** | 28 rocas, 28 puffs y 14 grietas en lotes | Mismo chequeo, con el radio y el color de Groudon. |
| Mewtwo | **Psíquico** | Haz y esfera con lotes instanciados; aros ondulados en vertex shader | Que el haz salga del lanzador, los aros recorran la línea y el objetivo quede dentro de la esfera con los aros ondulando. El update solo debe avanzar `uEffectTime`. |
| Mewtwo | **Telequinesis** | Onda psíquica deformada en vertex shader | Que la cinta del cono ondulo en altura y se retuerza entre borde interior y exterior, sin que la malla se quede plana. |
| Mew | **Golpe Psíquico** | Onda psíquica deformada en vertex shader | Mismo chequeo, con el color y alcance de Mew. |
| Pikachu | **Rayo** | Rayos unitarios cacheados y escalados | Que el haz siga avanzando desde el lanzador, que los dos rayos giren en sentidos opuestos y que no se vea estirado ni cortado. |

## Pruebas de estrés

1. **Bomba Lodo + Terremoto + Viento Gélido + Explosión** a la vez, con 8
   jugadores. Es el peor caso de instancias transparentes y burbujas.
2. **Lluevehojas + Ciclón + Ventisca + Fisura** en la misma zona. Comprueba que
   no se dispara el tiempo de CPU al acumular áreas.
3. **Marea + Onda Ígnea + Giro Fuego** en la misma zona.
4. **Rayo + Telequinesis + Golpe Psíquico** repetidos. Aquí se comprueban el
   shader de la onda y la caché de rayos.
5. Repite con **4 vistas** y con **8 vistas**; el número de capas por efecto es
   lo que más multiplica los draw calls.

## Efectos que siguen en el camino anterior

Ahora todas las áreas (`ring`, `grass`, `water`, `cyclone`, `heat`, `fire`,
`whirl`, `psychic`, `blizzard`, `fissure`, `explosion`, `ghost`, `poison`,
`ice`, `ground`, `air` y `recovery`) usan lotes o shaders de instancia.

Siguen con entidades por elemento:

- Haces `fire`, `grass`, `water`, `ice`, `dark`, `ghost`, `air` y `rock`
  (salvo el haz eléctrico cacheado y el haz psíquico, que ya usan lotes).
- Proyectiles e impactos pequeños.
- El área `burrow` de **Excavar**: cráter, losas y rocas con entidades propias;
  comprueba que la erupción coincide con el punto donde emerge el lanzador.
- Hojas del golpe melee de tipo Planta (9 hojas), zarpas, mandíbula, shuriken y
  demás golpes con pocas entidades.
- La marca previa de área (`spawnAoeTelegraph`), que son pocos aros y discos.

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

## Backends

Repite la lista con **WebGPU** y con **WebGL2** (selector en Opciones). Los
shaders de los efectos tienen versi�n GLSL y WGSL; si un efecto se anima en un
backend y en el otro se queda quieto, falta el MOTION_*_WGSL correspondiente
en src/game/effectMotionsWGSL.ts (la consola lo avisa). Ver
docs/graficos-webgpu.md.
