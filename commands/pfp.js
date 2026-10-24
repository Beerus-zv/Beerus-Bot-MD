/**
 * #getpic (también #pfp) — muestra la foto de perfil de un usuario
 * (por mención, mensaje citado o la tuya propio, estilo Neko).
 */
import { resolverObjetivo, esGrupo, obtenerMetadata } from '../lib/grupo.js'

export default async ({ sock, jid, msg, args, sender }) => {
  let objetivo = sender || msg.key.participant || jid

  if ((args && args.length) || esGrupo(jid)) {
    let metadata = null
    try {
      metadata = await obtenerMetadata(sock, jid)
    } catch {
      metadata = null
    }
    const resuelto = resolverObjetivo(metadata, msg, args)
    if (resuelto?.jid) objetivo = resuelto.jid
  }

  let foto = null
  try {
    foto = await sock.profilePictureUrl(objetivo, 'high')
  } catch {
    foto = null
  }

  if (!foto) {
    await sock.sendMessage(jid, {
      text: `🖼️ @${objetivo.split('@')[0]} *no tiene foto de perfil* (o no es visible para el bot).\n_El ojo divino de Beerus no ve nada._`,
      mentions: [objetivo],
      quoted: msg,
    })
    return
  }

  await sock.sendMessage(jid, {
    image: { url: foto },
    caption: `🖼️ *Foto de perfil* de @${objetivo.split('@')[0]}`,
    mentions: [objetivo],
    quoted: msg,
  })
}
