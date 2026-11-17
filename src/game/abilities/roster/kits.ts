import { ability, registerAbility } from '../base';

/* ------------------------------------------------------------------------- */
/* Kits del rediseño                                                         */
/* ------------------------------------------------------------------------- */

/*
 * Habilidades nuevas o reescritas para que cada kit coincida con su ficha.
 * Los números definitivos no se escriben aquí: los aplica `KIT_BALANCE` al
 * construir `MOVESETS`. Así `balance.md` sigue siendo la única fuente de
 * verdad y un cambio de balance no obliga a tocar la geometría de la habilidad.
 */

/* Bulbasaur */

registerAbility(
  ability('semilladora', 'Semilladora', 'Grass', 'special', 'projectile')
    .range(7.5)
    .radius(0.28)
    .projectile('grass', 15)
    .impact('grass')
    .startup(0.12)
    .recovery(0.32)
    .animation('shoot')
    .color(120, 200, 92)
    .description('Proyectil de semillas de alcance medio. Sin control: la presión de Bulbasaur.')
);

registerAbility(
  ability('drenadoras', 'Drenadoras', 'Grass', 'special', 'projectile')
    .range(8)
    .radius(0.3)
    .projectile('grass', 13)
    .impact('grass')
    .startup(0.2)
    .recovery(0.4)
    .animation('shoot')
    .heal(0.08)
    .healOnHit()
    .dot({ id: 'drenadoras', power: 12, duration: 4, interval: 0.5 })
    .color(96, 184, 84)
    .description('Semilla parásita: daño directo y robo de vida si impacta. Reaplicar no acumula.')
);

registerAbility(
  ability('raicesEnredadoras', 'Raíces Enredadoras', 'Grass', 'special', 'aoe')
    .range(6)
    .radius(2.4)
    .area('grass', 'overTime', 2.5, 0.5)
    .startup(0.3)
    .recovery(0.45)
    .slow(0.55, 1.5)
    .animation('strike')
    .color(92, 168, 76)
    .description('Zona de raíces que ralentiza a los enemigos dentro. La zona persiste tras el casteo.')
);

registerAbility(
  ability('floracion', 'Floración', 'Grass', 'special', 'aoe')
    .range(0)
    .radius(3.4)
    .area('grass', 'overTime', 2.5, 0.5)
    .startup(0.75, { animation: 'charge' })
    .recovery(0.7)
    .blockMovementDuringCast()
    .slow(0.6, 1.5)
    .animation(null)
    .color(140, 220, 110)
    .description('Definitiva: gran zona de polen que daña y ralentiza a los enemigos en varios pulsos.')
);

/* Squirtle */

registerAbility(
  ability('pistolaAgua', 'Pistola Agua', 'Water', 'special', 'projectile')
    .range(7)
    .radius(0.26)
    .projectile('waterJet', 17)
    .impact('water')
    .recovery(0.3)
    .animation('shoot')
    .color(86, 170, 240)
    .description('Chorro de agua rápido de alcance corto-medio. Ataque básico de Squirtle.')
);

registerAbility(
  ability('veloDeAgua', 'Velo de Agua', 'Water', 'status', 'aoe')
    .range(0)
    .radius(2.6)
    .area('water', 'instant', 0.8)
    .startup(0.2)
    .recovery(0.35)
    .animation('charge')
    .aoeEffect(({ targets, applyShield }) => {
      for (const target of targets) {
        if (target.isAlly || target.isSelf) applyShield(target, 0.08, 4);
      }
    })
    .color(120, 200, 255)
    .description('Burbuja protectora: escuda a Squirtle y a los aliados en 2,6 u con un 8 % de sus PV máximos durante 4 s.')
);

/* Voltorb */

registerAbility(
  ability('rodamiento', 'Rodamiento', 'Normal', 'physical', 'melee')
    .range(2)
    .radius(0.7)
    .halfAngle(50)
    .active(0.16)
    .animation('twirl')
    .impact('hit')
    .color(220, 220, 210)
    .description('Giro corto y rápido. Ataque básico de Voltorb, sin control.')
);

