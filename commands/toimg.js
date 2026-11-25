/**
 * #toimg (también #toimage) — convierte el sticker respondido a imagen (PNG),
 * o a video MP4 si es animado.
 *
 * Si el sticker animado lleva audio adentro (StickerMessage.audioMessage,
 * campo 26, lo que arma /stickeraudio), el video sale con ese mismo audio.
 * Para forzar video aunque el sticker sea estático, /tovideo.
 */
import { contextoDeCita, descargarMedia, esWebpAnimado, stickerRespondido } from '../lib/multimedia.js'
import { stickerAMp4 } from '../lib/sticker-video.js'

export default async ({ sock, jid, msg }) => {
  const fuente = stickerRespondido(msg)

  if (!fuente?.stickerMessage) {
    await sock.sendMessage(jid, {
      text: '❓ Responde a un *sticker* con `/toimg` para convertirlo a imagen o video.',
      quoted: msg,
    })
    return
  }

  let buffer
  try {
    buffer = await descargarMedia(sock, fuente)
  } catch (err) {
    console.error('[toimg] error descargando el sticker:', err)
  }

  if (!buffer) {
    await sock.sendMessage(jid, {
      text: '⚠️ *No pude descargar el sticker.* Inténtalo otra vez.',
      quoted: msg,
    })
    return
  }

  try {
    if (esWebpAnimado(buffer)) {
      const { video, conAudio } = await stickerAMp4(sock, fuente, buffer, {
        idSticker: contextoDeCita(msg)?.stanzaId ?? msg?.key?.id,
      })
      await sock.sendMessage(jid, {
        video,
        mimetype: 'video/mp4',
        caption: conAudio
          ? '✨ Sticker animado convertido a video (con su audio)'
          : '✨ Sticker animado convertido a video',
        quoted: msg,
      })
    } else {
      // Sticker estático: WebP -> PNG con sharp (sin ffmpeg)
      const sharp = (await import('sharp')).default
      const png = await sharp(buffer).png().toBuffer()
      await sock.sendMessage(jid, {
        image: png,
        caption: '✨ Sticker convertido a imagen',
        quoted: msg,
      })
    }
  } catch (err) {
    console.error('[toimg] fallo la conversión:', err)
    await sock.sendMessage(jid, {
      text: '⚠️ *No pude convertir el sticker.* Si es animado, prueba de nuevo.',
      quoted: msg,
    })
  }
}
