/**
 * `/setfavourite [nombre | borrar]` y `/delfavourite`:
 * marca o quita tu personaje reclamado favorito (uno por usuario).
 */
import {
  personajePorNombre,
  tieneReclamado,
  marcarFavorito,
  limpiarFavorito,
  favoritoGacha,
} from '../database/db.js'

export default async ({ sock, jid, msg, args, sender }) => {
  const quien = sender || jid
  const nombre = (args[0] === 'borrar' || args[0] === 'del')
    ? 'borrar'
    : args.join(' ').trim()

  // /setfavourite borrar (aloja también a /delfavourite via conSub)
  if (nombre === 'borrar') {
    const actual = favoritoGacha(quien)
    const borrado = limpiarFavorito(quien)
    await sock.sendMessage(jid, {
      text: borrado
        ? `⭐ *Favorito quitado.* Ya no presumes a *${actual?.nombre || 'nadie'}*.`
        : '🤷 No tienes favorito pendiente por quitar.',
      quoted: msg,
    })
    return
  }

  // Estado actual
  if (!nombre) {
    const actual = favoritoGacha(quien)
    await sock.sendMessage(jid, {
      text: actual
        ? `⭐ *Tu favorito:* ${actual.nombre}${actual.anime ? ` (${actual.anime})` : ''}\n\n_Cambia con_ \`/setfavourite <nombre>\` _o quítalo con_ \`/delfavourite\`_.`
        : '🤷 Aún no has elegido favorito.\n\n_Reclama un personaje con_ `/gacha claim` _y fíjalo con_ `/setfavourite <nombre>`_.',
      quoted: msg,
    })
    return
  }

  const personaje = personajePorNombre(nombre)
  if (!personaje) {
    await sock.sendMessage(jid, {
      text: `❌ No encontré el personaje *${nombre}*.`,
      quoted: msg,
    })
    return
  }

  if (!tieneReclamado(quien, personaje.id)) {
    await sock.sendMessage(jid, {
      text: `❌ Primero reclama a *${personaje.nombre}* con \`/waifu claim ${personaje.nombre}\`.`,
      quoted: msg,
    })
    return
  }

  marcarFavorito(quien, personaje.id)
  await sock.sendMessage(jid, {
    text: `⭐ *Favorito fijado:* ${personaje.nombre}${personaje.anime ? ` (${personaje.anime})` : ''}.`,
    quoted: msg,
  })
}
