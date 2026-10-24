/**
 * `/groupimage`: cambia la foto del grupo. Responde a una imagen
 * (o la cita) con el comando; solo admins.
 */
import { comandoGrupo } from '../lib/comandoGrupo.js'
import { descargarMedia, obtenerCitado, detectarTipoMedia } from '../lib/multimedia.js'

export default comandoGrupo({
  uso: 'Uso: /groupimage (responde a una imagen)',
  accion: 'groupimage',
  handler: async ({ sock, jid, msg }) => {
    let buffer = null
    const citado = obtenerCitado(msg)
    // Si es respuesta a una imagen, usar esa; si no, usar la imagen del propio mensaje
    const mensajeMedia = citado && detectarTipoMedia(citado) ? citado : msg?.message
    const tipoMedia = detectarTipoMedia(mensajeMedia)
    try {
      if (tipoMedia === 'image') {
        buffer = await descargarMedia(sock, mensajeMedia)
      }
    } catch {
      buffer = null
    }

    if (!buffer) {
      await sock.sendMessage(jid, {
        text:
          '❓ No vi ninguna imagen.\n\n' +
          '_Responde a una *imagen* con_ `/groupimage`_ y la pongo como foto del grupo._',
        quoted: msg,
      })
      return
    }

    try {
      await sock.updateProfilePicture(jid, buffer)
      await sock.sendMessage(jid, {
        text: '🖼 Foto del grupo *actualizada*. Que combine con la tanda.',
        quoted: msg,
      })
    } catch (err) {
      console.error('[groupimage] error:', err.message)
      await sock.sendMessage(jid, {
        text: '💥 WhatsApp no aceptó la foto. _Prueba con una imagen más nueva o más clara._',
        quoted: msg,
      })
    }
  },
})
