/**
 * `/leaderboard [página]` (también `/lboard`, `/top`):
 * top de usuarios por experiencia, de 10 en 10.
 */
import { topExperiencia, totalRanking, obtenerUsuario } from '../database/db.js'
import { tokenMencion } from '../lib/grupo.js'
import { nombreLegible } from '../lib/economia.js'

const POR_PAGINA = 10

const MEDALLA = (pos) => (pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '🏅')

export default async ({ sock, jid, msg, args }) => {
  const pagina = Math.max(1, Math.trunc(Number(args[0]) || 1))
  const filas = topExperiencia(POR_PAGINA, pagina)
  const total = totalRanking()
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  if (!filas.length) {
    await sock.sendMessage(jid, {
      text: `🏆 Leaderboard vacío.\n\n_Aún nadie acumula experiencia._`,
      quoted: msg,
    })
    return
  }

  const lineas = filas.map((f, i) => {
    const pos = (pagina - 1) * POR_PAGINA + i + 1
    // La mención necesita @<digitos> en el texto para que WhatsApp la marque
    return `${MEDALLA(pos)} *#${pos}* — ${nombreLegible(f.jid, obtenerUsuario)} ${tokenMencion(f.jid)} · *${f.experiencia}* XP (nivel ${f.nivel})`
  })

  await sock.sendMessage(jid, {
    text:
      `🏆 *Leaderboard de experiencia*\n\n${lineas.join('\n')}\n\n` +
      `_Página *${pagina}/${paginas}*. Salta con_ \`/leaderboard <página>\`_.`,
    mentions: filas.map((f) => f.jid),
    quoted: msg,
  })
}
