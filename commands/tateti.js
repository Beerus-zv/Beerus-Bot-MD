import {
  crearPartida,
  finPartida,
  jugar,
  dibujar,
  partidaDe,
} from '../lib/tateti.js'
import {
  resolverObjetivo,
  esGrupo,
  mencionDeParticipantes,
  jidUsuario,
  digitosJid,
} from '../lib/grupo.js'

const AYUDA =
  '🎮 *Ta-Te-Ti*\n\n' +
  '*Para empezar:* responde a la persona con `/tateti` o menciona: `/tateti @usuario`\n' +
  '*Para jugar:* `/tateti 5` (posiciones 1 a 9, la 5 es la central)\n' +
  '*Cancelar:* `/tateti terminar`\n\n' +
  '_El ❌ empieza y van alternando. Tres en línea para ganar._'

/**
 * Arma el mensaje completo del juego.
 *
 * Todos los avisos de una partida en curso (inicio, turno, jugada inválida,
 * victoria, empate) pasan por acá: mismo encabezado, los dos jugadores en el
 * mismo orden, el tablero en el mismo lugar y una sola línea de estado al
 * final. Así el mensaje no cambia de forma entre jugada y jugada y el tablero
 * nunca salta de posición en el chat.
 *
 * @param {{ titulo: string, x: object, o: object, tablero: string, estado: string }} vista
 * @returns {string}
 */
function pintarVista({ titulo, x, o, tablero, estado }) {
  return [
    titulo,
    '',
    `❌ ${x.token}`,
    `⭕ ${o.token}`,
    '',
    tablero,
    '',
    estado,
  ].join('\n')
}

/**
 * Juego de Ta-Te-Ti por grupos (basado en el plugin 'tictactoe' de MEGA-MD).
 */
export default async ({ sock, jid, msg, args, sender }) => {
  if (!esGrupo(jid)) {
    await sock.sendMessage(jid, {
      text: '🎮 El Ta-Te-Ti solo se juega en *grupos*. Crea uno y reta a un mortal.',
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
      await sock.sendMessage(jid, {
        text: '🎮 Partida cancelada. Que la destrucción los acompañe.',
        quoted: msg,
      })
    } else {
      await sock.sendMessage(jid, {
        text: 'ℹ️ No hay ninguna partida en curso en este grupo.',
        quoted: msg,
      })
    }
    return
  }

  const partida = partidaDe(jid)

  // ── Movimiento ──
  if (/^[1-9]$/.test(arg)) {
    if (!partida) {
      await sock.sendMessage(jid, {
        text: 'ℹ️ No hay partida. Empieza una respondiendo al rival con `/tateti`.',
        quoted: msg,
      })
      return
    }

    const resultado = jugar(jid, sender, arg)

    // Los errores también muestran el tablero: el jugador ve dónde está parado
    // sin tener que subir a buscar el mensaje anterior.
    if (resultado === 'no-jugador' || resultado === 'no-turno' || resultado === 'casilla') {
      const avisos = {
        'no-jugador': '🤔 Solo los dos jugadores de la partida pueden mover.',
        'no-turno': '⏳ No es tu turno, no te impacientes.',
        casilla: '❓ Esa casilla no existe o ya está ocupada. Usa números del 1 al 9.',
      }
      const vista = await armarVista(sock, jid, partida, { estado: avisos[resultado] })
      await sock.sendMessage(jid, { ...vista, quoted: msg })
      return
    }

    const { estado, fila, partida: jugada } = resultado

    if (estado === 'gano-x') {
      await sock.sendMessage(jid, await armarVista(sock, jid, jugada, { ganador: 'x', fila }))
      return
    }
    if (estado === 'gano-o') {
      await sock.sendMessage(jid, await armarVista(sock, jid, jugada, { ganador: 'o', fila }))
      return
    }
    if (estado === 'empate') {
      await sock.sendMessage(
        jid,
        await armarVista(sock, jid, jugada, {
          estado: '🤝 *EMPATE.* Ni la destrucción pudo decidirlo.',
        }),
      )
      return
    }

    await sock.sendMessage(jid, await armarVista(sock, jid, jugada))
    return
  }

  // ── Nueva partida: /tateti @usuario  (o respondiendo al rival) ──
  if (partida) {
    await sock.sendMessage(jid, {
      ...(await armarVista(sock, jid, partida, {
        estado: '⚠️ Ya hay una partida en curso. Continúen o usen `/tateti terminar`.',
      })),
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

  const vista = await armarVista(sock, jid, partidaDe(jid), {
    estado: '🎯 Empieza ❌ con `/tateti <1 a 9>`',
    metadata,
  })
  await sock.sendMessage(jid, { ...vista, quoted: msg })
}

/**
 * Resuelve los dos jugadores y arma el mensaje con el tablero.
 *
 * Sin `estado` ni `ganador` la línea final es el turno que corresponde, así el
 * tablero siempre cierra con una acción y no con una pregunta.
 *
 * @param {object} sock cliente de Baileys
 * @param {string} grupo JID del grupo
 * @param {{ jugadorX: string, jugadorO: string, turno: string, casillas: Array }} partida
 * @param {{ estado?: string|null, ganador?: 'x'|'o'|null, fila?: number[], metadata?: object|null }} [opciones]
 * @returns {Promise<{ text: string, mentions: string[] }>}
 */
async function armarVista(sock, grupo, partida, opciones = {}) {
  const { estado = null, ganador = null, fila = [], metadata = null } = opciones
  const datos = metadata || (await sock.groupMetadata(grupo))
  const x = etiqueta(datos, partida.jugadorX)
  const o = etiqueta(datos, partida.jugadorO)

  let lineaEstado = estado
  if (!lineaEstado && ganador) {
    const vencedor = ganador === 'x' ? x : o
    lineaEstado = `🏆 *GANA ${vencedor.token}* (${ganador === 'x' ? '❌' : '⭕'})`
  }
  if (!lineaEstado) {
    const enTurno = partida.turno === 'x' ? x : o
    const simbolo = partida.turno === 'x' ? '❌' : '⭕'
    lineaEstado = `🎯 Turno de *${enTurno.token}* (${simbolo})`
  }

  return {
    text: pintarVista({
      titulo: '🎮 *Ta-Te-Ti*',
      x,
      o,
      tablero: dibujar(partida, fila),
      estado: lineaEstado,
    }),
    mentions: [x.jid, o.jid],
  }
}

/**
 * Etiqueta de mención para un jugador del grupo.
 *
 * En grupos con LID el JID crudo no resuelve a nombre: WhatsApp muestra los
 * dígitos tal cual. `mencionDeParticipantes` prefiere el teléfono real del
 * participante, que es la etiqueta que todos los clientes resuelven.
 *
 * @returns {{ token: string, jid: string }}
 */
function etiqueta(metadata, jugador) {
  const mencion = mencionDeParticipantes(metadata?.participants || [], jugador)
  return {
    token: mencion?.token || `@${digitosJid(jugador)}`,
    jid: mencion?.jid || jidUsuario(jugador),
  }
}
