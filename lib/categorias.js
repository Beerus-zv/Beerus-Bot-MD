/**
 * Organizacion del menu por categorias.
 * Solo se listan los comandos que existan en el registro de index.js.
 */
import { aliasDe } from './alias.js'
import { CONTACTO } from '../config.js'

/**
 * Descripcion corta de cada comando, tal y como aparece en el menu.
 * Si un comando no esta aqui, se lista sin descripcion.
 */
export const DESCRIPCIONES = {
  // ── Generales──
  greet: 'Saluda y muestra su estado',
  ping: 'Mide la velocidad de respuesta',
  menu: 'Muestra todos los comandos',
  help: 'Alias de /menu',
  info: 'Datos e informacion del bot',
  stats: 'Estadisticas de uso del bot',
  stickers: 'Convierte imagenes en stickers',
  dado: 'Tira dados con su notacion de rol',

  // ── Socket y configuracion ──
  socket: 'Estado de la configuracion del bot',
  bots: 'Sesiones y sockets activos del proceso',
  prefix: 'Prefijos que acepta el bot',
  self: 'Modo privado: el bot ignora los grupos',
  join: 'Une el bot a un grupo por link',
  logout: 'Cierra la sesion de WhatsApp del bot',
  setbotname: 'Cambia el nombre visible del bot',
  setbotowner: 'Registra el owner del bot',
  setbotlink: 'Cambia el link que muestra el menu',
  setbotcurrency: 'Cambia el nombre de la moneda',
  setbotprefix: 'Cambia los prefijos aceptados',
  setbanner: 'Fija la imagen del menu',
  seticon: 'Cambia el icono del menu',
  setimage: 'Cambia la foto de perfil del socket',
  setusername: 'Cambia el nombre de perfil del socket',

  // ── Reportes, utilidades y perfil ──
  report: 'Envia un reporte o sugerencia al owner',
  say: 'Repite un texto con la voz del bot',
  jid: 'Muestra el JID de un chat, usuario o grupo',
  lid: 'Muestra el LID de un usuario',
  gitclone: 'Descarga un repositorio de GitHub en ZIP',
  warnlist: 'Lista general de advertencias del grupo',
  primary: 'Bot primario del grupo',
  setprimary: 'Marca este bot como primario del grupo',
  delprimary: 'Quita el bot primario del grupo',
  setpasatiempo: 'Guarda tu pasatiempo en el perfil',
  delpasatiempo: 'Borra tu pasatiempo del perfil',
  antistatus: 'No marcar los estados como vistos',
  anticall: 'Rechaza las llamadas entrantes',
  rpg: 'Activa o apaga los comandos de rol',
  juegos: 'Activa o apaga los juegos del chat',

  // ──GRUPO──
  group: 'Crea un grupo nuevo',
  groupinfo: 'Info y ajustes del grupo',
  listmembers: 'Lista los miembros del grupo',
  listadmins: 'Lista los administradores',
  invite: 'Envia el link de invitacion',
  resetlink: 'Genera un nuevo link de invitacion',
  promote: 'Promueve a miembro a administrador',
  demote: 'Quita el admin a un miembro',
  ban: 'Banea al usuario del uso del bot (bloquea todos los comandos)',
  unban: 'Quita el ban del usuario para que pueda usar el bot',
  kick: 'Expulsa a un miembro del grupo',
  add: 'Agrega un numero al grupo',
  delete: 'Borra el mensaje citado (admins)',
  mute: 'Abre o cierra el grupo para escribir (close/open)',
  restrict: 'Solo admins cambian ajustes',
  system: 'Cambia los ajustes del grupo',
  requests: 'Muestra solicitudes de ingreso',
  approve: 'Aprueba una solicitud de ingreso',
  reject: 'Rechaza una solicitud de ingreso',
  setname: 'Cambia el nombre del grupo',
  setdesc: 'Cambia la descripcion del grupo',
  groupimage: 'Cambia la foto del grupo',
  ephemeral: 'Mensajes que desaparecen',
  history: 'Historial de mensajes del grupo',
  listgroups: 'Lista los grupos del bot',
  leave: 'Sale del grupo actual',
  creategroup: 'Crea un grupo nuevo',
  hidetag: 'Menciona a todos los miembros',
  encuesta: 'Crea una encuesta nativa',
  reaccionar: 'Reacciona a un mensaje con emoji',
  modos: 'Estado de los modos del chat',
  autoreact: 'Reacciones aleatorias a los mensajes del chat',
  autoread: 'Marca como leido cada mensaje: sin contadores de no leidos (admins)',
  bot: 'Activa o apaga el bot en este chat (admins)',
  economia: 'Activa o apaga la economia en este chat (admins)',
  onlyadmin: 'Solo los admins pueden usar el bot (admins)',
  setwarnlimit: 'Define el limite de advertencias antes del flag de baneo',
  warnwords: 'Gestiona las palabras prohibidas del grupo',
  antidelete: 'Restaura mensajes borrados',
  antispam: 'Anti-flood de mensajes en el grupo',
  fantasmas: 'Detecta a los miembros que no hablan',
  autodetect: 'Detecta eventos del grupo (bienvenidas, promos)',
  inspect: 'Info de un chat o de los administradores',
  cleartmp: 'Limpia los archivos temporales del bot',

  // ──MULTIMEDIA──
  video: 'Descarga un video de YouTube',
  audio: 'Busca musica en YouTube y la envia',
  sticker: 'Convierte una imagen en sticker',
  stickervideo: 'Convierte video en sticker animado',
  stickeraudio: 'Sticker animado con su audio desde un video',
  qr: 'Genera un codigo QR de un texto',
  efecto: 'Aplica filtros a una imagen',
  revelar: 'Abre un mensaje de ver una vez',
  voz: 'Convierte texto en audio',

  // ──SEGURIDAD──
  antilink: 'Bloquea enlaces: kick, ban...',
  welcome: 'Configura el mensaje de bienvenida',
  bye: 'Configura el mensaje de despedida',
  advertencia: 'Advertencias de miembros',
  update: 'Actualiza el bot desde GitHub (solo owner)',

  // ──ECONOMIA──
  economy: 'Tu saldo, nivel y experiencia',
  bal: 'Muestra tu saldo de oro',
  daily: 'Recibe tu recompensa diaria',
  work: 'Trabaja para ganar oro',
  rob: 'Roba oro a otro usuario',
  pay: 'Envia oro a otro usuario',
  rank: 'Tabla de los mas ricos',
  casino: 'Slots, coinflip y apuestas',
  deposit: 'Guarda oro en el banco',
  withdraw: 'Retira oro de la bóveda',
  crime: 'Gana (o pierde) cometiendo crímenes',
  roulette: 'Apostar tu suerte a rojo o negro',
  paybank: 'Paga a alguien desde el banco',
  weekly: 'Recompensa semanal',
  monthly: 'Recompensa mensual',
  recompensas: 'Estado de las recompensas por tiempo',
  math: 'Reto de cálculo mental con apuesta',
  ppt: 'Piedra, papel o tijera con apuesta',
  // ── RPG ──
  rpg: 'Ficha del personaje de rol',
  hunt: 'Caza por oro y botín',
  mine: 'Mina minerales y gemas',
  fish: 'Pesca por oro y perlas',
  adventure: 'Aventura con riesgo de daño',
  dungeon: 'Mazmorra de varios pisos',
  cofre: 'Cofre cada hora',
  heal: 'Cúrate con pociones o vendajes',
  ritual: 'Ritual caro: oro o castigo',
  shop: 'Compra y vende items del RPG',
  inventory: 'Tu mochila',
  equip: 'Equipa espada, hacha o armadura',
  toimg: 'Convierte un sticker en imagen o video',
  tovideo: 'Pasa un sticker a video MP4',
  pfp: 'Muestra la foto de perfil de un usuario',
  marry: 'Se casa con otro usuario',
  divorce: 'Rompe el matrimonio actual',
  aceptar: 'Acepta la propuesta de boda o divorcio',
  pareja: 'Muestra con quien esta casado alguien',
  setbirth: 'Guarda tu fecha de cumpleaños',
  birthdays: 'Lista los cumpleaños próximos',

  // ──PERFILES (lote Neko)──
  setgenre: ' guarda tu género en el perfil: hombre | mujer | otro',
  delgenre: 'Borra tu género guardado',
  setdescription: 'Guarda una descripción en tu perfil',
  setfavourite: 'Elige tu personaje reclamado favorito',
  delfavourite: 'Quita tu personaje favorito',
  delfav: 'Quita tu personaje favorito',
  delbirth: 'Borra tu cumpleaños guardado',
  allbirthdays: 'Lista todos los cumpleaños',
  allbirths: 'Alias de allbirthdays',
  level: 'Muestra tu nivel y experiencia',
  leaderboard: 'Top de usuarios por experiencia',
  marryhistory: 'El historial de bodas y divorcios',
  topcount: 'Top de mensajes escritos en el grupo',
  msgcount: 'Cuenta los mensajes de un usuario',
  topinactive: 'Los usuarios menos activos del grupo',

  // ──GACHA──
  gacha: 'Tira cartas, reclama y gestiona tu coleccion',
  gachainfo: 'Estadisticas de tu coleccion y nivel',
  rollgacha: 'Tirar un personaje aleatorio',
  claim: 'Reclamar un personaje (VIP, 1 vez al mes)',
  gachaclaim: 'Tu reclamo VIP de personaje (1 vez cada 2 semanas)',
  c: 'Reclama la carta pendiente del chat',
  collection: 'Ver tu coleccion de personajes',
  harem: 'Alias de /gacha collection',
  deletegacha: 'Eliminar un personaje de tu coleccion',
  setclaimmsg: 'Modificar tu mensaje al reclamar',
  delclaimmsg: 'Restablecer el mensaje al reclamar',
  givechar: 'Regalar un personaje a otro usuario',
  giveallgacha: 'Regalar toda tu coleccion a otro usuario',
  trade: 'Intercambiar personajes con otro usuario',
  sell: 'Poner un personaje a la venta',
  buycharacter: 'Comprar un personaje en venta',
  removesale: 'Quitar un personaje de la venta',
  gachashop: 'Ver los personajes en venta',
  vote: 'Votar por un personaje para subir su valor',
  charinfo: 'Ver la ficha de un personaje',
  charimage: 'Ver una imagen de un personaje',
  charvideo: 'Ver el video de un personaje',
  setcardimage: 'Cambiar la imagen de la carta (owner/admin)',
  serielist: 'Listar series de anime (AniList)',
  serieinfo: 'Ver los personajes de un anime (AniList)',
  favoritetop: 'Ver el top de personajes favoritos',
  gachaboard: 'Ver el top por valor de los personajes',

  // ──VIP──
  vip: 'Club VIP: lista, add/remove (solo owner)',
  vipbadge: 'Tu badge de miembro VIP',
  vipboost: 'Boost VIP: +500 oro y +200 xp (1/semana)',
  vipmenu: 'Menu del club VIP',
  dona: 'Donantes: x2/x3 oro y xp (solo owner)',

  // ──JUEGOS──
  uno: 'Partidas de UNO con apuestas',
  adivinar: 'Adivina el numero de Beerus',
  acertijo: 'Resuelve acertijos con pistas',
  sopa: 'Sopa de letras escondida',
  ahorcado: 'Juego del ahorcado por grupo',
  tateti: 'Ta-Te-Ti contra otro usuario',
  poker: 'Póker de 5 cartas contra la banca',
  hack: 'Parodia de hackeo (es broma)',
  curiosidad: 'Un dato curioso al azar',

  // ──INTERNET──
  buscar: 'Busca en la web y sus resultados',
  youtube: 'Busca videos en YouTube',
  wiki: 'Resumen de articulos de Wikipedia',
  clima: 'Clima y pronostico de 3 dias',
  traducir: 'Traduce entre idiomas',
  leerurl: 'Descarga una pagina web',
  pokedex: 'Ficha de un Pokemon',
  gitinfo: 'Info de un repositorio GitHub',
  npm: 'Info de un paquete npm',
  ip: 'Rastrea una direccion IP',
  acortar: 'Acorta una URL con TinyURL',
  letra: 'Letra de una cancion',

  // ──DESCARGAS──
  descargar: 'Descarga de YouTube, TikTok, Facebook...',
  tiktok: 'Descarga videos de TikTok',
  facebook: 'Descarga de Facebook',
  instagram: 'Descarga de Instagram',
  igstory: 'Descargar historias de Instagram (@user)',
  tiktoksearch: 'Buscar videos de TikTok',
  cuevana: 'Buscar peliculas y series',
  spotifysearch: 'Descargar musica Spotify',
  dalle: 'Generar imagen con IA (DALL·E / GPT Image)',
  remini: 'Mejorar calidad de imagen (HD)',
  anonimo: 'Chat anónimo (start/leave/next)',
  mediafire: 'Descarga archivos de MediaFire',
  twitter: 'Descarga de Twitter/X',
  apk: 'Busca y descarga APKs de Android',
  imagen: 'Busca imágenes y las envía al chat',
  spotifydl: 'Convierte una canción de Spotify a mp3',
  drive: 'Descarga archivos de Google Drive',
  pixiv: 'Descarga ilustraciones y mangas de Pixiv',
  pinterest: 'Busca y baja pins de Pinterest',
  nhentai: 'Descarga doujins como PDF',
  hitomi: 'Descarga galerías de HitomiLA como PDF',
  vermangasporno: 'Descarga mangas como PDF',

  // ──ENTRETENIMIENTO──
  '8ball': 'Consulta la bola 8 de la suerte',
  truthordare: 'Verdad o reto',
  joke: 'Te cuenta un chiste',
  quote: 'Frase motivacional del dia',
  advice: 'Un consejo para tu dia',
  compliment: 'Un cumplido bonito',
  pickup: 'Frase para ligar',
  ship: 'Embarca a dos personas',
  love: 'Acciones de amor',
  calcular: 'Calculadora de expresiones',
  estilizar: 'Estiliza un texto',

  // ──IA──
  ia: 'Conversa con el oraculo de Beerus',
  chatgpt: 'Habla con el modelo tipo ChatGPT',
  gemini: 'Habla con Gemini (clave AI Studio)',

  // ──INTERACCIONES──
  interaccion: 'Lista las interacciones del reino',
  kiss: 'Besa a otro usuario',
  hug: 'Abraza a otro usuario',
  slap: 'Bofetada al usuario',
  punch: 'Puñetazo al usuario',
  bonk: 'Correccion con el mazo',
  pat: 'Palmadita en la cabeza',
  cuddle: 'Arrimon de ternura',
  bite: 'Mordisco al usuario',
  poke: 'Pica con el dedito',
  tickle: 'Ataque de cosquillas',
  yeet: 'Lanza por los aires',
  shake: 'Sacude sin piedad',
  patada: 'Patada voladora al usuario mencionado (gif anime)',
  stare: 'Acecho con la mirada',
  highfive: 'Choca los cinco',
  handhold: 'Le toma la mano',
  baka: 'Le grita BAKA',
  blush: 'Hace sonrojar',
  cry: 'Rompe en llanto frente a el',
  facepalm: 'Facepalm por lo que hizo',
  wave: 'Saluda con energia',
  dance: 'Baila con sus pasitos prohibidos',
  laugh: 'Explota en carcajadas por lo que hizo',
  happy: 'Celebra a saltos de felicidad',
  smile: 'Sonrisa con toda el alma',
  angry: 'Se enciende la furia (estilo Beerus)',
  nom: 'Devora su comida con Apetito',
  tableflip: 'Vuela la mesa por lo que hizo',
  thumbsup: 'Aprueba con un pulgar divino',
  yawn: 'Bosteza con dramatismo',

  // ──NSFW──
  nsfw: 'Activa o apaga el modo NSFW',
  'nsfw-interaccion': 'Lista las acciones NSFW con mencion',
  rule34: 'Busca en los boorus (modo NSFW)',
  danbooru: 'Busca en Danbooru (modo NSFW)',
  e621: 'Busca en e621 (modo NSFW)',
  gelbooru: 'Busca en Gelbooru (modo NSFW)',
  xvideos: 'Busca y descarga videos de XVideos',
  xnxx: 'Busca y descarga videos de XNXX',
  r34vid: 'Busca y descarga videos de Rule34Video',
  hentai: 'Imagen hentai al azar (modo NSFW)',
  ass: 'Imagen aleatoria de traseros (modo NSFW)',
  pussy: 'Imagen aleatoria de vaginas (modo NSFW)',
  nekomimi: 'Imagen aleatoria de chicas neko (modo NSFW)',
  slut: 'Trabajo nocturno del sótano (modo NSFW)',
  anal: 'Hacer un anal (modo NSFW)',
  blowjob: 'Dar una mamada (modo NSFW)',
  boobjob: 'Hacer una rusa (modo NSFW)',
  cowgirl: 'Montar encima de alguien (modo NSFW)',
  cum: 'Venirse en alguien (modo NSFW)',
  cummouth: 'Acabar en la boca de alguien (modo NSFW)',
  cumshot: 'Disparar semen (modo NSFW)',
  fap: 'Hacerse una paja (modo NSFW)',
  footjob: 'Hacer una paja con los pies (modo NSFW)',
  fuck: 'Follar a alguien (modo NSFW)',
  grabboobs: 'Agarrar tetas (modo NSFW)',
  grope: 'Manosear a alguien (modo NSFW)',
  handjob: 'Hacerle una paja a alguien (modo NSFW)',
  lickass: 'Lamer un culo (modo NSFW)',
  lickdick: 'Lamer un pene (modo NSFW)',
  lickpussy: 'Lamer un coño (modo NSFW)',
  sixnine: 'Hacer un 69 con alguien (modo NSFW)',
  spank: 'Dar una nalgada (modo NSFW)',
  squirt: 'Hacer que alguien se corra a chorros (modo NSFW)',
  suckballs: 'Chupar unos huevos (modo NSFW)',
  suckboobs: 'Chupar tetas (modo NSFW)',
  undress: 'Desnudar a alguien (modo NSFW)',
  yuri: 'Imagen yuri (modo NSFW)',
  tijeras: 'Hacer tijeras con mencion (modo NSFW)',

  // ──PERSONALES──
  profile: 'Muestra tu perfil y monedas',
  notes: 'Guarda tus notas',
  afk: 'Marca tu ausencia en el chat',
}

