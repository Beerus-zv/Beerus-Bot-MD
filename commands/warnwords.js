import {
  agregarPalabraProhibida,
  quitarPalabraProhibida,
  listarPalabrasProhibidas,
  limpiarPalabrasProhibidas,
} from '../database/db.js'
import { comandoGrupo } from '../lib/comandoGrupo.js'

export default comandoGrupo({
  uso: 'Uso: /warnwords add <palabra> | del <palabra> | list | clear',
  soloAdmin: true,
  necesitaObjetivo: false,
  accion: 'warnwords',
  handler: async ({ sock, jid, msg, args }) => {
    const sub = (args[0] || 'list').toLowerCase()
    const resto = args.slice(1)

    if (sub === 'add' || sub === 'añadir' || sub === 'nueva') {
      const palabra = resto.join(' ').trim()
      if (!palabra) {
        await sock.sendMessage(jid, {
          text: '❓ Escribe la palabra a prohibir.\n\nEjemplo: /warnwords add putos',
          quoted: msg,
        })
        return
      }
      const ok = agregarPalabraProhibida(jid, palabra)
      await sock.sendMessage(jid, {
        text: ok
          ? `✅ Palabra prohibida añadida: *${palabra.toLowerCase()}*\n\n_Cuando alguien la use se le aplicará una advertencia y se borrará el mensaje._`
          : `❌ No se pudo añadir *${palabra}* (ya existía o está vacía).`,
        quoted: msg,
      })
      return
    }

    if (sub === 'del' || sub === 'delete' || sub === 'rm' || sub === 'remove') {
      const palabra = resto.join(' ').trim()
      if (!palabra) {
        await sock.sendMessage(jid, {
          text: '❓ Escribe la palabra a quitar.\n\n/warnwords del <palabra>',
          quoted: msg,
        })
        return
      }
      const cambios = quitarPalabraProhibida(jid, palabra)
      await sock.sendMessage(jid, {
        text: cambios
          ? `🗑️ Palabra prohibida eliminada: *${palabra.toLowerCase()}*`
          : `❌ No se encontró *${palabra}* en la lista.`,
        quoted: msg,
      })
      return
    }

    if (sub === 'list' || sub === 'ls' || sub === 'ver') {
      const palabras = listarPalabrasProhibidas(jid)
      await sock.sendMessage(jid, {
        text: palabras.length
          ? `🚫 *Palabras prohibidas* (${palabras.length})\n\n${palabras.map((p) => `• ${p}`).join('\n')}`
          : '📭 No hay palabras prohibidas configuradas.\n\n/warnwords add <palabra>',
        quoted: msg,
      })
      return
    }

    if (sub === 'clear' || sub === 'limpiar') {
      const total = limpiarPalabrasProhibidas(jid)
      await sock.sendMessage(jid, {
        text: total
          ? `🗑️ Se eliminaron *${total}* palabra(s) prohibida(s).`
          : '📭 No había palabras que eliminar.',
        quoted: msg,
      })
      return
    }

    await sock.sendMessage(jid, {
      text:
        '🚫 *Palabras prohibidas*\n\n' +
        '• `/warnwords add <palabra>` — prohibir una palabra\n' +
        '• `/warnwords del <palabra>` — quitarla\n' +
        '• `/warnwords list` — verlas\n' +
        '• `/warnwords clear` — borrar todas\n\n' +
        '_Cuando alguien use una palabra prohibida se le aplica una advertencia y se borra el mensaje._',
      quoted: msg,
    })
  },
})