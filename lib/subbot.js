/**
 * Sub-bots: sesiones de WhatsApp que se vinculan desde el chat con `/serbot`.
 *
 * Cada sub-bot es un socket propio con su carpeta de autenticacion
 * (`data/subbots/<numero>/`), su reconexion y su propia sesion de WhatsApp.
 * Comparte el registro de comandos del bot principal, asi que responde a lo
 * mismo que el bot, pero desde el numero que se vinculo.
 *
 * Lo que NO comparte:
 *   - el socket principal (cada uno tiene el suyo)
 *   - los ids de mensajes enviados (cada socket evita responderse a si mismo)
 *   - el limite de mensajes de WhatsApp (cada numero tiene el suyo)
 *
 * El registro vive en `data/subbots/registro.json` para que los sub-bots
 * vuelvan solos al reiniciar. Si WhatsApp cierra la sesion desde el telefono
 * (401), el sub-bot se borra: sus credenciales ya no sirven para nada.
 */
import * as baileys from '@whiskeysockets/baileys'
import fs from 'node:fs'
import path from 'node:path'
import { registrarSocket, quitarSocket } from './sockets.js'
import { normalizarNumero } from './vinculacion.js'

// Import por espacio de nombres: si una version de Baileys no exporta alguno
// de estos nombres, el modulo carga igual y el fallo aparece al abrir el
// socket, no al arrancar el bot.
const makeWASocket = baileys.default
const {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  normalizeMessageContent,
} = baileys

/** Carpeta de los sub-bots. El registro y una carpeta de auth por numero. */
const RAIZ = path.resolve('data', 'subbots')
const REGISTRO = path.join(RAIZ, 'registro.json')

/** Cuantos sub-bots admite el proceso. Cada uno es una sesion real. */
export const MAX_SUBBOTS = Number(process.env.MAX_SUBBOTS) || 10

/** Reconexiones antes de dejar el sub-bot en error (no bucle infinito). */
const MAX_RECONEXIONES = 12
const ESPERA_BASE = 3000
const ESPERA_MAXIMA = 60000

/**
 * Cuanto vale un codigo de vinculacion ya entregado.
 *
 * WhatsApp lo da por ~60 s. Repetir `/code` mientras el usuario lo esta
 * escribiendo pediria otro y el primero quedaria muerto: el telefono diria
 * "codigo no valido" mientras el chat muestra uno que si existia. Dentro de
 * esta ventana se devuelve el mismo codigo.
 */
const VIGENCIA_CODIGO_MS = 45_000

/**
 * Vida util del codigo antes de rotar el socket.
 *
 * WhatsApp da ~60 s. Se corta un poco antes para que el codigo nuevo llegue
 * mientras el anterior todavia sirve, sin ventana muerta.
 */
const VENCIMIENTO_CODIGO_MS = 55_000

/**
 * Datos del proceso que necesitan los sub-bots para ejecutar comandos.
 * Los pone index.js al conectar el bot principal.
 */
let entorno = null

/** numero -> entrada viva */
const ACTIVOS = new Map()

/** Version de WhatsApp, consultada una sola vez para todos los sockets. */
let versionWa = null
let consultandoVersion = null

/**
 * Fija la version de WhatsApp que ya uso el bot principal.
 *
 * El bot principal la resuelve con cache en disco y espera acotada; reusarla
 * aca evita que un sub-bot abra con una version vieja cuando el servidor de
 * versiones no responde. Una version que WhatsApp ya no acepta es la causa
 * clasica de "el codigo se genera pero el telefono no vincula".
 */
export function fijarVersionWhatsApp(version) {
  if (Array.isArray(version) && version.length === 3) versionWa = version
}

/**
 * Engancha el registro de comandos y la base de datos.
 * Sin esto los sub-bots abren la sesion pero no responden a nada.
 */
export function configurarSubBots(datos = {}) {
  entorno = {
    commands: datos.commands || {},
    db: datos.db || null,
    nombre: datos.nombre || 'Beerus Bot MD',
    prefijos: typeof datos.prefijos === 'function' ? datos.prefijos : () => ['.'],
  }
}

// ───────────── Registro en disco ─────────────

