/**
 * `/math [apuesta]` — reto de cálculo mental.
 *
 *   /math          sin apuesta: solo por diversión
 *   /math 50       apuesta 50 de oro a acertar
 *
 * Se planta una operación, se espera la respuesta con `/math <resultado>`
 * durante 30 s y se paga 2x la apuesta si acierta. La operación vive en
 * memoria por chat: no hace falta tabla.
 */
import { obtenerEconomia, sumarMonedas, restarMonedas } from '../database/db.js'

const ESPERA_MS = 30000
const APUESTA_MAX = 500

/** chat -> { resultado, apuesta, jid, vence } */
const retos = new Map()

/** Operación aleatoria con su resultado */
function nuevaOperacion() {
  const tipo = Math.floor(Math.random() * 4)
  let a = Math.floor(Math.random() * 40) + 5
  let b = Math.floor(Math.random() * 30) + 2
  let texto
  let resultado

  if (tipo === 0) {
    texto = `${a} + ${b}`
    resultado = a + b
  } else if (tipo === 1) {
    if (a < b) [a, b] = [b, a]
    texto = `${a} - ${b}`
    resultado = a - b
  } else if (tipo === 2) {
    a = Math.floor(Math.random() * 12) + 2
    b = Math.floor(Math.random() * 9) + 2
    texto = `${a} × ${b}`
    resultado = a * b
  } else {
    b = Math.floor(Math.random() * 8) + 2
    resultado = Math.floor(Math.random() * 9) + 2
    a = b * resultado
    texto = `${a} ÷ ${b}`
  }

  return { texto, resultado }
}

export default async ({ sock, jid, msg, args, sender }) => {
  const quien = sender || msg.key.participant || jid
  const entrada = String(args?.[0] || '').trim()

  // Respuesta a un reto abierto
  const reto = retos.get(jid)
  if (reto && reto.jid === quien && /^-?\d+$/.test(entrada)) {
    retos.delete(jid)

    if (Date.now() > reto.vence) {
      return sock.sendMessage(jid, {
        text: `⌛ Se acabó el tiempo. La respuesta era *${reto.resultado}*.`,
        quoted: msg,
      })
    }

    const correcto = Number(entrada) === reto.resultado
    if (correcto) {
      const premio = reto.apuesta ? reto.apuesta * 2 : 25
      sumarMonedas(quien, premio, 'math', 'reto de cálculo')
      return sock.sendMessage(jid, {
        text:
          `✅ *Correcto:* ${reto.resultado}\n\n` +
          `▸ Ganancia: *+${premio}* de oro` +
          (reto.apuesta ? ` _(apuesta ${reto.apuesta})_` : ''),
        quoted: msg,
      })
    }

    return sock.sendMessage(jid, {
      text: `❌ *No.* La respuesta era *${reto.resultado}*.` + (reto.apuesta ? `\n▸ Apuesta perdida: -${reto.apuesta}` : ''),
      quoted: msg,
    })
  }

  if (reto && reto.jid === quien) retos.delete(jid)

  // Nueva operación
  let apuesta = 0
  if (entrada && /^\d+$/.test(entrada)) {
    apuesta = Math.min(APUESTA_MAX, Math.max(1, Number(entrada)))
    const eco = obtenerEconomia(quien)
    if (eco.monedas < apuesta) {
      return sock.sendMessage(jid, {
        text: `💸 No tienes *${apuesta}* de oro (tienes ${eco.monedas}).`,
        quoted: msg,
      })
    }
    restarMonedas(quien, apuesta, 'math', 'apuesta de cálculo')
  }

  const { texto, resultado } = nuevaOperacion()
  retos.set(jid, { resultado, apuesta, jid: quien, vence: Date.now() + ESPERA_MS })

  return sock.sendMessage(jid, {
    text:
      `🧮 *Resuelve:*\n\n` +
      `   ${texto} = ?\n\n` +
      (apuesta ? `▸ Apuesta: *${apuesta}* de oro (paga 2x)\n` : '') +
      `_Responde con_ \`/math <resultado>\` _en 30 segundos._`,
    quoted: msg,
  })
}
