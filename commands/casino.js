import { obtenerEconomia, sumarMonedas, anadirExperiencia, marcarUso, oroDisponible, pagarConBanco } from '../database/db.js'
import { segundosDesde, formatearNumero, recargaActiva } from '../lib/economia.js'

const AYUDA = `🎰 *Casino*

*Uso:*
• \`/casino slots <cantidad>\` - Máquina tragamonedas
• \`/casino coinflip <cantidad> <cara|cruz>\` - Apostar a cara o cruz
• \`/casino bet <cantidad>\` - Dobla o pierdes (50/50)

_Apuesta mínima: 10 oro._

⏳ _Cada juego tiene su recarga: slots 20 s, _
_coinflip 15 s, bet 15 s._`

/** Alias de subcomando -> clave de recarga */
const CLAVE_JUEGO = {
  slots: 'slots',
  tragamonedas: 'slots',
  maquina: 'slots',
  coinflip: 'coinflip',
  cara: 'coinflip',
  cruz: 'coinflip',
  bet: 'bet',
  apostar: 'bet',
  doble: 'bet',
}

const SIMBOLOS = [
  { emoji: '🍒', peso: 30, pago: 3 },
  { emoji: '🍋', peso: 25, pago: 3 },
  { emoji: '🍉', peso: 20, pago: 4 },
  { emoji: '🔔', peso: 12, pago: 5 },
  { emoji: '⭐', peso: 8, pago: 8 },
  { emoji: '💎', peso: 5, pago: 20 },
]

const APUESTA_MINIMA = 10

/** Gira un rodillo según los pesos */
function girar() {
  const total = SIMBOLOS.reduce((acc, s) => acc + s.peso, 0)
  let n = Math.random() * total
  for (const s of SIMBOLOS) {
    n -= s.peso
    if (n <= 0) return s
  }
  return SIMBOLOS[0]
}

/** Gestiona la apuesta: descuenta cartera y, si falta, banco. Devuelve null si no alcanza */
async function apostar(sock, jid, msg, quien, cantidad) {
  if (cantidad < APUESTA_MINIMA) {
    await sock.sendMessage(jid, {
      text: `💸 La apuesta mínima es *${APUESTA_MINIMA}* oro.`,
      quoted: msg,
    })
    return null
  }

  const saldo = oroDisponible(quien)
  if (saldo.total < cantidad) {
    await sock.sendMessage(jid, {
      text:
        `💸 No tienes suficiente oro para esa apuesta.\n` +
        `│ Cartera: *${formatearNumero(saldo.enMano)}* · Banco: *${formatearNumero(saldo.enBanco)}*`,
      quoted: msg,
    })
    return null
  }

  const pago = pagarConBanco(quien, cantidad, 'casino', 'Apuesta')
  if (!pago.ok) return null

  if (pago.delBanco > 0) {
    await sock.sendMessage(jid, {
      text: `🏦 La cartera no alcanzaba: usé *${formatearNumero(pago.delBanco)}* oro del banco.`,
      quoted: msg,
    })
  }

  return obtenerEconomia(quien)
}

export default async ({ sock, jid, msg, args, sender }) => {
  const sub = String(args[0] || '').toLowerCase()
  const quien = sender || jid
  const juego = CLAVE_JUEGO[sub]

  // ───────────── Recarga por juego ─────────────
  if (juego) {
    const espera = recargaActiva(quien, juego)
    if (espera) {
      await sock.sendMessage(jid, { text: espera, quoted: msg })
      return
    }
  }

  // ───────────── Tragamonedas ─────────────
  if (juego === 'slots') {
    const cantidad = Number(args[1]) || 0
    if (!cantidad || !(await apostar(sock, jid, msg, quien, cantidad))) return
    marcarUso(quien, 'slots')

    const rodillos = [girar(), girar(), girar()]
    const iguales = rodillos.every((s) => s.emoji === rodillos[0].emoji)
    const dosIguales = rodillos[0].emoji === rodillos[1].emoji || rodillos[1].emoji === rodillos[2].emoji

    let premio = 0
    let texto = ''

    if (iguales) {
      const simbolo = rodillos[0]
      premio = cantidad * simbolo.pago
      texto = `🎉 *¡TRIPLE!* Tres ${simbolo.emoji}`
    } else if (dosIguales) {
      premio = cantidad * 2
      texto = `✨ *¡Doble!* Dos iguales`
    } else {
      texto = '💨 Nada de la suerte esta vez.'
    }

    if (premio > 0) sumarMonedas(quien, premio, 'casino', 'Premio de la máquina')
    anadirExperiencia(quien, 5)

    await sock.sendMessage(jid, {
      text:
        `🎰 *${rodillos.map((s) => s.emoji).join(' ')}*\n\n` +
        `${texto}\n` +
        `💸 Apuesta: *${formatearNumero(cantidad)}*\n` +
        `🏆 Premio: *${formatearNumero(premio)}* oro\n` +
        `💰 Saldo: *${formatearNumero(obtenerEconomia(quien).monedas)}*`,
      quoted: msg,
    })
    return
  }

  // ───────────── Cara o cruz ─────────────
  if (juego === 'coinflip') {
    const cantidad = Number(args[1]) || 0
    const eleccion = String(args[2] || '').toLowerCase()

    if (!['cara', 'cruz', 'heads', 'tails'].includes(eleccion)) {
      await sock.sendMessage(jid, {
        text: '❓ *Uso:* `/casino coinflip <cantidad> <cara|cruz>`',
        quoted: msg,
      })
      return
    }

    if (!cantidad || !(await apostar(sock, jid, msg, quien, cantidad))) return
    marcarUso(quien, 'coinflip')

    const esCara = Math.random() < 0.5
    const resultado = esCara ? 'cara' : 'cruz'
    const gane = resultado === (eleccion === 'cara' || eleccion === 'heads' ? 'cara' : 'cruz')

    let premio = 0
    if (gane) {
      premio = cantidad * 2
      sumarMonedas(quien, premio, 'casino', 'Premio de coinflip')
    }
    anadirExperiencia(quien, 5)

    await sock.sendMessage(jid, {
      text:
        `🪙 *Coinflip*\n\n` +
        `Salió: *${resultado}*\n` +
        `Tu apuesta: *${eleccion}*\n` +
        `${gane ? `🎉 ¡Ganaste! *${formatearNumero(premio)}* oro` : `😔 Perdiste *${formatearNumero(cantidad)}* oro`}\n` +
        `💰 Saldo: *${formatearNumero(obtenerEconomia(quien).monedas)}*`,
      quoted: msg,
    })
    return
  }

  // ───────────── Doblar o perder ─────────────
  if (juego === 'bet') {
    const cantidad = Number(args[1]) || 0
    if (!cantidad || !(await apostar(sock, jid, msg, quien, cantidad))) return
    marcarUso(quien, 'bet')

    const gane = Math.random() < 0.5
    let premio = 0
    if (gane) {
      premio = cantidad * 2
      sumarMonedas(quien, premio, 'casino', 'Premio de apuesta')
    }
    anadirExperiencia(quien, 5)

    await sock.sendMessage(jid, {
      text:
        `🎲 *Doble o nada*\n\n` +
        `${gane ? `🎉 ¡Doblaste! *${formatearNumero(premio)}* oro` : `😔 Perdiste *${formatearNumero(cantidad)}* oro`}\n` +
        `💰 Saldo: *${formatearNumero(obtenerEconomia(quien).monedas)}*`,
      quoted: msg,
    })
    return
  }

  await sock.sendMessage(jid, { text: AYUDA, quoted: msg })
}
