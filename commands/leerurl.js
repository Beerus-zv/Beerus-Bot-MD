import { leerUrl } from '../lib/internet.js'

const AYUDA = `🔗 *Leer una pagina web*

*Uso:* \`/leerurl <enlace>\`

_Ejemplo:_ \`/leerurl https://es.wikipedia.org/wiki/Beerus\`

_Baja la pagina y te devuelve el texto limpio._`

export default async ({ sock, jid, msg, args }) => {
  const url = (args || []).join(' ').trim()

  if (!url) {
    await sock.sendMessage(jid, { text: AYUDA, quoted: msg })
    return
  }

  if (!/^https?:\/\//i.test(url)) {
    await sock.sendMessage(jid, {
      text: `❓ Necesito un enlace completo.\n_Ejemplo: ${'/' }leerurl https://ejemplo.com_`,
      quoted: msg,
    })
    return
  }

  await sock.sendMessage(jid, {
    text: `🔗 Leyendo *${url}*...`,
    quoted: msg,
  })

  try {
    const pagina = await leerUrl(url, 1600)

    await sock.sendMessage(jid, {
      text:
        `🔗 *${pagina.titulo}*\n\n` +
        `${pagina.texto}\n\n` +
        `_... ${pagina.total} caracteres leidos._`,
      quoted: msg,
    })
  } catch (err) {
    console.error('Error leyendo la URL:', err)
    await sock.sendMessage(jid, {
      text: `💥 *No pude leer esa pagina.*\n_${err.message}_`,
      quoted: msg,
    })
  }
}
