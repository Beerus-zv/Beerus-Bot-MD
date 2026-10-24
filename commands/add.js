import { comandoGrupo, registrarAccion } from '../lib/comandoGrupo.js'

export default comandoGrupo({
  accion: 'add',
  handler: async ({ sock, jid, msg, args, sender }) => {
    const numero = args[0]?.replace(/\D/g, '')
    if (!numero) {
      await sock.sendMessage(jid, {
        text: '❓ Indica el número con código de país.\n\n*Ejemplo:* `/add 5491112345678`',
        quoted: msg,
      })
      return
    }

    // Resuelve el número a un JID real
    const [contact] = await sock.onWhatsApp(numero)
    if (!contact?.exists) {
      await sock.sendMessage(jid, {
        text: `❌ El número *${numero}* no existe en WhatsApp o no tiene cuenta.`,
        quoted: msg,
      })
      return
    }

    const resultado = await sock.groupParticipantsUpdate(jid, [contact.jid], 'add')

    if (resultado?.[0]?.status === '200') {
      registrarAccion(jid, contact.jid, 'add', '', sender)
      await sock.sendMessage(jid, {
        text: `✅ *+${numero}* fue añadido al grupo.`,
        quoted: msg,
      })
    } else {
      await sock.sendMessage(jid, {
        text: `❌ No se pudo añadir. Estado: ${resultado?.[0]?.status ?? 'desconocido'}\n\n_Si el grupo tiene aprobación activada, usa /requests._`,
        quoted: msg,
      })
    }
  },
})

