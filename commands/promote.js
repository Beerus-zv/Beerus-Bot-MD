import { comandoGrupo, nombreParticipante, registrarAccion } from '../lib/comandoGrupo.js'

export default comandoGrupo({
  uso: 'Uso: /promote @usuario',
  necesitaObjetivo: true,
  accion: 'promote',
  handler: async ({ sock, jid, msg, objetivo, sender }) => {
    if (objetivo.participante?.admin) {
      await sock.sendMessage(jid, {
        text: `ℹ️ *${nombreParticipante(objetivo.participante)}* ya es administrador.`,
        quoted: msg,
      })
      return
    }

    const resultado = await sock.groupParticipantsUpdate(jid, [objetivo.jid], 'promote')

    if (resultado?.[0]?.status === '200') {
      registrarAccion(jid, objetivo.jid, 'promote', '', sender)
      await sock.sendMessage(jid, {
        text: `✅ *${nombreParticipante(objetivo.participante)}* ahora es administrador.`,
        quoted: msg,
      })
    } else {
      await sock.sendMessage(jid, {
        text: `❌ No se pudo promover. Estado: ${resultado?.[0]?.status ?? 'desconocido'}`,
        quoted: msg,
      })
    }
  },
})

