import { CITAS, elegirAleatorio } from '../lib/entretenimiento.js'

export default async ({ sock, jid, msg }) => {
  const cita = elegirAleatorio(CITAS)

  await sock.sendMessage(jid, {
    text: `💭 *Cita del día*\n\n${cita}`,
    quoted: msg,
  })
}
