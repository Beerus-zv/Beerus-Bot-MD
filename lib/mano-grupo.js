/**
 * Entrega de manos de los juegos de mesa dentro del grupo.
 *
 * Los juegos (UNO, póker) viven en el grupo: la mano de cada jugador no sale
 * del chat. Se dibuja como tarjeta PNG y se manda al grupo como *ver una vez*,
 * con la mención del jugador y el aviso al pie.
 *
 * Por qué una imagen y no texto: WhatsApp no tiene visibilidad por destinatario
 * dentro de un grupo (el mensaje se cifra una sola vez con la clave del grupo),
 * así que lo más cerca que se puede quedar es el envoltorio `viewOnce`. Un texto
 * no se puede envolver en ver-una-vez; una imagen sí.
 */
import sharp from 'sharp'
import { jidUsuario } from './grupo.js'
import { nombreLegible } from './economia.js'
import { obtenerUsuario } from '../database/db.js'
import { log } from './logger.js'

/** Aviso al pie: es exactamente lo que WhatsApp muestra en el cliente */
export const AVISO_PRIVADO = 'este mensaje solo es visible para ti'

const ANCHO = 760
const MARGEN = 36
const FUENTE = 'Segoe UI, DejaVu Sans, Liberation Sans, Arial, sans-serif'
const FONDO = '#0f1512'
const ACENTO = '#7ef0a8'
const TEXTO = '#f2f6f3'
const APAGADO = '#93a89b'

/** Escapa lo que va dentro de un <text> de SVG */
export function escaparXml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Corta una linea larga en trozos de `maximo` caracteres, sin partir palabras
 * cuando se puede.
 */
export function partirLinea(texto, maximo = 42) {
  const linea = String(texto ?? '').replace(/\s+/g, ' ').trim()
  if (linea.length <= maximo) return [linea]

  const trozos = []
  let actual = ''
  for (const palabra of linea.split(' ')) {
    if (!actual) {
      actual = palabra
    } else if (actual.length + 1 + palabra.length <= maximo) {
      actual += ` ${palabra}`
    } else {
      trozos.push(actual)
      actual = palabra
    }
  }
  if (actual) trozos.push(actual)
  return trozos
}

/**
 * Arma el SVG de la tarjeta. Devuelve tambien el alto para poder medir.
 * @param {{titulo: string, subtitulo?: string, lineas: string[], pie?: string}} tarjeta
 */
export function tarjetaSvg({ titulo, subtitulo = '', lineas = [], pie = '' }) {
  const cuerpo = []
  for (const linea of lineas) {
    for (const trozo of partirLinea(linea)) cuerpo.push(trozo)
  }

  const altoTitulo = 56
  const altoSubtitulo = subtitulo ? 44 : 0
  const alturaLinea = 44
  const separador = 30
  const altoPie = pie ? 74 : 0

  const alto = Math.max(
    220,
    MARGEN * 2 + altoTitulo + altoSubtitulo + separador + cuerpo.length * alturaLinea + altoPie
  )

  let y = MARGEN + 40
  const textos = []

  textos.push(
    `<text x="${MARGEN}" y="${y}" font-family="${FUENTE}" font-size="40" font-weight="700" fill="${TEXTO}">${escaparXml(titulo)}</text>`
  )
  y += altoTitulo

  if (subtitulo) {
    textos.push(
      `<text x="${MARGEN}" y="${y}" font-family="${FUENTE}" font-size="28" fill="${ACENTO}">${escaparXml(subtitulo)}</text>`
    )
    y += altoSubtitulo
  }

  textos.push(
    `<line x1="${MARGEN}" y1="${y - 10}" x2="${ANCHO - MARGEN}" y2="${y - 10}" stroke="${ACENTO}" stroke-opacity="0.35" stroke-width="2"/>`
  )
  y += separador

  for (const linea of cuerpo) {
    textos.push(
      `<text x="${MARGEN}" y="${y}" font-family="${FUENTE}" font-size="31" fill="${TEXTO}">${escaparXml(linea)}</text>`
    )
    y += alturaLinea
  }

  if (pie) {
    y += 10
    let primera = true
    for (const trozo of partirLinea(pie, 46)) {
      textos.push(
        `<text x="${MARGEN}" y="${y}" font-family="${FUENTE}" font-size="25" fill="${APAGADO}">${escaparXml(trozo)}</text>`
      )
      y += 32
      primera = false
    }
    if (!primera) y -= 32
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${alto}">
  <rect x="0" y="0" width="${ANCHO}" height="${alto}" rx="30" fill="${FONDO}"/>
  <rect x="0" y="0" width="${ANCHO}" height="10" rx="5" fill="${ACENTO}" fill-opacity="0.55"/>
  ${textos.join('\n  ')}
</svg>`

  return { svg, alto }
}

/**
 * Dibuja la tarjeta y devuelve el PNG.
 * @returns {Promise<Buffer>}
 */
export async function renderizarTarjeta(tarjeta) {
  const { svg } = tarjetaSvg(tarjeta)
  return await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
}

/** Nombre visible del jugador, con el numero como respaldo */
export function nombreDelJugador(jugador) {
  try {
    return nombreLegible(jugador, obtenerUsuario) || null
  } catch {
    return null
  }
}

/**
 * Manda la tarjeta de la mano al grupo como ver-una-vez, mencionando al dueno.
 *
 * @param {object} opciones
 * @param {object} opciones.sock socket de Baileys
 * @param {string} opciones.grupo JID del grupo donde se juega
 * @param {string} opciones.jugador JID del dueno de la mano
 * @param {string} opciones.titulo encabezado de la tarjeta
 * @param {string} [opciones.subtitulo] linea de color debajo del encabezado
 * @param {string[]} [opciones.lineas] cuerpo: una carta o una jugada por linea
 * @param {string} [opciones.pie] linea al pie de la tarjeta
 * @param {string} [opciones.nota] texto extra en el pie del mensaje
 * @param {object} [opciones.quoted] mensaje a citar
 * @returns {Promise<boolean>} true si salio el mensaje
 */
export async function enviarManoEnGrupo({
  sock,
  grupo,
  jugador,
  titulo,
  subtitulo = '',
  lineas = [],
  pie = '',
  nota = '',
  quoted = null,
}) {
  const nombre = nombreDelJugador(jugador)
  const mencion = `@${jidUsuario(jugador).split('@')[0]}`

  const caption =
    `🃏 *${titulo}* — ${mencion}\n` +
    (nota ? `${nota}\n` : '') +
    `\n_${AVISO_PRIVADO}_`

  const menciones = [jidUsuario(jugador)]

  try {
    const imagen = await renderizarTarjeta({ titulo, subtitulo, lineas, pie })
    await sock.sendMessage(
      grupo,
      { image: imagen, caption, viewOnce: true, mentions: menciones },
      quoted ? { quoted } : undefined
    )
    return true
  } catch (err) {
    log.error(`mano-grupo · no se pudo dibujar la tarjeta de ${nombre || jugador}`, err?.message || err)
    // Sin imagen no hay ver-una-vez: se avisa y el jugador pide la mano de nuevo.
    await sock.sendMessage(
      grupo,
      {
        text: `${mencion} no pude dibujar tu tarjeta ahora. Pedila otra vez en un momento.`,
        mentions: menciones,
      },
      quoted ? { quoted } : undefined
    )
    return false
  }
}
