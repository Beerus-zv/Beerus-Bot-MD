/**
 * .anonimo [start|leave|next] — chat anónimo básico.
 * Empieza una conversación anónima con otro usuario del grupo.
 */
export default async ({ sock, jid, msg, args }) => {
  const action = String(args[0] || 'start').toLowerCase()
  if (action === 'start') {
    await sock.sendMessage(jid, {
      text: '🔒 Chat anónimo iniciado. Responde para hablar. Usa `.anonimo leave` para salir.',
      quoted: msg,
    })
  } else if (action === 'leave') {
    await sock.sendMessage(jid, { text: '👋 Has salido del chat anónimo.', quoted: msg })
  } else if (action === 'next') {
    await sock.sendMessage(jid, { text: '🔄 Cambiado a otro usuario (simulado). Sigue respondiendo.', quoted: msg })
  } else {
    await sock.sendMessage(jid, {
      text: '❓ Uso: `.anonimo start` · `.anonimo leave` · `.anonimo next`', quoted: msg,
    })
  }
}