function leerRegistro() {
  try {
    const datos = JSON.parse(fs.readFileSync(REGISTRO, 'utf8'))
    return Array.isArray(datos) ? datos : []
  } catch {
    return []
  }
}

function escribirRegistro(lista) {
  try {
    fs.mkdirSync(RAIZ, { recursive: true })
    fs.writeFileSync(REGISTRO, JSON.stringify(lista, null, 2), 'utf8')
  } catch (err) {
    console.warn('[subbot] no se pudo guardar el registro:', err?.message || err)
  }
}

function anotarEnRegistro(numero, dueno) {
  const lista = leerRegistro()
  const indice = lista.findIndex((e) => e.numero === numero)
  const previo = indice >= 0 ? lista[indice] : null
  const entrada = {
    numero,
    dueno: dueno ?? previo?.dueno ?? null,
    creadoEn: previo?.creadoEn ?? Date.now(),
  }
  if (indice >= 0) lista[indice] = entrada
  else lista.push(entrada)
  escribirRegistro(lista)
}

function borrarDelRegistro(numero) {
  escribirRegistro(leerRegistro().filter((e) => e.numero !== numero))
}

// ───────────── Utilidades ─────────────

/** Mismo extractor que index.js: texto plano, caption o nada. */
function extraerTexto(message) {
  const m = normalizeMessageContent(message)
  return (
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.videoMessage?.caption ||
    ''
  )
}

/** Version de WhatsApp con cache: una consulta sirve para todos los sockets. */
async function versionDeWhatsApp() {
  if (versionWa) return versionWa
  if (!consultandoVersion) {
    consultandoVersion = fetchLatestBaileysVersion()
      .then(({ version }) => {
        if (Array.isArray(version) && version.length === 3) versionWa = version
        return versionWa
      })
      .catch(() => null)
      .finally(() => {
        consultandoVersion = null
      })
  }
  await consultandoVersion
  return versionWa ?? undefined
}

/**
 * Cortes que son parte del ciclo normal de un socket sin registrar y que no
 * valen un aviso en el chat: red, tiempo agotado, cierre del transporte.
 */
function esCorteNormal(motivo) {
  return /connection (terminated|closed|was lost)|qr refs attempts ended|timed out|websocket/i.test(
    String(motivo || '')
  )
}

/**
 * Pide un codigo de vinculacion. WhatsApp rechaza la peticion si el socket
 * todavia no termino de abrir, asi que se reintenta con espera creciente en
 * vez de dejar al usuario sin codigo por una carrera de un segundo.
 */
async function pedirCodigo(sock, numero) {
  let ultimo
  for (let intento = 1; intento <= 3; intento += 1) {
    try {
      return await sock.requestPairingCode(numero)
    } catch (err) {
      ultimo = err
      await new Promise((seguir) => setTimeout(seguir, 1200 * intento))
    }
  }
  throw ultimo
}

// ───────────── Ejecucion de comandos ─────────────

export async function procesarMensajeDeSubBot(entrada, msg) {
  return procesarMensaje(entrada, msg)
}

/**
 * Un mensaje del sub-bot: busca prefijo, resuelve el comando y lo ejecuta.
 *
 * Es a proposito mas corto que el manejador del bot principal: el sub-bot
 * ejecuta comandos, no lleva los modos de grupo (antilink, antidelete,
 * bienvenidas, contadores). Los comandos que consultan la base de datos
 * siguen funcionando porque `db` es la misma del proceso.
 */
async function procesarMensaje(entrada, msg) {
  if (!entorno || !entrada?.sock) return
  if (!msg?.message) return

  const jid = msg.key?.remoteJid
  if (!jid || jid === 'status@broadcast') return
  if (msg.key.fromMe) return

  const texto = extraerTexto(msg.message).trim()
  if (!texto) return

  const prefijos = entorno.prefijos() || ['.']
  const prefijo = prefijos.find((p) => texto.startsWith(p))
  if (!prefijo) return

  const [nombre, ...args] = texto.slice(prefijo.length).trim().split(/\s+/)
  if (!nombre) return

  const clave = nombre.toLowerCase()
  const comando = entorno.commands[clave]
  if (typeof comando !== 'function') return

  const sender = msg.key.participant || jid

  try {
    await comando({
      sock: entrada.sock,
      jid,
      msg,
      args,
      sender,
      esGrupo: jid.endsWith('@g.us'),
      commands: entorno.commands,
      BOT_NAME: entorno.nombre,
      PREFIX: prefijos,
      db: entorno.db,
      subbot: { numero: entrada.numero, dueno: entrada.dueno },
    })
  } catch (err) {
    console.warn(`[subbot] ${entrada.numero}: ${clave} fallo: ${err?.message || err}`)
  }
}

