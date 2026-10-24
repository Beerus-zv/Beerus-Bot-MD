import { comandoGrupo, registrarAccion } from '../lib/comandoGrupo.js'
import {
  obtenerAntilink,
  configurarAntilink,
  activarAntilink,
  desactivarAntilink,
  agregarDominioPermitido,
  quitarDominioPermitido,
  dominiosPermitidos,
} from '../database/db.js'

const USO = `🛡️ *Antilink*

*Uso:*
• \`/antilink on [kick|ban|delete]\` - Activar el control de enlaces
• \`/antilink off\` - Desactivar el control de enlaces
• \`/antilink status\` - Ver el estado actual
• \`/antilink accion <kick|ban|delete>\` - Cambiar la acción
• \`/antilink allow <dominio>\` - Permitir un dominio
• \`/antilink deny <dominio>\` - Quitar un dominio permitido
• \`/antilink list\` - Ver los dominios permitidos
• \`/antilink reset\` - Borrar todos los permisos

_Acciones: \`kick\` expulsa, \`ban\` expulsa y bloquea, \`delete\` solo avisa._`

const ACCIONES = ['kick', 'ban', 'delete']

export default comandoGrupo({
  accion: 'antilink',
  handler: async ({ sock, jid, msg, args, sender }) => {
    const accion = String(args[0] || '').toLowerCase()
    const resto = args.slice(1)

    // Activar
    if (accion === 'on' || accion === 'activar') {
      const tipo = String(resto[0] || 'kick').toLowerCase()
      if (!ACCIONES.includes(tipo)) {
        await sock.sendMessage(jid, {
          text: '❌ Acción no válida. Usa: `kick`, `ban` o `delete`.',
          quoted: msg,
        })
        return
      }

      activarAntilink(jid, tipo)
      registrarAccion(jid, '', `antilink_on_${tipo}`, '', sender)

      await sock.sendMessage(jid, {
        text: `🛡️ *Antilink activado* en este grupo.\nAcción ante un enlace: *${tipo}*\n\n${USO}`,
        quoted: msg,
      })
      return
    }

    // Desactivar
    if (accion === 'off' || accion === 'desactivar') {
      desactivarAntilink(jid)
      registrarAccion(jid, '', 'antilink_off', '', sender)

      await sock.sendMessage(jid, {
        text: '🔓 *Antilink desactivado* en este grupo.',
        quoted: msg,
      })
      return
    }

    // Estado
    if (accion === 'status' || accion === 'estado') {
      const config = obtenerAntilink(jid)
      const dominios = dominiosPermitidos(jid)

      if (!config) {
        await sock.sendMessage(jid, {
          text: `🛡️ *Antilink*\n\n📭 No hay configuración en este grupo.\n\n${USO}`,
          quoted: msg,
        })
        return
      }

      const estado = config.activo
        ? `🟢 *Activo*\nAcción: *${config.accion}*`
        : '🔴 *Desactivado*'

      const lista = dominios.length
        ? `\n\n*Dominios permitidos:*\n${dominios.map((d) => `• ${d}`).join('\n')}`
        : '\n\n_No hay dominios permitidos._'

      await sock.sendMessage(jid, { text: `🛡️ *Antilink*\n\n${estado}${lista}\n\n${USO}`, quoted: msg })
      return
    }

    // Cambiar la acción
    if (accion === 'accion' || accion === 'acción') {
      const tipo = String(resto[0] || '').toLowerCase()
      if (!ACCIONES.includes(tipo)) {
        await sock.sendMessage(jid, {
          text: '❌ Acción no válida. Usa: `kick`, `ban` o `delete`.',
          quoted: msg,
        })
        return
      }

      const actual = obtenerAntilink(jid)
      configurarAntilink(jid, {
        activo: actual?.activo ?? 0,
        whitelist: actual?.whitelist ?? '',
        accion: tipo,
      })
      registrarAccion(jid, '', 'antilink_accion', tipo, sender)

      await sock.sendMessage(jid, {
        text: `🛡️ Acción del antilink cambiada a *${tipo}*.`,
        quoted: msg,
      })
      return
    }

    // Permitir un dominio
    if (accion === 'allow' || accion === 'permitir' || accion === 'permit') {
      const dominio = resto.join(' ').trim()
      if (!dominio) {
        await sock.sendMessage(jid, { text: '❓ Indica el dominio a permitir.', quoted: msg })
        return
      }

      const limpio = dominio.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
      agregarDominioPermitido(jid, limpio)
      registrarAccion(jid, '', 'antilink_allow', limpio, sender)

      await sock.sendMessage(jid, {
        text: `✅ Dominio permitido: *${limpio}*`,
        quoted: msg,
      })
      return
    }

    // Quitar un dominio permitido
    if (accion === 'deny' || accion === 'block' || accion === 'bloquear') {
      const dominio = resto.join(' ').trim()
      if (!dominio) {
        await sock.sendMessage(jid, { text: '❓ Indica el dominio a quitar.', quoted: msg })
        return
      }

      const limpio = dominio.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
      quitarDominioPermitido(jid, limpio)
      registrarAccion(jid, '', 'antilink_deny', limpio, sender)

      await sock.sendMessage(jid, {
        text: `🚫 Dominio quitado de la lista de permitidos: *${limpio}*`,
        quoted: msg,
      })
      return
    }

    // Listar dominios permitidos
    if (accion === 'list' || accion === 'ls') {
      const dominios = dominiosPermitidos(jid)

      if (!dominios.length) {
        await sock.sendMessage(jid, {
          text: '📋 *Dominios permitidos*\n\n_(ninguno)_\n\nUsa `/antilink allow <dominio>` para añadir uno.',
          quoted: msg,
        })
        return
      }

      await sock.sendMessage(jid, {
        text: `📋 *Dominios permitidos*\n\n${dominios.map((d) => `• ${d}`).join('\n')}`,
        quoted: msg,
      })
      return
    }

    // Reset completo
    if (accion === 'reset' || accion === 'limpiar') {
      const actual = obtenerAntilink(jid)
      configurarAntilink(jid, {
        activo: false,
        whitelist: '',
        accion: actual?.accion ?? 'kick',
      })

      await sock.sendMessage(jid, {
        text: '🧹 Se borraron los dominios permitidos y el antilink quedó desactivado.',
        quoted: msg,
      })
      return
    }

    await sock.sendMessage(jid, { text: USO, quoted: msg })
  },
})