import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import { IMAGEN_MENU_INTERNET, BANNER_LOCAL } from '../config.js'
import { SVG_BEERUS } from './arte-beerus.js'
import { buscarImagenes } from './internet.js'

const CACHE_DIR = path.resolve('data')
/** Arte imperial dibujado por el bot (imagen de respaldo del menu) */
const CACHE_PROPIO = path.join(CACHE_DIR, 'beerus-imperial.png')
/** Banner de Beerus descargado de internet (imagen principal del menu) */
const CACHE_INTERNET = path.join(CACHE_DIR, 'beerus-banner.png')
/** Banner del proyecto: arte de Beerus incluido en assets/ (prioridad maxima) */
const BANNER_PROPIO = path.resolve(BANNER_LOCAL)

/** Ancho del banner enviado como foto del menu (el alto sale de la proporcion) */
const ANCHO_BANNER = 900

/**
 * Consultas para encontrar el arte de Beerus en internet.
 * Se prueban en orden hasta que una devuelva una imagen valida.
 */
export const CONSULTAS_BEERUS = [
  'Beerus Dios de la Destruccion Dragon Ball Super',
  'Beerus God of Destruction Dragon Ball render',
  'Beerus Dragon Ball Super wallpaper 4k',
]

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

/** SVG del arte imperial de Beerus (cuerpo entero, corona y collar de rombos) */
export function svgBeerus() {
  return SVG_BEERUS
}

/** Descarga una imagen de internet y la normaliza a PNG */
async function descargarPng(url) {
  const control = new AbortController()
  const timer = setTimeout(() => control.abort(), 15000)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Referer: 'https://duckduckgo.com/' },
      signal: control.signal,
    })
    if (!res.ok) return null

    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length < 2000) return null

    return await sharp(buffer)
      .resize({ width: 720, height: 900, fit: 'cover', position: 'top' })
      .png()
      .toBuffer()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Descarga el banner de Beerus desde internet.
 * Devuelve null si no se puede obtener ninguna imagen valida.
 */
export async function descargarAvatarBeerus() {
  for (const consulta of CONSULTAS_BEERUS) {
    let resultados = []
    try {
      resultados = await buscarImagenes(consulta, 10)
    } catch (err) {
      console.error('Fallo buscando imagenes de Beerus:', err.message)
    }

    for (const resultado of resultados) {
      const png = await descargarPng(resultado.url)
      if (!png) continue

      try {
        if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true })
        fs.writeFileSync(CACHE_INTERNET, png)
      } catch (err) {
        console.error('No se pudo cachear el banner:', err.message)
      }

      return png
    }
  }
  return null
}


/**
 * Normaliza el banner del proyecto conservando el arte completo.
 * Solo se escala el ancho (el alto sale solo): la imagen nunca se recorta,
 * asi que se ve el dibujo entero con la cara de Beerus.
 * Se guarda en JPEG para no enviar 1 MB por WhatsApp.
 * El resultado se cachea en memoria: no se re-encoda en cada llamada.
 */
let cacheBanner = null

async function prepararBannerPropio() {
  if (cacheBanner) return cacheBanner

  cacheBanner = await sharp(BANNER_PROPIO)
    .resize({ width: ANCHO_BANNER })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer()

  return cacheBanner
}

/**
 * Devuelve el PNG de Beerus (Buffer) para el banner del menu.
 * Prioridad: banner del proyecto -> banner de internet -> arte imperial.
 * Si IMAGEN_MENU_INTERNET esta desactivado, se usa siempre el arte propio.
 */
export async function obtenerAvatarBeerus({ forzar = false } = {}) {
  // 1) Banner del proyecto: es el arte oficial del bot, gana siempre
  if (!forzar && fs.existsSync(BANNER_PROPIO)) {
    try {
      return await prepararBannerPropio()
    } catch (err) {
      console.error('No se pudo preparar el banner propio:', err.message)
    }
  }

  const usarInternet = IMAGEN_MENU_INTERNET === true

  if (usarInternet) {
    if (!forzar && fs.existsSync(CACHE_INTERNET)) {
      try {
        return fs.readFileSync(CACHE_INTERNET)
      } catch {
        // se regenera
      }
    }

    const descargado = await descargarAvatarBeerus()
    if (descargado) return descargado
  }

  if (!forzar && fs.existsSync(CACHE_PROPIO)) {
    try {
      return fs.readFileSync(CACHE_PROPIO)
    } catch {
      // se regenera
    }
  }

  // Arte imperial: Beerus en pose de dios sobre su trono de luna
  const png = await sharp(Buffer.from(SVG_BEERUS)).png().toBuffer()

  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true })
    fs.writeFileSync(CACHE_PROPIO, png)
  } catch (err) {
    console.error('No se pudo cachear el arte de Beerus:', err.message)
  }

  return png
}

/** Ruta del banner cacheado en disco (si existe) */
export function rutaAvatar() {
  if (fs.existsSync(BANNER_PROPIO)) return BANNER_PROPIO
  if (IMAGEN_MENU_INTERNET && fs.existsSync(CACHE_INTERNET)) return CACHE_INTERNET
  if (fs.existsSync(CACHE_PROPIO)) return CACHE_PROPIO
  return fs.existsSync(CACHE_INTERNET) ? CACHE_INTERNET : null
}
