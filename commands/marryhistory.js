/**
 * `/marryhistory [@mención]` (también `/historialmatrimonio`,
 * `/marriagehistory`): las bodas y divorcios de un usuario.
 */
import { historialMatrimonio, obtenerUsuario } from '../database/db.js'
import { menciones, jidUsuario, tokenMencion } from '../lib/grupo.js'
import { nombreLegible } from '../lib/economia.js'

const etiq = {
  boda: { icono: '💍', texto: 'se casó con' },
  divorcio: { icono: '💔', texto: 'se divorció de' },
}

export default async ({ sock, jid, msg, args, sender }) => {
  const objetivo = jidUsuario(menciones(msg)[0] || sender || jid)
  const registros = historialMatrimonio(objetivo, 15)

  if (!registros.length) {
    await sock.sendMessage(jid, {
      text:
        `📜 ${tokenMencion(objetivo)} no tiene historial de libertinaje.\n\n` +
        '_Se casa con_ `/marry @usuario`_._',
      mentions: [jidUsuario(objetivo)],
      quoted: msg,
    })
    return
  }

  const lineas = registros.map((r) => {
    const e = etiq[r.tipo] || { icono: '📄', texto: r.tipo }
    const pareja = r.pareja ? nombreLegible(r.pareja, obtenerUsuario) : '—'
    const dia = String(r.creado_en || '').slice(0, 10)
    return `▸ ${dia} — ${e.icono} ${e.texto} *${pareja}*`
  })

  await sock.sendMessage(jid, {
    text:
      `📜 *Historial matrimonial de ${nombreLegible(objetivo, obtenerUsuario)}*\n\n${lineas.join('\n')}\n\n` +
      `_Los capítulos se abren con_ \`/marry @usuario\` _y se cierran con_ \`/divorce\`_.`,
    mentions: [jidUsuario(objetivo)],
    quoted: msg,
  })
}
