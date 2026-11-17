import { BASIC_MELEE_REPEAT_COOLDOWN, ability, registerAbility } from '../base';

/* ------------------------------------------------------------------------- */
/* Groudon                                                                   */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('cuchillada', 'Cuchillada', 'Normal', 'physical', 'melee')
    .power(45)
    .cooldown(0.6)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2.2)
    .radius(0.85)
    .halfAngle(55)
    .knockback(0.4)
    .active(0.2).recovery(0)
    .animation('attack')
    .impact('slash')
    .color(226, 191, 101)
    .description(
      'Zarpazo amplio de sus garras. Golpe cuerpo a cuerpo fiable. Ataque básico de Groudon.'
    )
);

registerAbility(
  ability('filoAbismo', 'Filo del Abismo', 'Ground', 'physical', 'aoe')
    .power(100)
    .cooldown(15)
    .range(4.5)
    .radius(3.2)
    .area('ground', 'instant', 0.9)
    .radial(0.35)
    .knockback(0.6)
    .startup(0.7, { animation: 'charge' })
    .armor(40)
    .recovery(0.7)
    .animation(null)
    .impact('ground')
    .color(214, 170, 88)
    .description(
      'Definitiva: abre una falla de 3,2 u a 4,5 u de distancia. Golpea una vez con 100 de potencia, el 100 % en el centro y el 35 % en el borde, y empuja a los alcanzados.'
    )
);

/* ------------------------------------------------------------------------- */
/* Onix                                                                      */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('atadura', 'Atadura', 'Rock', 'physical', 'melee')
    .power(65)
    .cooldown(0.7)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2.8)
    .radius(0.95)
    .halfAngle(65)
    .knockback(0.55)
    .active(0.225).recovery(0)
    .animation('attack')
    .impact('rock')
    .color(182, 161, 54)
    .description(
      'Golpe de cuerpo rocoso que tritura y empuja. Ataque básico de Onix.'
    )
);

registerAbility(
  ability('lanzarrocas', 'Lanzarrocas', 'Rock', 'physical', 'projectile')
    .power(85)
    .cooldown(4.5)
    .range(8)
    .radius(0.32)
    .projectile('rock', 13)
    .impact('rock')
    .knockback(0.3)
    .startup(0.2, { animation: 'charge' })
    .recovery(0.45)
    .animation('shoot')
    .color(182, 161, 54)
    .description(
      'Lanza una roca a 8 u para presionar a distancia. Su herramienta para no ser kited.'
    )
);

registerAbility(
  ability('excavar', 'Excavar', 'Ground', 'physical', 'aoe')
    .power(85)
    .cooldown(6)
    .range(0)
    .radius(1.2)
    // El aviso sigue al lanzador mientras se mueve bajo tierra: al emerger,
    // la erupción nace exactamente donde está.
    .aoePrepareMovement(({ caster }) => ({ x: caster.x, z: caster.z }))
    // Sin armadura: `onStart` ya lo hace invulnerable durante toda la carga.
    .startup(2, {  move: true })
    .recovery(0.4)
    .animation('attack')
    .area('burrow', 'instant', 0.75)
    .knockback(1.2)
    .onStart(
      ({
        targets,
        applyBuff,
        setCasterHidden,
        setCasterInvulnerable
      }) => {
        setCasterHidden(true);
        setCasterInvulnerable(true);
        const self = targets.find((target) => target.isSelf);
        if (self) {
          applyBuff(self, { stat: 'speed', multiplier: 1.5, duration: 2 });
        }
      }
    )
    .onCast(({ setCasterHidden, setCasterInvulnerable }) => {
      setCasterHidden(false);
      setCasterInvulnerable(false);
    })
    .impact('ground')
    .color(182, 161, 54)
    .description(
      'Se oculta bajo tierra durante 2 s: es invulnerable y gana un 50 % de velocidad. Al emerger, desata una erupción de 1,2 u centrada en sí mismo con 85 de potencia que empuja 1,2 u a los rivales alcanzados.'
    )
);

