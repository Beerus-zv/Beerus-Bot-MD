/**
 * `/ppt [piedra|papel|tijera] [apuesta]` — piedra, papel o tijera.
 *
 *   /ppt                     jugada suelta
 *   /ppt piedra              contra el bot
 *   /ppt tijera 100          apuesta 100 de oro (paga 2x si ganas)
 *
 * Sin argumento se elige al azar, así que `/ppt` siempre responde.
 */
import { obtenerEconomia, sumarMonedas, restarMonedas } from '../database/db.js'

const OPCIONES = ['piedra', 'papel', 'tijera']
const EMOJI = { piedra: '🪨', papel: '📄', tijera: '✂️' }
const APUESTA_MAX = 1000

/** Alias en español/inglés a la opción canónica */
function normalizar(texto) {
  const t = String(texto || '').toLowerCase()
  if (['piedra', 'rock', 'r', 'p'].includes(t)) return 'piedra'
  if (['papel', 'paper', 'pape', 'l'].includes(t)) return 'papel'
  if (['tijera', 'tijeras', 'scissors', 's', 't'].includes(t)) return 'tijera'
  return null
}

/** Gana quien vence a la otra: 1 gana a, -1 gana b, 0 empate */
function comparar(a, b) {
  if (a === b) return 0
  if (
    (a === 'piedra' && b === 'tijera') ||
    (a === 'papel' && b === 'piedra') ||
    (a === 'tijera' && b === 'papel')
  ) {
    return 1
  }
  return -1
}

export default async ({ sock, jid, msg, args, sender }) => {
  const quien = sender || msg.key.participant || jid

  let jugada = normalizar(args?.[0])
  let apuesta = 0

  // /ppt 100 (solo apuesta, jugada al azar)
  if (!jugada && /^\d+$/.test(String(args?.[0] || ''))) {
    apuesta = Math.min(APUESTA_MAX, Math.max(1, Number(args[0])))
  } else if (jugada) {
    const posible = Number(args?.[1] || 0)
    if (Number.isFinite(posible) && posible > 0) {
      apuesta = Math.min(APUESTA_MAX, Math.max(1, Math.trunc(posible)))
    }
  }

  if (!jugada) jugada = OPCIONES[Math.floor(Math.random() * 3)]

  if (apuesta) {
    const eco = obtenerEconomia(quien)
    if (eco.monedas < apuesta) {
      return sock.sendMessage(jid, {
        text: `💸 No tienes *${apuesta}* de oro (tienes ${eco.monedas}).`,
        quoted: msg,
      })
    }
    restarMonedas(quien, apuesta, 'ppt', 'apuesta de piedra papel tijera')
  }

  const rival = OPCIONES[Math.floor(Math.random() * 3)]
  const resultado = comparar(jugada, rival)

  let veredicto
  if (resultado === 0) {
    veredicto = '🤝 *Empate.*'
    if (apuesta) sumarMonedas(quien, apuesta, 'ppt', 'devolución de apuesta')
  } else if (resultado === 1) {
    const premio = apuesta ? apuesta * 2 : 30
    sumarMonedas(quien, premio, 'ppt', 'victoria en piedra papel tijera')
    veredicto = `🏆 *Ganaste.* +${premio} de oro`
  } else {
    veredicto = apuesta ? `💀 *Perdiste.* -${apuesta} de oro` : '💀 *Perdiste.*'
  }

  return sock.sendMessage(jid, {
    text:
      `✊ *Piedra, papel o tijera*\n\n` +
      `▸ Tú: ${EMOJI[jugada]} ${jugada}\n` +
      `▸ Bot: ${EMOJI[rival]} ${rival}\n\n` +
      veredicto +
      (apuesta ? '' : '\n\n_Apuesta con_ `/ppt tijera 100`_._'),
    quoted: msg,
  })
}
