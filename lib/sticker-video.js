/**
 * Paso de sticker a MP4, compartido por /toimg y /tovideo.
 *
 * El sticker animado puede traer audio dentro del propio mensaje
 * (StickerMessage.audioMessage, campo 26 — lo que arma /stickeraudio). Ese
 * audio no vive en el WebP, asi que se descarga aparte y se pega al mp4.
 */
import { descargarMedia, videoDesdeSticker } from './multimedia.js'

/**
 * Convierte el WebP del sticker en MP4, con su audio si lo trae.
 *
 * @param {object} sock socket de Baileys
 * @param {object} fuente contenido del mensaje con `.stickerMessage`
 * @param {Buffer} buffer WebP ya descargado
 * @returns {Promise<{video: Buffer, conAudio: boolean}>}
 */
export async function stickerAMp4(sock, fuente, buffer) {
  // El audio del sticker es un medio aparte dentro del mensaje
  let audio = null
  const audioMessage = fuente?.stickerMessage?.audioMessage
  if (audioMessage) {
    try {
      const bajado = await descargarMedia(sock, { audioMessage })
      if (bajado?.length) audio = bajado
    } catch (err) {
      console.warn('[sticker-video] el sticker trae audio pero no se pudo bajar:', err?.message)
    }
  }

  const video = await videoDesdeSticker(buffer, { audio })
  return { video, conAudio: Boolean(audio) }
}
