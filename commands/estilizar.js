/**
 * `/estilizar` — convierte un texto a distintos estilos.
 *
 *   /estilizar bonito Hola mundo
 *   /estilizar negrita Hola mundo
 */
import { ALFABETO_ESTILOS, ESTILOS_TEXTO, aplicarEstilo } from '../lib/juegos.js'

export default async ({ sock, jid, msg, args }) => {
  const estilo = (args[0] || '').toLowerCase()
  const texto = args.slice(1).join(' ')

  if (!estilo || !texto) {
    await sock.sendMessage(jid, {
      text:
        `✒️ *Estilizar texto*\n\n` +
        `*Uso:* /estilizar <estilo> <texto>\n\n` +
        `*Estilos:* ${Object.keys(ALFABETO_ESTILOS).join(', ')}\n\n` +
        `*Ejemplos:*\n` +
        `• /estilizar bonito Hola\n` +
        `• /estilizar negrita Hola\n` +
        `• /estilizar mayus Hola`,
      quoted: msg,
    })
    return
  }

  const unicode = aplicarEstilo(texto, estilo)
  const whatsapp = ESTILOS_TEXTO[estilo] ? ESTILOS_TEXTO[estilo](texto) : null

  if (!unicode && !whatsapp) {
    await sock.sendMessage(jid, {
      text:
        `❓ Estilo desconocido: *${estilo}*\n\n` +
        `*Disponibles:* ${Object.keys(ALFABETO_ESTILOS).join(', ')}`,
      quoted: msg,
    })
    return
  }

  const partes = []
  if (unicode) partes.push(`*Unicode:*\n${unicode}`)
  if (whatsapp && whatsapp !== unicode) partes.push(`*WhatsApp:*\n${whatsapp}`)

  await sock.sendMessage(jid, {
    text: `✒️ *Estilo ${estilo}*\n\n${partes.join('\n\n')}`,
    quoted: msg,
  })
}
