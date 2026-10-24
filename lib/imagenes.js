/**
 * Imagenes de los personajes del gacha.
 *
 * Orden de resolucion de la imagen de un personaje:
 *   1. URL guardada en la base de datos (/gacha setimage).
 *   2. AniList (imagen oficial del personaje en su anime).
 *   3. Busqueda en internet (DuckDuckGo Images), probando varios candidatos.
 *   4. Wikipedia (es -> en) usando la API oficial.
 *   5. Wikidata (imagen oficial P18 del personaje).
 *   6. Carta generada por el bot con el nombre y el color de su rareza.
 *
 * Las imagenes se cachean en data/personajes para no repetir descargas.
 * La carta generada se guarda en un archivo aparte (.carta.png) para que un
 * fallo puntual de red no impida volver a buscar la foto real mas adelante.
 */
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import { RAREZAS } from '../database/catalogo.js'
import { setImagenPersonaje } from '../database/db.js'
import { buscarImagenes } from './internet.js'

const DIR = path.resolve('data', 'personajes')
const UA = `BeerusBotMD/2.1.0 (https://github.com/beerus-bot-md; bot de WhatsApp) Node.js/${process.versions.node}`
const UA_NAVEGADOR =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const WIKIS = ['es.wikipedia.org', 'en.wikipedia.org']
const TIMEOUT = 15000
const ESPERA_API = 800

/** Tiempo antes de volver a buscar la foto real si solo se pudo generar la carta */
const REINTENTO_CARTA_MS = 6 * 60 * 60 * 1000

/**
 * Cabeceras alternativas para descargar imagenes.
 * Algunos servidores bloquean el Referer de Wikipedia o el User-Agent del bot.
 */
