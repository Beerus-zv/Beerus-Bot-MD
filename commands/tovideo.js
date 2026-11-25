/**
 * /tovideo — pasa el sticker respondido a video MP4, siempre.
 *
 *   sticker animado  -> mp4 con su duracion y, si lo trae, su audio
 *   sticker estatico -> mp4 de 3 s con el frame quieto
 *
 * Es el camino de video sin condiciones; /toimg sigue eligiendo entre PNG y
 * MP4 segun el sticker.
 */
import { descargarMedia, esWebpAnimado, stickerRespondido } from '../lib/multimedia.js'
import { stickerAMp4 } from '../lib/sticker-video.js'

export default async ({ sock, jid, msg }) => {
  const fuente = stickerRespondido(msg)

  if (!fuente?.stickerMessage) {
    await sock.sendMessage(jid, {
      text: '❓ Responde a un *sticker* con `/tovideo` para pasarlo a video.',
      quoted: msg,
    })
    return
  }

  let buffer
  try {
    buffer = await descargarMedia(sock, fuente)
  } catch (err) {
    console.error('[tovideo] error descargando el sticker:', err)
  }

  if (!buffer) {
    await sock.sendMessage(jid, {
      text: '⚠️ *No pude descargar el sticker.* Inténtalo otra vez.',
      quoted: msg,
    })
    return
  }

  try {
    const { video, conAudio } = await stickerAMp4(sock, fuente, buffer)
    const animado = esWebpAnimado(buffer)

    await sock.sendMessage(jid, {
      video,
      mimetype: 'video/mp4',
      caption: animado
        ? conAudio
          ? '🎬 Sticker animado pasado a video (con su audio)'
          : '🎬 Sticker animado pasado a video'
        : '🎬 Sticker pasado a video',
      quoted: msg,
    })
  } catch (err) {
    console.error('[tovideo] fallo la conversión:', err)
    await sock.sendMessage(jid, {
      text: '⚠️ *No pude pasar el sticker a video.* Inténtalo otra vez.',
      quoted: msg,
    })
  }
}
