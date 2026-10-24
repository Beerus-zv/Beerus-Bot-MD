import {
  crearPartida,
  finPartida,
  jugar,
  dibujar,
  partidaDe,
} from '../lib/tateti.js'
import { resolverObjetivo, esGrupo } from '../lib/grupo.js'

const AYUDA =
  '🎮 *Ta-Te-Ti*\n\n' +
  '*Para empezar:* responde a la persona con `/tateti` o menciona: `/tateti @usuario`\n' +
  '*Para jugar:* `/tateti 5` (posiciones 1 a 9, la 5 es la central)\n' +
  '*Cancelar:* `/tateti terminar`\n\n' +
  '_El ❌ empieza y van alternando. Tres en línea para ganar._'

/**
 * Juego de Ta-Te-Ti por grupos (basado en el plugin 'tictactoe' de MEGA-MD).
 */
export default async ({ sock, jid, msg, args, sender }) => {
  if (!esGrupo(jid)) {
    await sock.sendMessage(jid, {
      text: "🎮 El Ta-Te-Ti solo se juega en *grupos*. Crea uno y reta a un mortal.",
      quoted: msg,
    })
    return
  }

  const arg = (args?.[0] || '').toLowerCase()

  // ── Cancelar ──
  if (arg === 'terminar' || arg === 'cancelar' || arg === 'off') {
    const partida = partidaDe(jid)
    finPartida(jid)
    if (partida) {
      await sock.sendMessage(jid, { text: '🎮 Partida cancelada. Que la destruccion los acompañe.', quoted: msg })
    } else {
      await sock.sendMessage(jid, { text: 'ℹ️ No hay ninguna partida en curso en este grupo.', quoted: msg })
    }
    return
  }

  const partida = partidaDe(jid)

  // ── Movimiento ──
  if (/^[1-9]$/.test(arg)) {
    if (!partida) {
      await sock.sendMessage(jid, { text: 'ℹ️ No hay partida. Empieza una respondiendo al rival con `/tateti`.', quoted: msg })
      return
    }

    const resultado = jugar(jid, sender, arg)
    if (resultado === 'no-jugador') {
      await sock.sendMessage(jid, { text: '🤔 Solo los dos jugadores de la partida pueden mover.', quoted: msg })
      return
    }
    if (resultado === 'no-turno') {
      await sock.sendMessage(jid, { text: `⏳ No es tu turno, no se impaciente.` })
      return
    }
    if (resultado === 'casilla') {
      await sock.sendMessage(jid, { text: '❓ Esa casilla no existe o ya esta ocupada. Usa números del 1 al 9.', quoted: msg })
      return
    }

    const { estado, fila } = resultado
    const tablero = dibujar(resultado.partida, fila)

    if (estado === 'gano-x') {
      await sock.sendMessage(jid, { text: `🏆 *GANA ${nombreCorto(resultado.partida.jugadorX)}* (❌)\n\n${tablero}`, mentions: [resultado.partida.jugadorX] })
      return
    }
    if (estado === 'gano-o') {
      await sock.sendMessage(jid, { text: `🏆 *GANA ${nombreCorto(resultado.partida.jugadorO)}* (⭕)\n\n${tablero}`, mentions: [resultado.partida.jugadorO] })
      return
    }
    if (estado === 'empate') {
      await sock.sendMessage(jid, { text: `🤝 *EMPATE*. Ni la destruccion pudo decidirlo.\n\n${tablero}` })
      return
    }

    const siguiente = resultado.partida.turno === 'x' ? resultado.partida.jugadorX : resultado.partida.jugadorO
    const simbolo = resultado.partida.turno
    await sock.sendMessage(jid, {
      text: `${tablero}\n\n🎯 Turno de *${nombreCorto(siguiente)}* (${simbolo === 'x' ? '❌' : '⭕'})`,
      mentions: [siguiente],
    })
    return
  }

  // ── Nueva partida: /tateti @usuario  (o respondiendo al rival) ──
  if (partida) {
    const tablero = dibujar(partida)
    const turno = partida.turno === 'x' ? partida.jugadorX : partida.jugadorO
    await sock.sendMessage(jid, {
      text: `⚠️ Ya hay una partida en curso entre *${nombreCorto(partida.jugadorX)}* y *${nombreCorto(partida.jugadorO)}*.\n\n${tablero}\n\n🎯 Turno de ${nombreCorto(turno)}. Continuen o usen */tateti terminar*.`,
      mentions: [partida.jugadorX, partida.jugadorO],
      quoted: msg,
    })
    return
  }

  const metadata = await sock.groupMetadata(jid)
  const objetivo = resolverObjetivo(metadata, msg, args)

  if (!objetivo) {
    await sock.sendMessage(jid, { text: AYUDA, quoted: msg })
    return
  }

  const rival = objetivo.jid
  if (String(rival).split('@')[0] === String(sender).split('@')[0]) {
    await sock.sendMessage(jid, {
      text: '😂 No puedes jugar contra ti mismo... a menos que tengas un universo espejo.',
      quoted: msg,
    })
    return
  }

  crearPartida(jid, sender, rival)

  await sock.sendMessage(jid, {
    text:
      `🎮 *¡Ta-Te-Ti iniciado!*\n\n` +
      `${nombreCorto(sender)} (❌) *VS* ${nombreCorto(rival)} (⭕)\n\n` +
      `${dibujar(partidaDe(jid))}\n\n` +
      `🎯 Turno de *${nombreCorto(sender)}* (❌): \n\`/tateti <1 a 9>\``,
    mentions: [rival],
    quoted: msg,
  })
}

function nombreCorto(jid) {
  return `@${String(jid || '').split('@')[0]}`
}
