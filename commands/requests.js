import { comandoGrupo, nombreParticipante } from '../lib/comandoGrupo.js'

export default comandoGrupo({
  handler: async ({ sock, jid, msg }) => {
    const solicitudes = await sock.groupRequestParticipantsList(jid)

    if (!solicitudes?.length) {
      await sock.sendMessage(jid, {
        text: '📭 No hay solicitudes de ingreso pendientes.',
        quoted: msg,
      })
      return
    }

    const lista = solicitudes
      .map((s) => {
        const solicitante = s.jid || s.requestJid || Object.values(s)[0]
        return `• ${solicitante}`
      })
      .join('\n')

    await sock.sendMessage(jid, {
      text: `📥 *Solicitudes de ingreso pendientes* (${solicitudes.length})\n\n${lista}\n\n_Usa /approve <número> o /reject <número>._`,
      quoted: msg,
    })
  },
})

