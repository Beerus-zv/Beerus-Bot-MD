import { comandoGrupo, nombreParticipante, registrarAccion } from '../lib/comandoGrupo.js'

/**
 * Baneo real de WhatsApp: primero promueve a admin, luego elimina.
 * Eliminar a un admin lo deja en la lista de baneados.
 */
export default comandoGrupo({
  uso: 'Uso: /ban @usuario [razón]',
  necesitaObjetivo: true,
  accion: 'ban',
  handler: async ({ sock, jid, msg, args, objetivo, sender }) => {
    const razon = args.slice(1).join(' ')

    // 1) Promueve a admin (necesario para que la eliminación lo banee)
    const promocion = await sock.groupParticipantsUpdate(jid, [objetivo.jid], 'promote')
    if (promocion?.[0]?.status !== '200') {
      await sock.sendMessage(jid, {
        text: `❌ No se pudo preparar el baneo. Estado: ${promocion?.[0]?.status ?? 'desconocido'}`,
        quoted: msg,
      })
      return
    }

    // 2) Eliminar -> queda baneado
    const remocion = await sock.groupParticipantsUpdate(jid, [objetivo.jid], 'remove')
    if (remocion?.[0]?.status === '200') {
      registrarAccion(jid, objetivo.jid, 'ban', razon, sender)
      await sock.sendMessage(jid, {
        text: `🚫 *${nombreParticipante(objetivo.participante)}* fue baneado del grupo.${razon ? `\n\n_Razón:_ ${razon}` : ''}`,
        quoted: msg,
      })
    } else {
      await sock.sendMessage(jid, {
        text: `❌ No se pudo banear. Estado: ${remocion?.[0]?.status ?? 'desconocido'}`,
        quoted: msg,
      })
    }
  },
})

