/**
 * #marry @usuario (también #casarse) — se casa con otro usuario, estilo Neko.
 * La propuesta se hace efectiva solo cuando el otro usuario acepta con /aceptar.
 * Registro en la tabla matrimonios + historial de bodas.
 */
import { esGrupo, obtenerMetadata, resolverObjetivo, tokenMencion } from '../lib/grupo.js'
import { obtenerPareja, obtenerUsuario, proponerMatrimonio } from '../database/db.js'
import { nombreLegible } from '../lib/economia.js'

const ANILLO = '💍'

export default async ({ sock, jid, msg, args, sender }) => {
  const quien = sender || msg.key.participant || jid

  const yaPareja = obtenerPareja(quien)
  if (yaPareja) {
    await sock.sendMessage(jid, {
      text: `${ANILLO} *Ya estás casado(a)* con @${yaPareja.split('@')[0]}\n_Divorciate primero con_ \`/divorce\`.`,
      mentions: [yaPareja],
      quoted: msg,
    })
    return
  }

  if (!args?.length) {
    await sock.sendMessage(jid, {
      text: `${ANILLO} *Uso:* \`/marry @usuario\` — men­ciona a quien quieres tomar como pareja.\n\nLa unión solo se hace efectiva cuando el otro usuario acepta con \`/aceptar\`.`,
      quoted: msg,
    })
    return
  }

  let metadata = null
  if (esGrupo(jid)) {
    try {
      metadata = await obtenerMetadata(sock, jid)
    } catch {
      metadata = null
    }
  }

  const objetivo = resolverObjetivo(metadata, msg, args)
  if (!objetivo?.jid) {
    await sock.sendMessage(jid, {
      text: `${ANILLO} *Uso:* \`/marry @usuario\` — men­ciona a quien quieres tomar como pareja.`,
      quoted: msg,
    })
    return
  }

  const pareja = objetivo.jid

  if (pareja === quien) {
    await sock.sendMessage(jid, {
      text: '💢 ¿Casarte contigo mismo? Incluso Whis recuerda que eso es raro.',
      quoted: msg,
    })
    return
  }

  if (obtenerPareja(pareja)) {
    await sock.sendMessage(jid, {
      text: `💔 @${pareja.split('@')[0]} *ya está casado(a)*. No se aceptan rivales en la boda.`,
      mentions: [pareja],
      quoted: msg,
    })
    return
  }

  // Propuesta: la boda se vuelve efectiva cuando el otro acepte con /aceptar
  proponerMatrimonio(quien, pareja)
  const nombrePropio = obtenerUsuario(quien)?.nombre || nombreLegible(quien, obtenerUsuario)
  const nombreObjetivo = obtenerUsuario(pareja)?.nombre || nombreLegible(pareja, obtenerUsuario)

  await sock.sendMessage(jid, {
    text:
      `${ANILLO} *¡Boda del reino!*\n\n` +
      `*${nombrePropio}* 💞 *${nombreObjetivo}* ${tokenMencion(pareja)} te propuso...\n\n` +
      `_La unión con* *${nombrePropio}* *solo será efectiva cuando aceptes con_ \`/aceptar\`.`,
    mentions: [pareja],
    quoted: msg,
  })
}
