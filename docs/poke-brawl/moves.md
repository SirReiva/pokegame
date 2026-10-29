# Poke Brawl — base de datos de Pokémon y habilidades

Extraído del bundle `assets/index-Cj-UV_Xn.js` el 2026-10-29. Los datos son literales del juego; los nombres de habilidades están en inglés tal y como aparecen en la interfaz.

## Resumen

| Pokémon | Tipos | HP | ATK | DEF | Vel | Rol | Habilidades (pool) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pikachu | electric | 445 | 1.05 | 0.92 | 215 | Fast striker. Zaps from range, dives in with Quick Attack. | 12 |
| Charizard | fire / flying | 485 | 1.1 | 1 | 180 | All-rounder. Takes wing to dodge, rush and cross lava: flame streams up close, Fire Blast from afar. | 11 |
| Blastoise | water | 530 | 0.95 | 1.15 | 155 | Tank. Slow, but walls you out with water and ice. | 12 |
| Venusaur | grass / poison | 470 | 1.05 | 1.15 | 165 | Zoner. Long vines, lobbed sludge, and a huge charged Solar Beam. | 11 |
| Gengar | ghost / poison | 535 | 1.2 | 0.95 | 210 | Trickster. Shrugs off Normal and Fighting moves. Phases behind you. | 11 |
| Lucario | fighting / steel | 445 | 1.15 | 1.05 | 200 | Rushdown. Homing Aura Sphere sets up a brutal Close Combat. | 11 |
| Garchomp | dragon / ground | 540 | 1.12 | 1.05 | 185 | Bruiser. Shrugs off Electric. Digs under the arena and erupts. | 12 |
| Gardevoir | psychic / fairy | 365 | 1.05 | 1 | 175 | Caster. Shrugs off Dragon. Keeps you away with Psychic power. | 11 |

## Estilos

### Pikachu

| Estilo | Descripción | Moves |
| --- | --- | --- |
| Classic | FAST STRIKER. ZAPS FROM RANGE, DIVES IN WITH QUICK ATTACK. | Quick Attack, Thunderbolt, Iron Tail, Thunder |
| Speedster | DART IN, HIT, AND BE GONE BEFORE THEY ANSWER | Quick Attack, Volt Switch, Agility, Volt Tackle |
| Trapper | PARALYSE THEM, THEN PUNISH FROM RANGE | Nuzzle, Thunder Wave, Electroweb, Electro Ball |

### Charizard

| Estilo | Descripción | Moves |
| --- | --- | --- |
| Classic | ALL-ROUNDER. TAKES WING TO DODGE, RUSH AND CROSS LAVA: FLAME STREAMS UP CLOSE, FIRE BLAST FROM AFAR. | Dragon Claw, Flamethrower, Air Slash, Fire Blast |
| Sky Ace | FIGHT FROM THE AIR, OUT OF REACH | Acrobatics, Air Slash, Hurricane, Fly |
| Blaze Brawler | BURN THEM, POWER UP, CHARGE IN | Fire Fang, Will-O-Wisp, Dragon Dance, Flare Blitz |

### Blastoise

| Estilo | Descripción | Moves |
| --- | --- | --- |
| Classic | TANK. SLOW, BUT WALLS YOU OUT WITH WATER AND ICE. | Aqua Tail, Water Pulse, Ice Beam, Hydro Pump |
| Fortress | TURTLE UP, BLOCK, AND HIT BACK HARD | Water Pulse, Protect, Iron Defense, Body Press |
| Artillery | CANNONS FROM ACROSS THE ARENA | Flash Cannon, Dark Pulse, Aura Sphere, Hydro Cannon |

### Venusaur

| Estilo | Descripción | Moves |
| --- | --- | --- |
| Classic | ZONER. LONG VINES, LOBBED SLUDGE, AND A HUGE CHARGED SOLAR BEAM. | Vine Whip, Razor Leaf, Sludge Bomb, Solar Beam |
| Garden | OUTLAST THEM: DRAIN, SEED AND HEAL | Petal Blizzard, Giga Drain, Leech Seed, Synthesis |
| Toxic | POISON THEM, PUT THEM TO SLEEP, CASH IN | Sleep Powder, Venoshock, Toxic, Sludge Bomb |

### Gengar

| Estilo | Descripción | Moves |
| --- | --- | --- |
| Classic | TRICKSTER. SHRUGS OFF NORMAL AND FIGHTING MOVES. PHASES BEHIND YOU. | Shadow Punch, Shadow Ball, Dark Pulse, Phantom Force |
| Hex Caster | AFFLICT THEM, THEN HEX FOR DOUBLE | Shadow Sneak, Hex, Will-O-Wisp, Hypnosis |
| Glass Cannon | SET UP NASTY PLOT, THEN ONE HUGE BURST | Sludge Wave, Hex, Nasty Plot, Focus Blast |

