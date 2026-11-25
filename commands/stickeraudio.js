import {
  contextoDeCita,
  resolverFuenteMedia,
  detectarTipoMedia,
  descargarMedia,
  duracionDeBuffer,
  chunksWebp,
  stickerDesdeVideoInfo,
  audioDesdeVideo,
  enviarSticker,
  enviarStickerConAudio,
} from '../lib/multimedia.js'
import { audioDeSticker } from '../lib/sticker-video.js'

const DURACION_POR_DEFECTO = 6
const DURACION_MAXIMA = 10

/**
 * Sticker animado con el audio del propio video adentro (StickerMessage
 * .audioMessage, campo 26): un solo mensaje, sin nota de voz aparte.
 *
 * Uso:
 *   responde a un video o GIF con /stickeraudio [segundos]
 *   responde a un sticker con /stickeraudio para re-firmarlo con su audio
 */
export default async ({ sock, jid, msg, args }) => {
  const fuente = resolverFuenteMedia(msg)

  if (!fuente) {
    await sock.sendMessage(jid, {
      text: '❌ Responde a un *video*, *GIF* o *sticker con audio* con el comando `/stickeraudio`.',
      quoted: msg,
    })
    return
  }

  // Sticker: no hay audio que extraer, se vuelve a firmar con los metadatos
  // del bot y se le pega el audio que ya tenia.
  if (fuente.mensaje?.stickerMessage) {
    await rehacerStickerConAudio({ sock, jid, msg, fuente: fuente.mensaje })
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
      text: '❌ Solo se pueden sacar stickers con audio de *videos*, *GIFs* o *stickers*.',
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

    // El sticker manda el ritmo: si el clip se recorta para entrar en los
    // 500 KB de WhatsApp, el audio tiene que cortarse igual o Android rechaza
    // el sonido por no cuadrar con el `seconds` del mensaje.
    const { buffer: sticker, duracion: duracionReal } = await stickerDesdeVideoInfo(buffer, { duracion })

    const audio = await audioDesdeVideo(buffer, { duracion: duracionReal }).catch(() => null)

    if (duracionReal < duracion) {
      await sock.sendMessage(jid, {
        text: `✂️ El video pesaba mucho para los 500 KB del sticker, así que quedó en ${duracionReal}s.`,
      })
    }

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

/**
 * Re-firma un sticker con los metadatos del bot y le vuelve a pegar su audio.
 *
 * `firmarSticker` descarta el EXIF viejo y escribe el nuevo, asi que el
 * paquete sale siempre como Beerus Bot / Beerus_zv. El audio sale del guardado
 * por hash o del campo 26; si no hay, el sticker sale igual, solo re-firmado.
 */
async function rehacerStickerConAudio({ sock, jid, msg, fuente }) {
  const responder = (texto) => sock.sendMessage(jid, { text: texto, quoted: msg })

  try {
    const buffer = await descargarMedia(sock, fuente)

    if (!buffer?.length) {
      await responder('⚠️ *No pude descargar el sticker.* Inténtalo otra vez.')
      return
    }

    const { audio, origen, claves } = await audioDeSticker(sock, fuente, {
      idSticker: contextoDeCita(msg)?.stanzaId ?? msg?.key?.id,
      buffer,
    })

    if (!audio) {
      // Sin audio no hay nada que pegar: el sonido no vive en el WebP
      const detalle = claves.map((c) => c.slice(0, 16)).join(' | ') || 'sin claves'
      const chunks = chunksWebp(buffer)
        .map((c) => `${c.nombre.trim() || '?'}(${c.datos.length})`)
        .join(' ')
      console.log(
        `[stickeraudio] sticker sin audio · campo 26: ${Boolean(fuente.audioMessage)} · busque: ${detalle}`
      )
      console.log(`[stickeraudio] chunks del webp: ${chunks || 'ninguno'}`)

      await enviarSticker(sock, jid, buffer, msg)
      await responder(
        '🔇 Ese sticker no trae el audio adentro, así que salió con la firma nueva y sin sonido.\n_Reenvíalo al chat y repite el comando: el bot guarda el audio cuando lo recibe._'
      )
      return
    }

    const segundos = await duracionDeBuffer(audio, 'ogg')

    try {
      await enviarStickerConAudio(sock, jid, buffer, audio, {
        quoted: msg,
        segundos: segundos ?? undefined,
      })
    } catch (err) {
      console.error('[stickeraudio] no se pudo adjuntar el audio al sticker:', err)
      await enviarSticker(sock, jid, buffer, msg)
      await responder('⚠️ WhatsApp rechazó el audio dentro del sticker; salió con la firma nueva.')
      return
    }

    console.log(`[stickeraudio] sticker re-firmado · audio ${origen} · ${segundos ?? '?'}s`)
  } catch (err) {
    console.error('[stickeraudio] no pude re-firmar el sticker:', err)
    await responder('⚠️ *No pude re-firmar el sticker.* Inténtalo otra vez.')
  }
}
