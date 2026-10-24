import { db } from '../database/db.js'
import { esOwnerMsg, asegurarOwnerVip } from '../lib/owner.js'

export default async ({ sock, jid, msg, args, sender, esGrupo }) => {
  if (!esGrupo) {
    return await sock.sendMessage(jid, { text: '❌ Solo funciona en grupos.', quoted: msg })
  }
  const accion = args[0]?.toLowerCase() || 'list'
  const usuario = args[1] ? args[1].replace('@', '').replace('.net', '') + '@s.whatsapp.net' : sender
  // El owner se reconoce aunque su JID llegue como LID (sin el numero visible)
  const esOwner = esOwnerMsg({ sock, msg, sender })
  const soloOwner = '❌ Solo Beerus_zv (+573208089136) puede usar .vip ' + accion
  if (accion === 'add') {
    if (!esOwner) return await sock.sendMessage(jid, { text: soloOwner, quoted: msg })
    // Vincula el JID actual del owner (aunque sea @lid) a la tabla vip
    asegurarOwnerVip(db, { sock, msg, sender })
    db.exec(`INSERT OR IGNORE INTO vip (jid, rango) VALUES (?, 'vip')`, [usuario])
    db.exec(`INSERT INTO vip_log (jid,accion,razon) VALUES (?,?,?)`, [sender, 'add', 'Agregado por admin'])
    return await sock.sendMessage(jid, { text: `⭐ *VIP agregado:* ${args[1] || 'tú'}`, quoted: msg })
  }
  if (accion === 'remove') {
    if (!esOwner) return await sock.sendMessage(jid, { text: soloOwner, quoted: msg })
    db.exec(`DELETE FROM vip WHERE jid = ?`, [usuario])
    return await sock.sendMessage(jid, { text: `❌ *VIP removido:* ${args[1] || 'tú'}`, quoted: msg })
  }
  // List VIP
  const rows = db.prepare(`SELECT jid, rango FROM vip WHERE rango = 'vip'`).all()
  const lista = rows.length ? rows.map(r => '• ' + r.jid.split('@')[0]).join('\n') : 'Nadie aún.'
  await sock.sendMessage(jid, { text: `👑 *Club VIP\n${lista}`, quoted: msg })
}
