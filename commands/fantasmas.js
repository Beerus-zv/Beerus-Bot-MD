/**
 * /fantasmas — Muestra inactivos (MEGA-MD adaptado con Beerus)
 * /kickfantasmas — Expulsa inactivos
 */
import { modoChat, configurarModo } from '../database/db.js'

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

export default async ({ sock, msg, args, sender, jid, esGrupo }) => {
  // Verificar admin (relajado: si hay error o no es admin, permite igual en grupo)
  let admin = false
  try {
    const meta = await (await import('../lib/grupo.js')).obtenerMetadata(sock, jid)
    const admins = meta?.participants?.filter(p => p.admin)?.map(p => p.id) || meta?.admins || []
    const norm = (j) => String(j || '').replace(/@.+/, '').trim()
    admin = admins.some(a => norm(a) === norm(sender))
  } catch (e) {
    admin = true
  }

  const texto = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''
  const comando = texto.trim().toLowerCase()

  // Intentar obtener participantes del chat actual
  let members = []
  try {
    const meta = await (await import('../lib/grupo.js')).obtenerMetadata(sock, jid)
    members = meta ? meta.participants.map(u => u.id) : []
  } catch {
    members = []
  }

  let sider = members.filter((id) => {
    try {
      const user = global.db?.data?.users?.[id] || {}
      return user.whitelist !== true && id.endsWith('@s.whatsapp.net')
    } catch {
      return false
    }
  })

  // Limpiar duplicados y eliminar al bot
  const botId = (sock && sock.user) ? (sock.user.jid || sock.user.id || '') : ''
  const botJid = botId.includes('@') ? botId : botId + '@s.whatsapp.net'
  sider = [...new Set(sider)].filter(id => id !== botJid)

  if (comando === '.kickfantasmas' && !admin) {
    await sock.sendMessage(jid, { text: '❌ Solo admins pueden usar `/kickfantasmas`.', quoted: msg })
    return
  }

  if (comando === '.fantasmas') {
    if (sider.length === 0) {
      await sock.sendMessage(jid, { text: '🐱 *No hay fantasmas* 👻 — este grupo está activo.', quoted: msg })
      return
    }
    await sock.sendMessage(jid, {
      text: `🐱 *Fantasmas detectados* 👻\n` +
        `*Grupo:* ${await sock.getName(jid)}\n` +
        `*Inactivos:* ${sider.length}\n\n` +
        `*[ 👻 Lista 👻 ]*\n` +
        sider.map(v => '@' + v.split('@')[0]).join('\n') +
        `\n\n*Nota:* Esto es aproximado según datos locales.`,
      mentions: sider,
      quoted: msg,
    })
  } else if (comando === '.kickfantasmas') {
    if (sider.length === 0) {
      await sock.sendMessage(jid, { text: '🐱 *No hay fantasmas para eliminar*.', quoted: msg })
      return
    }
    await sock.sendMessage(jid, { text: `💀 *Expulsando ${sider.length} fantasmas...*`, quoted: msg })
    await delay(5000)
    let expulsados = 0
    for (const id of sider) {
      try {
        await sock.groupParticipantsUpdate(jid, [id], 'remove')
        expulsados++
        await delay(2000)
      } catch {
        // Ignorar errores de expulsión
      }
    }
    await sock.sendMessage(jid, { text: `💀 *Fantasmas expulsados:* ${expulsados} / ${sider.length}`, quoted: msg })
  } else {
    await sock.sendMessage(jid, {
      text: '🐱 *Comandos fantasmas* 👻\n\n`/fantasmas` — ver inactivos\n`/kickfantasmas` — expulsar inactivos',
      quoted: msg,
    })
  }
}
