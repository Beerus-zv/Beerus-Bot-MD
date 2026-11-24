/**
 * `/imagen <búsqueda>` — busca imágenes y las manda al chat.
 *
 *   /imagen gato negro          manda hasta 3 imágenes
 *   /imagen 5 zorros            manda hasta 5 (máximo 6)
 *
 * Usa el buscador de imágenes de DuckDuckGo que ya usa el menú para los
 * banners, así que no suma dependencias ni claves de API.
 */
import { buscarImagenes, pedirBuffer } from '../lib/internet.js'

const MAXIMO = 6
const POR_DEFECTO = 3
const MAX_BYTES = 6 * 1024 * 1024

export default async ({ sock, jid, msg, args }) => {
  const partes = [...(args || [])]

  // Primer argumento numérico = cantidad pedida
  let cantidad = POR_DEFECTO
  if (partes.length && /^\d+$/.test(partes[0])) {
    cantidad = Math.min(MAXIMO, Math.max(1, Number(partes.shift())))
  }

  const consulta = partes.join(' ').trim()
  if (!consulta) {
    return sock.sendMessage(jid, {
      text:
        '🖼️ *Buscar imágenes*\n\n' +
        '• `/imagen gato negro`\n' +
        `• \`/imagen 5 zorros\` (máximo ${MAXIMO})\n\n` +
        '_Devuelve las imágenes como archivos, no como stickers._',
      quoted: msg,
    })
  }

  await sock.sendMessage(jid, {
    text: `🔎 Buscando *${consulta}*...`,
    quoted: msg,
  })

  let resultados = []
  try {
    resultados = await buscarImagenes(consulta, Math.max(cantidad * 3, 10))
  } catch (err) {
    return sock.sendMessage(jid, {
      text: `❌ El buscador no respondió: ${err.message}`,
      quoted: msg,
    })
  }

  if (!resultados.length) {
    return sock.sendMessage(jid, {
      text: `📭 Sin resultados para *${consulta}*.`,
      quoted: msg,
    })
  }

  let enviadas = 0
  for (const imagen of resultados) {
    if (enviadas >= cantidad) break
    try {
      const buffer = await pedirBuffer(imagen.url, { maxBytes: MAX_BYTES })
      if (!buffer?.length) continue
      await sock.sendMessage(jid, {
        image: buffer,
        caption: enviadas === 0 ? `🖼️ *${consulta}*` : undefined,
        quoted: enviadas === 0 ? msg : undefined,
      })
      enviadas++
    } catch {
      // Una URL rota o lenta no corta la búsqueda: se prueba la siguiente
    }
  }

  if (!enviadas) {
    return sock.sendMessage(jid, {
      text: `❌ Encontré ${resultados.length} resultados pero ninguna imagen se pudo descargar.`,
      quoted: msg,
    })
  }

  return
}
