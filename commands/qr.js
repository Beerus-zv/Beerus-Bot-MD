/**
 * `/qr` — genera un código QR de un texto o enlace.
 *
 *   /qr https://beerus-bot-md.com
 */
import QRCode from 'qrcode'
import { log } from '../lib/logger.js'

export default async ({ sock, jid, msg, args }) => {
  const texto = args.join(' ').trim()

  if (!texto) {
    await sock.sendMessage(jid, {
      text:
        `🔳 *Generador de QR*\n\n` +
        `*Uso:* /qr <texto o enlace>\n\n` +
        `*Ejemplo:* /qr https://github.com`,
      quoted: msg,
    })
    return
  }

  try {
    const imagen = await QRCode.toBuffer(texto, {
      type: 'png',
      width: 600,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#1e0b3c', light: '#ffffff' },
    })

    await sock.sendMessage(jid, {
      image: imagen,
      caption: `🔳 *Código QR*\n\n${texto.slice(0, 300)}`,
      quoted: msg,
    })
  } catch (err) {
    log.error('Error generando el QR', err)
    await sock.sendMessage(jid, {
      text: '❌ No se pudo generar el código QR.',
      quoted: msg,
    })
  }
}