registerAbility(
  ability('fisura', 'Fisura', 'Ground', 'physical', 'aoe')
    .power(155)
    .cooldown(14)
    .range(2.5)
    .radius(3.4)
    .area('fissure', 'instant', 0.75)
    .radial(0.35)
    .knockback(0.9)
    .startup(0.6, { animation: 'charge' })
    .armor(40)
    .recovery(0.6)
    .animation(null)
    .impact('ground')
    .color(182, 161, 54)
    .description(
      'Definitiva: abre una fisura de 3,4 u a 2,5 u de distancia. Golpea una vez con 155 de potencia, el 100 % en el centro y el 35 % en el borde.'
    )
);

/* ------------------------------------------------------------------------- */
/* Celebi                                                                    */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('hojaMagica', 'Hoja Mágica', 'Grass', 'special', 'projectile')
    .power(45)
    // Las hojas guiadas persiguen el objetivo hasta el final.
    .cooldown(0.8)
    .range(8)
    .radius(0.26)
    .projectile('grass', 14)
    .impact('grass')
    .recovery(0.3)
    .animation('shoot')
    .color(143, 208, 90)
    .description(
      'Proyectil de hojas guiadas. 45 de potencia y 8 u de alcance. Ataque básico de Celebi.'
    )
);

registerAbility(
  ability('rayoSolar', 'Rayo Solar', 'Grass', 'special', 'beam')
    .power(85)
    .cooldown(8)
    .range(9.5)
    .radius(0.48)
    .startup(0.65, { animation: 'charge' })
    .recovery(0.55)
    .animation('shoot')
    .beam('grass')
    .impact('grass')
    .color(150, 224, 96)
    .description(
      'Se carga 0,65 s con la luz del sol y dispara un haz de 9,5 u que atraviesa a todos los rivales en línea. 85 de potencia.'
    )
);

registerAbility(
  ability('deseo', 'Deseo', 'Psychic', 'status', 'aoe')
    .power(0)
    .cooldown(12)
    .range(0)
    .radius(3.2)
    // Deseo es una concentración larga: la carga en bucle evita que el
    // personaje se quede congelado en la primera pose del twirl.
    .startup(1.2, { mode: 'loop', animation: 'charge' })
    .armor(40)
    .recovery(0.65)
    .animation('twirl')
    .heal(0.12)
    .area('recovery', 'instant', 0.8)
    .aoeEffect(({ targets, applyHeal }) => {
      // Sin resurrección: la onda cura a los aliados vivos dentro del radio.
      for (const target of targets) {
        if (!target.isAlly || target.isSelf || !target.hittable) continue;
        applyHeal(target, 0.18);
      }
    })
    .color(156, 224, 112)
    .description(
      'Pide un deseo: se concentra 1,2 s y libera una onda de 3,2 u que cura un 18 % de la vida máxima a los aliados vivos y un 12 % a Celebi. No revive. Si el daño agota la armadura durante la concentración, se cancela.'
    )
);

registerAbility(
  ability('futuroSiniestro', 'Futuro Siniestro', 'Psychic', 'special', 'aoe')
    .power(105)
    .cooldown(15)
    .range(5.5)
    .radius(2.8)
    .startup(1, { animation: 'charge' })
    .armor(50)
    .recovery(0.7)
    // El área es instantánea al terminar la carga; no hay clip de lanzamiento
    // después del impacto.
    .animation(null)
    .area('psychic', 'instant', 0.9)
    .radial(0.35)
    .slow(0.65, 2)
    .impact('psychic')
    .color(190, 140, 255)
    .description(
      'Definitiva: marca un punto a 5,5 u y, tras 1 s, cae una explosión psíquica de 2,8 u. 105 de potencia, el 100 % en el centro y el 35 % en el borde, y ralentiza un 35 % durante 2 s.'
    )
);

/* ------------------------------------------------------------------------- */
/* Lugia                                                                     */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('ondaMental', 'Onda Mental', 'Psychic', 'special', 'projectile')
    .power(50)
    .cooldown(0.8)
    .range(8.5)
    .radius(0.28)
    .projectile('psychic', 14)
    .impact('psychic')
    .recovery(0.35)
    .animation('shoot')
    .color(138, 169, 232)
    .description(
      'Proyectil psíquico compacto de 8,5 u. 50 de potencia y cadencia alta. Ataque básico de Lugia.'
    )
);

