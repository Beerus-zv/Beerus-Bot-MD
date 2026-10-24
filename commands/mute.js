import { comandoGrupo, registrarAccion } from '../lib/comandoGrupo.js'

/**
 * Alterna "solo los admins pueden escribir mensajes" (modo anuncio).
 */
export default comandoGrupo({
  accion: 'mute',
  handler: async ({ sock, jid, msg, metadata }) => {
    const activar = !metadata.announce

    await sock.groupSettingUpdate(jid, activar ? 'announcement' : 'not_announcement')
    registrarAccion(jid, 'grupo', activar ? 'mute_on' : 'mute_off', '', 'bot')

    await sock.sendMessage(jid, {
      text: activar
        ? '🔒 *Ahora solo los admins pueden escribir mensajes.*'
        : '🔓 *Todos pueden volver a escribir mensajes.*',
      quoted: msg,
    })
  },
})