registerAbility(
  ability('rodar', 'Rodar', 'Normal', 'physical', 'dash')
    .dash(4.5)
    .radius(0.9)
    .knockback(0.5)
    .active(0.28)
    .recovery(0)
    .animation('twirl')
    .impact('electric')
    .color(247, 208, 44)
    .description('Rueda hacia delante atravesando enemigos y golpeando a su paso.')
);

registerAbility(
  ability('ondaTruenoCircular', 'Onda Trueno', 'Electric', 'special', 'aoe')
    .range(0)
    .radius(3)
    .area('thunder', 'instant', 1)
    .startup(0.25, { animation: 'charge' })
    .recovery(0.4)
    .slow(0.55, 1.8)
    .animation(null)
    .impact('electric')
    .color(247, 208, 44)
    .description('Descarga circular centrada en Voltorb: daña y ralentiza a los enemigos cercanos.')
);

/* Eevee */

registerAbility(
  ability('placajeEevee', 'Placaje', 'Normal', 'physical', 'melee')
    .range(1.8)
    .radius(0.7)
    .halfAngle(50)
    .active(0.16)
    .animation('attack')
    .impact('hit')
    .color(235, 228, 210)
    .description('Golpe rápido de corto alcance. Ataque básico de Eevee.')
);

registerAbility(
  ability('adaptacion', 'Adaptación', 'Normal', 'status', 'self')
    .range(0)
    .radius(1)
    .recovery(0.1)
    .animation('charge')
    .color(235, 228, 210)
    .description('Cambia al siguiente estado de Eevee: Agilidad (+15 % VEL), Resistencia (+15 % DF/DE) o Potencia (+15 % AF/AE). El cambio es manual y determinista.')
);

registerAbility(
  ability('ataqueRapidoEevee', 'Ataque Rápido', 'Normal', 'physical', 'dash')
    .dash(4.8)
    .radius(0.9)
    .knockback(0.4)
    .active(0.26)
    .recovery(0)
    .animation('quickstrike')
    .impact('hit')
    .color(240, 240, 230)
    .description(
      'Dash corto de Eevee. Con Agilidad llega más lejos, con Resistencia deja un escudo al terminar y con Potencia pega más.'
    )
);

registerAbility(
  ability('ultimoRecurso', 'Último Recurso', 'Normal', 'physical', 'melee')
    .range(2.6)
    .radius(1)
    .halfAngle(60)
    .startup(0.5, { animation: 'charge' })
    .active(0.25)
    .recovery(0.4)
    .knockback(0.6)
    .animation('punch')
    .impact('hit')
    .color(255, 245, 220)
    .description(
      'Definitiva: golpe corto con preparación visible. Con Agilidad golpea tres veces, con Resistencia deja un escudo y con Potencia concentra todo el daño en un golpe.'
    )
);

/* Mew */

registerAbility(
  ability('mimica', 'Mímica', 'Psychic', 'special', 'projectile')
    .range(9)
    .radius(0.3)
    .projectile('psychic', 15)
    .impact('psychic')
    .startup(0.15)
    .recovery(0.4)
    .animation('shoot')
    .color(240, 160, 220)
    .description('Copia la forma de un ataque visto y la lanza como proyectil psíquico. Aproximación determinista de Mímica.')
);

/* Zapdos */

registerAbility(
  ability('electropico', 'Electropico', 'Electric', 'special', 'projectile')
    .range(5.5)
    .radius(0.26)
    .projectile('electric', 18)
    .impact('electric')
    .recovery(0.3)
    .animation('shoot')
    .color(247, 208, 44)
    .description('Púa eléctrica rápida. Ataque básico de Zapdos a media distancia.')
);

registerAbility(
  ability('ondaTruenoZapdos', 'Onda Trueno', 'Electric', 'special', 'aoe')
    .range(7.5)
    .radius(1.6)
    .area('thunder', 'instant', 1)
    .startup(0.2, { animation: 'charge' })
    .recovery(0.35)
    .slow(0.55, 1.5)
    .animation(null)
    .impact('electric')
    .color(247, 208, 44)
    .description('Orbe eléctrico que estalla en área pequeña y ralentiza a los alcanzados.')
);

/* Suicune */

