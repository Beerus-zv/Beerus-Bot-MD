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
import { log } from '../lib/logger.js'

const DURACION_POR_DEFECTO = 6
const DURACION_MAXIMA = 10

// Una descarga colgada no puede dejar al usuario esperando para siempre: si
// WhatsApp no entrega el archivo en este plazo, el comando responde con error.
const LIMITE_DESCARGA_MS = 90_000

/**
 * Corta una promesa que no responde. Sin esto, una descarga que se queda
 * colgada se ve igual que un comando que no existe: silencio.
 */
function conLimite(promesa, ms, etiqueta) {
  let temporizador
  const corte = new Promise((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error(`TIMEOUT_${etiqueta}`)), ms)
  })
  return Promise.race([promesa, corte]).finally(() => clearTimeout(temporizador))
}

/**
 * Sticker animado con su audio adentro, en un solo mensaje.
 *
 * El sonido va en `StickerMessage.audioMessage` (campo 26, el `oneof audio`
 * del proto de WhatsApp), no como nota aparte.
 *
 * Uso:
 *   responde a un video o GIF con /stickeraudio [segundos]
 *   responde a un sticker con /stickeraudio para re-firmarlo con su audio
 */
export default async (ctx) => {
  const { sock, jid, msg } = ctx

  try {
    await manejar(ctx)
  } catch (err) {
    // Cualquier falla que se escape termina en un mensaje del chat, nunca en
    // silencio: el usuario tiene que saber que el comando corrio.
    log.error('stickeraudio · fallo el comando', err)
    await sock
      .sendMessage(jid, {
        text: `❌ *No pude completar el sticker con audio.*\n_${err?.message || 'error desconocido'}_`,
        quoted: msg,
      })
      .catch(() => {})
  }
}

async function manejar({ sock, jid, msg, args }) {
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

  const buffer = await conLimite(
    descargarMedia(sock, fuente.mensaje),
    LIMITE_DESCARGA_MS,
    'descarga'
  )

  if (!buffer?.length) {
    await sock.sendMessage(jid, {
      text: '❌ *El video llegó vacío.* Vuelve a enviarlo y repite el comando.',
      quoted: msg,
    })
    return
  }

  log.depuracion(`stickeraudio · video recibido (${(buffer.length / 1024).toFixed(0)} KB)`)

  // El sticker manda el ritmo: si el clip se recorta para entrar en los
  // 500 KB de WhatsApp, el audio tiene que cortarse igual o el cliente
  // reproduce el sticker como GIF mudo.
  const { buffer: sticker, duracion: duracionReal } = await stickerDesdeVideoInfo(buffer, { duracion })

  log.depuracion(
    `stickeraudio · sticker listo (${(sticker.length / 1024).toFixed(0)} KB, ${duracionReal}s)`
  )

  const audio = await audioDesdeVideo(buffer, { duracion: duracionReal }).catch((err) => {
    log.aviso('stickeraudio · no pude extraer el audio', err?.message)
    return null
  })

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

  log.depuracion(
    `stickeraudio · audio listo (${(audio.buffer.length / 1024).toFixed(0)} KB, ${audio.segundos}s)`
  )

  try {
    await enviarStickerConAudio(sock, jid, sticker, audio.buffer, {
      quoted: msg,
      segundos: audio.segundos,
    })
  } catch (err) {
    // Si el cliente rechaza el campo 26, mejor el sticker solo que nada.
    log.error('stickeraudio · no pude adjuntar el audio al sticker', err)
    await enviarSticker(sock, jid, sticker, msg)
    await sock.sendMessage(jid, {
      text: '⚠️ WhatsApp rechazó el audio del sticker; salió el sticker solo.',
    })
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

  const buffer = await conLimite(
    descargarMedia(sock, fuente),
    LIMITE_DESCARGA_MS,
    'descarga'
  )

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
    log.depuracion(
      `stickeraudio · sticker sin audio · campo 26: ${Boolean(fuente.audioMessage)} · busque: ${detalle}`
    )
    log.depuracion(`stickeraudio · chunks del webp: ${chunks || 'ninguno'}`)

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
    log.error('stickeraudio · no pude adjuntar el audio al sticker', err)
    await enviarSticker(sock, jid, buffer, msg)
    await responder('⚠️ WhatsApp rechazó el audio del sticker; salió con la firma nueva.')
    return
  }

  log.depuracion(`stickeraudio · sticker re-firmado · audio ${origen} · ${segundos ?? '?'}s`)
}
