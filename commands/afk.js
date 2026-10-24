/**
 * `/afk` — marca o quita la ausencia del usuario.
 *
 *   /afk           → te marca ausente
 *   /afk comiendo  → te marca ausente con un motivo
 *   /afk quitar    → quitas la ausencia
 */
import { marcarAfk, obtenerAfk, quitarAfk } from '../database/db.js'

export default async ({ sock, jid, msg, args, sender }) => {
  const quien = sender || jid
  const entrada = args.join(' ').trim()
  const actual = obtenerAfk(quien)

  // Quitar la ausencia
  if (entrada === 'quitar' || entrada === 'off' || entrada === 'yaestoy') {
    if (!actual) {
      await sock.sendMessage(jid, {
        text: '👀 No estabas marcado como ausente.',
        quoted: msg,
      })
      return
    }

    quitarAfk(quien)
    await sock.sendMessage(jid, {
      text: '✅ Ya no estás ausente. Bienvenido de vuelta.',
      quoted: msg,
    })
    return
  }

  // Marcar la ausencia
  const motivo = entrada || 'Ausente'
  marcarAfk(quien, motivo, jid)

  await sock.sendMessage(jid, {
    text:
      `💤 *Ausente*\n\n` +
      (entrada ? `_Motivo:_ ${entrada}\n\n` : '') +
      `_Te avisaré cuando escribas._`,
    quoted: msg,
  })
}