registerAbility(
  ability('marea', 'Marea', 'Water', 'special', 'aoe')
    .power(30)
    .cooldown(9)
    .range(4.5)
    .radius(3.2)
    .startup(0.35, { animation: 'charge', move: true })
    .armor(20)
    .recovery(0.5)
    .animation('shoot')
    .area('water', 'overTime', 2.5, 0.5)
    .aoeEffect(({ targets, applyHit, applyShield, applySlow, tick }) => {
      if (tick === 0) {
        for (const target of targets) {
          if (target.isAlly || target.isSelf) applyShield(target, 0.06, 4);
        }
      }
      for (const target of targets) {
        if (target.isAlly || target.isSelf) continue;
        applyHit(target, { control: false });
        applySlow(target, { multiplier: 0.7, duration: 1.2 });
      }
    })
    .impact('water')
    .color(96, 178, 240)
    .description(
      'Extiende una marea de 3,2 u a 4,5 u de distancia que permanece 2,5 s: 30 de daño por segundo y ralentiza un 30 % durante 1,2 s a quien siga dentro.'
    )
);

registerAbility(
  ability('ciclon', 'Ciclón', 'Flying', 'special', 'aoe')
    .power(45)
    .cooldown(4)
    .aoeMovement(({ originX, originZ, dirX, dirZ, elapsed, duration }) => {
      // Avanza hacia el frente a velocidad constante (sin frenar al final)
      // mientras se balancea lateralmente en forma de senoide (dos ciclos).
      const progress = Math.min(1, elapsed / duration);
      const travel = progress * 10;
      const sway = Math.sin(progress * Math.PI * 4) * 0.6;
      return {
        x: originX + dirX * travel - dirZ * sway,
        z: originZ + dirZ * travel + dirX * sway
      };
    })
    .range(2)
    .radius(2)
    .startup(0.3, { animation: 'charge' })
    .armor(25)
    .recovery(0.55)
    .animation('shoot')
    .area('cyclone', 'overTime', 2.5)
    .slow(0.65, 1.5)
    .impact('air')
    .color(198, 224, 255)
    .description(
      'Golpe de ala que desata un ciclón de 2 u de radio que avanza 10 u hacia delante a velocidad constante, con un vaivén senoidal de 0,6 u: 45 de daño por segundo durante 2,5 s y ralentiza un 35 % durante 1,5 s a quien siga dentro.'
    )
);

registerAbility(
  ability('aerochorro', 'Aerochorro', 'Flying', 'special', 'beam')
    .power(120)
    .cooldown(16)
    .range(11)
    .radius(0.55)
    .startup(0.8, { animation: 'charge' })
    .recovery(0.65)
    .animation('shoot')
    .beam('air')
    .impact('air')
    .knockback(2.2)
    .slow(0.7, 2)
    .color(138, 169, 232)
    .description(
      'Definitiva: carga 0,8 s y dispara un chorro de aire de 11 u que atraviesa a todos los rivales en línea. 120 de potencia, empuja 2,2 u y ralentiza un 30 % durante 2 s.'
    )
);

/* ------------------------------------------------------------------------- */
/* Ho-Oh                                                                     */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('golpeAlaHoOh', 'Golpe Ala', 'Flying', 'physical', 'melee')
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
    .color(255, 196, 96)
    .description(
      'Golpe de ala dorado de corto alcance. Ataque básico de Ho-Oh.'
    )
);

registerAbility(
  ability('pajaroOsado', 'Pájaro Osado', 'Flying', 'physical', 'dash')
    .power(100)
    .cooldown(6)
    .range(0)
    .radius(1)
    .dash(6)
    .knockback(1.2)
    .active(0.35).recovery(0.35)
    .startup(0.4, { animation: 'charge' })
    .animation('attack')
    .impact('air')
    .selfDamage(0.12)
    .color(255, 176, 76)
    .description(
      'Se eleva 0,4 s y se lanza 6 u en picado: 100 de potencia, empuja 1,2 u y le cuesta el 12 % de su vida máxima. Entrada y escape.'
    )
);

