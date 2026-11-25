/**
 * `/hidetag` — menciona a todos los miembros del grupo.
 *
 *   /hidetag
 *   /hidetag Reunión mañana a las 8
 */
import { obtenerMetadata, esGrupo } from '../lib/grupo.js'
import { log } from '../lib/logger.js'

export default async ({ sock, jid, msg, args }) => {
  if (!esGrupo(jid)) {
    await sock.sendMessage(jid, {
      text: '❌ Este comando solo funciona dentro de un grupo.',
      quoted: msg,
    })
    return
  }

  const texto = args.join(' ').trim() || '📢 ¡Atención a todos!'

  let metadata
  try {
    metadata = await obtenerMetadata(sock, jid)
  } catch (err) {
    log.error('Error obteniendo los metadatos del grupo', err)
    await sock.sendMessage(jid, {
      text: '❌ No se pudo obtener la información del grupo.',
      quoted: msg,
    })
    return
  }

  const participantes = (metadata.participants ?? []).filter((p) => p?.id)

  if (!participantes.length) {
    await sock.sendMessage(jid, {
      text: '❌ No se encontraron miembros en el grupo.',
      quoted: msg,
    })
    return
  }

  // El nombre lo dice: el mensaje va limpio, sin la lista visible de @usuarios.
  // La alerta la dispara el array 'mentions' con los JIDs reales del grupo
  // (patrón Mega/Gata: funciona igual con participantes @lid).
  await sock.sendMessage(jid, {
    text: texto,
    mentions: participantes.map((p) => p.id),
    quoted: msg,
  })
}
