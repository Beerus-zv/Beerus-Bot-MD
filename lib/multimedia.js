// ───────────── Multimedia ─────────────
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import sharp from 'sharp'
import {
  proto,
  normalizeMessageContent,
  downloadMediaMessage as descargarMediaBaileys,
  prepareWAMessageMedia,
  generateWAMessageFromContent,
} from '@whiskeysockets/baileys'

export const TMP_DIR = path.join(process.cwd(), 'tmp')

// ───────────── Sticker con audio (campo 26) ─────────────
/**
 * WhatsApp 2.26.41.x metio el audio dentro del propio StickerMessage:
 *   oneof audio { Message.AudioMessage audioMessage = 26; }
 *
 * El proto que trae Baileys 7.0.0-rc14 todavia no declara ese campo, y los
 * codificadores de protobufjs son estaticos (escriben campo por campo), asi
 * que se engancha el codificador del sticker para agregar el bloque cuando
 * el mensaje lo lleva. Sin el parche, el campo se pierde al serializar.
 */
const CAMPO_AUDIO_STICKER = 26

function parchearStickerConAudio() {
  const tipoSticker = proto?.Message?.StickerMessage
  const tipoAudio = proto?.Message?.AudioMessage
  if (!tipoSticker || !tipoAudio || tipoSticker.__audioStickerParcheado) return

  const codificarOriginal = tipoSticker.encode

  tipoSticker.encode = function (mensaje, escritor) {
    escritor = codificarOriginal.call(this, mensaje, escritor)
    if (mensaje?.audioMessage) {
      const bytes = tipoAudio.encode(mensaje.audioMessage).finish()
      escritor.uint32((CAMPO_AUDIO_STICKER << 3) | 2).bytes(bytes)
    }
    return escritor
  }

  tipoSticker.__audioStickerParcheado = true
}

parchearStickerConAudio()

/**
 * Devuelve el mensaje citado (quoted) de un mensaje, si existe.
 * Normalice el contenido antes de leerlo para ver a traves de
 * los envoltorios de efimero (implicit RFM) y ver una vez.
 */
export function obtenerCitado(msg) {
  const contenido = normalizeMessageContent(msg?.message)
  if (!contenido) return null

  // El contextInfo de la cita puede vivir en cualquiera de los tipos de mensaje
  for (const clave of Object.keys(contenido)) {
    const info = contenido[clave]?.contextInfo
    if (info?.quotedMessage) return info.quotedMessage
  }
  return null
}

/**
 * Detecta el tipo de multimedia presente en un mensaje.
 * @returns {'image' | 'video' | 'audio' | 'document' | null}
 */
export function detectarTipoMedia(mensaje) {
  const contenido = normalizeMessageContent(mensaje?.message ?? mensaje)
  if (!contenido) return null
  if (contenido.imageMessage) return 'image'
  if (contenido.videoMessage) return 'video'
  if (contenido.audioMessage) return 'audio'
  if (contenido.documentMessage) return 'document'
  if (contenido.stickerMessage) return 'image'
  return null
}

/**
 * Resuelve el mensaje del que se debe tomar el archivo:
 * 1) el mensaje citado (respuesta), si contiene multimedia
 * 2) el propio mensaje del comando, si viene con multimedia y caption
 */
export function resolverFuenteMedia(msg) {
  const citado = obtenerCitado(msg)
  if (citado && detectarTipoMedia(citado)) {
    return { mensaje: citado, citado: true }
  }
  if (detectarTipoMedia(msg?.message)) {
    return { mensaje: msg.message, citado: false }
  }
  return null
}

/**
 * Descarga el contenido multimedia de un mensaje mediante Baileys.
 * Funciona tanto con un mensaje completo (WAMessage) como con el
 * contenido de un mensaje citado ({ imageMessage: {...}, ... }).
 * Si el media ya expiro (URL 410/404) pide el reupload de Baileys.
 */
