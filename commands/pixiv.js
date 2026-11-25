import { bajarArchivo, formatearDuracion } from '../lib/descargas.js'
import { crearPdf } from '../lib/pdf.js'
import sharp from 'sharp'
import { log } from '../lib/logger.js'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const REFERER = 'https://www.pixiv.net/'

const AYUDA = `🎨 *Pixiv*

*Uso:* \`/pixiv <id o enlace>\`
       \`/pixivpdf <id o enlace>\`

*Ejemplos:*
• \`/pixiv 92045467\`
• \`/pixiv https://www.pixiv.net/artworks/92045467\`

_Ilustraciones, mangas (como PDF) y animaciones de Pixiv. Con pdf te obliga al PDF._`

const MAX_PAGINAS = 40
const MAX_BYTES_PAGINA = 12 * 1024 * 1024

/** Descarga una imagen de Pixiv (i.pximg.net exige el Referer correcto) */
async function bajarImagen(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: REFERER },
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} bajando la imagen`)
  return Buffer.from(await res.arrayBuffer())
}

/** Pide un JSON de pixiv_ajax/{...} y devuelve body o lanza con detalle */
async function pedirJson(ruta) {
  const res = await fetch(`https://www.pixiv.net/ajax/${ruta}`, {
    headers: { 'User-Agent': UA, Referer: REFERER, Accept: 'application/json' },
    signal: AbortSignal.timeout(60000),
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    // respuesta no-jpeg (Cloudflare, html de error...)
    throw new Error(`Pixiv no devolvió JSON (HTTP ${res.status} en /${ruta})`)
  }
  if (json.error) {
    const motivo = json.message || ''
    throw new Error(
      motivo.includes('restricted')
        ? 'es una obra restringida (R-18 con login o cuenta privada)'
        : motivo || `Pixiv rechazó /${ruta} (HTTP ${res.status})`
    )
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} en /${ruta}`)
  return json.body
}

/** Saca el id de obra de un enlace o de texto plano */
export function extraerId(texto) {
  const limpio = String(texto || '').trim()
  if (/^\d+$/.test(limpio)) return limpio
  const enlace = limpio.match(/pixiv\.net\/(?:[a-z-]+\/)?(?:artworks|en\/artworks)\/(\d+)/i)
  if (enlace) return enlace[1]
  const viejo = limpio.match(/illust_id=(\d+)/i)
  return viejo ? viejo[1] : null
}

export default async ({ sock, jid, msg, args }) => {
  const forzarPdf = args[0] === 'pdf'
  const ref = (forzarPdf ? args.slice(1) : args).join(' ').trim()

  if (!ref) {
    await sock.sendMessage(jid, { text: AYUDA, quoted: msg })
    return
  }

  const id = extraerId(ref)
  if (!id) {
    await sock.sendMessage(jid, {
      text: '❓ Necesito el id o el enlace de la obra.\n_Ejemplo: `/pixiv 92045467`_',
      quoted: msg,
    })
    return
  }

  await sock.sendMessage(jid, { text: `🎨 *Pixiv* · Buscando la obra *#${id}*...`, quoted: msg })

  let obra
  try {
    obra = await pedirJson(`illust/${id}`)
  } catch (err) {
    log.error('pixiv', err.message)
    await sock.sendMessage(jid, {
      text:
        `❌ *No se pudo leer la obra ${id}.*\n_${err.message}_\n\n` +
        `_Revisa el id: las obras borradas o de usuarios privados no salen._`,
      quoted: msg,
    })
    return
  }

  const titulo = obra.title || `pixiv ${id}`
  const esManga = Number(obra.pageCount) > 1 || obra.illustType === 1
  const esUgoira = obra.illustType === 2
  const autor = obra.userName || obra.userId || ''

  try {
    if (esUgoira) {
      // ─── Ugoira: zip de fotogramas -> mp4 con ffmpeg ───
      const meta = await pedirJson(`illust/${id}/ugoira_meta`).catch(() => null)
      const zipUrl = meta?.originalSrc || meta?.src
      if (!zipUrl) throw new Error('Pixiv no dio el zip de la animación')

      const zip = await bajarArchivo(zipUrl, { maxBytes: 60 * 1024 * 1024, headers: { Referer: REFERER } })
      const delays = (meta?.frames || []).map((f) => Number(f?.delay) || 50)
      const { desempaquetarUgoira } = await import('../lib/ugoira.js')
      const video = await desempaquetarUgoira(zip, delays)

      if (video) {
        await sock.sendMessage(jid, {
          video: video.buffer,
          mimetype: 'video/mp4',
          caption: `🎨 *${titulo}*\n👤 ${autor}\n⏱️ ugoira → mp4\n📦 ${(video.buffer.length / 1048576).toFixed(1)} MB`,
          quoted: msg,
        })
        return
      }

      // Sin ffmpeg: manda la miniatura y el enlace, con aviso honesto
      const preview = await bajarImagen(obra.urls?.regular || obra.urls?.small).catch(() => null)
      const aviso =
        `🎨 *${titulo}* _es una animación (ugoira)._` +
        (preview ? '' : `\n🔗 https://www.pixiv.net/artworks/${id}`)

      if (preview) {
        await sock.sendMessage(jid, {
          image: preview,
          caption: aviso + `\n🔗 https://www.pixiv.net/artworks/${id}`,
          quoted: msg,
        })
      } else {
        await sock.sendMessage(jid, { text: aviso, quoted: msg })
      }
      return
    }

    const paginas = await pedirJson(`illust/${id}/pages`)
    const originales = (paginas || []).map((p) => p?.urls?.original).filter(Boolean)
    if (!originales.length) throw new Error('Pixiv no devolvió páginas')

    const avisadas = originales.slice(0, MAX_PAGINAS)
    const recortadas = originales.length - avisadas.length

    // ─── Manga / PDF ───
    if (esManga || forzarPdf || avisadas.length > 1) {
      const buffers = []
      let saltadas = recortadas
      for (const url of avisadas) {
        try {
          const buf = await bajarImagen(url)
          if (buf.length <= MAX_BYTES_PAGINA) buffers.push(buf)
        } catch {
          saltadas += 1
        }
      }
      if (!buffers.length) throw new Error('ninguna página se pudo bajar')

      const pdf = await crearPdf(buffers, { titulo })
      await sock.sendMessage(jid, {
        document: pdf,
        mimetype: 'application/pdf',
        fileName: `pixiv-${id}.pdf`,
        caption:
          `📕 *${titulo}*\n👤 ${autor}\n📄 ${paginas.length} páginas${saltadas ? ` · ${saltadas} fallaron` : ''}\n📦 ${(pdf.length / 1048576).toFixed(1)} MB`,
        quoted: msg,
      })
      log.depuracion(`pixiv · manga ${id} -> PDF (${buffers.length} paginas, ${(pdf.length / 1048576).toFixed(1)} MB)`)
      return
    }

    // ─── Ilustración suelta ───
    const imagen = await bajarImagen(avisadas[0])
    const jpeg = await sharp(imagen).jpeg({ quality: 88 }).toBuffer().catch(() => imagen)
    await sock.sendMessage(jid, {
      image: jpeg,
      caption:
        `🎨 *${titulo}*\n👤 ${autor}\n` +
        (obra.illustType === 0 ? '' : '\n(otras páginas: usa `/pixivpdf`)') +
        `\n📦 ${(jpeg.length / 1048576).toFixed(1)} MB`,
      quoted: msg,
    })
    log.depuracion(`pixiv · ilustracion ${id} -> imagen (${(jpeg.length / 1048576).toFixed(1)} MB)`)
  } catch (err) {
    log.error('pixiv', err.message)
    await sock.sendMessage(jid, {
      text: `💥 *No se pudo descargar la obra ${id}.*\n_${err.message}_\n🔗 https://www.pixiv.net/artworks/${id}`,
      quoted: msg,
    })
  }
}
