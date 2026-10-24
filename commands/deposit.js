/**
 * #deposit [cantidad | all] — guarda oro en el banco (al estilo Neko).
 * El banco protege las monedas del /rob: lo que esta depositado no se roba.
 */
import {
  obtenerEconomia,
  restarMonedas,
  depositarMonedas,
  obtenerBanco,
  marcarUso,
} from '../database/db.js'
import { formatearNumero, recargaActiva } from '../lib/economia.js'

export default async ({ sock, jid, msg, args, sender }) => {
  const quien = sender || msg.key.participant || jid

  const espera = recargaActiva(quien, 'deposit')
  if (espera) {
    await sock.sendMessage(jid, { text: espera, quoted: msg })
    return
  }

  const texto = String(args[0] || '').toLowerCase()
  const eco = obtenerEconomia(quien)
  const monto =
    texto === 'all' || texto === 'todo'
      ? eco.monedas
      : Number.parseInt(texto, 10)

  if (!monto || monto <= 0) {
    await sock.sendMessage(jid, {
      text: '❓ *Uso:* `/deposit <cantidad>` o `/deposit all`',
      quoted: msg,
    })
    return
  }

  if (monto > eco.monedas) {
    await sock.sendMessage(jid, {
      text: `💸 Solo tienes *${formatearNumero(eco.monedas)}* oro en la mano.`,
      quoted: msg,
    })
    return
  }

  restarMonedas(quien, monto, 'banco', 'Deposito en el banco')
  depositarMonedas(quien, monto)
  marcarUso(quien, 'deposit')

  const banco = obtenerBanco(quien)

  await sock.sendMessage(jid, {
    text:
      `🏦 *Deposito en el banco*\n\n` +
      `🪙 Guardado: *${formatearNumero(monto)}* oro\n` +
      `🏦 En bóveda: *${formatearNumero(banco.depositado)}*\n` +
      `💰 En mano: *${formatearNumero(obtenerEconomia(quien).monedas)}*`,
    quoted: msg,
  })
}