export async function descargarMedia(sock, mensaje) {
  if (!mensaje) throw new Error('NO_MEDIA')

  // downloadMediaMessage espera un WAMessage con .message;
  // si llega solo el contenido (ej. quotedMessage) se envuelve.
  const paraDescargar = mensaje.message
    ? { ...mensaje, message: normalizeMessageContent(mensaje.message) }
    : { key: mensaje.key ?? {}, message: mensaje }

  // Sin ctx no hay reupload de media expirada (carnadas 410/404)
  const ctx =
    typeof sock?.updateMediaMessage === 'function'
      ? { reuploadRequest: sock.updateMediaMessage }
      : undefined

  const buffer = await descargarMediaBaileys(paraDescargar, 'buffer', {}, ctx)
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
}

/**
 * Convierte una imagen (jpg/png/webp) en un sticker WebP de 512x512.
 * Ajusta la calidad para que el sticker no supere 100KB (límite de WhatsApp).
 */
export async function stickerDesdeImagen(buffer) {
  let quality = 90
  let sticker = await sharp(buffer)
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality })
    .toBuffer()

  // Reducir calidad progresivamente si supera 100KB (límite de WhatsApp para stickers estáticos)
  while (sticker.length > 100 * 1024 && quality > 10) {
    quality -= 10
    sticker = await sharp(buffer)
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality })
      .toBuffer()
  }

  return sticker
}

/**
 * Ejecuta ffmpeg con los argumentos indicados y devuelve el stdout como Buffer.
 */
export function ejecutarFfmpeg(args, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const proceso = spawn('ffmpeg', args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const chunks = []
    const errores = []

    proceso.stdout.on('data', (d) => chunks.push(d))
    proceso.stderr.on('data', (d) => errores.push(d))

    const temporizador = setTimeout(() => {
      proceso.kill('SIGKILL')
      reject(new Error('FFMPEG_TIMEOUT'))
    }, timeoutMs)

    proceso.on('error', (err) => {
      clearTimeout(temporizador)
      reject(err)
    })

    proceso.on('close', (code) => {
      clearTimeout(temporizador)
      if (code === 0) {
        resolve(Buffer.concat(chunks))
      } else {
        reject(
          new Error(`FFMPEG_ERROR_${code}: ${Buffer.concat(errores).toString().slice(-400)}`)
        )
      }
    })
  })
}

/**
 * Detecta si un WebP contiene animacion (contiene el chunk ANIM/ANMF).
 */
export function esWebpAnimado(buffer) {
  const cabecera = buffer.subarray(0, 512).toString('binary')
  return cabecera.includes('ANIM') || cabecera.includes('ANMF')
}

/**
 * Firma del paquete de stickers.
 *
 * WhatsApp lee el nombre y el autor desde un tag EXIF dentro del propio WebP:
 * un TIFF minimo con el tag 0x5741 ('AW') cuyo valor es el JSON del paquete.
 * Se inyecta como chunk 'EXIF' del contenedor RIFF, asi sirve igual para
 * stickers estaticos (sharp) y animados (ffmpeg) sin reencodear nada.
 */
const PAQUETE_STICKER = {
  nombre: 'Beerus Bot',
  autor: 'Beerus_zv',
  id: 'com.beerusbot.stickers',
}
const TAG_PAQUETE = 0x5741
const CABECERA_TIFF = 26

let exifPaquete = null