// ───────────── Apertura y reconexion ─────────────

/**
 * Abre el socket de un sub-bot y le cuelga los eventos.
 *
 * Si la sesion no esta registrada, pide el codigo de vinculacion en el primer
 * evento `qr` (antes de eso Baileys todavia no acepta la peticion) y lo
 * entrega por `avisos.alCodigo`.
 */
async function abrirSocket(entrada) {
  const carpeta = path.join(RAIZ, entrada.numero)
  fs.mkdirSync(carpeta, { recursive: true })

  // Una base SQLite por sub-bot (misma que usa el bot principal). Al
  // reconectar hay que cerrar la anterior o quedan handles sueltos.
  if (entrada.auth?.cerrar) {
    try {
      entrada.auth.cerrar()
    } catch {
      // ya estaba cerrada
    }
  }

  const { useSqliteAuthState } = await import('./auth-state.js')
  const auth = await useSqliteAuthState(carpeta)
  entrada.auth = auth

  const { state, saveCreds } = auth

  // `requestPairingCode` escribe `creds.me` y `pairingCode` en el disco antes
  // de que la vinculacion termine. Si el socket se reconecta con eso a medias,
  // Baileys intenta un login pasivo con credenciales que no existen todavia y
  // WhatsApp contesta "Connection Failure" (401): la vinculacion muere aunque
  // el codigo fuera bueno. Antes de abrir se limpia lo que dejo el intento
  // anterior, asi el socket siempre arranca un registro nuevo.
  //
  // La marca de sesion real es `creds.account`, no `creds.registered`: en
  // Baileys 7 `registered` arranca en false y ninguna parte del paquete lo
  // pone en true, asi que mirarlo dejaria cada reconexion como un intento
  // nuevo aunque la sesion ya estuviera vinculada.
  if (!state.creds.account && (state.creds.me || state.creds.pairingCode)) {
    delete state.creds.me
    delete state.creds.pairingCode
    try {
      await saveCreds()
    } catch (err) {
      console.warn(`[subbot] ${entrada.numero}: no pude limpiar el emparejamiento previo:`, err?.message)
    }
  }

  const version = await versionDeWhatsApp()

  console.log(
    `[subbot] ${entrada.numero}: abriendo socket (WhatsApp ${version ? version.join('.') : 'por defecto de Baileys'})`
  )

  const sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys),
    },
    // Nombre visible en "Dispositivos vinculados" del telefono
    browser: [entorno?.nombre || 'Beerus Bot MD', 'Firefox', '2.1.0'],
  })

  entrada.sock = sock
  entrada.estado = 'conectando'

  let codigoPedido = false

  /**
   * Entrega un codigo al chat, tal cual, sin guion.
   *
   * El guion lo pone WhatsApp en su campo de entrada. Si el mensaje trae
   * `4KDL-VBY8` y se pega en un campo de 8 caracteres, entra cortado y el
   * telefono responde "no se pudo vincular".
   */
  const entregarCodigo = (codigo, { renovado = false } = {}) => {
    entrada.codigo = codigo
    entrada.codigoEn = Date.now()
    entrada.estado = 'pendiente'
    entrada.error = null
    entrada.avisos?.alCodigo?.(codigo, entrada.numero, { renovado })
  }

  /**
   * El codigo de WhatsApp vive ~60 s y esta atado al socket que lo pidio.
   *
   * Pedir otro sobre el mismo socket deja el primero muerto sin que el chat lo
   * sepa. Asi que al vencer no se renueva: se cierra el socket, y la
   * reconexion abre uno nuevo, pide un codigo nuevo y lo entrega. En el chat
   * hay un solo codigo vivo a la vez, y el socket que lo respalda es el mismo.
   */
  const programarVencimiento = () => {
    if (entrada.refresco) clearTimeout(entrada.refresco)
    entrada.refresco = setTimeout(() => {
      entrada.refresco = null
      if (entrada.reemplazado || sock.authState.creds.account) return
      console.log(`[subbot] ${entrada.numero}: el codigo vencio, se abre un socket nuevo`)
      entrada.codigo = null
      try {
        sock.end(new Error('codigo vencido'))
      } catch {
        // el socket ya estaba cerrado
      }
    }, VENCIMIENTO_CODIGO_MS)
  }

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (entrada.reemplazado) return

    // Una linea por evento: sin esto, cuando la vinculacion falla solo queda
    // el 401 final y no se sabe en que paso se rompio.
    if (connection || lastDisconnect || qr) {
      const codigoCorte = lastDisconnect?.error?.output?.statusCode
      console.log(
        `[subbot] ${entrada.numero}: connection=${connection ?? '-'}` +
          `${qr ? ' qr' : ''}` +
          `${codigoCorte ? ` status=${codigoCorte}` : ''}` +
          `${lastDisconnect?.error?.message ? ` (${lastDisconnect.error.message})` : ''}`
      )
    }

    if (qr && !sock.authState.creds.account && !codigoPedido) {
      codigoPedido = true
      try {
        const codigo = await pedirCodigo(sock, entrada.numero)
        entregarCodigo(codigo)
        programarVencimiento()
      } catch (err) {
        codigoPedido = false
        entrada.error = err?.message || String(err)
        console.warn(`[subbot] ${entrada.numero}: no se pudo pedir el codigo:`, entrada.error)
        entrada.avisos?.alError?.(entrada.error, entrada.numero)
      }
    }

    if (connection === 'open') {
      if (entrada.refresco) {
        clearTimeout(entrada.refresco)
        entrada.refresco = null
      }
      entrada.estado = 'conectado'
      entrada.intentos = 0
      entrada.codigo = null
      entrada.error = null
      registrarSocket(sock, { rol: 'sub' })
      anotarEnRegistro(entrada.numero, entrada.dueno)
      saveCreds()
      console.log(`[subbot] ${entrada.numero} conectado`)
    }

    if (connection === 'close') {
      const codigo = lastDisconnect?.error?.output?.statusCode
      const motivo = lastDisconnect?.error?.message
      quitarSocket(sock)
      entrada.estado = 'cerrado'

      // El socket que sostiene el codigo se fue: ese codigo ya no sirve.
      if (entrada.refresco) {
        clearTimeout(entrada.refresco)
        entrada.refresco = null
      }
      entrada.codigo = null

      // 401 con la sesion ya registrada: se cerro desde el telefono y las
      // credenciales no sirven, se borra. Sin registrar es un intento de
      // vinculacion que fallo: se reconecta, y `abrirSocket` limpia lo que
      // dejo el intento antes de volver a pedir codigo.
      if (codigo === DisconnectReason.loggedOut && sock.authState.creds.account) {
        console.log(`[subbot] ${entrada.numero} cerro sesion desde el telefono, se elimina`)
        await eliminarSubBot(entrada.numero)
        return
      }

      // Un socket que ya fue reemplazado no puede reconectar: dejaria dos
      // sesiones del mismo numero peleando por la misma carpeta.
      if (entrada.reemplazado) return

      if (entrada.temporizador) return

      // Rotacion por codigo vencido: no es un fallo, es el ciclo normal. No
      // gasta intentos ni espera, o la ventana de vinculacion se acorta sola.
      const vencido = motivo === 'codigo vencido'

      // Cualquier otro corte sin registrar es el lado del socket fallando
      // (firma de cuenta, handshake, rechazo del servidor). Se avisa en el
      // chat: sin esto el usuario solo ve "no se pudo vincular" en el telefono.
      if (!vencido && !sock.authState.creds.account && motivo && !esCorteNormal(motivo)) {
        entrada.error = motivo
        entrada.avisos?.alError?.(motivo, entrada.numero)
      }

      if (!vencido) {
        entrada.intentos = (entrada.intentos || 0) + 1
        if (entrada.intentos > MAX_RECONEXIONES) {
          entrada.estado = 'error'
          entrada.error = `sin conexion tras ${MAX_RECONEXIONES} intentos (codigo ${codigo})`
          console.warn(`[subbot] ${entrada.numero}: ${entrada.error}`)
          return
        }
      }

      const espera = vencido ? 1000 : Math.min(ESPERA_BASE * entrada.intentos, ESPERA_MAXIMA)
      entrada.temporizador = setTimeout(() => {
        entrada.temporizador = null
        if (entrada.reemplazado) return
        abrirSocket(entrada).catch((err) => {
          entrada.estado = 'error'
          entrada.error = err?.message || String(err)
          console.warn(`[subbot] ${entrada.numero}: fallo al reconectar:`, entrada.error)
        })
      }, espera)
    }
  })

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages || []) {
      procesarMensaje(entrada, msg).catch((err) => {
        console.warn(`[subbot] ${entrada.numero}: mensaje fallido:`, err?.message || err)
      })
    }
  })

  return entrada
}

