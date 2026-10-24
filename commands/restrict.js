import { comandoGrupo, registrarAccion } from '../lib/comandoGrupo.js'

/**
 * Alterna "solo los admins pueden cambiar los ajustes" (modo restringido).
 */
export default comandoGrupo({
  accion: 'restrict',
  handler: async ({ sock, jid, msg, metadata }) => {
    const activar = !metadata.restrict

    await sock.groupSettingUpdate(jid, activar ? 'locked' : 'unlocked')
    registrarAccion(jid, 'grupo', activar ? 'restrict_on' : 'restrict_off', '', 'bot')

    await sock.sendMessage(jid, {
      text: activar
        ? '🔒 *Ahora solo los admins pueden cambiar los ajustes del grupo.*'
        : '🔓 *Todos pueden volver a cambiar los ajustes del grupo.*',
      quoted: msg,
    })
  },
})

