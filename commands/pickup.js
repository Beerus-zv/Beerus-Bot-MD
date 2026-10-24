import { FRASES_LIGAR, elegirAleatorio } from '../lib/entretenimiento.js'

export default async ({ sock, jid, msg }) => {
  const frase = elegirAleatorio(FRASES_LIGAR)

  await sock.sendMessage(jid, {
    text: `💘 *Frase para ligar*\n\n${frase}`,
    quoted: msg,
  })
}
