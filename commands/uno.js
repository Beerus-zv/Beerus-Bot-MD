import { obtenerMetadata, jidUsuario, digitosJid, mencionDeParticipantes } from '../lib/grupo.js'
import {
  obtenerEconomia,
  sumarMonedas,
  oroDisponible,
  pagarConBanco,
  obtenerUsuario,
  crearPartidaUno,
  partidaUnoActiva,
  partidasUnoDeJugador,
  actualizarPartidaUno,
  agregarJugadorUno,
  jugadoresUno,
  actualizarManoUno,
  marcarPasoUno,
  quitarJugadorUno,
  terminarPartidaUno,
  partidasUnoFinalizadas,
  sumarPuntosUno,
  puntosUno,
  topUno,
} from '../database/db.js'
import {
  COLORES,
  CLAVES,
  crearMazo,
  repartir,
  esValida,
  buscarCartaEnMano,
  etiquetaCarta,
  puntosCarta,
  normalizarColor,
} from '../lib/uno.js'
import { nombreLegible, formatearNumero } from '../lib/economia.js'
import { enviarManoEnGrupo } from '../lib/mano-grupo.js'
import { enviarBotones, botonComando } from '../lib/botones.js'
import { log } from '../lib/logger.js'

const AYUDA = `🃏 *UNO*

*Todo se juega en el grupo:*
• \`/uno create <apuesta>\` - Crear partida
• \`/uno join\` - Unirse a la partida
• \`/uno start\` - Empezar la partida
• \`/uno leave\` - Salir de la partida

*Tus jugadas (también en el grupo):*
• \`/uno R7\` - Jugar rojo 7 (color + valor)
• \`/uno AS\` - Azul skip · \`/uno VR\` verde reverse · \`/uno Y+2\` amarillo +2
• \`/uno CV\` - Comodín verde · \`/uno C+A\` comodín +4 azul
• \`/uno draw\` - Robar una carta
• \`/uno hand\` - Ver tu mano

*Estadísticas:*
• \`/uno stats\` - Tus estadísticas
• \`/uno history\` - Últimas partidas
• \`/uno top\` - Clasificación global

_R ojo · A zul · V erde · M amarillo · C comodín. S skip · R reverse · +2 · +4._

_Tu mano llega al grupo como mensaje de ver una vez: solo vos la abrís._`

/** JSON seguro: nunca lanza; devuelve el valor por defecto si el texto no sirve */
function leerJson(texto, porDefecto = null) {
  if (texto === null || texto === undefined) return porDefecto
  try {
    const valor = JSON.parse(texto)
    return valor ?? porDefecto
  } catch {
    return porDefecto
  }
}

/** Lee la mano de un jugador */
function leerMano(fila) {
  const mano = leerJson(fila?.mano, [])
  return Array.isArray(mano) ? mano : []
}

/** Mazo guardado como JSON: siempre una lista de cartas */
function leerMazo(texto) {
  const mazo = leerJson(texto, [])
  return Array.isArray(mazo) ? mazo : []
}

/** Carta superior guardada como JSON: siempre una carta o null */
function leerUltima(texto) {
  const carta = leerJson(texto, null)
  return carta && typeof carta === 'object' && !Array.isArray(carta) ? carta : null
}

/**
 * Coacciona una fila de uno_partidas a la forma que espera el comando.
 * Devuelve null si la fila no se puede jugar (formato anterior o corrupto).
 */
function normalizarPartida(crudo) {
  if (!crudo || typeof crudo !== 'object') return null

  const id = Math.trunc(Number(crudo.id))
  if (!Number.isFinite(id) || id <= 0) return null
  if (crudo.estado && !['esperando', 'jugando', 'terminada', 'cancelada'].includes(crudo.estado)) return null

  const apuesta = Math.trunc(Number(crudo.apuesta))
  const direccion = Math.trunc(Number(crudo.direccion))
  const ultima = leerUltima(crudo.ultima)

  return {
    id,
    grupo: typeof crudo.grupo === 'string' ? crudo.grupo : '',
    estado: crudo.estado || 'esperando',
    creador: typeof crudo.creador === 'string' ? crudo.creador : '',
    apuesta: Number.isFinite(apuesta) && apuesta > 0 ? apuesta : 0,
    mazo: JSON.stringify(leerMazo(crudo.mazo)),
    color: typeof crudo.color === 'string' ? normalizarColor(crudo.color) : null,
    ultima: ultima ? JSON.stringify(ultima) : null,
    turno: typeof crudo.turno === 'string' ? crudo.turno : null,
    direccion: direccion === -1 ? -1 : 1,
    creado_en: crudo.creado_en ?? null,
  }
}

/** Cierra una fila inservible para que no bloquee partidas nuevas */
function cerrarInservible(crudo) {
  const id = Math.trunc(Number(crudo?.id))
  if (Number.isFinite(id) && id > 0) terminarPartidaUno(id, 'cancelada')
}

/** Partida activa del grupo, ya validada */
function partidaDeGrupo(grupo) {
  const crudo = partidaUnoActiva(grupo)
  if (!crudo) return null

  const partida = normalizarPartida(crudo)
  if (!partida) {
    cerrarInservible(crudo)
    return null
  }
  return partida
}

/** Partidas activas del jugador, ya validadas */
function partidasDelJugador(jid) {
  const partidas = []
  for (const crudo of partidasUnoDeJugador(jid)) {
    const partida = normalizarPartida(crudo)
    if (partida) partidas.push(partida)
    else cerrarInservible(crudo)
  }
  return partidas
}

