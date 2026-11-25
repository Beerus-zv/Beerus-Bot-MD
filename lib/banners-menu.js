/**
 * Banners del menu tomados de internet.
 *
 * El menu no usa una sola portada: descarga arte de Beerus de la busqueda de
 * imagenes (Bing, con DuckDuckGo de respaldo), lo recorta a 900x600 y le
 * escribe encima el titulo del bot. Cada banner se guarda en data/banners/
 * con su URL de origen y un catalogo en JSON.
 *
 * obtenerBannerMenu() devuelve uno al azar distinto del anterior. Si la
 * cache esta vacia descarga un par antes de responder; si hay pocos, repone
 * mas en segundo plano para no hacer esperar al menu.
 *
 * Sin internet el menu sigue funcionando: usa el arte del proyecto
 * (assets/beerus-banner.png) con el mismo marco y titulo.
 */
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import { BANNER_LOCAL } from '../config.js'
import { buscarImagenes } from './internet.js'
import { log } from './logger.js'

/** Medidas del banner que se manda por WhatsApp */
export const ANCHO_BANNER = 900
export const ALTO_BANNER = 600

/** Carpeta de cache (data/ esta fuera del control de versiones) */
export const DIR_BANNERS = path.resolve('data', 'banners')
const CATALOGO = path.join(DIR_BANNERS, 'catalogo.json')

/** Cuantos banners se mantienen listos y cuantos como maximo */
export const MINIMO_BANNERS = 5
export const MAXIMO_BANNERS = 16

/** Consultas de busqueda: cada una aporta imagenes distintas */
export const CONSULTAS_BANNERS = [
  'Beerus Dragon Ball Super wallpaper',
  'Beerus hakai wallpaper',
  'Beerus dios de la destruccion 4k',
  'Beerus render png',
  'Beerus god of destruction art',
  'Beerus Dragon Ball Super anime',
  'Beerus y Whis wallpaper',
  'Beerus amoled wallpaper',
]

/** Paletas del marco y del titulo (se eligen por hash de la URL) */
const ACENTOS = [
  { nombre: 'oro', color: '#f5b301', claro: '#fde68a' },
  { nombre: 'ambar', color: '#f59e0b', claro: '#fef3c7' },
  { nombre: 'cian', color: '#22d3ee', claro: '#cffafe' },
  { nombre: 'magenta', color: '#ff3d7f', claro: '#ffd1e6' },
  { nombre: 'violeta', color: '#a78bfa', claro: '#ede9fe' },
]

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Normaliza texto para comparar (minusculas, sin acentos ni simbolos) */
export function normalizar(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Hash estable y corto para nombrar el archivo de cada banner */
function hashId(texto) {
  let hash = 5381
  for (let i = 0; i < texto.length; i++) hash = ((hash << 5) + hash + texto.charCodeAt(i)) >>> 0
  return hash.toString(16).padStart(8, '0')
}

/** Palabras que delatan una imagen que no sirve como banner */
const RUIDO =
  /(cosplay|cosplayer|figure|figura|figurine|funko|toy|juguete|statue|estatua|tattoo|tatuaje|cake|torta|mug|taza|shirt|camiseta|hoodie|plush|peluche|sticker|logo|icon|avatar|meme|comic|crossover|amv|thumbnail|live wallpaper|wallpaper engine|coloring|dibujo para colorear)/

/**
 * True si el candidato parece arte de Beerus y no una foto de mercancia.
 * Se usa antes de descargar para no gastar ancho de banda.
 */
export function candidatoAceptable(candidato) {
  const titulo = String(candidato?.titulo || '')
  const url = String(candidato?.url || '')
  if (!url || /\.gif(\?|$)/i.test(url)) return false

  const texto = normalizar(`${titulo} ${url}`)
  if (!/(beerus|bills)/.test(texto)) return false
  if (RUIDO.test(texto)) return false
  return true
}

/** Puntua un candidato segun el titulo y el sitio de origen */
export function puntuarCandidato(candidato) {
  if (!candidatoAceptable(candidato)) return -Infinity

  const texto = normalizar(`${candidato.titulo || ''} ${candidato.url || ''}`)
  let puntos = 100

  if (texto.includes('render')) puntos += 14
  if (texto.includes('png')) puntos += 8
  if (texto.includes('hakai')) puntos += 10
  if (texto.includes('wallpaper')) puntos += 8
  if (texto.includes('4k') || texto.includes('8k')) puntos += 6
  if (texto.includes('artstation') || texto.includes('deviantart')) puntos += 8
  if (texto.includes('official') || texto.includes('oficial')) puntos += 6
  if (texto.includes('whis') || texto.includes('goku') || texto.includes('vegeta')) puntos -= 12
  if (texto.includes('pinterest')) puntos -= 10

  return puntos
}

/** Medidas minimas para que el recorte a 900x600 no quede borroso */
export function medidasAceptables(ancho, alto) {
  const w = Number(ancho) || 0
  const h = Number(alto) || 0
  if (w < 800 || h < 450) return false
  const proporcion = h / w
  return proporcion >= 0.55 && proporcion <= 1.85
}

/* ───────────────────── Busqueda de imagenes ───────────────────── */

/** Descarga la pagina de resultados de Bing y devuelve los candidatos */
async function candidatosBing(consulta) {
  const url =
    'https://www.bing.com/images/async?q=' +
    encodeURIComponent(consulta) +
    '&first=1&count=35&adlt=strict&qft=+filterui:imagesize-large'

  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`Bing HTTP ${res.status}`)

  const html = await res.text()
  const urls = [...html.matchAll(/murl&quot;:&quot;(.*?)&quot;/g)].map((m) =>
    m[1].replace(/&amp;/g, '&')
  )
  const titulos = [...html.matchAll(/t&quot;:&quot;(.*?)&quot;/g)].map((m) => m[1])
  return urls.map((u, i) => ({ url: u, titulo: titulos[i] || '' }))
}

