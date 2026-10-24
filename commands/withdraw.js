/**
 * #withdraw [cantidad | all] — saca oro de la bóveda del banco.
 */
import {
  obtenerEconomia,
  obtenerBanco,
  retirarMonedas,
  sumarMonedas,
  marcarUso,
} from '../database/db.js'
import { formatearNumero, recargaActiva } from '../lib/economia.js'

export default async ({ sock, jid, msg, args, sender }) => {
  const quien = sender || msg.key.participant || jid

  const espera = recargaActiva(quien, 'withdraw')
  if (espera) {
    await sock.sendMessage(jid, { text: espera, quoted: msg })
    return
  }

  const texto = String(args[0] || '').toLowerCase()
  const banco = obtenerBanco(quien)
  const monto =
    texto === 'all' || texto === 'todo'
      ? banco.depositado
      : Number.parseInt(texto, 10)

  if (!monto || monto <= 0) {
    await sock.sendMessage(jid, {
      text: '❓ *Uso:* `/withdraw <cantidad>` o `/withdraw all`',
      quoted: msg,
    })
    return
  }

  const sacado = retirarMonedas(quien, monto)
  if (!sacado) {
    await sock.sendMessage(jid, {
      text: `🏦 No tienes esa cantidad en la bóveda. Ahí viven *${formatearNumero(banco.depositado)}*.`,
      quoted: msg,
    })
    return
  }

  sumarMonedas(quien, sacado, 'banco', 'Retiro del banco')
  marcarUso(quien, 'withdraw')

  await sock.sendMessage(jid, {
    text:
      `💰 *Retiro del banco*\n\n` +
      `🪙 Sacado: *${formatearNumero(sacado)}* oro\n` +
      `🏦 En bóveda: *${formatearNumero(obtenerBanco(quien).depositado)}*\n` +
      `✋ En mano: *${formatearNumero(obtenerEconomia(quien).monedas)}*`,
    quoted: msg,
  })
}
