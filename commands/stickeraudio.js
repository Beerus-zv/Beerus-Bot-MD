import {
  contextoDeCita,
  resolverFuenteMedia,
  detectarTipoMedia,
  descargarMedia,
  duracionDeBuffer,
  chunksWebp,
  videoMiniatura,
  enviarVideoConAudio,
  enviarSticker,
  guardarAudioDeSticker,
} from '../lib/multimedia.js'
import { audioDeSticker, stickerAMp4 } from '../lib/sticker-video.js'

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
 * Sticker con sonido en una sola burbuja.
 *
 * WhatsApp no admite audio adentro de un sticker (el `Message` solo lleva un
 * medio por mensaje), así que la versión con sonido es un mp4 chico de 512:
 * se ve como una miniatura en movimiento y suena al tocarlo.
 *
 * Uso:
 *   responde a un video o GIF con /stickeraudio [segundos]
 *   responde a un sticker con audio con /stickeraudio
 */
export default async (ctx) => {
  const { sock, jid, msg } = ctx

  try {
    await manejar(ctx)
  } catch (err) {
    // Cualquier falla que se escape termina en un mensaje del chat, nunca en
    // silencio: el usuario tiene que saber que el comando corrio.
    console.error('[stickeraudio] fallo el comando:', err)
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

  // Sticker: no hay audio que extraer del WebP, se busca el que ya tenia
  // guardado y se reenvia con sonido. Sin audio sale igual, solo re-firmado.
  if (fuente.mensaje?.stickerMessage) {
    await rehacerSticker({ sock, jid, msg, fuente: fuente.mensaje })
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
    text: `⏳ Sacando el sticker con audio del video (${duracion}s)...`,
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

  console.log(`[stickeraudio] video recibido (${(buffer.length / 1024).toFixed(0)} KB)`)

  const { video, thumbnail, segundos } = await videoMiniatura(buffer, { duracion })

  console.log(
    `[stickeraudio] miniatura lista (${(video.length / 1024).toFixed(0)} KB, ${segundos}s)`
  )

  await enviarVideoConAudio(sock, jid, video, { quoted: msg, segundos, thumbnail })
}

/**
 * Reenvía un sticker con su audio: si tiene sonido guardado sale como la
 * miniatura con audio; si no, sale el sticker con la firma nueva.
 *
 * `firmarSticker` descarta el EXIF viejo y escribe el nuevo, así que el
 * paquete sale siempre como Beerus Bot / Beerus_zv.
 */
async function rehacerSticker({ sock, jid, msg, fuente }) {
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

  const { video, conAudio } = await stickerAMp4(sock, fuente, buffer, {
    idSticker: contextoDeCita(msg)?.stanzaId ?? msg?.key?.id,
  })

  const segundos = (await duracionDeBuffer(audio, 'ogg')) ?? 3

  await enviarVideoConAudio(sock, jid, video, { quoted: msg, segundos })

  // El audio queda guardado con el hash del sticker original, para que otro
  // comando (o un reenvío) lo vuelva a encontrar.
  guardarAudioDeSticker(buffer, audio, msg?.key?.id)

  console.log(
    `[stickeraudio] sticker con audio enviado · ${origen} · ${segundos}s · ${conAudio ? 'con sonido' : 'sin sonido'}`
  )
}