/** DuckDuckGo como plan B cuando Bing no responde */
async function candidatosDuckDuckGo(consulta) {
  const resultados = await buscarImagenes(consulta, 25)
  return resultados.map((r) => ({
    url: r.url,
    titulo: r.titulo || '',
    ancho: r.ancho,
    alto: r.alto,
  }))
}

/**
 * Junta candidatos de varias consultas, sin repetir URL y ordenados por
 * puntuacion. Si Bing falla, cae a DuckDuckGo.
 */
export async function recolectarCandidatos({ limite = 60 } = {}) {
  const vistos = new Set()
  const candidatos = []
  let bingOk = 0

  for (const consulta of CONSULTAS_BANNERS) {
    let encontrados = []
    try {
      encontrados = await candidatosBing(consulta)
      bingOk++
    } catch (err) {
      log.error(`banners · Bing fallo para "${consulta}"`, err.message)
    }

    for (const candidato of encontrados) {
      if (!candidato.url || vistos.has(candidato.url)) continue
      vistos.add(candidato.url)
      const puntos = puntuarCandidato(candidato)
      if (!Number.isFinite(puntos)) continue
      candidatos.push({ ...candidato, fuente: 'Bing', puntos })
    }

    if (candidatos.length >= limite) break
    await esperar(250)
  }

  // Sin resultados de Bing: se prueba el buscador de imagenes de DuckDuckGo
  if (bingOk === 0) {
    for (const consulta of CONSULTAS_BANNERS.slice(0, 2)) {
      try {
        const encontrados = await candidatosDuckDuckGo(consulta)
        for (const candidato of encontrados) {
          if (!candidato.url || vistos.has(candidato.url)) continue
          vistos.add(candidato.url)
          const puntos = puntuarCandidato(candidato)
          if (!Number.isFinite(puntos)) continue
          candidatos.push({ ...candidato, fuente: 'DuckDuckGo', puntos })
        }
      } catch (err) {
        log.error('banners · DuckDuckGo fallo', err.message)
      }
    }
  }

  candidatos.sort((a, b) => b.puntos - a.puntos)
  return candidatos.slice(0, limite)
}

/* ───────────────────── Huella de la imagen ───────────────────── */

/**
 * Huella perceptual de una imagen (dHash de 64 bits).
 * Sirve para no guardar dos veces el mismo wallpaper bajado de sitios
 * distintos: la URL cambia, el dibujo no.
 *
 * @returns {Promise<string>} 64 caracteres "0"/"1"
 */
