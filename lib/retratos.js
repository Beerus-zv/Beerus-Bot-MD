/**
 * Retratos de alta calidad para el gacha.
 *
 * El problema: AniList (y MAL/Shikimori/Kitsu) solo entregan retratos de
 * 230x345, que se ven borrosos y "genericos". Este modulo busca arte real
 * del personaje en dos fuentes con imagenes grandes:
 *
 *   1. Fandom: el arte oficial del anime en el wiki de la serie
 *      (MediaWiki API publica). Normalmente PNG de 700-1400 px.
 *   2. Busqueda de imagenes (DuckDuckGo): renders/PNG de 800-2000 px,
 *      con puntuacion para descartar cosplay, figuras, memes y fondos.
 *
 * Todo lo descargado se valida con sharp (ancho/alto y proporcion) para no
 * guardar miniaturas ni capturas de pantalla.
 */
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import { buscarImagenes } from './internet.js'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const TIMEOUT = 20000

/** Cache de anime -> subdominio del wiki de Fandom (null = no hay wiki) */
const CACHE_WIKIS = path.resolve('data', 'fandom-wikis.json')

/** Un retrato debe medir al menos esto para considerarse "bueno" */
export const ANCHO_MINIMO_RETRATO = 500

/**
 * Medidas minimas de un retrato aceptable. Las miniaturas de AniList son
 * 230x345; se acepta algo mas ancho (400x400) o un cuerpo entero estrecho
 * (280x700) para no rechazar arte oficial valido del wiki.
 */
export function retratoAceptable(ancho, alto) {
  const w = Number(ancho) || 0
  const h = Number(alto) || 0
  if (w >= ANCHO_MINIMO_RETRATO && h >= 380) return true
  if (w >= 380 && h >= 380) return true
  if (w >= 280 && h >= 700) return true
  return false
}

/** Ancho maximo del PNG que se guarda en la cache */
const ANCHO_GUARDADO = 1000
const ALTO_GUARDADO = 1500

/** Wikis cuyo subdominio no coincide con el titulo del anime */
const ALIAS_WIKI = {
  'naruto shippuden': 'naruto',
  'shingeki no kyojin': 'attackontitan',
  'attack on titan': 'attackontitan',
  'boku no hero academia': 'myheroacademia',
  'my hero academia': 'myheroacademia',
  'kimetsu no yaiba': 'kimetsu-no-yaiba',
  'demon slayer': 'kimetsu-no-yaiba',
  'one punch man': 'onepunchman',
  'kono subarashii sekai ni shukufuku wo': 'konosuba',
  'konosuba': 'konosuba',
  'enen no shouboutai': 'fire-force',
  'ansatsu kyoushitsu': 'assassinationclassroom',
  'howl no ugoku shiro': 'howlsmovingcastle',
  'sousou no frieren': 'frieren',
  'kusuriya no hitorigoto': 'the-apothecary-diaries',
  'ore dake level up na ken': 'solo-leveling',
  'youkoso jitsuryoku shijou shugi no kyoushitsu e': 'you-zitsu',
  'yahari ore no seishun love come wa machigatteiru': 'oregairu',
  'shokugeki no souma': 'food-wars',
  'cyberpunk edgerunners': 'cyberpunk',
  'tengen toppa gurren lagann': 'gurrenlagann',
  'mushoku tensei isekai ittara honki dasu': 'mushokutensei',
  'fate zero': 'fate',
  'bocchi the rock': 'bocchi-the-rock',
  'the saga of tanya the evil': 'youjo-senki',
  'that time i got reincarnated as a slime': 'that-time-i-got-reincarnated-as-a-slime',
  'rascal does not dream': 'seishun-buta-yarou',
  'a certain scientific railgun': 'toarumajutsunoindex',
  'a certain magical index': 'toarumajutsunoindex',
  'rezero kara hajimeru isekai seikatsu': 'rezero',
  're zero kara hajimeru isekai seikatsu': 'rezero',
  're zero': 'rezero',
  'rezero': 'rezero',
  'kaguya sama wa kokurasetai tensaitachi no renai zunousen': 'kaguyasama-wa-kokurasetai-tensaitachi-no-renai-zunousen',
  'go toubun no hanayome': 'go-toubun-no-hanayome',
  'bungou stray dogs': 'bungo-stray-dogs',
  'monster': 'monster',
  'trigun': 'trigun',
  'nana': 'nana',
  'gto': 'gto',
  'spongebob': 'spongebob',
  'steven universe': 'steven-universe',
  'arcane': 'arcane',
  'pokemon': 'pokemon',
}

