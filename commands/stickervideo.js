import {
  resolverFuenteMedia,
  detectarTipoMedia,
  descargarMedia,
  stickerDesdeVideo,
  enviarSticker,
  DURACION_MAXIMA_STICKER,
} from '../lib/multimedia.js'
import { log } from '../lib/logger.js'

/**
 * Convierte un video corto en un sticker animado de WhatsApp (WebP 512x512).
 * Uso: responde a un video con /stickervideo [segundos]
 */
export default async ({ sock, jid, msg, args }) => {
  const fuente = resolverFuenteMedia(msg)

  if (!fuente) {
    await sock.sendMessage(jid, {
      text: '❌ Responde a un *video* o *GIF* con el comando `/stickervideo` para crear un sticker animado.',
      quoted: msg,
    })
    return
  }

  const tipo = detectarTipoMedia(fuente.mensaje)

  if (tipo === 'image') {
    await sock.sendMessage(jid, {
      text: '❌ Eso es una *imagen*. Usa `/sticker` para convertirla en sticker.',
      quoted: msg,
    })
    return
  }

  if (tipo !== 'video') {
    await sock.sendMessage(jid, {
      text: '❌ Solo se pueden crear stickers animados a partir de *videos* o *GIFs*.',
      quoted: msg,
    })
    return
  }

  // Sin argumento el sticker dura lo que dure el video. Con argumento se
  // respeta lo pedido, siempre que el clip alcance.
  let duracion = null
  const arg = Number(args?.[0])
  if (Number.isFinite(arg) && arg > 0) {
    duracion = Math.min(Math.max(arg, 1), DURACION_MAXIMA_STICKER)
  }

  await sock.sendMessage(jid, {
    text: `⏳ Convirtiendo el video en sticker animado${duracion ? ` (${duracion}s)` : ''}...`,
  })

  try {
    const buffer = await descargarMedia(sock, fuente.mensaje)
    const sticker = await stickerDesdeVideo(buffer, { duracion })

    await enviarSticker(sock, jid, sticker, msg)
  } catch (err) {
    log.error('Error creando el sticker de video', err)
    const mensaje =
      String(err?.message || '').includes('FFMPEG')
        ? '❌ No se pudo convertir el video. Intenta con un video más corto.'
        : '❌ No se pudo crear el sticker. Es posible que el archivo ya no esté disponible.'
    await sock.sendMessage(jid, { text: mensaje, quoted: msg })
  }
}
