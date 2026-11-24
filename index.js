/**
 * Arranque rapido: cache de bytecode de V8.
 * Va primero: la cache solo cubre los modulos que se compilan despues.
 */
import './lib/arranque.js'
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  normalizeMessageContent,
} from '@whiskeysockets/baileys'
import fs from 'node:fs'
import path from 'node:path'
import qrcode from 'qrcode-terminal'

// ───────────── Base de datos ─────────────
import { db, contarMensaje, contarMensajeUsuario, alertasActivas, listarAlertas, obtenerAfk, quitarAfk, modoChat, algunModoActivo, palabraProhibidaEn, registrarAdvertencia, contarAdvertencias, limiteAdvertencias, borrarAdvertencias, alertasAutoActivas, configurarAlertasAuto, setAntiDelete, getAntiDelete, limpiarAntiDelete, obtenerEconomia, restarMonedas, primarioDe } from './database/db.js'
import { obtenerMetadata, esAdmin, esMencionDelBot, extraerComandoTrasMencion, extraerPreguntaTrasMencion, tokenMencion, jidUsuario } from './lib/grupo.js'
import { log, recordarGrupo, necesitaNombre, intentoNombre } from './lib/logger.js'
import { autoReaccionar } from './lib/autoreact.js'
import { marcarLeido } from './lib/autoread.js'
import { categoriaDe } from './lib/categorias.js'
import { revisarAntilink } from './lib/antilink.js'
import { procesarCambioParticipantes } from './lib/bienvenida.js'
import { alertaAdmin } from './lib/alertas.js'
import { realinearRarezasLocales, sincronizarRarezas } from './lib/gacha-internet.js'
import { adquirirBloqueo, liberarBloqueo } from './lib/instancia.js'
import { cargarComandos } from './lib/loader.js'
import { useSqliteAuthState } from './lib/auth-state.js'
import { COMANDOS_VIP, esVip, jidsDe } from './lib/vip.js'
import { prefijosBot, modoPrivado } from './lib/ajustes-bot.js'
import { registrarSocket, quitarSocket } from './lib/sockets.js'

// ── Tarifa de oro por comando (categorías pagadas) ──
const COSTE_COMANDO_ORO = 10
// Economía y juegos no cobran por invocarse: solo cuesta lo que se apuesta
const CATEGORIAS_COSTO_ORO = new Set(['gacha', 'descargas', 'entretenimiento', 'nsfw', 'multimedia', 'internet', 'interacciones', 'ia'])

// ───────────── Configuración ─────────────
import { BOT_NAME, PREFIX, AUTH_DIR, MENCIONES_BOT, LOG_LEVEL, METODO_VINCULACION, NUMERO_VINCULACION, NAVEGADOR_WA } from './config.js'
import { elegirVinculacion, formatearCodigo } from './lib/vinculacion.js'
import { crearLogger } from './lib/logger-baileys.js'


// Logger de Baileys. Con LOG_LEVEL = 'silent' no se importa pino: el logger
// vacio pesa nada y en un arranque en frio ahorra ~350 ms.
const logger = await crearLogger(LOG_LEVEL)

// Cache para almacenar mensajes recientes (para anti-delete)
const mensajeCache = new Map()
// Tiempo de vida del mensaje en la cache (ms) - 5 minutos
const TIEMPO_VIDA_MENSAJE = 300000
// Tope de entradas: evita que la cache crezca sin limite con el trafico
const MAX_CACHE_MENSAJES = 2000
// Mensajes del mismo lote que se procesan a la vez (una descarga lenta no frena al resto)
const MAX_MENSAJES_EN_PARALELO = 5

/** Guarda un mensaje en la cache respetando el tope (descarta el mas antiguo) */
function guardarEnCache(id, datos) {
  mensajeCache.set(id, datos)
  while (mensajeCache.size > MAX_CACHE_MENSAJES) {
    mensajeCache.delete(mensajeCache.keys().next().value)
  }
}

/**
 * Ejecuta fn sobre cada item con un maximo de tareas simultaneas.
 * Sustituye al `for ... await` del handler: antes un solo comando lento
 * (una descarga de YouTube, por ejemplo) bloqueaba todos los mensajes.
 */
async function mapConLimite(items, limite, fn) {
  const cola = [...items]
  const trabajadores = Array.from({ length: Math.min(limite, cola.length) }, async () => {
    while (cola.length) {
      const item = cola.shift()
      try {
        await fn(item)
      } catch (err) {
        log.error('Error procesando un mensaje', err)
      }
    }
  })
  await Promise.all(trabajadores)
}

// ───────────── Purga de antispam ─────────────
let ultimaPurgaSpam = 0

/** Borra del antispam en memoria los usuarios inactivos (evita fuga de memoria) */
function purgarSpam(datos) {
  const ahora = Date.now()
  if (ahora - ultimaPurgaSpam < 60_000) return
  ultimaPurgaSpam = ahora
  for (const [id, d] of Object.entries(datos)) {
    if (ahora - (d.last || 0) > 10 * 60_000) delete datos[id]
  }
}


// ───────────── Comandos ─────────────

// Modos por chat y administracion (lote Administracion)
import { fabricarModo } from './commands/modos.js'

// ───────────── ComandosTomados de MEGA-MD ─────────────
import { charlarConBeerus } from './commands/ia.js'
import { esJugadaUno } from './commands/uno.js'
// ── Lote Neko: banco, sociales y utilidades ──

// Lote Perfiles (Neko): ficha, nivel y favoritos
import {
  fabricarAccionNSFW,
  fabricarImagenNSFW,
} from './commands/nsfw-interaccion.js'

/**
 * Envoltorio perezoso para comandos que salen de una fabrica.
 *
 * rule34.js e interaccion.js arrastran sharp (y rule34 tambien yt-dlp), y solo
 * se usan cuando alguien invoca esos comandos. Cargarlos al arrancar sumaba
 * decenas de modulos a un camino critico que no los necesita: la fabrica se
 * ejecuta en el primer uso y el resultado queda cacheado.
 */
const perezoso = (fabricar) => {
  let comando = null
  return async (ctx) => {
    if (!comando) comando = await fabricar()
    return comando(ctx)
  }
}

/** Fabrica perezosa de interacciones (kiss, slap, hug y compania) */
const fabricarInteraccion = (nombre, alias) =>
  perezoso(async () => (await import('./commands/interaccion.js')).fabricarInteraccion(nombre, alias))

// Handlers de interacciones (kiss, slap, hug y compania)
const kiss = fabricarInteraccion('kiss')
const hug = fabricarInteraccion('hug')
const slap = fabricarInteraccion('slap')
const punch = fabricarInteraccion('punch')
const bonk = fabricarInteraccion('bonk')
const pat = fabricarInteraccion('pat')
const cuddle = fabricarInteraccion('cuddle')
const bite = fabricarInteraccion('bite')
const poke = fabricarInteraccion('poke')
const tickle = fabricarInteraccion('tickle')
const yeet = fabricarInteraccion('yeet')
const shake = fabricarInteraccion('shake')
const kickFx = fabricarInteraccion('kick', 'patada')
const stare = fabricarInteraccion('stare')
const highfive = fabricarInteraccion('highfive')
const handhold = fabricarInteraccion('handhold')
const baka = fabricarInteraccion('baka')
const blush = fabricarInteraccion('blush')
const cry = fabricarInteraccion('cry')
const facepalm = fabricarInteraccion('facepalm')
const wave = fabricarInteraccion('wave')
// Neko: nuevas interacciones de anime
const dance = fabricarInteraccion('dance')
const laugh = fabricarInteraccion('laugh')
const happy = fabricarInteraccion('happy')
const smile = fabricarInteraccion('smile')
const angry = fabricarInteraccion('angry')
const nom = fabricarInteraccion('nom')
const tableflip = fabricarInteraccion('tableflip')
const thumbsup = fabricarInteraccion('thumbsup')
const yawn = fabricarInteraccion('yawn')

// Handlers de acciones NSFW con mencion (anal, spank, yuri y compania)
const anal = fabricarAccionNSFW('anal')
const blowjob = fabricarAccionNSFW('blowjob')
const boobjob = fabricarAccionNSFW('boobjob')
const cowgirl = fabricarAccionNSFW('cowgirl')
const cum = fabricarAccionNSFW('cum')
const cummouth = fabricarAccionNSFW('cummouth')
const cumshot = fabricarAccionNSFW('cumshot')
const fap = fabricarAccionNSFW('fap')
const footjob = fabricarAccionNSFW('footjob')
const fuck = fabricarAccionNSFW('fuck')
const grabboobs = fabricarAccionNSFW('grabboobs')
const grope = fabricarAccionNSFW('grope')
const handjob = fabricarAccionNSFW('handjob')
const lickass = fabricarAccionNSFW('lickass')
const lickdick = fabricarAccionNSFW('lickdick')
const lickpussy = fabricarAccionNSFW('lickpussy')
const sixnine = fabricarAccionNSFW('sixnine')
const spank = fabricarAccionNSFW('spank')
const squirt = fabricarAccionNSFW('squirt')
const suckballs = fabricarAccionNSFW('suckballs')
const suckboobs = fabricarAccionNSFW('suckboobs')
const undress = fabricarAccionNSFW('undress')
const yuri = fabricarImagenNSFW('yuri')
const tijeras = fabricarAccionNSFW('yuri', 'tijeras')