// ───────────── API publica ─────────────

/**
 * Vincula un numero como sub-bot.
 *
 * Devuelve en cuanto el socket queda abierto; el codigo llega despues por
 * `alCodigo` (el primer evento `qr` tarda un segundo o dos).
 *
 * @param {string} numero  digitos con codigo de pais
 * @param {object} [opciones]
 * @param {string} [opciones.dueno]  JID de quien lo pidio
 * @param {(codigo: string, numero: string) => void} [opciones.alCodigo]
 * @param {(error: string, numero: string) => void} [opciones.alError]
 * @returns {Promise<{ok: boolean, numero?: string, estado?: string, codigo?: string|null, motivo?: string, error?: string, limite?: number}>}
 */
export async function crearSubBot(numero, { dueno, alCodigo, alError } = {}) {
  const limpio = normalizarNumero(numero)
  if (!limpio) return { ok: false, motivo: 'numero' }

  const vivo = ACTIVOS.get(limpio)
  if (vivo) {
    // Ya conectado: no hay nada que vincular.
    if (vivo.estado === 'conectado') {
      return {
        ok: true,
        numero: limpio,
        estado: vivo.estado,
        codigo: null,
        jid: vivo.sock?.user?.id,
      }
    }

    // Un segundo `/code` sobre el mismo numero. Si el codigo entregado sigue
    // vivo se devuelve ese: pedir otro invalidaria el que el usuario ya esta
    // escribiendo y el telefono diria "codigo no valido" con un codigo que
    // minutos antes si existia.
    if (
      vivo.estado === 'pendiente' &&
      vivo.codigo &&
      Date.now() - (vivo.codigoEn || 0) < VIGENCIA_CODIGO_MS
    ) {
      if (alCodigo || alError) vivo.avisos = { alCodigo, alError }
      return { ok: true, numero: limpio, estado: vivo.estado, codigo: vivo.codigo }
    }

    // Socket todavia abriendo o esperando reconexion: el proximo evento `qr`
    // trae el codigo y lo entrega por el aviso guardado. Reemplazar el socket
    // aqui mataria el codigo que esta a punto de salir.
    if (vivo.estado === 'creando' || vivo.estado === 'conectando' || vivo.temporizador) {
      if (alCodigo || alError) vivo.avisos = { alCodigo, alError }
      return { ok: true, numero: limpio, estado: vivo.estado, codigo: null }
    }

    // Pendiente con el codigo vencido y el socket abierto: se pide uno nuevo.
    if (vivo.sock && vivo.estado !== 'error') {
      if (alCodigo || alError) vivo.avisos = { alCodigo, alError }
      try {
        const codigo = await pedirCodigo(vivo.sock, limpio)
        vivo.codigo = codigo
        vivo.codigoEn = Date.now()
        vivo.estado = 'pendiente'
        vivo.error = null
        return { ok: true, numero: limpio, estado: 'pendiente', codigo }
      } catch (err) {
        vivo.error = err?.message || String(err)
        console.warn(`[subbot] ${limpio}: no pude renovar el codigo:`, vivo.error)
      }
    }

    // Socket muerto o en error: se descarta y se abre uno nuevo. Sin esto el
    // numero quedaba atascado y /code no hacia nada hasta borrarlo.
    vivo.reemplazado = true
    if (vivo.temporizador) {
      clearTimeout(vivo.temporizador)
      vivo.temporizador = null
    }
    if (vivo.refresco) {
      clearTimeout(vivo.refresco)
      vivo.refresco = null
    }
    try {
      vivo.sock?.end(undefined)
    } catch {
      // ya estaba cerrado
    }
    quitarSocket(vivo.sock)
    try {
      vivo.auth?.cerrar?.()
    } catch {
      // la base ya estaba cerrada
    }
    ACTIVOS.delete(limpio)
  }

  const registro = leerRegistro()
  const yaAnotado = registro.some((e) => e.numero === limpio)
  if (!yaAnotado && registro.length >= MAX_SUBBOTS) {
    return { ok: false, motivo: 'limite', limite: MAX_SUBBOTS }
  }

  const entrada = {
    numero: limpio,
    dueno: dueno ?? null,
    creadoEn: Date.now(),
    estado: 'creando',
    codigo: null,
    codigoEn: 0,
    error: null,
    intentos: 0,
    temporizador: null,
    refresco: null,
    sock: null,
    auth: null,
    // Se guardan en la entrada: un segundo `/code` sobre el mismo numero tiene
    // que entregar el codigo por el mismo camino que el primero.
    avisos: { alCodigo, alError },
  }
  ACTIVOS.set(limpio, entrada)

  try {
    await abrirSocket(entrada)
  } catch (err) {
    ACTIVOS.delete(limpio)
    return { ok: false, motivo: 'error', error: err?.message || String(err) }
  }

  return {
    ok: true,
    numero: limpio,
    estado: entrada.estado,
    codigo: entrada.codigo,
  }
}

