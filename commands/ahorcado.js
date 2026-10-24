/**
 * `/ahorcado` — juego del ahorcado por grupo.
 *
 *   /ahorcado              → muestra la partida o empieza una nueva
 *   /ahorcado A            → prueba la letra A
 *   /ahorcado palabra X    → fija la palabra de la partida
 */
import { crearAhorcado, usarLetra, dibujarAhorcado } from '../lib/juegos.js'
import { guardarAhorcado, obtenerAhorcado, borrarAhorcado } from '../database/db.js'

/** Pinta el tablero del ahorcado */
function tablero(estado) {
  return (
    `\`\`\`\n` +
    `${dibujarAhorcado(estado.fallos, estado.maxFallos)}\n` +
    '```\n\n' +
    `🔤 ${estado.oculta}\n` +
    `❌ Fallos: *${estado.fallos}*/*${estado.maxFallos}*` +
    (estado.usados.length ? ` · Usadas: *${estado.usados.join(' ')}*` : '')
  )
}

export default async ({ sock, jid, msg, args }) => {
  const accion = (args[0] || '').toLowerCase()
  const estado = obtenerAhorcado(jid)

  // /ahorcado palabra <palabra> → fija la palabra
  if (accion === 'palabra' || accion === 'word') {
    const palabra = (args.slice(1).join(' ') || '').toUpperCase().replace(/[^A-ZÑ]/g, '')

    if (palabra.length < 3) {
      await sock.sendMessage(jid, {
        text: '❓ La palabra debe tener al menos 3 letras.\n\n*Ejemplo:* `/ahorcado palabra BEERUS`',
        quoted: msg,
      })
      return
    }

    const nuevo = crearAhorcado([palabra], 6)
    guardarAhorcado(jid, nuevo)

    await sock.sendMessage(jid, {
      text: `🪢 *Ahorcado*\n\n${tablero(nuevo)}`,
      quoted: msg,
    })
    return
  }

  // /ahorcado <letra> → intento
  if (accion.length === 1 && /[a-zñ]/i.test(accion)) {
    if (!estado) {
      await sock.sendMessage(jid, {
        text: '❓ No hay partida activa. Empieza una con `/ahorcado`',
        quoted: msg,
      })
      return
    }

    if (estado.terminado) {
      await sock.sendMessage(jid, {
        text: `🏁 La partida ya terminó. La palabra era *${estado.palabra}*.\n\nEmpieza otra con /ahorcado`,
        quoted: msg,
      })
      return
    }

    if (estado.usados.includes(accion.toUpperCase())) {
      await sock.sendMessage(jid, {
        text: `✖️ La letra *${accion.toUpperCase()}* ya se usó.`,
        quoted: msg,
      })
      return
    }

    const nuevo = usarLetra(estado, accion)
    guardarAhorcado(jid, nuevo)

    if (nuevo.ganado) {
      borrarAhorcado(jid)
      await sock.sendMessage(jid, {
        text:
          `🎉 *¡Ganaste!*\n\n` +
          `La palabra era *${nuevo.palabra}* y la adivinaste en *${nuevo.maxFallos - nuevo.fallos}* turnos.\n\n` +
          `🪢 *Ahorcado*\n\n${tablero(nuevo)}`,
        quoted: msg,
      })
      return
    }

    if (nuevo.terminado) {
      borrarAhorcado(jid)
      await sock.sendMessage(jid, {
        text:
          `💀 *Perdiste.*\n\n` +
          `La palabra era *${nuevo.palabra}*.\n\n` +
          `🪢 *Ahorcado*\n\n${tablero(nuevo)}`,
        quoted: msg,
      })
      return
    }

    await sock.sendMessage(jid, {
      text: `🪢 *Ahorcado*\n\n${tablero(nuevo)}`,
      quoted: msg,
    })
    return
  }

  // /ahorcado → muestra la partida en curso o empieza una nueva
  if (estado && !estado.terminado) {
    await sock.sendMessage(jid, {
      text:
        `🪢 *Ahorcado*\n\n${tablero(estado)}\n\n` +
        `_Prueba una letra con /ahorcado <letra>_`,
      quoted: msg,
    })
    return
  }

  const nuevo = crearAhorcado()
  guardarAhorcado(jid, nuevo)

  await sock.sendMessage(jid, {
    text:
      `🪢 *Ahorcado*\n\n${tablero(nuevo)}\n\n` +
      `_Prueba una letra con /ahorcado <letra>_`,
    quoted: msg,
  })
}