// Tiradas sueltas NSFW sin mencion (estilo /hentai con tag fijo)
const ass = fabricarImagenNSFW('ass')
const pussy = fabricarImagenNSFW('pussy')
const nekomimi = fabricarImagenNSFW('nekomimi')

// Modos por chat: /bot, /economia y /onlyadmin con la misma fabrica
const botModo = fabricarModo('bot')
const economiaModo = fabricarModo('economia')
const onlyadmin = fabricarModo('onlyadmin')
const autoreadModo = fabricarModo('autoread')
// Modos nuevos del lote Group: rol, juegos, estados y llamadas
const rpgModo = fabricarModo('rpg')
const juegosModo = fabricarModo('juegos')
const antistatusModo = fabricarModo('antistatus')
const anticallModo = fabricarModo('anticall')

// Busquedas por fuente preferida (rule34.js se carga en el primer uso)
const danbooru = perezoso(
  async () => (await import('./commands/rule34.js')).fabricarBusquedaNSFW('danbooru.donmai.us')
)
const e621 = perezoso(
  async () => (await import('./commands/rule34.js')).fabricarBusquedaNSFW('e621.net')
)
const gelbooru = perezoso(
  async () => (await import('./commands/rule34.js')).fabricarBusquedaNSFW('gelbooru.com')
)

// Videos NSFW: un handler por sitio (lib/nsfw-video.js trae el motor)
const fabricarVideoNSFW = (sitio) =>
  perezoso(async () => (await import('./commands/nsfw-video.js')).fabricarComandoVideo(sitio))
const xvideosCmd = fabricarVideoNSFW('xvideos')
const xnxxCmd = fabricarVideoNSFW('xnxx')
const r34vidCmd = fabricarVideoNSFW('rule34video')

/** Crea un alias que ejecuta un subcomando de economy */
const conSub = (fn, sub) => (ctx) => fn({ ...ctx, args: [sub, ...(ctx.args || [])] })

// Registro dinamico: cada archivo de commands/ se expone por su nombre
const C = await cargarComandos()

