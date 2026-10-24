import { db, obtenerEconomia, sumarMonedas, anadirExperiencia } from '../database/db.js'
import { asegurarOwnerVip } from '../lib/owner.js'

export default async ({ sock, jid, msg, sender }) => {
  // Vincula el JID actual del owner (aunque sea @lid) a la tabla vip
  asegurarOwnerVip(db, { sock, msg, sender })
  // Solo VIP (el owner tambien)
  const vipRow = db.prepare('SELECT * FROM vip WHERE jid = ?').get(sender)
  if (!vipRow || !['vip', 'owner'].includes(vipRow.rango)) {
    return await sock.sendMessage(jid, {
      text: '❌ Solo usuarios VIP pueden usar `.vipboost`.\nUsa `.vipbadge` para verificar tu rango.',
      quoted: msg,
    })
  }

  // Cooldown semanal (7 días)
  if (vipRow.ultimo_boost) {
    const ultimo = new Date(vipRow.ultimo_boost)
    const ahora = new Date()
    const diffMs = ahora - ultimo
    const diffDias = diffMs / (1000 * 60 * 60 * 24)
    if (diffDias < 7) {
      const restantes = Math.ceil((7 - diffDias) * 24)
      return await sock.sendMessage(jid, {
        text: `⏱️ *Cooldown VIP Boost activo*\nPuedes volver a usarlo en ~${restantes} horas (una vez por semana).`,
        quoted: msg,
      })
    }
  }

  // Sumar experiencia (moderada) y dinero (moderado)
  const XP = 200
  const MONEDAS = 500

  // Sumar experiencia (moderada) y dinero (moderado)
  sumarMonedas(sender, MONEDAS, 'vip_boost', 'Boost VIP semanal')
  anadirExperiencia(sender, XP)

  // Marcar cooldown en vip
  db.prepare("UPDATE vip SET ultimo_boost = datetime('now','localtime') WHERE jid = ?").run(sender)
  db.prepare('INSERT INTO vip_log (jid, accion, razon) VALUES (?, ?, ?)').run(sender, 'vip_boost', 'Usó boost semanal')

  await sock.sendMessage(jid, {
    text: `👑 *VIP BOOST ACTIVADO*\n+${MONEDAS} monedas\n+${XP} experiencia\n⏱️ Siguiente uso: en 7 días`,
    quoted: msg,
  })
}
