/**
 * Renderiza el menu completo de Beerus en una sola imagen PNG.
 *
 * Se usa cuando el menu en texto supera el limite de caracteres de WhatsApp:
 * de esta forma TODOS los comandos caben siempre en un unico mensaje.
 *
 * Si se pasa un banner (Buffer PNG/JPEG), se usa como cabecera del menu:
 * el arte del bot arriba con el titulo encima, y la lista de comandos debajo.
 */
import sharp from 'sharp'
import { estructuraMenu } from './categorias.js'
import { TEMA, ORNAMENTOS } from './tema.js'

const ANCHO = 1000
const MARGEN = 46
const ALTO_LINEA = 30
const ALTO_CATEGORIA = 44
/**
 * Alto maximo de la cabecera con el arte del bot.
 * Suficiente alto para que quepa el arte completo (la imagen del bot es
 * panoramica 3:2) sin recortarla.
 */
const ALTO_CABECERA_MAX = 700

/** Escapa los caracteres especiales de XML para que el SVG no se rompa */
function escapar(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Quita los emojis del titulo de la categoria (se ve mejor en la imagen) */
function soloTexto(titulo) {
  return String(titulo)
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}\u{200D}\u{2B50}]/gu,
      ''
    )
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Prepara el arte de cabecera: lo escala al ancho del menu conservando su
 * proporcion y lo devuelve como data URI lista para incrustar en el SVG.
 * @returns {Promise<{uri: string, alto: number}>}
 */
async function prepararCabecera(banner) {
  const meta = await sharp(banner).metadata()
  const proporcion = meta.width && meta.height ? meta.width / meta.height : 16 / 9

  // Alto natural del arte al ancho del menu. Con 'fill' la imagen se estira
  // al alto exacto: como el alto sale de su propia proporcion, no se deforma.
  const alto = Math.min(Math.round(ANCHO / proporcion), ALTO_CABECERA_MAX)

  const jpeg = await sharp(banner)
    .resize({ width: ANCHO, height: alto, fit: 'fill' })
    .jpeg({ quality: 90 })
    .toBuffer()

  return { uri: `data:image/jpeg;base64,${jpeg.toString('base64')}`, alto }
}

/**
 * Construye el SVG del menu.
 * @param {object} commands  Registro de comandos
 * @param {string} prefix    Prefijo de los comandos
 * @param {object} panel     Datos del panel (modo, desarrollador...)
 * @param {{uri: string, alto: number}|null} cabecera  Arte de cabecera
 * @returns {string} svg
 */
