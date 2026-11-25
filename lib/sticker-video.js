/**
 * Paso de sticker a MP4, compartido por /toimg y /tovideo.
 *
 * El sticker animado puede traer audio dentro del propio mensaje
 * (StickerMessage.audioMessage, campo 26 — lo que arma /stickeraudio). Ese
 * audio no vive en el WebP, asi que se descarga aparte y se pega al mp4.
 *
 * Dos caminos, en orden:
 *   1. lo que el propio bot mando con ese sticker, guardado por id de mensaje
 *   2. el campo 26 que venga en el sticker (mensaje reenviado o reinicio)
 */
import { audioRecordadoDeSticker, descargarMedia, videoDesdeSticker } from './multimedia.js'

/**
 * Convierte el WebP del sticker en MP4, con su audio si lo trae.
 *
 * @param {object} sock socket de Baileys
 * @param {object} fuente contenido del mensaje con `.stickerMessage`
 * @param {Buffer} buffer WebP ya descargado
 * @param {object} [opciones]
 * @param {string} [opciones.idSticker] id del mensaje citado (contextInfo.stanzaId)
 * @returns {Promise<{video: Buffer, conAudio: boolean}>}
 */
export async function stickerAMp4(sock, fuente, buffer, { idSticker } = {}) {
  const sticker = fuente?.stickerMessage
  let audio = null
  let origen = 'no viene'

  // 1) El audio que tenia el bot al enviar el sticker
  const recordado = audioRecordadoDeSticker(idSticker ?? sticker?.contextInfo?.stanzaId)
  if (recordado?.length) {
    audio = recordado
    origen = 'guardado al enviar'
  }

  // 2) El audio incrustado en el propio sticker
  if (!audio && sticker?.audioMessage) {
    try {
      const bajado = await descargarMedia(sock, { audioMessage: sticker.audioMessage })
      if (bajado?.length) {
        audio = bajado
        origen = 'campo 26'
      }
    } catch (err) {
      console.warn('[sticker-video] el sticker trae audio pero no se pudo bajar:', err?.message)
    }
  }

  console.log(
    audio
      ? `[sticker-video] audio: ${origen} (${(audio.length / 1024).toFixed(0)} KB)`
      : '[sticker-video] el sticker no trae audio'
  )

  const video = await videoDesdeSticker(buffer, { audio })
  return { video, conAudio: Boolean(audio) }
}
