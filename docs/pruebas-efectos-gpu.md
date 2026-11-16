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
| Suicune | **Chorro de Agua** / **Ráfaga Marina** | 5 cuentas de cola, 6 gotas orbitando y 2 aros en tres lotes | Que la cola se meeza, las gotas giren alrededor del eje y los dos aros se expandan y avancen sin quedarse quietos. |
| Moltres | **Tajo Aéreo** | 6 aspas en dos lotes, 3 plumas y 2 jirones instanciados | Que las dos ruedas de aspas giren cruzadas, las plumas ondeen detrás y los jirones escolten la estela. |
| Lucario | **Esfera Aura** | 2 aros, 4 motas y 3 esferas de estela en tres lotes | Que los aros giren sobre ejes distintos, las motas orbiten con vaivén vertical y la estela quede quieta detrás. |
| Gengar | **Bola Sombra** | 3 jirones, 2 ojos y 3 esferas de estela en tres lotes | Que los jirones ondeen, los ojos parpadeen y la estela no se mueva. |
| Squirtle | **Rayo Burbuja** | 3 burbujas y 6 brillos en dos lotes | Que las burbujas orbiten alrededor del eje, rueden con sus brillos pegados a la superficie y pulsen. |
| Lucario | **Esfera Aura** (impacto) | 2 aros y 7 motas en dos lotes | Que los aros se expandan y las motas salgan en círculo y se apaguen. |
| Gengar | **Bola Sombra** (impacto) | 2 aros y 7 jirones en dos lotes | Que los aros se abran y los jirones suban girando. |
| Greninja | **Shuriken de Agua** (impacto) | 2 aros y 8 gotas en dos lotes | Que los aros se expandan y las gotas salgan despedidas. |
| Bulbasaur | **Hoja Afilada** | 9 hojas en un lote | Que las hojas se abran, suban y giren dentro del arco. |
| Gengar | **Lengüetazo** | 7 puffs de veneno en dos lotes | Que la nube avance por el cono y crezca sin entidades sueltas. |

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
6. **Chorro de Agua + Tajo Aéreo** con varios proyectiles en vuelo y 8 vistas:
   comprueba que la cola, las gotas, las aspas y las plumas siguen animándose y
   que el coste no crece con una entidad por elemento.
7. **Anillo Ígneo + Terremoto + Lluevehojas** a la vez con 8 vistas: comprueba
   que ya no hay picos de `preWarm` al castear y que el polvo, las llamas y las
   hojas siguen naciendo con la densidad esperada.
8. **Haz de Roca + haz fantasma + haz oscuro** seguidos: las púas, los jirones y
   los aros deben animarse sin entidades por elemento.

## Efectos que siguen en el camino anterior

Ahora todas las áreas (`ring`, `grass`, `water`, `cyclone`, `heat`, `fire`,
`whirl`, `psychic`, `blizzard`, `fissure`, `explosion`, `ghost`, `poison`,
`ice`, `ground`, `air` y `recovery`) usan lotes o shaders de instancia.

Siguen con entidades por elemento:

- Las cuatro piezas del **shuriken**: estrella exterior, estrella interior,
  núcleo y halo usan mallas y materiales diferentes.
- El haz de **roca**: la grieta luminosa y la cresta del suelo son dos cajas con
  materiales propios; las púas sí van por lotes.
- La marca previa de área (`spawnAoeTelegraph`), que son pocos aros y discos
  persistentes.

El resto de capas se dibuja con `EffectTintBatch`, que permite color y alfa por
instancia: cuerpo y decoración de los proyectiles de fuego, veneno, eléctrico,
hojas y sombra; ondas, arcos y garras del melee; y todas las capas de los haces
de agua, fuego, aire, Planta e hielo. El cuerpo del proyectil de roca usa
`EffectBatch`: sus cuatro fragmentos comparten el material iluminado y giran
como un solo boulder.

El área `burrow` de **Excavar** usa lotes para grietas, losas, rocas, puffs y
anillos; solo el cráter y su borde quedan como entidades. Las ondas del área
psíquica también van en un lote.

Los impactos, las hojas y puffs del melee, las mordidas y la decoración de la
mayoría de proyectiles usan lotes instanciados. Los emisores de partículas de
combate usan `EffectParticleBatch` (efectos fijos) o `WorldTrailBatch` (estelas
en espacio de mundo): no queda ningún `ParticleSystem` de combate ni pasadas de
`preWarm` en los casteos.

El clima del mundo (`atmosphereVisuals.ts`) también dejó de usar
`ParticleSystem`: reutiliza `BatchedParticles` y se actualiza con un único
`uTime` por tipo.

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
