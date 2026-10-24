/**
 * #roulette <red | negro> <cantidad> — ruleta del casino de Beerus.
 * Ruleta de 37 casillas: 18 rojas, 18 negras y el 0 verde (destruye la apuesta).
 * Ganar paga 2x.
 */
import { obtenerEconomia, restarMonedas, sumarMonedas, anadirExperiencia, marcarUso } from '../database/db.js'
import { formatearNumero, recargaActiva } from '../lib/economia.js'

/** Números rojos de una ruleta real */
const ROJOS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]

/** Color de una casilla: rojo, negro o verde (el cero) — pure, para tests */
export function colorDe(numero) {
  if (numero === 0) return 'verde'
  if (ROJOS.includes(numero)) return 'rojo'
  return 'negro'
}

const COLORES = { rojo: '🔴', negro: '⚫', verde: '🟢' }

export default async ({ sock, jid, msg, args, sender }) => {
  const quien = sender || msg.key.participant || jid

  const espera = recargaActiva(quien, 'roulette')
  if (espera) {
    await sock.sendMessage(jid, { text: espera, quoted: msg })
    return
  }

  const eleccion = String(args[0] || '').toLowerCase()
  const acepta = { rojo: 'rojo', red: 'rojo', roja: 'rojo', negro: 'negro', black: 'negro', negra: 'negro' }
  const color = acepta[eleccion]

  if (!color) {
    await sock.sendMessage(jid, {
      text: '❓ *Uso:* `/roulette <rojo | negro> <cantidad>`',
      quoted: msg,
    })
    return
  }

  const eco = obtenerEconomia(quien)
  const cantidad = Number.parseInt(args[1], 10)

  if (!cantidad || cantidad <= 0) {
    await sock.sendMessage(jid, {
      text: '❓ *Uso:* `/roulette <rojo | negro> <cantidad>`',
      quoted: msg,
    })
    return
  }

  if (cantidad > eco.monedas) {
    await sock.sendMessage(jid, {
      text: `💸 No tienes suficiente. Tienes *${formatearNumero(eco.monedas)}* en mano.`,
      quoted: msg,
    })
    return
  }

  const numero = Math.floor(Math.random() * 37)
  const colorSalio = colorDe(numero)
  const gano = colorSalio === color

  // La apuesta sale de la mano; si gana vuelve multiplicada
  restarMonedas(quien, cantidad, 'apuesta', 'Ruleta')

  let mensajeFinal = ''
  if (gano) {
    const premio = cantidad * 2
    sumarMonedas(quien, premio, 'premio', 'Ruleta')
    anadirExperiencia(quien, 15)
    mensajeFinal =
      `🎉 *¡${COLORES[colorSalio]} ${numero}! Ganaste!*\n\n` +
      `Apostaste al *${color}* y salio *${COLORES[colorSalio]} ${numero}*.\n` +
      `🪙 Premios: *+${formatearNumero(premio)}* oro`
  } else {
    mensajeFinal =
      `${COLORES[colorSalio]} *${numero}... perdió la apuesta.*\n\n` +
      `La bola se fue al *${colorSalio}* y apostaste a tu *${color}*.\n` +
      ((colorSalio === 'verde' && '🚀 El cero se fue directo a la bolsa de Beerus.') ||
        `💨 Los dados decidieron en tu contra.`)
  }

  marcarUso(quien, 'roulette')

  await sock.sendMessage(jid, {
    text: `${mensajeFinal}\n💰 Saldo: *${formatearNumero(obtenerEconomia(quien).monedas)}*`,
    quoted: msg,
  })
}
