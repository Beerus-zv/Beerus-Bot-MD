/**
 * /antispam - Activa o desactiva antispam en el grupo
 */
import { modoChat, configurarModo } from '../database/db.js'
import { esGrupo, esAdmin, obtenerMetadata } from '../lib/grupo.js'

export default async ({ sock, jid, msg, args, sender, esGrupo }) => {
  const accion = (args[0] || '').toLowerCase()
  const chat = esGrupo ? jid : jid

  if (!esGrupo) {
    await sock.sendMessage(jid, { text: '❓ El antispam solo funciona en grupos.', quoted: msg })
    return
  }

  try {
    const isAdmin = await esAdmin(await (await import('../lib/grupo.js')).obtenerMetadata(sock, jid).catch(() => ({})), sender)
    if (!isAdmin) {
      await sock.sendMessage(jid, { text: '❌ Solo admins pueden usar `/antispam`.', quoted: msg })
      return
    }
  } catch {
    // si falla metadata, permitir si es admin del chat por DB
  }

  if (accion === 'on' || accion === 'activar') {
    configurarModo(jid, 'antispam', 1)
    await sock.sendMessage(jid, { text: '🛡️ *Antispam activado* en este grupo. 10 mensajes / 5 segundos = advertencia. 3 strikes = expulsión.', quoted: msg })
  } else if (accion === 'off' || accion === 'desactivar') {
    configurarModo(jid, 'antispam', 0)
    await sock.sendMessage(jid, { text: '🛡️ *Antispam apagado*.', quoted: msg })
  } else {
    const activo = modoChat(jid, 'antispam') ? 'ON' : 'OFF'
    await sock.sendMessage(jid, {
      text: `🛡️ *Antispam:* ${activo}\n\n• \`/antispam on\` → activa\n• \`/antispam off\` → desactiva`,
      quoted: msg,
    })
  }
}
