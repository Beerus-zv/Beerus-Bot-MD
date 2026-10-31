import {
  crearPartida,
  finPartida,
  jugar,
  dibujar,
  partidaDe,
} from '../lib/tateti.js'
import { resolverObjetivo, esGrupo, mencionDeParticipantes, jidUsuario, digitosJid } from '../lib/grupo.js'

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
      const ganador = await etiqueta(sock, jid, resultado.partida.jugadorX)
      await sock.sendMessage(jid, {
        text: `🏆 *GANA ${ganador.token}* (❌)\n\n${tablero}`,
        mentions: [ganador.jid],
      })
      return
    }
    if (estado === 'gano-o') {
      const ganador = await etiqueta(sock, jid, resultado.partida.jugadorO)
      await sock.sendMessage(jid, {
        text: `🏆 *GANA ${ganador.token}* (⭕)\n\n${tablero}`,
        mentions: [ganador.jid],
      })
      return
    }
    if (estado === 'empate') {
      await sock.sendMessage(jid, { text: `🤝 *EMPATE*. Ni la destruccion pudo decidirlo.\n\n${tablero}` })
      return
    }

    const siguiente = resultado.partida.turno === 'x' ? resultado.partida.jugadorX : resultado.partida.jugadorO
    const simbolo = resultado.partida.turno
    const turno = await etiqueta(sock, jid, siguiente)
    await sock.sendMessage(jid, {
      text: `${tablero}\n\n🎯 Turno de *${turno.token}* (${simbolo === 'x' ? '❌' : '⭕'})`,
      mentions: [turno.jid],
    })
    return
  }

  // ── Nueva partida: /tateti @usuario  (o respondiendo al rival) ──
  if (partida) {
    const tablero = dibujar(partida)
    const datos = await sock.groupMetadata(jid)
    const ex = await etiqueta(sock, jid, partida.jugadorX, datos)
    const eo = await etiqueta(sock, jid, partida.jugadorO, datos)
    const turno = partida.turno === 'x' ? ex : eo
    await sock.sendMessage(jid, {
      text: `⚠️ Ya hay una partida en curso entre *${ex.token}* y *${eo.token}*.\n\n${tablero}\n\n🎯 Turno de ${turno.token}. Continuen o usen */tateti terminar*.`,
      mentions: [ex.jid, eo.jid],
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

  const retador = await etiqueta(sock, jid, sender, metadata)
  const retado = await etiqueta(sock, jid, rival, metadata)

  await sock.sendMessage(jid, {
    text:
      `🎮 *¡Ta-Te-Ti iniciado!*\n\n` +
      `${retador.token} (❌) *VS* ${retado.token} (⭕)\n\n` +
      `${dibujar(partidaDe(jid))}\n\n` +
      `🎯 Turno de *${retador.token}* (❌): \n\`/tateti <1 a 9>\``,
    mentions: [retador.jid, retado.jid],
    quoted: msg,
  })
}

/**
 * Etiqueta de mención para un jugador del grupo.
 *
 * En grupos con LID el JID crudo no resuelve a nombre: WhatsApp muestra los
 * dígitos tal cual. `mencionDeParticipantes` prefiere el teléfono real del
 * participante, que es la etiqueta que todos los clientes resuelven.
 *
 * @returns {Promise<{ token: string, jid: string }>}
 */
async function etiqueta(sock, grupo, jugador, metadata = null) {
  const datos = metadata || (await sock.groupMetadata(grupo))
  const mencion = mencionDeParticipantes(datos?.participants || [], jugador)
  return {
    token: mencion?.token || `@${digitosJid(jugador)}`,
    jid: mencion?.jid || jidUsuario(jugador),
  }
}
