/**
 * #pareja [@usuario] — muestra con quién está casado alguien (tabla matrimonios).
 */
import { esGrupo, obtenerMetadata, resolverObjetivo, tokenMencion } from '../lib/grupo.js'
import { obtenerPareja, obtenerUsuario } from '../database/db.js'
import { nombreLegible } from '../lib/economia.js'

export default async ({ sock, jid, msg, args, sender }) => {
  let objetivo = sender || msg.key.participant || jid

  if (args && args.length && esGrupo(jid)) {
    let metadata = null
    try {
      metadata = await obtenerMetadata(sock, jid)
    } catch {
      metadata = null
    }
    const resuelto = resolverObjetivo(metadata, msg, args)
    if (resuelto?.jid) objetivo = resuelto.jid
  }

  const pareja = obtenerPareja(objetivo)

  if (!pareja) {
    await sock.sendMessage(jid, {
      text:
        `🕊️ @${objetivo.split('@')[0]} *está soltero(a)*.\n` +
        `_Se puede casar con_ \`/marry @usuario\`.`,
      mentions: [objetivo],
      quoted: msg,
    })
    return
  }

  const nombrePareja = obtenerUsuario(pareja)?.nombre || nombreLegible(pareja, obtenerUsuario)

  await sock.sendMessage(jid, {
    text: `❤️ @${objetivo.split('@')[0]} está en pareja con *${nombrePareja}* ${tokenMencion(pareja)}. 💞`,
    mentions: [objetivo, pareja],
    quoted: msg,
  })
}