/** Lista de jugadores con su mano, en orden de turno */
function cargarJugadores(partidaId) {
  return jugadoresUno(partidaId).map((j) => ({ jid: j.jid, mano: leerMano(j), puntos: j.puntos, pasado: j.pasado }))
}

/** Siguiente jugador según la dirección, saltando a los que pasaron */
function siguienteTurno(jugadores, actual, direccion) {
  if (!jugadores.length) return null
  const indice = jugadores.findIndex((j) => j.jid === actual)
  if (indice === -1) return jugadores[0].jid
  for (let i = 1; i <= jugadores.length; i++) {
    const cand = jugadores[(indice + i * direccion + jugadores.length * 2) % jugadores.length]
    if (!cand.pasado) return cand.jid
  }
  return jugadores[(indice + direccion + jugadores.length * 2) % jugadores.length].jid
}

// ───────────── Formato de las cartas ─────────────
/** Letra de cada color para el codigo corto de la carta */
const LETRA_COLOR = { rojo: 'R', azul: 'A', verde: 'V', amarillo: 'M', comodin: 'C' }

/** Codigo corto de una carta: R1, A+2, VS, MR, C, C+4 */
function codigoCarta(carta) {
  if (!carta) return '??'
  if (carta.tipo === 'comodin') return 'C'
  if (carta.tipo === '+4') return 'C+4'
  const letra = LETRA_COLOR[carta.color] || '?'
  if (carta.tipo === 'skip') return `${letra}S`
  if (carta.tipo === 'reverse') return `${letra}R`
  if (carta.tipo === '+2') return `${letra}+2`
  return `${letra}${carta.valor}`
}

// ───────────── Codigo corto de las jugadas ─────────────
/** Inicial de cada color dentro del codigo de jugada */
const INICIAL_COLOR = {
  R: 'rojo',
  A: 'azul',
  B: 'azul',
  V: 'verde',
  G: 'verde',
  M: 'amarillo',
  Y: 'amarillo',
  C: 'comodin',
  W: 'comodin',
}

/** Nombre completo del color: tambien vale escribirlo entero */
const NOMBRE_COLOR = {
  ROJO: 'rojo',
  AZUL: 'azul',
  VERDE: 'verde',
  AMARILLO: 'amarillo',
  COMODIN: 'comodin',
  WILD: 'comodin',
}

/** Valor escrito en corto: S skip, R reverse, +2, +4 */
const ALIAS_VALOR = {
  S: 'skip',
  SKIP: 'skip',
  X: 'skip',
  R: 'reverse',
  REV: 'reverse',
  REVERSE: 'reverse',
  INV: 'reverse',
  '+2': '+2',
  '2+': '+2',
  D2: '+2',
  '+4': '+4',
  '4+': '+4',
  D4: '+4',
}

/** Comandos de `/uno`: un codigo de carta nunca se confunde con ellos */
const COMANDOS_UNO = new Set([
  'help', 'ayuda',
  'create', 'crear', 'new',
  'join', 'unirse', 'entrar',
  'start', 'empezar', 'begin',
  'leave', 'salir', 'exit',
  'hand', 'mano', 'cards',
  'play', 'jugar', 'card', 'carta',
  'draw', 'robar', 'pick',
  'stats', 'estadisticas', 'stat',
  'history', 'historial',
  'top', 'leaderboard', 'ranking',
])

/**
 * Separa el color del principio del codigo: "R7" → { color: 'rojo', resto: '7' }.
 * Los nombres completos van primero porque AMARILLO tambien empieza por A.
 */
function separarColor(codigo) {
  if (!codigo) return null

  for (const nombre of Object.keys(NOMBRE_COLOR)) {
    if (codigo.startsWith(nombre)) {
      return { color: NOMBRE_COLOR[nombre], resto: codigo.slice(nombre.length) }
    }
  }

  const inicial = INICIAL_COLOR[codigo[0]]
  if (inicial) return { color: inicial, resto: codigo.slice(1) }
  return null
}

/**
 * Lee la jugada escrita por el jugador.
 *   R7   rojo 7           AS   azul skip
 *   VR   verde reverse    Y+2  amarillo +2
 *   CV   comodin verde    C+A  comodin +4 azul
 *   C    comodin sin color (el bot lo pide despues)
 * Tambien acepta el texto largo: "rojo 7", "azul skip", "+4 verde".
 * @returns {{tipo: string, color: string|null, valor: string|null, colorElegido: string|null}|null}
 */
function leerJugada(texto) {
  const codigo = String(texto || '').toUpperCase().replace(/[\s_-]+/g, '')
  if (!codigo) return null

  // +4 escrito por delante: "+4 verde", "+4V"
  if (codigo.startsWith('+4')) {
    const elegido = separarColor(codigo.slice(2))
    // Lo que sigue debe ser un color o nada: "+4casa" no es una jugada
    if (codigo.length > 2 && (!elegido || elegido.resto)) return null
    return {
      tipo: '+4',
      color: 'comodin',
      valor: '+4',
      colorElegido: elegido && elegido.color !== 'comodin' ? elegido.color : null,
    }
  }

  const separado = separarColor(codigo)
  const color = separado?.color ?? null
  const resto = separado?.resto ?? codigo

  // Comodin: lo que sigue es el color elegido; con + delante es el +4
  if (color === 'comodin') {
    const masCuatro = resto.startsWith('+')
    let elegidoTexto = masCuatro ? resto.slice(1) : resto
    if (masCuatro && elegidoTexto.startsWith('4')) elegidoTexto = elegidoTexto.slice(1)

    const elegido = elegidoTexto ? separarColor(elegidoTexto) : null
    // "CASA", "CARRO" y demas palabras no son jugadas: sobra texto tras el color
    if (elegidoTexto && (!elegido || elegido.resto)) return null
    return {
      tipo: masCuatro ? '+4' : 'comodin',
      color: 'comodin',
      valor: masCuatro ? '+4' : 'comodin',
      colorElegido: elegido && elegido.color !== 'comodin' ? elegido.color : null,
    }
  }

  if (!resto) return color ? { tipo: 'numero', color, valor: null, colorElegido: null } : null

  const valor = /^\d+$/.test(resto) ? String(Number(resto)) : ALIAS_VALOR[resto] ?? null
  if (!valor) return null

  return { tipo: 'numero', color, valor, colorElegido: null }
}

