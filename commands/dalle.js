/**
 * .dalle <texto> — genera imagen con DALL-E (IA). Respuesta con imagen.
 * Usa fetch nativo (sin axios).
 */
export default async ({ sock, jid, msg, args }) => {
  const prompt = String(args.join(' ') || '').trim()
  if (!prompt) {
    return await sock.sendMessage(jid, {
      text: '❓ Uso: `.dalle <texto>`\nEj: `.dalle un gato astronauta`', quoted: msg,
    })
  }
  try {
    await sock.sendMessage(jid, { text: '⌛ Generando imagen...', quoted: msg })
    const apiUrl = `https://eliasar-yt-api.vercel.app/api/ai/text2img?prompt=${encodeURIComponent(prompt)}`
    const res = await fetch(apiUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    await sock.sendMessage(jid, {
      image: buf,
      caption: `🎨 *DALL·E* — "${prompt}"`,
    }, { quoted: msg })
  } catch (e) {
    console.error(e)
    await sock.sendMessage(jid, { text: '❌ No se pudo generar la imagen. Intenta más tarde.', quoted: msg })
  }
}