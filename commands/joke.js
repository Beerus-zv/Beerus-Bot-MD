import { CHISTES, elegirAleatorio } from '../lib/entretenimiento.js'

export default async ({ sock, jid, msg }) => {
  const chiste = elegirAleatorio(CHISTES)

  await sock.sendMessage(jid, {
    text: `😂 *Chiste del día*\n\n${chiste}`,
    quoted: msg,
  })
}
