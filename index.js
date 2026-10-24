import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  normalizeMessageContent,
} from '@whiskeysockets/baileys'
import fs from 'node:fs'
import path from 'node:path'
import pino from 'pino'
import qrcode from 'qrcode-terminal'

// ───────────── Base de datos ─────────────
import { db, contarMensaje, contarMensajeUsuario, alertasActivas, listarAlertas, obtenerAfk, quitarAfk, modoChat, palabraProhibidaEn, registrarAdvertencia, contarAdvertencias, limiteAdvertencias, borrarAdvertencias, alertasAutoActivas, configurarAlertasAuto, setAntiDelete, getAntiDelete, limpiarAntiDelete } from './database/db.js'
import { obtenerMetadata, esAdmin, esMencionDelBot, extraerComandoTrasMencion, extraerPreguntaTrasMencion, tokenMencion, jidUsuario } from './lib/grupo.js'
import { log, recordarGrupo, necesitaNombre, intentoNombre } from './lib/logger.js'
import { autoReaccionar } from './lib/autoreact.js'
import { categoriaDe } from './lib/categorias.js'
import { revisarAntilink } from './lib/antilink.js'
import { procesarCambioParticipantes } from './lib/bienvenida.js'
import { alertaAdmin } from './lib/alertas.js'
import { obtenerAvatarBeerus } from './lib/avatar.js'
import { adquirirBloqueo, liberarBloqueo } from './lib/instancia.js'

// ───────────── Configuración ─────────────
import { BOT_NAME, PREFIX, AUTH_DIR, MENCIONES_BOT, LOG_LEVEL, METODO_VINCULACION, NUMERO_VINCULACION, NAVEGADOR_WA } from './config.js'
import { elegirVinculacion, formatearCodigo } from './lib/vinculacion.js'

import antidelete from './commands/antidelete.js'
import antispam from './commands/antispam.js'
import autodetectCmd from './commands/autodetect.js'
import fantasmas from './commands/fantasmas.js'
import dado from './commands/dado.js'
import inspect from './commands/inspect.js'
import cleartmp from './commands/cleartmp.js'
import vip from './commands/vip.js'
import vipbadge from './commands/vipbadge.js'
import vipmenu from './commands/vipmenu.js'
import vipboost from './commands/vipboost.js'
import update from './commands/update.js'  // NUEVO
import dona from './commands/dona.js'
import gachaclaim from './commands/gachaclaim.js'
import reclamarRandom from './commands/c.js'
import autodetect from './commands/autodetect.js'

const logger = pino({ level: LOG_LEVEL }) // cambia a 'info' o 'debug' para depurar

// Cache para almacenar mensajes recientes (para anti-delete)
const mensajeCache = new Map()
// Tiempo de vida del mensaje en la cache (ms) - 5 minutos
const TIEMPO_VIDA_MENSAJE = 300000

