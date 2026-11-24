/**
 * Motor de video NSFW: xvideos, xnxx y rule34video.
 *
 * Los tres publican la página de búsqueda como HTML plano y la del video con
 * el mp4 en un script, así que no hace falta clave ni API:
 *
 *   xvideos / xnxx   `html5player.setVideoUrlHigh('...mp4')`
 *   rule34video      `video_url: '...mp4'` y `video_alt_url` (mejor calidad)
 *
 * Se devuelve siempre la calidad más alta que publica el sitio; el llamador
 * decide si el peso entra en WhatsApp.
 */
import { bajarArchivo } from './descargas.js'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const TIMEOUT_MS = 25000

/** Sitios soportados y cómo se construye su búsqueda */
export const SITIOS = {
  xvideos: {
    nombre: 'XVideos',
    busqueda: (q) => `https://www.xvideos.com/?k=${encodeURIComponent(q)}`,
    patronVideo: /href="(\/video\.[^"]+)"/g,
    base: 'https://www.xvideos.com',
  },
  xnxx: {
    nombre: 'XNXX',
    busqueda: (q) => `https://www.xnxx.com/search/${encodeURIComponent(q)}`,
    patronVideo: /href="(\/video-[^"]+)"/g,
    base: 'https://www.xnxx.com',
  },
  rule34video: {
    nombre: 'Rule34Video',
    busqueda: (q) => `https://rule34video.com/search/${encodeURIComponent(q)}/`,
    patronVideo: /href="(https:\/\/rule34video\.com\/video\/[^"]+)"/g,
    base: 'https://rule34video.com',
  },
}

/** GET de HTML con tope de tiempo */
async function pagina(url) {
  const control = new AbortController()
  const temporizador = setTimeout(() => control.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
      signal: control.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(temporizador)
  }
}

/** Quita etiquetas y entidades de un trozo de HTML */
function limpiar(texto) {
  return String(texto || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Normaliza el slug de una URL a un título legible */
function tituloDeUrl(url) {
  const slug = String(url).replace(/\/$/, '').split('/').pop() || ''
  return limpiar(
    decodeURIComponent(slug)
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  )
}

/** Quita la coletilla del sitio del <title> */
function tituloDeHtml(html, url) {
  const crudo = html.match(/<title>([^<]*)<\/title>/i)?.[1]
  if (!crudo) return tituloDeUrl(url)
  return limpiar(crudo).replace(/\s*[-–]\s*(XVIDEOS|XNXX|Rule34Video)[^]*$/i, '').trim()
}

/** Carátula del video (og:image) */
function caratulaDe(html) {
  const m = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
  return m ? m[1] : null
}

/**
 * Busca videos en un sitio.
 * @returns {Promise<{sitio:string, videos:{url:string,titulo:string}[]}>}
 */
export async function buscarVideos(sitio, consulta, limite = 6) {
  const cfg = SITIOS[sitio]
  if (!cfg) throw new Error(`sitio desconocido: ${sitio}`)

  const html = await pagina(cfg.busqueda(consulta))

  const vistos = new Set()
  const videos = []
  for (const m of html.matchAll(cfg.patronVideo)) {
    const ruta = m[1]
    const url = ruta.startsWith('http') ? ruta : `${cfg.base}${ruta}`
    // La búsqueda repite cada resultado (miniatura y título)
    if (vistos.has(url)) continue
    vistos.add(url)
    videos.push({ url, titulo: tituloDeUrl(url) })
    if (videos.length >= limite) break
  }

  return { sitio, videos }
}

/** Saca el mp4 de la página de un video */
export async function resolverVideo(url) {
  const html = await pagina(url)

  const candidatos = [
    html.match(/video_alt_url:\s*'([^']+)'/)?.[1], // rule34video 480p
    html.match(/video_url:\s*'([^']+)'/)?.[1], // rule34video 360p
    html.match(/html5player\.setVideoUrlHigh\('([^']+)'\)/)?.[1], // xvideos / xnxx
    html.match(/html5player\.setVideoUrlLow\('([^']+)'\)/)?.[1],
    html.match(/"contentUrl":\s*"([^"]+)"/)?.[1],
  ].filter(Boolean)

  if (!candidatos.length) throw new Error('la página no publica un mp4')

  return {
    mp4: candidatos[0],
    titulo: tituloDeHtml(html, url),
    thumb: caratulaDe(html),
  }
}

/**
 * Baja el mp4 con tope de peso.
 * @param {string} url página del video
 * @param {number} maxMB tope en MB
 */
export async function descargarVideo(url, { maxMB = 24 } = {}) {
  const datos = await resolverVideo(url)
  const buffer = await bajarArchivo(datos.mp4, {
    maxBytes: Math.round(maxMB * 1024 * 1024),
    headers: { Referer: url },
  })
  return { ...datos, buffer }
}
