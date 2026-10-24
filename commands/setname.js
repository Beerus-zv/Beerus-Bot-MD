import { comandoGrupo, registrarAccion } from '../lib/comandoGrupo.js'

export default comandoGrupo({
  uso: 'Uso: /setname <nombre nuevo>',
  handler: async ({ sock, jid, msg, args }) => {
    const nombre = args.join(' ').trim()
    if (!nombre) {
      await sock.sendMessage(jid, {
        text: '❓ Indica el nuevo nombre del grupo.\n\n*Ejemplo:* `/setname Beerus Fans`',
        quoted: msg,
      })
      return
    }

    await sock.groupUpdateSubject(jid, nombre)
    registrarAccion(jid, 'grupo', 'setname', nombre, 'bot')

    await sock.sendMessage(jid, {
      text: `✅ Nombre del grupo cambiado a *${nombre}*`,
      quoted: msg,
    })
  },
})

