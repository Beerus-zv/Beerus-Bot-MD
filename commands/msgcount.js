/**
 * `/msgcount @usuario`: cuantos mensajes escribió un usuario
 * en el grupo y en que posición del top está.
 */
import { comandoGrupo } from '../lib/comandoGrupo.js'
import { mensajesDeUsuario, posicionMensajes } from '../database/db.js'

export default comandoGrupo({
  uso: 'Uso: /msgcount @usuario | teléfono | mensaje citado',
  soloAdmin: false,
  necesitaObjetivo: true,
  handler: async ({ sock, jid, msg, objetivo }) => {
    const cuenta = mensajesDeUsuario(jid, objetivo.jid)
    const posicion = posicionMensajes(jid, objetivo.jid)

    await sock.sendMessage(jid, {
      text:
        `📊 *Mensajes de @${objetivo.jid.split('@')[0]}*\n\n` +
        `▸ Total: *${cuenta}* mensaje(s)\n` +
        `▸ Puesto en el top: *#${posicion}*`,
      mentions: [objetivo.jid],
      quoted: msg,
    })
  },
})
