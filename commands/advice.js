import { CONSEJOS, elegirAleatorio } from '../lib/entretenimiento.js'

export default async ({ sock, jid, msg }) => {
  const consejo = elegirAleatorio(CONSEJOS)

  await sock.sendMessage(jid, {
    text: `💡 *Consejo del día*\n\n${consejo}`,
    quoted: msg,
  })
}
