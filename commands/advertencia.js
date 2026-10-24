/**
 * `/advertencia` — sistema de advertencias para grupos.
 *
 *   /advertencia @usuario [razón]   → le pone una advertencia
 *   /advertencia @usuario lista     → muestra sus advertencias
 *   /advertencia @usuario borrar    → borra sus advertencias
 *   /advertencia palabra add <palabra>  → añade palabra prohibida
 *   /advertencia palabra del <palabra>  → quita palabra prohibida
 *   /advertencia palabra list           → lista palabras prohibidas
 *   /advertencia palabra clear          → borra todas las palabras prohibidas
 */
import {
  registrarAdvertencia,
  contarAdvertencias,
  listarAdvertencias,
  borrarAdvertencias,
  limiteAdvertencias,
  agregarPalabraProhibida,
  quitarPalabraProhibida,
  listarPalabrasProhibidas,
  limpiarPalabrasProhibidas,
} from '../database/db.js'
import { comandoGrupo, nombreParticipante } from '../lib/comandoGrupo.js'

/**
 * `/advertencia` — sistema de advertencias para grupos (el límite
 * por grupo se cambia con /setwarnlimit).
 */

export default comandoGrupo({
  uso: 'Uso: /advertencia @usuario [razón | lista | borrar] | /advertencia palabra add|del|list|clear <palabra>',
  necesitaObjetivo: true,
  accion: 'advertencia',
  handler: async ({ sock, jid, msg, args, objetivo, sender }) => {
    const sub = (args[1] || '').toLowerCase()

    // ---- Subcomandos de PALABRAS PROHIBIDAS ----
    if (sub === 'palabra') {
      const palabraSub = (args[2] || '').toLowerCase()
      const restoPalabra = args.slice(3).join(' ').trim()

      if (palabraSub === 'add') {
        if (!restoPalabra) {
          await sock.sendMessage(jid, {
            text: '❓ Escribe la palabra a prohibir.\n\n/advertencia palabra add <palabra>',
            quoted: msg,
          })
          return
        }
        const ok = await agregarPalabraProhibida(jid, restoPalabra)
        await sock.sendMessage(jid, {
          text: ok
            ? `✅ Palabra prohibida añadida: *${restoPalabra.toLowerCase()}*`
            : `❌ No se pudo añadir *${restoPalabra}* (ya existe o está vacía).`,
          quoted: msg,
        })
        return
      }

      if (palabraSub === 'del' || palabraSub === 'remove' || palabraSub === 'rm') {
        if (!restoPalabra) {
          await sock.sendMessage(jid, {
            text: '❓ Escribe la palabra a quitar.\n\n/advertencia palabra del <palabra>',
            quoted: msg,
          })
          return
        }
        const cambios = await quitarPalabraProhibida(jid, restoPalabra)
        await sock.sendMessage(jid, {
          text: cambios
            ? `🗑️ Palabra prohibida eliminada: *${restoPalabra.toLowerCase()}*`
            : `❌ No se encontró *${restoPalabra}* en la lista.`,
          quoted: msg,
        })
        return
      }

      if (palabraSub === 'list' || palabraSub === 'ls' || palabraSub === 'ver') {
        const palabras = await listarPalabrasProhibidas(jid)
        await sock.sendMessage(jid, {
          text: palabras.length
            ? `🚫 *Palabras prohibidas* (${palabras.length})\n\n${palabras.map((p) => `• ${p}`).join('\n')}`
            : '📭 No hay palabras prohibidas configuradas.\n\n/advertencia palabra add <palabra>',
          quoted: msg,
        })
        return
      }

      if (palabraSub === 'clear' || palabraSub === 'limpiar') {
        const total = await limpiarPalabrasProhibidas(jid)
        await sock.sendMessage(jid, {
          text: total
            ? `🗑️ Se eliminaron *${total}* palabra(s) prohibida(s).`
            : '📭 No había palabras que eliminar.',
          quoted: msg,
        })
        return
      }

      // Si no reconocen el subsub, show help
      await sock.sendMessage(jid, {
        text:
          '🚫 *Palabras prohibidas*\n\n' +
          '• `/advertencia palabra add <palabra>` — prohibir\n' +
          '• `/advertencia palabra del <palabra>` — quitar\n' +
          '• `/advertencia palabra list` — verlas\n' +
          '• `/advertencia palabra clear` — borrar todas\n\n' +
          '_Sistema automático: cuando alguien use una palabra prohibida se le aplicará una advertencia y se borrará el mensaje._',
        quoted: msg,
      })
      return
    }

    // ---- Subcomandos tradicionales de /advertencia ----
    const LIMITE = limiteAdvertencias(jid)

    // /advertencia @usuario lista
    if (sub === 'lista' || sub === 'listar' || sub === 'list') {
      const advertencias = listarAdvertencias(jid, objetivo.jid, 10)
      const total = contarAdvertencias(jid, objetivo.jid)

      if (!total) {
        await sock.sendMessage(jid, {
          text: `✅ *${nombreParticipante(objetivo.participante)}* no tiene advertencias.`,
          quoted: msg,
        })
        return
      }

      const lista = advertencias
        .map(
          (a, i) =>
            `*${i + 1}.* ${a.razon || 'Sin razón'} — _${a.creado_en || 'fecha desconocida'}_`
        )
        .join('\n')

      await sock.sendMessage(jid, {
        text:
          `⚠️ *Advertencias de ${nombreParticipante(objetivo.participante)}* (${total}/${LIMITE})\n\n${lista}`,
        quoted: msg,
      })
      return
    }

    // /advertencia @usuario borrar
    if (sub === 'borrar' || sub === 'delete' || sub === 'reset') {
      const total = contarAdvertencias(jid, objetivo.jid)
      borrarAdvertencias(jid, objetivo.jid)

      await sock.sendMessage(jid, {
        text: `🧹 Se borraron *${total}* advertencia(s) de *${nombreParticipante(objetivo.participante)}*.`,
        quoted: msg,
      })
      return
    }

    // /advertencia @usuario [razón] → nueva advertencia
    const razon = args.slice(1).join(' ').trim()
    registrarAdvertencia(jid, objetivo.jid, razon, sender)
    const total = contarAdvertencias(jid, objetivo.jid)

    if (total >= LIMITE) {
      await sock.sendMessage(jid, {
        text:
          `🚫 *${nombreParticipante(objetivo.participante)}* alcanzó *${total}* advertencias.\n\n` +
          `_Debe ser baneado del grupo._`,
        quoted: msg,
      })
      return
    }

    await sock.sendMessage(jid, {
      text:
        `⚠️ *Advertencia para ${nombreParticipante(objetivo.participante)}*\n\n` +
        `Advertencias: *${total}/${LIMITE}*\n` +
        (razon ? `\n_Razón:_ ${razon}` : ''),
      quoted: msg,
    })
  },
})