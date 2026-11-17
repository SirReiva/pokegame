import { BASIC_MELEE_REPEAT_COOLDOWN, ability, registerAbility } from '../base';

/* ------------------------------------------------------------------------- */
/* Lucario                                                                   */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('garraMetal', 'Garra Metal', 'Steel', 'physical', 'melee')
    .power(45)
    .cooldown(0.5)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2)
    .radius(0.7)
    .halfAngle(45)
    .knockback(0.25)
    .active(0.16).recovery(0)
    .animation('strike')
    .impact('steel')
    .color(176, 198, 228)
    .description(
      'Zarpazo de acero rápido y corto. Ataque básico de Lucario.'
    )
);

registerAbility(
  ability('velocidadExtrema', 'Velocidad Extrema', 'Normal', 'physical', 'dash')
    .power(55)
    .cooldown(6)
    .range(0)
    .radius(0.9)
    .dash(5.2)
    .knockback(0.6)
    .active(0.25).recovery(0)
    .animation('quickstrike')
    .impact('fighting')
    .color(214, 236, 255)
    .description(
      'Se lanza a una velocidad imposible y golpea a los rivales del camino. Entrada y escape.'
    )
);

registerAbility(
  ability('esferaAura', 'Esfera Aura', 'Fighting', 'special', 'projectile')
    .power(60)
    .cooldown(5)
    .range(10)
    .radius(0.32)
    .projectile('aura', 15)
    .impact('aura')
    .startup(0.2, { animation: 'charge' })
    .recovery(0.4)
    .animation('attack')
    .color(82, 152, 255)
    .description(
      'Proyectil de aura guiado. Alcance largo y golpe único; remata a los rivales que huyen.'
    )
);

registerAbility(
  ability('combateCercano', 'Combate Cercano', 'Fighting', 'physical', 'melee')
    .power(125)
    .cooldown(13)
    .range(2.4)
    .radius(1)
    .halfAngle(65)
    .knockback(1.1)
    .startup(0.35, { animation: 'charge' })
    .active(0.325).recovery(0)
    .animation('strike')
    .impact('fighting')
    .color(96, 150, 255)
    .description(
      'Definitiva: ráfaga de golpes de aura en un cono amplio. Mucho daño y empuje, pero exige acercarse.'
    )
);

/* ------------------------------------------------------------------------- */
/* Greninja                                                                  */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('shurikenAgua', 'Shuriken de Agua', 'Water', 'special', 'projectile')
    .power(42)
    .cooldown(0.65)
    .range(9)
    .radius(0.24)
    .projectile('shuriken', 20)
    .impact('shuriken')
    .recovery(0.3)
    .animation('shoot')
    .color(112, 196, 255)
    .description(
      'Lanza un shuriken de agua que gira en el aire. Ataque básico a media distancia de Greninja.'
    )
);

registerAbility(
  ability('tajoUmbro', 'Tajo Umbrío', 'Dark', 'physical', 'melee')
    .power(65)
    .cooldown(1.4)
    .range(2.1)
    .radius(0.75)
    .halfAngle(55)
    .knockback(0.35)
    .active(0.16).recovery(0)
    .animation('attack')
    .impact('dark')
    .color(154, 120, 232)
    .description(
      'Zarpazo de sombra rápido. Castiga al rival que se acerca demasiado.'
    )
);

registerAbility(
  ability('sombraVil', 'Sombra Vil', 'Dark', 'physical', 'dash')
    .power(50)
    .cooldown(7)
    .range(0)
    .radius(0.85)
    .dash(4.8)
    .knockback(0.5)
    .active(0.26).recovery(0)
    .animation('quickstrike')
    .impact('dark')
    .color(128, 100, 216)
    .description(
      'Se desliza por las sombras 4,8 u y golpea a los rivales del camino. Entrada y escape.'
    )
);

registerAbility(
  ability('pulsoUmbro', 'Pulso Umbrío', 'Dark', 'special', 'beam')
    .power(85)
    .cooldown(10)
    .range(9.5)
    .radius(0.42)
    .beam('dark')
    .impact('dark')
    .startup(0.25, { animation: 'charge' })
    .recovery(0.55)
    .animation('shoot')
    .color(124, 92, 224)
    .description(
      'Definitiva: descarga un haz de energía oscura que atraviesa la línea de tiro.'
    )
);

