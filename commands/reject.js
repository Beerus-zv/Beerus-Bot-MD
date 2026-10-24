import { comandoGrupo, registrarAccion } from '../lib/comandoGrupo.js'

export default comandoGrupo({
  uso: 'Uso: /reject <número>',
  soloAdmin: false,
  handler: async ({ sock, jid, msg, args, sender }) => {
    const numero = args[0]?.replace(/\D/g, '')
    if (!numero) {
      await sock.sendMessage(jid, {
        text: '❓ Indica el número que quieres rechazar.\n\n*Ejemplo:* `/reject 5491112345678`',
        quoted: msg,
      })
      return
    }

    const [contact] = await sock.onWhatsApp(numero)
    if (!contact?.exists) {
      await sock.sendMessage(jid, {
        text: `❌ El número *${numero}* no existe en WhatsApp.`,
        quoted: msg,
      })
      return
    }

    const resultado = await sock.groupRequestParticipantsUpdate(jid, [contact.jid], 'reject')

    if (resultado?.[0]?.status === '200') {
      registrarAccion(jid, contact.jid, 'reject', '', sender)
      await sock.sendMessage(jid, {
        text: `🚫 *+${numero}* fue rechazado.`,
        quoted: msg,
      })
    } else {
      await sock.sendMessage(jid, {
        text: `❌ No se pudo rechazar. Estado: ${resultado?.[0]?.status ?? 'desconocido'}`,
        quoted: msg,
      })
    }
  },
})

