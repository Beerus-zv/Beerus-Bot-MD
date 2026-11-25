import { descargarContenido, enviarDescarga, esUrl } from '../lib/descargas.js'
import { log } from '../lib/logger.js'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const AYUDA = `📌 *Pinterest*

*Uso:* \`/pinterest <búsqueda>\`
       \`/pinterest <enlace>\`

*Ejemplos:*
• \`/pinterest anime wallpapers\`
• \`/pinterest https://pin.it/abc123\`

_Busca imágenes o baja un pin (vídeo o imagen) por su enlace._`

const MAX_POR_BUSQUEDA = 4

/**
 * Tope del video de un pin. WhatsApp rechaza los archivos de más de 64 MB, y
 * un pin largo se pasa sin avisar: si el mp4 excede, se manda la imagen.
 * `PINTEREST_MAX_VIDEO_MB` lo baja sin tocar código (útil para probar el
 * respaldo con un video que sí entra).
 */
const LIMITE_VIDEO = (Number(process.env.PINTEREST_MAX_VIDEO_MB) || 50) * 1048576

/**
 * Id numérico del pin a partir de cualquier forma del enlace.
 *
 * `pin.it` redirige a `/pin/<id>/sent/?invite_code=...`, y esa página de
 * "enviado" no trae la imagen: hay que quedarse con el id y pedir la ficha
 * canónica.
 */
function idDePin(texto) {
  const m = String(texto || '').match(/\/pin\/(\d{5,})/)
  return m ? m[1] : null
}

/** Enlace canónico del pin */
function enlaceCanonico(id) {
  return `https://www.pinterest.com/pin/${id}/`
}

/**
 * Saca la url de imagen del HTML de un pin.
 *
 * El patrón viejo (`"orig":{...}` y `og:image`) ya no aparece: la web actual
 * sirve el JSON del pin con las urls entre comillas. Se exige que la url
 * termine en extensión de imagen para no caer en `background-origin`, que
 * también contiene "i.pinimg.com/originals" dentro del CSS.
 */
function urlDePin(html) {
  const patrones = [
    /"orig"\s*:\s*\{\s*"url"\s*:\s*"(https:[^"]+)"/,
    /"(https:\/\/i\.pinimg\.com\/originals\/[^"]+\.(?:jpg|jpeg|png|webp|gif))"/i,
    /"(https:\/\/i\.pinimg\.com\/736x\/[^"]+\.(?:jpg|jpeg|png|webp|gif))"/i,
    /property="og:image"\s+content="([^"]+)"/,
    /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/,
  ]
  for (const patron of patrones) {
    const m = html.match(patron)
    if (!m) continue
    const limpia = m[1].replace(/\\u002F/gi, '/').replace(/\\\//g, '/')
    if (/i\.pinimg\.com/.test(limpia) && /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(limpia)) return limpia
  }
  return null
}

/** Url del mp4 cuando el pin es un video (se queda con la resolución más alta) */
function videoDePin(html) {
  const urls = [...html.matchAll(/"(https:\/\/v1\.pinimg\.com\/videos\/[^"]+\.mp4[^"]*)"/gi)].map((m) =>
    m[1].replace(/\\u002F/gi, '/')
  )
  if (!urls.length) return null
  // Las variantes vienen como `/720p/<hash>.mp4` (la buena) y `_540w.mp4`
  const ancho = (url) => {
    const calidad = url.match(/\/(\d{3,4})p\//)
    if (calidad) return Number(calidad[1])
    return Number(url.match(/_(\d+)w\.mp4/)?.[1] || 0)
  }
  return urls.sort((a, b) => ancho(b) - ancho(a))[0]
}

/** Bajada de imagen con user-agent de navegador */
async function bajarImagen(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://www.pinterest.com/' },
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} bajando la imagen`)
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Baja un archivo con tope de tamaño. Mira el `content-length` antes de leer el
 * cuerpo y, si el servidor no lo declara, corta al pasar el límite: un pin de
 * video largo no puede quedarse con la memoria del proceso.
 */
async function bajarConTope(url, limite) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://www.pinterest.com/' },
    signal: AbortSignal.timeout(120000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} bajando el video`)

  const declarado = Number(res.headers.get('content-length') || 0)
  const tope = (limite / 1048576).toFixed(0)
  if (declarado > limite) {
    throw new Error(`el video pesa ${(declarado / 1048576).toFixed(1)} MB y el tope es ${tope} MB`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.length > limite) {
    throw new Error(`el video pesa ${(buffer.length / 1048576).toFixed(1)} MB y el tope es ${tope} MB`)
  }
  return buffer
}

/** Baja una página con user-agent de navegador; devuelve también la url final */
async function bajarHtml(url, timeout = 30000) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'es-ES,es;q=0.9' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
  })
  return {
    ok: res.ok,
    status: res.status,
    final: res.url || url,
    html: res.ok ? await res.text() : '',
  }
}