/* ------------------------------------------------------------------------- */
/* Mewtwo                                                                    */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('telequinesis', 'Telequinesis', 'Psychic', 'special', 'melee')
    .power(45)
    .cooldown(0.6)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2.5)
    .radius(0.8)
    .halfAngle(55)
    .knockback(1.4)
    .active(0.2).recovery(0)
    .startup(0.12)
    .animation('punch')
    .impact('psychic')
    .color(214, 122, 255)
    .description(
      'Onda telequinética de corto alcance que empuja con fuerza. Ataque básico de Mewtwo.'
    )
);

registerAbility(
  ability('teletransporte', 'Teletransporte', 'Psychic', 'status', 'dash')
    .power(0)
    .cooldown(6)
    .range(0)
    .radius(0.85)
    .dash(5)
    .active(0.24).recovery(0)
    .animation('quickstrike')
    .impact('psychic')
    .color(170, 104, 255)
    .description(
      'Desaparece y reaparece 5 u más adelante. Movilidad pura para entrar o salir del combate.'
    )
);

registerAbility(
  ability('psiquico', 'Psíquico', 'Psychic', 'special', 'beam')
    .power(80)
    .cooldown(7)
    .range(10)
    .radius(0.42)
    .startup(0.4, { animation: 'shoot' })
    .recovery(0.5)
    .beam('psychic')
    .impact('psychic')
    .color(226, 132, 255)
    .description(
      'Lanza psíquico instantáneo de largo alcance que atraviesa a los rivales en línea.'
    )
);

registerAbility(
  ability('psicoataque', 'Psicoataque', 'Psychic', 'special', 'aoe')
    .power(100)
    .cooldown(15)
    .range(4.5)
    .radius(3.2)
    .startup(0.8, { animation: 'charge' })
    .armor(40)
    .recovery(0.7)
    .area('psychic', 'instant', 0.85)
    .radial(0.35)
    .impact('psychic')
    .color(198, 96, 255)
    .description(
      'Definitiva: implosión psíquica que golpea una vez con 100 de potencia en un área amplia. Hace el 100 % en el centro y el 35 % en el borde.'
    )
);

/* ------------------------------------------------------------------------- */
/* Mew                                                                       */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('psicogolpe', 'Golpe Psíquico', 'Psychic', 'special', 'melee')
    .power(45)
    .cooldown(0.3)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2.1)
    .radius(0.7)
    .halfAngle(55)
    .knockback(0.5)
    .active(0.16).recovery(0)
    .startup(0.1)
    .animation('attack')
    .impact('psychic')
    .color(255, 150, 220)
    .description(
      'Onda psíquica de corto alcance y cadencia alta. Ataque básico de Mew.'
    )
);

registerAbility(
  ability('agilidad', 'Agilidad', 'Psychic', 'status', 'dash')
    .power(0)
    .cooldown(8)
    .range(0)
    .radius(0.85)
    .dash(4.4)
    .active(0.26).recovery(0)
    .animation('quickstrike')
    .buff('speed', 1.3, 3)
    .impact('psychic')
    .color(255, 176, 232)
    .description(
      'Se impulsa 4,4 u hacia delante y gana un 30 % de velocidad durante 3 s.'
    )
);

registerAbility(
  ability('premonicion', 'Premonición', 'Psychic', 'special', 'aoe')
    .power(85)
    .cooldown(10)
    .range(6)
    .radius(2.4)
    .startup(0.9, { move: true })
    .armor(40)
    .recovery(0.55)
    .area('psychic', 'instant', 0.8)
    .radial(0.5)
    .impact('psychic')
    .slow(0.7, 2)
    .color(250, 128, 222)
    .description(
      'Marca un punto a 6 u: tras 0,9 s cae una explosión de 2,4 u que ralentiza un 30 % durante 2 s. Hace el 100 % en el centro y el 50 % en el borde.'
    )
);

