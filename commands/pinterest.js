import { descargarContenido, enviarDescarga, esUrl, ffmpegDisponible, miniaturaJpeg, normalizarVideoWhatsApp } from '../lib/descargas.js'
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
 * Trozo del HTML que describe el pin pedido.
 *
 * Una ficha trae un JSON enorme con el pin y, detrás, los pines relacionados.
 * Buscar el video o la imagen en la página entera agarra el primero que
 * aparezca, que muchas veces es de otro pin. El bloque propio se reconoce por
 * `"entityId":"<id>"`, que viene justo después de los datos del pin.
 *
 * Devuelve '' si la página no trae ese bloque: ahí no se puede afirmar que lo
 * encontrado sea del pin, así que el comando no lo usa.
 */
function bloqueDelPin(html, id) {
  if (!id) return ''
  const marca = `"entityId":"${id}"`
  const pos = html.indexOf(marca)
  if (pos < 0) return ''
  return html.slice(Math.max(0, pos - 60000), pos + 20000)
}

/**
 * Saca la url de imagen del HTML de un pin.
 *
 * El patrón viejo (`"orig":{...}` y `og:image`) ya no aparece: la web actual
 * sirve el JSON del pin con las urls entre comillas. Se exige que la url
 * termine en extensión de imagen para no caer en `background-origin`, que
 * también contiene "i.pinimg.com/originals" dentro del CSS.
 *
 * Se mira primero el bloque del pin y solo se abre a la página entera si la
 * ficha no trae bloque: así no se manda la imagen de un pin relacionado.
 */
function urlDePin(html, id) {
  const patrones = [
    /"orig"\s*:\s*\{\s*"url"\s*:\s*"(https:[^"]+)"/,
    /"(https:\/\/i\.pinimg\.com\/originals\/[^"]+\.(?:jpg|jpeg|png|webp|gif))"/i,
    /"(https:\/\/i\.pinimg\.com\/736x\/[^"]+\.(?:jpg|jpeg|png|webp|gif))"/i,
    /property="og:image"\s+content="([^"]+)"/,
    /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/,
  ]
  const buscar = (fuente) => {
    if (!fuente) return null
    for (const patron of patrones) {
      const m = fuente.match(patron)
      if (!m) continue
      const limpia = m[1].replace(/\\u002F/gi, '/').replace(/\\\//g, '/')
      if (/i\.pinimg\.com/.test(limpia) && /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(limpia)) return limpia
    }
    return null
  }
  // Primero el bloque del pin; si ahí no hay nada, la ficha entera (el
  // llamador ya comprobó que es la ficha del pin, no la portada).
  return buscar(bloqueDelPin(html, id)) || buscar(html)
}

/**
 * Video del pin: la variante de más resolución y su miniatura.
 *
 * Las variantes vienen como `/720p/<hash>.mp4` (la buena) y `_540w.mp4`. Solo
 * cuenta el bloque del pin: la ficha de una imagen también trae los videos de
 * "más como esto", y sin esta guarda se mandaba el video de otro pin.
 *
 * @returns {{url: string, miniatura: string|null}|null}
 */
