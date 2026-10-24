import { pedirJson } from '../lib/internet.js'

/**
 * Datos de una IP con la API gratuita ipwho.is (plugin 'iplookup' de MEGA-MD).
 * Uso: /ip 8.8.8.8          | /ip (info de tu IP al dejar vacio)
 */
export default async ({ sock, jid, msg, args }) => {
  const objetivo = (args?.[0] || '').trim()

  if (objetivo && !/^[a-f0-9.:]+$/i.test(objetivo)) {
    await sock.sendMessage(jid, {
      text: '❓ Ese texto no parece una IP válida. Ejemplos: `/ip 8.8.8.8`, `/ip 1.1.1.1`',
      quoted: msg,
    })
    return
  }

  await sock.sendMessage(jid, { text: '🔎 Rastreando la ip...' })

  try {
    const d = await pedirJson(`https://ipwho.is/${encodeURIComponent(objetivo)}`)

    if (d.success === false) {
      await sock.sendMessage(jid, {
        text: `❓ No hay datos para esa IP: ${d.message || 'desconocido'}.`,
        quoted: msg,
      })
      return
    }

    const ubicacion = [d.city, d.region, d.country].filter(Boolean).join(', ')

    const texto =
      `🌐 *Seguimiento de IP*\n\n` +
      `📍 *IP:* ${d.ip}\n` +
      `🌍 *Ubicación:* ${ubicacion || '—'}\n` +
      (d.flag?.emoji ? `${d.flag.emoji} *País:* ${d.country} (${d.country_code})\n` : '') +
      `🏙️ *Zona horaria:* ${d.timezone?.id || '—'}\n` +
      (d.connection?.isp ? `📡 *Proveedor (ISP):* ${d.connection.isp}\n` : '') +
      (d.connection?.org ? `🏢 *Organización:* ${d.connection.org}\n` : '') +
      (d.connection?.domain ? `🔗 *Dominio:* ${d.connection.domain}\n` : '') +
      (d.type ? `🔧 *Tipo:* ${d.type}\n` : '') +
      (d.latitude && d.longitude
        ? `🗺️ *Coordenadas:* ${d.latitude}, ${d.longitude}\n` +
          `_Mapa: https://www.google.com/maps?q=${d.latitude},${d.longitude}_`
        : '')

    await sock.sendMessage(jid, { text: texto, quoted: msg })
  } catch (err) {
    console.error('Error rastreando ip:', err)
    await sock.sendMessage(jid, {
      text: '❌ No se pudo consultar la IP. El servicio no responde en este momento.',
      quoted: msg,
    })
  }
}
