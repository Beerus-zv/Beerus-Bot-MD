/**
 * .igstory <usuario> — descarga historias de Instagram.
 * Usa API pública + fetch nativo (sin axios).
 */
import { log } from '../lib/logger.js'

export default async ({ sock, jid, msg, args }) => {
  const user = String(args[0] || '').trim()
  if (!user) {
    return await sock.sendMessage(jid, {
      text: '❓ Uso: `.igstory @usuario`', quoted: msg,
    })
  }
  try {
    await sock.sendMessage(jid, { text: '⏳ Buscando historias...', quoted: msg })
    const res = await fetch(`https://instagram-dl-tts-api.herokuapp.com/igstory?username=${user}`)
    const data = await res.json()
    const urls = data?.medias || data?.urls || []
    if (!urls.length) {
      return await sock.sendMessage(jid, { text: '⚠️ No se encontraron historias.', quoted: msg })
    }
    for (const url of urls) {
      try {
        await sock.sendFile(jid, url, 'igstory.jpg', `📸 @${user}`, msg)
      } catch (_) {}
    }
  } catch (e) {
    log.error('igstory', e)
    await sock.sendMessage(jid, { text: '❌ Error al descargar historias.', quoted: msg })
  }
}