import { comandoGrupo, nombreParticipante } from '../lib/comandoGrupo.js'

export default comandoGrupo({
  soloAdmin: false,
  handler: async ({ sock, jid, msg, metadata }) => {
    const admins = (metadata.participants || []).filter(
      (p) => p.isAdmin || p.isSuperAdmin || p.admin
    )

    if (!admins.length) {
      await sock.sendMessage(jid, { text: '👤 Este grupo no tiene administradores.', quoted: msg })
      return
    }

    const lista = admins
      .map(
        (p) =>
          `• ${nombreParticipante(p)} ${p.isSuperAdmin || p.admin === 'superadmin' ? '👑' : '⭐'}`
      )
      .join('\n')

    await sock.sendMessage(jid, {
      text: `👑 *Administradores del grupo* (${admins.length})\n\n${lista}`,
      quoted: msg,
    })
  },
})