/** TIFF little-endian con una sola entrada: tag 0x5741 -> JSON del paquete. */
function exifDePaquete() {
  if (exifPaquete) return exifPaquete

  const json = Buffer.from(
    JSON.stringify({
      'sticker-pack-id': PAQUETE_STICKER.id,
      'sticker-pack-name': PAQUETE_STICKER.nombre,
      'sticker-pack-publisher': PAQUETE_STICKER.autor,
    }),
    'utf8'
  )

  const tiff = Buffer.alloc(CABECERA_TIFF + json.length)
  tiff.write('II', 0, 'ascii') // little-endian
  tiff.writeUInt16LE(42, 2)
  tiff.writeUInt32LE(8, 4) // la IFD0 arranca enseguida
  tiff.writeUInt16LE(1, 8) // una entrada
  tiff.writeUInt16LE(TAG_PAQUETE, 10)
  tiff.writeUInt16LE(7, 12) // tipo UNDEFINED
  tiff.writeUInt32LE(json.length, 14)
  tiff.writeUInt32LE(CABECERA_TIFF, 18) // el JSON va detras de la IFD
  tiff.writeUInt32LE(0, 22) // no hay siguiente IFD
  json.copy(tiff, CABECERA_TIFF)

  exifPaquete = tiff
  return tiff
}

/**
 * Mete el chunk EXIF en un WebP y devuelve el buffer nuevo.
 * Cualquier EXIF previo se descarta: el sticker sale siempre firmado igual.
 */
export function firmarSticker(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return buffer
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') return buffer
  if (buffer.toString('ascii', 8, 12) !== 'WEBP') return buffer

  const trozos = []
  let pos = 12

  while (pos + 8 <= buffer.length) {
    const tipo = buffer.toString('ascii', pos, pos + 4)
    const tam = buffer.readUInt32LE(pos + 4)
    // Un tamaño corrupto se corta aca: mejor un WebP sin firma que uno roto.
    if (tam > buffer.length) break

    const fin = Math.min(pos + 8 + tam + (tam % 2), buffer.length)
    if (tipo !== 'EXIF') trozos.push(buffer.subarray(pos, fin))
    pos = fin
  }

  const exif = exifDePaquete()
  const relleno = exif.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)
  const cabeceraChunk = Buffer.alloc(8)
  cabeceraChunk.write('EXIF', 0, 'ascii')
  cabeceraChunk.writeUInt32LE(exif.length, 4)

  // El EXIF va al final, que es donde el contenedor WebP lo espera.
  const cabeceraRiff = Buffer.alloc(12)
  cabeceraRiff.write('RIFF', 0, 'ascii')
  cabeceraRiff.write('WEBP', 8, 'ascii')

  const salida = Buffer.concat([cabeceraRiff, ...trozos, cabeceraChunk, exif, relleno])
  salida.writeUInt32LE(salida.length - 8, 4)
  return salida
}

/**
 * Envía un sticker (Buffer WebP) detectando si es animado.
 * quoted se pasa como tercer argumento de Baileys (no dentro del contenido),
 * porque ahi es donde Baileys espera la cita.
 *
 * Devuelve el WAMessage enviado, por si hay que citar algo a continuacion.
 */
export async function enviarSticker(sock, jid, buffer, quoted) {
  const sticker = firmarSticker(buffer)
  const opcionesEnvio = quoted ? { quoted } : undefined
  return sock.sendMessage(
    jid,
    {
      sticker,
      mimetype: 'image/webp',
      isAnimated: esWebpAnimado(sticker),
    },
    opcionesEnvio
  )
}

/**
 * Envía un sticker animado con su audio dentro del mismo mensaje
 * (StickerMessage.audioMessage, campo 26). Un solo mensaje, sin nota de voz.
 *
 * Los dos medios se suben con prepareWAMessageMedia y el contenido se arma a
 * mano porque generateWAMessageContent no conoce la clave 'audioMessage'.
 */