const CABECERAS_DESCARGA = [
  { 'User-Agent': UA, Referer: 'https://es.wikipedia.org/' },
  { 'User-Agent': UA_NAVEGADOR, Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' },
  { 'User-Agent': UA },
]

/** Espera ms milisegundos */
function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Convierte un texto en un nombre de archivo seguro */
export function slugify(text) {
  return (
    String(text ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'personaje'
  )
}

/** Escapa los caracteres reservados de XML (para el texto del SVG) */
function escaparXml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Ruta del archivo cacheado con la foto real de un personaje */
export function rutaImagenPersonaje(personaje) {
  if (!personaje) return null
  const id = personaje.id ?? 'x'
  return path.join(DIR, `${id}-${slugify(personaje.nombre)}.png`)
}

/**
 * Ruta del archivo con la carta generada por el bot (fallback sin foto real).
 * Se guarda aparte para que un fallo puntual de red no bloquee la busqueda
 * de la foto real en las siguientes peticiones.
 */
export function rutaCartaPersonaje(personaje) {
  if (!personaje) return null
  const id = personaje.id ?? 'x'
  return path.join(DIR, `${id}-${slugify(personaje.nombre)}.carta.png`)
}

/**
 * True si el PNG es la carta generada por el bot (600x800) y no una foto real.
 * Se usa para no dar por buena una carta cacheada como si fuera la imagen.
 */
export async function esCartaGenerada(buffer) {
  try {
    const meta = await sharp(buffer).metadata()
    return meta.width === 600 && meta.height === 800
  } catch {
    return false
  }
}

/** Archivos que son diagramas, graficos u objetos y no retratos de personajes */
const PALABRAS_SOSPECHOSAS = [
  'chart',
  'graph',
  'diagram',
  'radar',
  'map',
  'locator',
  'symbol',
  'timeline',
  'stats',
  'infobox',
  'comparison',
  'tree',
  'flag',
  'logo',
  'city',
  'montage',
  'cosplay',
  'costume',
  'statue',
  'mural',
  'graffiti',
  'street art',
  'prefecture',
  'district',
]

/** Quita los parametros de seguimiento de la URL de Wikimedia */
function limpiarUrl(url) {
  return String(url || '').split('?')[0]
}

/** Normaliza un texto para comparar nombres */
function normalizar(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Descarta los archivos que no son retratos (diagramas, SVG, logos...) */
function pareceRetrato(url) {
  const bajo = decodeURIComponent(limpiarUrl(url)).toLowerCase()
  if (!bajo) return false
  if (bajo.endsWith('.svg')) return false
  return !PALABRAS_SOSPECHOSAS.some((p) => bajo.includes(p))
}

/** Puntua un candidato para elegir la mejor imagen disponible */
function puntuarCandidato(nombre, pagina, url, wiki) {
  const buscada = normalizar(nombre)
  const titulo = normalizar(pagina?.title)
  const archivo = normalizar(
    decodeURIComponent(limpiarUrl(url).split('/').pop() || '').replace(/\.[a-z0-9]+$/, '')
  )

  let puntos = 0
  if (titulo === buscada) puntos += 60
  else if (buscada && titulo.includes(buscada)) puntos += 25

  const palabras = buscada.split(' ').filter((p) => p.length > 2)
  if (palabras.length) {
    const coincide = palabras.filter((p) => archivo.includes(p)).length
    puntos += Math.round((coincide / palabras.length) * 40)
  }

  // Las fichas en ingles suelen traer el retrato oficial del personaje
  if (wiki.startsWith('en.')) puntos += 10
  return puntos
}

/** Consulta la API de Wikipedia y devuelve las paginas con imagen */
async function consultarWiki(wiki, params, intentos = 2) {
  const url =
    `https://${wiki}/w/api.php?action=query&format=json&formatversion=2&redirects=1` +
    `&prop=pageimages&piprop=original%7Cthumbnail&pithumbsize=720&${params}`

  for (let intento = 1; intento <= intentos; intento++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT),
    })

    if (res.status === 429) {
      // Wikimedia limita las peticiones: esperamos y reintentamos
      await esperar(1200 * intento)
      continue
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const tipo = res.headers.get('content-type') || ''
    if (!tipo.includes('json')) throw new Error('respuesta no JSON')

    const data = await res.json()
    const paginas = data?.query?.pages
    if (!Array.isArray(paginas)) return []
    return paginas.filter((p) => !p.missing && !p.invalid)
  }

  throw new Error('demasiadas peticiones')
}

/** Distancia de Levenshtein entre dos textos */
function levenshtein(a, b) {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m

  let anterior = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const actual = [i]
    for (let j = 1; j <= n; j++) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1
      actual[j] = Math.min(actual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + coste)
    }
    anterior = actual
  }
  return anterior[n]
}

