import { FIRMA } from '../lib/tema.js'

export default async ({ sock, jid, msg }) => {
  const latencia = Date.now() - Number(msg.messageTimestamp) * 1000
  await sock.sendMessage(jid, {
    text: `🏓 *Pong!* (${latencia} ms)\n\n${FIRMA}`,
    quoted: msg,
  })
}

