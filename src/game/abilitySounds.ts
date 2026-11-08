/**
 * Sonidos de habilidad y de impacto.
 *
 * Cada entrada es una ruta relativa a `public/audio/sfx/`. Los MP3 se importan
 * con `pnpm sfx` desde el álbum «Pokemon SFX Gen 5 - Attack Moves»; ver
 * public/audio/CREDITS.md. Las habilidades sin entrada no reproducen sonido.
 */

/** Sonido de lanzamiento por id de habilidad. */
export const ABILITY_CAST_SOUNDS: Record<string, string> = {
  // Comunes
  proteccion: 'abilities/proteccion.mp3',
  impulso: 'abilities/impulso.mp3',

  // Pikachu
  placaje: 'abilities/placaje.mp3',
  ataqueRapido: 'abilities/ataqueRapido.mp3',
  rayo: 'abilities/rayo.mp3',
  impactrueno: 'abilities/impactrueno.mp3',

  // Voltorb
  chispa: 'abilities/chispa.mp3',
  rollout: 'abilities/rollout.mp3',
  ondaTrueno: 'abilities/ondaTrueno.mp3',
  explosion: 'abilities/explosion.mp3',

  // Gengar
  lenguetazo: 'abilities/lenguetazo.mp3',
  bolaSombra: 'abilities/bolaSombra.mp3',
  bombaLodo: 'abilities/bombaLodo.mp3',
  comeSuenos: 'abilities/comeSuenos.mp3',

  // Bulbasaur
  paralizador: 'abilities/paralizador.mp3',
  hojaAfilada: 'abilities/hojaAfilada.mp3',
  llueveHojas: 'abilities/llueveHojas.mp3',

  // Charmander
  aranazo: 'abilities/aranazo.mp3',
  giroFuego: 'abilities/giroFuego.mp3',
  lanzallamas: 'abilities/lanzallamas.mp3',
  anilloIgneo: 'abilities/anilloIgneo.mp3',

  // Squirtle
  acuaJet: 'abilities/acuaJet.mp3',
  rayoBurbuja: 'abilities/rayoBurbuja.mp3',
  hidrobomba: 'abilities/hidrobomba.mp3',

  // Lucario
  garraMetal: 'abilities/garraMetal.mp3',
  velocidadExtrema: 'abilities/velocidadExtrema.mp3',
  esferaAura: 'abilities/esferaAura.mp3',
  combateCercano: 'abilities/combateCercano.mp3',

  // Greninja
  shurikenAgua: 'abilities/shurikenAgua.mp3',
  tajoUmbro: 'abilities/tajoUmbro.mp3',
  sombraVil: 'abilities/sombraVil.mp3',
  pulsoUmbro: 'abilities/pulsoUmbro.mp3',

  // Articuno
  golpeAla: 'abilities/golpeAla.mp3',
  rayoHielo: 'abilities/rayoHielo.mp3',
  vientoGelido: 'abilities/vientoGelido.mp3',
  ventisca: 'abilities/ventisca.mp3',

  // Zapdos
  picoTaladro: 'abilities/picoTaladro.mp3',
  descarga: 'abilities/descarga.mp3',
  trueno: 'abilities/trueno.mp3',

  // Moltres
  ataqueAereo: 'abilities/ataqueAereo.mp3',
  corteAereo: 'abilities/corteAereo.mp3',
  tajoAereo: 'abilities/tajoAereo.mp3',
  ondaIgnea: 'abilities/ondaIgnea.mp3',
  ataqueCeleste: 'abilities/ataqueCeleste.mp3',

  // Mewtwo
  telequinesis: 'abilities/telequinesis.mp3',
  teletransporte: 'abilities/teletransporte.mp3',
  psiquico: 'abilities/psiquico.mp3',
  psicoataque: 'abilities/psicoataque.mp3',

  // Mew
  psicogolpe: 'abilities/psicogolpe.mp3',
  agilidad: 'abilities/agilidad.mp3',
  premonicion: 'abilities/premonicion.mp3',
  recuperacion: 'abilities/recuperacion.mp3',

  // Scyther
  golpeFuria: 'abilities/golpeFuria.mp3',
  danzaEspada: 'abilities/danzaEspada.mp3',
  tijeraX: 'abilities/tijeraX.mp3',

  // Tyranitar
  triturar: 'abilities/triturar.mp3',
  avalancha: 'abilities/avalancha.mp3',
  terremoto: 'abilities/terremoto.mp3',
  rocaAfilada: 'abilities/rocaAfilada.mp3',

  // Groudon
  cuchillada: 'abilities/cuchillada.mp3',
  filoAbismo: 'abilities/filoAbismo.mp3',

  // Celebi
  hojaMagica: 'abilities/hojaMagica.mp3',
  rayoSolar: 'abilities/rayoSolar.mp3',
  deseo: 'abilities/deseo.mp3',
  futuroSiniestro: 'abilities/futuroSiniestro.mp3',

  // Lugia
  ondaMental: 'abilities/ondaMental.mp3',
  marea: 'abilities/marea.mp3',
  ciclon: 'abilities/ciclon.mp3',
  aerochorro: 'abilities/aerochorro.mp3',

  // Ho-Oh
  golpeAlaHoOh: 'abilities/golpeAlaHoOh.mp3',
  pajaroOsado: 'abilities/pajaroOsado.mp3',
  recuperacionHoOh: 'abilities/recuperacionHoOh.mp3',
  fuegoSagrado: 'abilities/fuegoSagrado.mp3'
};

/**
 * Impacto genérico. Se elige según la efectividad del tipo: así un golpe súper
 * eficaz suena distinto a uno poco eficaz sin duplicar sonidos por habilidad.
 */
export const HIT_SOUNDS = {
  normal: 'hit/normal.mp3',
  super: 'hit/super.mp3',
  weak: 'hit/weak.mp3'
} as const;

/** Todas las rutas que hay que precargar al empezar una partida. */
export const ALL_SFX_PATHS: readonly string[] = [
  ...new Set([...Object.values(ABILITY_CAST_SOUNDS), ...Object.values(HIT_SOUNDS)])
];
