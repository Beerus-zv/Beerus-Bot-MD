import { comandoGrupo, registrarAccion } from '../lib/comandoGrupo.js'

/**
 * Alterna el modo de aprobación de ingreso y el modo de añadir miembros.
 */
export default comandoGrupo({
  uso: 'Uso: /system [approval|addmode|both]',
  accion: 'system',
  handler: async ({ sock, jid, msg, args, metadata }) => {
    const opciones = ['approval', 'addmode', 'both']
    const opcion = (args[0] || 'both').toLowerCase()

    if (!opciones.includes(opcion)) {
      await sock.sendMessage(jid, {
        text: '❓ Opción inválida.\n\n*Uso:* `/system [approval|addmode|both]`\n• `approval` - Exige aprobación del admin para entrar\n• `addmode` - Quién puede añadir miembros (admin / todos)\n• `both` - Cambia ambas',
        quoted: msg,
      })
      return
    }

    const lineas = []

    if (opcion === 'approval' || opcion === 'both') {
      const activar = !metadata.joinApprovalMode
      await sock.groupJoinApprovalMode(jid, activar ? 'on' : 'off')
      registrarAccion(jid, 'grupo', activar ? 'approval_on' : 'approval_off', '', 'bot')
      lineas.push(`• Aprobación de ingreso: ${activar ? '✅ Activada' : '❌ Desactivada'}`)
    }

    if (opcion === 'addmode' || opcion === 'both') {
      const activar = !metadata.memberAddMode
      await sock.groupMemberAddMode(jid, activar ? 'all_member_add' : 'admin_add')
      registrarAccion(jid, 'grupo', activar ? 'addmode_all' : 'addmode_admin', '', 'bot')
      lineas.push(`• Quién puede añadir miembros: ${activar ? '👥 Todos' : '⭐ Solo admins'}`)
    }

    await sock.sendMessage(jid, {
      text: `⚙️ *Ajustes del grupo actualizados*\n\n${lineas.join('\n')}`,
      quoted: msg,
    })
  },
})

