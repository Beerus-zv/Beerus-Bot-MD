/**
 * `/adivinar` — juego de adivinar el número.
 *
 *   /adivinar             → inicia una partida (del 1 al 100)
 *   /adivinar 42          → adivina el número 42
 *   /adivinar nuevo 200   → reinicia la partida con otro rango
 */
import {
  iniciarAdivinar,
  obtenerAdivinar,
  sumarIntentoAdivinar,
  borrarAdivinar,
} from '../database/db.js'

const MAXIMO_POR_DEFECTO = 100
const MAXIMO_PERMITIDO = 1000

/** Responde a un intento con la pista correspondiente */
async function responderIntento({ sock, jid, msg, quien, intento, partida }) {
  if (intento === partida.numero) {
    borrarAdivinar(quien)
    await sock.sendMessage(jid, {
      text:
        `🎉 *¡Le atinaste!*\n\n` +
        `El número era *${partida.numero}*.\n` +
        `Lo lograste en *${partida.intentos + 1}* intentos.`,
      quoted: msg,
    })
    return
  }

  const actualizada = sumarIntentoAdivinar(quien)
  const pista = intento < partida.numero ? '📉 Es *mayor*' : '📈 Es *menor*'

  await sock.sendMessage(jid, {
    text:
      `${pista} que *${intento}*.\n` +
      `Rango: *1* a *${partida.maximo}* · Intentos: *${actualizada.intentos}*`,
    quoted: msg,
  })
}

export default async ({ sock, jid, msg, args, sender }) => {
  const quien = sender || jid
  const primero = (args[0] || '').toLowerCase()

  // /adivinar nuevo [maximo] → reinicia la partida
  if (primero === 'nuevo' || primero === 'new' || primero === 'reiniciar') {
    const maximo = Number(args[1]) || MAXIMO_POR_DEFECTO

    if (maximo < 10 || maximo > MAXIMO_PERMITIDO) {
      await sock.sendMessage(jid, {
        text: `❓ El rango debe estar entre *10* y *${MAXIMO_PERMITIDO}*.\n\n*Ejemplo:* /adivinar nuevo 50`,
        quoted: msg,
      })
      return
    }

    const numero = Math.floor(Math.random() * maximo) + 1
    iniciarAdivinar(quien, numero, maximo)

    await sock.sendMessage(jid, {
      text:
        `🎯 *Adivina el número*\n\n` +
        `Estoy pensando en un número del *1* al *${maximo}*.\n` +
        `_Manda /adivinar <número> para intentar_`,
      quoted: msg,
    })
    return
  }

  const partida = obtenerAdivinar(quien)

  // /adivinar <número> → intento
  if (primero !== '') {
    const intento = Number(primero)

    if (!Number.isInteger(intento)) {
      await sock.sendMessage(jid, {
        text: '❓ Eso no es un número. Intenta con `/adivinar 42`',
        quoted: msg,
      })
      return
    }

    // Sin partida previa se crea una y el número cuenta como primer intento
    if (!partida) {
      const numero = Math.floor(Math.random() * MAXIMO_POR_DEFECTO) + 1
      iniciarAdivinar(quien, numero, MAXIMO_POR_DEFECTO)
      return responderIntento({
        sock,
        jid,
        msg,
        quien,
        intento,
        partida: obtenerAdivinar(quien),
      })
    }

    if (intento < 1 || intento > partida.maximo) {
      await sock.sendMessage(jid, {
        text: `❓ El número debe estar entre *1* y *${partida.maximo}*.`,
        quoted: msg,
      })
      return
    }

    return responderIntento({ sock, jid, msg, quien, intento, partida })
  }

  // /adivinar → muestra el estado o inicia la partida
  if (partida) {
    await sock.sendMessage(jid, {
      text:
        `🎯 *Partida en curso*\n\n` +
        `Rango: *1* a *${partida.maximo}*\n` +
        `Intentos: *${partida.intentos}*\n\n` +
        `_Manda /adivinar <número> para intentar_`,
      quoted: msg,
    })
    return
  }

  const numero = Math.floor(Math.random() * MAXIMO_POR_DEFECTO) + 1
  iniciarAdivinar(quien, numero, MAXIMO_POR_DEFECTO)

  await sock.sendMessage(jid, {
    text:
      `🎯 *Adivina el número*\n\n` +
      `Estoy pensando en un número del *1* al *${MAXIMO_POR_DEFECTO}*.\n` +
      `_Manda /adivinar <número> para intentar_`,
    quoted: msg,
  })
}
