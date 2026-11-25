import { pedir } from '../lib/internet.js'
import { log } from '../lib/logger.js'

/**
 * Acortador de URLs con TinyURL (basado en el plugin 'tiny' de MEGA-MD).
 * Uso: /acortar https://enlace-largo...
 */
export default async ({ sock, jid, msg, args }) => {
  const url = (args?.[0] || '').trim()
  const valida = /^https?:\/\/[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(url)

  if (!valida) {
    await sock.sendMessage(jid, {
      text:
        '✂️ *Acortar enlace*\n\n' +
        '*Uso:* `/acortar <url completa>`\n\n' +
        '*Ejemplo:* `/acortar https://github.com/GlobalTechInfo/MEGA-MD`',
      quoted: msg,
    })
    return
  }

  await sock.sendMessage(jid, { text: '✂️ Acortando el enlace...' })

  try {
    const corto = (
      await pedir(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, {
        timeout: 15000,
      })
    ).trim()

    if (!/^https?:\/\//i.test(corto)) throw new Error('resp invalida')

    await sock.sendMessage(jid, {
      text:
        `✂️ *Enlace acortado*\n\n` +
        `🔗 *Original:* ${url}\n` +
        `📌 *Corto:* ${corto}`,
      quoted: msg,
    })
  } catch (err) {
    log.error('Error acortando la url', err)
    await sock.sendMessage(jid, {
      text: '❌ No se pudo acortar el enlace. El servicio anda saturado; intenta luego.',
      quoted: msg,
    })
  }
}
