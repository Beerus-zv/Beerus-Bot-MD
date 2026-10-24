import {
  resolverFuenteMedia,
  detectarTipoMedia,
  descargarMedia,
} from '../lib/multimedia.js'
import { normalizeMessageContent } from '@whiskeysockets/baileys'

/**
 * Reenvía un mensaje de "ver una vez" (imagen o video) como media normal.
 * Inspirado en el plugin 'viewonce' de MEGA-MD.
 */
export default async ({ sock, jid, msg }) => {
  const fuente = resolverFuenteMedia(msg)

  if (!fuente) {
    await sock.sendMessage(jid, {
      text: '❌ Responde a una *foto o video de "ver una vez"* con `/revelar` para abrirlo.',
      quoted: msg,
    })
    return
  }

  const contenido = normalizeMessageContent(fuente.mensaje)
  const tipo = detectarTipoMedia(contenido)

  if (!esVerUnaVez(contenido) || (tipo !== 'image' && tipo !== 'video')) {
    await sock.sendMessage(jid, {
      text: '❌ Eso no es una *foto o video de "ver una vez"*. Responde a uno de esos mensajes secretos.',
      quoted: msg,
    })
    return
  }

  await sock.sendMessage(jid, { text: '🫧 Abriendo el mensaje de ver una vez...' })

  try {
    const buffer = await descargarMedia(sock, fuente.mensaje)
    const caption = '🔓 *Contenido de ver una vez, revelado.*'

    if (tipo === 'video') {
      await sock.sendMessage(jid, { video: buffer, caption, quoted: msg })
    } else {
      await sock.sendMessage(jid, { image: buffer, caption, quoted: msg })
    }
  } catch (err) {
    console.error('Error revelando el mensaje:', err)
    await sock.sendMessage(jid, {
      text: '❌ No se pudo guardar el contenido. Es posible que ya haya sido eliminado.',
      quoted: msg,
    })
  }
}

/** Detecta los envoltorios de ver una vez (viewOnce / viewOnceV2). */
function esVerUnaVez(contenido) {
  if (!contenido) return false
  for (const clave of Object.keys(contenido)) {
    const info = contenido[clave]
    if (info && (info.viewOnce || info.viewOnce2 || info.viewOnceV2 || info.viewOnceV2Extension)) return true
  }
  return false
}