function videoDePin(html, id) {
  const bloque = bloqueDelPin(html, id)
  const leer = (fuente) =>
    [...fuente.matchAll(/"(https:\/\/v1\.pinimg\.com\/videos\/[^"]+\.mp4[^"]*)"/gi)].map((m) =>
      m[1].replace(/\\u002F/gi, '/')
    )

  let urls = bloque ? leer(bloque) : []
  if (!urls.length) {
    // Sin bloque no se puede afirmar cuál es el video del pin. Si la ficha
    // entera menciona un solo archivo, es ese; si hay varios, son de los
    // pines relacionados y mandar cualquiera sería mandar otro pin.
    const todos = leer(html)
    const hashes = new Set(todos.map((u) => u.split('/').pop().replace(/_\d+w\.mp4$/, '')))
    if (hashes.size !== 1) return null
    urls = todos
  }
  if (!urls.length) return null

  // Pinterest publica el mismo video en varias codificaciones. AV1 y HEVC
  // pesan menos y por eso aparecen primero, pero WhatsApp Android no las
  // decodifica: el mensaje llega y al abrirlo dice "problema con el archivo
  // de video". Se prefiere H.264; si el pin solo tiene AV1/HEVC se baja igual
  // y el envío lo convierte.
  const modernos = /(?:av1|h265|hevc|vp9)/i
  const h264 = urls.filter((u) => !modernos.test(u))
  const conversion = h264.length === 0
  if (!conversion) urls = h264

  const ancho = (url) => {
    const calidad = url.match(/\/(\d{3,4})p\//)
    if (calidad) return Number(calidad[1])
    return Number(url.match(/_(\d+)w\.mp4/)?.[1] || 0)
  }
  const url = [...new Set(urls)].sort((a, b) => ancho(b) - ancho(a))[0]
  // La miniatura lleva el mismo hash que el mp4, así que se busca por ese
  // nombre: en la ficha hay varias y solo una es de este video.
  const hash = url.split('/').pop().replace(/_\d+w\.mp4$/, '').replace(/\.mp4$/, '')
  const miniatura = html.match(
    new RegExp(`"thumbnail":"(https:\\/\\/i\\.pinimg\\.com\\/videos\\/thumbnails\\/[^"]*${hash}[^"]*)"`, 'i')
  )?.[1]
  return { url, miniatura: miniatura ? miniatura.replace(/\\u002F/gi, '/') : null, conversion }
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
  // Descarga cortada: el servidor dijo un peso y llegó menos. Mandar ese mp4
  // es mandar un archivo roto que el teléfono no va a poder abrir.
  if (declarado && buffer.length < declarado) {
    throw new Error(`la descarga se cortó (${(buffer.length / 1024).toFixed(0)} de ${(declarado / 1024).toFixed(0)} KB)`)
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

/** true si es un enlace corto: esos caducan y su destino se pierde para siempre */
function esAcortador(url) {
  try {
    return new URL(url).hostname.toLowerCase() === 'pin.it'
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
 *
 * `esFicha` dice si la url final es la ficha del pin. Un enlace caducado
 * termina en la portada, y la portada trae videos e imágenes de otros pines:
 * usarla sería mandar el pin de un desconocido.
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
  const id = idDePin(url) || idDePin(final)
  return { id, final, html, esFicha: !!id && idDePin(final) === id }
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

/**
 * Deja el mp4 del pin en la forma que WhatsApp decodifica.
 *
 * El trabajo pesado vive en lib/descargas.js porque los demas comandos de
 * descarga tienen el mismo problema. Aca solo se agrega la guarda del pin:
 * si Pinterest devolvio HTML con 200, esto no es un video y hay que cortar.
 */
async function prepararVideoWhatsApp(buffer, conversion = false) {
  if (buffer.length < 12 || buffer.toString('latin1', 4, 8) !== 'ftyp') {
    throw new Error('lo que devolvio Pinterest no es un mp4')
  }
  if (conversion && !(await ffmpegDisponible())) {
    // Sin ffmpeg no hay forma de convertir un AV1/HEVC: mejor la imagen del
    // pin que un video que el telefono va a rechazar.
    throw new Error('el video del pin esta en un formato que WhatsApp no abre y no hay ffmpeg para convertirlo')
  }
  return normalizarVideoWhatsApp(buffer)
}

/**
 * Miniatura para el `jpegThumbnail` del video.
 *
 * Sin miniatura, WhatsApp Web muestra el video como un recuadro con el peso en
 * vez de la vista previa. Pinterest ya publica la suya en JPEG, así que se usa
 * tal cual: pasar por sharp obligaría a tener la dependencia nativa para algo
 * que no la necesita. Solo si viene en webp/png se intenta convertir.
 */
async function bajarMiniatura(url) {
  if (!url) return null
  try {
    // Con sharp se achica a 320 px, que es lo que WhatsApp espera (unas pocas
    // decenas de KB como mucho). Sin sharp se manda el JPEG de Pinterest tal
    // cual: se ve igual, solo pesa más en el proto.
    const chica = await miniaturaJpeg(url)
    if (chica) return chica
    const buffer = await bajarImagen(url)
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return buffer
    return null
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

  const { id, final, html: htmlEntrada, esFicha } = await resolverPin(url)

  // Sin id numérico no hay pin: es un tablero, un perfil, una búsqueda o un
  // enlace corto caducado. El HTML de esas páginas igual trae imágenes y
  // videos (el avatar, los pines de portada), así que hay que cortar antes de
  // bajar nada o el comando manda el pin de un desconocido.
  if (!id) {
    if (esAcortador(url)) {
      throw new Error('el enlace corto ya no lleva a ningún pin: caducó o el pin se borró')
    }
    throw new Error('ese enlace no es un pin (puede ser un tablero o un perfil)')
  }

  // La ficha canónica trae la imagen; la de "enviado" del enlace corto no.
  // Solo vale el HTML si es de la ficha del pin: la portada, un tablero o una
  // búsqueda también responden 200 y traen media de otros pines.
  let html = esFicha ? htmlEntrada : ''
  const objetivo = enlaceCanonico(id)
  if (objetivo !== final || !html) {
    try {
      const pagina = await bajarHtml(objetivo)
      if (pagina.ok && idDePin(pagina.final) === id) html = pagina.html
    } catch (err) {
      log.aviso(`pinterest · no pude abrir la ficha ${objetivo} · ${err.message}`)
    }
  }
  if (!html) throw new Error('no pude abrir la ficha del pin')

  // Pin de video: se manda el mp4, que es lo que la gente espera ver
  let motivoVideo = ''
  const video = videoDePin(html, id)
  if (video) {
    try {
      const bajado = await bajarConTope(video.url, LIMITE_VIDEO)
      const mp4 = await prepararVideoWhatsApp(bajado, video.conversion)
      if (mp4.length > LIMITE_VIDEO) {
        throw new Error(`el video pesa ${(mp4.length / 1048576).toFixed(1)} MB y el tope es ${LIMITE_VIDEO / 1048576} MB`)
      }
      // Sin miniatura, WhatsApp Web muestra el archivo como un recuadro con el
      // peso en vez de la vista previa del video.
      const miniatura = await bajarMiniatura(video.miniatura)
      await sock.sendMessage(
        jid,
        {
          video: mp4,
          mimetype: 'video/mp4',
          ...(miniatura ? { jpegThumbnail: miniatura } : {}),
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

  const imagen = urlDePin(html, id) || (await imagenPorOembed(id))
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