const commands = {
  greet: C.greet,
  ping: C.ping,
  menu: C.menu,
  info: C.info,
  stats: C.stats,
  stickers: C.stickers,
  help: C.help,
  dado: C.dado,
  profile: C.profile,
  notes: C.notes,
  group: C.group,
  listgroups: C.listgroups,
  leave: C.leave,
  creategroup: C.creategroup,
  promote: C.promote,
  demote: C.demote,
  ban: C.ban,
  unban: C.unban,
  kick: C.kick,
  add: C.add,
  delete: C.delete,
  del: C.delete,
  listadmins: C.listadmins,
  listmembers: C.listmembers,
  antidelete: C.antidelete,
  antispam: C.antispam,
  autodetect: C.autodetect,
  fantasmas: C.fantasmas,
  dados: C.dado,
  dadu: C.dado,
  inspect: C.inspect,
  cleartmp: C.cleartmp,
  groupinfo: C.groupinfo,
  invite: C.invite,
  resetlink: C.resetlink,
  mute: C.mute,
  restrict: C.restrict,
  system: C.system,
  update: C.update,
  requests: C.requests,
  approve: C.approve,
  reject: C.reject,
  setname: C.setname,
  setdesc: C.setdesc,
  ephemeral: C.ephemeral,
  history: C.history,
  video: C.video,
  audio: C.audio,
  sticker: C.sticker,
  stickervideo: C.stickervideo,
  stickeraudio: C.stickeraudio,
  antilink: C.antilink,
  // ── Economía y entretenimiento ──
  gacha: C.gacha,
  uno: C.uno,
  economy: C.economy,
  casino: C.casino,
  '8ball': C["8ball"],
  truthordare: C.truthordare,
  joke: C.joke,
  quote: C.quote,
  advice: C.advice,
  compliment: C.compliment,
  pickup: C.pickup,
  ship: C.ship,
  love: C.love,
  // ── Internet ──
  buscar: C.buscar,
  youtube: C.youtube,
  wiki: C.wiki,
  clima: C.clima,
  traducir: C.traducir,
  leerurl: C.leerurl,
  // ── Bienvenidas y despedidas ──
  welcome: C.welcome,
  bye: C.bye,
  // ── Juegos y utilidades nuevas ──
  adivinar: C.adivinar,
  acertijo: C.acertijo,
  sopa: C.sopa,
  ahorcado: C.ahorcado,
  poker: C.poker,
  calcular: C.calcular,
  estilizar: C.estilizar,
  qr: C.qr,
  hidetag: C.hidetag,
  advertencia: C.advertencia,
  warnwords: C.warnwords,
  afk: C.afk,
  // ── Descargas de internet ──
  descargar: C.descargar,
  tiktok: C.tiktok,
  facebook: C.facebook,
  instagram: C.instagram,
  mediafire: C.mediafire,
  twitter: C.twitter,
  // ── Descargas: APK, imágenes, Spotify y Drive ──
  apk: C.apk,
  aptoide: C.apk,
  apkdl: C.apk,
  imagen: C.imagen,
  img: C.imagen,
  image: C.imagen,
  spotify: C.spotifydl,
  spotifydl: C.spotifydl,
  spotydl: C.spotifydl,
  drive: C.descargar,
  gdrive: C.descargar,
  // ── Lote Neko: descargas ──
  pixiv: C.pixiv,
  pinterest: C.pinterest,
  nhentai: C.nhentai,
  hitomi: C.hitomi,
  vermangasporno: C.vermangasporno,
  // ── Novedades de MEGA-MD ──
  encuesta: C.encuesta,
  reaccionar: C.reaccionar,
  revelar: C.revelar,
  efecto: C.efecto,
  tateti: C.tateti,
  hack: C.hack,
  curiosidad: C.curiosidad,
  voz: C.voz,
  pokedex: C.pokedex,
  gitinfo: C.gitinfo,
  npm: C.npm,
  ip: C.ip,
  acortar: C.acortar,
  letra: C.letra,
  // ── IA de Beerus ──
  ia: C.ia,
  chatgpt: C.chatgpt,
  gemini: C.gemini,
  // ── Interacciones anime entre usuarios ──
  interaccion: C.interaccion,
  kiss,
  hug,
  slap,
  punch,
  bonk,
  pat,
  cuddle,
  bite,
  poke,
  tickle,
  yeet,
  shake,
  patada: kickFx,
  stare,
  highfive,
  handhold,
  baka,
  blush,
  cry,
  facepalm,
  wave,
  // ── Novedades Neko: banco, sociales y utilidades ──
  deposit: C.deposit,
  withdraw: C.withdraw,
  crime: C.crime,
  roulette: C.roulette,
  topcount: C.topcount,
  marry: C.marry,
  divorce: C.divorce,
  aceptar: C.aceptar,
  pareja: C.pareja,
  setbirth: C.setbirth,
  birthdays: C.birthdays,
  // ── Lote Perfiles (Neko): ficha, nivel y favoritos ──
  setgenre: C.setgenre,
  setdescription: C.setdescription,
  setfavourite: C.setfavourite,
  level: C.level,
  leaderboard: C.leaderboard,
  allbirthdays: C.allbirthdays,
  marryhistory: C.marryhistory,
  toimg: C.toimg,
  pfp: C.pfp,
  // ── Interacciones nuevas (Neko) ──
  dance,
  laugh,
  happy,
  smile,
  angry,
  nom,
  tableflip,
  thumbsup,
  yawn,
  // ── NSFW (apagado por defecto: /nsfw on) ──
  nsfw: C.nsfw,
  rule34: C.rule34,
  hentai: C.hentai,
  danbooru,
  e621,
  gelbooru,
  xvideos: xvideosCmd,
  xnxx: xnxxCmd,
  r34vid: r34vidCmd,
  nsfwvideo: C['nsfw-video'],
  'nsfw-interaccion': C['nsfw-interaccion'],
  // Acciones NSFW con mencion
  anal,
  blowjob,
  boobjob,
  cowgirl,
  cum,
  cummouth,
  cumshot,
  fap,
  footjob,
  fuck,
  grabboobs,
  grope,
  handjob,
  lickass,
  lickdick,
  lickpussy,
  sixnine,
  spank,
  squirt,
  suckballs,
  suckboobs,
  undress,
  yuri,
  tijeras,
  // Tiradas sueltas sin mencion
  ass,
  pussy,
  nekomimi,
  // ── Alias de los nuevos ──
  poll: C.encuesta,
  react: C.reaccionar,
  respuesta: C.reaccionar,
  vv: C.revelar,
  viewonce: C.revelar,
  fx: C.efecto,
  tictactoe: C.tateti,
  tts: C.voz,
  speak: C.voz,
  fact: C.curiosidad,
  github: C.gitinfo,
  gh: C.gitinfo,
  shorten: C.acortar,
  lyrics: C.letra,
  ly: C.letra,
  pk: C.pokedex,
  pdex: C.pokedex,
  // ── Alias de economía ──
  bal: conSub(C.economy, 'bal'),
  daily: conSub(C.economy, 'daily'),
  work: conSub(C.economy, 'work'),
  rob: conSub(C.economy, 'rob'),
  pay: conSub(C.economy, 'pay'),
  rank: conSub(C.economy, 'rank'),
  // ── Alias de internet ──
  google: C.buscar,
  search: C.buscar,
  g: C.buscar,
  yt: C.youtube,
  wikipedia: C.wiki,
  weather: C.clima,
  tiempo: C.clima,
  translate: C.traducir,
  trad: C.traducir,
  url: C.leerurl,
  web: C.leerurl,
  // ── Alias de bienvenidas ──
  bienvenida: C.welcome,
  saludo: C.welcome,
  despedida: C.bye,
  // ── Alias de descargas ──
  dl: C.descargar,
  tt: C.tiktok,
  fb: C.facebook,
  ig: C.instagram,
  mf: C.mediafire,
  x: C.twitter,
  // ── IA: conversa con oraculos ──
  gpt: C.chatgpt,
  ai: C.chatgpt,
  ask: C.chatgpt,
  oraculo: C.ia,
  // ── Alias de interacciones ──
  beso: kiss,
  abrazo: hug,
  bofeta: slap,
  muerde: bite,
  cosquillas: tickle,
  patear: kickFx,
  choca: highfive,
  manitas: handhold,
  idiota: baka,
  llorar: cry,
  saludar: wave,
  picar: poke,
  mirar: stare,
  interacciones: C.interaccion,
  int: C.interaccion,
  // Neko: alias de interacciones nuevas
  bailar: dance,
  reir: laugh,
  celebrar: happy,
  sonreir: smile,
  furioso: angry,
  enojado: angry,
  comer: nom,
  voltermesa: tableflip,
  aprobar: thumbsup,
  bostezar: yawn,
  // ── Lote Neko: banco, sociales y utilidades ──
  dep: C.deposit,
  depositar: C.deposit,
  with: C.withdraw,
  retirar: C.withdraw,
  crimen: C.crime,
  rt: C.roulette,
  ruleta: C.roulette,
  topmensajes: C.topcount,
  casarse: C.marry,
  divorciarse: C.divorce,
  cumplefecha: C.setbirth,
  cumple: C.birthdays,
  // ── Alias de grupo que faltaban del menú Neko ──
  gp: C.group,
  // ── Lote Perfiles (Neko): alias ──
  delbirth: conSub(C.setbirth, 'borrar'),
  delgenre: conSub(C.setgenre, 'borrar'),
  delfavourite: conSub(C.setfavourite, 'borrar'),
  delfav: conSub(C.setfavourite, 'borrar'),
  setfav: C.setfavourite,
  lvl: C.level,
  lboard: C.leaderboard,
  top: C.leaderboard,
  allbirths: C.allbirthdays,
  marriagehistory: C.marryhistory,
  historialmatrimonio: C.marryhistory,
  bodas: C.marryhistory,
  setbio: C.setdescription,
  descripcion: C.setdescription,
  toimage: C.toimg,
  getpic: C.pfp,
  foto: C.pfp,
  // ── Alias de NSFW ──
  r34: C.rule34,
  rule: C.rule34,
  h: C.hentai,
  dbooru: danbooru,
  // Alias en español de las acciones NSFW
  poto: ass,
  neko: nekomimi,
  mamada: blowjob,
  bj: blowjob,
  vaquera: cowgirl,
  coger: fuck,
  paja: fap,
  nalgada: spank,
  chorro: squirt,
  encuerar: undress,
  69: sixnine,
  // ── Alias cortos: comandos largos en 1 o 2 letras ──
  m: C.menu,
  s: C.sticker,
  sv: C.stickervideo,
  sa: C.stickeraudio,
  d: C.descargar,
  tr: C.traducir,
  vip: C.vip,
  vipbadge: C.vipbadge,
  vipmenu: C.vipmenu,
  vipboost: C.vipboost,
  dona: C.dona,
  gachaclaim: C.gachaclaim,
  setcardimage: C.setcardimage,
  sci: C.setcardimage,
  cleartemp: C.cleartmp,
  borrartmp: C.cleartmp,
  cl: C.clima,
  pf: C.profile,
  n: C.notes,
  ad: C.adivinar,
  ac: C.acertijo,
  sp: C.sopa,
  ah: C.ahorcado,
  pkr: C.poker,
  holdem: C.poker,
  cs: C.casino,
  gr: conSub(C.gacha, 'random'),
  gc: C.gacha,
  u: C.uno,
  tod: C.truthordare,
  j: C.joke,
  q: C.quote,
  r: C.reaccionar,
  v: C.voz,
  p: C.ping,
  i: C.info,
  ht: C.hidetag,
  gi: C.groupinfo,
  lm: C.listmembers,
  la: C.listadmins,
  lg: C.listgroups,
  inv: C.invite,
  rl: C.resetlink,
  ep: C.ephemeral,
  y: C.youtube,
  // ── Alias del nombre corto que se muestra en el menu ──
  stk: C.stickers,
  svideo: C.stickervideo,
  saudio: C.stickeraudio,
  stickersonido: C.stickeraudio,
  verdad: C.truthordare,
  elogio: C.compliment,
  liga: C.pickup,
  ahorca: C.ahorcado,
  calc: C.calcular,
  estil: C.estilizar,
  eco: C.economy,
  perfil: C.profile,
  bienv: C.welcome,
  ginfo: conSub(C.gacha, 'stats'),
  miembros: C.listmembers,
  admins: C.listadmins,
  grupos: C.listgroups,
  nuevo: C.creategroup,
  nombre: C.setname,
  desc: C.setdesc,
  link: C.resetlink,
  reqs: C.requests,
  apro: C.approve,
  rech: C.reject,
  promo: C.promote,
  demo: C.demote,
  restr: C.restrict,
  sys: C.system,
  eph: C.ephemeral,
  hist: C.history,
  ar: C.autoreact,
  tags: C.hidetag,
  anti: C.antilink,
  adv: C.advertencia,
  ww: C.warnwords,
  // ── Lote Neko: interactions NSFW ──
  nsfwacciones: C['nsfw-interaccion'],
  accionesnsfw: C['nsfw-interaccion'],
  // ── Lote Neko: gacha de personajes ──
  claim: conSub(C.gacha, 'claim'),
  c: C.c,
  reclamar: conSub(C.gacha, 'claim'),
  rollgacha: conSub(C.gacha, 'random'),
  rw: conSub(C.gacha, 'random'),
  roll: conSub(C.gacha, 'random'),
  winfo: conSub(C.gacha, 'info'),
  waifuinfo: conSub(C.gacha, 'info'),
  charinfo: conSub(C.gacha, 'info'),
  harem: conSub(C.gacha, 'collection'),
  waifus: conSub(C.gacha, 'collection'),
  claims: conSub(C.gacha, 'collection'),
  collection: conSub(C.gacha, 'collection'),
  coleccion: conSub(C.gacha, 'collection'),
  gachaboard: conSub(C.gacha, 'valtop'),
  waifustop: conSub(C.gacha, 'valtop'),
  topwaifus: conSub(C.gacha, 'valtop'),
  wtop: conSub(C.gacha, 'valtop'),
  valorboard: conSub(C.gacha, 'valtop'),
  favoritetop: conSub(C.gacha, 'favtop'),
  favtop: conSub(C.gacha, 'favtop'),
  gachashop: conSub(C.gacha, 'shop'),
  tiendawaifus: conSub(C.gacha, 'shop'),
  wshop: conSub(C.gacha, 'shop'),
  givechar: conSub(C.gacha, 'give'),
  givewaifu: conSub(C.gacha, 'give'),
  regalar: conSub(C.gacha, 'give'),
  giveallgacha: conSub(C.gacha, 'giveall'),
  buycharacter: conSub(C.gacha, 'buy'),
  buychar: conSub(C.gacha, 'buy'),
  buyc: conSub(C.gacha, 'buy'),
  deletegacha: conSub(C.gacha, 'delwaifu'),
  delgacha: conSub(C.gacha, 'delwaifu'),
  delchar: conSub(C.gacha, 'delwaifu'),
  setclaimmsg: conSub(C.gacha, 'claimmsg'),
  setclaim: conSub(C.gacha, 'claimmsg'),
  delclaimmsg: conSub(C.gacha, 'delclaimmsg'),
  charvideo: conSub(C.gacha, 'video'),
  waifuvideo: conSub(C.gacha, 'video'),
  cvideo: conSub(C.gacha, 'video'),
  wvideo: conSub(C.gacha, 'video'),
  charimage: conSub(C.gacha, 'image'),
  waifuimage: conSub(C.gacha, 'image'),
  cimage: conSub(C.gacha, 'image'),
  wimage: conSub(C.gacha, 'image'),
  serieinfo: conSub(C.gacha, 'serieinfo'),
  ainfo: conSub(C.gacha, 'serieinfo'),
  animeinfo: conSub(C.gacha, 'serieinfo'),
  serielist: conSub(C.gacha, 'serielist'),
  slist: conSub(C.gacha, 'serielist'),
  animelist: conSub(C.gacha, 'serielist'),
  vote: conSub(C.gacha, 'vote'),
  votar: conSub(C.gacha, 'vote'),
  trade: conSub(C.gacha, 'trade'),
  intercambiar: conSub(C.gacha, 'trade'),
  tiktoksearch: C.tiktoksearch,
  igstory: C.igstory,
  cuevana: C.cuevana,
  spotifysearch: C.spotifysearch,
  dalle: C.dalle,
  remini: C.remini,
  anonimo: C.anonimo,
  sell: conSub(C.gacha, 'sell'),
  vender: conSub(C.gacha, 'sell'),
  removesale: conSub(C.gacha, 'removesale'),
  removerventa: conSub(C.gacha, 'removesale'),
  gachainfo: conSub(C.gacha, 'stats'),
  infogacha: conSub(C.gacha, 'stats'),
  // ── Lote Neko: descargas ──
  mp4: C.video,
  ytmp4: C.video,
  mp4doc: conSub(C.video, 'doc'),
  play: C.audio,
  playaudio: C.audio,
  ytaudio: conSub(C.audio, 'voz'),
  reel: C.instagram,
  ytsearch: C.youtube,
  pin: C.pinterest,
  px: C.pixiv,
  pixivpdf: conSub(C.pixiv, 'pdf'),
  nh: C.nhentai,
  nhdl: C.nhentai,
  hitomila: C.hitomi,
  vmp: C.vermangasporno,
  // ── Lote Administracion: modos por chat ──
  bot: botModo,
  economia: economiaModo,
  onlyadmin,
  autoread: autoreadModo,
  modos: C.modos,
  autoreact: C.autoreact,
  msgcount: C.msgcount,
  topinactive: C.topinactive,
  groupimage: C.groupimage,
  setwarnlimit: C.setwarnlimit,
  // Alias del lote administracion
  close: C.mute,
  open: C.mute,
  mensajes: C.msgcount,
  topinactivos: C.topinactive,
  inactivos: C.topinactive,
  groupimg: C.groupimage,
  setgroupimage: C.groupimage,
  warnlimit: C.setwarnlimit,
  leido: autoreadModo,
  leidos: autoreadModo,
  marcarleido: autoreadModo,
  // ── Configuración del socket (solo owner) ──
  socket: C.socket,
  bots: conSub(C.socket, 'bots'),
  sockets: conSub(C.socket, 'sockets'),
  join: conSub(C.socket, 'join'),
  unir: conSub(C.socket, 'join'),
  logout: conSub(C.socket, 'logout'),
  prefix: conSub(C.socket, 'prefix'),
  self: conSub(C.socket, 'self'),
  setbanner: conSub(C.socket, 'setbanner'),
  setmenubanner: conSub(C.socket, 'setbanner'),
  setbotcurrency: conSub(C.socket, 'setbotcurrency'),
  setcurrency: conSub(C.socket, 'setbotcurrency'),
  setlink: conSub(C.socket, 'setbotlink'),
  setbotlink: conSub(C.socket, 'setbotlink'),
  setbotname: conSub(C.socket, 'setbotname'),
  botname: conSub(C.socket, 'setbotname'),
  setbotowner: conSub(C.socket, 'setbotowner'),
  setowner: conSub(C.socket, 'setbotowner'),
  setbotprefix: conSub(C.socket, 'setbotprefix'),
  setprefix: conSub(C.socket, 'setbotprefix'),
  seticon: conSub(C.socket, 'seticon'),
  setimage: conSub(C.socket, 'setimage'),
  setpfp: conSub(C.socket, 'setimage'),
  setusername: conSub(C.socket, 'setusername'),
  // ── Reportes, utilidades y perfil ──
  report: C.report,
  reporte: C.report,
  sug: C.report,
  suggest: C.report,
  say: C.say,
  decir: C.say,
  jid: C.jid,
  lid: C.lid,
  gitclone: C.gitclone,
  git: C.gitclone,
  warnlist: C.warnlist,
  listwarns: C.warnlist,
  warns: C.warnlist,
  primary: C.primary,
  setprimary: C.primary,
  delprimary: conSub(C.primary, 'del'),
  setpasatiempo: C.pasatiempo,
  sethobby: C.pasatiempo,
  pasatiempo: C.pasatiempo,
  delpasatiempo: conSub(C.pasatiempo, 'borrar'),
  removehobby: conSub(C.pasatiempo, 'borrar'),
  // ── Modos nuevos (rol, juegos, estados y llamadas) ──
  rpg: rpgModo,
  game: juegosModo,
  juegos: juegosModo,
  juego: juegosModo,
  antistatus: antistatusModo,
  antiestados: antistatusModo,
  anticall: anticallModo,
  antillamadas: anticallModo,
}

