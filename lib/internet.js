/**
 * Utilidades de internet para Beerus Bot MD.
 * Todo se hace con fetch nativo (Node 20+) y APIs publicas sin clave:
 *  - DuckDuckGo   -> busqueda web
 *  - YouTube      -> busqueda de videos (scraping del JSON inicial)
 *  - Wikipedia    -> resumen de articulos
 *  - Open-Meteo   -> clima actual y pronostico
 *  - Google Translate (gtx) -> traduccion
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const TIMEOUT_MS = 20000

/** fetch con timeout y User-Agent de navegador */
export async function pedir(url, opciones = {}) {
  const control = new AbortController()
  const timer = setTimeout(() => control.abort(), opciones.timeout ?? TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'es-ES,es;q=0.9',
        ...(opciones.headers || {}),
      },
      signal: control.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

/** Igual que pedir, pero parsea la respuesta como JSON */
export async function pedirJson(url, opciones = {}) {
  return JSON.parse(await pedir(url, opciones))
}

/** Igual que pedir, pero devuelve un Buffer para descargar archivos */
export async function pedirBuffer(url, opciones = {}) {
  const control = new AbortController()
  const timer = setTimeout(() => control.abort(), opciones.timeout ?? TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'es-ES,es;q=0.9',
        ...(opciones.headers || {}),
      },
      signal: control.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  } finally {
    clearTimeout(timer)
  }
}

/** Decodifica las entidades HTML mas comunes */
export function decodificar(texto) {
  return String(texto)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&hellip;/g, '...')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
}

