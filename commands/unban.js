import { comandoGrupo, nombreParticipante, registrarAccion } from '../lib/comandoGrupo.js'

export default comandoGrupo({
  uso: 'Uso: /unban @usuario',
  necesitaObjetivo: true,
  accion: 'unban',
  handler: async ({ sock, jid, msg, objetivo, sender }) => {
    // Reañadirlo al grupo es la forma de levantar el baneo
    const resultado = await sock.groupParticipantsUpdate(jid, [objetivo.jid], 'add')

    if (resultado?.[0]?.status === '200') {
      registrarAccion(jid, objetivo.jid, 'unban', '', sender)
      await sock.sendMessage(jid, {
        text: `✅ *${nombreParticipante(objetivo.participante)}* fue desbloqueado y reañadido al grupo.`,
        quoted: msg,
      })
    } else {
      await sock.sendMessage(jid, {
        text: `❌ No se pudo desbloquear. Estado: ${resultado?.[0]?.status ?? 'desconocido'}`,
        quoted: msg,
      })
    }
  },
})

