import { bajarArchivo } from '../lib/descargas.js'
import { crearPdf } from '../lib/pdf.js'
import { log } from '../lib/logger.js'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const AYUDA = `🔞 *VerMangasPorno*

*Uso:* \`/vermangasporno <enlace>\`

*Ejemplo:*
• \`/vermangasporno https://vermangasporno.com/manga/doujin-x/\`

_Descarga el manga como PDF. Contenido para adultos._`

const MAX_PAGINAS = 60
const MAX_BYTES_PAGINA = 12 * 1024 * 1024

/**
 * Raspa la página del manga: titulo (og:title / h1) y las imágenes de las
 * páginas (uploads de WordPress). La web protege con Cloudflare; si
 * responde "Just a moment..." el error lo dice sin rodeos.
 */
export async function pedirManga(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(60000),
  })

  if (res.status === 403 || res.status === 503) {
    throw new Error('Cloudflare está bloqueando bots en VerMangasPorno. Prueba más tarde')
  }
  if (!res.ok) throw new Error(`La web devolvió HTTP ${res.status}`)

  const html = await res.text()
  if (html.includes('Just a moment...')) {
    throw new Error('Cloudflare está bloqueando bots en VerMangasPorno. Prueba más tarde')
  }

  const titulo =
    (html.match(/property="og:title" content="([^"]+)"/) || [])[1] ||
    (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [, 'vmp'])[1].replace(/<[^>]+>/g, '').trim() ||
    'manga'

  // Paginas: urls de elementos <img> en el cuerpo del manga, con orden del html
  const vistas = new Set()
  const paginas = [...html.matchAll(/<img[^>]+src=["']([^"']+wp-content\/uploads[^"']+)["']/gi)]
    .map((m) => m[1])
    .filter((u) => /\.(jpe?g|png|webp)$/i.test(u))
    .filter((u) => !vistas.has(u) && vistas.add(u))
    .map((u) => u.replace(/^https?:/, 'https:'))
    .filter((u) => !/logo|portada?\/icon|favicon/i.test(u))

  if (!paginas.length) throw new Error('no encontré las imágenes del manga (la web cambió su estructura)')

  return { titulo, paginas: paginas.slice(0, MAX_PAGINAS) }
}

export default async ({ sock, jid, msg, args }) => {
  const enlace = (args || []).join(' ').trim()

  if (!enlace || !/^https?:\/\//i.test(enlace)) {
    await sock.sendMessage(jid, {
      text: '❓ Necesito el enlace del manga.\n_Ejemplo: `/vermangasporno https://vermangasporno.com/manga/doujin-x/`_',
      quoted: msg,
    })
    return
  }

  await sock.sendMessage(jid, { text: '🔞 *VerMangasPorno* · Preparando el manga...', quoted: msg })

  try {
    const { titulo, paginas } = await pedirManga(enlace)

    const buffers = []
    let saltadas = 0
    for (const url of paginas) {
      try {
        const buf = await bajarArchivo(url, { maxBytes: MAX_BYTES_PAGINA, headers: { Referer: 'https://vermangasporno.com/' } })
        if (buf.length) buffers.push(buf)
        else saltadas += 1
      } catch {
        saltadas += 1
      }
    }
    if (!buffers.length) throw new Error('ninguna imagen se pudo bajar')

    const pdf = await crearPdf(buffers, { titulo })
    await sock.sendMessage(jid, {
      document: pdf,
      mimetype: 'application/pdf',
      fileName: 'vermangasporno.pdf',
      caption:
        `🔞 *${titulo}*\n📄 ${paginas.length} páginas${saltadas ? ` · ${saltadas} fallaron` : ''}\n📦 ${(pdf.length / 1048576).toFixed(1)} MB`,
      quoted: msg,
    })
    log.depuracion(`vmp · ${enlace} -> PDF (${buffers.length} paginas, ${(pdf.length / 1048576).toFixed(1)} MB)`)
  } catch (err) {
    log.error('vmp', err.message)
    await sock.sendMessage(jid, {
      text: `❌ *No se pudo descargar el manga.*\n_${err.message}_`,
      quoted: msg,
    })
  }
}
