/**
 * Pasatiempo del perfil.
 *
 *   /setpasatiempo <texto>   guarda el pasatiempo
 *   /delpasatiempo           lo borra
 *
 * El campo vive en la tabla `usuarios` (columna pasatiempo) y se muestra en
 * `/profile` junto al resto de la ficha.
 */
import { configurarPerfil, quitarPasatiempo, obtenerUsuario } from '../database/db.js'

const MAXIMO = 120

export default async ({ sock, jid, msg, args, sender }) => {
  const texto = (args || []).join(' ').trim()
  const primero = String(args?.[0] || '').toLowerCase()
  const actual = obtenerUsuario(sender)?.pasatiempo

  // /delpasatiempo llega como subcomando 'borrar'
  if (['borrar', 'del', 'quitar', 'eliminar'].includes(primero)) {
    const borrado = quitarPasatiempo(sender)
    return sock.sendMessage(jid, {
      text: borrado
        ? '🗑️ *Pasatiempo eliminado* de tu perfil.'
        : 'ℹ️ No tenías pasatiempo guardado.',
      quoted: msg,
    })
  }

  if (!texto) {
    return sock.sendMessage(jid, {
      text: actual
        ? `🎨 *Tu pasatiempo:* ${actual}\n\n_Para cambiarlo:_ \`/setpasatiempo leer\`\n_Para borrarlo:_ \`/delpasatiempo\``
        : '🎨 Todavía no tienes pasatiempo.\n\n_Uso:_ `/setpasatiempo leer y coleccionar discos`',
      quoted: msg,
    })
  }

  if (texto.length > MAXIMO) {
    return sock.sendMessage(jid, {
      text: `❌ El pasatiempo no puede pasar de ${MAXIMO} caracteres.`,
      quoted: msg,
    })
  }

  configurarPerfil(sender, 'pasatiempo', texto)
  return sock.sendMessage(jid, {
    text: `✅ *Pasatiempo guardado:* ${texto}\n\n_Se ve en_ \`/profile\`.`,
    quoted: msg,
  })
}
