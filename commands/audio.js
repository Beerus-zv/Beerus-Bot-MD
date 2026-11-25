import {
  buscarEnYouTube,
  descargarContenido,
  miniaturaJpeg,
  mimeDe,
  formatearDuracion,
  convertirANotaVoz,
} from '../lib/descargas.js'
import { log } from '../lib/logger.js'

const AYUDA = `🎵 *Audio de YouTube*

*Uso:* \`/audio <cancion o artista>\`

_Ejemplos:_
• \`/audio faded\`
• \`/audio purple rain prince\`
• \`/audio <enlace de youtube>\`

_Busca en YouTube y te envia el audio._`

/**
 * Busca un audio en YouTube por texto y lo envia al chat.
 *
 * - Con texto: busca con yt-dlp y baja el mejor formato de audio.
 * - Con enlace: descarga el audio de ese enlace.
 *
 * Envia un unico mensaje: miniatura + descripcion + audio.
 */
export default async ({ sock, jid, msg, args }) => {
  // /ytaudio (alias con 'voz') manda el audio como nota de voz (ptt)
  const comoVoz = args[0] === 'voz'
  const consulta = (comoVoz ? args.slice(1) : args).join(' ').trim()

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
      resultados = await buscarEnYouTube(consulta, 3)

      if (!resultados.length) {
        await sock.sendMessage(jid, {
          text: `😕 No encontre nada para *${consulta}*.\n\n_Prueba con otras palabras._`,
          quoted: msg,
        })
        return
      }

      const elegido = resultados[0]
      url = elegido.url
      titulo = elegido.titulo
      canal = elegido.canal
      duracion = elegido.duracion
      thumb = elegido.thumb
    }

    // ── Descarga (si el primer resultado falla, se prueban los siguientes) ──
    let resultado = null
    let ultimoError = null

    for (const candidato of resultados.length ? resultados : [{ url }]) {
      try {
        const descarga = await descargarContenido(candidato.url, { maxMB: 30, soloAudio: true })
        resultado = descarga
        url = candidato.url
        titulo = candidato.titulo ?? titulo
        canal = candidato.canal ?? canal
        duracion = candidato.duracion ?? duracion
        thumb = candidato.thumb ?? thumb
        break
      } catch (err) {
        ultimoError = err
        log.aviso(`audio · Fallo al descargar ${candidato.url}: ${err.message}`)
      }
    }

    if (!resultado) throw ultimoError ?? new Error('No se pudo obtener el audio')

    const nombreFinal = titulo || resultado.titulo
    const autorFinal = canal || resultado.autor
    const duracionFinal = duracion || resultado.duracion

    // Descripcion completa: va adjunta a la imagen de la miniatura
    const descripcion =
      `🎵 *${nombreFinal}*` +
      (autorFinal ? `\n👤 ${autorFinal}` : '') +
      (duracionFinal ? `\n⏱️ ${formatearDuracion(duracionFinal)}` : '') +
      `\n📦 ${(resultado.bytes / 1048576).toFixed(1)} MB • 🔵 YouTube`

    const miniatura = await miniaturaJpeg(thumb || resultado.thumb)

    // 1) Miniatura como imagen, con la descripcion adjunta
    if (miniatura && !comoVoz) {
      await sock.sendMessage(jid, {
        image: miniatura,
        caption: descripcion,
        quoted: msg,
      })
    }

    // 2) El audio, con el titulo resumido para no repetir la descripcion.
    //    En modo nota de voz se convierte a opus y se manda ptt:true
    if (comoVoz) {
      const ptt = await convertirANotaVoz(resultado.buffer, resultado.extension)
      await sock.sendMessage(jid, {
        audio: ptt?.buffer ?? resultado.buffer,
        mimetype: ptt ? 'audio/ogg; codecs=opus' : mimeDe(resultado.extension),
        ptt: true,
        caption: `🎵 *${nombreFinal}*`,
        quoted: msg,
      })
      log.depuracion(`audio · ${nombreFinal} -> nota de voz`)
      return
    }

    await sock.sendMessage(jid, {
      audio: resultado.buffer,
      mimetype: mimeDe(resultado.extension),
      ptt: false,
      caption: miniatura
        ? `🎵 *${nombreFinal}*` + (autorFinal ? `\n👤 ${autorFinal}` : '')
        : descripcion,
      ...(miniatura ? { thumbnail: miniatura } : {}),
      quoted: msg,
    })

    log.depuracion(
      `audio · ${nombreFinal} -> audio (${(resultado.bytes / 1048576).toFixed(1)} MB, miniatura: ${miniatura ? 'si' : 'no'})`
    )
  } catch (err) {
    log.error('Error en /audio', err)
    await sock.sendMessage(jid, {
      text: `💥 *No se pudo obtener el audio.*\n_${err.message}_\n\n_Prueba con otro nombre o con el enlace del video._`,
      quoted: msg,
    })
  }
}