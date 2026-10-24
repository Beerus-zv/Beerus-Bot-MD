/**
 * #birthdays (también #cumpleaños) — lista los cumpleaños próximos guardados.
 */
import { proximosCumpleanos, obtenerUsuario } from '../database/db.js'
import { tokenMencion } from '../lib/grupo.js'
import { nombreLegible } from '../lib/economia.js'

/** Días que faltan hasta MM-DD (a cuenta, si pasó este año cuenta el próximo) */
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
  const lista = proximosCumpleanos(15)

  if (!lista.length) {
    await sock.sendMessage(jid, {
      text:
        '🎂 *Nadie guardó su cumpleaños todavía.*\n_Ponle la tuya con_ `/setbirth DD-MM`_.',
      quoted: msg,
    })
    return
  }

  const lineas = lista
    .map((u) => {
      const mmdd = String(u.fecha).split('-').slice(1).join('-')
      const faltan = diasHasta(mmdd)
      const nombre = nombreLegible(u.jid, obtenerUsuario)
      const marca = faltan === 0 ? '🎉 ¡HOY!' : faltan === 1 ? '🌙 mañana' : `⏳ ${faltan} días`
      return `${marca} — *${nombre}* ${tokenMencion(u.jid)} (${mmdd.split('-')[1]}-${mmdd.split('-')[0]})`
    })
    .join('\n')

  await sock.sendMessage(jid, {
    text:
      `🎂 *Cumpleaños del reino*\n\n${lineas}\n\n` +
      '_Guarda el tuyo con_ `/setbirth DD-MM`_.',
    mentions: lista.map((u) => u.jid),
    quoted: msg,
  })
}