registerAbility(
  ability('recuperacion', 'Recuperación', 'Psychic', 'status', 'aoe')
    .power(0)
    .cooldown(14)
    .range(0)
    .radius(3.5)
    .recovery(0.75)
    .startup(0.75)
    .armor(40)
    .animation('twirl')
    .heal(0.35)
    .area('recovery', 'instant', 0.75)
    .aoeEffect(({ targets, applyHeal }) => {
      // El lanzador ya se cura con `healSelf`; el área reparte el 25 % entre
      // los aliados que estén dentro del radio.
      for (const target of targets) {
        if (!target.isAlly || target.isSelf) continue;
        applyHeal(target, 0.25);
      }
    })
    .color(255, 170, 230)
    .description(
      'Se concentra 0,75 s y libera una onda curativa de 3,5 u: recupera el 35 % de su vida máxima y el 25 % de la de sus aliados en el área. Si el daño acumulado agota su armadura durante la concentración, se cancela.'
    )
);

/* ------------------------------------------------------------------------- */
/* Moltres                                                                   */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('ataqueAereo', 'Ataque Aéreo', 'Flying', 'physical', 'melee')
    .power(55)
    .cooldown(0.55)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2.2)
    .radius(0.8)
    .halfAngle(55)
    .knockback(0.35)
    .active(0.18).recovery(0)
    .animation('strike')
    .impact('air')
    .color(255, 190, 92)
    .description(
      'Golpe alado de corto alcance. Ataque básico de Moltres.'
    )
);

registerAbility(
  ability('tajoAereo', 'Tajo Aéreo', 'Flying', 'physical', 'dash')
    .power(55)
    .cooldown(7)
    .range(0)
    .radius(0.9)
    .dash(4.8)
    .knockback(0.5)
    .active(0.26).recovery(0)
    .animation('attack')
    .impact('air')
    .color(255, 206, 122)
    .description(
      'Se lanza 4,8 u hacia delante cortando el aire y empuja a los rivales del camino. Entrada y escape de Moltres.'
    )
);

registerAbility(
  ability('ondaIgnea', 'Onda Ígnea', 'Fire', 'special', 'aoe')
    .power(60)
    .cooldown(8)
    .range(4.2)
    .radius(2.9)
    .area('heat', 'instant', 0.9)
    .radial(0.4)
    .slow(0.82, 1.5)
    .startup(0.3, { animation: 'shoot', move: true })
    .armor(20)
    .recovery(0.5)
    .animation(null)
    .impact('air')
    .color(255, 150, 60)
    .description(
      'Onda de aire abrasador de 2,9 u: 60 de potencia, 40 % en el borde y 18 % de ralentización durante 1,5 s.'
    )
);

registerAbility(
  ability('ataqueCeleste', 'Ataque Celeste', 'Flying', 'physical', 'aoe')
    .power(115)
    .cooldown(15)
    .range(6)
    .radius(3.1)
    .area('air', 'instant', 0.9)
    .radial(0.35)
    .knockback(0.9)
    .startup(0.8, { animation: 'charge' })
    .armor(40)
    .recovery(0.6)
    .animation('strike')
    .impact('air')
    .color(255, 168, 72)
    .description(
      'Definitiva: marca un punto a 6 u y se lanza en picado tras 0,8 s. Golpea una vez en 3,1 u con el 100 % en el centro y el 35 % en el borde.'
    )
);

/* ------------------------------------------------------------------------- */
/* Articuno                                                                  */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('golpeAla', 'Golpe Ala', 'Flying', 'physical', 'melee')
    .power(55)
    .cooldown(0.55)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2.2)
    .radius(0.8)
    .halfAngle(55)
    .knockback(0.35)
    .active(0.18).recovery(0)
    .animation('attack')
    .impact('air')
    .color(206, 242, 255)
    .description(
      'Golpe de ala de corto alcance. Ataque básico de Articuno.'
    )
);

registerAbility(
  ability('rayoHielo', 'Rayo Hielo', 'Ice', 'special', 'beam')
    .power(90)
    .cooldown(7)
    .range(9.5)
    .radius(0.4)
    .beam('ice')
    .impact('ice')
    .startup(0.3, { animation: 'charge' })
    .recovery(0.5)
    .animation('shoot')
    .slow(0.8, 1.5)
    .color(150, 225, 255)
    .description(
      'Haz de hielo de 9,5 u y 90 de potencia que congela parcialmente: ralentiza un 20 % durante 1,5 s.'
    )
);

