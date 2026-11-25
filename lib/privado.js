/**
 * Entrega de mensajes privados para las jugadas de los juegos por grupo.
 *
 * En un grupo el remitente puede llegar como LID; aqui se traduce al numero
 * de telefono para poder abrirle el chat privado del bot. Si no se conoce el
 * numero se intenta con la lista de participantes y, como ultimo recurso, se
 * escribe al propio LID (Baileys tambien sabe entregarle ahi).
 */
import { esGrupo, obtenerMetadata, digitosJid, jidUsuario } from './grupo.js'
import { pnParaLid } from './owner.js'
import { log } from './logger.js'

const cacheParticipantes = new Map()
const TTL_PARTICIPANTES = 5 * 60 * 1000

/** Participantes del grupo con cache corto: evita pedir metadata en cada jugada */
export async function participantesGrupo(sock, grupo) {
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

/**
 * JID al que se le puede escribir por privado.
 * @returns {Promise<string>}
 */
export async function jidPrivado(sock, grupo, jugador) {
  const limpio = jidUsuario(jugador)
  if (!esGrupo(grupo)) return limpio
  if (limpio.endsWith('@s.whatsapp.net')) return limpio
  if (!limpio.includes('@')) return `${limpio}@s.whatsapp.net`

  const digitos = digitosJid(limpio)

  const pn = pnParaLid(digitos)
  if (pn) return `${pn}@s.whatsapp.net`

  const participantes = await participantesGrupo(sock, grupo)
  const participante = participantes.find((p) => digitosJid(p.lid) === digitos)
  if (participante) {
    const telefono = participante.phoneNumber || participante.id
    if (telefono && String(telefono).endsWith('@s.whatsapp.net')) return jidUsuario(telefono)
  }

  return limpio
}

/**
 * Envia un texto por privado al jugador. Nunca lanza: devuelve si se entrego.
 * @returns {Promise<boolean>}
 */
export async function enviarPrivado({ sock, grupo, jugador, texto }) {
  const destino = await jidPrivado(sock, grupo, jugador)
  try {
    await sock.sendMessage(destino, { text: texto })
    return true
  } catch (err) {
    log.aviso(`No se pudo entregar el mensaje privado · ${err?.message || err}`)
    return false
  }
}
