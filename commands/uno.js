import { obtenerMetadata, esGrupo, nombreParticipante, resolverObjetivo } from '../lib/grupo.js'
import {
  obtenerEconomia,
  restarMonedas,
  sumarMonedas,
  obtenerUsuario,
  crearPartidaUno,
  partidaUnoActiva,
  actualizarPartidaUno,
  agregarJugadorUno,
  jugadoresUno,
  actualizarManoUno,
  marcarPasoUno,
  quitarJugadorUno,
  terminarPartidaUno,
  partidasUnoFinalizadas,
  puntosUno,
  topUno,
} from '../database/db.js'
import {
  COLORES,
  CLAVES,
  crearMazo,
  repartir,
  esValida,
  buscarCartaEnMano,
  etiquetaCarta,
  puntosCarta,
  normalizarColor,
} from '../lib/uno.js'
import { nombreLegible, formatearNumero } from '../lib/economia.js'

const AYUDA = `🃏 *UNO*

*Uso:*
• \`/uno create <apuesta>\` - Crear partida
• \`/uno join\` - Unirse a la partida
• \`/uno start\` - Empezar la partida
• \`/uno play <color> <valor>\` - Jugar una carta (\`+4\`, \`skip\`, \`reverse\`)
• \`/uno draw\` - Robar una carta
• \`/uno hand\` - Ver tu mano
• \`/uno leave\` - Salir de la partida
• \`/uno stats\` - Tus estadísticas
• \`/uno history\` - Últimas partidas
• \`/uno top\` - Clasificación global`

/** Lee la mano de un jugador */
function leerMano(fila) {
  try { return JSON.parse(fila.mano || '[]') } catch { return [] }
}

/** Lista de jugadores con su mano, en orden de turno */
function cargarJugadores(partidaId) {
  return jugadoresUno(partidaId).map((j) => ({ jid: j.jid, mano: leerMano(j), puntos: j.puntos, pasado: j.pasado }))
}

/** Siguiente jugador según la dirección, saltando a los que pasaron */
function siguienteTurno(jugadores, actual, direccion) {
  if (!jugadores.length) return null
  const indice = jugadores.findIndex((j) => j.jid === actual)
  if (indice === -1) return jugadores[0].jid
  for (let i = 1; i <= jugadores.length; i++) {
    const cand = jugadores[(indice + i * direccion + jugadores.length * 2) % jugadores.length]
    if (!cand.pasado) return cand.jid
  }
  return jugadores[(indice + direccion + jugadores.length * 2) % jugadores.length].jid
}

