import {
  resolverFuenteMedia,
  detectarTipoMedia,
  descargarMedia,
  stickerDesdeVideo,
  audioDesdeVideo,
  enviarSticker,
} from '../lib/multimedia.js'

const DURACION_POR_DEFECTO = 6
const DURACION_MAXIMA = 10

/**
 * Sticker animado con su audio, los dos sacados del mismo video.
 *
 * Uso: responde a un video o GIF con /stickeraudio [segundos]
 *
 * WhatsApp todavia no acepta audio dentro del StickerMessage, asi que el
 * comando manda el par como lo manda la app: el sticker animado y, colgada
 * de el como respuesta, la nota de voz recortada al mismo tramo.
 */
export default async ({ sock, jid, msg, args }) => {
  const fuente = resolverFuenteMedia(msg)

  if (!fuente) {
    await sock.sendMessage(jid, {
      text: '❌ Responde a un *video* o *GIF* con el comando `/stickeraudio` para sacarle sticker y audio.',
      quoted: msg,
    })
    return
  }

  const tipo = detectarTipoMedia(fuente.mensaje)

  if (tipo === 'image') {
    await sock.sendMessage(jid, {
      text: '❌ Eso es una *imagen* y no tiene audio. Usa `/sticker` para convertirla.',
      quoted: msg,
    })
    return
  }

  if (tipo !== 'video') {
    await sock.sendMessage(jid, {
      text: '❌ Solo se pueden sacar stickers con audio de *videos* o *GIFs*.',
      quoted: msg,
    })
    return
  }

  // Duración opcional: /stickeraudio 4  (segundos, máximo 10)
  let duracion = DURACION_POR_DEFECTO
  const arg = Number(args?.[0])
  if (Number.isFinite(arg) && arg > 0) {
    duracion = Math.min(Math.max(arg, 1), DURACION_MAXIMA)
  }

  await sock.sendMessage(jid, {
    text: `⏳ Sacando el sticker y el audio del video (${duracion}s)...`,
  })

  try {
    const buffer = await descargarMedia(sock, fuente.mensaje)

    // Sticker y audio salen del mismo buffer: en paralelo para no sumar esperas
    const [stickerRes, audioRes] = await Promise.allSettled([
      stickerDesdeVideo(buffer, { duracion }),
      audioDesdeVideo(buffer, { duracion }),
    ])

    if (stickerRes.status === 'rejected') throw stickerRes.reason

    const sticker = stickerRes.value
    const audio = audioRes.status === 'fulfilled' ? audioRes.value : null

    const stickerEnviado = await enviarSticker(sock, jid, sticker, msg)

    if (!audio) {
      await sock.sendMessage(
        jid,
        {
          text: '🔇 El video no trae pista de audio, asi que solo salio el sticker.',
        },
        stickerEnviado ? { quoted: stickerEnviado } : undefined
      )
      return
    }

    await sock.sendMessage(
      jid,
      {
        audio,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true,
        seconds: duracion,
      },
      stickerEnviado ? { quoted: stickerEnviado } : undefined
    )
  } catch (err) {
    console.error('Error creando el sticker con audio:', err)
    const mensaje =
      String(err?.message || '').includes('FFMPEG')
        ? '❌ No se pudo convertir el video. Prueba con un video mas corto o mas liviano.'
        : '❌ No se pudo crear el sticker con audio. Es posible que el archivo ya no este disponible.'
    await sock.sendMessage(jid, { text: mensaje, quoted: msg })
  }
}
