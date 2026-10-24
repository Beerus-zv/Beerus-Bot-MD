import { normalizeMessageContent } from '@whiskeysockets/baileys'
import { descargarMedia } from '../lib/multimedia.js'

const EMOJIS = [
  '😂', '🤣', '🥺', '😱', '🔥', '💥', '👑', '💀', '🎉', '💖', '👀', '😎', '🚀', '🍺',
  '💥', '⚡', '🌟', '🐲', '🍜', '🌪️', '🏜️', '🌌', '☠️', '🍾', '🥸', '🤡', '👌', '🍕',
]

export const AYUDA =
  '🧨 *Reaccionar*\n\n' +
  '*Uso:* responde a un mensaje y escribe `/reaccionar <emoji>`\n\n' +
  '• `/reaccionar 🔥` — reacciona con ese emoji\n' +
  '• `/reaccionar` — reacciona con un emoji al azar\n' +
  '• `/reaccionar lista` — emojis disponibles'

/**
 * Reacciona al mensaje citado con un emoji (baileys sendMessage react).
 */
export default async ({ sock, jid, msg, args }) => {
  const claveCitada = claveDeCitado(msg, sock)

  if (!claveCitada) {
    await sock.sendMessage(jid, {
      text: `${AYUDA}\n\n❌ Responde a un mensaje para reaccionar.`,
      quoted: msg,
    })
    return
  }

  const pedido = (args?.[0] || '').trim()
  let emoji

  if (!pedido) {
    emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)]
  } else if (pedido.toLowerCase() === 'lista') {
    await sock.sendMessage(jid, {
      text: `${AYUDA}\n\n🎨 ${EMOJIS.join(' ')}`,
      quoted: msg,
    })
    return
  } else {
    // acepta emoji o su version demografica (unicode multipunto)
    if (!/\p{Extended_Pictographic}/u.test(pedido)) {
      await sock.sendMessage(jid, {
        text: '❓ Ese texto no parece un emoji. Usa `/reaccionar lista` para ver ejemplos.',
        quoted: msg,
      })
      return
    }
    emoji = Array.from(pedido)[0] // whatsapp solo acepta emojis de un bloque
  }

  try {
    await sock.sendMessage(jid, { react: { text: emoji, key: claveCitada } })
  } catch (err) {
    console.error('Error reaccionando:', err)
    await sock.sendMessage(jid, {
      text: '❌ No se pudo reaccionar. Zamasu puede que no te deje hacerlo.',
      quoted: msg,
    })
  }
}

/** Devuelve la key del mensaje citado, lista para pasar a { react }. */
function claveDeCitado(msg, sock) {
  const contenido = normalizeMessageContent(msg?.message)
  const contexto =
    contenido?.extendedTextMessage?.contextInfo ||
    contenido?.imageMessage?.contextInfo ||
    contenido?.videoMessage?.contextInfo ||
    contenido?.stickerMessage?.contextInfo

  if (!contexto?.stanzaId || !contexto?.quotedMessage) return null

  const desdeElBot =
    contexto.participant &&
    sock?.user?.id &&
    contexto.participant.split('@')[0] === sock.user.id.split('@')[0]

  return {
    remoteJid: contexto.remoteJid || msg.key?.remoteJid,
    fromMe: Boolean(desdeElBot),
    id: contexto.stanzaId,
    participant: contexto.participant || undefined,
  }
}