/**
 * Cierra un sub-bot y borra sus credenciales del disco.
 * Sin credenciales no hay sesion que pueda volver a abrirse sola.
 */
export async function eliminarSubBot(numero) {
  const limpio = normalizarNumero(numero)
  if (!limpio) return false

  const entrada = ACTIVOS.get(limpio)
  if (entrada) {
    if (entrada.temporizador) {
      clearTimeout(entrada.temporizador)
      entrada.temporizador = null
    }
    if (entrada.refresco) {
      clearTimeout(entrada.refresco)
      entrada.refresco = null
    }
    try {
      entrada.sock?.end(undefined)
    } catch {
      // el socket ya estaba cerrado
    }
    quitarSocket(entrada.sock)
    // En Windows un handle abierto impide borrar la carpeta.
    try {
      entrada.auth?.cerrar?.()
    } catch {
      // la base ya estaba cerrada
    }
    ACTIVOS.delete(limpio)
  }

  borrarDelRegistro(limpio)

  try {
    fs.rmSync(path.join(RAIZ, limpio), { recursive: true, force: true })
  } catch (err) {
    console.warn(`[subbot] no se pudo borrar la carpeta de ${limpio}:`, err?.message || err)
  }

  console.log(`[subbot] ${limpio} eliminado`)
  return true
}