### Lucario

| Estilo | Descripción | Moves |
| --- | --- | --- |
| Classic | RUSHDOWN. HOMING AURA SPHERE SETS UP A BRUTAL CLOSE COMBAT. | Bullet Punch, Aura Sphere, Flash Cannon, Close Combat |
| Martial Artist | CHAIN COMBOS UP CLOSE | Force Palm, Bone Rush, Swords Dance, Close Combat |
| Counter Stance | READ THEM, BLOCK, PUNISH | Vacuum Wave, Detect, Counter, Extreme Speed |

### Garchomp

| Estilo | Descripción | Moves |
| --- | --- | --- |
| Classic | BRUISER. SHRUGS OFF ELECTRIC. DIGS UNDER THE ARENA AND ERUPTS. | Dragon Claw, Dragon Rush, Earthquake, Dig |
| Land Shark | SHARPEN UP, THEN RAMPAGE | Crunch, Iron Head, Swords Dance, Outrage |
| Sand Fortress | OWN THE ARENA: ROCKS, TRAPS, QUAKES | Bulldoze, Stone Edge, Sand Tomb, Stealth Rock |

### Gardevoir

| Estilo | Descripción | Moves |
| --- | --- | --- |
| Classic | CASTER. SHRUGS OFF DRAGON. KEEPS YOU AWAY WITH PSYCHIC POWER. | Psybeam, Moonblast, Dazzling Gleam, Psychic |
| Mind Games | BLINK AWAY, LULL THEM, STRIKE FROM THE FUTURE | Psyshock, Teleport, Hypnosis, Future Sight |
| Guardian | SHIELD AND HEAL: BEST WITH A PARTNER | Draining Kiss, Moonblast, Light Screen, Wish |


## Habilidades

Leyenda de formas: `projectile`, `melee`, `dash`, `strike` (golpe de área con retardo), `nova` (estallido alrededor), `beam` (proyectil continuo), `buff`, `guard`, `phase`, `dig`, `rampage`, `hazard`, `blink`, `fly`.

### Pikachu

| Habilidad | Tipo | Forma | Poder | Enfriamiento | Notas |
| --- | --- | --- | --- | --- | --- |
| Quick Attack | normal | dash | 48 | 0.9s | dash 760/0.2s |
| Thunderbolt | electric | projectile (shard) | 80 | 1.5s | vel 640, r 9, alcance 520 |
| Iron Tail | steel | melee | 100 | 2.5s | reach 34, radio 30 |
| Thunder | electric | strike | 115 | 7s | radio 52, delay 0.7; cráter 28 |
| Volt Switch | electric | projectile (shard) | 80 | 1.6s | retrocede; vel 700, r 9, alcance 440 |
| Agility | psychic | buff | 0 | 8s | {"seconds":7,"speed":1.4,"dodge":1.6} |
| Volt Tackle | electric | dash | 135 | 7s | recoil; dash 820/0.3s |
| Nuzzle | electric | dash | 50 | 1.3s | paralysis 100%; dash 680/0.18s |
| Thunder Wave | electric | projectile | 0 | 5s | paralysis 100%; vel 700, r 10, alcance 460; color #fff27a |
| Electroweb | electric | projectile | 60 | 2.6s | red r62; vel 520, r 12, alcance 440 |
| Electro Ball | electric | projectile | 60 | 1.6s | vel 600, r 12, alcance 480; color #fff27a |
| Discharge | electric | nova | 85 | 3.2s | paralysis 25%; radio 110 |

### Charizard

| Habilidad | Tipo | Forma | Poder | Enfriamiento | Notas |
| --- | --- | --- | --- | --- | --- |
| Dragon Claw | dragon | melee | 70 | 0.55s | reach 38, radio 28 |
| Flamethrower | fire | projectile | 15 | 3.2s | 7 disparos; vel 520, r 10, alcance 320 |
| Air Slash | flying | projectile (crescent) | 56 | 2.4s | x3; spread 0.28; vel 560, r 8, alcance 420 |
| Fire Blast | fire | projectile | 120 | 7.5s | explota r62; vel 430, r 17, alcance 520; cráter 34 |
| Fly | flying | fly | 90 | 7.5s |  |
| Acrobatics | flying | dash | 42 | 1.4s | dash 860/0.2s |
| Hurricane | flying | projectile (crescent) | 80 | 4.5s | vel 420, r 20, alcance 460; color #cfe8ff |
| Fire Fang | fire | melee | 70 | 0.6s | burn 30%; reach 36, radio 32 |
| Will-O-Wisp | fire | projectile | 0 | 5s | homing 2; burn 100%; vel 420, r 11, alcance 460; color #7a8cff |
| Dragon Dance | dragon | buff | 0 | 11s | {"seconds":8,"speed":1.25,"damage":1.25} |
| Flare Blitz | fire | dash | 125 | 7s | burn 10%; recoil; dash 760/0.3s; cráter 30 |

