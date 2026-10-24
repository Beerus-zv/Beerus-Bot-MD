import { comandoGrupo, nombreParticipante, registrarAccion } from '../lib/comandoGrupo.js'

export default comandoGrupo({
  uso: 'Uso: /demote @usuario',
  necesitaObjetivo: true,
  accion: 'demote',
  handler: async ({ sock, jid, msg, objetivo, sender }) => {
    if (!objetivo.participante?.admin) {
      await sock.sendMessage(jid, {
        text: `ℹ️ *${nombreParticipante(objetivo.participante)}* no es administrador.`,
        quoted: msg,
      })
      return
    }

    const resultado = await sock.groupParticipantsUpdate(jid, [objetivo.jid], 'demote')

    if (resultado?.[0]?.status === '200') {
      registrarAccion(jid, objetivo.jid, 'demote', '', sender)
      await sock.sendMessage(jid, {
        text: `✅ *${nombreParticipante(objetivo.participante)}* ya no es administrador.`,
        quoted: msg,
      })
    } else {
      await sock.sendMessage(jid, {
        text: `❌ No se pudo quitar la administración. Estado: ${resultado?.[0]?.status ?? 'desconocido'}`,
        quoted: msg,
      })
    }
  },
})

