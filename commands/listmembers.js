import { comandoGrupo } from '../lib/comandoGrupo.js'
import { tokenMencion } from '../lib/grupo.js'

export default comandoGrupo({
  soloAdmin: false,
  handler: async ({ sock, jid, msg, metadata }) => {
    const participantes = metadata.participants || []
    if (!participantes.length) {
      await sock.sendMessage(jid, { text: '👥 No se pudieron obtener los miembros.', quoted: msg })
      return
    }

    const lista = participantes
      .map((p) => {
        const marca = p.isSuperAdmin || p.admin === 'superadmin' ? '👑' : p.admin || p.isAdmin ? '⭐' : '👤'
        const token = tokenMencion(p.id)
        const nombre = p.name || p.pushName || p.verifiedName || p.notify || token
        const linea = token && nombre !== token ? `${marca} ${nombre} ${token}` : `${marca} ${nombre}`
        return linea.replace(/\s+/g, ' ').trim()
      })
      .join('\n')

    await sock.sendMessage(jid, {
      text: `👥 *Miembros del grupo* (${participantes.length})\n\n${lista}`,
      mentions: participantes.map((p) => p.id),
      quoted: msg,
    })
  },
})
