/**
 * `/setdescription <texto | borrar>` y `/deldescription`:
 * guarda o quita la descripción de tu perfil (columna usuarios.descripcion).
 */
import { configurarPerfil, quitarDescripcion } from '../database/db.js'

const MAXIMO = 200

export default async ({ sock, jid, msg, args, sender }) => {
  const quien = sender || jid
  const texto = (args[0] === 'borrar' || args[0] === 'del')
    ? 'borrar'
    : args.join(' ').trim()

  // /setdescription borrar
  if (texto === 'borrar') {
    const borrado = quitarDescripcion(quien)
    await sock.sendMessage(jid, {
      text: borrado
        ? '🧹 *Descripción borrada.* Vuélvete anónimo.'
        : '🤷 No tenías descripción guardada.',
      quoted: msg,
    })
    return
  }

  if (!texto) {
    await sock.sendMessage(jid, {
      text:
        `❓ *Uso:* \`/setdescription <texto>\` (máx. ${MAXIMO} caracteres)\n\n` +
        '_También vale_ `/setdescription borrar`_._',
      quoted: msg,
    })
    return
  }

  if (texto.length > MAXIMO) {
    await sock.sendMessage(jid, {
      text: `📏 Demasiado larga: *${texto.length}* caracteres (máximo ${MAXIMO}). _Recórtala._`,
      quoted: msg,
    })
    return
  }

  configurarPerfil(quien, 'descripcion', texto)
  await sock.sendMessage(jid, {
    text: `✅ *Descripción guardada:*\n\n> ${texto}`,
    quoted: msg,
  })
}