export async function huellaImagen(buffer) {
  const { data } = await sharp(buffer, { failOn: 'none' })
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  let bits = ''
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits += data[y * 9 + x] < data[y * 9 + x + 1] ? '1' : '0'
    }
  }
  return bits
}

/** Cuantos bits cambian entre dos huellas (0 = misma imagen) */
export function distanciaHuellas(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a.length || a.length !== b.length) return 64
  let distancia = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) distancia++
  return distancia
}

/** True si las dos huellas son practicamente la misma imagen */
export function imagenesParecidas(a, b, umbral = 8) {
  return distanciaHuellas(a, b) <= umbral
}

/* ───────────────────── Descarga y composicion ───────────────────── */

/** Descarga una imagen y valida que sirva para el recorte */
async function descargarImagen(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://www.bing.com/' },
    redirect: 'follow',
    signal: AbortSignal.timeout(25000),
  })
  if (!res.ok) return null

  const tipo = res.headers.get('content-type') || ''
  if (!tipo.startsWith('image/')) return null

  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.length < 20000 || buffer.length > 15 * 1024 * 1024) return null

  const meta = await sharp(buffer, { failOn: 'none' }).metadata()
  if (!meta.width || !meta.height) return null
  if (!medidasAceptables(meta.width, meta.height)) return null

  return { buffer, ancho: meta.width, alto: meta.height }
}

