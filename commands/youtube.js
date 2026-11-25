import { buscarYoutube } from '../lib/internet.js'
import { log } from '../lib/logger.js'

const AYUDA = `📺 *YouTube*

*Uso:* \`/youtube <busqueda>\`

_Ejemplo:_ \`/youtube opening dragon ball super\`

_Busca videos y te da el titulo, el canal, la duracion y el enlace._`

export default async ({ sock, jid, msg, args }) => {
  const consulta = (args || []).join(' ').trim()

  if (!consulta) {
    await sock.sendMessage(jid, { text: AYUDA, quoted: msg })
    return
  }

  await sock.sendMessage(jid, {
    text: `📺 Buscando en YouTube *${consulta}*...`,
    quoted: msg,
  })

  try {
    const videos = await buscarYoutube(consulta, 5)

    if (!videos.length) {
      await sock.sendMessage(jid, {
        text: `😕 No encontré videos para *${consulta}*.`,
        quoted: msg,
      })
      return
    }

    const cuerpo = videos
      .map(
        (v, i) =>
          `*${i + 1}.* ${v.titulo}\n` +
          `👤 ${v.canal} • ⏱️ ${v.duracion}${v.vistas ? ` • 👀 ${v.vistas}` : ''}\n` +
          `🔗 ${v.url}`
      )
      .join('\n\n')

    await sock.sendMessage(jid, {
      text: `📺 *YouTube:* _${consulta}_\n\n${cuerpo}`,
      quoted: msg,
    })
  } catch (err) {
    log.error('Error buscando en YouTube', err)
    await sock.sendMessage(jid, {
      text: `💥 *Falló la búsqueda en YouTube.*\n_${err.message}_`,
      quoted: msg,
    })
  }
}
