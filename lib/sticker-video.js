/**
 * Paso de sticker a MP4, compartido por /toimg y /tovideo.
 *
 * El sticker animado puede traer audio dentro del propio mensaje
 * (StickerMessage.audioMessage, campo 26 — lo que arma /stickeraudio). Ese
 * audio no vive en el WebP, asi que se descarga aparte y se pega al mp4.
 *
 * Tres caminos, en orden:
 *   1. lo que el propio bot mando con ese sticker: guardado en disco por hash
 *      del archivo y por id del mensaje, asi sobrevive reinicios y reenvios
 *   2. el campo 26 que venga en el sticker (mensaje reenviado o reinicio)
 *   3. nada: el mp4 sale sin audio
 */
import {
  audioRecordadoDeSticker,
  clavesAudioDeSticker,
  descargarMedia,
  videoDesdeSticker,
} from './multimedia.js'

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
  const claves = clavesAudioDeSticker(sticker, idSticker ?? sticker?.contextInfo?.stanzaId)

  let audio = null
  let origen = null

  // 1) El audio que tenia el bot al enviar el sticker
  for (const clave of claves) {
    const guardado = await audioRecordadoDeSticker(clave)
    if (guardado?.length) {
      audio = guardado
      origen = `guardado (${clave.startsWith('sha:') ? 'hash' : 'id'})`
      break
    }
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

  if (audio) {
    console.log(`[sticker-video] audio: ${origen} (${(audio.length / 1024).toFixed(0)} KB)`)
  } else {
    const detalle = claves.length ? claves.map((c) => c.slice(0, 16)).join(' | ') : 'sin claves'
    console.log(`[sticker-video] el sticker no trae audio · busque: ${detalle}`)
  }

  const video = await videoDesdeSticker(buffer, { audio })
  return { video, conAudio: Boolean(audio) }
}
