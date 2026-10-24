/**
 * `/allbirthdays` (también `/allbirths`): la lista completa de
 * cumpleaños guardados, ordenada por mes y día.
 */
import { todosCumpleanos, obtenerUsuario } from '../database/db.js'
import { tokenMencion } from '../lib/grupo.js'
import { nombreLegible } from '../lib/economia.js'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Días que faltan al MM-DD (el próximo año si ya pasó) */
function diasHasta(mmdd) {
  const hoy = new Date()
  const [mes, dia] = mmdd.split('-').map(Number)
  let destino = new Date(hoy.getFullYear(), mes - 1, dia)
  if (destino < new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) {
    destino = new Date(hoy.getFullYear() + 1, mes - 1, dia)
  }
  return Math.round((destino - hoy) / (24 * 60 * 60 * 1000))
}

export default async ({ sock, jid, msg }) => {
  const lista = todosCumpleanos()

  if (!lista.length) {
    await sock.sendMessage(jid, {
      text: '🎂 *Nadie guardó su cumpleaños todavía.*\n_Empieza la tradición con_ `/setbirth DD-MM`_.',
      quoted: msg,
    })
    return
  }

  const lineas = lista.map((u) => {
    const mmdd = String(u.fecha).split('-').slice(1).join('-')
    const mes = MESES[Number(mmdd.split('-')[0]) - 1] ?? '?'
    const dia = mmdd.split('-')[1]
    const faltan = diasHasta(mmdd)
    const marca = faltan === 0 ? ' 🎉HOY' : faltan === 1 ? ' (mañana)' : ''
    return `▸ ${dia} *${mes}* — ${nombreLegible(u.jid, obtenerUsuario)} ${tokenMencion(u.jid)}${marca}`
  })

  await sock.sendMessage(jid, {
    text:
      `🎂 *Todos los cumpleaños del reino* (${lineas.length}):\n\n${lineas.join('\n')}\n\n` +
      `_Guárdale papelitos a tu fecha con_ \`/setbirth DD-MM\`_.`,
    mentions: lista.map((u) => u.jid),
    quoted: msg,
  })
}
