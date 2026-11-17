import { BASIC_MELEE_REPEAT_COOLDOWN, ability, registerAbility } from '../base';

/* ------------------------------------------------------------------------- */
/* Pikachu                                                                   */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('impactrueno', 'Impactrueno', 'Electric', 'special', 'projectile')
    .power(70)
    .cooldown(0.9)
    .range(8)
    .radius(0.26)
    .projectile('electric', 18)
    .impact('electric')
    .recovery(0.34)
    .startup(0.13, { mode: 'once' })
    .animation('shock')
    .color(247, 208, 44)
    .description(
      'Proyectil eléctrico muy rápido de 70 de potencia. Presión a media distancia de Pikachu.'
    )
);

registerAbility(
  ability('ataqueRapido', 'Ataque Rápido', 'Normal', 'physical', 'dash')
    .power(60)
    .cooldown(4)
    .range(0)
    .radius(0.9)
    .dash(4.5)
    .knockback(0.4)
    .active(0.25).recovery(0)
    .animation('quickstrike')
    .color(232, 244, 255)
    .description('Se lanza hacia delante y golpea a los rivales del camino.')
);

registerAbility(
  ability('rayo', 'Rayo', 'Electric', 'special', 'beam')
    .power(130)
    .cooldown(8)
    .range(11)
    .radius(0.35)
    .impact('electric')
    .recovery(0.55)
    .startup(0.35, { mode: 'once' })
    .animation('shock')
    .color(255, 238, 88)
    .description(
      'Definitiva: haz eléctrico instantáneo de 130 de potencia en la dirección en la que mira Pikachu.'
    )
);

registerAbility(
  ability('placaje', 'Placaje', 'Normal', 'physical', 'melee')
    .power(55)
    .cooldown(0.25)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(1.8)
    .radius(0.7)
    .halfAngle(50)
    .knockback(0.6)
    .active(0.175).recovery(0)
    .animation('attack')
    .impact('arc')
    .color(235, 228, 210)
    .description('Embestida cuerpo a cuerpo contra los rivales que tenga delante.')
);

/* ------------------------------------------------------------------------- */
/* Voltorb                                                                   */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('chispa', 'Chispa', 'Electric', 'physical', 'melee')
    .power(80)
    .cooldown(0.6)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2)
    .radius(0.7)
    .halfAngle(50)
    .knockback(0.25)
    .active(0.15).recovery(0)
    .animation('attack')
    .impact('electric')
    .color(247, 208, 44)
    .description(
      'Descarga eléctrica de corto alcance. Ataque básico de Voltorb.'
    )
);

registerAbility(
  ability('rollout', 'Rollout', 'Normal', 'physical', 'dash')
    .power(100)
    .cooldown(6)
    .range(0)
    .radius(0.95)
    .dash(5)
    .knockback(0.6)
    .active(0.3).recovery(0)
    .animation('twirl')
    .impact('electric')
    .color(247, 208, 44)
    .description(
      'Rueda 5 u hacia delante y arrolla a los rivales del camino. Entrada y escape.'
    )
);

registerAbility(
  ability('ondaTrueno', 'Onda Trueno', 'Electric', 'status', 'projectile')
    .power(0)
    .cooldown(5)
    .range(9)
    .radius(0.3)
    .projectile('electric', 16)
    .impact('electric')
    .recovery(0.35)
    .animation('charge')
    .slow(0.55, 2.5)
    .color(247, 208, 44)
    .description(
      'Proyectil eléctrico que ralentiza un 45 % durante 2,5 s. No hace daño.'
    )
);

registerAbility(
  ability('explosion', 'Explosión', 'Electric', 'special', 'aoe')
    .power(200)
    .cooldown(18)
    .range(0)
    .radius(4.2)
    .area('explosion', 'instant', 0.85)
    .startup(0.6, { animation: 'charge' })
    .armor(40)
    .recovery(0.5)
    .animation(null)
    .impact('electric')
    .knockback(1.2)
    .selfDamage(0.35)
    .color(247, 208, 44)
    .description(
      'Definitiva: carga 0,6 s y detona un área de 4,2 u centrada en Voltorb. Se lleva el 35 % de su vida máxima, sin llegar nunca a 0.'
    )
);