/** true si el enlace es de Pinterest: ahí yt-dlp no sirve y solo hace perder tiempo */
function esEnlacePinterest(url) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === 'pin.it' || host.endsWith('pinterest.com') || /\.pinterest\.[a-z.]+$/.test(host)
  } catch {
    return false
  }
}

/**
 * Resuelve un enlace de Pinterest a su ficha canónica.
 *
 * `pin.it/abc123` no lleva el id: redirige a `/pin/<id>/sent/?invite_code=...`,
 * y esa página de "enviado" no publica la imagen. El id aparece en la url
 * final, así que hay que seguir la redirección antes de buscar nada.
 */
async function resolverPin(url) {
  let final = url
  let html = ''
  try {
    const pagina = await bajarHtml(url)
    final = pagina.final
    html = pagina.html
  } catch (err) {
    log.aviso(`pinterest · no pude abrir el enlace · ${err.message}`)
  }
  return { id: idDePin(url) || idDePin(final), final, html }
}

/** Último recurso para imágenes: el oEmbed público de Pinterest */
async function imagenPorOembed(id) {
  try {
    const json = await pedirJson(
      `https://www.pinterest.com/oembed.json?url=${encodeURIComponent(enlaceCanonico(id))}`
    )
    const url = json?.thumbnail_url
    return typeof url === 'string' && /^https?:\/\//.test(url) ? url : null
  } catch {
    return null
  }
}

/** Descarga un pin puntual: scrape de la ficha, y yt-dlp solo si no es Pinterest */
async function pinPorEnlace(sock, jid, msg, url) {
  // yt-dlp no entiende las fichas de Pinterest; probarlo ahí son ~6 segundos
  // tirados antes de caer al scrape, que es el camino que sí funciona.
  if (!esEnlacePinterest(url)) {
    try {
      const resultado = await descargarContenido(url, { maxMB: 50 })
      const tipo = await enviarDescarga(sock, jid, msg, resultado)
      log.depuracion(`pinterest · pin -> ${tipo} (${(resultado.bytes / 1048576).toFixed(1)} MB)`)
      return
    } catch (err) {
      log.aviso(`pinterest · yt-dlp fallo, pruebo con el HTML del pin · ${err.message}`)
    }
  }

  const { id, final, html: htmlEntrada } = await resolverPin(url)

  // Sin id numérico no hay pin: es un tablero, un perfil o una búsqueda. Ahí
  // el HTML igual trae un `og:image` (el avatar), así que hay que cortar antes
  // de bajarlo, o el comando manda la foto de perfil como si fuera el pin.
  if (!id) throw new Error('ese enlace no es un pin (puede ser un tablero o un perfil)')

  // La ficha canónica trae la imagen; la de "enviado" del enlace corto no.
  let html = htmlEntrada
  const objetivo = enlaceCanonico(id)
  if (objetivo !== final) {
    try {
      const pagina = await bajarHtml(objetivo)
      if (pagina.ok) html = pagina.html
    } catch (err) {
      log.aviso(`pinterest · no pude abrir la ficha ${objetivo} · ${err.message}`)
    }
  }

  // Pin de video: se manda el mp4, que es lo que la gente espera ver
  let motivoVideo = ''
  const video = videoDePin(html)
  if (video) {
    try {
      const mp4 = await bajarConTope(video, LIMITE_VIDEO)
      await sock.sendMessage(
        jid,
        {
          video: mp4,
          mimetype: 'video/mp4',
          caption: `📌 *Pinterest* · video (${(mp4.length / 1048576).toFixed(1)} MB)`,
        },
        { quoted: msg }
      )
      log.depuracion(`pinterest · pin -> video (${(mp4.length / 1048576).toFixed(1)} MB)`)
      return
    } catch (err) {
      // Video demasiado grande o caído: se sigue con la imagen del pin, que
      // siempre está, y el aviso viaja en el pie de foto.
      motivoVideo = err.message
      log.aviso(`pinterest · video descartado · ${err.message}`)
    }
  }

  const imagen = urlDePin(html) || (await imagenPorOembed(id))
  if (!imagen) {
    if (motivoVideo) throw new Error(motivoVideo)
    throw new Error('el pin no publica una imagen')
  }

  const buffer = await bajarImagen(imagen)
  await sock.sendMessage(
    jid,
    {
      image: buffer,
      caption:
        `📌 *Pinterest* · ${(buffer.length / 1048576).toFixed(1)} MB` +
        (motivoVideo ? `\n_${motivoVideo}_` : ''),
    },
    { quoted: msg }
  )
  log.depuracion(`pinterest · pin -> imagen (${(buffer.length / 1048576).toFixed(1)} MB)`)
}

