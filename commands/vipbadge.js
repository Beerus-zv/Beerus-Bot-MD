import { db } from '../database/db.js'
import { asegurarOwnerVip } from '../lib/owner.js'

export default async ({ sock, jid, msg, sender }) => {
  // Vincula el JID actual del owner (aunque sea @lid) a la tabla vip
  asegurarOwnerVip(db, { sock, msg, sender })
  const row = db.prepare(`SELECT rango FROM vip WHERE jid = ?`).get(sender)
  if (!row) return await sock.sendMessage(jid, { text: '❌ No eres VIP. Usa `.vip` para ver cómo unirte.', quoted: msg })
  await sock.sendMessage(jid, {
    text: `👑 *Badge VIP*\nRango: ${row.rango}\nEstado: Activo\nBeneficios: Comandos exclusivos + ranking`,
    quoted: msg,
  })
}
