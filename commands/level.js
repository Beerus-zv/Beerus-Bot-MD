/**
 * `/level [@mención]` (también `/lvl`): nivel y experiencia de alguien.
 */
import { obtenerEconomia, obtenerUsuario, XP_POR_NIVEL } from '../database/db.js'
import { menciones, jidUsuario, tokenMencion } from '../lib/grupo.js'
import { nombreLegible } from '../lib/economia.js'

export default async ({ sock, jid, msg, sender }) => {
  const quien = jidUsuario(sender || jid)
  const objetivo = jidUsuario(menciones(msg)[0] || quien)

  const eco = obtenerEconomia(objetivo)
  const dentro = Number(eco.experiencia) % XP_POR_NIVEL
  const faltan = XP_POR_NIVEL - dentro
  const barra = Math.round((dentro / XP_POR_NIVEL) * 10)

  await sock.sendMessage(jid, {
    text:
      `📈 *Nivel de ${nombreLegible(objetivo, obtenerUsuario)}*${objetivo === quien ? '' : ` ${tokenMencion(objetivo)}`}\n\n` +
      `▸ Nivel: *${eco.nivel}*\n` +
      `▸ XP total: *${eco.experiencia}*\n` +
      `▸ Progreso: *${dentro}/${XP_POR_NIVEL}* ${'🪓'.repeat(barra).slice(0, 20) || '—'}\n` +
      `_Le faltan ${faltan} XP para el nivel ${eco.nivel + 1}._\n\n` +
      '_Gana experiencia usando los comandos de economía y el gacha._',
    mentions: objetivo === quien ? [] : [objetivo],
    quoted: msg,
  })
}
