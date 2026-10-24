/**
 * #divorce (también #divorciarse) — termina el matrimonio con drama divino.
 * La ruptura solo se hace efectiva cuando el otro usuario acepta con /aceptar.
 */
import { obtenerPareja, obtenerUsuario, proponerDivorcio } from '../database/db.js'
import { tokenMencion } from '../lib/grupo.js'
import { nombreLegible } from '../lib/economia.js'

export default async ({ sock, jid, msg, sender }) => {
  const quien = sender || msg.key.participant || jid

  const pareja = obtenerPareja(quien)
  if (!pareja) {
    await sock.sendMessage(jid, {
      text: '💔 No estás casado(a) con nadie.',
      quoted: msg,
    })
    return
  }

  // Propuesta de divorcio: solo efectiva cuando la pareja acepta con /aceptar
  if (!proponerDivorcio(quien)) {
    await sock.sendMessage(jid, {
      text: '💔 No hay nada que divorciarse.',
      quoted: msg,
    })
    return
  }

  const nombrePareja = obtenerUsuario(pareja)?.nombre || nombreLegible(pareja, obtenerUsuario)

  await sock.sendMessage(jid, {
    text:
      `💔 *Petición de divorcio*\n\n` +
      `*${nombreLegible(quien, obtenerUsuario)}* ${tokenMencion(quien)} le pidió a *${nombrePareja}* ` +
      `${tokenMencion(pareja)} que acepte el divorcio...`,
    mentions: [quien, pareja],
    quoted: msg,
  })
}