registerAbility(
  ability('recuperacionHoOh', 'Recuperación', 'Fire', 'status', 'aoe')
    .power(0)
    .cooldown(13)
    .range(0)
    .radius(3.2)
    .startup(0.75, { animation: 'charge' })
    .armor(40)
    .recovery(0.65)
    .animation(null)
    .heal(0.3)
    .area('recovery', 'instant', 0.75)
    .aoeEffect(({ targets, applyHeal }) => {
      // Ho-Oh se cura con `healSelf`; la onda dorada reparte el 15 % restante
      // entre los aliados que estén dentro del radio.
      for (const target of targets) {
        if (!target.isAlly || target.isSelf) continue;
        applyHeal(target, 0.15);
      }
    })
    .color(255, 196, 96)
    .description(
      'Se concentra 0,75 s entre llamas doradas: recupera el 30 % de su vida máxima y el 15 % de la de sus aliados en 3,2 u. Si el daño acumulado agota su armadura durante la concentración, se cancela.'
    )
);

registerAbility(
  ability('fuegoSagrado', 'Fuego Sagrado', 'Fire', 'physical', 'aoe')
    .power(50)
    .cooldown(3)
    // El vértice nace 1 u por delante de Ho-Oh y el cono avanza 7,5 u con una
    // apertura total de 25° (12,5° a cada lado del eje de lanzamiento).
    .range(1)
    .radius(7.5)
    .halfAngle(12.5)
    .aoeShape('cone')
    .startup(0.4, { animation: 'charge' })
    .recovery(1.5)
    .blockMovementDuringCast()
    .armor(60)
    .animation('shoot')
    .area('sacredFlame', 'overTime', 1.5, 0.5)
    .aoeEffect(({ targets, applyHit, applySlow, applyHeal }) => {
      for (const target of targets) {
        if (target.isAlly || target.isSelf) {
          applyHeal(target, 0.025);
          continue;
        }
        applyHit(target, { control: false });
        applySlow(target, { multiplier: 0.65, duration: 1.5 });
      }
    })
    .impact('fire')
    .color(255, 168, 56)
    .description(
      'Definitiva: exhala un cono de fuego sagrado de 25° desde 1 u por delante de Ho-Oh. Avanza 7,5 u y permanece 1,5 s: hace 50 de daño por segundo (75 en total) y ralentiza un 35 % durante 1,5 s a quien siga dentro.'
    )
);

/* ------------------------------------------------------------------------- */
/* Gyarados                                                                  */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('acuaCola', 'Acua Cola', 'Water', 'physical', 'melee')
    .power(55)
    .cooldown(0.7)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2.5)
    .radius(0.9)
    .halfAngle(60)
    .knockback(0.55)
    .active(0.22).recovery(0)
    .animation('attack')
    .impact('water')
    .color(76, 143, 214)
    .description(
      'Barrido amplio de su cola envuelta en agua. Golpe básico de Gyarados; alcanza a varios rivales en cono y los empuja.'
    )
);

registerAbility(
  ability('cascada', 'Cascada', 'Water', 'physical', 'dash')
    .power(70)
    .cooldown(5.5)
    .range(0)
    .radius(0.9)
    .dash(4.6)
    .knockback(0.9)
    .startup(0.2, { animation: 'charge' })
    .active(0.3).recovery(0.2)
    .animation('attack')
    .impact('water')
    .color(76, 143, 214)
    .description(
      'Se enrosca y se lanza 4,6 u con una estela de agua, arrollando a quien encuentre. Su herramienta para entrar o salir.'
    )
);

registerAbility(
  ability('triturarGyarados', 'Triturar', 'Dark', 'physical', 'melee')
    .power(85)
    .cooldown(6)
    .range(2.2)
    .radius(0.9)
    .halfAngle(50)
    .knockback(0.8)
    .startup(0.25)
    .active(0.25).recovery(0.1)
    .animation('attack')
    .impact('jaw')
    .color(126, 98, 166)
    .description(
      'Abre sus fauces y muerde con fuerza bruta. Golpe corto pero brutal que castiga a Psíquicos y Fantasmas.'
    )
);