export async function enviarStickerConAudio(sock, jid, stickerBuffer, audioBuffer, { quoted, segundos } = {}) {
  const opcionesMedia = { upload: sock.waUploadToServer, logger: sock.logger }
  const sticker = firmarSticker(stickerBuffer)

  const [mediaSticker, mediaAudio] = await Promise.all([
    prepareWAMessageMedia({ sticker }, opcionesMedia),
    prepareWAMessageMedia(
      {
        audio: audioBuffer,
        ptt: true,
        mimetype: 'audio/ogg; codecs=opus',
        seconds: segundos,
      },
      opcionesMedia
    ),
  ])

  const contenido = {
    stickerMessage: {
      ...mediaSticker.stickerMessage,
      isAnimated: esWebpAnimado(sticker),
      audioMessage: mediaAudio.audioMessage,
    },
  }

  const mensaje = generateWAMessageFromContent(jid, contenido, {
    quoted,
    userJid: sock.user?.id,
  })

  // fromObject() solo copia campos conocidos del proto: el audio se vuelve a
  // colgar despues de generado el mensaje para que el codificador parcheado
  // lo escriba en el wire.
  mensaje.message.stickerMessage.audioMessage = mediaAudio.audioMessage

  await sock.relayMessage(jid, mensaje.message, { messageId: mensaje.key.id })
  return mensaje
}

/**
 * Convierte un video corto en un sticker animado WebP de 512x512.
 */
export async function stickerDesdeVideo(buffer, { duracion = 6, fps = 12 } = {}) {
  return stickerAnimado(buffer, 'mp4', { duracion, fps })
}

/**
 * Convierte un GIF en un sticker animado WebP de 512x512 (para reacciones anime).
 */
export async function stickerDesdeGif(buffer, { duracion = 6, fps = 12 } = {}) {
  return stickerAnimado(buffer, 'gif', { duracion, fps })
}

/**
 * Lee la duracion real (segundos) de un archivo de audio con ffprobe.
 * Devuelve null si ffprobe no esta o no puede leer el archivo.
 */
function duracionDeAudio(archivo) {
  return new Promise((resolve) => {
    const proceso = spawn(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', archivo],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
    )

    let salida = ''
    proceso.stdout.on('data', (d) => {
      salida += d
    })
    proceso.on('error', () => resolve(null))
    proceso.on('close', (code) => {
      const valor = Number.parseFloat(salida.trim())
      resolve(code === 0 && Number.isFinite(valor) ? valor : null)
    })
  })
}

/**
 * Extrae la pista de audio de un video y la deja en OGG/Opus.
 *
 * El encode calca el perfil de nota de voz de WhatsApp, que es el mismo
 * decodificador que reproduce el audio del sticker: mono, 48 kHz, frames de
 * 60 ms y `-avoid_negative_ts make_zero`. Ese flag es el que importa: los
 * videos traen un offset de arranque que deja timestamps negativos en el
 * OGG, y el decodificador de Android los rechaza con "no se pudo reproducir
 * el sonido del sticker".
 *
 * @returns {Promise<{buffer: Buffer, segundos: number}|null>} null si el video no trae audio
 */
export async function audioDesdeVideo(buffer, { duracion = 6, extension = 'mp4' } = {}) {
  await fsp.mkdir(TMP_DIR, { recursive: true })

  const sello = Date.now() + Math.random().toString(36).slice(2, 8)
  const entrada = path.join(TMP_DIR, `voz_${sello}.${extension}`)
  const salida = path.join(TMP_DIR, `voz_${sello}.ogg`)

  try {
    await fsp.writeFile(entrada, buffer)

    try {
      await ejecutarFfmpeg(
        [
          '-y',
          '-i', entrada,
          '-t', String(duracion),
          '-vn',
          '-map_metadata', '-1',
          '-ac', '1',
          '-ar', '48000',
          '-c:a', 'libopus',
          '-b:a', '48k',
          '-frame_duration', '60',
          '-application', 'audio',
          '-avoid_negative_ts', 'make_zero',
          '-f', 'ogg',
          salida,
        ],
        60000
      )
    } catch (err) {
      // Un video mudo hace salir a ffmpeg sin pista que mapear.
      // ffmpeg ausente o colgado sí tiene que verse, no disfrazarse de mudo.
      if (err?.code === 'ENOENT' || err?.message === 'FFMPEG_TIMEOUT') throw err
      return null
    }

    const audio = await fsp.readFile(salida)
    if (!audio.length) return null

    // La duracion real manda: si el video era mas corto que lo pedido, el
    // cliente compara el `seconds` del mensaje con el stream y falla al
    // reproducir cuando no cuadran.
    const exacta = await duracionDeAudio(salida)
    return { buffer: audio, segundos: Math.max(1, Math.round(exacta ?? duracion)) }
  } finally {
    for (const archivo of [entrada, salida]) {
      try {
        if (fs.existsSync(archivo)) fs.unlinkSync(archivo)
      } catch {
        /* ignorar errores de limpieza */
      }
    }
  }
}

