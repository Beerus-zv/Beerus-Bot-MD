/**
 * `/paybank <@usuario|número> <monto>` — pagar desde el banco.
 *
 *   /paybank @usuario 500
 *   /paybank 573001234567 500
 *   /paybank todo @usuario
 *
 * A diferencia de `/pay`, que mueve la cartera, esto saca el oro de la cuenta
 * del banco. Si el banco no cubre el monto, avisa y no toca nada.
 */
import { obtenerBanco, retirarMonedas, sumarMonedas, transferirMonedas } from '../database/db.js'
import { obtenerMetadata, resolverObjetivo, jidUsuario, esGrupo } from '../lib/grupo.js'

/** Milisegundos -> "2h 10m" no hace falta aquí: el pago es instantáneo */

export default async ({ sock, jid, msg, args, sender }) => {
  const quien = sender || msg.key.participant || jid
  const partes = [...(args || [])]

  if (!partes.length) {
    const banco = obtenerBanco(quien)
    return sock.sendMessage(jid, {
      text:
        '🏦 *Pago desde el banco*\n\n' +
        '• `/paybank @usuario 500`\n' +
        '• `/paybank 573001234567 500`\n' +
        '• `/paybank todo @usuario` — manda todo lo del banco\n\n' +
        `▸ *En tu banco:* ${banco.depositado} de oro`,
      quoted: msg,
    })
  }

  let metadata = null
  if (esGrupo(jid)) {
    metadata = await obtenerMetadata(sock, jid).catch(() => null)
  }

  // El objetivo sale de la mención o del primer número con pinta de teléfono
  const objetivo = metadata ? resolverObjetivo(metadata, msg, args) : null
  let destino = objetivo?.participante ? jidUsuario(objetivo.participante.id) : null

  let montoTexto = null
  if (!destino) {
    const mencion = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
    if (mencion) destino = jidUsuario(mencion)
  }

  // Monto: el primer argumento que no sea la mención ni el número destino
  for (const parte of partes) {
    if (parte.startsWith('@')) continue
    if (destino && parte.replace(/\D/g, '') === destino.replace(/\D/g, '')) continue
    if (/^(todo|all)$/i.test(parte) || /^\d+$/.test(parte)) {
      montoTexto = parte
      break
    }
  }

  if (!destino) {
    return sock.sendMessage(jid, {
      text: '❌ No sé a quién pagarle. Menciona a alguien o pasa el número.',
      quoted: msg,
    })
  }

  if (destino === jidUsuario(quien)) {
    return sock.sendMessage(jid, { text: '❌ No te pagues a ti mismo.', quoted: msg })
  }

  if (!montoTexto) {
    return sock.sendMessage(jid, {
      text: '❌ Falta el monto. Uso: `/paybank @usuario 500`',
      quoted: msg,
    })
  }

  const banco = obtenerBanco(quien)
  const monto =
    /^(todo|all)$/i.test(montoTexto) ? Number(banco.depositado) : Math.trunc(Number(montoTexto))

  if (!Number.isFinite(monto) || monto <= 0) {
    return sock.sendMessage(jid, { text: '❌ El monto tiene que ser mayor que cero.', quoted: msg })
  }

  if (Number(banco.depositado) < monto) {
    return sock.sendMessage(jid, {
      text: `🏦 Tu banco tiene *${banco.depositado}* de oro y quieres mandar *${monto}*.`,
      quoted: msg,
    })
  }

  const sacado = retirarMonedas(quien, monto)
  if (!sacado) {
    return sock.sendMessage(jid, { text: '❌ No pude sacar el oro del banco.', quoted: msg })
  }

  // El destino lo recibe en la cartera
  sumarMonedas(destino, monto, 'banco', 'pago recibido desde el banco')

  return sock.sendMessage(jid, {
    text:
      `🏦 *Pago enviado*\n\n` +
      `▸ A: ${destino.split('@')[0]}\n` +
      `▸ Monto: *${monto}* de oro\n` +
      `▸ Te queda en el banco: ${obtenerBanco(quien).depositado}`,
    quoted: msg,
    mentions: [destino],
  })
}