/* ------------------------------------------------------------------------- */
/* Gengar                                                                    */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('lenguetazo', 'Lengüetazo', 'Ghost', 'physical', 'melee')
    .power(42)
    .cooldown(0.7)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2)
    .radius(0.7)
    .halfAngle(50)
    .knockback(0.25)
    .active(0.16).recovery(0)
    .animation('shoot')
    .impact('ghost')
    .color(150, 110, 220)
    .description(
      'Lengüetazo fantasmal de corto alcance. Ataque básico de Gengar.'
    )
);

registerAbility(
  ability('bolaSombra', 'Bola Sombra', 'Ghost', 'special', 'projectile')
    .power(62)
    .cooldown(6)
    .range(8.5)
    .radius(0.3)
    .projectile('ghost', 14)
    .impact('ghost')
    .recovery(0.45)
    .animation('shoot')
    .color(150, 110, 220)
    .description(
      'Proyectil de energía fantasmal. El golpe principal a distancia de Gengar.'
    )
);

registerAbility(
  ability('bombaLodo', 'Bomba Lodo', 'Poison', 'special', 'aoe')
    .power(20)
    .cooldown(9)
    .range(6.5)
    .radius(2.4)
    .area('poison', 'overTime', 2.5, 0.5)
    .slow(0.75, 1.5)
    .startup(0.35, { animation: 'shoot', move: true })
    .armor(20)
    .recovery(0.5)
    .animation(null)
    .impact('poison')
    .antiHeal(0.4, 3)
    .color(150, 90, 180)
    .description(
      'Lanza una bomba de lodo a 6,5 u: deja un charco de 2,4 u durante 2,5 s que hace daño por segundo, ralentiza un 25 % y reduce un 40 % la curación recibida.'
    )
);

registerAbility(
  ability('comeSuenos', 'Come Sueños', 'Ghost', 'special', 'beam')
    .power(80)
    .cooldown(11)
    .range(8)
    .radius(0.42)
    .beam('ghost')
    .impact('ghost')
    .startup(0.25, { animation: 'charge' })
    .recovery(0.55)
    .heal(0.15)
    .healOnHit()
    .color(160, 120, 235)
    .description(
      'Definitiva: haz fantasma de 8 u y 80 de potencia que cura el 15 % de la vida máxima de Gengar si impacta en al menos un enemigo.'
    )
);

/* ------------------------------------------------------------------------- */
/* Charmander                                                                */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('aranazo', 'Arañazo', 'Normal', 'physical', 'melee')
    .power(55)
    .cooldown(0.3)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(1.7)
    .radius(0.65)
    .halfAngle(45)
    .knockback(0.35)
    .active(0.15).recovery(0)
    .animation('strike')
    .impact('slash')
    .color(246, 236, 220)
    .description('Zarpazo rápido cuerpo a cuerpo. Ataque básico de Charmander.')
);

registerAbility(
  ability('giroFuego', 'Giro Fuego', 'Fire', 'special', 'aoe')
    .power(40)
    .cooldown(6)
    // Sin desplazamiento: el remolino nace sobre Charmander y lo acompaña.
    .range(0)
    .radius(1.7)
    .startup(0.5, { move: true })
    .armor(25)
    .recovery(0.45)
    .area('whirl', 'overTime', 2.4, 0.4)
    // El remolino nace pegado a Charmander y lo sigue tanto durante la
    // preparación como mientras dura el área.
    .aoePrepareMovement(({ caster }) => ({ x: caster.x, z: caster.z }))
    .aoeMovement(({ caster }) => ({ x: caster.x, z: caster.z }))
    .impact('fire')
    .slow(0.8, 1.5)
    .color(255, 132, 40)
    .description(
      'Remolino de fuego que gira alrededor de Charmander: 40 de daño por segundo durante 2,4 s y ralentiza un 20 % durante 1,5 s a quien siga dentro.'
    )
);