/** Palabras que delatan una imagen que no es un retrato del personaje */
const SOSPECHOSAS = [
  'cosplay',
  'cosplayer',
  'figure',
  'figura',
  'statue',
  'estatua',
  'funko',
  'plush',
  'peluche',
  'tattoo',
  'tatuaje',
  'cake',
  'torta',
  'tarta',
  'mug',
  'taza',
  'shirt',
  'camiseta',
  'hoodie',
  'wallpaper',
  'fondo de pantalla',
  '4k',
  '8k',
  'desktop',
  'icon',
  'avatar',
  'logo',
  'meme',
  'comic',
  'crossover',
  'group',
  'amv',
  'thumbnail',
  'youtube',
  'pinterest pin',
]

/** Dominios con arte limpio y grande (suben puntos) */
const DOMINIOS_BUENOS = [
  'static.wikia.nocookie.net',
  'static.zerochan.net',
  's4.anilist.co',
  'cdn.myanimelist.net',
  'pnganime.com',
  'anime-colors.com',
  'images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com',
]

/** Normaliza texto para comparar (sin acentos, sin simbolos) */
export function normalizar(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Espera ms milisegundos */
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** fetch JSON con timeout y User-Agent de navegador */
async function pedirJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (!(res.headers.get('content-type') || '').includes('json')) throw new Error('respuesta no JSON')
  return res.json()
}

/* ─────────────────────────── Fandom ─────────────────────────── */

let wikisCache = null

function cargarWikis() {
  if (wikisCache) return wikisCache
  try {
    wikisCache = JSON.parse(fs.readFileSync(CACHE_WIKIS, 'utf8'))
  } catch {
    wikisCache = {}
  }
  if (!wikisCache || typeof wikisCache !== 'object' || Array.isArray(wikisCache)) wikisCache = {}
  return wikisCache
}

function guardarWikis() {
  try {
    const dir = path.dirname(CACHE_WIKIS)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(CACHE_WIKIS, JSON.stringify(wikisCache, null, 2))
  } catch {
    // el cache es opcional
  }
}

/** Tiempo que se recuerda que un anime no tiene wiki (luego se reintenta) */
const CACHE_FALLO_MS = 24 * 60 * 60 * 1000

/** Lee el wiki cacheado: string = slug, null = no hay (reciente), undefined = buscar */
function leerWikiCache(clave) {
  const cache = cargarWikis()
  if (!Object.prototype.hasOwnProperty.call(cache, clave)) return undefined
  const valor = cache[clave]
  if (typeof valor === 'string') return valor || null
  if (valor && typeof valor === 'object') {
    if (valor.slug) return String(valor.slug)
    if (Date.now() - Number(valor.ts || 0) < CACHE_FALLO_MS) return null
    return undefined
  }
  return undefined
}

function escribirWikiCache(clave, slug) {
  const cache = cargarWikis()
  cache[clave] = { slug: slug || null, ts: Date.now() }
  guardarWikis()
}

