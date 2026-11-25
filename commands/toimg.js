/**
 * #toimg (también #toimage) — convierte el sticker respondido en imagen (PNG),
 * o en video MP4 si es animado.
 *
 * Si el sticker animado lleva audio adentro (StickerMessage.audioMessage,
 * campo 26, lo que arma /stickeraudio), el video sale con ese mismo audio.
 */
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { mkdir, readdir, unlink, readFile, writeFile } from 'node:fs/promises'
import { descargarMedia, ejecutarFfmpeg, esWebpAnimado, TMP_DIR, obtenerCitado } from '../lib/multimedia.js'

/** Duracion del archivo en segundos; null si ffprobe no puede leerla */
function duracionDe(archivo) {
  return new Promise((resolve) => {
    const p = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      archivo,
    ])
    let out = ''
    p.stdout.on('data', (d) => { out += d.toString() })
    p.on('error', () => resolve(null))
    p.on('close', () => {
      const segundos = Number(String(out).trim())
      resolve(Number.isFinite(segundos) && segundos > 0 ? segundos : null)
    })
  })
}

export default async ({ sock, jid, msg }) => {
  // Necesita un sticker citado (o el propio mensaje siendo sticker)
  const fuente = obtenerCitado(msg)?.stickerMessage
    ? obtenerCitado(msg)
    : msg?.message?.stickerMessage
      ? msg.message
      : null

  if (!fuente?.stickerMessage) {
    await sock.sendMessage(jid, {
      text: '❓ Responde a un *sticker* con `/toimg` para convertirlo a imagen o video.',
      quoted: msg,
    })
    return
  }

  let buffer
  try {
    buffer = await descargarMedia(sock, fuente)
  } catch (err) {
    console.error('[toimg] error descargando el sticker:', err)
  }

  if (!buffer) {
    await sock.sendMessage(jid, {
      text: '⚠️ *No pude descargar el sticker.* Inténtalo otra vez.',
      quoted: msg,
    })
    return
  }

  await mkdir(TMP_DIR, { recursive: true })
  const sello = Date.now().toString(36)

  const entrada = join(TMP_DIR, `toimg_${sello}.webp`)
  const audioTmp = join(TMP_DIR, `toimg_${sello}.ogg`)
  const salida = join(TMP_DIR, `toimg_${sello}.mp4`)

  try {
    if (esWebpAnimado(buffer)) {
      await writeFile(entrada, buffer)

      // El audio del sticker viene como un segundo medio dentro del mensaje:
      // si esta, se descarga aparte y se pega al mp4.
      let conAudio = false
      const audioMessage = fuente.stickerMessage?.audioMessage
      if (audioMessage) {
        try {
          const audio = await descargarMedia(sock, { audioMessage })
          if (audio?.length) {
            await writeFile(audioTmp, audio)
            conAudio = true
          }
        } catch (err) {
          console.warn('[toimg] el sticker trae audio pero no se pudo bajar:', err?.message)
        }
      }

      const segundos = await duracionDe(entrada)

      const args = ['-y', '-i', entrada]
      if (conAudio) args.push('-i', audioTmp)

      args.push(
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
        '-r', '15',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23'
      )

      if (conAudio) {
        args.push('-c:a', 'aac', '-b:a', '96k', '-shortest')
      } else {
        args.push('-an')
      }

      if (segundos) args.push('-t', String(Math.min(segundos, 60)))

      args.push('-movflags', '+faststart', salida)
      await ejecutarFfmpeg(args)

      const video = await readFile(salida)
      await sock.sendMessage(jid, {
        video,
        mimetype: 'video/mp4',
        caption: conAudio
          ? '✨ Sticker animado convertido a video (con su audio)'
          : '✨ Sticker animado convertido a video',
        quoted: msg,
      })
    } else {
      // Sticker estático: WebP -> PNG con sharp (sin ffmpeg)
      const sharp = (await import('sharp')).default
      const png = await sharp(buffer).png().toBuffer()
      await sock.sendMessage(jid, {
        image: png,
        caption: '✨ Sticker convertido a imagen',
        quoted: msg,
      })
    }
  } catch (err) {
    console.error('[toimg] fallo la conversión:', err)
    await sock.sendMessage(jid, {
      text: '⚠️ *No pude convertir el sticker.* Si es animado, prueba de nuevo.',
      quoted: msg,
    })
  } finally {
    await limpiar(listarRestos())
  }
}

/** Borra restos de toimg_* (por si algo quedó colgado) */
async function listarRestos() {
  return (await readdir(TMP_DIR).catch(() => []))
    .filter((n) => n.startsWith('toimg_'))
    .map((n) => join(TMP_DIR, n))
}

async function limpiar(rutas) {
  for (const ruta of rutas) await unlink(ruta).catch(() => {})
}