// ───────────── Utilidades ─────────────
function extraerTexto(message) {
  const m = normalizeMessageContent(message) // quita envoltorios (efímeros, view once, etc.)
  return (
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.videoMessage?.caption ||
    ''
  )
}

// ───────────── Contadores ─────────────
function registrarMensaje(jid, esGrupo, usuario = null) {
  try {
    contarMensaje(jid, esGrupo)
    // por-usuario solo en grupos (para /topcount)
    if (esGrupo && usuario && !usuario.endsWith('@g.us')) {
      contarMensajeUsuario(jid, usuario)
    }
  } catch (err) {
    log.error('Error registrando el mensaje', err)
  }
}

// ───────────── Anti-bucle de menciones ─────────────
// Se guardan los IDs de los mensajes enviados por el bot para no responderlos
const idsEnviadosPorBot = new Set()

function vieneDelBot(msg) {
  if (!msg?.key?.id) return false
  return idsEnviadosPorBot.has(msg.key.id)
}

// ───────────── Caché de metadatos ─────────────
const cacheMetadata = new Map()
const TTL_METADATA = 15000 // 15 segundos

async function obtenerMetadataCacheada(sock, jid) {
  const ahora = Date.now()
  const cached = cacheMetadata.get(jid)

  if (cached && ahora - cached.ts < TTL_METADATA) {
    return cached.data
  }

  const data = await obtenerMetadata(sock, jid)
  cacheMetadata.set(jid, { ts: ahora, data })
  return data
}

// ───────────── Alertas ─────────────
async function revisarAlertas({ sock, jid, msg, sender, texto }) {
  if (!texto) return
  if (!alertasActivas(jid)) return

  const coincidencias = listarAlertas(jid).filter((alerta) =>
    texto.toLowerCase().includes(String(alerta.texto).toLowerCase())
  )

  for (const alerta of coincidencias) {
    // Siempre se menciona por token: WhatsApp lo convierte en la etiqueta
    // azul del usuario aunque su JID sea un LID (y avisa con notificacion)
    const remitente = tokenMencion(sender)
    const menciones = sender ? [jidUsuario(sender)] : undefined

    await sock.sendMessage(jid, {
      text:
        `🚨 *ALERTA ACTIVADA*\n\n` +
        `Se detectó el texto vigilado: *"${alerta.texto}"*\n\n` +
        `👤 *Remitente:* ${remitente}\n` +
        `🕒 _${new Date().toLocaleString('es-ES')}_`,
      mentions: menciones,
    })
  }
}

// ───────────── Bot ─────────────

/**
 * Control de conexión.
 *
 * WhatsApp cierra la conexión con el codigo 440 (connectionReplaced) cuando
 * otra sesion (otra instancia del bot, otro PC o el movil) toma el control.
 * Reconectar a ciegas en ese caso genera un bucle infinito, por eso aqui se
 * distingue cada motivo de cierre y se espera con calma antes de reintentar.
 */
