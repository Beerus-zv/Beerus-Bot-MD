/**
 * Ugoira (animaciones de Pixiv): el zip de fotogramas + los retardos se
 * convierten a mp4 con ffmpeg.
 *
 * La extraccion del zip se hace con `tar` (el bsdtar de Windows y los tar
 * modernos leen.zip). Si algo falla se devuelve null y el comando avisa.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ffmpegDisponible } from './descargas.js'

const ejecutar = promisify(execFile)

/**
 * Convierte un zip de ugoira a mp4.
 *
 * @param {Buffer} zip contenido del zip de Pixiv (fotogramas jpg en orden)
 * @param {number[]} delays retardo de cada fotograma en ms
 * @returns {Promise<{buffer:Buffer, fotogramas:number}|null>}
 */
export async function desempaquetarUgoira(zip, delays = []) {
  if (!(await ffmpegDisponible())) {
    console.log('[ugoira] ffmpeg no está disponible; se manda el preview')
    return null
  }

  const carpeta = path.join(os.tmpdir(), `ugoira_${Date.now()}`)
  fs.mkdirSync(carpeta, { recursive: true })
  const zipPath = path.join(carpeta, 'ugoira.zip')
  const listaPath = path.join(carpeta, 'lista.txt')
  const destinoPath = path.join(carpeta, 'ugoira.mp4')

  try {
    fs.writeFileSync(zipPath, zip)

    // 1) Extraer los fotogramas con tar
    try {
      await ejecutar('tar', ['-xf', zipPath, '-C', carpeta], { timeout: 60000 })
    } catch (err) {
      console.error('[ugoira] tar no pudo extraer el zip:', err.message)
      return null
    }

    const fotogramas = fs
      .readdirSync(carpeta)
      .filter((f) => /\.(jpg|jpeg|png)$/i.test(f))
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))

    if (!fotogramas.length) {
      console.error('[ugoira] el zip no trae fotogramas')
      return null
    }

    // 2) Lista de concatenacion: cada duracion viene del meta de pixiv,
    //    y el ultimo fotograma se repite (asi lo exige el concat demuxer)
    const duracionDe = (i) => Math.max(20, devuelve(delays, i))
    const lista =
      fotogramas
        .map((f, i) => {
          const ruta = path.resolve(carpeta, f).replace(/'/g, "'\\''")
          return `file '${ruta}'\nduration ${(duracionDe(i) / 1000).toFixed(3)}`
        })
        .join('\n') + `\nfile '${path.resolve(carpeta, fotogramas.at(-1)).replace(/'/g, "'\\''")}'`

    fs.writeFileSync(listaPath, lista, 'utf8')

    // 3) ffmpeg: secuencia -> mp4 de WhatsApp
    await ejecutar(
      'ffmpeg',
      ['-y', '-f', 'concat', '-safe', '0', '-i', listaPath, '-vsync', 'vfr', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '23', destinoPath],
      { timeout: 120000 }
    )

    const buffer = fs.readFileSync(destinoPath)
    return { buffer, fotogramas: fotogramas.length }
  } catch (err) {
    console.error('[ugoira] fallo convirtiendo a mp4:', err.message)
    return null
  } finally {
    try {
      fs.rmSync(carpeta, { recursive: true, force: true })
    } catch {
      // limpieza best-effort
    }
  }
}

/** Retardos por fotograma; si faltan, 50 ms */
function devuelve(delays, i) {
  const d = delays[i]
  return Number.isFinite(d) && d > 0 ? d : 50
}