/**
 * Uso de argumentos de cada comando (la parte en cursiva de cada linea
 * de comando en el menu, estilo Neko). Solo comandos con argumentos.
 */
export const USOS = {
  dado: '[N o NdM+X]',
  rob: '<@mención>',
  pay: '<@mención> <cantidad>',
  casino: 'slots | coinflip | bet <monto>',
  deposit: '[cantidad | all]',
  withdraw: '[cantidad | all]',
  roulette: '<rojo | negro> <cantidad>',
  poker: 'reglas | start | join | go | mesa | cancel · jugadas por privado',
  marry: '<@mención>',
  aceptar: '',
  pareja: '[@mención]',
  setbirth: 'DD-MM | borrar',
  profile: 'Muestra tu perfil (y tu nivel)',
  setgenre: '[hombre | mujer | otro | borrar]',
  delgenre: '',
  setdescription: '<descripción | borrar>',
  setfavourite: '[nombre | borrar]',
  delfavourite: '',
  delfav: '',
  delbirth: '',
  allbirthdays: '',
  level: '[@mención]',
  leaderboard: '[página]',
  marryhistory: '[<@mención>]',
  toimg: '(responde a un sticker)',
  tovideo: '(responde a un sticker)',
  pfp: '[@mención | mensaje citado]',
  msgcount: '<@mención | teléfono | mensaje citado>',
  groupimage: '(responde a una imagen)',
  setwarnlimit: '<cantidad 1-20>',
  warnwords: '<add <palabra> | del <palabra> | list | clear>',
  bot: '[on | off]',
  economia: '[on | off]',
  onlyadmin: '[on | off]',
  autoreact: '[on | off]',
  autoread: '[on | off]',
  antidelete: '[on | off]',
  autodetect: '[on | off]',
  fantasmas: '[kick (admin)]',
  delete: '(responde al mensaje)',
  inspect: '[@mención]',
  traducir: '<texto>',
  pixiv: '<id o enlace> · /pixivpdf = PDF',
  pinterest: '<búsqueda | enlace>',
  nhentai: '<código | enlace>',
  hitomi: '<código | enlace>',
  vermangasporno: '<enlace>',
  gacha: 'random | claim | collection | info | stats | shop | help',
  gachainfo: '',
  rollgacha: '',
  claim: '<nombre>',
  gachaclaim: '<nombre>',
  c: '(tras una tirada)',
  collection: '[@mención] [página]',
  deletegacha: '[nombre]',
  setclaimmsg: '[texto]',
  delclaimmsg: '',
  givechar: '[@mención] [nombre]',
  giveallgacha: '[@mención]',
  trade: '[@mención] [tu personaje] / [el suyo]',
  sell: '[precio] [nombre]',
  buycharacter: '[nombre]',
  removesale: '[nombre]',
  gachashop: '[página]',
  vote: '[nombre]',
  charinfo: '[nombre]',
  charimage: '[nombre · /wimage]',
  charvideo: '[nombre · /wvideo]',
  setcardimage: '<nombre|id> [url · /sci]',
  serielist: '[página]',
  serieinfo: '<serie>',
  favoritetop: '',
  gachaboard: '[página · /wtop]',
  vip: '[add @user | remove @user]',
  vipbadge: '',
  vipboost: '',
  vipmenu: '',
  dona: 'add @user <1|2> · del @user · list',
}

