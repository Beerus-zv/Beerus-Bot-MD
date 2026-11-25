import { buscarWeb } from '../lib/internet.js'
import { log } from '../lib/logger.js'

const AYUDA = `🔎 *Búsqueda web*

*Uso:* \`/buscar <lo que buscas>\`

_Ejemplo:_ \`/buscar dios de la destruccion\`

_Busca en internet y te devuelve los mejores resultados._`

export default async ({ sock, jid, msg, args }) => {
  const consulta = (args || []).join(' ').trim()

  if (!consulta) {
    await sock.sendMessage(jid, { text: AYUDA, quoted: msg })
    return
  }

  await sock.sendMessage(jid, {
    text: `🔎 Buscando *${consulta}*...`,
    quoted: msg,
  })

  try {
    const resultados = await buscarWeb(consulta, 5)

    if (!resultados.length) {
      await sock.sendMessage(jid, {
        text: `😕 No encontré nada para *${consulta}*.\n\n_${'Prueba con otras palabras.'}_`,
        quoted: msg,
      })
      return
    }

    const cuerpo = resultados
      .map(
        (r, i) =>
          `*${i + 1}.* ${r.titulo}\n` +
          `🔗 ${r.url}\n` +
          (r.resumen ? `_${r.resumen}_\n` : '')
      )
      .join('\n')

    await sock.sendMessage(jid, {
      text: `🔎 *Resultados de* _${consulta}_\n\n${cuerpo}`,
      quoted: msg,
    })
  } catch (err) {
    log.error('Error en la busqueda web', err)
    await sock.sendMessage(jid, {
      text: `💥 *Falló la búsqueda.*\n_${err.message}_\n\n_Intenta de nuevo en un momento._`,
      quoted: msg,
    })
  }
}
