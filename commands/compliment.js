import { ELOGIOS, elegirAleatorio } from '../lib/entretenimiento.js'

export default async ({ sock, jid, msg }) => {
  const elogio = elegirAleatorio(ELOGIOS)

  await sock.sendMessage(jid, {
    text: `🌟 *Elogio para ti*\n\n${elogio}`,
    quoted: msg,
  })
}