/** SVG con el velo, el marco y el titulo que se escribe sobre la imagen */
function svgCapa(acento) {
  const W = ANCHO_BANNER
  const H = ALTO_BANNER
  const titulo = 'BEERUS'
  const subtitulo = 'BOT MD · DIOS DE LA DESTRUCCION'
  const d = 15
  const f = 25

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="velo" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="#05030a" stop-opacity="0.9"/>
      <stop offset="38%" stop-color="#05030a" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="#05030a" stop-opacity="0.05"/>
    </linearGradient>
    <radialGradient id="vineta" cx="50%" cy="42%" r="74%">
      <stop offset="52%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.55"/>
    </radialGradient>
    <linearGradient id="texto" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${acento.claro}"/>
      <stop offset="55%" stop-color="${acento.color}"/>
      <stop offset="100%" stop-color="${acento.claro}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#vineta)"/>
  <rect width="${W}" height="${H}" fill="url(#velo)"/>
  <g fill="none">
    <rect x="${d}" y="${d}" width="${W - d * 2}" height="${H - d * 2}" rx="16" stroke="${acento.color}" stroke-width="3" opacity="0.55"/>
    <rect x="${f}" y="${f}" width="${W - f * 2}" height="${H - f * 2}" rx="10" stroke="${acento.claro}" stroke-width="1.4" opacity="0.28"/>
  </g>
  <g fill="${acento.color}" opacity="0.75">
    <path d="M64 15 L74 25 L64 35 L54 25 Z"/>
    <path d="M836 15 L846 25 L836 35 L826 25 Z"/>
    <path d="M64 565 L74 575 L64 585 L54 575 Z"/>
    <path d="M836 565 L846 575 L836 585 L826 575 Z"/>
  </g>
  <g font-family="Segoe UI, Trebuchet MS, Arial, sans-serif">
    <text x="51" y="529" font-size="86" font-weight="bold" letter-spacing="5" fill="#090310" opacity="0.78">${titulo}</text>
    <text x="48" y="526" font-size="86" font-weight="bold" letter-spacing="5" fill="url(#texto)">${titulo}</text>
    <text x="52" y="564" font-size="23" font-weight="bold" letter-spacing="4.2" fill="#f5f3ff" opacity="0.92">${subtitulo}</text>
    <rect x="48" y="576" width="312" height="3" fill="${acento.color}" opacity="0.55"/>
  </g>
</svg>`
}

/**
 * Recorta la imagen a 900x600 y le escribe el marco y el titulo.
 * @returns {Promise<Buffer>} JPEG
 */
export async function prepararBanner(buffer, acento = ACENTOS[0]) {
  const base = await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize(ANCHO_BANNER, ALTO_BANNER, { fit: 'cover', position: 'attention' })
    .flatten({ background: '#0b0616' })
    .png()
    .toBuffer()

  return sharp(base)
    .composite([{ input: Buffer.from(svgCapa(acento)), left: 0, top: 0 }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()
}

/* ─────────────────────────── Catalogo ─────────────────────────── */

/** Lee el catalogo y descarta entradas cuyo archivo ya no existe */
export function leerCatalogo() {
  let datos = []
  try {
    datos = JSON.parse(fs.readFileSync(CATALOGO, 'utf8'))
  } catch {
    datos = []
  }
  if (!Array.isArray(datos)) return []

  const vistos = new Set()
  return datos.filter((b) => {
    if (!b?.archivo || !b?.url || vistos.has(b.url)) return false
    if (!fs.existsSync(path.join(DIR_BANNERS, b.archivo))) return false
    vistos.add(b.url)
    return true
  })
}

function guardarCatalogo(catalogo) {
  try {
    fs.mkdirSync(DIR_BANNERS, { recursive: true })
    fs.writeFileSync(CATALOGO, JSON.stringify(catalogo, null, 2))
  } catch (err) {
    log.error('banners · no se pudo guardar el catalogo', err.message)
  }
}

function borrarArchivo(banner) {
  try {
    if (banner?.archivo) fs.rmSync(path.join(DIR_BANNERS, banner.archivo), { force: true })
  } catch {
    // sin permisos: queda huerfano, no molesta
  }
}

let sincronizando = null

/**
 * Descarga banners nuevos y actualiza el catalogo.
 * Si ya hay una sincronizacion en marcha, devuelve esa misma.
 *
 * @param {{nuevo?:number, maximo?:number}} opciones
 */
export function sincronizarBanners({ nuevo = 4, maximo = MAXIMO_BANNERS } = {}) {
  if (sincronizando) return sincronizando

  sincronizando = (async () => {
    const catalogo = leerCatalogo()
    const faltan = Math.max(0, Math.min(nuevo, maximo - catalogo.length))
    const agregados = []
    if (!faltan) return { agregados, catalogo }

    let candidatos = []
    try {
      candidatos = await recolectarCandidatos({ limite: 70 })
    } catch (err) {
      log.error('banners · sin candidatos', err.message)
      return { agregados, catalogo }
    }

    const vistos = new Set(catalogo.map((b) => b.url))
    const huellas = catalogo.map((b) => b.huella).filter(Boolean)

    for (const candidato of candidatos) {
      if (agregados.length >= faltan) break
      if (vistos.has(candidato.url)) continue
      vistos.add(candidato.url)

      let imagen = null
      try {
        imagen = await descargarImagen(candidato.url)
      } catch (err) {
        log.error(`banners · no se pudo bajar ${candidato.url.slice(0, 70)}`, err.message)
      }
      if (!imagen) continue

      // Misma imagen con otra URL: no se repite en el menu
      let huella = ''
      try {
        huella = await huellaImagen(imagen.buffer)
      } catch (err) {
        log.error('banners · no se pudo calcular la huella', err.message)
      }
      if (huella && huellas.some((otra) => imagenesParecidas(huella, otra))) continue
      if (huella) huellas.push(huella)

      const id = hashId(candidato.url)
      const acento = ACENTOS[Number.parseInt(id.slice(0, 6), 16) % ACENTOS.length]
      let jpg = null
      try {
        jpg = await prepararBanner(imagen.buffer, acento)
      } catch (err) {
        log.error('banners · no se pudo componer la imagen', err.message)
        continue
      }

      const archivo = `beerus-${id}.jpg`
      try {
        fs.mkdirSync(DIR_BANNERS, { recursive: true })
        fs.writeFileSync(path.join(DIR_BANNERS, archivo), jpg)
      } catch (err) {
        log.error('banners · no se pudo guardar el banner', err.message)
        continue
      }

      const entrada = {
        id,
        archivo,
        url: candidato.url,
        fuente: candidato.fuente || 'Bing',
        titulo: candidato.titulo || '',
        ancho: imagen.ancho,
        alto: imagen.alto,
        acento: acento.nombre,
        huella,
        agregado: new Date().toISOString(),
      }
      catalogo.push(entrada)
      agregados.push(entrada)
      guardarCatalogo(catalogo)

      await esperar(300)
    }

    // Se conservan los mas nuevos; los viejos se borran con su archivo
    while (catalogo.length > maximo) borrarArchivo(catalogo.shift())
    guardarCatalogo(catalogo)
    return { agregados, catalogo }
  })().finally(() => {
    sincronizando = null
  })

  return sincronizando
}

/* ───────────────────── Eleccion al azar ───────────────────── */

let ultimoId = null
let reponiendo = false

/** Baraja una lista sin repetir el banner anterior (azar inyectable) */
export function barajarBanners(lista, evitar = null, azar = Math.random) {
  const orden = lista.filter((b) => b.id !== evitar)
  for (let i = orden.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(azar() * (i + 1)))
    ;[orden[i], orden[j]] = [orden[j], orden[i]]
  }
  return orden
}

/** Banner de respaldo: el arte del proyecto con el mismo marco y titulo */
async function bannerRespaldo() {
  const archivo = path.join(DIR_BANNERS, 'respaldo.jpg')
  const acento = ACENTOS[0]

  try {
    if (fs.existsSync(archivo)) {
      return { buffer: fs.readFileSync(archivo), id: 'respaldo', nombre: 'Respaldo', fuente: 'local' }
    }
    const origen = path.resolve(BANNER_LOCAL)
    const jpg = await prepararBanner(await sharp(origen).png().toBuffer(), acento)
    fs.mkdirSync(DIR_BANNERS, { recursive: true })
    fs.writeFileSync(archivo, jpg)
    return { buffer: jpg, id: 'respaldo', nombre: 'Respaldo', fuente: 'local' }
  } catch (err) {
    log.error('banners · sin arte de respaldo', err.message)
    return null
  }
}

/**
 * Devuelve un banner al azar listo para enviar, distinto del anterior.
 * Si no hay cache intenta descargar; si no hay red usa el arte local.
 *
 * @returns {Promise<{buffer:Buffer, id:string, nombre:string, fuente:string, url?:string}|null>}
 */
export async function obtenerBannerMenu({ evitar = ultimoId } = {}) {
  let catalogo = leerCatalogo()

  if (!catalogo.length) {
    try {
      await sincronizarBanners({ nuevo: 2 })
    } catch (err) {
      log.error('banners · no se pudieron descargar banners', err.message)
    }
    catalogo = leerCatalogo()
  }

  if (!catalogo.length) {
    const respaldo = await bannerRespaldo()
    if (respaldo) ultimoId = respaldo.id
    return respaldo
  }

  const orden = barajarBanners(catalogo, evitar)

  for (const elegido of orden) {
    try {
      const buffer = fs.readFileSync(path.join(DIR_BANNERS, elegido.archivo))
      ultimoId = elegido.id

      // Con pocos banners se repone en segundo plano (no frena el menu)
      if (catalogo.length < MINIMO_BANNERS && !reponiendo) {
        reponiendo = true
        sincronizarBanners({ nuevo: MINIMO_BANNERS - catalogo.length + 1 })
          .catch((err) => console.error('banners · fallo la reposicion:', err.message))
          .finally(() => {
            reponiendo = false
          })
      }

      return {
        buffer,
        id: elegido.id,
        nombre: elegido.titulo || `Beerus ${elegido.id}`,
        fuente: elegido.fuente,
        url: elegido.url,
      }
    } catch (err) {
      log.error(`banners · el banner ${elegido.id} no se pudo leer`, err.message)
      borrarArchivo(elegido)
      guardarCatalogo(catalogo.filter((b) => b.id !== elegido.id))
    }
  }

  const respaldo = await bannerRespaldo()
  if (respaldo) ultimoId = respaldo.id
  return respaldo
}

/** Olvida el ultimo banner usado (util en las pruebas) */
export function reiniciarBannerActual() {
  ultimoId = null
}

/** Borra la cache de banners (para volver a descargarlos) */
export function vaciarBanners() {
  for (const banner of leerCatalogo()) borrarArchivo(banner)
  try {
    fs.rmSync(CATALOGO, { force: true })
  } catch {
    // nada que borrar
  }
  try {
    fs.rmSync(path.join(DIR_BANNERS, 'respaldo.jpg'), { force: true })
  } catch {
    // nada que borrar
  }
  ultimoId = null
}