/** Compara dos nombres de personaje tolerando variantes (Kaidou / Kaido) */
function nombreSimilar(a, b) {
  const na = normalizar(a)
  const nb = normalizar(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (mismoNombre(a, b)) return true

  const corto = Math.min(na.length, nb.length)
  if (corto < 4) return false
  return levenshtein(na, nb) <= Math.max(1, Math.floor(corto * 0.2))
}

/** Compara dos nombres sin importar el orden de las palabras */
function mismoNombre(a, b) {
  const ta = normalizar(a).split(' ').filter(Boolean)
  const tb = new Set(normalizar(b).split(' ').filter(Boolean))
  if (!ta.length || !tb.size) return false
  return ta.every((t) => tb.has(t))
}

/** True si la descripcion de Wikidata corresponde a un personaje */
function descripcionDePersonaje(...descripciones) {
  return descripciones.some((d) =>
    /personaje|character|anime|manga|comic|fictional|héroe|hero|villain|villano|protagonist|protagonista/.test(
      normalizar(d)
    )
  )
}

/**
 * Consulta GraphQL de AniList para obtener la imagen oficial de un personaje.
 * AniList es la fuente mas fiable para personajes de anime: usa los artworks
 * oficiales de cada serie y no aplica bloqueos agresivos.
 */
const CONSULTA_ANILIST = `query ($search: String) {
  Page(perPage: 10) {
    characters(search: $search) {
      id
      name { full native }
      image { large medium }
      media { nodes { title { romaji english } } }
    }
  }
}`

/**
 * Puntua que tan bien coincide un nombre de AniList con el buscado.
 *   0 = no coincide
 *   1 = coincide el apellido (Sasha Braus / Sasha Blouse)
 *   2 = coincide el nombre completo
 *   3 = coincidencia exacta
 */
function puntuarNombre(candidato, buscado) {
  const nc = normalizar(candidato)
  const nb = normalizar(buscado)
  if (!nc || !nb) return 0
  if (nc === nb) return 3
  if (nombreSimilar(candidato, buscado)) return 2

  // Variantes de traduccion: "Sasha Braus" (catalogo) vs "Sasha Blouse" (AniList)
  const pc = nc.split(' ').filter(Boolean)
  const pb = nb.split(' ').filter(Boolean)
  if (!pc.length || !pb.length) return 0

  const comparte = (a, b) => a.some((p) => b.includes(p))
  if (pc.length > 1 && pb.length > 1 && comparte(pc, pb) && comparte(pb, pc)) return 1

  // Un nombre contenido en el otro: "Index" / "Index Librorum Prohibitorum"
  if (pb.every((p) => pc.includes(p)) || pc.every((p) => pb.includes(p))) return 1

  // Prefijos de nombre japones: "Rei Ayanami" / "Reina Ayanami"
  if (pc.length > 1 && pb.length > 1 && pc[0] !== pb[0]) {
    const uno = pc[0]
    const otro = pb[0]
    if (uno.startsWith(otro) || otro.startsWith(uno)) return 1
  }

  return 0
}

/**
 * Consulta la API GraphQL de AniList y devuelve los personajes encontrados.
 */
async function consultarAnilist(busqueda) {
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': UA,
    },
    body: JSON.stringify({ query: CONSULTA_ANILIST, variables: { search: busqueda } }),
    signal: AbortSignal.timeout(TIMEOUT),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data = await res.json()
  return Array.isArray(data?.data?.Page?.characters) ? data.data.Page.characters : []
}

/**
 * Busca la imagen oficial de un personaje en AniList.
 * Devuelve la URL de la imagen o null si no hay ninguna.
 */
export async function buscarEnAnilist(nombre, anime) {
  const titulo = String(nombre || '').trim()
  if (!titulo) return null

  // Se prueban varias consultas: el nombre completo y, si no, solo el apellido.
  // AniList a veces usa otro nombre (Rei Ayanami por Reina Ayanami).
  const partes = titulo.split(' ').filter(Boolean)
  const consultas = [titulo]
  if (partes.length > 1) consultas.push(partes[partes.length - 1])

  const candidatos = []
  const vistos = new Set()

  for (const consulta of consultas) {
    let personajes = []
    try {
      personajes = await consultarAnilist(consulta)
    } catch (err) {
      console.error(`[imagenes] fallo al buscar "${consulta}" en AniList:`, err.message)
      continue
    }

    for (const p of personajes) {
      const url = p?.image?.large || p?.image?.medium
      if (!url || vistos.has(url)) continue

      // El nombre devuelto debe corresponder al personaje buscado. AniList usa
      // a veces otro nombre (Sasha Blouse por Sasha Braus), asi que se puntua
      // la coincidencia en vez de exigirla de forma estricta.
      const nombres = [p?.name?.full, p?.name?.native].filter(Boolean)
      let puntos = 0
      for (const n of nombres) {
        const valor = puntuarNombre(n, titulo)
        if (valor > puntos) puntos = valor
      }
      if (!puntos) continue

      // Si se indica el anime, el personaje debe aparecer en esa serie.
      // Se comparan todos los titulos (romaji, ingles y nativo) porque el
      // catalogo usa el nombre en espanol/ingles y AniList el japones.
      if (anime) {
        const series = (p?.media?.nodes || []).flatMap((m) =>
          [m?.title?.romaji, m?.title?.english].filter(Boolean)
        )
        const objetivo = normalizar(anime)
        const coincide = series.some((s) => {
          const t = normalizar(s)
          return t.includes(objetivo) || objetivo.includes(t)
        })
        if (!coincide) continue
        // La serie correcta sube la puntuacion del candidato
        puntos += 5
      }

      vistos.add(url)
      candidatos.push({ url, puntos })
    }

    // Si ya hay candidatos validos no hace falta seguir buscando
    if (candidatos.length) break
  }

  if (!candidatos.length) return null
  candidatos.sort((a, b) => b.puntos - a.puntos)
  return candidatos[0].url
}