registerAbility(
  ability('dragoaliento', 'Dragoaliento', 'Dragon', 'physical', 'beam')
    .power(150)
    .cooldown(15)
    .range(10)
    .radius(0.55)
    .beam('psychic')
    .impact('psychic')
    .slow(0.55, 2.5)
    .startup(0.55, { animation: 'charge' })
    .armor(40)
    .recovery(0.6)
    .animation('shoot')
    .color(128, 96, 230)
    .description(
      'Definitiva: exhala un dragoaliento en línea de 10 u que atraviesa a todos los rivales. 150 de potencia y ralentiza un 45 % durante 2,5 s: su parálisis. Se carga 0,55 s con 40 de armadura.'
    )
);

/* ------------------------------------------------------------------------- */
/* Suicune                                                                   */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('golpeCuerpo', 'Golpe Cuerpo', 'Normal', 'physical', 'melee')
    .power(80)
    .cooldown(0.8)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2.2)
    .radius(0.9)
    .halfAngle(60)
    .knockback(0.85)
    .active(0.24).recovery(0)
    .animation('attack')
    .impact('hit')
    .color(235, 228, 210)
    .description(
      'Embestida con todo el cuerpo que aparta a los rivales: 80 de potencia y 0,85 u de empuje. Ataque básico de Suicune; exige estar cerca.'
    )
);

registerAbility(
  ability('chorroAgua', 'Chorro de Agua', 'Water', 'special', 'projectile')
    .power(68)
    .cooldown(1.5)
    .range(8.5)
    .radius(0.22)
    .projectile('waterJet', 14)
    .impact('water')
    .recovery(0.3)
    .animation('shoot')
    .color(96, 176, 255)
    .description(
      'Dispara un chorro compacto de agua a 8,5 u con 68 de potencia. Ataque básico a distancia de Suicune.'
    )
);

registerAbility(
  ability('frioPolar', 'Frío Polar', 'Ice', 'special', 'aoe')
    .power(140)
    .cooldown(8)
    // El vértice nace 0,75 u por delante de Suicune y el cono avanza 7 u con
    // una apertura total de 60° (30° a cada lado del eje).
    .range(0.75)
    .radius(7)
    .halfAngle(30)
    .aoeShape('cone')
    .area('sheerCold', 'instant', 0.5)
    .blockMovementDuringCast()
    .radial(0.4)
    .slow(0.45, 2.5)
    .startup(0.85, { animation: 'charge' })
    .armor(50)
    // El cono es instantáneo al terminar la carga: sin clip de lanzamiento.
    .animation(null)
    .impact('ice')
    .color(200, 240, 255)
    .description(
      'Definitiva: canaliza el aire polar durante 1,3 s sin poder moverse (0,85 s de carga y 0,45 s de recuperación) y exhala un cono de 60° que nace 0,75 u por delante de Suicune y avanza 7 u. El golpe ocurre al terminar la carga: 140 de potencia (el 40 % en el borde) y 55 % de ralentización durante 2,5 s. La carga tiene 50 de armadura, el cono se disipa en 0,5 s y el enfriamiento es de 8 s. Si el daño agota la armadura durante la canalización, se cancela.'
    )
);

/* ------------------------------------------------------------------------- */
/* Kyogre                                                                    */
/* ------------------------------------------------------------------------- */

/**
 * Reparto de `Pulso Primigenio`: el primer pulso aporta el 37,5 % de la potencia
 * total y el resto se reparte entre los ticks siguientes. Con `.power(160)` y
 * dos ticks, son 60 + 100. Así `power` y `aoeDuration` son la única fuente de
 * verdad y el callback no puede desincronizarse de las tablas ni del HUD.
 */
const PRIMORDIAL_PULSE_FIRST_SHARE = 0.375;

