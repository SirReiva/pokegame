# Créditos de audio

## Efectos de sonido

Los efectos de `public/audio/sfx/` proceden del álbum de khinsider:

- **Pokemon SFX Gen 5 - Attack Moves - BLK, WHT, BLK2, WHT2** (2020)
- Página: https://downloads.khinsider.com/game-soundtracks/album/pokemon-sfx-gen-5-attack-moves-blk-wht-blk2-wht2
- Descarga: `pnpm sfx` (ver `scripts/import-sfx.mjs`)

## Música

- **Battle! Team Plasma** — Pokémon Black & White
- Archivo: `public/audio/music/battle-team-plasma.mp3`
- Página: https://downloads.khinsider.com/game-soundtracks/album/pokemon-black-and-white

Los archivos son grabaciones originales de los juegos de Pokémon y pertenecen a
Nintendo, Game Freak y The Pokémon Company. Se incluyen sin modificaciones en
este proyecto fan, no comercial, igual que los sprites.

## Mapa habilidad → pista

| Habilidad | Pista original |
| --- | --- |
| Placaje | Tackle |
| Ataque Rápido | Quick Attack |
| Rayo | Thunderbolt |
| Impactrueno | Thunder Shock |
| Chispa | Spark |
| Rollout | Rollout |
| Onda Trueno | Thunder Wave |
| Explosión | Explosion |
| Lengüetazo | Lick |
| Bola Sombra | Shadow Ball |
| Bomba Lodo | Sludge Bomb |
| Come Sueños | Dream Eater |
| Paralizador | Stun Spore |
| Hoja Afilada | Razor Leaf |
| Lluevehojas | Leaf Storm |
| Arañazo | Scratch |
| Giro Fuego | Fire Spin |
| Lanzallamas | Flamethrower |
| Anillo Ígneo | Fire Blast |
| Acua Jet | Aqua Jet |
| Rayo Burbuja | Bubble Beam |
| Hidrobomba | Hydro Pump |
| Garra Metal | Metal Claw |
| Velocidad Extrema | Extreme Speed |
| Esfera Aura | Aura Sphere |
| Combate Cercano | Close Combat |
| Shuriken de Agua | Water Pulse |
| Tajo Umbrío | Night Slash |
| Sombra Vil | Shadow Sneak |
| Pulso Umbrío | Dark Pulse |
| Golpe Ala | Wing Attack |
| Rayo Hielo | Ice Beam |
| Viento Gélido | Icy Wind |
| Ventisca | Blizzard |
| Ataque Aéreo | Aerial Ace |
| Corte Aéreo | Aerial Ace |
| Tajo Aéreo | Air Slash |
| Onda Ígnea | Heat Wave |
| Ataque Celeste | Sky Attack |
| Telequinesis | Telekinesis |
| Teletransporte | Teleport |
| Psíquico | Psychic |
| Psicoataque | Psystrike |
| Golpe Psíquico | Psycho Cut |
| Agilidad | Agility |
| Premonición | Future Sight |
| Recuperación | Recover |
| Golpe Furia | Fury Cutter |
| Danza Espada | Swords Dance |
| Tijera X | X Scissor |
| Triturar | Crunch |
| Avalancha | Avalanche |
| Terremoto | Earthquake |
| Roca Afilada | Stone Edge |
| Cuchillada | Slash |
| Filo del Abismo | Fissure |
| Hoja Mágica | Razor Leaf |
| Rayo Solar | Leaf Storm |
| Deseo | Recover |
| Futuro Siniestro | Future Sight |
| Onda Mental | Psychic |
| Marea | Water Pulse |
| Ciclón | Air Slash |
| Aerochorro | Sky Attack |
| Protección | Protect |
| Impulso | Quick Attack |
| Látigo Cepa | Vine Whip |
| Ascuas | Ember |
| Pistola Agua | Water Gun |
| Atadura | Bind |
| Lanzarrocas | Rock Throw |
| Excavar | Dig |
| Fisura | Fissure |
| Acua Cola | Aqua Tail |
| Cascada | Waterfall |
| Triturar (Gyarados) | Crunch |
| Dragoaliento | Dragon Breath |
| Golpe Cuerpo | Body Slam |
| Cornada | Horn Attack |
| Giro Rápido | Rapid Spin |
| Rodada | Rollout |
| Giga Impacto | Giga Impact |
| Chorro de Agua | Brine |
| Frío Polar | Sheer Cold |
| Ráfaga Marina | Bubble |
| Remolino Marino | Whirlpool |
| Aguas Curativas | Aqua Ring |
| Pulso Primigenio | Water Spout |
| Garra Dragón | Dragon Claw |
| Vuelo Dragón | Dragon Rush |
| Furia Dragón | Dragon Pulse |
| Ascenso Draco | Brave Bird |

Los impactos usan las pistas genéricas `Hit Normal Damage`, `Hit Super
Effective` y `Hit Weak Not Very Effective`, elegidas según la efectividad del
tipo en el momento del golpe.

`Water Shuriken` y `Precipice Blades` no existen en la quinta generación: se
usan `Water Pulse` y `Fissure` como equivalentes. `Magical Leaf` y `Solar Beam`
tampoco están en el álbum, así que `Hoja Mágica` usa `Razor Leaf` y `Rayo Solar`
usa `Leaf Storm`. `Aeroblast` tampoco aparece, así que `Aerochorro` reutiliza
`Sky Attack`.

`Origin Pulse` y `Dragon Ascent` son de la sexta generación: `Pulso Primigenio`
usa `Water Spout` (la firma de Kyogre en la quinta) y `Ascenso Draco` usa
`Brave Bird` por el picado aéreo. `Ráfaga Marina` y `Chorro de Agua` no son
movimientos reales y toman `Bubble` y `Brine`; `Furia Dragón` usa `Dragon
Pulse`, que comparte el haz continuo, en lugar de `Dragon Rage`.