registerAbility(
  ability('vientoGelido', 'Viento Gélido', 'Ice', 'special', 'aoe')
    .power(55)
    .cooldown(8)
    .range(4.5)
    .radius(2.8)
    .area('ice', 'instant', 0.9)
    .radial(0.5)
    .slow(0.65, 2.5)
    .startup(0.3, { animation: 'shoot', move: true })
    .armor(20)
    .recovery(0.5)
    .animation(null)
    .impact('ice')
    .color(130, 210, 245)
    .description(
      'Ráfaga helada de 2,8 u: 55 de potencia, 50 % en el borde y ralentización del 35 % durante 2,5 s.'
    )
);

registerAbility(
  ability('ventisca', 'Ventisca', 'Ice', 'special', 'aoe')
    .power(100)
    .cooldown(15)
    .range(5.5)
    .radius(3.3)
    .area('blizzard', 'instant', 1.1)
    .radial(0.35)
    .slow(0.75, 2)
    .startup(0.75, { animation: 'charge' })
    .armor(40)
    .recovery(0.7)
    // El área es instantánea: la ventisca cae al terminar la carga. Sin clip
    // de lanzamiento para no reproducir el disparo cuando ya ha impactado.
    .animation(null)
    .impact('ice')
    .color(120, 200, 250)
    .description(
      'Definitiva: ventisca de 3,3 u que golpea una vez con 100 de potencia, 35 % en el borde y ralentización del 25 % durante 2 s.'
    )
);

/* ------------------------------------------------------------------------- */
/* Zapdos                                                                    */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('picoTaladro', 'Pico Taladro', 'Flying', 'physical', 'melee')
    .power(60)
    .cooldown(0.6)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2.2)
    .radius(0.8)
    .halfAngle(55)
    .knockback(0.4)
    .active(0.18).recovery(0)
    .animation('attack')
    .impact('air')
    .color(247, 208, 44)
    .description(
      'Picotazo giratorio de corto alcance. Ataque básico de Zapdos.'
    )
);

registerAbility(
  ability('descarga', 'Descarga', 'Electric', 'special', 'aoe')
    .power(75)
    .cooldown(8)
    .range(0)
    .radius(3.2)
    .area('explosion', 'instant', 0.8)
    .radial(0.6)
    .slow(0.7, 1.5)
    .startup(0.3, { animation: 'charge', move: true })
    .armor(20)
    .recovery(0.5)
    .animation('shock')
    .impact('electric')
    .color(247, 208, 44)
    .description(
      'Descarga eléctrica de 3,2 u alrededor de Zapdos: 75 de potencia, 60 % en el borde y ralentización del 30 % durante 1,5 s.'
    )
);

registerAbility(
  ability('trueno', 'Trueno', 'Electric', 'special', 'aoe')
    .power(145)
    .cooldown(15)
    .range(6)
    .radius(3.6)
    .area('thunder', 'instant', 0.95)
    .radial(0.4)
    .slow(0.65, 2)
    .knockback(1)
    .startup(0.85, { animation: 'charge' })
    .armor(45)
    .recovery(0.6)
    // El área cae al terminar la carga; sin clip de lanzamiento después del impacto.
    .animation(null)
    .impact('electric')
    .color(255, 238, 88)
    .description(
      'Definitiva: marca un punto a 6 u y, tras 0,85 s, cae un rayo de 3,6 u. 145 de potencia, el 100 % en el centro y el 40 % en el borde, empuja 1 u y ralentiza un 35 % durante 2 s.'
    )
);

/* ------------------------------------------------------------------------- */
/* Scyther                                                                   */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('golpeFuria', 'Golpe Furia', 'Bug', 'physical', 'melee')
    .power(45)
    .cooldown(0.4)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2.1)
    .radius(0.75)
    .halfAngle(55)
    .knockback(0.25)
    .active(0.15).recovery(0)
    .animation('attack')
    .impact('slash')
    .color(166, 185, 26)
    .description(
      'Tajo de guadaña rápido y corto. Ataque básico de Scyther.'
    )
);

