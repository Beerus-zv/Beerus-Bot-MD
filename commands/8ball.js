import { RESPUESTAS_8BALL, elegirAleatorio } from '../lib/entretenimiento.js'

export default async ({ sock, jid, msg, args }) => {
  const pregunta = args.join(' ').trim()
  const respuesta = elegirAleatorio(RESPUESTAS_8BALL)

  await sock.sendMessage(jid, {
    text:
      `🎱 *Bola de 8 bolas*\n\n` +
      `❓ ${pregunta || '¿Qué quieres saber?'}\n\n` +
      `🔮 *${respuesta}*`,
    quoted: msg,
  })
}