export function svgMenu(commands = {}, prefix = '/', panel = {}, cabecera = null) {
  const secciones = estructuraMenu(commands, prefix)
  const conCabecera = Boolean(cabecera)
  const altoCabecera = conCabecera ? cabecera.alto : 0

  const lineas = []
  const defs = []
  let y = 0

  // ── Cabecera con el arte del bot ──
  if (conCabecera) {
    // Recorte con esquinas superiores redondeadas: el arte se funde con el marco
    defs.push(`
    <clipPath id="clipCabecera">
      <path d="M 0,18 A 18,18 0 0 1 18,0 L 982,0 A 18,18 0 0 1 1000,18 L 1000,${altoCabecera} L 0,${altoCabecera} Z"/>
    </clipPath>
    <linearGradient id="veloCabecera" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#08040f" stop-opacity="0.62"/>
      <stop offset="38%" stop-color="#08040f" stop-opacity="0.12"/>
      <stop offset="72%" stop-color="#08040f" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#08040f" stop-opacity="0.95"/>
    </linearGradient>`)

    lineas.push(`
  <g clip-path="url(#clipCabecera)">
    <image xlink:href="${cabecera.uri}" x="0" y="0" width="${ANCHO}" height="${altoCabecera}" preserveAspectRatio="xMidYMid slice"/>
    <rect x="0" y="0" width="${ANCHO}" height="${altoCabecera}" fill="url(#veloCabecera)"/>
  </g>`)

    // Titulo y subtitulo sobre el arte
    lineas.push(
      `<text x="${ANCHO / 2}" y="${altoCabecera - 82}" font-size="50" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-weight="700" fill="#f5b301" text-anchor="middle" stroke="#08040f" stroke-width="6" stroke-linejoin="round" paint-order="stroke">${escapar(TEMA.titulo)}</text>`
    )
    lineas.push(
      `<text x="${ANCHO / 2}" y="${altoCabecera - 40}" font-size="24" font-family="Segoe UI, Arial, Helvetica, sans-serif" fill="#e9d5ff" text-anchor="middle" stroke="#08040f" stroke-width="5" stroke-linejoin="round" paint-order="stroke">${escapar(TEMA.subtitulo)}</text>`
    )

    y = altoCabecera
  } else {
    // Sin arte: cabecera sobre el fondo degradado
    lineas.push(
      `<text x="${ANCHO / 2}" y="${y + 46}" font-size="46" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-weight="700" fill="#f5b301" text-anchor="middle">${escapar(TEMA.titulo)}</text>`
    )
    y += 62

    lineas.push(
      `<text x="${ANCHO / 2}" y="${y + 20}" font-size="22" font-family="Segoe UI, Arial, Helvetica, sans-serif" fill="#c4b5fd" text-anchor="middle">${escapar(TEMA.subtitulo)}</text>`
    )
    y += 40
  }

  // Panel de datos
  const datos = Object.entries(panel)
    .filter(([, valor]) => valor !== undefined && valor !== null && valor !== '')
    .map(([clave, valor]) => `${clave}: ${valor}`)
    .join('   •   ')

  if (datos) {
    lineas.push(
      `<text x="${ANCHO / 2}" y="${y + 34}" font-size="19" font-family="Segoe UI, Arial, Helvetica, sans-serif" fill="#a78bfa" text-anchor="middle">${escapar(datos)}</text>`
    )
    y += 54
  }

  lineas.push(
    `<line x1="${MARGEN}" y1="${y}" x2="${ANCHO - MARGEN}" y2="${y}" stroke="#4c1d95" stroke-width="2"/>`
  )
  y += 18

  // Categorias y comandos
  for (const seccion of secciones) {
    lineas.push(
      `<text x="${MARGEN}" y="${y + 28}" font-size="24" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-weight="700" fill="#f5b301">${escapar(soloTexto(seccion.titulo))}</text>`
    )
    y += ALTO_CATEGORIA

    for (const linea of seccion.lineas) {
      lineas.push(
        `<text x="${MARGEN + 16}" y="${y + 18}" font-size="19" font-family="Segoe UI, Arial, Helvetica, sans-serif" fill="#e9d5ff">▸ ${escapar(linea.comando)} <tspan fill="#9ca3af">— ${escapar(linea.descripcion)}</tspan></text>`
      )
      y += ALTO_LINEA
    }

    y += 14
  }

  // Pie
  lineas.push(
    `<line x1="${MARGEN}" y1="${y}" x2="${ANCHO - MARGEN}" y2="${y}" stroke="#4c1d95" stroke-width="2"/>`
  )
  y += 34

  lineas.push(
    `<text x="${ANCHO / 2}" y="${y}" font-size="19" font-family="Segoe UI, Arial, Helvetica, sans-serif" fill="#a78bfa" text-anchor="middle" font-style="italic">${escapar(TEMA.lema)}</text>`
  )
  y += 30

  const alto = Math.max(y + MARGEN, 400)

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${ANCHO}" height="${alto}" viewBox="0 0 ${ANCHO} ${alto}">
  <defs>
    <linearGradient id="fondoMenu" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e0b3c"/>
      <stop offset="100%" stop-color="#08040f"/>
    </linearGradient>
    ${defs.join('\n    ')}
  </defs>
  <rect width="${ANCHO}" height="${alto}" fill="url(#fondoMenu)"/>
  ${lineas.join('\n  ')}
  <rect x="3" y="3" width="${ANCHO - 6}" height="${alto - 6}" fill="none" stroke="#4c1d95" stroke-width="3" rx="18"/>
</svg>`
}

/**
 * Renderiza el menu completo en PNG.
 * @param {object} commands
 * @param {string} prefix
 * @param {object} panel
 * @param {Buffer|null} banner  Arte de cabecera del bot
 * @returns {Promise<Buffer>} png
 */
export async function imagenMenu(commands = {}, prefix = '/', panel = {}, banner = null) {
  const cabecera = banner ? await prepararCabecera(banner) : null
  const svg = svgMenu(commands, prefix, panel, cabecera)

  // Paleta de 256 colores: el menu es texto sobre fondo oscuro, asi que no
  // se nota y el PNG baja de 1.6 MB a ~400 KB (mucho mas liviano para WhatsApp).
  return await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, palette: true, quality: 92, effort: 10 })
    .toBuffer()
}

export { ORNAMENTOS }
