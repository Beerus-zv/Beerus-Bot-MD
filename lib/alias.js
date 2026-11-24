/**
 * Nombres cortos de los comandos.
 *
 * El nombre largo (el del archivo en commands/) sigue funcionando tal cual:
 * aqui solo se define con que nombre corto se muestra cada comando en el
 * menu y como se registra el alias.
 *
 *   clave   = nombre largo (canonico, sigue funcionando)
 *   valor   = nombre corto (preferido, el que se muestra en el menu)
 */
export const NOMBRES_CORTOS = {
  // ── Grupo ──
  listmembers: 'miembros',
  listadmins: 'admins',
  listgroups: 'grupos',
  groupinfo: 'ginfo',
  creategroup: 'nuevo',
  setname: 'nombre',
  setdesc: 'desc',
  resetlink: 'link',
  requests: 'reqs',
  approve: 'apro',
  reject: 'rech',
  promote: 'promo',
  demote: 'demo',
  delete: 'del',
  restrict: 'restr',
  system: 'sys',
  ephemeral: 'eph',
  history: 'hist',
  invite: 'inv',
  hidetag: 'tags',

  // ── Seguridad y multimedia ──
  antilink: 'anti',
  advertencia: 'adv',
  stickervideo: 'svideo',
  stickeraudio: 'saudio',
  stickers: 'stk',

  // ── Entretenimiento y juegos ──
  truthordare: 'verdad',
  compliment: 'elogio',
  pickup: 'liga',
  ahorcado: 'ahorca',
  poker: 'pkr',
  calcular: 'calc',
  estilizar: 'estil',

  // ── Economia, perfil y bienvenida ──
  economy: 'eco',
  profile: 'perfil',
  welcome: 'bienv',

  // ── Internet y descargas ──
  youtube: 'yt',
  traducir: 'trad',
  leerurl: 'url',
  descargar: 'dl',
  tiktok: 'tt',
  facebook: 'fb',
  instagram: 'ig',
  mediafire: 'mf',
  twitter: 'x',
}

/**
 * Alias de funcion por comando (ademas del nombre corto del menu).
 * TODOS estan registrados en el mapa de comandos de index.js.
 */
