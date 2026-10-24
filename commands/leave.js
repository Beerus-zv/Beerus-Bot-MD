import { comandoGrupo, registrarAccion } from '../lib/comandoGrupo.js'

export default comandoGrupo({
  handler: async ({ sock, jid, msg }) => {
    registrarAccion(jid, 'bot', 'leave', '', 'bot')

    await sock.groupLeave(jid)

    await sock.sendMessage(jid, {
      text: '👋 Abandonando el grupo. ¡Hasta luego!',
      quoted: msg,
    }).catch(() => {
      // El bot puede salir antes de poder enviar el mensaje
    })
  },
})

