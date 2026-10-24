import { comandoGrupo, nombreParticipante, registrarAccion } from '../lib/comandoGrupo.js'

export default comandoGrupo({
  uso: 'Uso: /kick @usuario [razón]',
  necesitaObjetivo: true,
  accion: 'kick',
  handler: async ({ sock, jid, msg, args, objetivo, sender }) => {
    const razon = args.slice(1).join(' ')

    const resultado = await sock.groupParticipantsUpdate(jid, [objetivo.jid], 'remove')

    if (resultado?.[0]?.status === '200') {
      registrarAccion(jid, objetivo.jid, 'kick', razon, sender)
      await sock.sendMessage(jid, {
        text: `🚪 *${nombreParticipante(objetivo.participante)}* fue expulsado del grupo.${razon ? `\n\n_Razón:_ ${razon}` : ''}`,
        quoted: msg,
      })
    } else {
      await sock.sendMessage(jid, {
        text: `❌ No se pudo expulsar. Estado: ${resultado?.[0]?.status ?? 'desconocido'}`,
        quoted: msg,
      })
    }
  },
})