/**
 * Busca la imagen de un personaje en Wikidata (fuente principal).
 * Wikidata tiene la imagen oficial del personaje (P18) y su descripcion.
 */
export async function buscarEnWikidata(nombre, anime) {
  const titulo = String(nombre || '').trim()
  if (!titulo) return null

  const consultas = [titulo]
  const encontrados = new Map()

  for (const consulta of consultas) {
    try {
      const res = await fetch(
        `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(consulta)}` +
          `&language=es&uselang=es&limit=15&format=json&type=item`,
        {
          headers: { 'User-Agent': UA, Accept: 'application/json' },
          signal: AbortSignal.timeout(TIMEOUT),
        }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (!(res.headers.get('content-type') || '').includes('json')) throw new Error('respuesta no JSON')

      const data = await res.json()
      const resultados = Array.isArray(data?.search) ? data.search : []
      for (const item of resultados) {
        if (!encontrados.has(item.id)) {
          encontrados.set(item.id, { id: item.id, label: item.label, description: item.description })
        }
      }
    } catch (err) {
      console.error(`[imagenes] fallo al buscar "${consulta}" en Wikidata:`, err.message)
    }
    await esperar(ESPERA_API)
  }

  if (!encontrados.size) return null

  const ids = [...encontrados.keys()].slice(0, 25).join('|')

  try {
    const res = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=claims%7Clabels%7Cdescriptions` +
        `&languages=es%7Cen&format=json`,
      {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT),
      }
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()
    const entidades = data?.entities || {}

    const candidatos = []
    for (const [id, encontrado] of encontrados) {
      const entidad = entidades[id]
      if (!entidad) continue

      const etiquetas = [entidad.labels?.es?.value, entidad.labels?.en?.value, encontrado.label].filter(Boolean)
      const descripciones = [
        entidad.descriptions?.es?.value,
        entidad.descriptions?.en?.value,
        encontrado.description,
      ].filter(Boolean)

      const archivo = obtenerP18(entidad)
      if (!archivo || !pareceRetrato(archivo)) continue

      // Solo nos interesan los items que son el personaje buscado
      if (!etiquetas.some((etiqueta) => nombreSimilar(etiqueta, titulo))) continue
      if (!descripcionDePersonaje(...descripciones)) continue

      let puntos = 60
      if (descripciones.some((d) => normalizar(d).includes(normalizar(anime || '')))) puntos += 30
      if (etiquetas.some((etiqueta) => normalizar(etiqueta) === normalizar(titulo))) puntos += 20

      candidatos.push({ url: urlArchivoCommons(archivo), puntos, etiqueta: etiquetas[0] })
    }

    if (!candidatos.length) return null
    candidatos.sort((a, b) => b.puntos - a.puntos)
    return candidatos[0].url
  } catch (err) {
    console.error('[imagenes] fallo al leer las entidades de Wikidata:', err.message)
  }

  return null
}

/** Extrae el nombre del archivo de imagen (P18) de una entidad */
function obtenerP18(entidad) {
  const claim = entidad?.claims?.P18?.[0]
  const valor = claim?.mainsnak?.datavalue?.value
  if (typeof valor !== 'string' || !valor) return null
  return valor
}

/** URL directa de un archivo de Wikimedia Commons */
function urlArchivoCommons(archivo) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(archivo)}?width=720`
}

/** True si el titulo de la pagina corresponde al personaje buscado */
function tituloDePersonaje(tituloPagina, nombre, anime) {
  if (!tituloPagina) return false
  if (nombreSimilar(tituloPagina, nombre)) return true
  if (!anime) return false

  const t = normalizar(tituloPagina)
  const n = normalizar(nombre)
  const a = normalizar(anime)
  return t.includes(`${n} ${a}`) || t.includes(`${a} ${n}`)
}

/**
 * Busca la imagen de un personaje en Wikipedia.
 * Devuelve la URL de la imagen o null si no hay ninguna.
 */
export async function buscarImagenWikipedia(nombre, anime) {
  const titulo = String(nombre || '').trim()
  if (!titulo) return null

  const candidatos = []
  const palabras = encodeURIComponent(titulo)
  const consultaAnime = anime ? `${titulo} ${anime}` : ''
  const consultas = [
    `generator=search&gsrnamespace=0&gsrlimit=6&gsrsearch=${palabras}`,
    `titles=${palabras}`,
  ]
  if (consultaAnime) {
    const enc = encodeURIComponent(consultaAnime)
    consultas.unshift(`generator=search&gsrnamespace=0&gsrlimit=6&gsrsearch=${enc}`)
  }

  for (const wiki of WIKIS) {
    for (const params of consultas) {
      try {
        const paginas = await consultarWiki(wiki, params)
        for (const pagina of paginas) {
          const src = pagina.original?.source || pagina.thumbnail?.source
          if (!src || !pareceRetrato(src)) continue
          if (!tituloDePersonaje(pagina?.title, titulo, anime)) continue
          candidatos.push({
            url: limpiarUrl(src),
            puntos: puntuarCandidato(titulo, pagina, src, wiki),
          })
        }
      } catch (err) {
        console.error(`[imagenes] fallo al buscar "${titulo}" en ${wiki}:`, err.message)
      }

      // No bombardear la API de Wikimedia
      await esperar(ESPERA_API)

      // Si ya hay candidatos válidos no hace falta seguir con este wiki
      if (candidatos.length) break
    }

    if (candidatos.length) break
  }

  if (!candidatos.length) return null

  candidatos.sort((a, b) => b.puntos - a.puntos)
  return candidatos[0].url
}

/**
 * Busca la imagen de un personaje en internet (DuckDuckGo Images).
 * Devuelve una lista de URLs candidatas, de la mas prometida a la menos,
 * para poder probar mas de una si la primera falla al descargarse.
 */
export async function buscarImagenesInternet(nombre, anime) {
  const titulo = String(nombre || '').trim()
  if (!titulo) return []

  const consultas = anime ? [`${titulo} ${anime} anime`, `${titulo} ${anime}`] : [titulo]
  const candidatas = []
  const vistas = new Set()

  for (const consulta of consultas) {
    let resultados = []
    try {
      resultados = await buscarImagenes(consulta, 12)
    } catch (err) {
      console.error(`[imagenes] fallo al buscar "${titulo}" en internet:`, err.message)
      continue
    }

    for (const resultado of resultados) {
      if (!resultado.url) continue
      if (!pareceRetrato(resultado.url)) continue
      if (vistas.has(resultado.url)) continue

      // El titulo debe mencionar al personaje para evitar imagenes que no son suyas
      const texto = normalizar(`${resultado.titulo} ${decodeURIComponent(resultado.url)}`)
      if (!texto.includes(normalizar(titulo))) continue

      // Se descartan las imagenes demasiado pequenas
      if (resultado.ancho && resultado.ancho < 400) continue

      vistas.add(resultado.url)
      candidatas.push(resultado.url)
    }
  }

  return candidatas
}

/**
 * Busca la imagen de un personaje en internet (DuckDuckGo Images).
 * Devuelve la URL de la imagen o null si no hay ninguna valida.
 */
export async function buscarImagenInternet(nombre, anime) {
  const candidatas = await buscarImagenesInternet(nombre, anime)
  return candidatas[0] || null
}

/**
 * Descarga una imagen y la normaliza a PNG (WhatsApp no acepta SVG).
 * Reintenta con otras cabeceras si el servidor responde 403: algunos CDNs
 * bloquean el User-Agent del bot o el Referer de Wikipedia.
 */
export async function descargarComoPng(url) {
  let ultimoError = null

  for (const headers of CABECERAS_DESCARGA) {
    try {
      const res = await fetch(url, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT),
      })

      if (!res.ok) {
        ultimoError = new Error(`HTTP ${res.status}`)
        // Un 403 se puede deber a las cabeceras: se prueba con las siguientes
        if (res.status === 403) continue
        throw ultimoError
      }

      const buffer = Buffer.from(await res.arrayBuffer())
      if (buffer.length < 500) throw new Error('respuesta vacia')

      return await sharp(buffer)
        .resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer()
    } catch (err) {
      ultimoError = err
    }
  }

  throw ultimoError || new Error('no se pudo descargar la imagen')
}

