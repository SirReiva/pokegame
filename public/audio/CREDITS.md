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
| Protección | Protect |
| Impulso | Quick Attack |

Los impactos usan las pistas genéricas `Hit Normal Damage`, `Hit Super
Effective` y `Hit Weak Not Very Effective`, elegidas según la efectividad del
tipo en el momento del golpe.

`Water Shuriken` y `Precipice Blades` no existen en la quinta generación: se
usan `Water Pulse` y `Fissure` como equivalentes.