/** Pide JSON a una API con timeout */
async function pedirJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** Normaliza la respuesta de cada API a una lista de urls de imagen */
const APIS_BUSQUEDA = [
  {
    nombre: 'siputzx',
    url: (q) => `https://api.siputzx.my.id/api/s/pinterest?query=${q}`,
    extraer: (j) => (Array.isArray(j?.data) ? j.data : []).map((r) => r?.image_url),
  },
  {
    nombre: 'dorratz',
    url: (q) => `https://api.dorratz.com/v2/pinterest?q=${q}`,
    extraer: (j) => {
      const d = j?.data
      const lista = Array.isArray(d) ? d : Array.isArray(d?.results) ? d.results : Object.values(d || {})
      return lista
        .filter((r) => r && typeof r === 'object')
        .map((r) => r.image_large_url || r.image_medium_url || r.image_small_url || r.image_url || r.hd || r.image)
    },
  },
  {
    nombre: 'stellar',
    url: (q) => `https://api.stellarwa.xyz/search/pinterest?query=${q}&key=GataDios`,
    extraer: (j) => {
      const d = j?.data || j
      return (Array.isArray(d) ? d : []).map((r) => r?.hd || r?.image || r?.images_url || r?.image_url)
    },
  },
]

/** Busca imágenes probando cada API en orden hasta que una responda */
async function imagenesPorApi(consulta) {
  const q = encodeURIComponent(consulta)
  for (const api of APIS_BUSQUEDA) {
    try {
      const json = await pedirJson(api.url(q))
      const urls = [...new Set(api.extraer(json).filter((u) => typeof u === 'string' && /^https?:\/\//.test(u)))]
      if (urls.length) {
        log.depuracion(`pinterest · ${api.nombre} -> ${urls.length} resultados`)
        return urls
      }
    } catch (err) {
      log.aviso(`pinterest · API ${api.nombre} fallo · ${err.message}`)
    }
  }
  return []
}

/** Respaldo: scrape del HTML de resultados de Pinterest (suele estar bloqueado) */
async function imagenesPorScrape(consulta) {
  try {
    const res = await fetch(`https://www.pinterest.com/search/pins/?q=${encodeURIComponent(consulta)}`, {
      headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'es-ES,es;q=0.9' },
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) return []
    const html = await res.text()
    return [
      ...new Set(
        [...html.matchAll(/i\.pinimg\.com[^\s"'<>\\)]+/g)].map((m) => `https://${m[0]}`.replace(/\\u002F/gi, '/'))
      ),
    ].filter((u) => /\/(originals|736x|564x|474x|236x)\//.test(u))
  } catch (err) {
    log.aviso(`pinterest · scrape fallo · ${err.message}`)
    return []
  }
}

/** Búsqueda: obtiene resultados de APIs (o scrape) y manda las primeras imágenes */
async function porBusqueda(sock, jid, msg, consulta) {
  let candidatas = await imagenesPorApi(consulta)
  if (!candidatas.length) candidatas = await imagenesPorScrape(consulta)
  if (!candidatas.length) {
    throw new Error('No encontré resultados para esa búsqueda. Prueba con otras palabras o con el enlace de un pin.')
  }

  // Se mezclan un poco para no mandar siempre las mismas
  const mezcladas = candidatas
    .slice(0, 30)
    .sort(() => Math.random() - 0.5)

  let enviadas = 0
  for (const url of mezcladas) {
    if (enviadas >= MAX_POR_BUSQUEDA) break
    const versiones = [url, url.replace(/\/(originals|736x|564x|474x|236x)\//, '/736x/')]
    for (const version of [...new Set(versiones)]) {
      try {
        const buffer = await bajarImagen(version)
        await sock.sendMessage(
          jid,
          {
            image: buffer,
            caption: `📌 *${consulta}* · Pinterest (${enviadas + 1}/${MAX_POR_BUSQUEDA})`,
          },
          { quoted: msg }
        )
        enviadas += 1
        break
      } catch (err) {
        log.aviso(`pinterest · imagen fallo · ${err.message}`)
      }
    }
  }

  if (!enviadas) throw new Error('Encontré resultados pero no pude descargar ninguna imagen.')
  log.depuracion(`pinterest · busqueda "${consulta}" -> ${enviadas} imagenes`)
}

export default async ({ sock, jid, msg, args }) => {
  const texto = (args || []).join(' ').trim()

  if (!texto) {
    await sock.sendMessage(jid, { text: AYUDA }, { quoted: msg })
    return
  }

  await sock.sendMessage(jid, { text: `📌 *Pinterest* · ${esUrl(texto) ? 'Bajando el pin' : 'Buscando'}...` }, { quoted: msg })

  try {
    if (esUrl(texto)) await pinPorEnlace(sock, jid, msg, texto)
    else await porBusqueda(sock, jid, msg, texto)
  } catch (err) {
    log.error('pinterest · no se pudo bajar el pin', err)
    await sock.sendMessage(jid, {
      text: `❌ *Pinterest dijo que no.*\n_${err.message}_`,
    }, { quoted: msg })
  }
}