/** Quita sufijos de temporada/OVA para adivinar el wiki base */
function limpiarAnime(texto) {
  return normalizar(texto)
    .replace(/\b(\d+(st|nd|rd|th)|first|second|third|fourth|final)\s+season\b/g, ' ')
    .replace(/\bseason\s+\d+\b/g, ' ')
    .replace(/\b(ova|oad|tv|movie|pelicula|special|especial)\b/g, ' ')
    .replace(/\bpart\s+\d+\b/g, ' ')
    .replace(/\s+\d+$/, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b(the|a|an)$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Genera los subdominios candidatos de Fandom para un anime.
 * Se prueban variantes con y sin guiones, sin sufijos de temporada y
 * prefijos (Shingeki no Kyojin: The Final Season -> Shingeki no Kyojin).
 */
export function candidatosWiki(anime) {
  const base = normalizar(anime)
  if (!base) return []

  const limpio = limpiarAnime(anime)
  const tokens = limpio.split(' ').filter(Boolean)
  const textos = new Set([base, limpio])

  // Prefijos: el titulo sin la temporada/arco final
  for (let n = Math.min(5, tokens.length - 1); n >= 2; n--) {
    textos.add(tokens.slice(0, n).join(' '))
  }

  // Alias conocidos (romaji -> subdominio real)
  const alias = ALIAS_WIKI[base] || ALIAS_WIKI[limpio]
  const candidatos = []
  if (alias) candidatos.push(alias)

  for (const texto of textos) {
    if (!texto) continue
    candidatos.push(texto.replace(/\s+/g, ''))
    candidatos.push(texto.replace(/\s+/g, '-'))
  }

  return [...new Set(candidatos)].filter((s) => s.length >= 2 && s.length <= 48).slice(0, 14)
}

/** True si el wiki existe (siteinfo responde con sitename) */
async function wikiExiste(slug) {
  try {
    const datos = await pedirJson(
      `https://${slug}.fandom.com/api.php?action=query&meta=siteinfo&format=json&siprop=general`
    )
    return Boolean(datos?.query?.general?.sitename)
  } catch {
    return false
  }
}

/** Devuelve el subdominio del wiki del anime, o null si no existe */
export async function wikiDelAnime(anime) {
  const clave = normalizar(anime)
  if (!clave) return null

  const cacheado = leerWikiCache(clave)
  if (cacheado !== undefined) return cacheado

  for (const slug of candidatosWiki(anime)) {
    if (await wikiExiste(slug)) {
      escribirWikiCache(clave, slug)
      return slug
    }
    await esperar(150)
  }

  escribirWikiCache(clave, null)
  return null
}

/** Distancia de Levenshtein compacta (para variantes de romanizacion) */
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

/** Esqueleto consonantico: Braus / Blouse -> brs / bls */
function esqueleto(texto) {
  return normalizar(texto).replace(/[^a-z0-9]/g, '').replace(/[aeiou]/g, '')
}

/** True si dos nombres son la misma persona (sin importar el orden) */
function mismoNombre(a, b) {
  const ta = normalizar(a).split(' ').filter(Boolean)
  const tb = new Set(normalizar(b).split(' ').filter(Boolean))
  if (!ta.length || !tb.size) return false
  if (ta.every((t) => tb.has(t))) return true

  const listaB = [...tb]
  const unidoA = ta.join('')
  const unidoB = listaB.join('')

  // Variantes de romanizacion: Shihouin / Shihōin, Gojou / Gojo
  if (unidoA === unidoB) return true
  const corto = Math.min(unidoA.length, unidoB.length)
  if (corto >= 6 && levenshtein(unidoA, unidoB) <= 2) return true

  // Mismo nombre de pila y apellido que suena igual: Sasha Braus / Blouse
  if (ta.length > 1 && listaB.length > 1 && ta[0] === listaB[0]) {
    const apellidoA = ta[ta.length - 1]
    const apellidoB = listaB[listaB.length - 1]
    if (apellidoA.length >= 4 && apellidoB.length >= 4) {
      if (levenshtein(apellidoA, apellidoB) <= 1) return true
      if (levenshtein(esqueleto(apellidoA), esqueleto(apellidoB)) <= 1) return true
    }
  }

  // Nombre de pila casi igual y apellido identico: Rei / Reina Ayanami
  if (ta.length > 1 && listaB.length > 1) {
    const apellidoA = ta[ta.length - 1]
    const apellidoB = listaB[listaB.length - 1]
    const nombreA = ta[0]
    const nombreB = listaB[0]
    if (apellidoA === apellidoB && nombreA.length >= 3 && nombreB.length >= 3) {
      if (levenshtein(nombreA, nombreB) <= 2) return true
    }
  }

  return false
}

/** Busca el titulo real de la ficha del personaje en el wiki */
async function tituloFandom(slug, nombre) {
  try {
    const datos = await pedirJson(
      `https://${slug}.fandom.com/api.php?action=query&format=json&formatversion=2` +
        `&list=search&srlimit=5&srsearch=${encodeURIComponent(nombre)}`
    )
    const resultados = datos?.query?.search || []
    const elegido = resultados.find((r) => mismoNombre(r.title, nombre))
    return elegido?.title || null
  } catch {
    return null
  }
}

/**
 * Lee la imagen del infobox de la ficha (el retrato oficial del personaje).
 * Es el plan B cuando pageimages no devuelve nada (wikis con pestañas).
 */
async function retratoFandomFicha(slug, titulo) {
  let datos = null
  try {
    datos = await pedirJson(
      `https://${slug}.fandom.com/api.php?action=parse&format=json&formatversion=2` +
        `&prop=text&page=${encodeURIComponent(titulo)}`
    )
  } catch {
    return null
  }

  const html = datos?.parse?.text || ''
  const coincidencia = html.match(/<figure[^>]*pi-image[\s\S]{0,3000}?<img[^>]+src="([^"]+)"/)
  if (!coincidencia) return null

  // La URL viene con /scale-to-width-down/<px>: se quita para pedir el original
  const url = coincidencia[1]
    .replace(/&amp;/g, '&')
    .replace(/\/scale-to-width-down\/\d+/, '')

  if (!/^https?:\/\/static\.wikia\.nocookie\.net\//i.test(url)) return null
  return { url, ancho: 0, alto: 0, titulo, fuente: 'Fandom' }
}

/** Archivos que nunca son el retrato del personaje */
const ARCHIVOS_RUIDO =
  /(media icon|quote\d?|logo|flag|button|site-logo|spoiler|question|symbol|icon|nav|wiki|favicon)/i

/**
 * Plan B de Fandom: la ficha del personaje no tiene imagen principal
 * (algunos wikis usan pestañas), asi que se busca en sus archivos uno cuyo
 * nombre sea el del personaje y se elige el mas grande.
 */
async function retratoFandomArchivos(slug, nombre) {
  let datos = null
  try {
    datos = await pedirJson(
      `https://${slug}.fandom.com/api.php?action=query&format=json&formatversion=2` +
        `&prop=images&imlimit=100&titles=${encodeURIComponent(nombre)}`
    )
  } catch {
    return null
  }

  const pagina = datos?.query?.pages?.[0]
  if (!pagina || pagina.missing) return null

  const palabras = normalizar(nombre).split(' ').filter((p) => p.length > 2)
  const archivos = (pagina.images || [])
    .map((i) => i.title)
    .filter((titulo) => {
      const texto = normalizar(titulo)
      if (ARCHIVOS_RUIDO.test(texto)) return false
      const encontradas = palabras.filter((p) => texto.includes(p)).length
      return encontradas === palabras.length
    })
    .slice(0, 12)

  if (!archivos.length) return null

  let info = null
  try {
    info = await pedirJson(
      `https://${slug}.fandom.com/api.php?action=query&format=json&formatversion=2` +
        `&prop=imageinfo&iiprop=url%7Csize&titles=${encodeURIComponent(archivos.join('|'))}`
    )
  } catch {
    return null
  }

  const candidatos = []
  for (const paginaArchivo of info?.query?.pages || []) {
    const imagen = paginaArchivo?.imageinfo?.[0]
    if (!imagen?.url) continue
    const ancho = Number(imagen.width) || 0
    const alto = Number(imagen.height) || 0
    if (ancho < 350 || alto < 350) continue
    const proporcion = alto / ancho
    if (proporcion < 0.45 || proporcion > 4) continue
    candidatos.push({ url: imagen.url, ancho, alto })
  }

  if (!candidatos.length) return null

  // Se prefiere el retrato vertical mas grande (ficha del personaje)
  candidatos.sort((a, b) => {
    const pa = a.alto / a.ancho
    const pb = b.alto / b.ancho
    const verticalA = pa >= 0.9 && pa <= 2.4 ? 1 : 0
    const verticalB = pb >= 0.9 && pb <= 2.4 ? 1 : 0
    if (verticalA !== verticalB) return verticalB - verticalA
    return b.ancho * b.alto - a.ancho * a.alto
  })

  return { url: candidatos[0].url, ancho: candidatos[0].ancho, alto: candidatos[0].alto, titulo: nombre, fuente: 'Fandom' }
}

/** Busca el retrato oficial del personaje en el wiki de su anime */
export async function retratoFandom(nombre, anime) {
  const slug = await wikiDelAnime(anime)
  if (!slug) return null

  const titulos = [nombre, `${nombre} (Anime)`, `${nombre} (anime)`]
  const vistos = new Set()

  for (const titulo of titulos) {
    if (!titulo || vistos.has(titulo)) continue
    vistos.add(titulo)

    let datos = null
    try {
      datos = await pedirJson(
        `https://${slug}.fandom.com/api.php?action=query&format=json&formatversion=2` +
          `&redirects=1&prop=pageimages&piprop=original&titles=${encodeURIComponent(titulo)}`
      )
    } catch {
      continue
    }

    const pagina = datos?.query?.pages?.[0]
    if (!pagina || pagina.missing || !pagina.original?.source) continue
    if (!mismoNombre(pagina.title, nombre)) continue

    const ancho = Number(pagina.original.width) || 0
    const alto = Number(pagina.original.height) || 0
    if (ancho < 350 || alto < 350) continue

    return {
      url: pagina.original.source,
      ancho,
      alto,
      titulo: pagina.title,
      fuente: 'Fandom',
    }
  }

  // Sin imagen principal: se busca la ficha por texto (cubre variantes con
  // acentos o el nombre al reves), se lee su infobox y, si no, sus archivos.
  try {
    const titulo = await tituloFandom(slug, nombre)
    if (titulo) {
      const ficha = await retratoFandomFicha(slug, titulo)
      if (ficha) return ficha

      const archivos = await retratoFandomArchivos(slug, titulo)
      if (archivos) return archivos
    }
  } catch {
    // sin resultados de busqueda
  }

  try {
    return await retratoFandomArchivos(slug, nombre)
  } catch {
    return null
  }
}

/* ───────────────────── Busqueda de imagenes ───────────────────── */

/** Puntua un resultado de busqueda de imagenes para elegir el mejor retrato */
export function puntuarRetrato(nombre, anime, resultado) {
  const url = String(resultado?.url || '')
  if (!url) return -Infinity

  const ancho = Number(resultado.ancho) || 0
  const alto = Number(resultado.alto) || 0
  if (ancho && ancho < ANCHO_MINIMO_RETRATO) return -Infinity

  let texto = ''
  try {
    texto = normalizar(`${resultado.titulo || ''} ${decodeURIComponent(url)}`)
  } catch {
    texto = normalizar(`${resultado.titulo || ''} ${url}`)
  }

  const palabras = normalizar(nombre).split(' ').filter(Boolean)
  if (!palabras.length) return -Infinity

  const encontradas = palabras.filter((p) => texto.includes(p)).length
  // El nombre del personaje debe aparecer completo: evita fotos de otros
  if (encontradas < palabras.length) return -Infinity

  let puntos = 100
  if (palabras.length > 1) puntos += 10

  const palabrasAnime = normalizar(anime).split(' ').filter((p) => p.length > 3)
  if (palabrasAnime.length) {
    const coincide = palabrasAnime.filter((p) => texto.includes(p)).length
    puntos += Math.round((coincide / palabrasAnime.length) * 30)
  }

  try {
    const host = new URL(url).hostname
    if (DOMINIOS_BUENOS.includes(host)) puntos += 25
  } catch {
    // sin host valido: se descarta mas abajo si no se puede descargar
  }

  if (ancho >= 800 && alto >= 800) puntos += 20
  else if (ancho >= 600 && alto >= 600) puntos += 10

  const proporcion = alto && ancho ? alto / ancho : 0
  // Retrato vertical: lo ideal para una carta
  if (proporcion >= 0.9 && proporcion <= 2.2) puntos += 15
  else if (proporcion > 0.45 && proporcion < 3.4) puntos += 5
  else puntos -= 30

  if (SOSPECHOSAS.some((p) => texto.includes(p))) puntos -= 200

  return puntos
}

/** Busca retratos grandes en la busqueda de imagenes y los ordena por calidad */
export async function retratosInternet(nombre, anime, limite = 6) {
  const consultas = [
    `${nombre} ${anime}`.trim() + ' png',
    `${nombre} ${anime}`.trim() + ' render',
    `${nombre} png`,
  ]

  const candidatos = []
  const vistos = new Set()

  for (const consulta of consultas.slice(0, 2)) {
    let resultados = []
    try {
      resultados = await buscarImagenes(consulta, 15)
    } catch {
      // DuckDuckGo limita las peticiones: se prueba la siguiente consulta
      await esperar(1500)
      continue
    }

    for (const resultado of resultados) {
      if (!resultado?.url || vistos.has(resultado.url)) continue
      vistos.add(resultado.url)
      const puntos = puntuarRetrato(nombre, anime, resultado)
      if (!Number.isFinite(puntos)) continue
      candidatos.push({ ...resultado, puntos })
    }

    if (candidatos.length >= limite * 2) break
    await esperar(900)
  }

  candidatos.sort((a, b) => b.puntos - a.puntos)
  return candidatos.slice(0, limite)
}

/* ─────────────────────── Descarga y validacion ─────────────────────── */

const CABECERAS = [
  { 'User-Agent': UA, Referer: 'https://www.google.com/' },
  { 'User-Agent': UA, Referer: 'https://www.fandom.com/' },
  { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
]

/**
 * Descarga un retrato, comprueba que sea una imagen grande y lo normaliza.
 * @returns {Promise<{buffer:Buffer, ancho:number, alto:number, alpha:boolean}>}
 */
export async function descargarRetrato(url) {
  let ultimoError = null

  for (const cabeceras of CABECERAS) {
    try {
      const res = await fetch(url, {
        headers: cabeceras,
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT),
      })
      if (!res.ok) {
        ultimoError = new Error(`HTTP ${res.status}`)
        continue
      }

      const tipo = res.headers.get('content-type') || ''
      if (!tipo.startsWith('image/')) throw new Error(`no es imagen (${tipo || 'sin tipo'})`)

      const original = Buffer.from(await res.arrayBuffer())
      if (original.length < 1500) throw new Error('imagen vacia')

      const meta = await sharp(original, { failOn: 'none' }).metadata()
      if (!meta.width || !meta.height) throw new Error('imagen ilegible')

      if (!retratoAceptable(meta.width, meta.height)) {
        throw new Error(`muy pequena (${meta.width}x${meta.height})`)
      }
      const proporcion = meta.height / meta.width
      if (proporcion < 0.45 || proporcion > 4) throw new Error(`proporcion rara (${proporcion.toFixed(2)})`)

      const buffer = await sharp(original, { failOn: 'none' })
        .rotate()
        .resize({ width: ANCHO_GUARDADO, height: ALTO_GUARDADO, fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer()

      return { buffer, ancho: meta.width, alto: meta.height, alpha: Boolean(meta.hasAlpha) }
    } catch (err) {
      ultimoError = err
    }
  }

  throw ultimoError || new Error('no se pudo descargar el retrato')
}

/**
 * Consigue un retrato de alta calidad para un personaje.
 * Orden: Fandom (arte oficial) -> busqueda de imagenes.
 *
 * @returns {Promise<{buffer:Buffer, url:string, fuente:string}|null>}
 */
export async function buscarRetrato(nombre, anime) {
  const titulo = String(nombre || '').trim()
  if (!titulo) return null

  // 1) Fandom: arte oficial de la serie
  try {
    const fandom = await retratoFandom(titulo, anime)
    if (fandom) {
      const descarga = await descargarRetrato(fandom.url)
      return { buffer: descarga.buffer, url: fandom.url, fuente: 'Fandom' }
    }
  } catch {
    // sin wiki o sin red: se sigue con la busqueda general
  }

  // 2) Busqueda de imagenes: renders y PNG grandes
  try {
    const candidatos = await retratosInternet(titulo, anime)
    for (const candidato of candidatos) {
      try {
        const descarga = await descargarRetrato(candidato.url)
        return { buffer: descarga.buffer, url: candidato.url, fuente: 'Busqueda' }
      } catch {
        // se prueba el siguiente candidato
      }
    }
  } catch {
    // sin red
  }

  return null
}
