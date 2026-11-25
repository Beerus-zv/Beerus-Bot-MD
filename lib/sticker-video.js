/**
 * Paso de sticker a MP4 y lectura del audio de un sticker.
 *
 * El sticker animado puede traer audio dentro del propio mensaje
 * (StickerMessage.audioMessage, campo 26 — lo que arma /stickeraudio). Ese
 * audio no vive en el WebP, asi que se busca aparte.
 *
 * Tres caminos, en orden:
 *   1. lo que el propio bot mando con ese sticker: guardado en disco por hash
 *      del archivo y por id del mensaje, asi sobrevive reinicios y reenvios
 *   2. el campo 26 que venga en el sticker (mensaje reenviado o reinicio)
 *   3. nada
 */
import {
  audioDeWebp,
  audioRecordadoDeSticker,
  clavesAudioDeSticker,
  descargarMedia,
  videoDesdeSticker,
} from './multimedia.js'
import { log } from './logger.js'

/**
 * Busca el audio de un sticker por todas las claves conocidas.
 *
 * @param {object} sock socket de Baileys
 * @param {object} fuente contenido del mensaje con `.stickerMessage`
 * @param {object} [opciones]
 * @param {string} [opciones.idSticker] id del mensaje citado (contextInfo.stanzaId)
 * @param {Buffer} [opciones.buffer] WebP ya descargado, por si el audio va adentro
 * @returns {Promise<{audio: Buffer|null, origen: string|null, claves: string[]}>}
 */
export async function audioDeSticker(sock, fuente, { idSticker, buffer } = {}) {
  const sticker = fuente?.stickerMessage
  const claves = clavesAudioDeSticker(sticker, idSticker ?? sticker?.contextInfo?.stanzaId)

  // 1) El audio que tenia el bot al enviar el sticker
  for (const clave of claves) {
    const guardado = await audioRecordadoDeSticker(clave)
    if (guardado?.length) {
      return { audio: guardado, origen: `guardado (${clave.startsWith('sha:') ? 'hash' : 'id'})`, claves }
    }
  }

  // 2) El audio que viaja hermano en el mismo mensaje (sticker con sonido)
  const hermano = fuente?.audioMessage
  if (hermano) {
    try {
      const bajado = await descargarMedia(sock, { audioMessage: hermano })
      if (bajado?.length) return { audio: bajado, origen: 'audio del mensaje', claves }
    } catch (err) {
      log.aviso(`sticker-video · el sticker trae audio hermano y no se pudo bajar · ${err?.message}`)
    }
  }

  // 3) El audio anidado dentro del sticker
  if (sticker?.audioMessage) {
    try {
      const bajado = await descargarMedia(sock, { audioMessage: sticker.audioMessage })
      if (bajado?.length) return { audio: bajado, origen: 'campo 26', claves }
    } catch (err) {
      log.aviso(`sticker-video · el sticker trae audio pero no se pudo bajar · ${err?.message}`)
    }
  }

  // 4) El audio metido dentro del WebP (stickers con sonido)
  if (buffer) {
    const enArchivo = await audioDeWebp(buffer)
    if (enArchivo) return { audio: enArchivo.audio, origen: enArchivo.origen, claves }
  }

  return { audio: null, origen: null, claves }
}

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
  const { audio, origen, claves } = await audioDeSticker(sock, fuente, { idSticker, buffer })

  if (audio) {
    log.sistema(`sticker-video · audio: ${origen} (${(audio.length / 1024).toFixed(0)} KB)`)
  } else {
    const detalle = claves.length ? claves.map((c) => c.slice(0, 16)).join(' | ') : 'sin claves'
    log.sistema(`sticker-video · el sticker no trae audio · busque: ${detalle}`)
  }

  const video = await videoDesdeSticker(buffer, { audio })
  return { video, conAudio: Boolean(audio) }
}