registerAbility(
  ability('veloAurora', 'Velo Aurora', 'Water', 'status', 'aoe')
    .range(4)
    .radius(2)
    .area('water', 'overTime', 3, 1)
    .startup(0.2)
    .recovery(0.4)
    .animation('charge')
    .aoeEffect(({ targets, applyShield, applySlow, tick }) => {
      if (tick === 0) {
        for (const target of targets) {
          if (target.isAlly || target.isSelf) applyShield(target, 0.07, 4);
        }
      }
      for (const target of targets) {
        if (!target.isAlly && !target.isSelf) {
          applySlow(target, { multiplier: 0.8, duration: 1 });
        }
      }
    })
    .color(150, 220, 255)
    .description('Aurora protectora en el suelo: escuda a los aliados que entran y ralentiza a los enemigos que la cruzan.')
);

registerAbility(
  ability('chorroAgua', 'Chorro de Agua', 'Water', 'special', 'beam')
    .range(7)
    .radius(0.45)
    .impact('water')
    .beam('water')
    .startup(0.25)
    .recovery(0.45)
    .knockback(1.2)
    .slow(0.75, 1.5)
    .animation('shoot')
    .color(86, 170, 240)
    .description('Chorro recto que empuja y ralentiza. Limpia efectos básicos en la ficción del kit.')
);

registerAbility(
  ability('auroraBoreal', 'Aurora Boreal', 'Water', 'status', 'aoe')
    .range(0)
    .radius(4)
    .area('water', 'overTime', 4, 1)
    .startup(0.4, { animation: 'charge' })
    .recovery(0.6)
    .blockMovementDuringCast()
    .heal(0.1)
    .animation(null)
    .aoeEffect(({ targets, applyShield, applySlow, applyHeal, tick }) => {
      if (tick === 0) {
        for (const target of targets) {
          if (target.isAlly || target.isSelf) applyShield(target, 0.12, 5);
        }
      }
      for (const target of targets) {
        if (target.isAlly || target.isSelf) applyHeal(target, 0.02);
        else applySlow(target, { multiplier: 0.75, duration: 1 });
      }
    })
    .color(170, 230, 255)
    .description('Definitiva: campo de aurora que escuda a los aliados, los cura poco a poco y ralentiza a los enemigos. Suicune recupera además un 10 % al lanzarla.')
);

/* Groudon */

registerAbility(
  ability('erupcionPrimigenia', 'Erupción Primigenia', 'Ground', 'physical', 'aoe')
    .range(5)
    .radius(3.2)
    .area('ground', 'instant', 1.2)
    .startup(0.6, { animation: 'charge' })
    .recovery(0.6)
    .knockback(0.8)
    .animation(null)
    .impact('ground')
    .color(206, 142, 74)
    .description('Definitiva: pilares de tierra que emergen en arco y bloquean el paso. Aproximación circular del arco de 120°.')
);

/* Raikou */

registerAbility(
  ability('colmilloTrueno', 'Colmillo Trueno', 'Electric', 'physical', 'melee')
    .range(2.4)
    .radius(0.8)
    .halfAngle(50)
    .active(0.18)
    .animation('attack')
    .impact('electric')
    .color(247, 208, 44)
    .description('Mordisco eléctrico de corto alcance. Ataque básico de Raikou y aplicación de Presa.')
);

registerAbility(
  ability('rayoFulminante', 'Rayo Fulminante', 'Electric', 'physical', 'dash')
    .dash(5.5)
    .radius(0.9)
    .knockback(0.4)
    .active(0.28)
    .recovery(0)
    .animation('quickstrike')
    .impact('electric')
    .color(255, 238, 88)
    .description('Dash de caza. Si alcanza a la Presa, el enfriamiento se reduce en la ficción del kit.')
);

registerAbility(
  ability('rugidoTormenta', 'Rugido de Tormenta', 'Electric', 'status', 'aoe')
    .range(0)
    .radius(8)
    .area('thunder', 'instant', 1)
    .startup(0.25, { animation: 'charge' })
    .recovery(0.5)
    .slow(0.85, 2)
    .buff('speed', 1.25, 3)
    .animation(null)
    .color(255, 238, 88)
    .description('Rugido que revela y ralentiza a los enemigos cercanos y acelera a Raikou durante 3 s.')
);

