/**
 * Sistema de interacciones entre usuarios (kiss, slap, hug y compania).
 *
 * fabricarInteraccion(clave) crea el handler de cada comando. Todos exigen
 * mencionar a otro usuario y responden con frase + GIF de anime
 * (GIF de nekos.best enviado como GIF de WhatsApp con ffmpeg).
 *
 * /interaccion sin clave lista todas las disponibles.
 */
import { esGrupo, obtenerMetadata, resolverObjetivo, tokenMencion } from '../lib/grupo.js'
import { INTERACCIONES, gifDeInteraccion, fraseInteraccion } from '../lib/interacciones.js'
import { marcarUso } from '../database/db.js'
import { recargaActiva } from '../lib/economia.js'

/** Recarga compartida de los GIF (cuesta CPU el ffmpeg) */
const CLAVE_RECARGA = 'interaccion'

/** Fabrica el handler de una interaccion (con nombre de comando distinto si hay colision) */
export function fabricarInteraccion(clave, nombre = clave) {
  const def = INTERACCIONES.find((i) => i.clave === clave)

  return async ({ sock, jid, msg, args, sender }) => {
    if (!def) return
    const quien = sender || msg.key.participant || jid
    const prefijo = '/'

    if (!esGrupo(jid)) {
      await sock.sendMessage(jid, {
        text: '❌ Las interacciones solo funcionan en grupos, para mencionar a alguien.',
        quoted: msg,
      })
      return
    }

    // Recarga anti-spam: el ffmpeg del GIF es lo pesado
    const espera = recargaActiva(quien, CLAVE_RECARGA)
    if (espera) {
      await sock.sendMessage(jid, { text: espera, quoted: msg })
      return
    }

    let metadata = null
    try {
      metadata = await obtenerMetadata(sock, jid)
    } catch {
      metadata = null
    }

    const objetivo = resolverObjetivo(metadata, msg, args)

    if (!objetivo?.jid) {
      await sock.sendMessage(jid, {
        text: `❓ Menciona a alguien: \`${prefijo}${nombre} @usuario\``,
        quoted: msg,
      })
      return
    }

    const objetivoJid = objetivo.jid
    const tokenAutor = tokenMencion(quien)
    const tokenObjetivo = tokenMencion(objetivoJid)

    // Mencionarse a si mismo: modo soledad (sin GIF)
    if (objetivoJid === quien) {
      await sock.sendMessage(jid, {
        text: fraseInteraccion(clave, tokenAutor, '', true),
        mentions: [quien],
        quoted: msg,
      })
      return
    }

    // Frase con la mencion de ambos
    await sock.sendMessage(jid, {
      text: fraseInteraccion(clave, tokenAutor, tokenObjetivo),
      mentions: [quien, objetivoJid],
      quoted: msg,
    })

    // GIF de anime (se envia como GIF de WhatsApp: video + gifPlayback)
    try {
      const gif = await gifDeInteraccion(clave)
      await sock.sendMessage(jid, {
        video: gif,
        mimetype: 'video/mp4',
        gifPlayback: true,
        quoted: msg,
      })
    } catch (err) {
      console.error(`[interaccion] ${clave}:`, err.message)
      await sock.sendMessage(jid, {
        text: '💥 El conversor de GIF no respondió. Intenta de nuevo.',
        quoted: msg,
      })
      return
    }

    // La recarga se gasta solo cuando el GIF salio
    marcarUso(quien, CLAVE_RECARGA)
  }
}

/** Listado de todas las interacciones disponibles */
export default async ({ sock, jid, msg, PREFIX }) => {
  const prefijo = PREFIX?.[0] ?? '/'

  const listado = INTERACCIONES.map((i) => `▸ \`${prefijo}${i.clave}\` — ${i.texto}`).join('\n')

  await sock.sendMessage(jid, {
    text:
      `💞 *Interacciones de Beerus*\n\n` +
      `${listado}\n\n` +
      `_Menciona a otro usuario al usarlas:_\n` +
      `\`${prefijo}kiss @usuario\`\n\n` +
      `🎭 _El bot responde con frase y GIF animado._`,
    quoted: msg,
  })
}