registerAbility(
  ability('corteAereo', 'Corte Aéreo', 'Flying', 'physical', 'dash')
    .power(60)
    .cooldown(6.5)
    .range(0)
    .radius(0.9)
    .dash(5)
    .knockback(0.6)
    .active(0.26).recovery(0)
    .animation('attack')
    .impact('air')
    .color(196, 240, 160)
    .description(
      'Se lanza 5 u hacia delante entre el viento y corta a los rivales del camino. Entrada y escape.'
    )
);

registerAbility(
  ability('danzaEspada', 'Danza Espada', 'Normal', 'status', 'self')
    .power(0)
    .cooldown(12)
    .radius(1.2)
    .startup(0.45, { animation: 'charge' })
    .recovery(0.6)
    .animation('charge')
    .buff('attack', 1.35, 4.5)
    .color(170, 210, 60)
    .description(
      'Danza de filos que aumenta un 35 % su ataque durante 4,5 s. Prepárala antes de entrar al combate.'
    )
);

registerAbility(
  ability('tijeraX', 'Tijera X', 'Bug', 'physical', 'melee')
    .power(130)
    .cooldown(14)
    .range(2.7)
    .radius(1.1)
    .halfAngle(70)
    .knockback(1.1)
    .startup(0.35, { animation: 'charge' })
    .active(0.325).recovery(0)
    .animation('attack')
    .impact('slash')
    .color(170, 200, 40)
    .description(
      'Definitiva: cruza las guadañas en un cono amplio de 2,7 u. Mucho daño y empuje, pero exige estar cerca.'
    )
);

/* ------------------------------------------------------------------------- */
/* Tyranitar                                                                 */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('triturar', 'Triturar', 'Dark', 'physical', 'melee')
    .power(50)
    .cooldown(0.85)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2)
    .radius(0.8)
    .halfAngle(55)
    .knockback(0.35)
    .active(0.21).recovery(0)
    .animation('attack')
    .impact('jaw')
    .color(126, 98, 166)
    .description(
      'Mordisco de mandíbula brutal. Golpe cuerpo a cuerpo lento pero muy contundente. Ataque básico de Tyranitar.'
    )
);

registerAbility(
  ability('avalancha', 'Avalancha', 'Rock', 'physical', 'projectile')
    .power(55)
    .cooldown(5)
    .range(8.5)
    .radius(0.34)
    .projectile('rock', 14)
    .impact('rock')
    .knockback(0.45)
    .startup(0.25)
    .recovery(0.45)
    .animation('shoot')
    .color(196, 166, 104)
    .description(
      'Lanza un pedrusco de 8,5 u que estalla en esquirlas al impactar. Su ataque a distancia fiable.'
    )
);

registerAbility(
  ability('terremoto', 'Terremoto', 'Ground', 'physical', 'aoe')
    .power(18)
    .cooldown(9)
    .range(0)
    .radius(3.4)
    .area('ground', 'overTime', 2.5, 0.5)
    .startup(0.45, { animation: 'hop' })
    .armor(25)
    .recovery(0.7)
    .animation(null)
    .impact('ground')
    .color(198, 158, 92)
    .description(
      'Salta y golpea el suelo: el área de 3,4 u sigue agrietada 2,5 s y hace 18 de daño por segundo (45 en total) a quien permanezca dentro.'
    )
);

registerAbility(
  ability('rocaAfilada', 'Roca Afilada', 'Rock', 'physical', 'beam')
    .power(90)
    .cooldown(12)
    .range(9)
    .radius(0.5)
    .beam('rock')
    .impact('rock')
    .startup(0.5, { animation: 'charge' })
    .recovery(0.6)
    // El haz y las estalagmitas son el golpe: no hay clip de lanzamiento
    // después de la carga para no encadenar un Attack que no aporta nada.
    .animation(null)
    .color(210, 178, 118)
    .description(
      'Definitiva: una línea de estalagmitas de 9 u que brota del suelo y golpea con 90 de potencia a todos los rivales en línea.'
    )
);
