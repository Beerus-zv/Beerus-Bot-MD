// ───────────── Multimedia ─────────────
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import sharp from 'sharp'
import { normalizeMessageContent, downloadMediaMessage as descargarMediaBaileys } from '@whiskeysockets/baileys'

export const TMP_DIR = path.join(process.cwd(), 'tmp')

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
 * Envía un sticker (Buffer WebP) detectando si es animado.
 * quoted se pasa como tercer argumento de Baileys (no dentro del contenido),
 * porque ahi es donde Baileys espera la cita.
 */
export async function enviarSticker(sock, jid, buffer, quoted) {
  const opcionesEnvio = quoted ? { quoted } : undefined
  await sock.sendMessage(
    jid,
    {
      sticker: buffer,
      mimetype: 'image/webp',
      isAnimated: esWebpAnimado(buffer),
    },
    opcionesEnvio
  )
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
      // WhatsApp rechaza stickers animados demasiado pesados
      if (resultado.length <= 500 * 1024) return resultado
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