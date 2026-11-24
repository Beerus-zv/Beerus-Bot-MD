/**
 * `/spotify <enlace o búsqueda>` — baja el audio de una canción de Spotify.
 *
 *   /spotify https://open.spotify.com/track/XXXX
 *   /spotify bohemian rhapsody
 *
 * Spotify no deja bajar el audio directamente, así que se usa su oEmbed para
 * sacar el título y el artista (sin clave de API) y luego se busca esa misma
 * canción en YouTube con yt-dlp. El resultado es el audio en mp3.
 *
 * Solo canciones: un álbum o una playlist se rechazan con el aviso de que se
 * pase el enlace de cada track.
 */
import { buscarEnYouTube, descargarContenido, enviarDescarga } from '../lib/descargas.js'

const TIMEOUT_MS = 20000

/** fetch con tope de tiempo */
async function pedirJson(url) {
  const control = new AbortController()
  const temporizador = setTimeout(() => control.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Beerus-Bot-MD', Accept: 'application/json' },
      signal: control.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(temporizador)
  }
}

/** Valida el enlace y devuelve el tipo (track, album, playlist, artist) */
function tipoDeEnlace(url) {
  const m = String(url || '').match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist|artist|episode)\//i)
  return m ? m[1].toLowerCase() : null
}

export default async ({ sock, jid, msg, args }) => {
  const pedido = (args || []).join(' ').trim()

  if (!pedido) {
    return sock.sendMessage(jid, {
      text:
        '🎧 *Spotify a mp3*\n\n' +
        '• `/spotify https://open.spotify.com/track/...`\n' +
        '• `/spotify nombre de la canción`\n\n' +
        '_Solo canciones sueltas: un álbum o una playlist van track por track._',
      quoted: msg,
    })
  }

  let consulta = pedido
  let caratula = null

  // Enlace de Spotify: el oEmbed da título y artista exactos
  if (/open\.spotify\.com/i.test(pedido)) {
    const tipo = tipoDeEnlace(pedido)
    if (tipo && tipo !== 'track' && tipo !== 'episode') {
      return sock.sendMessage(jid, {
        text:
          `❌ Ese enlace es de un *${tipo}*, no de una canción.\n\n` +
          '_Pásame el enlace de cada track o el nombre de la canción._',
        quoted: msg,
      })
    }

    try {
      const datos = await pedirJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(pedido)}`)
      const titulo = String(datos?.title || '').trim()
      const autor = String(datos?.author_name || '').trim()
      if (!titulo) throw new Error('el enlace no devolvió título')
      consulta = autor ? `${titulo} ${autor}` : titulo
      caratula = datos?.thumbnail_url || null
    } catch (err) {
      return sock.sendMessage(jid, {
        text:
          `❌ No pude leer el enlace de Spotify: ${err.message}\n\n` +
          '_Prueba con el nombre de la canción:_ `/spotify <título>`',
        quoted: msg,
      })
    }
  }

  await sock.sendMessage(jid, {
    text: `🔎 Buscando *${consulta}*...`,
    quoted: msg,
  })

  // 1) La misma canción en YouTube
  let pista
  try {
    const resultados = await buscarEnYouTube(consulta, 3)
    pista = resultados[0]
  } catch (err) {
    return sock.sendMessage(jid, {
      text: `❌ La búsqueda falló: ${err.message}`,
      quoted: msg,
    })
  }

  if (!pista?.id) {
    return sock.sendMessage(jid, {
      text: `📭 No encontré *${consulta}* en YouTube.`,
      quoted: msg,
    })
  }

  const url = `https://www.youtube.com/watch?v=${pista.id}`

  await sock.sendMessage(jid, {
    text: `⬇️ Bajando *${pista.titulo}*...`,
    quoted: msg,
  })

  // 2) Solo el audio, en mp3
  let resultado
  try {
    resultado = await descargarContenido(url, { maxMB: 16, soloAudio: true })
  } catch (err) {
    return sock.sendMessage(jid, {
      text: `❌ No pude bajar el audio: ${err.message}\n\n▸ ${url}`,
      quoted: msg,
    })
  }

  // Carátula de Spotify si la hay; si no, la del video
  if (caratula) resultado.thumb = caratula
  resultado.autor = resultado.autor || pista.canal || ''

  try {
    await enviarDescarga(sock, jid, msg, resultado)
  } catch (err) {
    return sock.sendMessage(jid, {
      text: `❌ No pude enviar el audio: ${err.message}\n\n▸ ${url}`,
      quoted: msg,
    })
  }

  return
}
