import { comandoGrupo } from '../lib/comandoGrupo.js'
import { historialGrupo } from '../database/db.js'

export default comandoGrupo({
  soloAdmin: false,
  handler: async ({ sock, jid, msg }) => {
    const historial = historialGrupo(jid, 15)

    if (!historial.length) {
      await sock.sendMessage(jid, {
        text: '📋 Todavía no hay acciones de moderación registradas en este grupo.',
        quoted: msg,
      })
      return
    }

    const ETIQUETAS = {
      ban: 'Baneo',
      kick: 'Expulsión',
      promote: 'Promoción',
      demote: 'Quitar admin',
      add: 'Añadido',
      unban: 'Desbaneo',
      approve: 'Aprobado',
      reject: 'Rechazado',
      invite: 'Invitación',
      reset_invite: 'Link revocado',
      mute_on: 'Silenciar on',
      mute_off: 'Silenciar off',
      restrict_on: 'Restringir on',
      restrict_off: 'Restringir off',
      approval_on: 'Aprobación on',
      approval_off: 'Aprobación off',
      addmode_all: 'Añadir todos',
      addmode_admin: 'Añadir admins',
      setname: 'Nombre',
      setdesc: 'Descripción',
      leave: 'Salida',
      antilink_on_kick: 'Antilink on (kick)',
      antilink_on_ban: 'Antilink on (ban)',
      antilink_on_delete: 'Antilink on (aviso)',
      antilink_off: 'Antilink off',
      antilink_accion: 'Antilink acción',
      antilink_allow: 'Antilink permitir',
      antilink_deny: 'Antilink quitar',
    }

    const lista = historial
      .map((h) => {
        const etiqueta = ETIQUETAS[h.accion] || h.accion
        const razon = h.razon ? ` — _${h.razon}_` : ''
        return `• *${etiqueta}* → \`${h.jid}\`${razon}\n  _${h.creado_en}_`
      })
      .join('\n')

    await sock.sendMessage(jid, {
      text: `📋 *Registro de moderación* (últimas ${historial.length})\n\n${lista}`,
      quoted: msg,
    })
  },
})

