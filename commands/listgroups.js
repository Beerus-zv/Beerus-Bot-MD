export default async ({ sock, jid, msg }) => {
  try {
    const todos = await sock.groupFetchAllParticipating()
    const grupos = Object.values(todos || {})

    if (!grupos.length) {
      await sock.sendMessage(jid, {
        text: '📭 El bot no está en ningún grupo.',
        quoted: msg,
      })
      return
    }

    const lista = grupos
      .map((g) => {
        const subject = g.subject || 'Sin nombre'
        const miembros = g.size ?? g.participants?.length ?? 0
        // El enlace directo viene de Baileys en g.inviteLink
        const linkInv = g.inviteLink || null
        // Mostrar el enlace si Baileys lo proporciona; si no, el ID completo
        const textoLink = linkInv
          ? `🔗 ${linkInv}`
          : `\`${g.id || 'sin ID'}\``
        return `• *${subject}* — ${miembros} miembros\n   ${textoLink}`
      })
      .join('\n\n')

    await sock.sendMessage(jid, {
      text: `📂 *Grupos donde está el bot* (${grupos.length})\n\n${lista}`,
      quoted: msg,
    })
  } catch (err) {
    console.error('Error listando los grupos:', err)
    await sock.sendMessage(jid, {
      text: '❌ No se pudo obtener la lista de grupos.',
      quoted: msg,
    })
  }
}