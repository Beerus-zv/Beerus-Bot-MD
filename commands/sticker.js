import {
  resolverFuenteMedia,
  detectarTipoMedia,
  descargarMedia,
  stickerDesdeImagen,
  stickerDesdeVideo,
  enviarSticker,
} from '../lib/multimedia.js'
import { log } from '../lib/logger.js'

/**
 * Convierte una imagen o un video en un sticker de WhatsApp.
 * - Imagen: sticker estático WebP 512x512 (respuestas a un sticker también sirven)
 * - Video/GIF: sticker animado WebP 512x512 (máximo 15 segundos)
 * Uso: responde a una imagen, un video o un GIF con /sticker [duracion]
 */
export default async ({ sock, jid, msg, args }) => {
  const fuente = resolverFuenteMedia(msg)

  if (!fuente) {
    await sock.sendMessage(jid, {
      text: '❌ Responde a una *imagen*, *video* o *GIF* con el comando `/sticker` para crear el sticker.',
      quoted: msg,
    })
    return
  }

  const tipo = detectarTipoMedia(fuente.mensaje)

  if (tipo !== 'image' && tipo !== 'video') {
    await sock.sendMessage(jid, {
      text: '❌ Solo se pueden crear stickers a partir de *imágenes*, *videos* o *GIFs*.',
      quoted: msg,
    })
    return
  }

  // Duración opcional para videos/GIFs: /sticker 10 (segundos, máximo 15)
  let duracion = 6
  const arg = Number(args?.[0])
  if (Number.isFinite(arg) && arg > 0 && tipo === 'video') {
    duracion = Math.min(Math.max(arg, 1), 15)
  }

  await sock.sendMessage(jid, {
    text:
      tipo === 'video'
        ? `⏳ Convirtiendo el video en sticker animado (${duracion}s)...`
        : '⏳ Convirtiendo la imagen en sticker...',
  })

  try {
    const buffer = await descargarMedia(sock, fuente.mensaje)
    const sticker =
      tipo === 'video' ? await stickerDesdeVideo(buffer, { duracion }) : await stickerDesdeImagen(buffer)

    await enviarSticker(sock, jid, sticker, msg)
  } catch (err) {
    log.error('Error creando el sticker', err)
    await sock.sendMessage(jid, {
      text: '❌ No se pudo crear el sticker. Es posible que el archivo ya no esté disponible.',
      quoted: msg,
    })
  }
}
