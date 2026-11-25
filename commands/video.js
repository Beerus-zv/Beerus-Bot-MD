import {
  buscarEnYouTube,
  descargarContenido,
  mimeDe,
  formatearDuracion,
  normalizarVideoWhatsApp,
  LIMITES,
} from '../lib/descargas.js'
import { log } from '../lib/logger.js'

const AYUDA = `🎬 *Video de YouTube*

*Uso:* \`/video <nombre del video>\`
      \`/video <enlace de youtube>\`
      \`/video doc <...\` para mandarlo como documento\`

*Ejemplos:*
• \`/video big buck bunny corto\`
• \`/video https://youtu.be/XXXX\`
• \`/video doc dragon ball opening\`

_Busca en YouTube y envia el video (max ${LIMITES.video} MB)._`

/**
 * Busca un video en YouTube y lo descarga con yt-dlp para enviarlo directo
 * al chat (antes reenviaba el video respondido; ahora descarga de YouTube).
 */
export default async ({ sock, jid, msg, args }) => {
  // /mp4doc (alias con 'doc') manda el video como documento
  const comoDocumento = args[0] === 'doc'
  const consulta = (comoDocumento ? args.slice(1) : args).join(' ').trim()

  if (!consulta) {
    await sock.sendMessage(jid, { text: AYUDA, quoted: msg })
    return
  }

  try {
    let url = consulta
    let titulo = ''
    let canal = ''
    let duracion = null
    let thumb = null
    let resultados = []

    if (!/^https?:\/\//i.test(consulta)) {
      // ── Busqueda en YouTube ──
      await sock.sendMessage(jid, { text: `🔎 Buscando *${consulta}* en YouTube...` })

      resultados = await buscarEnYouTube(consulta, 5)

      if (!resultados.length) {
        await sock.sendMessage(jid, {
          text: `😕 No encontre nada para *${consulta}*.\n\n_Prueba con otras palabras._`,
          quoted: msg,
        })
        return
      }

      // Se prefieren los videos normales (no directos que duran horas)
      const elegido =
        resultados.find((r) => r.duracion && r.duracion <= 1200) || resultados[0]
      url = elegido.url
      titulo = elegido.titulo
      canal = elegido.canal
      duracion = elegido.duracion
      thumb = elegido.thumb
    } else {
      await sock.sendMessage(jid, { text: '⏳ Descargando el video...' })
    }

    // ── Descarga: si el primer candidato falla, se prueban los siguientes ──
    let resultado = null
    let ultimoError = null

    for (const candidato of resultados.length ? resultados : [{ url }]) {
      try {
        resultado = await descargarContenido(candidato.url, { maxMB: LIMITES.video })
        url = candidato.url
        titulo = candidato.titulo ?? titulo
        canal = candidato.canal ?? canal
        duracion = candidato.duracion ?? duracion
        thumb = candidato.thumb ?? thumb
        break
      } catch (err) {
        ultimoError = err
        log.aviso(`video · Fallo al descargar ${candidato.url}: ${err.message}`)
      }
    }

    if (!resultado) throw ultimoError ?? new Error('No se pudo obtener el video')

    const barra =
      `🎬 *${titulo || resultado.titulo}*` +
      ((canal || resultado.autor) ? `\n👤 ${canal || resultado.autor}` : '') +
      ((duracion || resultado.duracion) ? `\n⏱️ ${formatearDuracion(duracion || resultado.duracion)}` : '') +
      `\n📦 ${(resultado.bytes / 1048576).toFixed(1)} MB • 🔵 YouTube`

    if (comoDocumento) {
      await sock.sendMessage(jid, {
        document: resultado.buffer,
        mimetype: mimeDe(resultado.extension),
        fileName: `${(titulo || resultado.titulo || 'video').replace(/[\\/:*?"<>|]/g, '').slice(0, 60)}.mp4`,
        caption: barra,
        quoted: msg,
      })
      log.depuracion(`video · ${titulo || resultado.titulo} -> documento (${(resultado.bytes / 1048576).toFixed(1)} MB)`)
      return
    }

    const video = await normalizarVideoWhatsApp(resultado.buffer)
    await sock.sendMessage(jid, {
      video,
      mimetype: video.toString('latin1', 4, 8) === 'ftyp' ? 'video/mp4' : mimeDe(resultado.extension),
      caption: barra,
      quoted: msg,
    })

    log.depuracion(
      `video · ${titulo || resultado.titulo} -> video (${(resultado.bytes / 1048576).toFixed(1)} MB)`
    )
  } catch (err) {
    log.error('Error en /video', err)
    await sock.sendMessage(jid, {
      text:
        `💥 *No se pudo obtener el video.*\n_${err.message}_\n\n` +
        `_Prueba con otro nombre, o usa \`/dl <url>\` si ya tienes el enlace._`,
      quoted: msg,
    })
  }
}