export const ALIAS_EXTRA = {
  // ── Generales ──
  menu: ['m'],
  info: ['i'],
  ping: ['p'],
  dado: ['dice'],

  // ── Multimedia ──
  sticker: ['s'],
  stickervideo: ['sv'],
  stickeraudio: ['sa', 'stickersonido'],
  efecto: ['fx'],
  revelar: ['vv', 'viewonce'],
  voz: ['v', 'tts', 'speak'],

  // ── Grupo y seguridad ──
  encuesta: ['poll'],
  reaccionar: ['r', 'react', 'respuesta'],
  groupinfo: ['gi'],
  listmembers: ['lm'],
  listadmins: ['la'],
  listgroups: ['lg'],
  invite: ['inv'],
  resetlink: ['rl'],
  ephemeral: ['ep'],
  hidetag: ['ht'],
  delete: ['del', 'borrar', 'eliminar'],
  welcome: ['bienvenida', 'saludo'],
  bye: ['despedida'],
  alert: ['al'],
  advertencia: ['adv'],

  // ── Socket y configuracion ──
  socket: ['cfg', 'config'],
  bots: ['sockets'],
  prefix: ['prefijo', 'prefijos'],
  self: ['privado'],
  join: ['unir'],
  setbotname: ['botname'],
  setbotowner: ['setowner'],
  setbotlink: ['setlink'],
  setbotcurrency: ['setcurrency'],
  setbotprefix: ['setprefix'],
  setbanner: ['setmenubanner'],
  setimage: ['setpfp'],

  // ── Reportes, utilidades y perfil ──
  report: ['reporte', 'sug', 'suggest'],
  say: ['decir'],
  gitclone: ['git'],
  warnlist: ['listwarns', 'warns'],
  primary: ['setprimary'],
  setpasatiempo: ['sethobby', 'pasatiempo'],
  delpasatiempo: ['removehobby'],
  antistatus: ['antiestados'],
  anticall: ['antillamadas'],
  juegos: ['game', 'juego'],

  // ── Internet y descargas ──
  buscar: ['g', 'google', 'search'],
  youtube: ['y', 'yt'],
  wiki: ['wikipedia'],
  clima: ['cl', 'tiempo', 'weather'],
  traducir: ['tr', 'trad', 'translate'],
  leerurl: ['url', 'web'],
  pokedex: ['pk', 'pdex'],
  gitinfo: ['gh', 'github'],
  acortar: ['shorten'],
  letra: ['ly', 'lyrics'],
  descargar: ['d', 'dl'],
  tiktok: ['tt'],
  facebook: ['fb'],
  instagram: ['ig'],
  mediafire: ['mf'],
  twitter: ['x'],

  // ── IA ──
  chatgpt: ['gpt', 'ai', 'ask'],
  ia: ['oraculo'],

  // ── Gacha y VIP ──
  collection: ['coleccion'],
  gachaclaim: ['gclaim'],
  setcardimage: ['sci'],

  // ── Interacciones ──
  interaccion: ['int', 'interacciones'],
  kiss: ['beso'],
  hug: ['abrazo'],
  slap: ['bofeta'],
  bite: ['muerde'],
  tickle: ['cosquillas'],
  kick: ['patada'],
  patada: ['patear'],
  highfive: ['choca'],
  handhold: ['manitas'],
  baka: ['idiota'],
  cry: ['llorar'],
  wave: ['saludar'],
  poke: ['picar'],
  stare: ['mirar'],
  // Neko: nuevas interacciones de anime
  dance: ['bailar'],
  laugh: ['reir'],
  happy: ['celebrar'],
  smile: ['sonreir'],
  angry: ['furioso', 'enojado'],
  nom: ['comer'],
  tableflip: ['voltermesa'],
  thumbsup: ['aprobar'],
  yawn: ['bostezar'],

  // ── NSFW (lote Neko): alias en español ──
  rule34: ['r34', 'rule'],
  hentai: ['h', 'porno'],
  danbooru: ['dbooru'],
  ass: ['poto'],
  nekomimi: ['neko'],
  blowjob: ['mamada', 'bj'],
  cowgirl: ['vaquera'],
  fuck: ['coger'],
  fap: ['paja'],
  spank: ['nalgada'],
  squirt: ['chorro'],
  undress: ['encuerar'],
  yuri: ['tijeras'],
  sixnine: ['69'],

  // ── Banco y economía (lote Neko) ──
  deposit: ['dep', 'depositar'],
  withdraw: ['with', 'retirar'],
  crime: ['crimen'],
  roulette: ['rt', 'ruleta'],
  topcount: ['topmensajes', 'topmessages', 'topmsgcount', 'count'],
  msgcount: ['mensajes'],
  topinactive: ['topinactivos', 'inactivos'],

  // ── Administración: alias de los modos por chat ──
  mute: ['close', 'open'],
  groupimage: ['groupimg', 'gpimg', 'setgroupimage'],
  setwarnlimit: ['warnlimit'],

  // ── Sociales y parejas (lote Neko) ──
  marry: ['casarse'],
  divorce: ['divorciarse'],
  pareja: [],
  setbirth: ['cumplefecha'],
  birthdays: ['cumple'],

  // ── Perfiles (lote Neko) ──
  setgenre: [],
  setdescription: ['setbio', 'descripcion'],
  setfavourite: ['setfav', 'favourite'],
  level: ['lvl'],
  leaderboard: ['lboard', 'top'],
  allbirthdays: ['allbirths'],
  marryhistory: ['marriagehistory', 'historialmatrimonio', 'bodas'],

  // ── Utilidades (lote Neko) ──
  toimg: ['toimage'],
  pfp: ['getpic', 'foto'],

  // ── NSFW ──
  rule34: ['r34', 'rule'],
  hentai: ['h', 'porno'],
  nsfw: ['nsfwhelp'],

  // ── Juegos y entretenimiento ──
  adivinar: ['ad'],
  acertijo: ['ac'],
  sopa: ['sp'],
  ahorcado: ['ah'],
  truthordare: ['tod'],
  casino: ['cs'],
  gacha: ['gc'],
  waifu: ['w'],
  uno: ['u'],
  poker: ['holdem'],
  joke: ['j'],
  quote: ['q'],
  profile: ['pf'],
  notes: ['n'],
}

/**
 * Todos los alias de funcion de un comando (nombre corto del menu + extras),
 * ordenados del mas corto al mas largo. No incluye el nombre canonico.
 */
export function aliasDe(nombre) {
  const todos = new Set(ALIAS_EXTRA[nombre] || [])
  const corto = NOMBRES_CORTOS[nombre]
  if (corto) todos.add(corto)
  todos.delete(nombre)
  return [...todos].sort((a, b) => a.length - b.length || a.localeCompare(b))
}

/**
 * Alias heredados que no son comandos nuevos: solo se mantienen por
 * compatibilidad con lo que la gente ya usaba.
 */
export const ALIAS_HEREDADOS = [
  'bal', 'daily', 'work', 'rob', 'pay', 'rank',
  'google', 'search', 'g',
  'wikipedia', 'weather', 'tiempo', 'translate', 'web',
  'bienvenida', 'saludo', 'despedida',
]

/** Nombre corto de un comando (si no tiene alias corto, devuelve el mismo). */
export function nombreCorto(nombre) {
  return NOMBRES_CORTOS[nombre] ?? nombre
}

/** Nombre canonico (largo) a partir del nombre corto. */
export function nombreLargo(nombre) {
  for (const [largo, corto] of Object.entries(NOMBRES_CORTOS)) {
    if (corto === nombre) return largo
  }
  return nombre
}

/** Todos los nombres que son alias (no cuentan como comandos nuevos). */
export function nombresAlias() {
  return [...Object.values(NOMBRES_CORTOS), ...ALIAS_HEREDADOS]
}
