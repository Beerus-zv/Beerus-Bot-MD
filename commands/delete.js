/**
 * .delete / .del — borra un mensaje del chat.
 *
 * Uso:
 *   Responde al mensaje y escribe `.del`  -> borra el mensaje citado.
 *   `.del` sin responder                  -> intenta borrar el propio comando.
 *
 * Reglas de WhatsApp que condicionan esto:
 *   - El bot solo puede revocar sus propios mensajes.
 *   - Para borrar mensajes de otras personas tiene que ser administrador del
 *     grupo, y ademas quien lo pide tambien tiene que serlo.
 */
import { normalizeMessageContent } from '@whiskeysockets/baileys'
import { esGrupo, esAdmin, obtenerMetadata } from '../lib/grupo.js'

export const AYUDA =
  '🗑️ *Borrar mensaje*\n\n' +
  '*Uso:* responde al mensaje y escribe `/del`\n\n' +
  '• `/del` — borra el mensaje que citas\n' +
  '• `/delete` — lo mismo\n\n' +
  '_En grupos hace falta ser administrador y que el bot tambien lo sea._'

/** Contexto del mensaje citado, sea del tipo que sea (texto, imagen, sticker...) */
function contextoCitado(msg) {
  const contenido = normalizeMessageContent(msg?.message)
  if (!contenido || typeof contenido !== 'object') return null

  for (const valor of Object.values(contenido)) {
    if (valor && typeof valor === 'object' && valor.contextInfo?.stanzaId) {
      return valor.contextInfo
    }
  }
  return null
}

/** Indica si el autor del mensaje citado es el propio bot */
function esDelBot(participante, sock) {
  if (!participante || !sock?.user?.id) return false
  return participante.split('@')[0] === sock.user.id.split('@')[0]
}

/**
 * Revoca una key probando las dos variantes de `fromMe`.
 * WhatsApp rechaza la variante equivocada sin efectos: la key identifica el
 * mensaje, el flag solo dice de que lado se envio la revocacion.
 */
async function revocar(sock, jid, base) {
  for (const fromMe of [base.fromMe, !base.fromMe]) {
    try {
      await sock.sendMessage(jid, { delete: { ...base, fromMe } })
      return true
    } catch {
      // se prueba la otra variante
    }
  }
  return false
}

export default async ({ sock, jid, msg, args, sender }) => {
  const grupo = esGrupo(jid)
  const citado = contextoCitado(msg)

  if (!citado && args?.length) {
    await sock.sendMessage(jid, {
      text: `${AYUDA}\n\n❌ Responde al mensaje que quieres borrar.`,
      quoted: msg,
    })
    return
  }

  const responder = (texto) => sock.sendMessage(jid, { text: texto, quoted: msg })

  // ── Permisos ──
  if (grupo) {
    let metadata = null
    try {
      metadata = await obtenerMetadata(sock, jid)
    } catch {
      // sin metadata no se puede comprobar nada
    }
    if (!metadata) {
      await responder('❌ No pude leer los administradores del grupo. Inténtalo de nuevo.')
      return
    }

    if (!esAdmin(metadata, sender || msg.key.participant)) {
      await responder('⛔ Solo los *administradores* pueden borrar mensajes.')
      return
    }

    const delBot = citado ? esDelBot(citado.participant, sock) : false
    if (!delBot && !esAdmin(metadata, sock.user?.id)) {
      await responder('⚠️ Necesito ser *administrador* para borrar mensajes de otros.')
      return
    }
  } else if (citado && !esDelBot(citado.participant, sock)) {
    // En privado el bot solo puede revocar lo que envió él mismo
    await responder('❌ Solo puedo borrar mis propios mensajes en un chat privado.')
    return
  }

  // ── Objetivo ──
  const objetivo = citado
    ? {
        remoteJid: citado.remoteJid || msg.key.remoteJid,
        id: citado.stanzaId,
        participant: citado.participant || undefined,
        fromMe: esDelBot(citado.participant, sock),
      }
    : { ...msg.key }

  const borrado = await revocar(sock, jid, objetivo)

  if (!borrado) {
    await responder(
      '❌ No pude borrar ese mensaje.\n_Puede que sea muy antiguo o que ya no tenga permiso._'
    )
    return
  }

  // Confirmacion discreta: una reaccion no ensucia el chat
  try {
    await sock.sendMessage(jid, { react: { text: '🗑️', key: msg.key } })
  } catch {
    // la reaccion es opcional
  }

  // Si el bot es admin en el grupo, tambien se limpia el comando
  if (grupo) {
    try {
      await sock.sendMessage(jid, { delete: { ...msg.key, fromMe: false } })
    } catch {
      // sin permiso para borrar el comando: se queda
    }
  }
}
