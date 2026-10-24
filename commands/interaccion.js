/**
 * Sistema de interacciones entre usuarios (kiss, slap, hug y compania).
 *
 * fabricarInteraccion(clave) crea el handler de cada comando. Todos exigen
 * mencionar a otro usuario y responden con frase + sticker animado de anime
 * (GIF de nekos.best convertido a WebP con ffmpeg).
 *
 * /interaccion sin clave lista todas las disponibles.
 */
import { esGrupo, obtenerMetadata, resolverObjetivo, tokenMencion } from '../lib/grupo.js'
import { INTERACCIONES, stickerDeInteraccion, fraseInteraccion } from '../lib/interacciones.js'
import { enviarSticker } from '../lib/multimedia.js'
import { ultimoUso, marcarUso } from '../database/db.js'
import { recargaActiva } from '../lib/economia.js'

/** Recarga compartida de los stickers animados (cuesta CPU el ffmpeg) */
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

    // Recarga anti-spam: el ffmpeg del sticker es lo pesado
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

    // Mencionarse a si mismo: modo soledad (sin sticker)
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

    // Sticker animado del GIF de anime
    try {
      const sticker = await stickerDeInteraccion(clave)
      await enviarSticker(sock, jid, sticker, msg)
    } catch (err) {
      console.error(`[interaccion] ${clave}:`, err.message)
      await sock.sendMessage(jid, {
        text: '💥 El taller de anime no entrego ese GIF. Intenta de nuevo.',
        quoted: msg,
      })
      return
    }

    // La recarga se gasta solo cuando el sticker salio
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
      `🎭 _El bot responde con frase y sticker animado._`,
    quoted: msg,
  })
}
