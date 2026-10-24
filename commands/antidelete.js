import { setAntiDelete, getAntiDelete } from '../database/db.js'
import { comandoGrupo, nombreParticipante } from '../lib/comandoGrupo.js'

/**
 * `/antidelete` — sistema anti-eliminar mensajes para grupos.
 *
 *   /antidelete on   → activa el anti-delete en este grupo
 *   /antidelete off  → desactiva el anti-delete en este grupo
 *   /antidelete list → muestra el estado actual
 */
export default comandoGrupo({
  uso: 'Uso: /antidelete on|off|list',
  necesitaObjetivo: false,
  soloAdmin: true,
  accion: 'antidelete',
  handler: async ({ sock, jid, msg, args }) => {
    const sub = (args[0] || '').toLowerCase()

    // /antidelete on
    if (sub === 'on') {
      setAntiDelete(jid, true)
      await sock.sendMessage(jid, {
        text: '✅ *Anti-delete activado* en este grupo.\n\nLos mensajes eliminados serán reenviados automáticamente con un aviso.',
        quoted: msg,
      })
      return
    }

    // /antidelete off
    if (sub === 'off') {
      setAntiDelete(jid, false)
      await sock.sendMessage(jid, {
        text: '🔕 *Anti-delete desactivado* en este grupo.\n\nLos mensajes eliminados ya no serán reenviados.',
        quoted: msg,
      })
      return
    }

    // /antidelete list
    if (sub === 'list') {
      const activo = getAntiDelete(jid)
      const estado = activo ? '🟢 *Activado*' : '🔴 *Desactivado*'
      await sock.sendMessage(jid, {
        text: `🛡️ *Anti-delete*\n\n${estado}\n\n_El bot reenviará los mensajes eliminados cuando esta función esté activada y el usuario sea administrador._`,
        quoted: msg,
      })
      return
    }

    await sock.sendMessage(jid, {
      text:
        '🛡️ *Anti-delete*\n\n' +
        '• `/antidelete on` — Activar anti-delete en este grupo\n' +
        '• `/antidelete off` — Desactivar anti-delete\n' +
        '• `/antidelete list` — Ver estado actual\n\n' +
        '_Solo los administradores pueden usar este comando._',
      quoted: msg,
    })
  },
})