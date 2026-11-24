import {
  resolverFuenteMedia,
  detectarTipoMedia,
  descargarMedia,
  stickerDesdeVideo,
  audioDesdeVideo,
  enviarSticker,
  enviarStickerConAudio,
} from '../lib/multimedia.js'

const DURACION_POR_DEFECTO = 6
const DURACION_MAXIMA = 10

/**
 * Sticker animado con el audio del propio video adentro (StickerMessage
 * .audioMessage, campo 26): un solo mensaje, sin nota de voz aparte.
 *
 * Uso: responde a un video o GIF con /stickeraudio [segundos]
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

    if (!audio) {
      await enviarSticker(sock, jid, sticker, msg)
      await sock.sendMessage(jid, {
        text: '🔇 El video no trae pista de audio, asi que salio el sticker solo.',
      })
      return
    }

    try {
      await enviarStickerConAudio(sock, jid, sticker, audio.buffer, {
        quoted: msg,
        segundos: audio.segundos,
      })
    } catch (err) {
      // El servidor puede rechazar el campo 26 en cuentas sin la funcion
      // habilitada: mejor el sticker solo que nada.
      console.error('No se pudo adjuntar el audio al sticker:', err)
      await enviarSticker(sock, jid, sticker, msg)
      await sock.sendMessage(jid, {
        text: '⚠️ WhatsApp rechazo el audio dentro del sticker; salio el sticker solo.',
      })
    }
  } catch (err) {
    console.error('Error creando el sticker con audio:', err)
    const mensaje =
      String(err?.message || '').includes('FFMPEG')
        ? '❌ No se pudo convertir el video. Prueba con un video mas corto o mas liviano.'
        : '❌ No se pudo crear el sticker con audio. Es posible que el archivo ya no este disponible.'
    await sock.sendMessage(jid, { text: mensaje, quoted: msg })
  }
}