/**
 * ¿El texto es una jugada de UNO escrita a mano? Sirve para aceptar `R6` en el
 * privado sin prefijo. Devuelve false para palabras sueltas como "hola".
 */
export function esJugadaUno(texto) {
  const jugada = leerJugada(texto)
  if (!jugada || !jugada.color) return false
  return Boolean(jugada.valor) || jugada.tipo === 'comodin' || jugada.tipo === '+4'
}

// ───────────── Turnos con tiempo ─────────────
/**
 * Segundos que tiene cada jugador para jugar. Se puede ajustar con la
 * variable UNO_TURNO_SEGUNDOS (util para pruebas con partidas rapidas).
 */
const SEGUNDOS_TURNO = Math.max(5, Math.trunc(Number(process.env.UNO_TURNO_SEGUNDOS) || 60))
/** Tiempos agotados seguidos antes de cancelar una partida abandonada */
const MAX_TIEMPOS_SEGUIDOS = 6

/** Temporizador activo por grupo */
const temporizadores = new Map()
/** Turnos seguidos agotados por grupo */
const tiemposSeguidos = new Map()

/** Texto legible del tiempo por turno */
function textoTiempo() {
  if (SEGUNDOS_TURNO >= 60 && SEGUNDOS_TURNO % 60 === 0) {
    const minutos = SEGUNDOS_TURNO / 60
    return `${minutos} minuto${minutos === 1 ? '' : 's'}`
  }
  return `${SEGUNDOS_TURNO} segundos`
}

function cancelarTurno(grupo) {
  const activo = temporizadores.get(grupo)
  if (activo) clearTimeout(activo)
  temporizadores.delete(grupo)
}

function reiniciarTiempos(grupo) {
  tiemposSeguidos.delete(grupo)
}

/**
 * Cache de participantes del grupo: sirve para resolver las menciones dentro
 * del chat. Se refresca cada 5 minutos.
 */
const cacheParticipantes = new Map()
const TTL_PARTICIPANTES = 5 * 60 * 1000

async function participantesGrupo(sock, grupo) {
  const ahora = Date.now()
  const guardado = cacheParticipantes.get(grupo)
  if (guardado && guardado.expira > ahora) return guardado.lista

  try {
    const metadata = await obtenerMetadata(sock, grupo)
    const lista = metadata?.participants || []
    cacheParticipantes.set(grupo, { lista, expira: ahora + TTL_PARTICIPANTES })
    return lista
  } catch {
    return []
  }
}

/** Etiqueta con mención real para un jugador dentro del grupo */
async function mencionJugador(sock, grupo, jugador) {
  const participantes = await participantesGrupo(sock, grupo)
  const mencion = mencionDeParticipantes(participantes, jugador)
  return {
    token: mencion?.token || `@${digitosJid(jugador)}`,
    jid: mencion?.jid || jidUsuario(jugador),
  }
}

/** Lineas de la tarjeta: codigo, nombre y si la carta se puede jugar */
function lineasMano({ mano, ultima, color }) {
  return mano.map((c) => {
    const valida = esValida(c, ultima, color)
    return `${codigoCarta(c)}  ${etiquetaCarta(c)}${valida ? '' : '  (no jugable)'}`
  })
}

/**
 * Manda la mano al grupo como tarjeta de ver una vez, solo para ese jugador.
 * Nunca sale del grupo: la partida vive en el chat donde se juega.
 *
 * @returns {Promise<boolean>} true si la tarjeta salio
 */
async function enviarManoAlGrupo({ sock, grupo, jugador, turno = false, nota = '' }) {
  const actual = partidaDeGrupo(grupo)
  if (!actual || actual.estado !== 'jugando') return false

  const fila = jugadoresUno(actual.id).find((j) => j.jid === jugador)
  if (!fila) return false

  const mano = leerMano(fila)
  const ultima = leerUltima(actual.ultima)
  const jugables = mano.filter((c) => esValida(c, ultima, actual.color))

  const pie = turno
    ? jugables.length
      ? `Jugá con /uno R7 · robar con /uno draw · ${textoTiempo()} de turno`
      : `No tenés carta jugable: robá con /uno draw · ${textoTiempo()} de turno`
    : 'Esperá tu turno: te aviso en el grupo cuando te toque'

  return await enviarManoEnGrupo({
    sock,
    grupo,
    jugador,
    titulo: 'UNO · tu mano',
    subtitulo: `${mano.length} carta${mano.length === 1 ? '' : 's'}${turno ? ' · turno tuyo' : ''}`,
    lineas: lineasMano({ mano, ultima, color: actual.color }),
    pie,
    nota,
  })
}

