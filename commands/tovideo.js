/**
 * /tovideo — pasa el sticker respondido a video MP4, siempre.
 *
 *   sticker animado  -> mp4 con su duracion y, si lo trae, su audio
 *   sticker estatico -> mp4 de 3 s con el frame quieto
 *
 * Es el camino de video sin condiciones; /toimg sigue eligiendo entre PNG y
 * MP4 segun el sticker.
 */
import { contextoDeCita, descargarMedia, esWebpAnimado, stickerRespondido } from '../lib/multimedia.js'
import { stickerAMp4 } from '../lib/sticker-video.js'
import { log } from '../lib/logger.js'

/** Tope para que un cuelgue se convierta en un aviso y no en silencio */
const TOPE_MS = 150000

function conTope(promesa, que) {
  return Promise.race([
    promesa,
    new Promise((_, rechazar) =>
      setTimeout(() => rechazar(new Error(`${que} tardo mas de ${TOPE_MS / 1000}s`)), TOPE_MS)
    ),
  ])
}

export default async ({ sock, jid, msg }) => {
  const responder = (texto) => sock.sendMessage(jid, { text: texto, quoted: msg })

  try {
    const fuente = stickerRespondido(msg)

    if (!fuente?.stickerMessage) {
      return responder('❓ Responde a un *sticker* con `/tovideo` para pasarlo a video.')
    }

    await responder('🎬 Pasando el sticker a video...')

    const buffer = await conTope(descargarMedia(sock, fuente), 'la descarga del sticker')

    if (!buffer?.length) {
      return responder('⚠️ *No pude descargar el sticker.* Inténtalo otra vez.')
    }

    const { video, conAudio } = await conTope(
      stickerAMp4(sock, fuente, buffer, {
        // Id del sticker citado: por ahi se busca el audio que mando el bot
        idSticker: contextoDeCita(msg)?.stanzaId ?? msg?.key?.id,
      }),
      'la conversión'
    )
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
    log.error('tovideo · fallo', err)
    await responder(`⚠️ *No pude pasar el sticker a video.*\n_${String(err?.message || err).slice(0, 180)}_`)
  }
}
