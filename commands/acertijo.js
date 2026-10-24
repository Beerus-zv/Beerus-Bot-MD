/**
 * `/acertijo` — trivia de acertijos con respuesta.
 *
 *   /acertijo            → propone un acertijo nuevo
 *   /acertijo arbol      → responde al acertijo pendiente
 */
import { ACERTIJOS, elegirAleatorio } from '../lib/juegos.js'

/** Acertijo pendiente de cada usuario (en memoria) */
const pendientes = new Map()

/** Quita acentos y signos para comparar respuestas */
function normalizar(texto) {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zñ0-9]/g, '')
}

export default async ({ sock, jid, msg, args, sender }) => {
  const quien = sender || jid
  const respuesta = normalizar(args.join(' '))

  // Hay un acertijo pendiente y el usuario está respondiendo
  if (respuesta && pendientes.has(quien)) {
    const acertijo = pendientes.get(quien)

    if (respuesta === normalizar(acertijo.respuesta)) {
      pendientes.delete(quien)
      await sock.sendMessage(jid, {
        text: `🎉 *¡Correcto!*\n\nLa respuesta era *${acertijo.respuesta}*.`,
        quoted: msg,
      })
      return
    }

    // Se permiten dos intentos fallidos
    const intentos = (acertijo.intentos ?? 0) + 1

    if (intentos >= 2) {
      pendientes.delete(quien)
      await sock.sendMessage(jid, {
        text:
          `❌ No era esa.\n\nLa respuesta era *${acertijo.respuesta}*.\n` +
          `_Pide otro con /acertijo_`,
        quoted: msg,
      })
      return
    }

    pendientes.set(quien, { ...acertijo, intentos })
    await sock.sendMessage(jid, {
      text:
        `❌ Nope.\n\n` +
        `_Pista: empieza por "${acertijo.respuesta[0]}" y tiene ${acertijo.respuesta.length} letras._`,
      quoted: msg,
    })
    return
  }

  // Acertijo nuevo
  const acertijo = elegirAleatorio(ACERTIJOS)
  if (!acertijo) return

  pendientes.set(quien, { ...acertijo, intentos: 0 })

  await sock.sendMessage(jid, {
    text:
      `🧩 *Acertijo de Beerus*\n\n` +
      `> ${acertijo.pregunta}\n\n` +
      `_Responde con /acertijo <respuesta>_`,
    quoted: msg,
  })
}