// ───────────── Comandos ─────────────
import greet from './commands/greet.js'
import ping from './commands/ping.js'
import menu from './commands/menu.js'
import info from './commands/info.js'
import stats from './commands/stats.js'
import stickers from './commands/stickers.js'
import help from './commands/help.js'
import profile from './commands/profile.js'
import notes from './commands/notes.js'
import group from './commands/group.js'
import listgroups from './commands/listgroups.js'
import leave from './commands/leave.js'
import creategroup from './commands/creategroup.js'
import promote from './commands/promote.js'
import demote from './commands/demote.js'
import ban from './commands/ban.js'
import unban from './commands/unban.js'
import kick from './commands/kick.js'
import add from './commands/add.js'
import listadmins from './commands/listadmins.js'
import listmembers from './commands/listmembers.js'
import groupinfo from './commands/groupinfo.js'
import invite from './commands/invite.js'
import resetlink from './commands/resetlink.js'
import mute from './commands/mute.js'
import restrict from './commands/restrict.js'
import systemcmd from './commands/system.js'
import requests from './commands/requests.js'
import approve from './commands/approve.js'
import reject from './commands/reject.js'
import setname from './commands/setname.js'
import setdesc from './commands/setdesc.js'
import ephemeral from './commands/ephemeral.js'
import history from './commands/history.js'
import video from './commands/video.js'
import audio from './commands/audio.js'
import sticker from './commands/sticker.js'
import stickervideo from './commands/stickervideo.js'
import antilink from './commands/antilink.js'
import economy from './commands/economy.js'
import casino from './commands/casino.js'
import eightball from './commands/8ball.js'
import truthordare from './commands/truthordare.js'
import joke from './commands/joke.js'
import quote from './commands/quote.js'
import advice from './commands/advice.js'
import compliment from './commands/compliment.js'
import pickup from './commands/pickup.js'
import ship from './commands/ship.js'
import love from './commands/love.js'
import buscar from './commands/buscar.js'
import youtube from './commands/youtube.js'
import wiki from './commands/wiki.js'
import clima from './commands/clima.js'
import traducir from './commands/traducir.js'
import leerurl from './commands/leerurl.js'
import welcome from './commands/welcome.js'
import bye from './commands/bye.js'
import gachaCmd from './commands/gacha.js'
import uno from './commands/uno.js'
import adivinar from './commands/adivinar.js'
import acertijo from './commands/acertijo.js'
import sopa from './commands/sopa.js'
import ahorcado from './commands/ahorcado.js'
import calcular from './commands/calcular.js'
import estilizar from './commands/estilizar.js'
import qr from './commands/qr.js'
import hidetag from './commands/hidetag.js'
import advertencia from './commands/advertencia.js'
import warnwords from './commands/warnwords.js'
import afk from './commands/afk.js'
import descargar from './commands/descargar.js'
import tiktok from './commands/tiktok.js'
import igstory from './commands/igstory.js'
import tiktoksearch from './commands/tiktoksearch.js'
import spotifysearch from './commands/spotifysearch.js'
import cuevana from './commands/cuevana.js'
import dalle from './commands/dalle.js'
import remini from './commands/remini.js'
import anonimo from './commands/anonimo.js'
import facebook from './commands/facebook.js'
import instagram from './commands/instagram.js'
import mediafire from './commands/mediafire.js'
import twitter from './commands/twitter.js'
import pinterest from './commands/pinterest.js'
import pixiv from './commands/pixiv.js'
import nhentai from './commands/nhentai.js'
import hitomi from './commands/hitomi.js'
import vermangasporno from './commands/vermangasporno.js'

// Modos por chat y administracion (lote Administracion)
import modos, { fabricarModo } from './commands/modos.js'
import autoreact from './commands/autoreact.js'
import msgcount from './commands/msgcount.js'
import topinactive from './commands/topinactive.js'
import groupimage from './commands/groupimage.js'
import setwarnlimit from './commands/setwarnlimit.js'

// ───────────── ComandosTomados de MEGA-MD ─────────────
import encuesta from './commands/encuesta.js'
import reaccionar from './commands/reaccionar.js'
import revelar from './commands/revelar.js'
import efecto from './commands/efecto.js'
import tateti from './commands/tateti.js'
import hack from './commands/hack.js'
import curiosidad from './commands/curiosidad.js'
import voz from './commands/voz.js'
import pokedex from './commands/pokedex.js'
import gitinfo from './commands/gitinfo.js'
import npminfo from './commands/npm.js'
import ip from './commands/ip.js'
import acortar from './commands/acortar.js'
import letra from './commands/letra.js'
import chatIA, { charlarConBeerus } from './commands/ia.js'
import chatgpt from './commands/chatgpt.js'
import gemini from './commands/gemini.js'
import interaccion, { fabricarInteraccion } from './commands/interaccion.js'
// ── Lote Neko: banco, sociales y utilidades ──
import deposit from './commands/deposit.js'
import withdraw from './commands/withdraw.js'
import crime from './commands/crime.js'
import roulette from './commands/roulette.js'
import topcount from './commands/topcount.js'
import marry from './commands/marry.js'
import divorce from './commands/divorce.js'
import aceptar from './commands/aceptar.js'
import pareja from './commands/pareja.js'
import setbirth from './commands/setbirth.js'
import birthdays from './commands/birthdays.js'