let socketActivo = null
let reconexionPendiente = null
let intentosReconexion = 0
let intentosReemplazo = 0
// Metodo de vinculacion elegido (se decide una sola vez y se reutiliza al reconectar)
let vinculacion = null
// Estado de autenticacion (SQLite). Se abre una vez y se reutiliza en cada
// reconexion: reabrir la base en cada intento dejaba handles sueltos.
let authSesion = null

const MAX_INTENTOS = 15
const ESPERA_BASE = 3000
const ESPERA_MAXIMA = 60000
const ESPERA_CONEXION_REEMPLAZADA = 20000
// Máximo de reintentos cuando otra sesión toma el control (440).
// Si se supera, el bot se apaga: reconectar en bucle solo genera desconexiones.
const MAX_INTENTOS_REEMPLAZO = 3

/** Cierra el socket anterior antes de crear uno nuevo */
function cerrarSocket(sock) {
  try {
    sock?.end(undefined)
  } catch {
    // Ignorado: el socket ya estaba cerrado
  }
}

/** Programa la reconexion (solo una pendiente a la vez) */
function programarReconexion(esperaMs) {
  if (reconexionPendiente) return

  reconexionPendiente = setTimeout(() => {
    reconexionPendiente = null
    startBot().catch((err) => log.error('Error al reconectar', err))
  }, esperaMs)
}

/** Cierra el bot de forma ordenada */
function apagar(mensaje) {
  log.sistema(mensaje)
  log.sistema(`Resumen: ${log.resumen()}`)
  try {
    if (reconexionPendiente) clearTimeout(reconexionPendiente)
  } catch {
    // Ignorado
  }
  cerrarSocket(socketActivo)
  try {
    authSesion?.cerrar()
  } catch {
    // la base ya estaba cerrada
  }
  liberarBloqueo()
  process.exit(0)
}

// ───────────── Version de WhatsApp ─────────────
// fetchLatestBaileysVersion() consulta raw.githubusercontent.com. Si la red va
// lenta o el host esta bloqueado, la promesa puede tardar decenas de segundos
// y el socket ni se crea: el bot parece "colgado" antes de conectar. Se limita
// la espera y se reutiliza la ultima version buena guardada en disco.
const VERSION_WA_ARCHIVO = path.resolve('data', 'wa-version.json')
const ESPERA_VERSION_WA_SIN_CACHE = 4000
const ESPERA_VERSION_WA_CON_CACHE = 1200
// Una version guardada con menos de este tiempo se usa sin esperar al servidor:
// el arranque no se frena y la consulta se hace igual, en segundo plano.
const VIGENCIA_VERSION_WA_MS = 24 * 60 * 60 * 1000

function leerVersionGuardada() {
  try {
    const datos = JSON.parse(fs.readFileSync(VERSION_WA_ARCHIVO, 'utf8'))
    if (Array.isArray(datos?.version) && datos.version.length === 3) {
      return { version: datos.version, guardado: Date.parse(datos.guardado) || 0 }
    }
  } catch {
    // sin cache: se consulta y se guarda
  }
  return null
}

function guardarVersionWa(version) {
  try {
    fs.mkdirSync(path.dirname(VERSION_WA_ARCHIVO), { recursive: true })
    fs.writeFileSync(
      VERSION_WA_ARCHIVO,
      JSON.stringify({ version, guardado: new Date().toISOString() })
    )
  } catch {
    // la cache es opcional
  }
}

/**
 * Version de WhatsApp con espera acotada. undefined = la que trae Baileys.
 *
 * La consulta a raw.githubusercontent.com esta en el camino critico del
 * arranque: si la red va lenta, el socket no se crea y el bot parece colgado.
 * Con una version guardada reciente se usa esa de inmediato y la consulta se
 * sigue en segundo plano, asi el arranque no espera a la red.
 */
async function versionDeWhatsApp() {
  const guardada = leerVersionGuardada()

  const consulta = fetchLatestBaileysVersion()
    .then(({ version }) => {
      if (Array.isArray(version) && version.length === 3) guardarVersionWa(version)
      return version || null
    })
    .catch(() => null)

  const vigente =
    guardada && Date.now() - guardada.guardado < VIGENCIA_VERSION_WA_MS
  if (vigente) return guardada.version

  let temporizador
  const limite = new Promise((resolve) => {
    temporizador = setTimeout(() => resolve(null), guardada ? ESPERA_VERSION_WA_CON_CACHE : ESPERA_VERSION_WA_SIN_CACHE)
  })

  const version = await Promise.race([consulta, limite])
  clearTimeout(temporizador)

  if (version) return version
  if (guardada) {
    log.aviso(`Version de WhatsApp: sin respuesta del servidor, uso la guardada (${guardada.version.join('.')}).`)
    return guardada.version
  }
  log.aviso('Version de WhatsApp: sin respuesta del servidor, uso la que trae Baileys.')
  return undefined
}

/** Abre el estado de auth una sola vez y lo reutiliza en las reconexiones */
async function obtenerAuthSesion() {
  if (!authSesion) authSesion = await useSqliteAuthState(AUTH_DIR)
  return authSesion
}

async function startBot() {
  const inicioArranque = performance.now()

  // Si ya hay un socket vivo, se cierra antes de crear otro
  if (socketActivo) {
    cerrarSocket(socketActivo)
    socketActivo = null
  }

  const { state, saveCreds, tieneSesion } = await obtenerAuthSesion()
  const version = await versionDeWhatsApp()

  // Si hay credenciales guardadas no se pregunta por el metodo de vinculacion
  const tieneSesionGuardada = tieneSesion

  // Solo si NO hay sesión guardada Y no se ha elegido método: preguntar QR/código
  if (!tieneSesionGuardada && !vinculacion) {
    vinculacion = await elegirVinculacion({
      metodoConfig: METODO_VINCULACION,
      numeroConfig: NUMERO_VINCULACION,
      argv: process.argv.slice(2),
    })
  }

  const sock = makeWASocket({
    ...(version ? { version } : {}),
    logger,
    browser: [BOT_NAME, NAVEGADOR_WA, '2.1.0'], // nombre que verás en "Dispositivos vinculados"
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
  })

  socketActivo = sock

  log.sistema(`⚡ Socket listo en ${Math.round(performance.now() - inicioArranque)} ms`)

  // Guardar credenciales cada vez que cambien
  sock.ev.on('creds.update', saveCreds)

  // Registro los mensajes que envía el bot (protección anti-bucle)
  const enviarOriginal = sock.sendMessage.bind(sock)
  sock.sendMessage = async (destino, contenido, opciones) => {
    let resultado
    try {
      resultado = await enviarOriginal(destino, contenido, opciones)
    } catch (err) {
      log.error(`Fallo al enviar a ${destino}`, err)
      throw err
    }
    try {
      log.enviado(destino, contenido)
    } catch {
      // el log nunca debe romper un envío
    }
    const id = resultado?.key?.id

    if (id) {
      idsEnviadosPorBot.add(id)
      if (idsEnviadosPorBot.size > 500) {
        idsEnviadosPorBot.delete(idsEnviadosPorBot.values().next().value)
      }
    }

    return resultado
  }

  // Estado de la conexión
  let codigoSolicitado = false

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      if (vinculacion?.metodo === 'codigo' && !sock.authState.creds.registered) {
        // El primer evento qr indica que el socket está listo para pedir el código
        if (!codigoSolicitado) {
          codigoSolicitado = true
          sock
            .requestPairingCode(vinculacion.numero)
            .then((codigo) => {
              console.log(`\n🔑 Código de vinculación: ${formatearCodigo(codigo)}`)
              console.log('📱 En WhatsApp: Dispositivos vinculados > Vincular un dispositivo')
              console.log('   > Vincular con el número de teléfono, e ingresa el código.\n')
            })
            .catch((err) => {
              codigoSolicitado = false
              log.error('No se pudo generar el código de vinculación', err)
            })
        }
      } else {
        console.log('📱 Escanea este QR desde WhatsApp > Dispositivos vinculados:')
        qrcode.generate(qr, { small: true })
      }
    }

    if (connection === 'connecting') {
      log.sistema('⏳ Conectando con WhatsApp...')
    }

    if (connection === 'open') {
      intentosReconexion = 0
      log.sistema(`✅ ${BOT_NAME} conectado correctamente`)
      // Registro de sockets vivos: lo que muestra `/bots`
      registrarSocket(sock, { rol: 'principal' })
      // Guardar credenciales inmediatamente para persistir la sesión (evitar volver a preguntar QR/código)
      saveCreds()
      // Precarga los nombres de los grupos para que los logs los muestren
      sock
        .groupFetchAllParticipating()
        .then((todos) => {
          for (const g of Object.values(todos || {})) recordarGrupo(g.id, g.subject)
          log.sistema(`👥 ${Object.keys(todos || {}).length} grupos cargados`)
        })
        .catch(() => {})

      // Rarezas del gacha: la banda de favoritos se aplica primero en local
      // (instantaneo, con los favoritos ya guardados) y despues la pasada
      // diaria a AniList, en segundo plano, para traer datos que falten.
      try {
        const local = realinearRarezasLocales()
        if (local.actualizados) {
          log.sistema(`🎴 Rarezas del gacha: ${local.actualizados} realineadas de ${local.revisados}`)
        }
      } catch {}

      sincronizarRarezas()
        .then((r) => {
          if (r && !r.omitido) {
            log.sistema(`🎴 Rarezas del gacha: ${r.actualizados} corregidas de ${r.revisados}`)
          }
        })
        .catch(() => {})
    }

    if (connection === 'close') {
      const codigo = lastDisconnect?.error?.output?.statusCode
      log.aviso(`Conexión cerrada (código ${codigo}).`)
      quitarSocket(sock)

      // 401 = la sesión se cerró desde el teléfono: hay que escanear el QR otra vez
      if (codigo === DisconnectReason.loggedOut) {
        log.error(`Sesión cerrada desde el teléfono. Borra la carpeta "${AUTH_DIR}" y reinicia.`)
        apagar('Cerrando el bot.')
        return
      }

      // 440 = otra conexión tomó el control de la sesión.
      // Reconectar rápido hace que las dos instancias se pisen en bucle,
      // por eso se espera y se avisa al usuario.
      if (codigo === DisconnectReason.connectionReplaced) {
        log.aviso('Otra conexión tomó el control de la sesión (440).')
        log.aviso('Cierra cualquier otra instancia del bot o la sesión del móvil.')
        log.aviso(`Reintentando en ${ESPERA_CONEXION_REEMPLAZADA / 1000}s...`)
        intentosReconexion = 0
        programarReconexion(ESPERA_CONEXION_REEMPLAZADA)
        return
      }

      // 515 = el servidor pide reiniciar la conexión (no es un error real)
      if (codigo === DisconnectReason.restartRequired) {
        log.aviso('El servidor pidió reiniciar la conexión...')
        programarReconexion(1000)
        return
      }

      // Errores transitorios: reintento con espera progresiva
      intentosReconexion += 1

      if (intentosReconexion > MAX_INTENTOS) {
        log.error('Se alcanzó el máximo de reintentos. Reinicia el bot.')
        apagar('Cerrando el bot.')
        return
      }

      const espera = Math.min(ESPERA_BASE * intentosReconexion, ESPERA_MAXIMA)
      log.aviso(`Reconectando en ${Math.round(espera / 1000)}s (intento ${intentosReconexion}/${MAX_INTENTOS})...`)
      programarReconexion(espera)
    }
  })

  // Mensajes entrantes
