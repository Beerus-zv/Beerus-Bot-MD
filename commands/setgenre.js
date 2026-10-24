/**
 * `/setgenre [hombre | mujer | otro | borrar]` y `/delgenre`:
 * guarda o quita tu género en el perfil (columna usuarios.genero).
 */
import { configurarPerfil, quitarGenero } from '../database/db.js'

const VALORES = ['hombre', 'mujer', 'otro']

export default async ({ sock, jid, msg, args, sender }) => {
  const quien = sender || jid
  const sub = String(args[0] || '').toLowerCase()

  // /setgenre borrar (aloja también a /delgenre via conSub)
  if (sub === 'borrar' || sub === 'del' || sub === 'quitar') {
    const borrado = quitarGenero(quien)
    await sock.sendMessage(jid, {
      text: borrado
        ? '🧹 *Género borrado.* Tu ficha vuelve al modo misterioso.'
        : '🤷 No tenías género guardado.',
      quoted: msg,
    })
    return
  }

  if (!VALORES.includes(sub)) {
    await sock.sendMessage(jid, {
      text:
        '❓ *Uso:* `/setgenre hombre | mujer | otro` (o `/setgenre borrar`)\n\n' +
        '_También vale_ `/delgenre`_ para borrarlo._',
      quoted: msg,
    })
    return
  }

  configurarPerfil(quien, 'genero', sub)
  await sock.sendMessage(jid, {
    text: `✅ Género guardado: *${sub}*.`,
    quoted: msg,
  })
}
