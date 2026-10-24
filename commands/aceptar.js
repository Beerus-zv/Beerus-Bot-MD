/**
 * #aceptar — acepta la propuesta de matrimonio o divorcio que te llegó.
 * - Propuesta de boda: si te casaron con alguien, la aceptación la vuelve efectiva.
 * - Propuesta de divorcio: si alguien pidió divorcio, la aceptación la vuelve efectiva.
 */
import { tokenMencion } from '../lib/grupo.js'
import { obtenerUsuario, pendienteMatrimonio, pendienteDivorcio, aceptarMatrimonio, aceptarDivorcio } from '../database/db.js'
import { nombreLegible } from '../lib/economia.js'

export default async ({ sock, jid, msg, sender }) => {
  const quien = sender || msg.key.participant || jid

  const pendBoda = pendienteMatrimonio(quien)
  const pendDiv = pendienteDivorcio(quien)

  if (pendBoda) {
    const desde = await aceptarMatrimonio(quien)
    await sock.sendMessage(jid, {
      text:
        `💍 *¡Acuerdo matrimonial alcanzado!*\n\n` +
        `*${nombreLegible(desde, obtenerUsuario)}* ${tokenMencion(desde)} te aceptó...\n\n` +
        `_La boda ya se hizo efectiva. El universo celebra!_`,
      mentions: desde ? [desde] : [],
      quoted: msg,
    })
    return
  }

  if (pendDiv) {
    const desde = await aceptarDivorcio(quien)
    await sock.sendMessage(jid, {
      text:
        `💔 *¡Divorcio aceptado!*\n\n` +
        `*${nombreLegible(desde, obtenerUsuario)}* ${tokenMencion(desde)} aceptó la ruptura...\n\n` +
        `_El matrimonio quedó marcado como roto. Lamento la noticia!_`,
      mentions: desde ? [desde] : [],
      quoted: msg,
    })
    return
  }

  await sock.sendMessage(jid, {
    text: `❌ No tienes ninguna propuesta pendiente para ti. Usa \`/marry @usuario\` o \`/divorce\`.`,
    quoted: msg,
  })
}