### Blastoise

| Habilidad | Tipo | Forma | Poder | Enfriamiento | Notas |
| --- | --- | --- | --- | --- | --- |
| Aqua Tail | water | melee | 70 | 0.6s | reach 34, radio 30 |
| Water Pulse | water | projectile | 55 | 1.5s | vel 560, r 11, alcance 460 |
| Ice Beam | ice | projectile (shard) | 85 | 3.2s | haz; vel 780, r 8, alcance 520 |
| Hydro Pump | water | projectile | 22 | 7s | 6 disparos; vel 650, r 13, alcance 420 |
| Rapid Spin | normal | nova | 55 | 1.6s | limpia proyectiles; radio 82 |
| Protect | normal | guard | 0 | 6s | {"seconds":0.9,"stagger":0.6}; color #9fe0ff |
| Iron Defense | steel | buff | 0 | 12s | {"seconds":7,"defense":0.5} |
| Body Press | fighting | dash | 120 | 1.6s | dash 560/0.24s |
| Flash Cannon | steel | projectile (shard) | 65 | 2.8s | haz; vel 540, r 12, alcance 500 |
| Dark Pulse | dark | projectile | 55 | 2.4s | vel 460, r 13, alcance 480; color #7a4aa8 |
| Aura Sphere | fighting | projectile | 55 | 2.4s | homing 1.6; vel 420, r 12, alcance 560; color #4aa8ff |
| Hydro Cannon | water | projectile | 110 | 8s | haz; explota r64; vel 560, r 20, alcance 560; cráter 34 |

### Venusaur

| Habilidad | Tipo | Forma | Poder | Enfriamiento | Notas |
| --- | --- | --- | --- | --- | --- |
| Vine Whip | grass | melee | 55 | 0.5s | látigo; reach 64, radio 28 |
| Razor Leaf | grass | projectile (leaf) | 48 | 1.3s | x3; spread 0.2; vel 600, r 9, alcance 420 |
| Sludge Bomb | poison | strike | 95 | 3s | poison 20%; radio 56, delay 0.5; cráter 22 |
| Solar Beam | grass | projectile | 130 | 7.5s | haz; vel 920, r 16, alcance 720; color #f6ffb0 |
| Giga Drain | grass | projectile | 60 | 1.9s | drena 35%; vel 560, r 12, alcance 460; color #7cf07a |
| Leech Seed | grass | projectile | 0 | 7s | semilla; vel 480, r 9, alcance 460; color #9ad86a |
| Synthesis | grass | buff | 0 | 14s | {"seconds":0,"heal":0.12} |
| Petal Blizzard | grass | nova | 85 | 3.4s | radio 105; color #ffa0c8 |
| Toxic | poison | projectile | 0 | 6s | toxic 100%; vel 520, r 10, alcance 460; color #a33ea1 |
| Venoshock | poison | projectile | 55 | 1.7s | vel 580, r 11, alcance 480; color #c070e0 |
| Sleep Powder | grass | nova | 0 | 7s | sleep 100%; radio 80; color #d8f0a0 |

### Gengar

| Habilidad | Tipo | Forma | Poder | Enfriamiento | Notas |
| --- | --- | --- | --- | --- | --- |
| Shadow Punch | ghost | melee | 62 | 0.5s | reach 30, radio 26 |
| Shadow Ball | ghost | projectile | 88 | 1.5s | vel 460, r 13, alcance 500 |
| Dark Pulse | dark | nova | 70 | 3.5s | radio 92 |
| Phantom Force | ghost | phase | 110 | 6s |  |
| Shadow Sneak | ghost | dash | 40 | 1.2s | dash 720/0.2s |
| Hex | ghost | projectile | 46 | 1.6s | vel 420, r 12, alcance 480; color #9a5ae0 |
| Will-O-Wisp | fire | projectile | 0 | 5s | homing 2; burn 100%; vel 420, r 11, alcance 460; color #7a8cff |
| Hypnosis | psychic | projectile | 0 | 7s | sleep 100%; vel 380, r 12, alcance 420; color #d890ff |
| Nasty Plot | dark | buff | 0 | 12s | {"seconds":6,"damage":1.2,"only":"ranged"} |
| Sludge Wave | poison | nova | 85 | 4s | poison 20%; radio 112; color #b060d0 |
| Focus Blast | fighting | projectile | 100 | 7.5s | explota r56; vel 360, r 17, alcance 500; color #7ad0ff |

### Lucario