/**
 * Carta generada por el bot para los personajes sin foto.
 * Incluye el nombre, el anime y el color de su rareza.
 */
export function svgCartaPersonaje(personaje) {
  const rareza = RAREZAS[personaje?.rareza] || RAREZAS.comun
  const color = `#${rareza.color.toString(16).padStart(6, '0')}`
  const nombre = escaparXml(personaje?.nombre || 'Desconocido')
  const anime = escaparXml(personaje?.anime || 'Anime desconocido')
  const etiqueta = escaparXml(rareza.etiqueta.toUpperCase())

  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#241b4d"/>
      <stop offset="100%" stop-color="#0b0518"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="36%" r="58%">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="600" height="800" fill="url(#bg)"/>
  <circle cx="300" cy="300" r="240" fill="url(#glow)"/>

  <rect x="24" y="24" width="552" height="752" rx="26" fill="none" stroke="${color}" stroke-width="5" opacity="0.85"/>
  <rect x="40" y="40" width="520" height="720" rx="18" fill="none" stroke="#f5b301" stroke-width="2" opacity="0.35"/>

  <!-- Silueta -->
  <g opacity="0.45" fill="#2f1a6b">
    <circle cx="300" cy="286" r="112"/>
    <path d="M176 520 C176 414 232 372 300 372 C368 372 424 414 424 520 Z"/>
  </g>

  <!-- Emblema -->
  <text x="300" y="352" font-size="210" font-family="Segoe UI, Arial, Helvetica, sans-serif"
        font-weight="700" fill="#f5b301" text-anchor="middle" opacity="0.85">?</text>

  <!-- Nombre -->
  <text x="300" y="596" font-size="42" font-family="Segoe UI, Arial, Helvetica, sans-serif"
        font-weight="700" fill="#ffffff" text-anchor="middle">${nombre}</text>
  <text x="300" y="644" font-size="26" font-family="Segoe UI, Arial, Helvetica, sans-serif"
        fill="#c4b5fd" text-anchor="middle">${anime}</text>

  <!-- Rareza -->
  <rect x="170" y="686" width="260" height="54" rx="27" fill="${color}" opacity="0.9"/>
  <text x="300" y="722" font-size="26" font-family="Segoe UI, Arial, Helvetica, sans-serif"
        font-weight="700" fill="#0b0518" text-anchor="middle">${etiqueta}</text>
</svg>`
}

/** Guarda un PNG en la cache de imagenes */
function guardarEnCache(archivo, buffer) {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true })
    fs.writeFileSync(archivo, buffer)
  } catch (err) {
    console.error('[imagenes] no se pudo cachear la imagen:', err.message)
  }
}

/**
 * Envia la imagen de un personaje junto a un pie de foto.
 * `obtenerImagenPersonaje` devuelve un Buffer, no una URL, asi que se usa
 * `image: <buffer>` (Baileys acepta Buffer o { url } de forma indistinta).
 *
 * @param {object} sock    socket de Baileys
 * @param {string} jid     chat destino
 * @param {object} msg     mensaje citado
 * @param {object} personaje
 * @param {string} texto   pie de foto
 */
export async function enviarCartaPersonaje(sock, jid, msg, personaje, texto) {
  try {
    const imagen = await obtenerImagenPersonaje(personaje)
    if (imagen) {
      await sock.sendMessage(jid, { image: imagen, caption: texto, quoted: msg })
      return true
    }
  } catch (err) {
    console.error('[imagenes] no se pudo enviar la carta del personaje:', err.message)
  }
  await sock.sendMessage(jid, { text: texto, quoted: msg })
  return false
}

/**
 * Devuelve el PNG (Buffer) de un personaje del gacha.
 * Siempre resuelve algo: foto de internet, URL manual o carta generada.
 *
 * La carta generada (la que lleva el "?") se cachea en un archivo aparte:
 * si se guardara en la ruta de la foto real, un fallo puntual de red dejaria
 * al personaje sin imagen para siempre.
 */
export async function obtenerImagenPersonaje(personaje, { forzar = false } = {}) {
  if (!personaje) return null

  const archivo = rutaImagenPersonaje(personaje)
  const cartaArchivo = rutaCartaPersonaje(personaje)

  // 0) Foto real ya cacheada
  if (!forzar && archivo && fs.existsSync(archivo)) {
    try {
      const buffer = fs.readFileSync(archivo)
      // Una carta vieja cacheada como foto no vale: se descarta y se busca la real
      if (!(await esCartaGenerada(buffer))) return buffer
      fs.rmSync(archivo, { force: true })
    } catch {
      // se regenera
    }
  }

  // 1) URL guardada en la base de datos
  if (personaje.imagen) {
    try {
      const png = await descargarComoPng(personaje.imagen)
      if (archivo) guardarEnCache(archivo, png)
      return png
    } catch (err) {
      console.error(`[imagenes] fallo al usar la URL de ${personaje.nombre}:`, err.message)
    }
  }

  // 1.b) Carta generada hace poco: se reutiliza sin volver a buscar por la red.
  //      Pasado REINTENTO_CARTA_MS se reintenta la busqueda de la foto real.
  if (!forzar && cartaArchivo && fs.existsSync(cartaArchivo)) {
    try {
      const edad = Date.now() - fs.statSync(cartaArchivo).mtimeMs
      if (edad < REINTENTO_CARTA_MS) return fs.readFileSync(cartaArchivo)
      fs.rmSync(cartaArchivo, { force: true })
    } catch {
      // se regenera
    }
  }

  // 2) AniList: la imagen oficial del personaje en su anime. Es la fuente
  //    mas fiable para este catalogo y no se ve afectada por bloqueos.
  //    Las demas fuentes solo se consultan si esta falla.
  const fuentes = [
    () => buscarEnAnilist(personaje.nombre, personaje.anime),
    // Candidatos de internet (DuckDuckGo Images). Se prueban varios porque
    // el primero puede estar bloqueado (403) aunque los demas funcionen.
    () => buscarImagenesInternet(personaje.nombre, personaje.anime),
    // Wikipedia (la imagen principal del articulo del personaje)
    () => buscarImagenWikipedia(personaje.nombre, personaje.anime),
    // Wikidata como plan B (imagen oficial P18 del personaje)
    () => buscarEnWikidata(personaje.nombre, personaje.anime),
  ]

  for (const buscar of fuentes) {
    let candidatas = []
    try {
      const resultado = await buscar()
      candidatas = Array.isArray(resultado) ? resultado : resultado ? [resultado] : []
    } catch (err) {
      console.error(`[imagenes] fallo al buscar la foto de ${personaje.nombre}:`, err.message)
      continue
    }

    for (const url of candidatas) {
      try {
        const png = await descargarComoPng(url)
        if (archivo) guardarEnCache(archivo, png)
        if (personaje.id) {
          try {
            setImagenPersonaje(personaje.id, url)
          } catch (err) {
            console.error('[imagenes] no se pudo guardar la URL:', err.message)
          }
        }
        return png
      } catch (err) {
        console.error(`[imagenes] fallo al descargar la foto de ${personaje.nombre}:`, err.message)
      }
    }
  }

  // 5) Carta generada por el bot (ultimo recurso). Se cachea aparte y
  //    caduca pronto para reintentar la busqueda de la foto real.
  try {
    const png = await sharp(Buffer.from(svgCartaPersonaje(personaje))).png().toBuffer()
    if (cartaArchivo) guardarEnCache(cartaArchivo, png)
    return png
  } catch (err) {
    console.error('[imagenes] no se pudo generar la carta:', err.message)
    return null
  }
}

