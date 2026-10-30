/**
 * Autoread: marca como leído cada mensaje que llega, para que los chats no se
 * llenen de contadores de no leídos.
 *
 * - Solo mensajes entrantes de chats normales (ni estados ni canales).
 * - Las ráfagas se agrupan: la primera lectura sale al instante y el resto se
 *   remata con una lectura final cuando el chat se calla. Nunca se manda una
 *   lectura por mensaje, que en un grupo movido es tirar stanzas.
 * - Se apaga por chat con `/autoread off` (modos_chat, tabla ya existente).
 */
import { modoChat } from '../database/db.js'

/** Silencio que se considera fin de ráfaga */
const RAFAGA_MS = 800
/** No se manda otra lectura del mismo chat antes de este tiempo */
const MIN_ENTRE_LECTURAS = 250
/** Techo: ningún chat queda sin leer más de esto durante una ráfaga larga */
const ESPERA_MAXIMA = 3000

/** chat -> { ultima, desde, clave, pendiente } */
const estados = new Map()

function estadoDe(chat) {
  let estado = estados.get(chat)
  if (!estado) {
    estado = { ultima: 0, desde: 0, clave: null, pendiente: null }
    estados.set(chat, estado)
  }
  return estado
}

async function leer(sock, chat, clave) {
  const estado = estadoDe(chat)
  estado.ultima = Date.now()
  estado.desde = 0
  estado.clave = null

  try {
    await sock.readMessages([clave])
  } catch (err) {
    console.error('[autoread] no se pudo marcar como leído:', err?.message || err)
  }
}

/**
 * Marca el mensaje como leído. No lanza y no bloquea: se llama en cada mensaje
 * entrante y el trabajo real ocurre en segundo plano.
 * @param {object} sock socket de Baileys
 * @param {object} msg mensaje entrante
 */
export function marcarLeido(sock, msg) {
  const clave = msg?.key
  if (!clave?.id || !clave.remoteJid) return
  if (clave.fromMe) return

  const chat = clave.remoteJid
  if (chat === 'status@broadcast' || chat.endsWith('@newsletter')) return
  if (!modoChat(chat, 'autoread')) return

  const estado = estadoDe(chat)
  const ahora = Date.now()

  estado.clave = clave
  if (!estado.desde) estado.desde = ahora

  // Primera de la ráfaga: se lee ya
  if (!estado.pendiente && ahora - estado.ultima >= MIN_ENTRE_LECTURAS) {
    void leer(sock, chat, clave)
    return
  }

  if (estado.pendiente) return

  // Ya hubo una lectura reciente: se remata cuando el chat se calle
  const espera = Math.min(RAFAGA_MS, Math.max(0, ESPERA_MAXIMA - (ahora - estado.desde)))
  const temporizador = setTimeout(() => {
    estado.pendiente = null
    if (!estado.clave) return
    void leer(sock, chat, estado.clave)
  }, espera)

  if (typeof temporizador.unref === 'function') temporizador.unref()
  estado.pendiente = temporizador
}

/** Cuántos chats tienen una lectura pendiente (para /autoread y pruebas) */
export function lecturasPendientes() {
  let total = 0
  for (const estado of estados.values()) if (estado.pendiente) total++
  return total
}