/** Frase que explica de que va cada categoria (linea "> ✐ Comandos de *X*...") */
export const PROPOSITOS = {
  generales: 'para el día a día del bot.',
  grupo: 'para administrar tus grupos.',
  multimedia: 'para crear stickers y multimedia.',
  economia: 'para ganar oro y apostarlos.',
  gacha: 'para tirar y reclamar personajes de anime.',
  vip: 'para los miembros del club VIP de Beerus.',
  juegos: 'para jugar con el reino.',
  utilidades: 'para utilidades rápidas del día a día.',
  internet: 'para buscar por la web.',
  descargas: 'para descargar archivos de varias fuentes.',
  entretenimiento: 'para pasar el rato y divertirte.',
  personal: 'para tus notas y tu ausencia.',
  perfiles: 'para ver y configurar tu perfil.',
  ia: 'para conversar con los oráculos.',
  interacciones: 'para reaccionar con anime y acercarte a alguien.',
  nsfw: '(contenido para adultos).',
}

export const CATEGORIAS = [
  {
    id: 'generales',
    titulo: '🛠️ GENERALES',
    comandos: ['greet', 'ping', 'menu', 'help', 'info', 'stats', 'stickers', 'dado', 'report'],
  },
  {
    id: 'grupo',
    titulo: '👑 ADMINISTRACION DE GRUPOS',
    comandos: [
      'group',
      'groupinfo',
      'listmembers',
      'listadmins',
      'invite',
      'resetlink',
      'promote',
      'demote',
      'ban',
      'unban',
      'kick',
      'add',
      'delete',
      'mute',
      'restrict',
      'system',
      'requests',
      'approve',
      'reject',
      'setname',
      'setdesc',
      'groupimage',
      'ephemeral',
      'history',
      'listgroups',
      'leave',
      'creategroup',
      'hidetag',
      'encuesta',
      'reaccionar',
      // Modos por chat y ajustes de administracion
      'modos',
      'autoreact',
      'autoread',
      'bot',
      'economia',
      'onlyadmin',
      'setwarnlimit',
      'warnwords',
      'antidelete',
      'antispam',
      'fantasmas',
      'autodetect',
      'inspect',
      'cleartmp',
      'antilink',
      'welcome',
      'bye',
      'advertencia',
      'update',
      // Lote Group: primario, lid, lista de warns y modos nuevos
      'primary',
      'setprimary',
      'delprimary',
      'lid',
      'warnlist',
      'antistatus',
      'anticall',
      'rpg',
      'juegos',
    ],
  },
  {
    id: 'multimedia',
    titulo: '🎨 MULTIMEDIA',
    comandos: ['video', 'audio', 'sticker', 'stickervideo', 'stickeraudio', 'qr', 'efecto', 'revelar', 'voz'],
  },
  {
    id: 'economia',
    titulo: '💰 ECONOMIA Y CASINO',
    comandos: ['economy', 'bal', 'daily', 'work', 'rob', 'pay', 'rank', 'casino', 'deposit', 'withdraw', 'crime', 'roulette', 'paybank', 'weekly', 'monthly', 'recompensas', 'math', 'ppt'],
  },
  {
    id: 'rpg',
    titulo: '⚔️ RPG',
    comandos: ['rpg', 'hunt', 'mine', 'fish', 'adventure', 'dungeon', 'cofre', 'heal', 'ritual', 'shop', 'inventory', 'equip'],
  },
  {
    id: 'gacha',
    titulo: '🎰 GACHA ANIME',
    comandos: [
      'gacha',
      'c',
      'claim',
      'gachaclaim',
      'rollgacha',
      'gachainfo',
      'collection',
      'deletegacha',
      'setclaimmsg',
      'delclaimmsg',
      'givechar',
      'giveallgacha',
      'trade',
      'sell',
      'buycharacter',
      'removesale',
      'gachashop',
      'vote',
      'charinfo',
      'charimage',
      'charvideo',
      'setcardimage',
      'serielist',
      'serieinfo',
      'favoritetop',
      'gachaboard',
    ],
  },
  {
    id: 'vip',
    titulo: '👑 VIP DE BEERUS',
    comandos: ['vip', 'vipbadge', 'vipboost', 'vipmenu', 'dona'],
  },
  {
    id: 'juegos',
    titulo: '🃏 JUEGOS',
    comandos: ['uno', 'adivinar', 'acertijo', 'sopa', 'ahorcado', 'tateti', 'poker', 'hack'],
  },
  {
    id: 'utilidades',
    titulo: '🧰 UTILIDADES',
    comandos: ['calcular', 'estilizar', 'toimg', 'tovideo', 'pfp', 'topcount', 'msgcount', 'topinactive', 'dalle', 'remini', 'jid', 'say', 'gitclone'],
  },
  {
    id: 'internet',
    titulo: '🌐 INTERNET',
    comandos: ['buscar', 'youtube', 'wiki', 'clima', 'traducir', 'leerurl', 'pokedex', 'gitinfo', 'npm', 'ip', 'acortar', 'letra'],
  },
  {
    id: 'descargas',
    titulo: '📥 DESCARGAS',
    comandos: ['descargar', 'tiktok', 'facebook', 'instagram', 'mediafire', 'twitter', 'pixiv', 'pinterest', 'nhentai', 'hitomi', 'vermangasporno', 'tiktoksearch', 'igstory', 'cuevana', 'spotifysearch', 'apk', 'imagen', 'spotifydl', 'drive'],
  },
  {
    id: 'entretenimiento',
    titulo: '🎭 ENTRETENIMIENTO',
    comandos: [
      '8ball',
      'truthordare',
      'joke',
      'quote',
      'advice',
      'compliment',
      'pickup',
      'ship',
      'love',
      'curiosidad',
    ],
  },
  {
    id: 'personal',
    titulo: '⭐ PERSONALES',
    comandos: ['notes', 'afk', 'anonimo'],
  },
  {
    id: 'perfiles',
    titulo: '📖 PERFILES',
    comandos: [
      'profile',
      'setgenre',
      'delgenre',
      'setpasatiempo',
      'setdescription',
      'setfavourite',
      'delfavourite',
      'delfav',
      'level',
      'leaderboard',
      'allbirthdays',
      'allbirths',
      'delbirth',
      'marry',
      'divorce',
      'aceptar',
      'pareja',
      'pfp',
      'marryhistory',
      'setbirth',
      'birthdays',
    ],
  },
  {
    id: 'socket',
    titulo: '⚙️ SOCKET Y CONFIGURACION',
    comandos: [
      'socket',
      'bots',
      'prefix',
      'self',
      'join',
      'logout',
      'setbotname',
      'setbotowner',
      'setbotlink',
      'setbotcurrency',
      'setbotprefix',
      'setbanner',
      'seticon',
      'setimage',
      'setusername',
    ],
  },
  {
    id: 'ia',
    titulo: '🤖 IA DE BEERUS',
    comandos: ['ia', 'chatgpt', 'gemini'],
  },
  {
    id: 'interacciones',
    titulo: '💞 INTERACCIONES',
    comandos: [
      'interaccion',
      'kiss',
      'hug',
      'slap',
      'punch',
      'bonk',
      'pat',
      'cuddle',
      'bite',
      'poke',
      'tickle',
      'yeet',
      'shake',
      'patada',
      'stare',
      'highfive',
      'handhold',
      'baka',
      'blush',
      'cry',
      'facepalm',
      'wave',
      'dance',
      'laugh',
      'happy',
      'smile',
      'angry',
      'nom',
      'tableflip',
      'thumbsup',
      'yawn',
    ],
  },
  {
    id: 'nsfw',
    titulo: '🔞 NSFW (OFF por defecto)',
    comandos: [
      'nsfw',
      'nsfw-interaccion',
      // Busquedas por fuente
      'rule34',
      'danbooru',
      'e621',
      'gelbooru',
      'hentai',
      // Videos
      'xvideos',
      'xnxx',
      'r34vid',
      // Tiradas sueltas de imagen
      'ass',
      'pussy',
      'nekomimi',
      'slut',
      'yuri',
      // Acciones con mencion
      'anal',
      'blowjob',
      'boobjob',
      'cowgirl',
      'cum',
      'cummouth',
      'cumshot',
      'fap',
      'footjob',
      'fuck',
      'grabboobs',
      'grope',
      'handjob',
      'lickass',
      'lickdick',
      'lickpussy',
      'sixnine',
      'spank',
      'squirt',
      'suckballs',
      'suckboobs',
      'undress',
      'tijeras',
    ],
  },
]