registerAbility(
  ability('rafagaMarina', 'Ráfaga Marina', 'Water', 'special', 'projectile')
    .power(46)
    .cooldown(0.85)
    .range(8.5)
    .radius(0.24)
    .projectile('waterJet', 15)
    .impact('water')
    .recovery(0.3)
    .animation('shoot')
    .color(72, 152, 235)
    .description(
      'Dispara una ráfaga de agua comprimida a 8,5 u. 46 de potencia y cadencia alta. Ataque básico de Kyogre.'
    )
);

registerAbility(
  ability('remolinoMarino', 'Remolino Marino', 'Water', 'special', 'aoe')
    .power(34)
    .cooldown(8)
    .range(5)
    .radius(3)
    .startup(0.3, { animation: 'charge', move: true })
    .armor(25)
    .recovery(0.5)
    .animation('shoot')
    .area('cyclone', 'overTime', 2.5, 0.5)
    .slow(0.7, 1.5)
    .impact('water')
    .color(80, 170, 255)
    .description(
      'Abre un remolino de 3 u a 5 u de distancia que gira durante 2,5 s: 34 de daño por segundo (85 en total) y ralentiza un 30 % durante 1,5 s a quien siga dentro. Su herramienta para cortar pasillos.'
    )
);

registerAbility(
  ability('aguasCurativas', 'Aguas Curativas', 'Water', 'status', 'aoe')
    .power(0)
    .cooldown(12)
    .range(0)
    .radius(3.4)
    .startup(0.7, { animation: 'charge' })
    .armor(40)
    .recovery(0.6)
    .animation(null)
    .heal(0.25)
    .area('recovery', 'instant', 0.75)
    .aoeEffect(({ targets, applyHeal }) => {
      // Kyogre se cura con `healSelf`; la marea reparte el 15 % restante
      // entre los aliados que estén dentro del radio.
      for (const target of targets) {
        if (!target.isAlly || target.isSelf) continue;
        applyHeal(target, 0.15);
      }
    })
    .color(96, 186, 255)
    .description(
      'Se concentra 0,7 s y bendice las aguas: recupera el 25 % de su vida máxima y el 15 % de la de sus aliados en 3,4 u. Si el daño acumulado agota su armadura durante la concentración, se cancela.'
    )
);

registerAbility(
  ability('pulsoPrimigenio', 'Pulso Primigenio', 'Water', 'special', 'aoe')
    // En un área `overTime` el motor lee `power` como daño por segundo: 160
    // durante 1 s son 160 totales. El callback reparte 60 + 100 a partir de
    // este valor y de la duración.
    .power(160)
    .cooldown(16)
    .range(5)
    .radius(3.4)
    .startup(0.8, { animation: 'charge' })
    .armor(50)
    .recovery(0.6)
    .animation(null)
    // Dos ticks: el primero cae al aparecer el área y el segundo a los 0,5 s.
    .area('primordialPulse', 'overTime', 1, 0.5)
    .radial(0.4)
    .impact('water')
    .color(64, 150, 240)
    .aoeEffect(({ def, targets, tick, applyHit, applyHeal }) => {
      const first = tick === 0;
      // El motor cobra `def.power` por segundo en áreas `overTime`; la duración
      // da el total del lanzamiento y el número de ticks reparte el segundo
      // pulso. Con power 160 y 1 s salen 60 + 100.
      const ticks = Math.max(
        1,
        Math.ceil(def.aoeDuration / def.aoeTickInterval)
      );
      const totalPower = def.power * def.aoeDuration;
      const firstShare = ticks === 1 ? 1 : PRIMORDIAL_PULSE_FIRST_SHARE;
      const power = first
        ? totalPower * firstShare
        : (totalPower * (1 - firstShare)) / Math.max(1, ticks - 1);
      const knockback = first ? 0.5 : 1.1;

      for (const target of targets) {
        if (target.isAlly) {
          // La curación llega con el segundo pulso para premiar quedarse
          // dentro del área hasta el final.
          if (!first) applyHeal(target, 0.1);
          continue;
        }
        if (!target.hittable || !target.lineOfSight) continue;
        applyHit(target, {
          power: power * target.radialMultiplier,
          control: false,
          knockback,
          slow: first ? null : { multiplier: 0.65, duration: 2 }
        });
      }
    })
    .description(
      'Definitiva: marca una zona de 3,4 u a 5 u y libera dos pulsos primigenios. El primero golpea al aparecer con 60 de potencia y 0,5 u de empuje; el segundo, a los 0,5 s, golpea con 100 de potencia, empuja 1,1 u y ralentiza un 35 % durante 2 s. El daño cae al 40 % en el borde (160 en total en el centro) y el segundo pulso cura un 10 % a los aliados dentro del área, incluido Kyogre. La carga de 0,8 s tiene 50 de armadura.'
    )
);

