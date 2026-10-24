/**
 * #crime — ganar oro cometiendo crímenes (estilo Neko).
 * 40% de éxito: el botín es gordo. 60%: multa del departamento de Champa.
 * El botín y la multa escalan con el nivel (15% por nivel encima del 1).
 */
import { obtenerEconomia, sumarMonedas, restarMonedas, anadirExperiencia, marcarUso } from '../database/db.js'
import { formatearNumero, recargaActiva } from '../lib/economia.js'

const BOTIN_BASE = [80, 160]
const MULTA_BASE = [50, 100]

/** Rangos de botin y multa para un nivel dado */
function rangosCrimen(nivel) {
  const f = 1 + Math.max(0, (Number(nivel) || 1) - 1) * 0.15
  return {
    botin: [Math.round(BOTIN_BASE[0] * f), Math.round(BOTIN_BASE[1] * f)],
    multa: [Math.round(MULTA_BASE[0] * f), Math.round(MULTA_BASE[1] * f)],
  }
}

/** Pure: decide un crimen dado el azar (test) */
export function juicioCrimen(azar, botin = randomEntre(...BOTIN_BASE), multa = randomEntre(...MULTA_BASE)) {
  return azar < 0.4 ? { exito: true, monto: botin } : { exito: false, monto: multa }
}

function randomEntre(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1))
}

const CRIMENES = [
  'saqueaste la nevera secreta de Beerus',
  'viste rampas falsas en la luna de Champa',
  'vendiaste stikers falsificados en el mercado obscuro',
  'falsificaste loteria del Torneo del Poder',
  'huiste con los tesoro del templo de Zamasu',
]

const FRACASOS = [
  'Whis te vio desde la esfera y anoto la placa',
  'un Tanuki se interpuso en la ruta',
  'el guardia de la rueda de la fortuna te reconoció',
  'tus pies rebeldes tropezaron al escapar',
  'tei-rouses un sensor de Ki al pasar la garita',
]

export default async ({ sock, jid, msg, sender }) => {
  const quien = sender || msg.key.participant || jid

  const espera = recargaActiva(quien, 'crime')
  if (espera) {
    await sock.sendMessage(jid, { text: espera, quoted: msg })
    return
  }

  const eco = obtenerEconomia(quien)
  const rangos = rangosCrimen(eco.nivel)
  const { exito, monto } = juicioCrimen(Math.random(), randomEntre(...rangos.botin), randomEntre(...rangos.multa))

  marcarUso(quien, 'crime')

  if (exito) {
    sumarMonedas(quien, monto, 'crimen', 'Botin de crimen')
    anadirExperiencia(quien, 15)
    await sock.sendMessage(jid, {
      text:
        `🥷 *¡Crimen perfecto!*\n\n` +
        `${CRIMENES[Math.floor(Math.random() * CRIMENES.length)]}.\n` +
        `🪙 Botin: *+${formatearNumero(monto)}* oro\n` +
        `💰 Saldo: *${formatearNumero(obtenerEconomia(quien).monedas)}*`,
      quoted: msg,
    })
    return
  }

  const multa = Math.min(monto, eco.monedas)
  if (multa > 0) restarMonedas(quien, multa, 'multa', 'Crimen fallido')

  await sock.sendMessage(jid, {
    text:
      `🚓 *¡Crimen fallido!*\n\n` +
      `${FRACASOS[Math.floor(Math.random() * FRACASOS.length)]}.\n` +
      `💸 Multa: *-${formatearNumero(multa)}* oro\n` +
      `💰 Saldo: *${formatearNumero(obtenerEconomia(quien).monedas)}*`,
    quoted: msg,
  })
}
