/**
 * /inspect — Info del grupo / enlace
 */
export default async ({ sock, msg, jid, esGrupo }) => {
  try {
    let text = ''
    if (esGrupo) {
      const meta = await sock.groupMetadata(jid)
      let img = null
      try { img = await sock.profilePictureUrl(jid, 'image').catch(() => null) } catch {}
      const admins = meta.participants?.filter(p => p.admin)?.map(p => p.id) || []
      const adminText = admins.map(a => '@' + a.split('@')[0]).join(', ')
      text = `*🔰 Inspector — Grupo*\n\n*ID:* ${meta.id}\n*Nombre:* ${meta.subject || 'N/A'}\n*Miembros:* ${meta.size || '?'}\n*Restricciones:* ${meta.restrict ? 'Sí' : 'No'}\n*Anuncios:* ${meta.announce ? 'Sí' : 'No'}\n*Comunidad:* ${meta.isCommunity ? 'Sí' : 'No'}\n*Admin:* ${adminText || 'N/A'}`
      await sock.sendMessage(jid, {
        image: img ? { url: img } : undefined,
        caption: text,
        mentions: admins,
        quoted: msg,
      })
      return
    } else {
      text = '❓ Usa `.inspect` dentro de un grupo.'
    }
    await sock.sendMessage(jid, { text, quoted: msg })
  } catch (e) {
    await sock.sendMessage(jid, { text: `❌ Error inspect: ${e.message || e}`, quoted: msg })
  }
}