/** Pie de los mensajes del grupo: carta superior, turno y tiempo */
async function pieTurno({ sock, grupo, partida, turno }) {
  const mencion = await mencionJugador(sock, grupo, turno)
  const ultima = leerUltima(partida.ultima)
  return {
    texto:
      `❀ *Carta superior* » ${etiquetaCarta(ultima)}\n` +
      `✦ *Turno* » ${mencion.token}\n` +
      `│ ⌛ Tiene *${textoTiempo()}* para jugar.`,
    menciones: [mencion.jid],
  }
}

/**
 * Publica el turno en el grupo, envía la mano por privado y arranca el reloj.
 * @param {object} opciones
 * @param {string} opciones.encabezado linea principal (jugada, robo, salida...)
 * @param {string} [opciones.detalle] linea extra (efecto de la carta)
 * @param {string[]} [opciones.menciones] JIDs que aparecen en el encabezado
 */
async function anunciarTurno({ sock, grupo, turno, encabezado, detalle = '', menciones = [], nota = '' }) {
  const partida = partidaDeGrupo(grupo)
  if (!partida || partida.estado !== 'jugando') return

  const pie = await pieTurno({ sock, grupo, partida, turno })
  const publico = `${encabezado}${detalle ? `\n${detalle}` : ''}\n\n${pie.texto}`
  await sock.sendMessage(grupo, {
    text: publico,
    mentions: [...menciones, ...pie.menciones],
  })

  // La mano del que tiene el turno va al grupo como tarjeta de ver una vez
  await enviarManoAlGrupo({ sock, grupo, jugador: turno, turno: true, nota })
  programarTurno({ sock, grupo, jugador: turno })
}

/** Programa el cierre automatico del turno */
function programarTurno({ sock, grupo, jugador }) {
  cancelarTurno(grupo)
  const temporizador = setTimeout(() => {
    temporizadores.delete(grupo)
    jugarPorTiempo({ sock, grupo, jugador }).catch((e) =>
      log.error('uno · error al pasar el turno por tiempo', e.message)
    )
  }, SEGUNDOS_TURNO * 1000)

  // No mantener vivo el proceso solo por este reloj
  if (typeof temporizador.unref === 'function') temporizador.unref()
  temporizadores.set(grupo, temporizador)
}

/**
 * Se acabo el tiempo del jugador: roba una carta y pasa el turno.
 * Tras varios turnos seguidos sin jugar, la partida se cancela.
 */
async function jugarPorTiempo({ sock, grupo, jugador }) {
  const partida = partidaDeGrupo(grupo)
  if (!partida || partida.estado !== 'jugando') return
  if (partida.turno !== jugador) return

  const fila = jugadoresUno(partida.id).find((j) => j.jid === jugador)
  if (!fila) return

  const mano = leerMano(fila)
  const ultima = leerUltima(partida.ultima)
  const mazo = leerMazo(partida.mazo)
  const robada = mazo.pop()

  let nota = ''
  let puedeJugar = false
  if (robada) {
    mano.push(robada)
    actualizarManoUno(partida.id, jugador, mano)
    actualizarPartidaUno(partida.id, { mazo: JSON.stringify(mazo) })
    puedeJugar = esValida(robada, ultima, partida.color)
    nota = puedeJugar
      ? `📥 Se acabó tu tiempo: robaste ${etiquetaCarta(robada)} y pasas el turno.`
      : `📥 Se acabó tu tiempo: robaste ${etiquetaCarta(robada)}, no la puedes jugar y pasas el turno.`
  } else {
    nota = '📥 Se acabó tu tiempo y no quedan cartas: pasas el turno.'
  }

  const seguidos = (tiemposSeguidos.get(grupo) || 0) + 1
  tiemposSeguidos.set(grupo, seguidos)

  if (seguidos >= MAX_TIEMPOS_SEGUIDOS) {
    cancelarTurno(grupo)
    tiemposSeguidos.delete(grupo)
    terminarPartidaUno(partida.id, 'cancelada')
    const mencion = await mencionJugador(sock, grupo, jugador)
    await sock.sendMessage(grupo, {
      text:
        `⌛ ${mencion.token} se quedó sin tiempo.\n\n` +
        `🚫 *Partida de UNO cancelada* por inactividad (${MAX_TIEMPOS_SEGUIDOS} turnos seguidos sin jugar).`,
      mentions: [mencion.jid],
    })
    return
  }

  const jugadores = cargarJugadores(partida.id)
  const turno = siguienteTurno(jugadores, jugador, partida.direccion)
  if (!turno) return

  actualizarPartidaUno(partida.id, { turno })

  const mencion = await mencionJugador(sock, grupo, jugador)
  const encabezado = puedeJugar
    ? `✿ ⌛ ${mencion.token} se quedó sin tiempo y robó una carta.`
    : robada
      ? `✿ ${mencion.token} ha robado una carta que no puede jugar y pasa su turno.`
      : `✿ ${mencion.token} se quedó sin tiempo y pasa su turno.`

  // Su mano actualizada (con la carta robada) va al grupo como tarjeta privada
  await enviarManoAlGrupo({ sock, grupo, jugador, nota })

  await anunciarTurno({
    sock,
    grupo,
    turno,
    encabezado,
    menciones: [mencion.jid],
  })
}

