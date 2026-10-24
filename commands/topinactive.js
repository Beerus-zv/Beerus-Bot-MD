/**
 * `/topinactive`: los miembros con menos mensajes en el grupo.
 * Incluye a los que nunca han escrito (cuenta 0).
 */
import { comandoGrupo, nombreParticipante } from '../lib/comandoGrupo.js'
import { topMensajesGrupo } from '../database/db.js'

export default comandoGrupo({
  uso: 'Uso: /topinactive [cantidad]',
  soloAdmin: false,
  accion: 'topinactive',
  handler: async ({ sock, jid, msg, metadata, args }) => {
    const cantidad = Math.min(20, Math.max(3, Number(args[0]) || 10))

    const cuentas = new Map(topMensajesGrupo(jid, 9999).map((f) => [String(f.usuario), Number(f.cuenta)]))

    // Cada miembro con su cuenta (0 si nunca escribio), del mas callado al mas activo
    const filas = metadata.participants
      .map((p) => ({ participante: p, cuenta: cuentas.get(p.id) ?? cuentas.get(p.lid) ?? 0 }))
      .sort((a, b) => a.cuenta - b.cuenta)
      .slice(0, cantidad)

    const lineas = filas.map(
      (f, i) => `*${i + 1}.* ${nombreParticipante(f.participante)} — *${f.cuenta}* mensaje(s)`,
    )

    await sock.sendMessage(jid, {
      text:
        `🥀 *${cantidad} menos activos del grupo*\n\n${lineas.join('\n')}\n\n_¡A escribir más!_`,
      quoted: msg,
    })
  },
})