| Habilidad | Tipo | Forma | Poder | Enfriamiento | Notas |
| --- | --- | --- | --- | --- | --- |
| Bullet Punch | steel | melee | 55 | 0.45s | reach 30, radio 26 |
| Aura Sphere | fighting | projectile | 75 | 1.6s | homing 2.6; vel 420, r 12, alcance 560; color #4aa8ff |
| Flash Cannon | steel | projectile (shard) | 88 | 2.6s | haz; vel 680, r 12, alcance 480 |
| Close Combat | fighting | dash | 120 | 6.5s | dash 660/0.32s |
| Force Palm | fighting | melee | 65 | 0.7s | paralysis 30%; reach 30, radio 32 |
| Bone Rush | ground | dash | 36 | 2.6s | dash 640/0.36s |
| Swords Dance | normal | buff | 0 | 11s | {"seconds":8,"damage":1.5,"only":"close"} |
| Vacuum Wave | fighting | projectile (crescent) | 40 | 0.8s | vel 760, r 9, alcance 380; color #9ad8ff |
| Detect | fighting | guard | 0 | 6s | {"seconds":0.6}; color #ffe066 |
| Counter | fighting | guard | 0 | 6s | {"seconds":0.7,"counter":1.6}; color #ff8a5a |
| Extreme Speed | normal | dash | 55 | 2.4s | dash 1100/0.24s |

### Garchomp

| Habilidad | Tipo | Forma | Poder | Enfriamiento | Notas |
| --- | --- | --- | --- | --- | --- |
| Dragon Claw | dragon | melee | 70 | 0.55s | reach 34, radio 30 |
| Dragon Rush | dragon | dash | 95 | 3.6s | dash 640/0.28s |
| Earthquake | ground | nova | 85 | 5.5s | radio 125; cráter 40 |
| Dig | ground | dig | 110 | 7.5s | cráter 36 |
| Crunch | dark | melee | 80 | 0.7s | reach 34, radio 32 |
| Iron Head | steel | melee | 85 | 1.6s | reach 34, radio 34 |
| Swords Dance | normal | buff | 0 | 11s | {"seconds":8,"damage":1.5,"only":"close"} |
| Outrage | dragon | rampage | 60 | 9s | rampage 2.4s |
| Stone Edge | rock | projectile (shard) | 88 | 3.2s | vel 620, r 12, alcance 480; color #b6a136 |
| Bulldoze | ground | nova | 60 | 2.8s | radio 105; cráter 20 |
| Sand Tomb | ground | projectile | 35 | 4s | atrapa 4s; vel 500, r 13, alcance 460; color #d8b878 |
| Stealth Rock | rock | hazard | 0 | 12s | rocas x4 |

### Gardevoir

| Habilidad | Tipo | Forma | Poder | Enfriamiento | Notas |
| --- | --- | --- | --- | --- | --- |
| Psybeam | psychic | projectile | 44 | 0.7s | haz; vel 640, r 9, alcance 440 |
| Moonblast | fairy | projectile | 95 | 2.9s | vel 460, r 15, alcance 500; color #ffd6f0 |
| Dazzling Gleam | fairy | nova | 75 | 3.5s | radio 95 |
| Psychic | psychic | strike | 110 | 7s | radio 50, delay 0.62 |
| Psyshock | psychic | projectile | 90 | 1.8s | vel 600, r 12, alcance 500; color #f95587 |
| Teleport | psychic | blink | 0 | 3s | blink 200 |
| Hypnosis | psychic | projectile | 0 | 6s | sleep 100%; vel 380, r 12, alcance 420; color #d890ff |
| Future Sight | psychic | strike | 150 | 8s | radio 70, delay 2 |
| Draining Kiss | fairy | projectile | 55 | 1.6s | drena 30%; vel 520, r 11, alcance 460; color #ffb0d8 |
| Light Screen | psychic | buff | 0 | 14s | {"seconds":0,"screen":7} |
| Wish | fairy | buff | 0 | 16s | {"seconds":0,"heal":0.15,"delay":2} |

## Entornos

| Id | Capa | Etiqueta | Boost | Color |
| --- | --- | --- | --- | --- |
| sun | weather | SUN | {"fire":1.25,"water":0.75} | #ffb43a |
| rain | weather | RAIN | {"water":1.25,"fire":0.75} | #6ab0ff |
| sand | weather | SAND | {} | #d8b878 |
| dark | weather | DARK | {"ghost":1.25,"dark":1.25} | #a47cff |
| grassy | terrain | GRASS | {"grass":1.25} | #58d26a |
| electric | terrain | ELECTRIC | {"electric":1.25} | #f8d030 |
| misty | terrain | MIST | {"dragon":0.5,"fairy":1.25} | #ff9ad8 |
| aura | surge | AURA | {} | #4aa8ff |

Asignación por Pokémon: charizard → sun, blastoise → rain, venusaur → grassy, pikachu → electric, garchomp → sand, gardevoir → misty, gengar → dark, lucario → aura.