export default async ({ sock, jid, msg, args, sender, esGrupo: esG }) => {
  const sub = String(args[0] || 'help').toLowerCase()
  const resto = args.slice(1)
  const quien = sender || jid

  if (!esG) {
    await sock.sendMessage(jid, { text: '⚠️ UNO solo funciona en grupos.', quoted: msg })
    return
  }

  // ───────────── Crear partida ─────────────
  if (sub === 'create' || sub === 'crear' || sub === 'new') {
    const partida = partidaUnoActiva(jid)
    if (partida) {
      await sock.sendMessage(jid, { text: '⚠️ Ya hay una partida en este grupo.', quoted: msg })
      return
    }

    const apuesta = Math.max(0, Math.trunc(Number(resto[0]) || 0))
    const eco = obtenerEconomia(quien)
    if (apuesta > eco.monedas) {
      await sock.sendMessage(jid, { text: `💸 No tienes oro suficientes para una apuesta de *${apuesta}*.`, quoted: msg })
      return
    }

    const id = crearPartidaUno({ grupo: jid, creador: quien, apuesta })
    await sock.sendMessage(jid, {
      text:
        `🃏 *Partida de UNO creada* (id \`${id}\`)\n` +
        `💰 Apuesta: *${apuesta}* oro por jugador\n\n` +
        `_Únete con \`/uno join\` y empieza con \`/uno start\`._`,
      quoted: msg,
    })
    return
  }


  // ───────────── Unirse ─────────────
  if (sub === 'join' || sub === 'unirse' || sub === 'entrar') {
    if (!partida) {
      await sock.sendMessage(jid, { text: '❌ No hay ninguna partida. Crea una con `/uno create`.', quoted: msg })
      return
    }

    if (partida.estado !== 'esperando') {
      await sock.sendMessage(jid, { text: '❌ La partida ya empezó.', quoted: msg })
      return
    }

    const jugadores = jugadoresUno(partida.id)
    if (jugadores.length >= 6) {
      await sock.sendMessage(jid, { text: '❌ La partida está llena (6 jugadores).', quoted: msg })
      return
    }

    if (jugadores.some((j) => j.jid === quien)) {
      await sock.sendMessage(jid, { text: '⚠️ Ya estás en la partida.', quoted: msg })
      return
    }

    const apuesta = partida.apuesta || 0
    if (apuesta > 0) {
      const eco = obtenerEconomia(quien)
      if (eco.monedas < apuesta) {
        await sock.sendMessage(jid, { text: `💸 Necesitas *${apuesta}* oro para entrar.`, quoted: msg })
        return
      }
      restarMonedas(quien, apuesta, 'casino', 'Apuesta UNO')
    }

    agregarJugadorUno(partida.id, quien, [])

    await sock.sendMessage(jid, {
      text: `🙋 *${nombreLegible(quien, obtenerUsuario)}* se unió a la partida.`,
      quoted: msg,
    })
    return
  }

  // ───────────── Empezar ─────────────
  if (sub === 'start' || sub === 'empezar' || sub === 'begin') {
    if (!partida) {
      await sock.sendMessage(jid, { text: '❌ No hay ninguna partida.', quoted: msg })
      return
    }

    if (partida.estado === 'jugando') {
      await sock.sendMessage(jid, { text: '⚠️ La partida ya está en marcha.', quoted: msg })
      return
    }

    const jugadores = jugadoresUno(partida.id)
    if (jugadores.length < 2) {
      await sock.sendMessage(jid, { text: '❌ Necesitas al menos 2 jugadores.', quoted: msg })
      return
    }

    const { manos, mazo } = repartir(crearMazo(), jugadores.map((j) => j.jid))
    for (const [jugador, mano] of manos) {
      actualizarManoUno(partida.id, jugador, mano)
      marcarPasoUno(partida.id, jugador, false)
    }

    // Carta inicial: se busca una de color normal
    let inicial = mazo.pop()
    while (inicial && (inicial.tipo !== 'numero' || inicial.valor === '0')) inicial = mazo.pop()
    if (!inicial) inicial = { color: CLAVES[0], valor: '0', tipo: 'numero' }

    actualizarPartidaUno(partida.id, {
      estado: 'jugando',
      mazo: JSON.stringify(mazo),
      color: inicial.color,
      ultima: JSON.stringify(inicial),
      turno: jugadores[0].jid,
      direccion: 1,
    })

    const lista = jugadores
      .map((j) => `• ${nombreLegible(j.jid, obtenerUsuario)} (${manos.get(j.jid).length} cartas)`)
      .join('\n')

    await sock.sendMessage(jid, {
      text:
        `🃏 *¡Empieza la partida!*\n\n` +
        `${lista}\n\n` +
        `Carta inicial: ${etiquetaCarta(inicial)}\n` +
        `Turno de: *${nombreLegible(jugadores[0].jid, obtenerUsuario)}*`,
      quoted: msg,
    })
    return
  }

  // ───────────── Ver mano ─────────────
  if (sub === 'hand' || sub === 'mano' || sub === 'cards') {
    if (!partida || partida.estado !== 'jugando') {
      await sock.sendMessage(jid, { text: '❌ No hay ninguna partida en curso.', quoted: msg })
      return
    }

    const jugador = jugadoresUno(partida.id).find((j) => j.jid === quien)
    if (!jugador) {
      await sock.sendMessage(jid, { text: '❌ No estás en esta partida.', quoted: msg })
      return
    }

    const mano = leerMano(jugador)
    const ultima = partida.ultima ? JSON.parse(partida.ultima) : null

    await sock.sendMessage(jid, {
      text:
        `🃏 *Tu mano* (${mano.length} cartas)\n\n` +
        `${mano.map(etiquetaCarta).join('  ')}\n\n` +
        `Carta actual: ${etiquetaCarta(ultima)} (${COLORES[partida.color]?.nombre || '?'})`,
      quoted: msg,
    })
    return
  }


  // ───────────── Jugar carta ─────────────
  if (sub === 'play' || sub === 'jugar' || sub === 'card' || sub === 'carta') {
    if (!partida || partida.estado !== 'jugando') {
      await sock.sendMessage(jid, { text: '❌ No hay ninguna partida en curso.', quoted: msg })
      return
    }

    if (partida.turno !== quien) {
      await sock.sendMessage(jid, {
        text: `⏳ No es tu turno. Juega *${nombreLegible(partida.turno, obtenerUsuario)}*.`,
        quoted: msg,
      })
      return
    }

    const jugador = jugadoresUno(partida.id).find((j) => j.jid === quien)
    if (!jugador) {
      await sock.sendMessage(jid, { text: '❌ No estás en esta partida.', quoted: msg })
      return
    }

    const mano = leerMano(jugador)
    const ultima = partida.ultima ? JSON.parse(partida.ultima) : null

    // /uno +4 verde  |  /uno rojo 5  |  /uno skip
    const primero = String(resto[0] || '').toLowerCase()
    let carta = null
    let colorElegido = null

    if (primero === '+4' || primero === 'comodin' || primero === 'wild') {
      const tipo = primero === '+4' ? '+4' : 'comodin'
      carta = buscarCartaEnMano(mano, { tipo })
      if (carta) colorElegido = normalizarColor(resto[1])
    } else if (primero) {
      const color = normalizarColor(primero)
      const valor = resto[1]
      if (color && valor) carta = buscarCartaEnMano(mano, { color, valor })
      else if (!color && valor) carta = buscarCartaEnMano(mano, { valor })
    }

    if (!carta) {
      await sock.sendMessage(jid, {
        text:
          '❓ *Uso:* `/uno play <color> <valor>`\n' +
          '_Ejemplos:_ `/uno rojo 5` · `/uno azul skip` · `/uno +4 verde`\n\n' +
          `Tu mano: ${mano.map(etiquetaCarta).join('  ')}`,
        quoted: msg,
      })
      return
    }

    if (!esValida(carta, ultima, partida.color)) {
      await sock.sendMessage(jid, {
        text: `❌ Esa carta no vale sobre ${etiquetaCarta(ultima)}.`,
        quoted: msg,
      })
      return
    }

    if ((carta.tipo === '+4' || carta.tipo === 'comodin') && !colorElegido) {
      await sock.sendMessage(jid, {
        text: '🎨 Elige color: `/uno play ' + carta.tipo + ' rojo|azul|verde|amarillo`',
        quoted: msg,
      })
      return
    }

    // Aplicar la carta
    const nuevaMano = mano.filter((c) => c !== carta)
    actualizarManoUno(partida.id, quien, nuevaMano)

    let color = partida.color
    let direccion = partida.direccion
    let mazo = JSON.parse(partida.mazo || '[]')
    let saltar = false
    let robar = 0

    if (carta.tipo === '+4' || carta.tipo === 'comodin') {
      color = colorElegido
    } else {
      color = carta.color
      if (carta.tipo === 'skip') saltar = true
      if (carta.tipo === 'reverse') direccion *= -1
      if (carta.tipo === '+2') robar = 2
    }

    const jugadores = cargarJugadores(partida.id).map((j) =>
      j.jid === quien ? { ...j, mano: nuevaMano } : j
    )

    if (carta.tipo === '+4') {
      const siguiente = siguienteTurno(jugadores, quien, direccion)
      const objetivo = jugadores.find((j) => j.jid === siguiente)
      if (objetivo) {
        for (let i = 0; i < 4; i++) {
          const nueva = mazo.pop()
          if (nueva) objetivo.mano.push(nueva)
        }
        actualizarManoUno(partida.id, siguiente, objetivo.mano)
        marcarPasoUno(partida.id, siguiente, true)
      }
    }

    actualizarPartidaUno(partida.id, {
      color,
      ultima: JSON.stringify(carta),
      mazo: JSON.stringify(mazo),
      direccion,
    })


    // Victoria
    if (!nuevaMano.length) {
      let puntos = 0
      for (const j of jugadores) {
        if (j.jid === quien) continue
        const suma = j.mano.reduce((acc, c) => acc + puntosCarta(c), 0)
        puntos += suma
        sumarMonedas(j.jid, suma, 'casino', 'Puntos UNO')
      }
      sumarMonedas(quien, puntos, 'casino', 'Victoria UNO')

      const apuesta = partida.apuesta || 0
      if (apuesta > 0) {
        for (const j of jugadores) {
          if (j.jid === quien) continue
          restarMonedas(j.jid, apuesta, 'casino', 'Apuesta UNO')
        }
        sumarMonedas(quien, apuesta * (jugadores.length - 1), 'casino', 'Premio UNO')
      }

      terminarPartidaUno(partida.id, 'terminada')
      await sock.sendMessage(jid, {
        text:
          `🏆 *¡${nombreLegible(quien, obtenerUsuario)} gana la partida de UNO!*\n` +
          `💰 Puntos: *${puntos}*` +
          (apuesta ? `\n💵 Premio: *${formatearNumero(apuesta * (jugadores.length - 1))}* oro` : ''),
        quoted: msg,
      })
      return
    }

    // Turno siguiente
    let turno
    if (saltar) {
      const intermedio = siguienteTurno(jugadores, quien, direccion)
      turno = siguienteTurno(jugadores, intermedio, direccion)
    } else {
      turno = siguienteTurno(jugadores, quien, direccion)
    }

    if (robar > 0) {
      const objetivo = jugadores.find((j) => j.jid === turno)
      if (objetivo) {
        for (let i = 0; i < robar; i++) {
          const nueva = mazo.pop()
          if (nueva) objetivo.mano.push(nueva)
        }
        actualizarManoUno(partida.id, turno, objetivo.mano)
        actualizarPartidaUno(partida.id, { mazo: JSON.stringify(mazo) })
      }
    }

    actualizarPartidaUno(partida.id, { turno })

    const partes = [`🃏 *${nombreLegible(quien, obtenerUsuario)}* juega ${etiquetaCarta(carta)}`]
    if (carta.tipo === '+4' || carta.tipo === 'comodin') {
      partes.push('🎨 Color: *' + COLORES[color].nombre + '*')
    }
    if (carta.tipo === 'reverse') partes.push('🔄 Se invierte el sentido')
    if (saltar) partes.push('⛔ El siguiente pierde el turno')
    if (robar) partes.push(`+2 roba ${robar} cartas`)
    partes.push(`➡️ Turno de *${nombreLegible(turno, obtenerUsuario)}*`)

    await sock.sendMessage(jid, { text: partes.join('\n'), quoted: msg })
    return
  }

  // ───────────── Robar ─────────────
  if (sub === 'draw' || sub === 'robar' || sub === 'pick') {
    if (!partida || partida.estado !== 'jugando') {
      await sock.sendMessage(jid, { text: '❌ No hay ninguna partida en curso.', quoted: msg })
      return
    }

    if (partida.turno !== quien) {
      await sock.sendMessage(jid, { text: '⏳ No es tu turno.', quoted: msg })
      return
    }

    const jugador = jugadoresUno(partida.id).find((j) => j.jid === quien)
    if (!jugador) {
      await sock.sendMessage(jid, { text: '❌ No estás en esta partida.', quoted: msg })
      return
    }

    const mazo = JSON.parse(partida.mazo || '[]')
    const carta = mazo.pop()
    if (!carta) {
      await sock.sendMessage(jid, { text: '❌ No quedan cartas en el mazo.', quoted: msg })
      return
    }

    const mano = leerMano(jugador)
    mano.push(carta)
    actualizarManoUno(partida.id, quien, mano)
    actualizarPartidaUno(partida.id, { mazo: JSON.stringify(mazo) })

    const jugadores = cargarJugadores(partida.id).map((j) => (j.jid === quien ? { ...j, mano } : j))
    const turno = siguienteTurno(jugadores, quien, partida.direccion)
    actualizarPartidaUno(partida.id, { turno })

    await sock.sendMessage(jid, {
      text:
        `🃏 Robaste ${etiquetaCarta(carta)}\n` +
        `Tu mano: ${mano.map(etiquetaCarta).join('  ')}\n` +
        `➡️ Turno de *${nombreLegible(turno, obtenerUsuario)}*`,
      quoted: msg,
    })
    return
  }

  // ───────────── Salir ─────────────
  if (sub === 'leave' || sub === 'salir' || sub === 'exit') {
    if (!partida) {
      await sock.sendMessage(jid, { text: '❌ No hay ninguna partida.', quoted: msg })
      return
    }

    const jugador = jugadoresUno(partida.id).find((j) => j.jid === quien)
    if (!jugador) {
      await sock.sendMessage(jid, { text: '❌ No estás en esta partida.', quoted: msg })
      return
    }

    quitarJugadorUno(partida.id, quien)

    // Si ya no queda nadie, la partida se cancela
    if (!jugadoresUno(partida.id).length) {
      terminarPartidaUno(partida.id, 'cancelada')
    }

    await sock.sendMessage(jid, {
      text: '👋 *' + nombreLegible(quien, obtenerUsuario) + '* salió de la partida de UNO.',
      quoted: msg,
    })
    return
  }

  // ───────────── Estadisticas ─────────────
  if (sub === 'stats' || sub === 'estadisticas' || sub === 'stat') {
    const puntos = puntosUno(quien)
    constECO = obtenerEconomia(quien)

    await sock.sendMessage(jid, {
      text:
        `🃏 *Estadísticas de UNO*` +
        `\n👤 ${nombreLegible(quien, obtenerUsuario)}` +
        `\n🏅 Puntos acumulados: *${formatearNumero(puntos)}*` +
        `\n💰 Oro: *${formatearNumero(ECO.monedas)}*` +
        `\n🪙 Apuesta actual: *${formatearNumero(partida?.apuesta || 0)}*`,
      quoted: msg,
    })
    return
  }

  // ───────────── Historial ─────────────
  if (sub === 'history' || sub === 'historial') {
    const recientes = partidasUnoFinalizadas(10)
    if (!recientes.length) {
      await sock.sendMessage(jid, { text: '📭 Todavía no hay partidas finalizadas.', quoted: msg })
      return
    }

    const lista = recientes
      .map((p, i) => `*${i + 1}.* Grupo ${p.grupo} · ${p.estado} · apuesta ${formatearNumero(p.apuesta)}`)
      .join('\n')

    await sock.sendMessage(jid, {
      text: `🗂️ *Últimas partidas de UNO*\n\n${lista}`,
      quoted: msg,
    })
    return
  }
  // ───────────── Clasificacion ─────────────
  if (sub === 'top' || sub === 'leaderboard' || sub === 'ranking') {
    const top = topUno(10)
    if (!top.length) {
      await sock.sendMessage(jid, { text: '📊 Todavía no hay ranking.', quoted: msg })
      return
    }

    const lista = top
      .map((u, i) => `*${i + 1}.* ${nombreLegible(u.jid, obtenerUsuario)} — ${formatearNumero(u.puntos)} pts`)
      .join('\n')

    await sock.sendMessage(jid, {
      text: `🏆 *Top UNO*\n\n${lista}`,
      quoted: msg,
    })
    return
  }

  // ───────────── Ayuda ─────────────
  await sock.sendMessage(jid, { text: AYUDA, quoted: msg })
}
