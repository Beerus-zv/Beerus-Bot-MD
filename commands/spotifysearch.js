/**
 * .spotifysearch <texto|url> — busca en Spotify y envía la canción en mp3.
 * Las APIs de delirius (delirius-apiofc.vercel.app / api.delirius.store) ya no
 * existen. Ahora: búsqueda con nexray; descarga con davidcyril, nexray y, como
 * último recurso, YouTube (yt-dlp). Usa fetch nativo.
 */
import { bajarArchivo, buscarEnYouTube, descargarContenido, formatearDuracion, LIMITES } from '../lib/descargas.js'
import { log } from '../lib/logger.js'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const MAX_INTENTOS = 3
const MAX_BYTES = 100 * 1024 * 1024
const LIMITE_AUDIO = LIMITES.audio * 1024 * 1024

const ES_URL_SPOTIFY = /https?:\/\/open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/[A-Za-z0-9]+/i

async function pedirJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(45000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** Busca canciones: devuelve [{titulo, artista, album, duracion, imagen, url}] */
async function buscarCanciones(consulta) {
  const json = await pedirJson(`https://api.nexray.web.id/search/spotify?q=${encodeURIComponent(consulta)}`)
  return (Array.isArray(json?.result) ? json.result : [])
    .filter((c) => c?.url)
    .map((c) => ({
      titulo: c.title,
      artista: c.artist,
      album: c.album,
      duracion: c.duration,
      imagen: c.thumbnail,
      url: c.url,
    }))
}

/** Proveedores de descarga: cada uno devuelve { buffer, titulo?, artista?, imagen? } */
const DESCARGADORES = [
  {
    nombre: 'davidcyril',
    async bajar(urlSpotify) {
      const j = await pedirJson(`https://apis.davidcyriltech.my.id/spotifydl?url=${encodeURIComponent(urlSpotify)}`)
      if (!j?.success || !j?.DownloadLink) throw new Error('sin enlace')
      const buffer = await bajarArchivo(j.DownloadLink, { maxBytes: MAX_BYTES, headers: { 'User-Agent': UA } })
      return {
        buffer,
        titulo: j.title,
        artista: j.channel,
        imagen: j.thumbnail,
        duracion: j.duration ? formatearDuracion(Number(j.duration) / 1000) : null,
      }
    },
  },
  {
    nombre: 'nexray',
    async bajar(urlSpotify) {
      const j = await pedirJson(`https://api.nexray.web.id/downloader/spotify?url=${encodeURIComponent(urlSpotify)}`)
      if (!j?.status || !j?.result?.url) throw new Error('sin enlace')
      const buffer = await bajarArchivo(j.result.url, { maxBytes: MAX_BYTES, headers: { 'User-Agent': UA } })
      return { buffer, titulo: j.result.title, artista: j.result.artist }
    },
  },
]

/** Descarga con los proveedores en orden; si todos fallan, busca la canción en YouTube */
async function descargarCancion(urlSpotify, cancion) {
  for (const d of DESCARGADORES) {
    try {
      const r = await d.bajar(urlSpotify)
      if (r.buffer?.length) {
        log.depuracion(`spotifysearch · ${d.nombre} -> ${(r.buffer.length / 1048576).toFixed(1)} MB`)
        return r
      }
    } catch (err) {
      log.aviso(`spotifysearch · ${d.nombre} fallo`, err.message)
    }
  }

  const nombre = [cancion?.titulo, cancion?.artista].filter(Boolean).join(' ')
  if (!nombre) throw new Error('no pude bajar la canción')
  const [primero] = await buscarEnYouTube(`${nombre} audio`, 1)
  if (!primero) throw new Error('no pude bajar la canción')
  const r = await descargarContenido(primero.url, { maxMB: 25, soloAudio: true })
  log.depuracion('spotifysearch · youtube ->', primero.titulo)
  return { buffer: r.buffer, titulo: cancion?.titulo || r.titulo, artista: cancion?.artista || r.autor }
}

export default async ({ sock, jid, msg, args }) => {
  const consulta = (args || []).join(' ').trim()
  if (!consulta) {
    return await sock.sendMessage(
      jid,
      { text: '❓ Uso: `.spotifysearch <texto o url>`\nEj: `.spotifysearch bad bunny titi me pregunto`' },
      { quoted: msg }
    )
  }

  try {
    await sock.sendMessage(jid, { text: `🎧 *Spotify* · Buscando *${consulta}*...` }, { quoted: msg })

    // Lista de candidatas: una url directa, o los primeros resultados de la búsqueda
    let candidatas
    const urlDirecta = consulta.match(ES_URL_SPOTIFY)?.[0]
    if (urlDirecta) {
      candidatas = [{ url: urlDirecta }]
    } else if (/open\.spotify\.com\/(?:intl-[a-z]+\/)?(album|playlist|episode|artist)\//i.test(consulta)) {
      return await sock.sendMessage(
        jid,
        { text: '❌ Solo puedo descargar canciones (enlaces `/track/`). Para álbumes, busca por nombre.' },
        { quoted: msg }
      )
    } else {
      candidatas = (await buscarCanciones(consulta)).slice(0, MAX_INTENTOS)
    }

    if (!candidatas.length) {
      return await sock.sendMessage(jid, { text: '❌ No se encontraron resultados.' }, { quoted: msg })
    }

    let ultimoError = null
    for (const cancion of candidatas) {
      try {
        const r = await descargarCancion(cancion.url, cancion)
        await enviarCancion(sock, jid, msg, cancion, r)
        log.depuracion(`spotifysearch · "${consulta}" -> ${r.titulo || cancion.titulo} (${(r.buffer.length / 1048576).toFixed(1)} MB)`)
        return
      } catch (err) {
        ultimoError = err
        log.aviso('spotifysearch · candidata fallo', err.message)
      }
    }

    await sock.sendMessage(
      jid,
      { text: `❌ No se pudo descargar la canción.\n_${ultimoError?.message || 'error desconocido'}_` },
      { quoted: msg }
    )
  } catch (e) {
    log.error('spotifysearch', e)
    await sock.sendMessage(jid, { text: '❌ Error en el proceso.' }, { quoted: msg })
  }
}

/** Manda la ficha (con portada si hay) y luego el audio */
async function enviarCancion(sock, jid, msg, cancion, r) {
  const titulo = r.titulo || cancion.titulo || 'Desconocido'
  const artista = r.artista || cancion.artista || 'Desconocido'
  const duracion = cancion.duracion || r.duracion || '—:—'

  const info =
    `🪼 *Título:*\n${titulo}\n🪩 *Artista:*\n${artista}\n` +
    `${cancion.album ? `💿 *Álbum:*\n${cancion.album}\n` : ''}⏳ *Duración:*\n${duracion}\n🔗 *Enlace:*\n${cancion.url}`

  const portada = r.imagen || cancion.imagen
  try {
    if (!portada) throw new Error('sin portada')
    await sock.sendMessage(jid, { image: { url: portada }, caption: info }, { quoted: msg })
  } catch {
    await sock.sendMessage(jid, { text: info }, { quoted: msg })
  }

  const fileName = `${`${titulo} - ${artista}`.replace(/[\\/:*?"<>|]/g, '').slice(0, 120)}.mp3`
  if (r.buffer.length > LIMITE_AUDIO) {
    await sock.sendMessage(jid, { document: r.buffer, mimetype: 'audio/mpeg', fileName }, { quoted: msg })
  } else {
    await sock.sendMessage(jid, { audio: r.buffer, mimetype: 'audio/mpeg', fileName }, { quoted: msg })
  }
}
