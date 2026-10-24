import { comandoGrupo, registrarAccion } from '../lib/comandoGrupo.js'

export default comandoGrupo({
  accion: 'resetlink',
  handler: async ({ sock, jid, msg }) => {
    const nuevo = await sock.groupRevokeInvite(jid)

    if (!nuevo) {
      await sock.sendMessage(jid, {
        text: '❌ No se pudo revocar el código de invitación actual.',
        quoted: msg,
      })
      return
    }

    registrarAccion(jid, 'bot', 'reset_invite', '', 'bot')

    await sock.sendMessage(jid, {
      text: `🗑️ El código de invitación fue *revocado*.\n\n*Nuevo código:* ${nuevo}\n🔗 https://wa.me/${jid.split('@')[0]}/join`,
      quoted: msg,
    })
  },
})

