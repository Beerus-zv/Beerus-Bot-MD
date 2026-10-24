/**
 * #toimg (también #toimage) — convierte el sticker respondido a imagen (PNG),
 * o a video MP4 si es animado (estilo Neko).
 */
import { join } from 'node:path'
import { mkdir, readdir, unlink, readFile, writeFile } from 'node:fs/promises'
import { descargarMedia, ejecutarFfmpeg, esWebpAnimado, TMP_DIR, obtenerCitado } from '../lib/multimedia.js'

export default async ({ sock, jid, msg }) => {
  // Necesita un sticker citado (o el propio mensaje siendo sticker)
  const fuente = obtenerCitado(msg)?.stickerMessage
    ? obtenerCitado(msg)
    : msg?.message?.stickerMessage
      ? msg.message
      : null

  if (!fuente?.stickerMessage) {
    await sock.sendMessage(jid, {
      text: '❓ Responde a un *sticker* con `/toimg` para convertirlo a imagen.',
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
  const salida = join(TMP_DIR, `toimg_${sello}.mp4`)

  try {
    if (esWebpAnimado(buffer)) {
      // Sticker animado: WebP -> MP4 con ffmpeg y archivos temporales
      await writeFile(entrada, buffer)
      await ejecutarFfmpeg(['-y', '-i', entrada, '-c:v', 'libx264', '-movflags', '+faststart', salida])
      const video = await readFile(salida)
      await sock.sendMessage(jid, { video, caption: '✨ Sticker animado convertido a video', quoted: msg })
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

/** Borra restos de toimg_* más viejos de 10 min (por si algo quedó colgado) */
async function listarRestos() {
  return (await readdir(TMP_DIR).catch(() => []))
    .filter((n) => n.startsWith('toimg_'))
    .map((n) => join(TMP_DIR, n))
}

async function limpiar(rutas) {
  for (const ruta of rutas) await unlink(ruta).catch(() => {})
}