/* ------------------------------------------------------------------------- */
/* Rayquaza                                                                  */
/* ------------------------------------------------------------------------- */

registerAbility(
  ability('garraDraco', 'Garra Dragón', 'Dragon', 'physical', 'melee')
    .power(50)
    .cooldown(0.7)
    .repeatCooldown(BASIC_MELEE_REPEAT_COOLDOWN)
    .range(2.4)
    .radius(0.9)
    .halfAngle(60)
    .knockback(0.4)
    .active(0.2).recovery(0)
    .animation('attack')
    .impact('slash')
    .color(96, 200, 120)
    .description(
      'Zarpazo amplio cargado de energía dracónica. Golpe básico de Rayquaza; alcanza a varios rivales en cono.'
    )
);

registerAbility(
  ability('vueloDraco', 'Vuelo Dragón', 'Flying', 'physical', 'dash')
    .power(70)
    .cooldown(6)
    .range(0)
    .radius(0.95)
    .dash(5.5)
    .knockback(0.9)
    .startup(0.25, { animation: 'charge' })
    .active(0.3).recovery(0.25)
    .animation('attack')
    .impact('air')
    .color(96, 200, 120)
    .description(
      'Se enrosca y se lanza 5,5 u en línea recta, arrollando a quien encuentre con 70 de potencia y 0,9 u de empuje. Su herramienta para entrar o escapar.'
    )
);

registerAbility(
  ability('furiaDraco', 'Furia Dragón', 'Dragon', 'special', 'beam')
    .power(85)
    .cooldown(9)
    .range(9.5)
    .radius(0.5)
    .startup(0.55, { animation: 'charge' })
    .armor(35)
    .recovery(0.55)
    .animation('shoot')
    .beam('psychic')
    .impact('psychic')
    .slow(0.7, 1.5)
    .color(128, 96, 230)
    .description(
      'Carga 0,55 s y exhala un haz dracónico de 9,5 u que atraviesa a todos los rivales en línea. 85 de potencia y 30 % de ralentización durante 1,5 s.'
    )
);

registerAbility(
  ability('ascensoDraco', 'Ascenso Draco', 'Flying', 'physical', 'aoe')
    .power(130)
    .cooldown(16)
    .range(0)
    .radius(3.2)
    // La marca sigue a Rayquaza mientras se eleva: la onda nace donde cae.
    .aoePrepareMovement(({ caster }) => ({ x: caster.x, z: caster.z }))
    // Sin armadura: `onStart` ya lo hace invulnerable durante toda la subida.
    .startup(1, { animation: 'charge', move: true })
    .recovery(0.55)
    .animation('attack')
    .area('air', 'instant', 0.9)
    .radial(0.35)
    .knockback(1.1)
    .slow(0.65, 2)
    .onStart(
      ({
        targets,
        applyBuff,
        setCasterHidden,
        setCasterInvulnerable
      }) => {
        setCasterHidden(true);
        setCasterInvulnerable(true);
        const self = targets.find((target) => target.isSelf);
        if (self) {
          applyBuff(self, { stat: 'speed', multiplier: 1.4, duration: 1 });
        }
      }
    )
    .onCast(({ setCasterHidden, setCasterInvulnerable }) => {
      setCasterHidden(false);
      setCasterInvulnerable(false);
    })
    .impact('air')
    .color(96, 200, 120)
    .description(
      'Definitiva: se eleva durante 1 s invulnerable y un 40 % más rápido, y cae en picado sobre su posición con una onda de 3,2 u. 130 de potencia, el 100 % en el centro y el 35 % en el borde, empuja 1,1 u y ralentiza un 35 % durante 2 s.'
    )
);