registerAbility(
  ability('lanzallamas', 'Lanzallamas', 'Fire', 'special', 'beam')
    .power(100)
    .cooldown(6.5)
    .range(9.5)
    .radius(0.4)
    .startup(0.35)
    .recovery(0.5)
    .animation('charge')
    .beam('fire')
    .impact('fire')
    .color(255, 138, 42)
    .description('Chorro de fuego instantáneo que atraviesa a los rivales en línea.')
);

registerAbility(
  ability('anilloIgneo', 'Anillo Ígneo', 'Fire', 'special', 'aoe')
    .power(130)
    .cooldown(14)
    .range(4.2)
    .radius(3.1)
    .startup(0.75)
    .armor(40)
    .recovery(0.7)
    .animation('charge')
    .area('fire', 'instant', 0.5)
    .impact('fire')
    .color(255, 92, 30)
    .description(
      'Definitiva: explosión de fuego instantánea con un breve estallido de llamas.'
    )
);

/* ------------------------------------------------------------------------- */
/* Bulbasaur                                                                 */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('hojaAfilada', 'Hoja Afilada', 'Grass', 'special', 'melee')
    .power(100)
    .cooldown(5)
    .range(2.6)
    .radius(0.8)
    .halfAngle(50)
    .knockback(0.4)
    .active(0.225).recovery(0)
    .startup(0.3)
    .animation('charge')
    .impact('grass')
    .color(126, 214, 88)
    .description('Hoja cortante de gran alcance; empuja a quien golpea.')
);

registerAbility(
  ability('paralizador', 'Paralizador', 'Grass', 'status', 'melee')
    .power(0)
    .cooldown(7)
    .range(3)
    .radius(0.9)
    .halfAngle(60)
    .startup(0.2)
    .active(0.2).recovery(0)
    .animation('shoot')
    .impact('spore')
    .slow(0.55, 3)
    .color(72, 124, 54)
    .description(
      'Nube de partículas verdes que paraliza parcialmente: ralentiza un 45 % durante 3 s a los rivales que tenga delante.'
    )
);

registerAbility(
  ability('llueveHojas', 'Lluevehojas', 'Grass', 'special', 'aoe')
    .power(160)
    .cooldown(14)
    .range(4.2)
    .radius(3.2)
    .startup(0.75)
    .armor(40)
    .recovery(0.7)
    .animation('shake')
    .area('grass', 'instant', 1.1)
    .impact('grass')
    .color(112, 204, 72)
    .description(
      'Definitiva: torbellino bajo y ancho de hojas. Golpea una vez con 160 de potencia.'
    )
);

/* ------------------------------------------------------------------------- */
/* Squirtle                                                                  */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('acuaJet', 'Acua Jet', 'Water', 'physical', 'dash')
    .power(65)
    .cooldown(5)
    .range(0)
    .radius(0.85)
    .dash(4.2)
    .knockback(0.3)
    .active(0.3).recovery(0)
    .animation('attack')
    .color(96, 176, 255)
    .description(
      'Se impulsa con un chorro de agua y golpea a los rivales del camino.'
    )
);

registerAbility(
  ability('rayoBurbuja', 'Rayo Burbuja', 'Water', 'special', 'projectile')
    .power(80)
    .cooldown(3)
    .range(8)
    .radius(0.24)
    .projectile('water', 13)
    .impact('water')
    .recovery(0.4)
    .startup(0.2)
    .animation('shoot')
    .slow(0.7, 2)
    .color(104, 196, 255)
    .description(
      'Chorro de burbujas a presión que ralentiza un 30 % durante 2 s.'
    )
);

registerAbility(
  ability('hidrobomba', 'Hidrobomba', 'Water', 'special', 'beam')
    .power(140)
    .cooldown(9)
    .range(8.5)
    .radius(0.42)
    .beam('water')
    .impact('water')
    .startup(0.3, { animation: 'charge' })
    .recovery(0.6)
    .animation('shoot')
    .color(88, 168, 255)
    .description(
      'Definitiva: chorro de agua a presión que atraviesa la línea de tiro.'
    )
);
