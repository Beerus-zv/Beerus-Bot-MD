/**
 * Reporte de fallos y sugerencias.
 *
 *   /report <texto>        guarda un reporte del usuario
 *   /report lista          muestra los últimos (solo owner)
 *
 * Los reportes quedan en la tabla `sugerencias` con estado 'pendiente', que ya
 * existía en el esquema. El owner los revisa desde el chat.
 */
import { crearSugerencia, listarSugerencias, contarSugerencias } from '../database/db.js'
import { esOwnerMsg } from '../lib/owner.js'
import { tokenMencion } from '../lib/grupo.js'

const MINIMO = 5
const MAXIMO = 900

export default async ({ sock, jid, msg, args, sender }) => {
  const texto = (args || []).join(' ').trim()
  const primero = String(args?.[0] || '').toLowerCase()

  if (['lista', 'list', 'ver', 'todos'].includes(primero)) {
    if (!esOwnerMsg({ sock, msg, sender })) {
      return sock.sendMessage(jid, {
        text: '❌ Solo el owner puede ver la lista de reportes.',
        quoted: msg,
      })
    }

    const total = contarSugerencias()
    if (!total) {
      return sock.sendMessage(jid, { text: '📭 No hay reportes guardados.', quoted: msg })
    }

    const filas = listarSugerencias(10)
    const lineas = filas.map((f) => {
      const quien = f.jid?.endsWith('@g.us') ? 'grupo' : tokenMencion(f.jid)
      const fecha = String(f.creado_en || '').slice(0, 16)
      return `▸ *#${f.id}* · ${fecha}\n   ${f.texto}\n   _de ${quien} · ${f.estado}_`
    })

    return sock.sendMessage(jid, {
      text: `📬 *Reportes* (${total} en total, últimos ${filas.length})\n\n${lineas.join('\n\n')}`,
      quoted: msg,
    })
  }

  if (!texto) {
    return sock.sendMessage(jid, {
      text:
        '📝 *Reportes y sugerencias*\n\n' +
        '• `/report <texto>` — enviar un reporte\n' +
        '• `/report lista` — ver los últimos (owner)\n\n' +
        '_Cuéntame el fallo con el comando y lo que pasó._',
      quoted: msg,
    })
  }

  if (texto.length < MINIMO) {
    return sock.sendMessage(jid, {
      text: `❌ Contame un poco más (mínimo ${MINIMO} caracteres).`,
      quoted: msg,
    })
  }

  if (texto.length > MAXIMO) {
    return sock.sendMessage(jid, {
      text: `❌ El reporte no puede pasar de ${MAXIMO} caracteres.`,
      quoted: msg,
    })
  }

  const id = crearSugerencia(sender, texto)
  return sock.sendMessage(jid, {
    text: `📬 *Reporte #${id} guardado.*\n\n_Gracias, el owner lo va a leer._`,
    quoted: msg,
  })
}