/**
 * Convierte un GIF en un MP4 corto para enviarlo como GIF de WhatsApp.
 * WhatsApp reproduce los "GIF" a partir de un MP4 H.264 sin audio
 * (contenido `video` + `gifPlayback: true`).
 */
export async function mp4DesdeGif(buffer, { duracion = 6, fps = 15 } = {}) {
  await fsp.mkdir(TMP_DIR, { recursive: true })

  const sello = Date.now() + Math.random().toString(36).slice(2, 8)
  const entrada = path.join(TMP_DIR, `gif_${sello}.gif`)
  const salida = path.join(TMP_DIR, `gif_${sello}.mp4`)

  try {
    await fsp.writeFile(entrada, buffer)
    await ejecutarFfmpeg([
      '-y',
      '-i', entrada,
      '-t', String(duracion),
      // Nunca agranda el GIF original y deja alto par (H.264 lo exige)
      '-vf', `scale=w='min(720,iw)':h=-2:flags=lanczos,fps=${fps}`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-an',
      salida,
    ])
    return await fsp.readFile(salida)
  } finally {
    for (const archivo of [entrada, salida]) {
      try {
        if (fs.existsSync(archivo)) fs.unlinkSync(archivo)
      } catch {
        /* ignorar errores de limpieza */
      }
    }
  }
}

/**
 * Motor comun de conversion a sticker animado (video o GIF de entrada).
 */
async function stickerAnimado(buffer, extension, { duracion = 6, fps = 12 } = {}) {
  await fsp.mkdir(TMP_DIR, { recursive: true })

  const sello = Date.now() + Math.random().toString(36).slice(2, 8)
  const entrada = path.join(TMP_DIR, `entrada_${sello}.${extension}`)
  const salida = path.join(TMP_DIR, `salida_${sello}.webp`)
  // Limites de WhatsApp para stickers animados: fondo de calidad/fps hasta entrar
  const intentosCalidad = [
    { fps, crf: 30 },
    { fps: Math.min(fps, 10), crf: 36 },
    { fps: Math.min(fps, 8), crf: 40 },
  ]

  try {
    await fsp.writeFile(entrada, buffer)

    const filtroVideo =
      'scale=512:512:force_original_aspect_ratio=decrease,' +
      'pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0,' +
      'format=yuva420p'

    let resultado = null
    for (const { fps: fpsI, crf } of intentosCalidad) {
      await ejecutarFfmpeg([
        '-y',
        '-i', entrada,
        '-t', String(duracion),
        '-vf', `${filtroVideo},fps=${fpsI}`,
        '-loop', '0',
        '-c:v', 'libwebp',
        '-preset', 'default',
        '-crf', String(crf),
        '-compression_level', '6',
        '-an',
        salida,
      ])

      resultado = await fsp.readFile(salida)
      // WhatsApp rechaza stickers animados demasiado pesados. Se deja margen
      // para el chunk EXIF con la firma del paquete que se agrega al enviar.
      if (resultado.length <= 500 * 1024 - 256) return resultado
    }

    return resultado
  } finally {
    // Limpieza de los archivos temporales
    for (const archivo of [entrada, salida]) {
      try {
        if (fs.existsSync(archivo)) fs.unlinkSync(archivo)
      } catch {
        /* ignorar errores de limpieza */
      }
    }
  }
}