export default async ({ sock, jid, msg, args, sender, PREFIX, esGrupo: esG }) => {
  const prefijo = PREFIX?.[0] ?? '/'
  let sub = String(args[0] || 'help').toLowerCase()
  let resto = args.slice(1)
  const quien = sender || jid

  // Codigo corto suelto: `/uno R7` es lo mismo que `/uno play R7`
  if (!COMANDOS_UNO.has(sub)) {
    const suelta = leerJugada([sub, ...resto].join(''))
    if (suelta && (suelta.valor || suelta.tipo === 'comodin' || suelta.tipo === '+4')) {
      resto = [sub, ...resto]
      sub = 'play'
    }
  }

  // UNO se juega en el grupo y en ningun otro lado: la partida, las manos y
  // las jugadas viven en el mismo chat. Nada de copias al privado.
  if (!esG) {
    await sock.sendMessage(jid, {
      text:
        '🎲 *UNO se juega en el grupo.*\n' +
        'Abrí la partida donde están los jugadores: `/uno create`, `/uno join` y `/uno start`.\n' +
        '_Las manos llegan al grupo como mensaje de ver una vez, solo para su dueño._',
    })
    return
  }

  const partida = partidaDeGrupo(jid)
  const grupo = jid

  // ───────────── Crear partida ─────────────
  if (sub === 'create' || sub === 'crear' || sub === 'new') {
    if (partida) {
      await sock.sendMessage(jid, { text: '⚠️ Ya hay una partida en este grupo.', quoted: msg })
      return
    }

    const apuesta = Math.max(0, Math.trunc(Number(resto[0]) || 0))
    const saldo = oroDisponible(quien)
    if (apuesta > saldo.total) {
      await sock.sendMessage(jid, {
        text:
          `💸 No tienes oro suficiente para una apuesta de *${apuesta}*.\n` +
          `│ Cartera: *${saldo.enMano}* · Banco: *${saldo.enBanco}*`,
        quoted: msg,
      })
      return
    }

    const id = crearPartidaUno({ grupo: jid, creador: quien, apuesta })
    await enviarBotones({
      sock,
      jid,
      titulo: 'UNO · mesa abierta',
      texto:
        `🃏 *Partida de UNO creada* (id \`${id}\`)\n` +
        `💰 Apuesta: *${apuesta}* oro por jugador`,
      pie: `Se abre desde ${prefijo}uno`,
      botones: [
        botonComando('Unirme', `${prefijo}uno join`),
        botonComando('Empezar', `${prefijo}uno start`),
        botonComando('Mi mano', `${prefijo}uno hand`),
      ],
      quoted: msg,
    })
    return
  }


  // ───────────── Unirse ─────────────
  if (sub === 'join' || sub === 'unirse' || sub === 'entrar') {
    if (!partida) {
      await sock.sendMessage(jid, { text: '❌ No hay ninguna partida. Crea una con `/uno create`.', quoted: msg })
      return
    }

    if (partida.estado !== 'esperando') {
      await sock.sendMessage(jid, { text: '❌ La partida ya empezó.', quoted: msg })
      return
    }

    const jugadores = jugadoresUno(partida.id)
    if (jugadores.length >= 6) {
      await sock.sendMessage(jid, { text: '❌ La partida está llena (6 jugadores).', quoted: msg })
      return
    }

    if (jugadores.some((j) => j.jid === quien)) {
      await sock.sendMessage(jid, { text: '⚠️ Ya estás en la partida.', quoted: msg })
      return
    }

    const apuesta = partida.apuesta || 0
    let delBanco = 0
    if (apuesta > 0) {
      const pago = pagarConBanco(quien, apuesta, 'casino', 'Apuesta UNO')
      if (!pago.ok) {
        const saldo = oroDisponible(quien)
        await sock.sendMessage(jid, {
          text:
            `💸 Necesitas *${apuesta}* oro para entrar.\n` +
            `│ Cartera: *${saldo.enMano}* · Banco: *${saldo.enBanco}*`,
          quoted: msg,
        })
        return
      }
      delBanco = pago.delBanco
    }

    agregarJugadorUno(partida.id, quien, [])

    const mencion = await mencionJugador(sock, grupo, quien)
    const aviso =
      `🙋 ${mencion.token} se unió a la partida.` +
      (delBanco > 0 ? `\n🏦 Del banco: *${delBanco}* oro.` : '')

    await sock.sendMessage(jid, { text: aviso, mentions: [mencion.jid], quoted: msg })
    return
  }

  // ───────────── Empezar ─────────────
  if (sub === 'start' || sub === 'empezar' || sub === 'begin') {
    if (!partida) {
      await sock.sendMessage(jid, { text: '❌ No hay ninguna partida.', quoted: msg })
      return
    }

    if (partida.estado === 'jugando') {
      await sock.sendMessage(jid, { text: '⚠️ La partida ya está en marcha.', quoted: msg })
      return
    }

    const jugadores = jugadoresUno(partida.id)
    if (jugadores.length < 2) {
      await sock.sendMessage(jid, { text: '❌ Necesitas al menos 2 jugadores.', quoted: msg })
      return
    }

    const { manos, mazo } = repartir(crearMazo(), jugadores.map((j) => j.jid))
    for (const [jugador, mano] of manos) {
      actualizarManoUno(partida.id, jugador, mano)
      marcarPasoUno(partida.id, jugador, false)
    }

    // Carta inicial: se busca una de color normal
    let inicial = mazo.pop()
    while (inicial && (inicial.tipo !== 'numero' || inicial.valor === '0')) inicial = mazo.pop()
    if (!inicial) inicial = { color: CLAVES[0], valor: '0', tipo: 'numero' }

    actualizarPartidaUno(partida.id, {
      estado: 'jugando',
      mazo: JSON.stringify(mazo),
      color: inicial.color,
      ultima: JSON.stringify(inicial),
      turno: jugadores[0].jid,
      direccion: 1,
    })

    cancelarTurno(grupo)
    reiniciarTiempos(grupo)

    const menciones = []
    const lista = []
    for (const j of jugadores) {
      const mencion = await mencionJugador(sock, jid, j.jid)
      menciones.push(mencion.jid)
      lista.push(`• ${mencion.token} — ${manos.get(j.jid).length} cartas`)
    }

    await anunciarTurno({
      sock,
      grupo: jid,
      turno: jugadores[0].jid,
      encabezado: `✿ *¡Empieza la partida de UNO!*\n\n${lista.join('\n')}`,
      detalle:
        '🔒 Cada mano llega al grupo como mensaje de ver una vez.\n' +
        '│ Jugá con `/uno R7` (color + valor) acá mismo.',
      menciones,
    })

    // El resto de jugadores recibe su mano inicial, también en el grupo
    for (const j of jugadores.slice(1)) {
      await enviarManoAlGrupo({ sock, grupo: jid, jugador: j.jid })
    }
    return
  }

  // ───────────── Ver mano ─────────────
  if (sub === 'hand' || sub === 'mano' || sub === 'cards') {
    if (!partida || partida.estado !== 'jugando') {
      await sock.sendMessage(jid, { text: '❌ No hay ninguna partida en curso.', quoted: msg })
      return
    }

    const jugador = jugadoresUno(partida.id).find((j) => j.jid === quien)
    if (!jugador) {
      await sock.sendMessage(jid, { text: '❌ No estás en esta partida.', quoted: msg })
      return
    }

    await enviarManoAlGrupo({
      sock,
      grupo,
      jugador: quien,
      turno: partida.turno === quien,
      nota: partida.turno === quien ? '' : '🕒 Todavía no es tu turno.',
    })
    return
  }


  // ───────────── Jugar carta ─────────────
  if (sub === 'play' || sub === 'jugar' || sub === 'card' || sub === 'carta') {
    if (!partida || partida.estado !== 'jugando') {
      await sock.sendMessage(jid, { text: '❌ No hay ninguna partida en curso.', quoted: msg })
      return
    }

    if (partida.turno !== quien) {
      await sock.sendMessage(jid, {
        text: `⏳ No es tu turno. Juega *${nombreLegible(partida.turno, obtenerUsuario)}*.`,
        quoted: msg,
      })
      return
    }

    const jugador = jugadoresUno(partida.id).find((j) => j.jid === quien)
    if (!jugador) {
      await sock.sendMessage(jid, { text: '❌ No estás en esta partida.', quoted: msg })
      return
    }

    const mano = leerMano(jugador)
    const ultima = leerUltima(partida.ultima)

    // Codigo corto: R7 · AS · VR · Y+2 · CV · C+A
    const jugada = leerJugada(resto.join(''))
    let carta = null
    let colorElegido = jugada?.colorElegido ?? null

    if (jugada) {
      if (jugada.tipo === 'comodin' || jugada.tipo === '+4') {
        carta = buscarCartaEnMano(mano, { tipo: jugada.tipo })
      } else if (jugada.valor) {
        carta = buscarCartaEnMano(mano, { color: jugada.color, valor: jugada.valor })
      }
    }

    if (!carta) {
      await sock.sendMessage(jid, {
        text:
          '❓ *Uso:* `/uno R7` _(color + valor)_\n' +
          '_Ejemplos:_ `/uno R7` rojo 7 · `/uno AS` azul skip · `/uno VR` verde reverse · ' +
          '`/uno Y+2` amarillo +2 · `/uno CV` comodín verde · `/uno C+A` comodín +4 azul',
        quoted: msg,
      })
      await enviarManoAlGrupo({
        sock,
        grupo,
        jugador: quien,
        turno: partida.turno === quien,
        nota: '❓ No encontré esa carta en tu mano.',
      })
      return
    }

    if (!esValida(carta, ultima, partida.color)) {
      await sock.sendMessage(jid, {
        text: `❌ Esa carta no vale sobre ${etiquetaCarta(ultima)}.`,
        quoted: msg,
      })
      return
    }

    if ((carta.tipo === '+4' || carta.tipo === 'comodin') && !colorElegido) {
      await sock.sendMessage(jid, {
        text:
          carta.tipo === '+4'
            ? '🎨 Elige color: `/uno C+R` rojo · `/uno C+A` azul · `/uno C+V` verde · `/uno C+M` amarillo'
            : '🎨 Elige color: `/uno CR` rojo · `/uno CA` azul · `/uno CV` verde · `/uno CM` amarillo',
        quoted: msg,
      })
      return
    }

    // Aplicar la carta
    const nuevaMano = mano.filter((c) => c !== carta)
    actualizarManoUno(partida.id, quien, nuevaMano)

    let color = partida.color
    let direccion = partida.direccion
    let mazo = leerMazo(partida.mazo)
    let saltar = false
    let robar = 0

    if (carta.tipo === '+4' || carta.tipo === 'comodin') {
      color = colorElegido
    } else {
      color = carta.color
      if (carta.tipo === 'skip') saltar = true
      if (carta.tipo === 'reverse') direccion *= -1
      if (carta.tipo === '+2') {
        robar = 2
        saltar = true
      }
    }

    const jugadores = cargarJugadores(partida.id).map((j) =>
      j.jid === quien ? { ...j, mano: nuevaMano } : j
    )

    // +2 y +4: el jugador siguiente roba y pierde el turno
    let afectado = null
    let robadas = 0
    if (robar > 0 || carta.tipo === '+4') {
      const siguiente = siguienteTurno(jugadores, quien, direccion)
      const objetivo = jugadores.find((j) => j.jid === siguiente)
      if (objetivo) {
        const cantidad = carta.tipo === '+4' ? 4 : robar
        robadas = cantidad
        for (let i = 0; i < cantidad; i++) {
          const nueva = mazo.pop()
          if (nueva) objetivo.mano.push(nueva)
        }
        actualizarManoUno(partida.id, siguiente, objetivo.mano)
        afectado = siguiente
      }
      if (carta.tipo === '+4') saltar = true
    }

    actualizarPartidaUno(partida.id, {
      color,
      ultima: JSON.stringify(carta),
      mazo: JSON.stringify(mazo),
      direccion,
    })


    // Victoria
    if (!nuevaMano.length) {
      let puntos = 0
      for (const j of jugadores) {
        if (j.jid === quien) continue
        const suma = j.mano.reduce((acc, c) => acc + puntosCarta(c), 0)
        puntos += suma
        sumarMonedas(j.jid, suma, 'casino', 'Puntos UNO')
      }
      sumarMonedas(quien, puntos, 'casino', 'Victoria UNO')
      sumarPuntosUno(partida.id, quien, puntos)

      const apuesta = partida.apuesta || 0
      if (apuesta > 0) {
        for (const j of jugadores) {
          if (j.jid === quien) continue
          pagarConBanco(j.jid, apuesta, 'casino', 'Apuesta UNO')
        }
        sumarMonedas(quien, apuesta * (jugadores.length - 1), 'casino', 'Premio UNO')
      }

      terminarPartidaUno(partida.id, 'terminada')
      cancelarTurno(grupo)
      reiniciarTiempos(grupo)
      const resultado =
        `🏆 *¡${nombreLegible(quien, obtenerUsuario)} gana la partida de UNO!*\n` +
        `💰 Puntos: *${puntos}*` +
        (apuesta ? `\n💵 Premio: *${formatearNumero(apuesta * (jugadores.length - 1))}* oro` : '')

      await sock.sendMessage(grupo, { text: resultado })
      return
    }

    // Turno siguiente
    let turno
    if (saltar) {
      const intermedio = siguienteTurno(jugadores, quien, direccion)
      turno = siguienteTurno(jugadores, intermedio, direccion)
    } else {
      turno = siguienteTurno(jugadores, quien, direccion)
    }

    actualizarPartidaUno(partida.id, { turno })

    const mencion = await mencionJugador(sock, grupo, quien)
    const encabezado = `✿ *¡${mencion.token} ha jugado ${etiquetaCarta(carta)}!*`

    const efectos = []
    if (carta.tipo === '+4') efectos.push('│ +4 » El siguiente roba 4 cartas y pierde el turno.')
    if (carta.tipo === '+2') efectos.push('│ +2 » El siguiente roba 2 cartas y pierde el turno.')
    if (carta.tipo === 'skip') efectos.push('│ ⛔ El siguiente pierde el turno.')
    if (carta.tipo === 'reverse') efectos.push('│ 🔄 Se invierte el sentido.')
    if (carta.tipo === '+4' || carta.tipo === 'comodin') {
      efectos.push(`│ 🎨 Color elegido » *${COLORES[color]?.nombre || color}*`)
    }

    reiniciarTiempos(grupo)

    await anunciarTurno({
      sock,
      grupo,
      turno,
      encabezado,
      detalle: efectos.join('\n'),
      menciones: [mencion.jid],
    })

    // La mano se entrega en el grupo: al afectado (+2/+4) y al que jugó
    if (afectado && afectado !== turno) {
      await enviarManoAlGrupo({
        sock,
        grupo,
        jugador: afectado,
        nota: `📥 Robaste *${robadas}* cartas por el \`${carta.tipo}\`. Pierdes el turno.`,
      })
    }

    // Quien jugó también recibe su mano actualizada, sin turno
    if (quien !== turno && quien !== afectado) {
      await enviarManoAlGrupo({
        sock,
        grupo,
        jugador: quien,
        nota: `✅ Jugaste ${etiquetaCarta(carta)}.`,
      })
    }
    return
  }

  // ───────────── Robar ─────────────
  if (sub === 'draw' || sub === 'robar' || sub === 'pick') {
    if (!partida || partida.estado !== 'jugando') {
      await sock.sendMessage(jid, { text: '❌ No hay ninguna partida en curso.', quoted: msg })
      return
    }

    if (partida.turno !== quien) {
      await sock.sendMessage(jid, { text: '⏳ No es tu turno.', quoted: msg })
      return
    }

    const jugador = jugadoresUno(partida.id).find((j) => j.jid === quien)
    if (!jugador) {
      await sock.sendMessage(jid, { text: '❌ No estás en esta partida.', quoted: msg })
      return
    }

    const mazo = leerMazo(partida.mazo)
    const carta = mazo.pop()
    if (!carta) {
      await sock.sendMessage(jid, { text: '❌ No quedan cartas en el mazo.', quoted: msg })
      return
    }

    const mano = leerMano(jugador)
    mano.push(carta)
    actualizarManoUno(partida.id, quien, mano)
    actualizarPartidaUno(partida.id, { mazo: JSON.stringify(mazo) })

    const jugadores = cargarJugadores(partida.id).map((j) => (j.jid === quien ? { ...j, mano } : j))
    const turno = siguienteTurno(jugadores, quien, partida.direccion)
    actualizarPartidaUno(partida.id, { turno })

    const ultima = leerUltima(partida.ultima)
    const puedeJugar = esValida(carta, ultima, partida.color)
    const mencion = await mencionJugador(sock, grupo, quien)
    const encabezado = puedeJugar
      ? `✿ ${mencion.token} ha robado una carta y pasa su turno.`
      : `✿ ${mencion.token} ha robado una carta que no puede jugar y pasa su turno.`

    reiniciarTiempos(grupo)

    await anunciarTurno({
      sock,
      grupo,
      turno,
      encabezado,
      menciones: [mencion.jid],
      nota: turno === quien ? `📥 Robaste ${etiquetaCarta(carta)}.` : '',
    })

    // La carta robada y la mano van al grupo, solo para ese jugador
    if (turno !== quien) {
      await enviarManoAlGrupo({
        sock,
        grupo,
        jugador: quien,
        nota: `📥 Robaste ${etiquetaCarta(carta)}.`,
      })
    }
    return
  }

  // ───────────── Salir ─────────────
  if (sub === 'leave' || sub === 'salir' || sub === 'exit') {
    if (!partida) {
      await sock.sendMessage(jid, { text: '❌ No hay ninguna partida.', quoted: msg })
      return
    }

    const jugador = jugadoresUno(partida.id).find((j) => j.jid === quien)
    if (!jugador) {
      await sock.sendMessage(jid, { text: '❌ No estás en esta partida.', quoted: msg })
      return
    }

    quitarJugadorUno(partida.id, quien)

    const restantes = jugadoresUno(partida.id)
    const mencion = await mencionJugador(sock, grupo, quien)
    const encabezado = `👋 ${mencion.token} salió de la partida de UNO.`

    // Si ya no queda nadie, la partida se cancela
    if (!restantes.length) {
      cancelarTurno(grupo)
      reiniciarTiempos(grupo)
      terminarPartidaUno(partida.id, 'cancelada')
      await sock.sendMessage(grupo, { text: encabezado, mentions: [mencion.jid] })
      return
    }

    if (partida.estado === 'jugando') {
      // Con un solo jugador ya no se puede continuar
      if (restantes.length < 2) {
        cancelarTurno(grupo)
        reiniciarTiempos(grupo)
        terminarPartidaUno(partida.id, 'cancelada')
        await sock.sendMessage(grupo, {
          text: `${encabezado}\n\n🚫 *Partida cancelada:* hacen falta al menos 2 jugadores.`,
          mentions: [mencion.jid],
        })
        return
      }

      // Si se va el jugador del turno, pasa al siguiente
      if (partida.turno === quien) {
        const jugadores = cargarJugadores(partida.id)
        const turno = siguienteTurno(jugadores, quien, partida.direccion)
        actualizarPartidaUno(partida.id, { turno })
        reiniciarTiempos(grupo)
        await anunciarTurno({ sock, grupo, turno, encabezado, menciones: [mencion.jid] })
        return
      }
    }

    await sock.sendMessage(grupo, { text: encabezado, mentions: [mencion.jid] })
    return
  }

  // ───────────── Estadisticas ─────────────
  if (sub === 'stats' || sub === 'estadisticas' || sub === 'stat') {
    const puntos = puntosUno(quien)
    const eco = obtenerEconomia(quien)

    await sock.sendMessage(jid, {
      text:
        `🃏 *Estadísticas de UNO*` +
        `\n👤 ${nombreLegible(quien, obtenerUsuario)}` +
        `\n🏅 Puntos acumulados: *${formatearNumero(puntos)}*` +
        `\n💰 Oro: *${formatearNumero(eco.monedas)}*` +
        `\n🪙 Apuesta actual: *${formatearNumero(partida?.apuesta || 0)}*`,
      quoted: msg,
    })
    return
  }

  // ───────────── Historial ─────────────
  if (sub === 'history' || sub === 'historial') {
    const recientes = partidasUnoFinalizadas(10)
    if (!recientes.length) {
      await sock.sendMessage(jid, { text: '📭 Todavía no hay partidas finalizadas.', quoted: msg })
      return
    }

    const lista = recientes
      .map((p, i) => `*${i + 1}.* Grupo ${p.grupo} · ${p.estado} · apuesta ${formatearNumero(p.apuesta)}`)
      .join('\n')

    await sock.sendMessage(jid, {
      text: `🗂️ *Últimas partidas de UNO*\n\n${lista}`,
      quoted: msg,
    })
    return
  }
  // ───────────── Clasificacion ─────────────
  if (sub === 'top' || sub === 'leaderboard' || sub === 'ranking') {
    const top = topUno(10)
    if (!top.length) {
      await sock.sendMessage(jid, { text: '📊 Todavía no hay ranking.', quoted: msg })
      return
    }

    const lista = top
      .map((u, i) => `*${i + 1}.* ${nombreLegible(u.jid, obtenerUsuario)} — ${formatearNumero(u.puntos)} pts`)
      .join('\n')

    await sock.sendMessage(jid, {
      text: `🏆 *Top UNO*\n\n${lista}`,
      quoted: msg,
    })
    return
  }

  // ───────────── Ayuda ─────────────
  await enviarBotones({
    sock,
    jid,
    titulo: 'UNO',
    texto: AYUDA,
    pie: 'Atajos de la partida',
    botones: [
      botonComando('Crear partida', `${prefijo}uno create 0`),
      botonComando('Unirme', `${prefijo}uno join`),
      botonComando('Empezar', `${prefijo}uno start`),
    ],
    quoted: msg,
  })
}
