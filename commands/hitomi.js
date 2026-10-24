import { bajarArchivo } from '../lib/descargas.js'
import { crearPdf } from '../lib/pdf.js'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

// Hitomi migró su infraestructura: ltn.hitomi.la ya no existe
const DOMINIO = 'gold-usergeneratedcontent.net'
const LTN = `https://ltn.${DOMINIO}`
const REFERER = 'https://hitomi.la/'

const AYUDA = `🎴 *HitomiLA*

*Uso:* \`/hitomi <código>\`
       \`/hitomi <enlace>\`

*Ejemplos:*
• \`/hitomi 1429285\`
• \`/hitomi https://hitomi.la/doujinshi/titulo-1429285.html\`

_Descarga la galería como PDF. Contenido para adultos._`

const MAX_PAGINAS = 50
const MAX_BYTES_PAGINA = 12 * 1024 * 1024
const PARALELO = 4

/** Saca el id de galería (número suelto o enlace de hitomi) */
export function extraerId(texto) {
  const limpio = String(texto || '').trim()
  if (/^\d+$/.test(limpio)) return limpio
  const enlace = limpio.match(/hitomi\.la\/[a-z]+\/[^\s?#]*?(\d+)\.html/i)
  return enlace ? enlace[1] : null
}

/**
 * Lee la info de la galería: `${LTN}/galleries/<id>.js` contiene
 * `var galleryinfo = {...};` con el título y la lista de ficheros (hash).
 */
export async function pedirGaleria(id) {
  let res
  try {
    res = await fetch(`${LTN}/galleries/${id}.js`, {
      headers: { 'User-Agent': UA, Referer: REFERER },
      signal: AbortSignal.timeout(60000),
    })
  } catch (err) {
    throw new Error(`hitomi no respondió (${err.message})`)
  }

  if (res.status === 404) throw new Error('no existe una galería con ese código')
  if (!res.ok) throw new Error(`hitomi devolvió HTTP ${res.status}`)

  const js = await res.text()
  const m = js.match(/var\s+galleryinfo\s*=\s*(\{[\s\S]*\})\s*;?\s*$/)
  if (!m) throw new Error('hitomi devolvió datos que no entiendo')

  let info
  try {
    info = JSON.parse(m[1])
  } catch {
    throw new Error('el JSON de la galería está dañado')
  }
  if (!info?.files?.length) throw new Error('la galería no trae páginas')
  return info
}

/**
 * Interpreta gg.js sin ejecutarlo:
 *  - gg.m(g): valor por defecto (var o = N) o el de los `case` si g esta en la lista
 *  - gg.b: carpeta base (ej. '1792810801/')
 */
export async function cargarGg() {
  const res = await fetch(`${LTN}/gg.js`, {
    headers: { 'User-Agent': UA, Referer: REFERER },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`no pude leer gg.js (HTTP ${res.status})`)
  const fuente = await res.text()

  const base = fuente.match(/\bb:\s*'([^']*)'/)?.[1]
  const porDefecto = Number(fuente.match(/var\s+o\s*=\s*(\d+)/)?.[1] ?? 0)
  const bloque = fuente.match(/switch\s*\(g\)\s*\{([\s\S]*?)\}/)?.[1] || ''
  const valorCase = Number(bloque.match(/\bo\s*=\s*(\d+)\s*;/)?.[1] ?? 1)
  const casos = new Set([...bloque.matchAll(/case\s+(\d+)\s*:/g)].map((x) => Number(x[1])))

  if (base === undefined || !casos.size) throw new Error('el formato de gg.js cambió')

  return {
    base,
    m: (g) => (casos.has(g) ? valorCase : porDefecto),
  }
}

/** URL webp de una imagen a partir del hash (misma logica que common.js de hitomi) */
export function urlDeImagen(hash, gg) {
  const m = /(..)(.)$/.exec(hash)
  if (!m) throw new Error(`hash raro: ${hash}`)
  const g = parseInt(m[2] + m[1], 16)
  const sub = `w${1 + gg.m(g)}`
  return `https://${sub}.${DOMINIO}/${gg.base}${g}/${hash}.webp`
}


/** Baja una pagina probando ambos subdominios (w1 / w2) */
async function bajarPagina(hash, gg) {
  const principal = urlDeImagen(hash, gg)
  const alternativa = principal.replace(/\/\/w([12])\./, (_, n) => `//w${n === '1' ? '2' : '1'}.`)
  let ultimoError = null
  for (const url of [principal, alternativa]) {
    try {
      return await bajarArchivo(url, { maxBytes: MAX_BYTES_PAGINA, headers: { Referer: REFERER } })
    } catch (err) {
      ultimoError = err
    }
  }
  throw ultimoError
}

/** Baja las paginas (en tandas paralelas, en orden) */
export async function bajarPaginas(galeria, gg) {
  const hashes = (galeria.files || []).map((f) => f.hash).filter(Boolean)
  if (!hashes.length) throw new Error('la galería no trae ficheros')

  const lista = hashes.slice(0, MAX_PAGINAS)
  const resultados = new Array(lista.length).fill(null)
  let saltadas = 0

  for (let i = 0; i < lista.length; i += PARALELO) {
    await Promise.all(
      lista.slice(i, i + PARALELO).map(async (hash, j) => {
        const idx = i + j
        try {
          const buf = await bajarPagina(hash, gg)
          if (buf.length) resultados[idx] = buf
          else saltadas += 1
        } catch (err) {
          saltadas += 1
          console.warn(`[hitomi] pagina ${idx + 1} fallo: ${err.message}`)
        }
      })
    )
  }

  const buffers = resultados.filter(Boolean)
  if (!buffers.length) throw new Error('ninguna imagen se pudo bajar (la red bloquea hitomi o cambió el CDN)')
  return { buffers, saltadas, total: hashes.length }
}

/** Titulo legible de la galeria */
function tituloDe(galeria, id) {
  return galeria.japanese_title || galeria.title || `hitomi ${id}`
}

export default async ({ sock, jid, msg, args }) => {
  const ref = (args || []).join(' ').trim()

  if (!ref) {
    await sock.sendMessage(jid, { text: AYUDA }, { quoted: msg })
    return
  }

  const id = extraerId(ref)
  if (!id) {
    await sock.sendMessage(
      jid,
      { text: '❓ Necesito el código (número) o el enlace de la galería.\n_Ejemplo: `/hitomi 1429285`_' },
      { quoted: msg }
    )
    return
  }

  await sock.sendMessage(jid, { text: `🎴 *HitomiLA* · Preparando *#${id}*...` }, { quoted: msg })

  try {
    const [galeria, gg] = await Promise.all([pedirGaleria(id), cargarGg()])
    const { buffers, saltadas, total } = await bajarPaginas(galeria, gg)
    const titulo = tituloDe(galeria, id)
    const artistas = (galeria.artists || [])
      .map((a) => a.artist)
      .filter(Boolean)
      .slice(0, 3)
      .join(', ')
    const pdf = await crearPdf(buffers, { titulo: `hitomi ${id}` })

    await sock.sendMessage(
      jid,
      {
        document: pdf,
        mimetype: 'application/pdf',
        fileName: `hitomi-${id}.pdf`,
        caption:
          `🎴 *${titulo}*\n${artistas ? `👤 ${artistas}\n` : ''}📄 ${total} páginas${saltadas ? ` · ${saltadas} fallaron` : ''}${total > MAX_PAGINAS ? ` · se incluyen las primeras ${MAX_PAGINAS}` : ''}\n📦 ${(pdf.length / 1048576).toFixed(1)} MB`,
      },
      { quoted: msg }
    )
    console.log(`[hitomi] ${id} -> PDF (${buffers.length} paginas, ${(pdf.length / 1048576).toFixed(1)} MB)`)
  } catch (err) {
    console.error('[hitomi]', err.message)
    await sock.sendMessage(
      jid,
      { text: `❌ *No se pudo descargar la galería ${id}.*\n_${err.message}_` },
      { quoted: msg }
    )
  }
}
