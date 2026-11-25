import { bajarArchivo } from '../lib/descargas.js'
import { crearPdf } from '../lib/pdf.js'
import { log } from '../lib/logger.js'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

// La API v2 pide un User-Agent descriptivo: NombreApp/version (contacto o proyecto)
const UA_API = 'BeerusBotMD/1.0 (WhatsApp bot)'
const API = 'https://nhentai.net/api/v2'

const AYUDA = `📡 *nhentai*

*Uso:* \`/nhentai <código>\`
       \`/nhentai <enlace>\`

*Ejemplos:*
• \`/nhentai 350000\`
• \`/nhentai https://nhentai.net/g/350000/\`

_Descarga el doujin completo como PDF. Contenido para adultos._`

const MAX_PAGINAS = 50
const MAX_BYTES_PAGINA = 12 * 1024 * 1024
const PARALELO = 4
const SERVIDORES_IMAGEN = [
  'https://i1.nhentai.net',
  'https://i2.nhentai.net',
  'https://i3.nhentai.net',
  'https://i4.nhentai.net',
]

/** Saca el código del doujin (texto suelto o enlace /g/123456) */
export function extraerCodigo(texto) {
  const limpio = String(texto || '').trim()
  if (/^\d+$/.test(limpio)) return limpio
  const enlace = limpio.match(/nhentai\.net\/g\/(\d+)/i)
  return enlace ? enlace[1] : null
}

/**
 * Pide el JSON de la API v2 (/api/v2/galleries/<id>). La API antigua
 * (/api/gallery/<id>) ya no existe y responde 403.
 */
async function pedirGaleria(id) {
  let res
  try {
    res = await fetch(`${API}/galleries/${id}`, {
      headers: { 'User-Agent': UA_API, Accept: 'application/json' },
      signal: AbortSignal.timeout(60000),
    })
  } catch (err) {
    throw new Error(`nhentai no respondió (${err.message})`)
  }

  if (res.status === 404) throw new Error('no existe un doujin con ese código')
  if (res.status === 429) throw new Error('nhentai limitó las peticiones. Prueba en un minuto')
  if (res.status === 503 || res.status === 403) {
    throw new Error('nhentai está bloqueando bots (Cloudflare). Prueba más tarde')
  }
  if (!res.ok) throw new Error(`nhentai devolvió HTTP ${res.status}`)

  const json = await res.json()
  if (!json?.pages?.length) throw new Error('el JSON de nhentai no trae páginas')
  return json
}

/** Baja una página probando los servidores de imagen hasta que uno responda */
async function bajarPagina(pagina, indice) {
  const ruta = String(pagina.path || '').replace(/^\/+/, '')
  let ultimoError = null
  // Se reparte la carga: cada página empieza por un servidor distinto
  for (let k = 0; k < SERVIDORES_IMAGEN.length; k++) {
    const base = SERVIDORES_IMAGEN[(indice + k) % SERVIDORES_IMAGEN.length]
    try {
      return await bajarArchivo(`${base}/${ruta}`, {
        maxBytes: MAX_BYTES_PAGINA,
        headers: { Referer: 'https://nhentai.net/', 'User-Agent': UA },
      })
    } catch (err) {
      ultimoError = err
    }
  }
  throw ultimoError
}

/** Baja las paginas del doujin (en tandas paralelas, manteniendo el orden) */
async function bajarDoujin(meta) {
  const paginas = meta.pages.slice(0, MAX_PAGINAS)
  const resultados = new Array(paginas.length).fill(null)
  let saltadas = 0

  for (let i = 0; i < paginas.length; i += PARALELO) {
    const tanda = paginas.slice(i, i + PARALELO)
    await Promise.all(
      tanda.map(async (pagina, j) => {
        const idx = i + j
        try {
          const buf = await bajarPagina(pagina, idx)
          if (buf.length) resultados[idx] = buf
          else saltadas += 1
        } catch (err) {
          saltadas += 1
          log.aviso(`nhentai · pagina ${idx + 1} fallo: ${err.message}`)
        }
      })
    )
  }

  const buffers = resultados.filter(Boolean)
  if (!buffers.length) throw new Error('ninguna página se pudo bajar')
  return { buffers, saltadas, total: meta.num_pages || meta.pages.length }
}

export default async ({ sock, jid, msg, args }) => {
  const ref = (args || []).join(' ').trim()

  if (!ref) {
    await sock.sendMessage(jid, { text: AYUDA }, { quoted: msg })
    return
  }

  const codigo = extraerCodigo(ref)
  if (!codigo) {
    await sock.sendMessage(
      jid,
      { text: '❓ Necesito el código (número) o el enlace del doujin.\n_Ejemplo: `/nhentai 350000`_' },
      { quoted: msg }
    )
    return
  }

  await sock.sendMessage(jid, { text: `📡 *nhentai* · Preparando *#${codigo}*...` }, { quoted: msg })

  let meta
  try {
    meta = await pedirGaleria(codigo)
  } catch (err) {
    log.error('nhentai', err.message)
    await sock.sendMessage(
      jid,
      { text: `❌ *No se pudo leer el doujin ${codigo}.*\n_${err.message}_` },
      { quoted: msg }
    )
    return
  }

  const titulo =
    meta.title?.japanese || meta.title?.english || meta.title?.pretty || `nhentai ${codigo}`
  const etiquetas = (meta.tags || [])
    .filter((t) => t.type === 'artist')
    .map((t) => t.name)
    .slice(0, 3)
    .join(', ')

  try {
    const { buffers, saltadas, total } = await bajarDoujin(meta)
    const pdf = await crearPdf(buffers, { titulo: `nhentai ${codigo}` })

    await sock.sendMessage(
      jid,
      {
        document: pdf,
        mimetype: 'application/pdf',
        fileName: `nhentai-${codigo}.pdf`,
        caption:
          `📡 *${titulo}*\n${etiquetas ? `👤 ${etiquetas}\n` : ''}📄 ${total} páginas${saltadas ? ` · ${saltadas} fallaron` : ''}${total > MAX_PAGINAS ? ` · se incluyen las primeras ${MAX_PAGINAS}` : ''}\n📦 ${(pdf.length / 1048576).toFixed(1)} MB`,
      },
      { quoted: msg }
    )
    log.depuracion(`nhentai · ${codigo} -> PDF (${buffers.length} paginas, ${(pdf.length / 1048576).toFixed(1)} MB)`)
  } catch (err) {
    log.error('nhentai', err.message)
    await sock.sendMessage(
      jid,
      { text: `💥 *No se pudo descargar el doujin ${codigo}.*\n_${err.message}_` },
      { quoted: msg }
    )
  }
}
