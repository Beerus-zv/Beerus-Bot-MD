import { pedirJson } from '../lib/internet.js'

const AYUDA =
  '🎵 *Letra de canción*\n\n' +
  '*Uso:* `/letra <artista> | <canción>`\n\n' +
  '*Ejemplo:* `/letra Soda Stereo | De Música Ligera`\n\n' +
  '_Tiene un límite de caracteres por el servicio lyrics.ovh._'

/**
 * Busca la letra de una canción en la API gratuita lyrics.ovh
 * (copia del plugin 'lyrics' de MEGA-MD).
 * Uso: /letra <artista> | <titulo>
 */
export default async ({ sock, jid, msg, args }) => {
  const texto = args?.join(' ') || ''
  if (!texto.includes('|')) {
    await sock.sendMessage(jid, { text: AYUDA, quoted: msg })
    return
  }

  const partes = texto.split('|').map((p) => p.trim()).filter(Boolean)
  if (partes.length < 2) {
    await sock.sendMessage(jid, { text: AYUDA, quoted: msg })
    return
  }

  const [artista, cancion] = partes
  await sock.sendMessage(jid, { text: `🔎 Buscando la letra de *${cancion}*...` })

  try {
    const d = await pedirJson(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artista)}/${encodeURIComponent(cancion)}`,
      { timeout: 15000 }
    )

    if (!d.lyrics) throw new Error('SIN LETRA')

    const letra =
      d.lyrics.length > 1800 ? `${d.lyrics.slice(0, 1800)}\n\n… (fracción recortada, es demasiado larga)` : d.lyrics

    await sock.sendMessage(jid, {
      text:
        `🎵 *${cancion}* — _${artista}_\n\n` +
        `${letra}`,
      quoted: msg,
    })
  } catch (err) {
    const noExiste = String(err?.message).includes('404')
    await sock.sendMessage(jid, {
      text: noExiste
        ? `❓ No encontré la letra de *${cancion}* de ${artista}. Prueba otro título o corrección de nombre.`
        : '❌ Falló la búsqueda de la letra. El servicio lyrics.ovh anda aletargado; intenta luego.',
      quoted: msg,
    })
  }
}