// Lote Perfiles (Neko): ficha, nivel y favoritos
import setgenre from './commands/setgenre.js'
import setdescription from './commands/setdescription.js'
import setfavourite from './commands/setfavourite.js'
import level from './commands/level.js'
import leaderboard from './commands/leaderboard.js'
import allbirthdays from './commands/allbirthdays.js'
import marryhistory from './commands/marryhistory.js'
import toimg from './commands/toimg.js'
import pfp from './commands/pfp.js'
import nsfwcmd from './commands/nsfw.js'
import rule34, { fabricarBusquedaNSFW } from './commands/rule34.js'
import hentai from './commands/hentai.js'
import nsfwInteraccion, {
  fabricarAccionNSFW,
  fabricarImagenNSFW,
} from './commands/nsfw-interaccion.js'

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

// Busquedas por fuente preferida
const danbooru = fabricarBusquedaNSFW('danbooru.donmai.us')
const e621 = fabricarBusquedaNSFW('e621.net')

/** Crea un alias que ejecuta un subcomando de economy */
const conSub = (fn, sub) => (ctx) => fn({ ...ctx, args: [sub, ...(ctx.args || [])] })

const commands = {
  greet,
  ping,
  menu,
  info,
  stats,
  stickers,
  help,
  dado,
  profile,
  notes,
  group,
  listgroups,
  leave,
  creategroup,
  promote,
  demote,
  ban,
  unban,
  kick,
  add,
  listadmins,
  listmembers,
  antidelete,
  antispam,
  autodetect: autodetectCmd,
  fantasmas,
  dado,
  dados: dado,
  dadu: dado,
  inspect,
  cleartmp,
  groupinfo,
  invite,
  resetlink,
  mute,
  restrict,
  system: systemcmd,
  update,
  requests,
  approve,
  reject,
  setname,
  setdesc,
  ephemeral,
  history,
  video,
  audio,
  sticker,
  stickervideo,
  antilink,
  // ── Economía y entretenimiento ──
  gacha: gachaCmd,
  gacha: gachaCmd,
  uno,
  economy,
  casino,
  '8ball': eightball,
  truthordare,
  joke,
  quote,
  advice,
  compliment,
  pickup,
  ship,
  love,
  // ── Internet ──
  buscar,
  youtube,
  wiki,
  clima,
  traducir,
  leerurl,
  // ── Bienvenidas y despedidas ──
  welcome,
  bye,
  // ── Juegos y utilidades nuevas ──
  adivinar,
  acertijo,
  sopa,
  ahorcado,
  calcular,
  estilizar,
  qr,
  hidetag,
  advertencia,
  warnwords,
  afk,
  // ── Descargas de internet ──
  descargar,
  tiktok,
  facebook,
  instagram,
  mediafire,
  twitter,
  // ── Lote Neko: descargas ──
  pixiv,
  pinterest,
  nhentai,
  hitomi,
  vermangasporno,
  // ── Novedades de MEGA-MD ──
  encuesta,
  reaccionar,
  revelar,
  efecto,
  tateti,
  hack,
  curiosidad,
  voz,
  pokedex,
  gitinfo,
  npm: npminfo,
  ip,
  acortar,
  letra,
  // ── IA de Beerus ──
  ia: chatIA,
  chatgpt,
  gemini,
  // ── Interacciones anime entre usuarios ──
  interaccion,
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
  deposit,
  withdraw,
  crime,
  roulette,
  topcount,
  marry,
  divorce,
  aceptar,
  pareja,
  setbirth,
  birthdays,
  // ── Lote Perfiles (Neko): ficha, nivel y favoritos ──
  setgenre,
  setdescription,
  setfavourite,
  level,
  leaderboard,
  allbirthdays,
  marryhistory,
  toimg,
  pfp,
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
  nsfw: nsfwcmd,
  rule34,
  hentai,
  danbooru,
  e621,
  'nsfw-interaccion': nsfwInteraccion,
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
  poll: encuesta,
  react: reaccionar,
  respuesta: reaccionar,
  vv: revelar,
  viewonce: revelar,
  fx: efecto,
  tictactoe: tateti,
  tts: voz,
  speak: voz,
  fact: curiosidad,
  github: gitinfo,
  gh: gitinfo,
  shorten: acortar,
  lyrics: letra,
  ly: letra,
  pk: pokedex,
  pdex: pokedex,
  // ── Alias de economía ──
  bal: conSub(economy, 'bal'),
  daily: conSub(economy, 'daily'),
  work: conSub(economy, 'work'),
  rob: conSub(economy, 'rob'),
  pay: conSub(economy, 'pay'),
  rank: conSub(economy, 'rank'),
  // ── Alias de internet ──
  google: buscar,
  search: buscar,
  g: buscar,
  yt: youtube,
  wikipedia: wiki,
  weather: clima,
  tiempo: clima,
  translate: traducir,
  trad: traducir,
  url: leerurl,
  web: leerurl,
  // ── Alias de bienvenidas ──
  bienvenida: welcome,
  saludo: welcome,
  despedida: bye,
  // ── Alias de descargas ──
  dl: descargar,
  tt: tiktok,
  fb: facebook,
  ig: instagram,
  mf: mediafire,
  x: twitter,
  // ── IA: conversa con oraculos ──
  gpt: chatgpt,
  ai: chatgpt,
  ask: chatgpt,
  oraculo: chatIA,
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
  interacciones: interaccion,
  int: interaccion,
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
  dep: deposit,
  depositar: deposit,
  with: withdraw,
  retirar: withdraw,
  crimen: crime,
  rt: roulette,
  ruleta: roulette,
  topmensajes: topcount,
  casarse: marry,
  divorciarse: divorce,
  aceptar,
  cumplefecha: setbirth,
  cumple: birthdays,
  // ── Alias de grupo que faltaban del menú Neko ──
  gp: group,
  // ── Lote Perfiles (Neko): alias ──
  delbirth: conSub(setbirth, 'borrar'),
  delgenre: conSub(setgenre, 'borrar'),
  delfavourite: conSub(setfavourite, 'borrar'),
  delfav: conSub(setfavourite, 'borrar'),
  setfav: setfavourite,
  lvl: level,
  lboard: leaderboard,
  top: leaderboard,
  allbirths: allbirthdays,
  marriagehistory: marryhistory,
  historialmatrimonio: marryhistory,
  bodas: marryhistory,
  setbio: setdescription,
  descripcion: setdescription,
  toimage: toimg,
  getpic: pfp,
  foto: pfp,
  // ── Alias de NSFW ──
  r34: rule34,
  rule: rule34,
  h: hentai,
  porno: hentai,
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
  tijeras: tijeras,
  69: sixnine,
  // ── Alias cortos: comandos largos en 1 o 2 letras ──
  dado: dado,
  m: menu,
  s: sticker,
  sv: stickervideo,
  d: descargar,
  tr: traducir,
  cleartmp: cleartmp,
  vip: vip,
  vipbadge: vipbadge,
  vipmenu: vipmenu,
  vipboost: vipboost,
  dona: dona,
  gachaclaim: gachaclaim,
  cleartemp: cleartmp,
  borrartmp: cleartmp,
  cl: clima,
  pf: profile,
  n: notes,
  ad: adivinar,
  ac: acertijo,
  sp: sopa,
  ah: ahorcado,
  cs: casino,
  gr: conSub(gachaCmd, 'random'),
  gc: conSub(gachaCmd, 'random'),
  u: uno,
  tod: truthordare,
  j: joke,
  q: quote,
  r: reaccionar,
  v: voz,
  p: ping,
  i: info,
  ht: hidetag,
  gi: groupinfo,
  lm: listmembers,
  la: listadmins,
  lg: listgroups,
  inv: invite,
  rl: resetlink,
  ep: ephemeral,
  y: youtube,
  // ── Alias del nombre corto que se muestra en el menu ──
  stk: stickers,
  svideo: stickervideo,
  verdad: truthordare,
  elogio: compliment,
  liga: pickup,
  ahorca: ahorcado,
  calc: calcular,
  estil: estilizar,
  eco: economy,
  perfil: profile,
  bienv: welcome,
  ginfo: conSub(gachaCmd, 'stats'),
  miembros: listmembers,
  admins: listadmins,
  grupos: listgroups,
  nuevo: creategroup,
  nombre: setname,
  desc: setdesc,
  link: resetlink,
  reqs: requests,
  apro: approve,
  rech: reject,
  promo: promote,
  demo: demote,
  restr: restrict,
  sys: systemcmd,
  eph: ephemeral,
  hist: history,
  ar: autoreact,
  tags: hidetag,
  anti: antilink,
  adv: advertencia,
  ww: warnwords,
  warnwords: warnwords,
  // ── Lote Neko: gacha de personajes ──
  claim: conSub(gachaCmd, 'claim'),
  c: reclamarRandom,
  reclamar: conSub(gachaCmd, 'claim'),
  rollgacha: conSub(gachaCmd, 'random'),
  rw: conSub(gachaCmd, 'random'),
  roll: conSub(gachaCmd, 'random'),
  winfo: conSub(gachaCmd, 'info'),
  waifuinfo: conSub(gachaCmd, 'info'),
  charinfo: conSub(gachaCmd, 'info'),
  harem: conSub(gachaCmd, 'collection'),
  waifus: conSub(gachaCmd, 'collection'),
  claims: conSub(gachaCmd, 'collection'),
  collection: conSub(gachaCmd, 'collection'),
  coleccion: conSub(gachaCmd, 'collection'),
  gachaboard: conSub(gachaCmd, 'valtop'),
  waifustop: conSub(gachaCmd, 'valtop'),
  topwaifus: conSub(gachaCmd, 'valtop'),
  wtop: conSub(gachaCmd, 'valtop'),
  valorboard: conSub(gachaCmd, 'valtop'),
  favoritetop: conSub(gachaCmd, 'favtop'),
  favtop: conSub(gachaCmd, 'favtop'),
  gachashop: conSub(gachaCmd, 'shop'),
  tiendawaifus: conSub(gachaCmd, 'shop'),
  wshop: conSub(gachaCmd, 'shop'),
  givechar: conSub(gachaCmd, 'give'),
  givewaifu: conSub(gachaCmd, 'give'),
  regalar: conSub(gachaCmd, 'give'),
  giveallgacha: conSub(gachaCmd, 'giveall'),
  buycharacter: conSub(gachaCmd, 'buy'),
  buychar: conSub(gachaCmd, 'buy'),
  buyc: conSub(gachaCmd, 'buy'),
  deletegacha: conSub(gachaCmd, 'delwaifu'),
  delgacha: conSub(gachaCmd, 'delwaifu'),
  delchar: conSub(gachaCmd, 'delwaifu'),
  setclaimmsg: conSub(gachaCmd, 'claimmsg'),
  setclaim: conSub(gachaCmd, 'claimmsg'),
  delclaimmsg: conSub(gachaCmd, 'delclaimmsg'),
  charvideo: conSub(gachaCmd, 'video'),
  waifuvideo: conSub(gachaCmd, 'video'),
  cvideo: conSub(gachaCmd, 'video'),
  wvideo: conSub(gachaCmd, 'video'),
  charimage: conSub(gachaCmd, 'image'),
  waifuimage: conSub(gachaCmd, 'image'),
  cimage: conSub(gachaCmd, 'image'),
  wimage: conSub(gachaCmd, 'image'),
  serieinfo: conSub(gachaCmd, 'serieinfo'),
  ainfo: conSub(gachaCmd, 'serieinfo'),
  animeinfo: conSub(gachaCmd, 'serieinfo'),
  serielist: conSub(gachaCmd, 'serielist'),
  slist: conSub(gachaCmd, 'serielist'),
  animelist: conSub(gachaCmd, 'serielist'),
  vote: conSub(gachaCmd, 'vote'),
  votar: conSub(gachaCmd, 'vote'),
  trade: conSub(gachaCmd, 'trade'),
  intercambiar: conSub(gachaCmd, 'trade'),
  tiktoksearch: tiktoksearch,
  igstory: igstory,
  cuevana: cuevana,
  spotifysearch: spotifysearch,
  dalle: dalle,
  remini: remini,
  anonimo: anonimo,
  sell: conSub(gachaCmd, 'sell'),
  vender: conSub(gachaCmd, 'sell'),
  removesale: conSub(gachaCmd, 'removesale'),
  removerventa: conSub(gachaCmd, 'removesale'),
  gachainfo: conSub(gachaCmd, 'stats'),
  infogacha: conSub(gachaCmd, 'stats'),
  // ── Lote Neko: descargas ──
  mp4: video,
  ytmp4: video,
  mp4doc: conSub(video, 'doc'),
  play: audio,
  playaudio: audio,
  ytaudio: conSub(audio, 'voz'),
  reel: instagram,
  ytsearch: youtube,
  pin: pinterest,
  px: pixiv,
  pixivpdf: conSub(pixiv, 'pdf'),
  nh: nhentai,
  nhdl: nhentai,
  hitomila: hitomi,
  vmp: vermangasporno,
  // ── Lote Administracion: modos por chat ──
  bot: botModo,
  economia: economiaModo,
  onlyadmin,
  modos,
  autoreact,
  msgcount,
  topinactive,
  groupimage,
  setwarnlimit,
  // Alias del lote administracion
  close: mute,
  open: mute,
  mensajes: msgcount,
  topinactivos: topinactive,
  inactivos: topinactive,
  groupimg: groupimage,
  setgroupimage: groupimage,
  warnlimit: setwarnlimit,
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
  liberarBloqueo()
  process.exit(0)
}

