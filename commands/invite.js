import { comandoGrupo, registrarAccion } from '../lib/comandoGrupo.js'

export default comandoGrupo({
  accion: 'invite',
  handler: async ({ sock, jid, msg }) => {
    const codigo = await sock.groupInviteCode(jid)

    if (!codigo) {
      await sock.sendMessage(jid, {
        text: '❌ No se pudo generar el código de invitación.',
        quoted: msg,
      })
      return
    }

    registrarAccion(jid, 'bot', 'invite', '', 'bot')

    await sock.sendMessage(jid, {
      text: `🔗 *Código de invitación:*\n${codigo}\n\n📎 *Enlace:* \`https://wa.me/${jid.split('@')[0]}/join\``,
      quoted: msg,
    })
  },
})

