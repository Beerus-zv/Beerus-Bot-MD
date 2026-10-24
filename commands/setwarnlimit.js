/**
 * `/setwarnlimit <n>`: define cuantas advertencias aguanta un miembro
 * antes de la recomendacion de baneo (`/advertencia`. Por defecto: 3.
 */
import { comandoGrupo } from '../lib/comandoGrupo.js'
import { limiteAdvertencias, configurarLimiteAdvertencias } from '../database/db.js'

export default comandoGrupo({
  uso: 'Uso: /setwarnlimit <cantidad|actual>',
  accion: 'warnlimit',
  handler: async ({ sock, jid, msg, args }) => {
    const sub = String(args[0] || '').toLowerCase()

    if (!sub) {
      await sock.sendMessage(jid, {
        text:
          `⚠️ *Límite de advertencias:* ${limiteAdvertencias(jid)}\n\n` +
          `_Cambia con_ \`/setwarnlimit <cantidad>\`_._`,
        quoted: msg,
      })
      return
    }

    const nuevo = Number(sub)
    if (!Number.isFinite(nuevo) || nuevo < 1 || nuevo > 20) {
      await sock.sendMessage(jid, {
        text: '❓ Dime un *número entre 1 y 20*.\n\n*Uso:* `/setwarnlimit <cantidad>`',
        quoted: msg,
      })
      return
    }

    const fijado = configurarLimiteAdvertencias(jid, nuevo)
    await sock.sendMessage(jid, {
      text: `✅ Nuevo límite: *${fijado}* advertencia(s) antes del flag de baneo.`,
      quoted: msg,
    })
  },
})
