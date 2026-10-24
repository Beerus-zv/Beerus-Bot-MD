/**
 * #topcount (también #topmensajes) — top de usuarios con más mensajes
 * escritos en el grupo (estilo Neko). Usa la tabla mensajes_grupo.
 */
import { topMensajesGrupo, obtenerUsuario, marcarUso } from '../database/db.js'
import { tokenMencion } from '../lib/grupo.js'
import { nombreLegible, formatearNumero, recargaActiva } from '../lib/economia.js'

export default async ({ sock, jid, msg, sender }) => {
  const quien = sender || msg.key.participant || jid

  const espera = recargaActiva(quien, 'topcount')
  if (espera) {
    await sock.sendMessage(jid, { text: espera, quoted: msg })
    return
  }

  const top = topMensajesGrupo(jid, 10)
  if (!top.length) {
    await sock.sendMessage(jid, {
      text: '📊 *Aún no hay mensajes contados en este grupo.*\n_Escribe y el reino empezará a registrar._',
      quoted: msg,
    })
    return
  }
  marcarUso(quien, 'topcount')

  const medalla = ['🥇', '🥈', '🥉']
  const lineas = top
    .map((fila, i) => {
      const nombre = nombreLegible(fila.usuario, obtenerUsuario)
      const puesto = medalla[i] || `> ${i + 1}`
      return `${puesto} ${nombre} ${tokenMencion(fila.usuario)} — *${formatearNumero(fila.cuenta)}*`
    })
    .join('\n')

  await sock.sendMessage(jid, {
    text:
      `📊 *Top de mensajes del grupo* 🏆\n\n` +
      `${lineas}\n\n` +
      '_El contador arranca desde que Beerus llegó._',
    mentions: top.map((f) => f.usuario),
    quoted: msg,
  })
}
