import { comandoGrupo, registrarAccion } from '../lib/comandoGrupo.js'

export default comandoGrupo({
  uso: 'Uso: /setdesc <descripción>',
  handler: async ({ sock, jid, msg, args }) => {
    const descripcion = args.join(' ').trim()
    if (!descripcion) {
      await sock.sendMessage(jid, {
        text: '❓ Indica la nueva descripción.\n\n*Ejemplo:* `/setdesc Reglas: sé amable`',
        quoted: msg,
      })
      return
    }

    await sock.groupUpdateDescription(jid, descripcion)
    registrarAccion(jid, 'grupo', 'setdesc', descripcion, 'bot')

    await sock.sendMessage(jid, {
      text: '✅ Descripción del grupo actualizada.',
      quoted: msg,
    })
  },
})

