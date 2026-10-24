/**
 * .tiktoksearch <texto> — busca videos de TikTok por texto y envía los primeros.
 * Prueba varias APIs en orden hasta que una responda (la anterior,
 * api.tiksearch.xyz, ya no existe). Usa fetch nativo.
 */
import { bajarArchivo, LIMITES } from '../lib/descargas.js'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const MAX_VIDEOS = 3
const MAX_BYTES = LIMITES.video * 1024 * 1024

const APIS = [
  {
    nombre: 'nexray',
    url: (q) => `https://api.nexray.web.id/search/tiktok?q=${q}`,
    extraer: (j) =>
      (Array.isArray(j?.result) ? j.result : []).map((v) => ({
        titulo: v.title,
        autor: v.author?.nickname || v.author?.fullname,
        url: v.data,
        duracion: v.duration,
      })),
  },
  {
    nombre: 'davidcyril',
    url: (q) => `https://apis.davidcyriltech.my.id/search/tiktok?query=${q}`,
    extraer: (j) =>
      (Array.isArray(j?.result?.videos) ? j.result.videos : []).map((v) => ({
        titulo: v.title,
        autor: v.author?.nickname || v.author?.username,
        url: v.playUrl || v.downloadUrl,
        duracion: v.duration,
      })),
  },
]

/** Busca en cada API hasta que una devuelva videos con enlace */
async function buscarVideos(consulta) {
  const q = encodeURIComponent(consulta)
  for (const api of APIS) {
    try {
      const res = await fetch(api.url(q), {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const videos = api.extraer(await res.json()).filter((v) => /^https?:\/\//.test(v.url || ''))
      if (videos.length) {
        console.log(`[tiktoksearch] ${api.nombre} -> ${videos.length} resultados`)
        return videos
      }
    } catch (err) {
      console.warn(`[tiktoksearch] API ${api.nombre} fallo:`, err.message)
    }
  }
  return []
}

export default async ({ sock, jid, msg, args }) => {
  const texto = (args || []).join(' ').trim()
  if (!texto) {
    return await sock.sendMessage(
      jid,
      { text: '❓ Uso: `.tiktoksearch <texto>`\nEj: `.tiktoksearch gato`' },
      { quoted: msg }
    )
  }

  try {
    await sock.sendMessage(jid, { text: `🔍 *TikTok Search* · Buscando *${texto}*...` }, { quoted: msg })

    const videos = await buscarVideos(texto)
    if (!videos.length) {
      return await sock.sendMessage(jid, { text: '❌ No se encontraron resultados.' }, { quoted: msg })
    }

    // Se mezclan para no mandar siempre los mismos
    const candidatos = videos.slice(0, 15).sort(() => Math.random() - 0.5)

    let enviados = 0
    for (const v of candidatos) {
      if (enviados >= MAX_VIDEOS) break
      try {
        const buffer = await bajarArchivo(v.url, { maxBytes: MAX_BYTES, headers: { Referer: 'https://www.tiktok.com/' } })
        if (!buffer.length) continue
        const titulo = String(v.titulo || 'Sin título').trim().slice(0, 200)
        await sock.sendMessage(
          jid,
          {
            video: buffer,
            mimetype: 'video/mp4',
            caption:
              `💞 *TikTok Search* (${enviados + 1}/${MAX_VIDEOS})\n🔎 ${texto}\n\n${titulo}` +
              `${v.autor ? `\n👤 ${v.autor}` : ''}${v.duracion ? `\n⏱️ ${v.duracion}` : ''}`,
          },
          { quoted: msg }
        )
        enviados += 1
      } catch (err) {
        console.warn('[tiktoksearch] video fallo:', err.message)
      }
    }

    if (!enviados) {
      await sock.sendMessage(
        jid,
        { text: '❌ Encontré resultados pero no pude descargar ningún video. Prueba otra búsqueda.' },
        { quoted: msg }
      )
      return
    }
    console.log(`[tiktoksearch] "${texto}" -> ${enviados} videos`)
  } catch (e) {
    console.error('[tiktoksearch]', e)
    await sock.sendMessage(jid, { text: '❌ Error en búsqueda TikTok.' }, { quoted: msg })
  }
}