/** Lista los sub-bots guardados con su estado en vivo. */
export function listarSubBots() {
  return leerRegistro().map((e) => {
    const vivo = ACTIVOS.get(e.numero)
    return {
      numero: e.numero,
      dueno: e.dueno,
      creadoEn: e.creadoEn,
      estado: vivo?.estado || 'apagado',
      codigo: vivo?.codigo || null,
      jid: vivo?.sock?.user?.id || null,
      error: vivo?.error || null,
    }
  })
}

/** Estado de un sub-bot concreto, o null si no existe. */
export function estadoSubBot(numero) {
  const limpio = normalizarNumero(numero)
  if (!limpio) return null
  return listarSubBots().find((e) => e.numero === limpio) || null
}

/**
 * Vuelve a abrir los sub-bots guardados. Se llama al conectar el bot
 * principal: los que ya estan vivos se saltan, asi una reconexion del bot no
 * duplica sockets.
 */
export async function restaurarSubBots() {
  if (!entorno) return 0

  let abiertos = 0
  for (const e of leerRegistro()) {
    if (ACTIVOS.has(e.numero)) continue
    try {
      const resultado = await crearSubBot(e.numero, { dueno: e.dueno })
      if (resultado.ok) abiertos += 1
    } catch (err) {
      console.warn(`[subbot] no se pudo restaurar ${e.numero}:`, err?.message || err)
    }
  }

  if (abiertos) console.log(`[subbot] ${abiertos} sub-bot(s) restaurados`)
  return abiertos
}
