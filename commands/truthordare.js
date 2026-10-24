import { VERDADES, RETOS, elegirAleatorio } from '../lib/entretenimiento.js'

export default async ({ sock, jid, msg, args }) => {
  const sub = String(args[0] || '').toLowerCase()
  const quiereVerdad = sub === 'truth' || sub === 'verdad' || sub === 'v'
  const quiereReto = sub === 'dare' || sub === 'reto' || sub === 'r'

  if (sub && !quiereVerdad && !quiereReto) {
    await sock.sendMessage(jid, {
      text: '❓ *Uso:* `/truthordare [verdad|reto]`\n\n_Sin opciones el bot sortea una._',
      quoted: msg,
    })
    return
  }

  const esReto = quiereReto || (!quiereVerdad && Math.random() < 0.5)
  const contenido = esReto ? elegirAleatorio(RETOS) : elegirAleatorio(VERDADES)
  const titulo = esReto ? '🔥 *¡Reto!*' : '💬 *¡Verdad!*'

  await sock.sendMessage(jid, {
    text: `${titulo}\n\n${contenido}\n\n_Este juego es para divertirse, no para hacer daño._`,
    quoted: msg,
  })
}