/**
 * Comandos mas relevantes de cada categoria: los unicos que aparecen en el
 * menu principal (/menu). El listado completo vive en su propio menu
 * (/menu <categoria>) con sus usos y descripciones.
 */
export const DESTACADOS = {
  generales: ['ping', 'menu', 'help', 'dado', 'stickers'],
  grupo: ['group', 'bot', 'ban', 'kick', 'promote', 'hidetag', 'antilink'],
  multimedia: ['sticker', 'stickervideo', 'stickeraudio', 'video', 'audio', 'qr'],
  economia: ['daily', 'work', 'economy', 'casino', 'rob'],
  gacha: ['gacha', 'c', 'claim', 'collection', 'gachaboard'],
  vip: ['vip', 'vipbadge', 'vipboost', 'gachaclaim'],
  juegos: ['uno', 'poker', 'ahorcado', 'tateti', 'adivinar'],
  utilidades: ['calcular', 'toimg', 'tovideo', 'topcount', 'pfp', 'dalle', 'remini'],
  internet: ['buscar', 'clima', 'traducir', 'letra'],
  descargas: ['descargar', 'tiktok', 'instagram', 'mediafire', 'pixiv', 'tiktoksearch', 'igstory', 'cuevana', 'spotifysearch'],
  entretenimiento: ['truthordare', 'ship', 'compliment', 'joke'],
  personal: ['notes', 'afk'],
  perfiles: ['profile', 'level', 'marry', 'setbirth'],
  ia: ['ia', 'chatgpt'],
  interacciones: ['kiss', 'hug', 'slap', 'pat', 'dance'],
  nsfw: ['nsfw', 'rule34', 'spank', 'hentai', 'ass'],
}