registerAbility(
  ability('cazaRelampago', 'Caza Relámpago', 'Electric', 'physical', 'beam')
    .range(14)
    .radius(0.5)
    .impact('electric')
    .beam('electric')
    .startup(0.5, { animation: 'charge' })
    .recovery(0.55)
    .animation(null)
    .color(255, 245, 120)
    .description('Definitiva: línea de 14 u. Castiga con fuerza a la Presa y atraviesa al resto.')
);

/* Entei */

registerAbility(
  ability('garraVolcanica', 'Garra Volcánica', 'Fire', 'physical', 'melee')
    .range(2.5)
    .radius(0.9)
    .halfAngle(60)
    .knockback(0.4)
    .active(0.2)
    .animation('attack')
    .impact('fire')
    .color(240, 120, 50)
    .description('Zarpazo de magma de corto alcance. Ataque básico de Entei.')
);

registerAbility(
  ability('embestidaVolcanica', 'Embestida Volcánica', 'Fire', 'physical', 'dash')
    .dash(4.5)
    .radius(0.95)
    .knockback(0.8)
    .active(0.3)
    .recovery(0)
    .animation('quickstrike')
    .impact('fire')
    .color(255, 140, 60)
    .description('Embestida en llamas que empuja con fuerza a los enemigos del camino.')
);

registerAbility(
  ability('estallido', 'Estallido', 'Fire', 'special', 'aoe')
    .range(6)
    .radius(2.6)
    .area('fire', 'instant', 1)
    .startup(0.5, { animation: 'charge' })
    .recovery(0.5)
    .slow(0.7, 2)
    .animation(null)
    .impact('fire')
    .color(255, 120, 40)
    .description('Aviso en el suelo y explosión de fuego que ralentiza. Entei elige dónde pelear.')
);

registerAbility(
  ability('caldera', 'Caldera', 'Fire', 'special', 'aoe')
    .range(5)
    .radius(4)
    .area('fire', 'overTime', 3, 0.5)
    .startup(0.5, { animation: 'charge' })
    .recovery(0.6)
    .slow(0.75, 1.5)
    .animation(null)
    .impact('fire')
    .color(255, 100, 30)
    .description('Definitiva: caldera de 4 u que permanece 3 s, dañando y ralentizando a quien se quede dentro.')
);

/* Arcanine */

registerAbility(
  ability('mordisco', 'Mordisco', 'Dark', 'physical', 'melee')
    .range(1.8)
    .radius(0.7)
    .halfAngle(45)
    .knockback(0.25)
    .active(0.18)
    .animation('attack')
    .impact('jaw')
    .color(200, 120, 60)
    .description('Mordisco rápido. Ataque básico de Arcanine, el perseguidor del roster.')
);

registerAbility(
  ability('colmilloIgneo', 'Colmillo Ígneo', 'Fire', 'physical', 'melee')
    .range(2)
    .radius(0.75)
    .halfAngle(45)
    .slow(0.85, 1.2)
    .dot({ id: 'quemadura', power: 12, duration: 4, interval: 0.5 })
    .active(0.22)
    .animation('attack')
    .impact('fire')
    .color(255, 140, 60)
    .description('Mordisco en llamas que quema y ralentiza brevemente. Mantiene el contacto.')
);

registerAbility(
  ability('enviteIgneo', 'Envite Ígneo', 'Fire', 'physical', 'dash')
    .dash(6)
    .radius(1)
    .knockback(0.8)
    .startup(0.7, { animation: 'charge' })
    .active(0.35)
    .recovery(0.4)
    .animation('quickstrike')
    .impact('fire')
    .color(255, 100, 40)
    .description('Definitiva: carga visible y envite de 6 u que arrastra a los enemigos. Sin autodaño en esta versión.')
);


/* Gyarados */

registerAbility(
  ability('hidrotormenta', 'Hidrotormenta', 'Water', 'physical', 'aoe')
    .range(4)
    .radius(3.4)
    .area('whirl', 'overTime', 4, 0.5)
    .startup(0.5, { animation: 'charge' })
    .recovery(0.6)
    .blockMovementDuringCast()
    .slow(0.7, 1.5)
    .animation(null)
    .impact('water')
    .color(80, 160, 240)
    .description('Definitiva: arrastra a los enemigos hacia una zona de agua de 3,4 u que permanece 4 s, dañando y ralentizando a quien siga dentro.')
);