async function startBot() {
  // Si ya hay un socket vivo, se cierra antes de crear otro
  if (socketActivo) {
    cerrarSocket(socketActivo)
    socketActivo = null
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version } = await fetchLatestBaileysVersion()

  // Verificar si ya existe una sesión guardada (archivos de credenciales)
  // Si hay credenciales, no preguntar por el método de vinculación
  const credsPath = path.join(AUTH_DIR, 'creds.json')
  const tieneSesionGuardada = fs.existsSync(credsPath)

  // Solo si NO hay sesión guardada Y no se ha elegido método: preguntar QR/código
  if (!tieneSesionGuardada && !vinculacion) {
    vinculacion = await elegirVinculacion({
      metodoConfig: METODO_VINCULACION,
      numeroConfig: NUMERO_VINCULACION,
      argv: process.argv.slice(2),
    })
  }

  const sock = makeWASocket({
    version,
    logger,
    browser: [BOT_NAME, NAVEGADOR_WA, '2.1.0'], // nombre que verás en "Dispositivos vinculados"
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
  })

  socketActivo = sock

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
    }

    if (connection === 'close') {
      const codigo = lastDisconnect?.error?.output?.statusCode
      log.aviso(`Conexión cerrada (código ${codigo}).`)

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

    for (const msg of messages) {
      try {
        if (!msg.message) continue

        const jid = msg.key.remoteJid
        if (jid === 'status@broadcast') continue

        // Ignora los mensajes que envió el propio bot (evita bucles)
        if (vieneDelBot(msg)) continue

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
          mensajeCache.set(mensajeId, {
            contenido: texto,
            mensajeOriginal: msg.message,
            urlImagen: msg.message?.imageMessage?.url || msg.message?.imageMessage?.mediaUrl || null,
            urlVideo: msg.message?.videoMessage?.url || msg.message?.videoMessage?.mediaUrl || null,
            urlAudio: msg.message?.audioMessage?.url || msg.message?.audioMessage?.mediaUrl || null,
            sender: sender,
            jid: jid,
            tiempo: Date.now()
          })
          // Limpiar cache expirado
          const ahora = Date.now()
          for (const [id, data] of mensajeCache.entries()) {
            if (ahora - data.tiempo > TIEMPO_VIDA_MENSAJE) {
              mensajeCache.delete(id)
            }
          }
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
            if (accion) { log.seguridad('ANTILINK', `${tokenMencion(sender)} · acción: ${accion}`, jid); continue }
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
            if (!antiActivado) continue
            // Verificar que el usuario que eliminó sea admin
            if (sender) {
              const metadata = await obtenerMetadataCacheada(sock, jid)
              if (!esAdmin(metadata, sender)) continue
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
              if (idDirecto?.contenido) return idDirecto
              // Buscar por chat + sender, el mensaje más reciente
              let mejor = null
              for (const [id, data] of mensajeCache) {
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

            // Reenviar siempre con texto + frase Beerus (evita errores de imagen/video)
            const opcionesEnviar = { quoted: msg, mentions: remitenteCache ? [jidUsuario(sender)] : undefined }
            const textoAnti = (contenidoAlmacenado ? 'Contenido: ' + contenidoAlmacenado + '\n\n' : '') + fraseBeerus + '\n' + (remitenteCache ? tokenMencion(sender) + ' borró un mensaje.' : '')
            opcionesEnviar.text = textoAnti
            await sock.sendMessage(jid, opcionesEnviar)
          } catch (err) {
            log.error('Error en anti-delete', err)
          }
        }

        // ── Autoreact: reacciona al azar en los grupos donde se activó con .autoreact on ──
        if (esGrupo && !msg.key.fromMe) {
          autoReaccionar({ sock, jid, msg, texto, prefijos: PREFIX }).catch((err) =>
            log.aviso(`Autoreact falló: ${err?.message || err}`)
          )
        }

        if (msg.messageStubType && jid?.endsWith('@g.us') && modoChat(jid, 'detect')) {
          try { await autodetect({ sock, jid, msg, args: [], sender: msg.key.participant || msg.key.fromMe ? sock.user?.id : msg.key.remoteJid, esGrupo: true }) } catch {}
        }

        const prefijo = PREFIX.find((p) => texto.startsWith(p))
        if (prefijo) {
          const [nombre, ...args] = texto.slice(prefijo.length).trim().split(/\s+/)
          if (!nombre) continue

          const clave = nombre.toLowerCase()

          // ── Modos por chat (lote Administracion, solo grupos) ──
          if (esGrupo) {
            const esPuerta = clave === 'bot' || clave === 'onlyadmin'

            // Modo bot apagado: solo responde a /bot (y /onlyadmin)
            if (!modoChat(jid, 'bot') && !esPuerta) {
              log.ignorado({ nombre: prefijo + clave, jid, motivo: 'bot apagado en el grupo' })
              continue
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
                continue
              }
            }

            // Economia apagada (el toggle /economia siempre responde;
            // el gacha tiene su propia puerta dentro de /gacha)
            if (categoriaDe(clave) === 'economia' && clave !== 'economia' && !modoChat(jid, 'economia')) {
              log.ignorado({ nombre: prefijo + clave, jid, motivo: 'economía apagada' })
              continue
            }
          }

          const comando = commands[clave]
          if (!comando) { log.ignorado({ nombre: prefijo + clave, jid, motivo: 'no existe' }); continue }

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
              PREFIX,
              db,
            })
            terminar()
          } catch (e) {
            terminar(e)
          }
          continue
        }

        // ── Menciones: el bot responde cuando lo llaman ──
        if (!esMencionDelBot(msg, sock, MENCIONES_BOT)) continue

        // Con el modo bot apagado (o solo admins) la mencion tambien duerme
        if (esGrupo && (!modoChat(jid, 'bot') || modoChat(jid, 'onlyadmin'))) continue

        const solicitado = extraerComandoTrasMencion(texto, MENCIONES_BOT)
        const nombre = solicitado?.nombre?.toLowerCase()
        const comando = nombre ? commands[nombre] : null

        if (comando) {
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
              PREFIX,
              db,
            })
            terminar()
          } catch (e) {
            terminar(e)
          }
          continue
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
          continue
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

  // Precarga el banner de Beerus para que el menu no espere
  try {
  obtenerAvatarBeerus()
} catch (err) {
  log.error('Error precargando avatar de Beerus', err)
}
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

