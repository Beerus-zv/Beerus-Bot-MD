import { db, sumarMonedas, anadirExperiencia } from '../database/db.js'
import { asegurarOwnerVip } from '../lib/owner.js'
import { jidsDe, filaVip, esVip } from '../lib/vip.js'

export default async ({ sock, jid, msg, sender }) => {
  // Vincula el JID actual del owner (aunque sea @lid) a la tabla vip
  asegurarOwnerVip(db, { sock, msg, sender })

  const jids = jidsDe({ msg, sender, sock })
  const fila = filaVip(jids)
  if (!esVip(jids) || !fila) {
    return sock.sendMessage(jid, {
      text: '❌ Solo usuarios VIP pueden usar `.vipboost`.\nPide acceso con `.vip add @usuario` (owner).',
      quoted: msg,
    })
  }

  // Cooldown semanal (7 dias)
  if (fila.ultimo_boost) {
    const ultimo = new Date(fila.ultimo_boost)
    const diffDias = (Date.now() - ultimo.getTime()) / (1000 * 60 * 60 * 24)
    if (diffDias < 7) {
      const restantes = Math.ceil((7 - diffDias) * 24)
      return sock.sendMessage(jid, {
        text: `⏱️ *Cooldown VIP Boost activo*\nPuedes volver a usarlo en ~${restantes} horas (una vez por semana).`,
        quoted: msg,
      })
    }
  }

  const XP = 200
  const MONEDAS = 500

  sumarMonedas(sender, MONEDAS, 'vip_boost', 'Boost VIP semanal')
  anadirExperiencia(sender, XP)

  // El cooldown se marca en la fila que realmente coincidio (PN o LID)
  db.prepare("UPDATE vip SET ultimo_boost = datetime('now','localtime') WHERE jid = ?").run(fila.jid)
  db.prepare('INSERT INTO vip_log (jid, accion, razon) VALUES (?, ?, ?)').run(fila.jid, 'vip_boost', 'Uso boost semanal')

  await sock.sendMessage(jid, {
    text: `👑 *VIP BOOST ACTIVADO*\n+${MONEDAS} monedas\n+${XP} experiencia\n⏱️ Siguiente uso: en 7 días`,
    quoted: msg,
  })
}