// ─── Antispam (referencia MEGA-MD) ───
const userSpamData = {}

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    // Antes: `for ... await` (un comando lento frenaba todo el lote).
    // Ahora: hasta MAX_MENSAJES_EN_PARALELO mensajes a la vez.
    await mapConLimite(messages, MAX_MENSAJES_EN_PARALELO, async (msg) => {
      try {
        if (!msg?.message) return

        const jid = msg.key.remoteJid

        // Estados: con /antistatus apagado el bot los marca vistos (así
        // desaparecen del anillo); con /antistatus activo los deja pasar.
        if (jid === 'status@broadcast') {
          if (!algunModoActivo('antistatus') && !msg.key.fromMe) {
            try {
              await sock.readMessages([msg.key])
            } catch {}
          }
          return
        }

        // Ignora los mensajes que envió el propio bot (evita bucles)
        if (vieneDelBot(msg)) return

        // Autoread: deja el chat sin contadores de no leídos
        marcarLeido(sock, msg)

        // Quién envió el mensaje (en grupos viene en participant)
        const sender = msg.key.fromMe ? sock.user?.id : msg.key.participant
        const esGrupo = jid?.endsWith('@g.us')

        // Nombre del grupo para los logs (una vez; no frena el mensaje más de 1.5 s)
        if (necesitaNombre(jid)) {
          intentoNombre(jid)
          const meta = await Promise.race([
            obtenerMetadataCacheada(sock, jid).catch(() => null),
            new Promise((resolver) => setTimeout(() => resolver(null), 1500)),
          ])
          if (meta?.subject) recordarGrupo(jid, meta.subject)
        }
        try {
          log.mensaje({ jid, sender, nombre: msg.pushName, fromMe: msg.key.fromMe, message: msg.message })
        } catch {
          // el log nunca debe romper el procesamiento
        }

        // Contadores de mensajes (los del propio bot no cuentan por usuario)
        registrarMensaje(jid, esGrupo, msg.key.fromMe ? null : sender)

        const texto = extraerTexto(msg.message).trim()

        // ── Antispam básico (MEGA-MD adaptado) ──
        if (esGrupo && modoChat(jid, 'antispam') && !msg.key.fromMe && texto) {
          try {
            purgarSpam(userSpamData)
            const senderId = msg.key.participant || msg.key.fromMe ? sock.user?.id : msg.key.remoteJid
            const now = Date.now()
            if (!userSpamData[senderId]) {
              userSpamData[senderId] = { last: now, count: 1, strikes: 0 }
            } else {
              const d = userSpamData[senderId]
              const diff = now - d.last
              if (diff <= 5000) {
                d.count++
                if (d.count >= 10 && d.strikes < 3) {
                  d.strikes++
                  d.count = 1
                  d.last = now
                  log.seguridad('ANTISPAM', `${senderId.split('@')[0]} · advertencia ${d.strikes}/3`, jid)
                  await sock.sendMessage(jid, { text: `⚠️ @${senderId.split('@')[0]} — antispam: advertencia ${d.strikes}/3. Pausa de 30s.`, mentions: [senderId] })
                  // Simple timeout reset (puede mejorarse con DB)
                  setTimeout(() => { if (userSpamData[senderId] && userSpamData[senderId].strikes === d.strikes) { userSpamData[senderId].strikes = 0; userSpamData[senderId].count = 0 } }, d.strikes === 1 ? 30000 : d.strikes === 2 ? 60000 : 120000)
                }
              } else {
                d.count = 1
                d.last = now
              }
            }
          } catch {
            // silenciar errores de antispam
          }
        }

        // Almacenar mensaje en caché para anti-delete
        const mensajeId = msg.key.id
        const tieneContenido = texto !== '' || msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.audioMessage || msg.message?.documentMessage || msg.message?.stickerMessage
        if (mensajeId && tieneContenido) {
          guardarEnCache(mensajeId, {
            contenido: texto,
            mensajeOriginal: msg.message,
            urlImagen: msg.message?.imageMessage?.url || msg.message?.imageMessage?.mediaUrl || null,
            urlVideo: msg.message?.videoMessage?.url || msg.message?.videoMessage?.mediaUrl || null,
            urlAudio: msg.message?.audioMessage?.url || msg.message?.audioMessage?.mediaUrl || null,
            sender: sender,
            jid: jid,
            tiempo: Date.now()
          })
        }

        // ── AFK: avisa cuando el usuario vuelve a escribir ──
        if (!msg.key.fromMe && sender) {
          try {
            const ausencia = obtenerAfk(sender)
            if (ausencia) {
              quitarAfk(sender)
              await sock.sendMessage(jid, {
                text: `👋 ${tokenMencion(sender)} ya no está ausente.\n\n_Motivo:_ ${ausencia.motivo || 'Ausente'}`,
                mentions: [jidUsuario(sender)],
              })
            }
          } catch (err) {
            log.error('Error comprobando el AFK', err)
          }
        }

        // ── Antilink: bloquea enlaces no permitidos en grupos ──
        if (esGrupo && !msg.key.fromMe && texto) {
          try {
            const metadata = await obtenerMetadataCacheada(sock, jid)
            const accion = await revisarAntilink({ sock, jid, msg, sender, texto, metadata })

            // Si se aplicó una sanción no se procesa el comando del mensaje
            if (accion) { log.seguridad('ANTILINK', `${tokenMencion(sender)} · acción: ${accion}`, jid); return }
          } catch (err) {
            log.error('Error en el filtro de antilink', err)
          }
        }

        // ── Alertas: avisa cuando alguien escribe un texto vigilado ──
        if (esGrupo && !msg.key.fromMe) {
          try {
            await revisarAlertas({ sock, jid, msg, sender, texto })
          } catch (err) {
            log.error('Error revisando las alertas', err)
          }
        }

        // ── Palabras prohibidas: warn + borrar ──
        if (esGrupo && !msg.key.fromMe && texto) {
          try {
            const prohibida = palabraProhibidaEn(jid, texto)
            if (prohibida) {
              log.seguridad('PROHIBIDA', `palabra "${prohibida}" de ${String(sender || '').split('@')[0]}`, jid)
              const LIMITE = limiteAdvertencias(jid)
              registrarAdvertencia(jid, sender, `Palabra prohibida: ${prohibida}`, sender)
              const total = contarAdvertencias(jid, sender)
              const remitente = tokenMencion(sender)
              const menciones = sender ? [jidUsuario(sender)] : undefined
              await sock.sendMessage(jid, {
                text:
                  `🚫 ${remitente} usó una palabra prohibida (*${prohibida}*).\n` +
                  `⚠️ Advertencia *${total}/${LIMITE}*\n` +
                  (total >= LIMITE ? `_Debe ser baneado del grupo._` : ''),
                mentions: menciones,
              })
              // Borrar el mensaje infractor
              try {
                await sock.sendMessage(jid, { delete: { remoteJid: jid, id: msg.key.id } })
              } catch (err) {
                log.error('Error borrando mensaje con palabra prohibida', err)
              }
            }
          } catch (err) {
            log.error('Error en el filtro de palabras prohibidas', err)
          }
        }


// ── Anti-delete: reenvía mensajes eliminados si está activado ──
        if (!msg.key.fromMe && texto === '' && (msg.message?.protocolMessage?.type === 'REVOKE' || msg.message?.protocolMessage)) {
          // Mensaje vacío puede indicar que fue eliminado
          try {
            const antiActivado = getAntiDelete(jid)
            if (!antiActivado) return
            // Anti-delete ignora cuando el eliminador es admin
            if (sender) {
              const metadata = await obtenerMetadataCacheada(sock, jid)
              if (esAdmin(metadata, sender)) return
            }
            // Frases burlonas estilo Beerus (dios de la destrucción)
            const frasesBeerus = [
              '*No me digas que se borró, mortal.*',
              '*La destrucción es parte del ciclo natural.*',
              '*Incluso tus mensajes intentan escapar de mi vista.*',
              '*Un mensaje más menos no cambiará el destino.*',
              '*Intentaste ocultarlo, pero Beerus todo lo ve.*',
              '*La destrucción es irreversible, al igual que este reenvío.*',
              '*Un mensaje borrado, pero el bot recuerda.*',
              '*Incluso los mensajes más poderosos no pueden escapar de Beerus.*'
            ]
            const fraseBeerus = frasesBeerus[Math.floor(Math.random() * frasesBeerus.length)]
            // Intentar obtener el contenido del mensaje citado o del historial
            const mensajeCacheado = (() => {
              const idDirecto = mensajeCache.get(msg.key.id)
              if (idDirecto && (idDirecto.contenido !== undefined || idDirecto.mensajeOriginal)) return idDirecto
              // Buscar por chat + sender, el mensaje más reciente
              let mejor = null
              const limpiezaAntigua = Date.now() - TIEMPO_VIDA_MENSAJE
              for (const [id, data] of mensajeCache) {
                // Ignora mensajes fuera de la ventana de anti-delete
                if (data.tiempo < limpiezaAntigua) continue
                const tieneContenidoReal = data.contenido !== undefined || data.mensajeOriginal
                if (data.jid === jid && data.sender === sender && tieneContenidoReal) {
                  if (!mejor || data.tiempo > mejor.tiempo) mejor = { ...data, id }
                }
              }
              return mejor || {}
            })() || {}
            log.seguridad('ANTI-DELETE', `mensaje borrado · en caché: ${mensajeCacheado?.contenido || mensajeCacheado?.mensajeOriginal ? 'sí' : 'no'}`, jid)
            const mensajeOriginal = mensajeCacheado.mensajeOriginal || null
            const contenidoAlmacenado = mensajeCacheado.contenido || null
            const remitenteCache = mensajeCacheado.sender || ''
            const urlImagen = mensajeCacheado.urlImagen || null
            const urlVideo = mensajeCacheado.urlVideo || null
            const urlAudio = mensajeCacheado.urlAudio || null
            const textoAnti = (contenidoAlmacenado ? 'Contenido: ' + contenidoAlmacenado + '\n\n' : '') + fraseBeerus + '\n' + (remitenteCache ? tokenMencion(sender) + ' borró un mensaje.' : '')

            // Reenviar mensaje original si está disponible; de lo contrario solo texto
            if (mensajeOriginal?.imageMessage || urlImagen) {
              await sock.sendMessage(jid, { image: mensajeOriginal?.imageMessage?.url ? mensajeOriginal.imageMessage : urlImagen, caption: textoAnti, quoted: msg, mentions: remitenteCache ? [jidUsuario(sender)] : undefined })
            } else if (mensajeOriginal?.videoMessage || urlVideo) {
              await sock.sendMessage(jid, { video: mensajeOriginal?.videoMessage?.url ? mensajeOriginal.videoMessage : urlVideo, caption: textoAnti, quoted: msg, mentions: remitenteCache ? [jidUsuario(sender)] : undefined })
            } else if (mensajeOriginal?.audioMessage || urlAudio) {
              await sock.sendMessage(jid, { audio: mensajeOriginal?.audioMessage?.url ? mensajeOriginal.audioMessage : urlAudio, caption: textoAnti, quoted: msg, mentions: remitenteCache ? [jidUsuario(sender)] : undefined })
            } else {
              const opcionesEnviar = { quoted: msg, mentions: remitenteCache ? [jidUsuario(sender)] : undefined, text: textoAnti }
              await sock.sendMessage(jid, opcionesEnviar)
            }
          } catch (err) {
            log.error('Error en anti-delete', err)
          }
        }

        // Prefijos en caliente: `/setbotprefix` los cambia sin reiniciar
        const prefijosActivos = prefijosBot()

        // ── Autoreact: reacciona al azar en los grupos donde se activó con .autoreact on ──
        if (esGrupo && !msg.key.fromMe) {
          autoReaccionar({ sock, jid, msg, texto, prefijos: prefijosActivos }).catch((err) =>
            log.aviso(`Autoreact falló: ${err?.message || err}`)
          )
        }

        if (msg.messageStubType && jid?.endsWith('@g.us') && modoChat(jid, 'detect')) {
          try { await C.autodetect({ sock, jid, msg, args: [], sender: msg.key.participant || msg.key.fromMe ? sock.user?.id : msg.key.remoteJid, esGrupo: true }) } catch {}
        }

        // Jugada de UNO sin prefijo en el privado: "R6" equivale a ".uno R6"
        if (!esGrupo && !prefijosActivos.some((p) => texto.startsWith(p)) && esJugadaUno(texto)) {
          const terminar = log.comando({ nombre: 'uno (jugada)', args: [texto], jid })
          try {
            await C.uno({
              sock,
              jid,
              msg,
              args: [texto],
              sender,
              esGrupo: false,
              commands: C,
              BOT_NAME,
              PREFIX: prefijosActivos,
              db,
              jugadaSuelta: true,
            })
            terminar()
          } catch (err) {
            terminar(err)
            log.error('Error en la jugada suelta de UNO', err)
          }
          return
        }

        const prefijo = prefijosActivos.find((p) => texto.startsWith(p))
        if (prefijo) {
          const [nombre, ...args] = texto.slice(prefijo.length).trim().split(/\s+/)
          if (!nombre) return

          const clave = nombre.toLowerCase()

          // ── Modo privado del bot (`/self on`): los grupos quedan mudos ──
          // La puerta `/self` sigue abierta para poder apagarlo desde el grupo.
          if (esGrupo && modoPrivado() && clave !== 'self') {
            log.ignorado({ nombre: prefijo + clave, jid, motivo: 'modo privado' })
            return
          }

          // ── Bot primario del grupo: si hay uno fijado y no soy yo, me callo ──
          if (esGrupo) {
            const primario = primarioDe(jid)
            const soyPrimario = !primario || primario === sock.user?.id
            const esPuertaPrimario = clave === 'primary' || clave === 'setprimary' || clave === 'delprimary'
            if (!soyPrimario && !esPuertaPrimario) {
              log.ignorado({ nombre: prefijo + clave, jid, motivo: 'no es el bot primario' })
              return
            }
          }

          // ── Modos por chat (lote Administracion, solo grupos) ──
          if (esGrupo) {
            const esPuerta = clave === 'bot' || clave === 'onlyadmin'

            // Modo bot apagado: solo responde a /bot (y /onlyadmin)
            if (!modoChat(jid, 'bot') && !esPuerta) {
              log.ignorado({ nombre: prefijo + clave, jid, motivo: 'bot apagado en el grupo' })
              return
            }

            // Modo solo admins: el resto de comandos se silencia
            if (modoChat(jid, 'onlyadmin') && !esPuerta) {
              let permitido = false
              try {
                permitido = esAdmin(await obtenerMetadataCacheada(sock, jid), sender)
              } catch (err) {
                permitido = false
              }
              if (!permitido) {
                log.ignorado({ nombre: prefijo + clave, jid, motivo: 'solo admins' })
                return
              }
            }

            // Economia apagada (el toggle /economia siempre responde;
            // el gacha tiene su propia puerta dentro de /gacha)
            if (categoriaDe(clave) === 'economia' && clave !== 'economia' && !modoChat(jid, 'economia')) {
              log.ignorado({ nombre: prefijo + clave, jid, motivo: 'economía apagada' })
              return
            }
          }

          const comando = commands[clave]
          if (!comando) { log.ignorado({ nombre: prefijo + clave, jid, motivo: 'no existe' }); return }

          // ── Club VIP: comandos exclusivos (antes de ejecutar) ──
          if (COMANDOS_VIP.has(clave) && !esVip(jidsDe({ msg, sender, sock }))) {
            log.ignorado({ nombre: prefijo + clave, jid, motivo: 'solo VIP' })
            await sock.sendMessage(jid, {
              text: `❌ \`${prefijo}${clave}\` es exclusivo del Club VIP.\n_El owner puede darte acceso con_ \`.vip add @usuario\`_._`,
              quoted: msg,
            })
            return
          }

          // ── Tarifa de oro por comando (categorías pagadas) ──
          const categoriaComando = categoriaDe(clave)
          if (CATEGORIAS_COSTO_ORO.has(categoriaComando)) {
            const eco = obtenerEconomia(sender)
            if (eco.monedas < COSTE_COMANDO_ORO) {
              await sock.sendMessage(jid, {
                text: `🪙 No tienes suficiente oro. Necesitas *${COSTE_COMANDO_ORO}*, tienes *${eco.monedas}*.` ,
                quoted: msg,
              })
              return
            }
            restarMonedas(sender, COSTE_COMANDO_ORO, 'comando', `${prefijo}${clave}`)
          }

          // Todos los comandos reciben el mismo contexto
          const terminar = log.comando({ nombre: prefijo + clave, args, jid })
          try {
            await comando({
              sock,
              jid,
              msg,
              args,
              sender,
              esGrupo,
              commands,
              BOT_NAME,
              PREFIX: prefijosActivos,
              db,
            })
            terminar()
          } catch (e) {
            terminar(e)
          }
          return
        }

        // ── Menciones: el bot responde cuando lo llaman ──
        if (!esMencionDelBot(msg, sock, MENCIONES_BOT)) return

        // Con el modo bot apagado (o solo admins) la mencion tambien duerme
        if (esGrupo && (!modoChat(jid, 'bot') || modoChat(jid, 'onlyadmin'))) return

        const solicitado = extraerComandoTrasMencion(texto, MENCIONES_BOT)
        const nombre = solicitado?.nombre?.toLowerCase()
        const comando = nombre ? commands[nombre] : null

        if (comando) {
          // ── Club VIP: comandos exclusivos tambien por mencion ──
          if (nombre && COMANDOS_VIP.has(nombre) && !esVip(jidsDe({ msg, sender, sock }))) {
            log.ignorado({ nombre, jid, motivo: 'solo VIP' })
            await sock.sendMessage(jid, {
              text: `❌ \`${nombre}\` es exclusivo del Club VIP.\n_El owner puede darte acceso con_ \`.vip add @usuario\`_._`,
              quoted: msg,
            })
            return
          }

          // "beerus help" -> ejecuta el comando help
          const terminar = log.comando({ nombre, args: solicitado.args, jid, via: 'mención' })
          try {
            await comando({
              sock,
              jid,
              msg,
              args: solicitado.args,
              sender,
              esGrupo,
              commands,
              BOT_NAME,
              PREFIX: prefijosActivos,
              db,
            })
            terminar()
          } catch (e) {
            terminar(e)
          }
          return
        }

        // Mención sin comando -> charla con Beerus (IA). Sin texto, saluda y da la ayuda
        const pregunta = extraerPreguntaTrasMencion(texto, MENCIONES_BOT, sock)

        if (pregunta) {
          const terminarIA = log.comando({ nombre: 'ia', args: [pregunta], jid, via: 'mención' })
          try {
            const respondio = await charlarConBeerus({ sock, jid, msg, pregunta, esGrupo })
            terminarIA(respondio ? undefined : new Error('la IA no respondió'))
          } catch (e) {
            terminarIA(e)
          }
          return
        }

        await sock.sendMessage(
          jid,
          {
            text:
              `🐱 ¿Quién osa despertar a *${BOT_NAME}*?\n\n` +
              `Escríbeme tu pregunta después de mi nombre y te respondo, mortal.\n` +
              `💡 O usa *${PREFIX[0]}menu* para ver todo lo que puedo hacer.`,
          },
          { quoted: msg }
        )
      } catch (err) {
        log.error('Error procesando el mensaje', err)
      }
    })
  })

  // ── Anticall: rechaza las llamadas si algun chat activo /anticall on ──
  sock.ev.on('call', async (llamadas) => {
    if (!algunModoActivo('anticall')) return
    for (const llamada of llamadas || []) {
      if (llamada?.status !== 'offer') continue
      try {
        await sock.rejectCall(llamada.id, llamada.from)
        log.sistema(`📵 Llamada rechazada de ${String(llamada.from || '').split('@')[0]}`)
      } catch (err) {
        log.aviso(`No se pudo rechazar la llamada: ${err?.message || err}`)
      }
    }
  })

  // ── Bienvenidas y despedidas en grupos ──
  // Evento 'group-participants.update': action 'add' (entra) y 'remove' (sale)
  sock.ev.on('group-participants.update', async (evento) => {
    try {
      await procesarCambioParticipantes(sock, evento)
    } catch (err) {
      log.error('Error en el saludo de bienvenida/despedida', err)
    }
  })

  // Auto-eventos: cambios de admins en el grupo
  sock.ev.on('groups.update', async (eventos) => {
    for (const ev of (Array.isArray(eventos) ? eventos : [eventos])) {
      if (!ev?.id?.endsWith('@g.us')) continue
      if (ev.subject) recordarGrupo(ev.id, ev.subject)
      // Baileys emite participants con action 'promote'/'demote'
      const participantes = ev.participants || []
      for (const p of participantes) {
        const jid = typeof p === 'string' ? p : p?.id
        if (!jid) continue
        const accion = (typeof p === 'object' ? p.action : null) || ev.action
        if (accion === 'promote') {
          try { await alertaAdmin(sock, ev.id, jid, 'promote') } catch {}
        } else if (accion === 'demote') {
          try { await alertaAdmin(sock, ev.id, jid, 'demote') } catch {}
        }
      }
    }
  })

  // El arte del menu y los banners de internet se preparan despues de que la
  // conexion este lista: al arrancar competirian por disco y red con Baileys,
  // y en un arranque en frio eso es justo lo que se nota.
  const PAUSA_PRECARGA_MS = 8000
  setTimeout(() => {
    // avatar.js y banners-menu.js arrastran sharp: se cargan aca y no al
    // arrancar, para que el socket tenga el disco y la CPU para el solo.
    import('./lib/avatar.js')
      .then(({ obtenerAvatarBeerus }) => obtenerAvatarBeerus())
      .catch((err) => log.error('Error precargando avatar de Beerus', err))

    import('./lib/banners-menu.js')
      .then(({ sincronizarBanners }) => sincronizarBanners({ nuevo: 4 }))
      .catch((err) => log.aviso(`No se pudieron precargar los banners del menu: ${err.message}`))
  }, PAUSA_PRECARGA_MS).unref()
}

// ───────────── Arranque ─────────────

// Solo una instancia del bot puede usar la sesion a la vez.
// Dos instancias se pisan entre si y provocan el cierre 440 en bucle.
const bloqueo = adquirirBloqueo()

if (!bloqueo.ok) {
  log.error(`Ya hay otra instancia del bot corriendo (PID ${bloqueo.pid}).`)
  log.aviso('Ciérrala antes de iniciar otra vez, o el bucle de conexión 440 volverá.')
  process.exit(1)
}

// Limpieza del bloqueo al cerrar el proceso
for (const señal of ['SIGINT', 'SIGTERM', 'exit']) {
  process.on(señal, () => {
    liberarBloqueo()
    if (señal !== 'exit') process.exit(0)
  })
}

process.on('unhandledRejection', (err) => {
  log.error('Promesa rechazada sin manejar', err)
})

startBot().catch((err) => {
  log.error('No se pudo iniciar el bot', err)
  liberarBloqueo()
  process.exit(1)
})