/** Limite de caracteres por mensaje de WhatsApp (para validar que el menu quepa en uno solo) */
const LIMITE_MENSAJE = 4096

/**
 * Capitaliza un titulo de categoria quitando el emoji:
 * '💰 ECONOMIA Y CASINO' -> 'Economia y casino'
 * Mantiene los acronimos (IA, NSFW, UNO) en mayusculas.
 */
const ACRONIMOS = ['IA', 'NSFW', 'UNO']
/** Nombres propios que van con mayuscula inicial (y no en minusculas) */
const PROPIOS = { beerus: 'Beerus' }
export function nombreBonito(titulo) {
  const texto = titulo.split(' ').slice(1).join(' ') || titulo
  return texto
    .toLowerCase()
    .split(' ')
    .map((palabra, i) => {
      const propia = PROPIOS[palabra]
      if (propia) return propia
      return ACRONIMOS.includes(palabra.toUpperCase())
        ? palabra.toUpperCase()
        : i === 0
          ? (palabra.charAt(0).toUpperCase() + palabra.slice(1) ?? '')
          : palabra
    })
    .join(' ')
}

/** Minusculas sin acentos, para comparar terminos escritos por el usuario */
export function quitarAcentos(texto) {
  return String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Categoria a la que pertenece un nombre de comando (para los modos
 * por chat de economia y gacha). Los alias de subcomandos conSub necesitan
 * su mapeo manual.
 * @returns {string|null} id de categoria, o null si no clasifica
 */
const ALIAS_CATEGORIA = {
  // economia (casino y banco)
  eco: 'economia',
  cs: 'economia',
  dep: 'economia',
  depositar: 'economia',
  with: 'economia',
  retirar: 'economia',
  crimen: 'economia',
  rt: 'economia',
  ruleta: 'economia',
  aceptar: 'perfiles',
  del: 'grupo',
  borrar: 'grupo',
  eliminar: 'grupo',
  // gacha anime (gacha y sus subs)
  claim: 'gacha',
  c: 'gacha',
  reclamar: 'gacha',
  roll: 'gacha',
  rw: 'gacha',
  gr: 'gacha',
  gc: 'gacha',
  rollgacha: 'gacha',
  gachaclaim: 'gacha',
  collection: 'gacha',
  coleccion: 'gacha',
  winfo: 'gacha',
  waifuinfo: 'gacha',
  harem: 'gacha',
  waifus: 'gacha',
  claims: 'gacha',
  wtop: 'gacha',
  favtop: 'gacha',
  wshop: 'gacha',
  givechar: 'gacha',
  regalar: 'gacha',
  charvideo: 'gacha',
  charimage: 'gacha',
  serieinfo: 'gacha',
  serielist: 'gacha',
  animelist: 'gacha',
  slist: 'gacha',
  votar: 'gacha',
  trade: 'gacha',
  vender: 'gacha',
  gachainfo: 'gacha',
  giveallgacha: 'gacha',
  gachashop: 'gacha',
  gachaboard: 'gacha',
  deletegacha: 'gacha',
}
export function categoriaDe(nombre) {
  const n = String(nombre || '').toLowerCase()
  for (const cat of CATEGORIAS) {
    if (cat.comandos.includes(n)) return cat.id
  }
  return ALIAS_CATEGORIA[n] ?? null
}

/**
 * Construye la estructura del menu agrupada por categorias.
 * Sirve tanto para el texto como para la imagen del menu.
 * @param {object} commands registro de comandos de index.js
 * @param {string} prefix prefijo de comando
 * @returns {Array<{id:string, titulo:string, lineas:Array<{nombre:string, comando:string, descripcion:string}>}>}
 */
export function estructuraMenu(commands = {}, prefix = '/') {
  const secciones = []

  for (const categoria of CATEGORIAS) {
    const disponibles = categoria.comandos.filter((nombre) => typeof commands[nombre] === 'function')
    if (!disponibles.length) continue

    const lineas = disponibles.map((nombre) => {
      // Une el comando con sus alias en una sola linea: /sticker, /s
      const nombres = [nombre, ...aliasDe(nombre).filter((a) => typeof commands[a] === 'function')]
      return {
        nombre,
        comando: nombres.map((n) => `${prefix}${n}`).join(', '),
        descripcion: DESCRIPCIONES[nombre] || '',
      }
    })

    secciones.push({ id: categoria.id, titulo: categoria.titulo, lineas })
  }

  return secciones
}

/** Cabecera de una seccion estilo Neko: cat + titulo en trazos */
function cabeceraSeccion(seccion) {
  const nombre = nombreBonito(seccion.titulo)
  return `» ˚୨ ฅ^"ﻌ"^ฅ ⊹ \`${nombre}\` ⊹`
}

/** Linea que explica de que va la categoria (estilo Neko) */
function introSeccion(seccion) {
  const nombre = nombreBonito(seccion.titulo)
  const proposito = PROPOSITOS[seccion.id] ?? ''
  return `> ✐ Comandos de *${nombre}* ${proposito}`.trim()
}

/** Texto de una seccion estilo Neko: cabecera, intro y comandos con uso + desc */
function textoSeccion(seccion) {
  const lineas = seccion.lineas.flatMap((linea) => {
    // cada alias va en su propia tacha de trenza: /deposit /dep /depositar
    const tokens = linea.comando
      .split(', ')
      .map((comando) => `\`${comando}\``)
      .join(' ')
    const uso = USOS[linea.nombre] ? ` _${USOS[linea.nombre]}_` : ''

    const partes = [`✧ ${tokens}${uso}`]
    if (linea.descripcion) partes.push(`> ${linea.descripcion}`)
    return partes
  })

  return [cabeceraSeccion(seccion), introSeccion(seccion), '', ...lineas].join('\n')
}

/**
 * Construye el texto del menu agrupado por categorias, con el estilo del bot.
 * Todo el menu se devuelve en un solo texto para enviarlo en un unico mensaje.
 * @param {object} commands registro de comandos de index.js
 * @param {string} prefix prefijo de comando
 * @returns {string} texto completo del menu
 */
export function construirMenu(commands = {}, prefix = '/') {
  return estructuraMenu(commands, prefix).map(textoSeccion).join('\n\n')
}

/**
 * Texto del menu de una sola categoria (/menu economia, /menu gacha anime...).
 * Acepta el id, el titulo completo o un prefijo del titulo (sin acentos).
 * Devuelve null si el termino no matchea ninguna categoria; '' si no hay
 * comandos registrados en ella.
 * @returns {string|null}
 */
export function menuDeCategoria(commands = {}, prefix = '/', termino = '') {
  const limpio = quitarAcentos(String(termino || '').toLowerCase()).trim()
  if (!limpio) return null

  // 1) matchea por id o titulo exactos; 2) por prefijo del id/titulo
  const exacta = (c) =>
    quitarAcentos(c.id).toLowerCase() === limpio ||
    quitarAcentos(nombreBonito(c.titulo)).toLowerCase() === limpio
  const prefijada = (c) =>
    quitarAcentos(c.id).toLowerCase().startsWith(limpio) ||
    quitarAcentos(nombreBonito(c.titulo)).toLowerCase().startsWith(limpio)
  const cat = CATEGORIAS.find(exacta) ?? CATEGORIAS.find(prefijada)
  if (!cat) return null

  const seccion = estructuraMenu(commands, prefix).find((s) => s.id === cat.id)
  return seccion ? textoSeccion(seccion) : ''
}

/**
 * Texto del menu principal: una linea por categoria con sus comandos mas
 * relevantes y la ruta (/menu <id>) para abrir el menu completo de cada mundo.
 *
 *   » ˚୨ `Menu principal`
 *   > ✐ 124 comandos en 15 mundos...
 *
 *   > 🛠️ *Generales*
 *   ✧ `/ping` `/menu` `/help` `/dado` `/stickers`
 *   > ✐ completo en `/menu generales`
 *
 * @param {object} commands registro de comandos de index.js
 * @param {string} prefix prefijo de comando
 * @returns {string} texto del menu principal (cabe en un mensaje)
 */
export function menuPrincipal(commands = {}, prefix = '/') {
  const activas = categoriasActivas(commands)
  const total = activas.reduce((n, c) => n + c.comandos.length, 0)

  const bloques = activas.map((cat) => {
    const emoji = cat.titulo.split(' ')[0]
    const pedidos = (DESTACADOS[cat.id] ?? cat.comandos.slice(0, 5)).filter(
      (n) => typeof commands[n] === 'function',
    )
    const tokens = pedidos.map((n) => `\`${prefix}${n}\``).join(' ')

    return [
      `> ${emoji} *${nombreBonito(cat.titulo)}*`,
      `✧ ${tokens}`,
      `> ✐ completo en \`${prefix}menu ${cat.id}\``,
    ].join('\n')
  })

  return [
    `» ˚୨ ฅ^"ﻌ"^ฅ ⊹ \`Menu principal\` ⊹`,
    `> ✐ ${total} comandos en ${activas.length} mundos: escoge el tuyo con \`${prefix}menu <categoria>\`.`,
    '',
    bloques.join('\n\n'),
    '',
    `🌙 *¿Apoyar el bot?*\n` +
    `▸ PayPal : ${CONTACTO.paypal}\n` +
    `▸ Instagram : @${CONTACTO.instagram}`,
  ].join('\n')
}

/**
 * Divide el menu en bloques de texto que caben en mensajes de WhatsApp,
 * cortando entre categorias (nunca a mitad de una categoria).
 * Se usa para enviar el menu siempre como texto despues del banner.
 *
 * @param {object} commands registro de comandos de index.js
 * @param {string} prefix prefijo de comando
 * @param {number} limite caracteres disponibles por mensaje
 * @returns {Array<string>} bloques de texto
 */
export function dividirMenu(commands = {}, prefix = '/', limite = LIMITE_MENSAJE) {
  const bloques = []
  let actual = ''

  for (const seccion of estructuraMenu(commands, prefix)) {
    const texto = textoSeccion(seccion)
    const juntado = actual ? `${actual}\n\n${texto}` : texto

    if (actual && juntado.length > limite) {
      bloques.push(actual)
      actual = texto
    } else {
      actual = juntado
    }
  }

  if (actual) bloques.push(actual)
  return bloques.length ? bloques : ['']
}

/**
 * Indica si un texto cabe en un solo mensaje de WhatsApp.
 */
export function cabeEnUnMensaje(texto = '') {
  return texto.length <= LIMITE_MENSAJE
}

/**
 * Cuenta los comandos registrados (para el panel de datos del menu).
 */
export function contarComandos(commands = {}) {
  return Object.keys(commands).filter((nombre) => typeof commands[nombre] === 'function').length
}

/**
 * Devuelve las categorias que tienen al menos un comando registrado.
 */
export function categoriasActivas(commands = {}) {
  return CATEGORIAS.map((categoria) => ({
    ...categoria,
    comandos: categoria.comandos.filter((nombre) => typeof commands[nombre] === 'function'),
  })).filter((categoria) => categoria.comandos.length)
}