/** Quita etiquetas HTML y colapsa espacios */
export function limpiarHtml(html) {
  return decodificar(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()
}

/** Decodifica las URLs de redireccion de DuckDuckGo (/l/?uddg=...) */
function urlReal(href) {
  if (!href) return null
  let url = decodificar(href)
  if (url.startsWith('//')) url = 'https:' + url
  try {
    const parsed = new URL(url)
    const destino = parsed.searchParams.get('uddg')
    if (destino) return decodeURIComponent(destino)
    return parsed.toString()
  } catch {
    return url
  }
}

/**
 * Busqueda web en DuckDuckGo.
 * @returns {Promise<Array<{titulo:string, url:string, resumen:string}>>}
 */
export async function buscarWeb(consulta, limite = 5) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(consulta)}`
  const html = await pedir(url)

  const resultados = []
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let m

  while ((m = re.exec(html)) !== null && resultados.length < limite) {
    const enlace = urlReal(m[1])
    const titulo = limpiarHtml(m[2])
    if (!enlace || !titulo) continue

    const resto = html.slice(m.index, m.index + 2500)
    const snip = resto.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i)
    const resumen = snip ? limpiarHtml(snip[1]).slice(0, 260) : ''

    resultados.push({ titulo, url: enlace, resumen })
  }

  return resultados
}

/**
 * Busca imagenes reales en internet usando el buscador de imagenes de DuckDuckGo.
 * No usa Wikipedia: devuelve enlaces a paginas web cualquiera (fanzine, wikia, fandom...).
 * @returns {Promise<Array<{url:string, titulo:string, ancho:number, alto:number}>>}
 */
export async function buscarImagenes(consulta, limite = 8) {
  const texto = String(consulta || '').trim()
  if (!texto) return []

  // DuckDuckGo exige un token (vqd) que se obtiene de su pagina de busqueda
  const html = await pedir(
    `https://duckduckgo.com/?q=${encodeURIComponent(texto)}&iax=images&ia=images`,
    { headers: { Referer: 'https://duckduckgo.com/' } }
  )

  const token = html.match(/vqd=['"]([^'"&]+)/)?.[1]
  if (!token) return []

  const datos = await pedir(
    `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(texto)}` +
      `&vqd=${token}&f=,,,&p=1`,
    { headers: { Referer: 'https://duckduckgo.com/' } }
  )

  let json
  try {
    json = JSON.parse(datos)
  } catch {
    return []
  }

  const resultados = []
  for (const item of Array.isArray(json?.results) ? json.results : []) {
    const url = item?.image
    if (!url || !/^https?:\/\//i.test(url)) continue
    resultados.push({
      url,
      titulo: String(item.title || '').trim(),
      ancho: Number(item.width) || 0,
      alto: Number(item.height) || 0,
    })
    if (resultados.length >= limite) break
  }

  return resultados
}

/**
 * Extrae el JSON inicial de YouTube contando llaves.
 */
function extraerJsonInicial(html, marcador) {
  const idx = html.indexOf(marcador)
  if (idx === -1) return null

  const inicio = html.indexOf('{', idx)
  if (inicio === -1) return null

  let profundidad = 0
  let enCadena = false
  let escapado = false

  for (let i = inicio; i < html.length; i++) {
    const c = html[i]
    if (enCadena) {
      if (escapado) escapado = false
      else if (c === '\\') escapado = true
      else if (c === '"') enCadena = false
      continue
    }
    if (c === '"') enCadena = true
    else if (c === '{') profundidad++
    else if (c === '}') {
      profundidad--
      if (profundidad === 0) {
        try {
          return JSON.parse(html.slice(inicio, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/**
 * Busca videos en YouTube.
 * @returns {Promise<Array<{titulo:string, canal:string, duracion:string, vistas:string, url:string}>>}
 */
export async function buscarYoutube(consulta, limite = 5) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(consulta)}`
  const html = await pedir(url)

  const data = extraerJsonInicial(html, 'ytInitialData')
  if (!data) return []

  const videos = []
  const visitar = (obj) => {
    if (!obj || typeof obj !== 'object') return
    if (Array.isArray(obj)) {
      obj.forEach(visitar)
      return
    }
    if (obj.videoRenderer && videos.length < limite) {
      const v = obj.videoRenderer
      const id = v.videoId
      if (id) {
        videos.push({
          titulo: v.title?.runs?.[0]?.text ?? 'Sin titulo',
          canal: v.ownerText?.runs?.[0]?.text ?? 'Desconocido',
          duracion: v.lengthText?.simpleText ?? '--:--',
          vistas: v.viewCountText?.simpleText ?? '',
          url: `https://www.youtube.com/watch?v=${id}`,
        })
      }
    }
    for (const clave of Object.keys(obj)) visitar(obj[clave])
  }
  visitar(data)

  return videos
}

/**
 * Busca en Wikipedia (es) y devuelve los primeros resultados.
 * @returns {Promise<Array<{titulo:string, resumen:string, url:string}>>}
 */
export async function buscarWikipedia(consulta, limite = 4) {
  const url =
    'https://es.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=' +
    limite +
    '&srsearch=' +
    encodeURIComponent(consulta)

  const datos = JSON.parse(await pedir(url))
  const resultados = datos?.query?.search ?? []

  return resultados.map((r) => ({
    titulo: r.title,
    resumen: limpiarHtml(r.snippet),
    url: `https://es.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
  }))
}

/** Resumen de un articulo de Wikipedia */
export async function resumenWikipedia(titulo) {
  const url = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titulo)}`
  const datos = JSON.parse(await pedir(url))
  return {
    titulo: datos.title,
    extract: datos.extract,
    imagen: datos.thumbnail?.source ?? null,
    url: datos.content_urls?.desktop?.page ?? null,
  }
}

/** Codigos WMO -> descripcion en espanol */
const CODIGOS_CLIMA = {
  0: 'Cielo despejado',
  1: 'Mayormente despejado',
  2: 'Parcialmente nublado',
  3: 'Nublado',
  45: 'Niebla',
  48: 'Niebla con escarcha',
  51: 'Llovizna ligera',
  53: 'Llovizna',
  55: 'Llovizna intensa',
  61: 'Lluvia ligera',
  63: 'Lluvia',
  65: 'Lluvia fuerte',
  71: 'Nieve ligera',
  73: 'Nieve',
  75: 'Nieve intensa',
  77: 'Granos de nieve',
  80: 'Chubascos ligeros',
  81: 'Chubascos',
  82: 'Chubascos violentos',
  85: 'Chubascos de nieve',
  86: 'Chubascos de nieve fuertes',
  95: 'Tormenta electrica',
  96: 'Tormenta con granizo',
  99: 'Tormenta fuerte con granizo',
}

/**
 * Clima de una ciudad (actual + 3 dias).
 */
export async function clima(ciudad) {
  const geoUrl =
    'https://geocoding-api.open-meteo.com/v1/search?count=1&language=es&format=json&name=' +
    encodeURIComponent(ciudad)

  const geo = JSON.parse(await pedir(geoUrl))
  const lugar = geo?.results?.[0]
  if (!lugar) throw new Error('NO_ENCONTRADA')

  const climaUrl =
    'https://api.open-meteo.com/v1/forecast?latitude=' +
    lugar.latitude +
    '&longitude=' +
    lugar.longitude +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3'

  const datos = JSON.parse(await pedir(climaUrl))
  const actual = datos.current

  const dias = (datos.daily?.time ?? []).map((fecha, i) => ({
    fecha,
    max: datos.daily.temperature_2m_max?.[i],
    min: datos.daily.temperature_2m_min?.[i],
    descripcion: CODIGOS_CLIMA[datos.daily.weather_code?.[i]] ?? 'Desconocido',
  }))

  return {
    ciudad: [lugar.name, lugar.admin1, lugar.country].filter(Boolean).join(', '),
    temperatura: actual?.temperature_2m,
    sensacion: actual?.apparent_temperature,
    humedad: actual?.relative_humidity_2m,
    viento: actual?.wind_speed_10m,
    descripcion: CODIGOS_CLIMA[actual?.weather_code] ?? 'Desconocido',
    dias,
  }
}

/**
 * Traduce texto (por defecto al espanol, o al idioma pedido).
 * Usa la API de Google Translate (gtx) y, si falla, el endpoint "dict-chrome".
 */
export async function traducir(texto, destino = 'es') {
  const googleUrl =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' +
    encodeURIComponent(destino) +
    '&dt=t&q=' +
    encodeURIComponent(texto)

  try {
    const respuesta = await pedir(googleUrl, { timeout: 7000 })
    const datos = JSON.parse(respuesta)

    // Formato: [[["Hola","hello",null,null,10]],null,"en",...]
    if (Array.isArray(datos) && Array.isArray(datos[0]) && Array.isArray(datos[0][0])) {
      const traduzido = datos[0].map((seg) => (Array.isArray(seg) ? seg[0] : '')).join('')
      if (traducido.trim()) return { texto: traduzido, idioma: datos[2] || 'auto' }
    }
  } catch {
    // se intenta el endpoint alternativo
  }

  try {
    const alternativa =
      'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=' +
      encodeURIComponent(destino) +
      '&q=' +
      encodeURIComponent(texto)

    const respuesta = await pedir(alternativa, { timeout: 7000 })
    const datos = JSON.parse(respuesta)
    // Formato: [["Hola","en"]]
    if (Array.isArray(datos) && Array.isArray(datos[0]) && datos[0][0]) {
      return { texto: String(datos[0][0]), idioma: datos[0][1] || 'auto' }
    }
  } catch {
    // sin alternativas
  }

  throw new Error('TRADUCCION_FALLIDA')
}

/**
 * Descarga una pagina y devuelve su texto limpio.
 */
export async function leerUrl(url, maximo = 1500) {
  const html = await pedir(url)
  const tituloHtml = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const titulo = tituloHtml ? limpiarHtml(tituloHtml[1]) : url

  // Los wikis cargan un menu de navegacion enorme que hay que descartar
  const esWiki = /wikipedia|wikidata|wiktionary|wikimedia/i.test(titulo)
  const texto = limpiarTextoWeb(limpiarHtml(html), esWiki)

  return {
    titulo,
    texto: texto.slice(0, maximo),
    total: texto.length,
  }
}

/** Ruido tipico de portales (Wikipedia, etc.) que se repite en la navegacion */
const RUIDO_WEB = [
  'menú principal',
  'ir al contenido',
  'mover a la barra lateral',
  'ocultar',
  'navegación',
  'portada',
  'portal de la comunidad',
  'actualidad',
  'cambios recientes',
  'páginas nuevas',
  'página aleatoria',
  'ayuda',
  'notificar un error',
  'páginas especiales',
  'donaciones',
  'crear una cuenta',
  'herramientas personales',
  'herramientas',
  'acciones',
  'artículo',
  'discusión',
  'ver historial',
  'enlaces externos',
  'subir archivo',
  'enlace permanente',
  'información de la página',
  'citar esta página',
  'obtener url acortado',
  'imprimir/exportar',
  'crear un libro',
  'descargar como pdf',
  'versión para imprimir',
  'en otros proyectos',
  'wikimedia commons',
  'elemento de wikidata',
  'editar enlaces',
  'lo que enlaza aquí',
  'cambios en enlazadas',
  'cambiar al analizador antiguo',
  'alternar subsección',
  'cambiar a la tabla de contenidos',
  'de wikipedia, la enciclopedia libre',
  'buscar',
  'apariencia',
  'acceder',
  'contenidos',
  'inicio',
  'idiomas',
  'leer',
  'editar',
  'general',
]

/**
 * Limpia el texto extraido de una pagina: quita bloques de datos (JSON de
 * Wikidata, etc.) y, en wikis, el menu de navegacion repetido.
 */
export function limpiarTextoWeb(texto, agresivo = false) {
  let limpio = String(texto)

  // Bloques JSON embebidos (comunes en Wikipedia: {"wt":"..."})
  limpio = limpio.replace(/\{"[\s\S]*?\}/g, ' ')
  limpio = limpio.replace(/"[\w\s\-]+"\s*:\s*"(?:[^"\\]|\\.)*"/g, ' ')
  limpio = limpio.replace(/"?[\w\s\-]+"?\s*:\s*[^,}\]]*/g, ' ')

  if (agresivo) {
    for (const palabra of RUIDO_WEB) {
      const re = new RegExp(`\\b${palabra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
      limpio = limpio.replace(re, ' ')
    }

    // Llaves y comillas sueltas que quedan del JSON
    limpio = limpio.replace(/[{}"]/g, ' ')
    limpio = limpio.replace(/[\]'>]+/g, ' ')
    limpio = limpio.replace(/,\s*(?:,\s*)+/g, ' ')
    limpio = limpio.replace(/\[\s*\]/g, ' ')

    // Elimina frases repetidas (el menu se repite varias veces)
    const recorte = limpio.slice(0, 12000)
    for (let i = 0; i < 3; i++) {
      const siguiente = recorte.replace(/(.{4,90}?)\s*\1(?=\s|$)/g, '$1')
      if (siguiente === recorte) break
      limpio = limpio.replace(recorte, siguiente)
      break
    }
  }

  // Quita el titulo duplicado al principio del texto
  limpio = limpio.replace(/^(.{3,120}?)\s*\1\s*/i, '$1 ')

  return limpio.replace(/\s+/g, ' ').trim()
}
