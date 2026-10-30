/**
 * `/poker` — póker de cinco cartas con un solo descarte, contra la banca y
 * entre los jugadores de la mesa.
 *
 * En el grupo (la mesa):
 *   /poker                 → reglas y como jugar
 *   /poker start [apuesta] → abre la mesa y paga tu apuesta
 *   /poker join            → te sientas (paga la apuesta)
 *   /poker go              → reparte las manos y empieza
 *   /poker mesa            → estado de la mesa
 *   /poker cancel          → el creador cierra la mesa y devuelve el oro
 *
 * En el privado del bot (tus jugadas, solo tú las ves):
 *   /poker                 → tu mano
 *   /poker hold 1 3 5      → conservas esas cartas
 *   /poker draw            → cambias el resto y te plantas
 *   /poker stand           → te quedas con las cinco
 *   /poker fold            → abandonas la mano (pierdes la apuesta)
 *
 * El grupo solo ve el progreso: quién se sienta, quién conserva, quién
 * cambia, quién se planta, y el resultado final.
 */
import {
  obtenerPoker,
  guardarPoker,
  borrarPoker,
  todasLasPoker,
  obtenerUsuario,
  sumarMonedas,
  oroDisponible,
  pagarConBanco,
} from '../database/db.js'
import {
  crearBaraja,
  robar,
  descartarYRobar,
  indicesQueGuardaBanca,
  evaluarMano,
  compararManos,
  textoMano,
  nombreCarta,
} from '../lib/poker.js'
import { barajar } from '../lib/juegos.js'
import { esGrupo, digitosJid, mencionDeParticipantes } from '../lib/grupo.js'
import { enviarPrivado, participantesGrupo } from '../lib/privado.js'
import { nombreLegible } from '../lib/economia.js'

/** Apuesta maxima por mano: evita desbordes y apuestas absurdas */
const APUESTA_MAXIMA = 1_000_000
/** Jugadores por mesa */
const MAX_JUGADORES = 6
/** Chats de grupo que ya vieron las reglas: no se abre mesa sin pasar por ellas */
const reglasVistas = new Set()

const REGLAS = `🃏 *PÓKER — REGLAS*

*Objetivo*
Tener la mejor mano de cinco cartas de la mesa. La banca juega también.

*La mesa*
• Baraja inglesa de 52 cartas.
• Cada jugador recibe 5 cartas; la banca recibe otras 5 boca abajo.
• Tienes *un solo descarte*: puedes cambiar de 0 a 5 cartas.
• La banca también descarta: conserva parejas o mejores; si no tiene nada,
  se queda con sus dos cartas más altas.

*Manos, de menor a mayor*
1. Carta alta
2. Pareja
3. Doble pareja
4. Trío
5. Escalera
6. Color
7. Full
8. Póker
9. Escalera de color

Los empates se rompen por el valor de las cartas: el As es la más alta y la
rueda (A-2-3-4-5) es la escalera más baja.

*Apuestas*
• Cada jugador paga la apuesta al sentarse; la banca pone otra igual.
• Gana un jugador → se lleva todo el bote.
• Gana la banca → el bote se queda en la casa.
• Empate entre jugadores → el bote se reparte a partes iguales.

*Cómo jugar*
1. En el grupo: \`/poker\` para leer esto
2. En el grupo: \`/poker start 50\` abre la mesa
3. En el grupo: \`/poker join\` para sentarte
4. En el grupo: \`/poker go\` reparte
5. En mi privado: \`/poker\` para ver tu mano
6. En mi privado: \`/poker hold 1 3 5\`, \`/poker draw\` o \`/poker stand\`
7. En mi privado: \`/poker fold\` si te retiras

_Cuando todos terminan, la mesa se destapa en el grupo._`

/** ¿La mesa acepta jugadas? */
function enJuego(estado) {
  return estado && estado.fase === 'jugando'
}

/** Jugadores que siguen en la mano */
function activos(estado) {
  return estado.jugadores.filter((j) => !j.abandonado && j.mano.length === 5)
}

/** Jugadores que todavía no han cerrado su mano */
function pendientes(estado) {
  return estado.jugadores.filter((j) => !j.listo && !j.abandonado)
}

/** Progreso legible para el grupo */
function progreso(estado) {
  const enMesa = estado.jugadores.filter((j) => !j.abandonado)
  const listos = enMesa.filter((j) => j.listo).length
  return `✅ *${listos}/${enMesa.length}* manos cerradas.`
}

/**
 * Coacciona una mesa guardada a la forma actual. Devuelve null si la fila es
 * de un formato anterior: esos estados no se pueden jugar y bloqueaban `/poker`.
 */
function normalizarMesa(crudo) {
  if (!crudo || typeof crudo !== 'object') return null
  if (!Array.isArray(crudo.jugadores) || !Number.isFinite(crudo.apuesta)) return null

  const jugadores = crudo.jugadores
    .filter((j) => j && typeof j.jid === 'string')
    .map((j) => ({
      jid: j.jid,
      mano: Array.isArray(j.mano) ? j.mano : [],
      conservar: Array.isArray(j.conservar) ? j.conservar : [],
      listo: Boolean(j.listo),
      abandonado: Boolean(j.abandonado),
    }))

  return {
    fase: crudo.fase === 'jugando' ? 'jugando' : 'esperando',
    apuesta: crudo.apuesta,
    creador: crudo.creador,
    jugadores,
    banca: Array.isArray(crudo.banca) ? crudo.banca : [],
    mazo: Array.isArray(crudo.mazo) ? crudo.mazo : [],
  }
}

/** Mesa del chat. Una fila obsoleta se descarta para no bloquear mesas nuevas. */
function mesaDeChat(chat) {
  const crudo = obtenerPoker(chat)
  if (!crudo) return null

  const estado = normalizarMesa(crudo)
  if (!estado) {
    borrarPoker(chat)
    return null
  }
  return estado
}

/** Mesa del jugador, buscando en todas las mesas abiertas */
function mesaDelJugador(quien) {
  for (const fila of todasLasPoker()) {
    let crudo
    try {
      crudo = JSON.parse(fila.estado)
    } catch {
      continue
    }

    const estado = normalizarMesa(crudo)
    if (!estado) continue
    if (estado.jugadores.some((j) => j.jid === quien)) {
      return { chat: fila.chat, estado }
    }
  }
  return null
}

/** Texto de la mano para el privado: cartas numeradas y la jugada */
function tableroDM(estado, jugador) {
  const evaluada = evaluarMano(jugador.mano)
  const lista = jugador.mano
    .map((c, i) => `${i + 1}. ${nombreCarta(c)}${jugador.conservar.includes(i) ? ' 🔒' : ''}`)
    .join('\n')
  return (
    `${lista}\n\n` +
    `› ${evaluada.nombre}\n` +
    `💰 Apuesta: *${estado.apuesta}* oro\n` +
    `🂠 Banca: *5* cartas boca abajo`
  )
}

/** Pie con las jugadas disponibles */
function pieDM(prefijo) {
  return (
    `✎ \`${prefijo}poker hold 1 3 5\` para conservar\n` +
    `✎ \`${prefijo}poker draw\` para cambiar el resto\n` +
    `✎ \`${prefijo}poker stand\` para plantarte`
  )
}

/** Envía (o reenvía) la mano al privado del jugador */
async function enviarManoDM({ sock, chat, jugador, estado, prefijo, nota = '' }) {
  const cola = jugador.listo
    ? '⏳ Esperando a los demás jugadores…'
    : `${pieDM(prefijo)}\n\n_Juega aquí, en privado: el grupo solo verá el progreso._`

  return await enviarPrivado({
    sock,
    grupo: chat,
    jugador: jugador.jid,
    texto:
      `🃏 *PÓKER — tu mano*\n\n${tableroDM(estado, jugador)}\n\n` +
      (nota ? `${nota}\n\n` : '') +
      cola,
  })
}

/** Etiqueta con mención real dentro del grupo; el número queda de respaldo */
async function mencionEnGrupo(sock, chat, jugador) {
  const participantes = await participantesGrupo(sock, chat)
  const mencion = mencionDeParticipantes(participantes, jugador)
  return {
    token: mencion?.token || `@${digitosJid(jugador)}`,
    jid: mencion?.jid || jugador,
  }
}

/** Cambia los tokens de mención por el nombre visible: en privado no hay menciones */
function textoParaDM(texto, menciones = []) {
  let salida = String(texto || '')
  for (const jid of menciones) {
    const digitos = digitosJid(jid)
    if (!digitos) continue
    salida = salida.split(`@${digitos}`).join(nombreLegible(jid, obtenerUsuario))
  }
  return salida
}

/**
 * Publica el progreso en el grupo y manda la misma copia al privado de cada
 * jugador de la mesa. El que originó el aviso puede excluirse: ya recibió su
 * propio mensaje en privado.
 */
async function anunciarProgreso({ sock, chat, estado, texto, menciones = [], excluir = null }) {
  await sock.sendMessage(chat, { text: texto, mentions: menciones })

  const paraDM = textoParaDM(texto, menciones)
  for (const j of estado.jugadores) {
    if (j.abandonado || j.jid === excluir) continue
    await enviarPrivado({
      sock,
      grupo: chat,
      jugador: j.jid,
      texto: `🃏 *PÓKER — progreso de la mesa*\n\n${paraDM}`,
    })
  }
}

/**
 * Destapa la mesa: banca que descarta, comparación de todas las manos, pago
 * del bote y resultado en el grupo + privado de cada jugador.
 */
async function destaparMesa({ sock, chat, estado, prefijo }) {
  const conservaBanca = indicesQueGuardaBanca(estado.banca)
  const { mano: bancaFinal } = descartarYRobar(estado.banca, estado.mazo, conservaBanca)
  const bancaEvaluada = evaluarMano(bancaFinal)

  const enMano = activos(estado)
  const filas = enMano.map((j) => ({
    jid: j.jid,
    nombre: nombreLegible(j.jid, obtenerUsuario),
    mano: j.mano,
    evaluada: evaluarMano(j.mano),
  }))

  let mejor = bancaEvaluada
  for (const f of filas) {
    if (compararManos(f.evaluada, mejor) > 0) mejor = f.evaluada
  }

  const ganadores = filas.filter((f) => compararManos(f.evaluada, mejor) === 0)
  const bancaGana = ganadores.length === 0

  const apuesta = estado.apuesta || 0
  const bote = apuesta * (filas.length + 1)
  const pagoPorGanador = ganadores.length ? Math.floor(bote / ganadores.length) : 0

  if (!bancaGana && pagoPorGanador > 0) {
    for (const g of ganadores) sumarMonedas(g.jid, pagoPorGanador, 'casino', 'Bote póker')
  }

  borrarPoker(chat)

  const lineas = [
    `*Banca* › \`${textoMano(bancaFinal)}\` · ${bancaEvaluada.nombre}`,
  ]
  for (const f of filas) {
    lineas.push(`*${f.nombre}* › \`${textoMano(f.mano)}\` · ${f.evaluada.nombre}`)
  }

  const titulo = bancaGana
    ? '🏦 *Gana la banca*'
    : `🏆 *Gana ${ganadores.map((g) => g.nombre).join(', ')}*`

  const pago = bancaGana
    ? apuesta > 0
      ? `💸 El bote de *${bote}* oro se queda en la casa.`
      : ''
    : apuesta > 0
      ? `💰 Bote de *${bote}* oro` +
        (ganadores.length > 1 ? ` repartido: *${pagoPorGanador}* oro cada uno.` : ' para el ganador.')
      : ''

  await sock.sendMessage(chat, {
    text:
      `🏁 *Mesa cerrada*\n\n${titulo}\n\n` +
      `${lineas.join('\n')}` +
      (pago ? `\n\n${pago}` : '') +
      `\n\n_Nueva mesa: \`${prefijo}poker start <apuesta>\`_`,
  })

  // Cada jugador recibe su detalle por privado
  for (const f of filas) {
    const gano = ganadores.some((g) => g.jid === f.jid)
    const resultado = bancaGana
      ? '💀 La banca se lleva el bote.'
      : gano
        ? `🏆 Ganaste${pagoPorGanador ? ` *${pagoPorGanador}* oro` : ''}.`
        : '💸 No llegó tu mano.'

    await enviarPrivado({
      sock,
      grupo: chat,
      jugador: f.jid,
      texto:
        `🃏 *PÓKER — resultado*\n\n` +
        `*Tú* › \`${textoMano(f.mano)}\`\n` +
        `│ ${f.evaluada.nombre}\n\n` +
        `*Banca* › \`${textoMano(bancaFinal)}\`\n` +
        `│ ${bancaEvaluada.nombre}\n\n` +
        `${resultado}\n\n_Nueva mesa en el grupo._`,
    })
  }

  // Quien se retiró también se entera
  for (const j of estado.jugadores.filter((j) => j.abandonado)) {
    await enviarPrivado({
      sock,
      grupo: chat,
      jugador: j.jid,
      texto: '🃏 *PÓKER* — te retiraste de esta mesa. La próxima es tuya.',
    })
  }
}

/** Cierra la mano de un jugador y, si ya no queda nadie, destapa la mesa */
async function cerrarMano({ sock, chat, jugador, estado, prefijo, cambiadas = 0 }) {
  jugador.listo = true
  jugador.conservar = []
  guardarPoker(chat, estado)

  await anunciarProgreso({
    sock,
    chat,
    estado,
    texto:
      `✔️ *${nombreLegible(jugador.jid, obtenerUsuario)}* cerró su mano` +
      (cambiadas > 0 ? ` · cambió *${cambiadas}* carta${cambiadas === 1 ? '' : 's'}` : ' · se plantó') +
      `.\n${progreso(estado)}`,
    excluir: jugador.jid,
  })

  await enviarManoDM({
    sock,
    chat,
    jugador,
    estado,
    prefijo,
    nota: cambiadas > 0
      ? `✔️ Mano cerrada: cambiaste *${cambiadas}* carta${cambiadas === 1 ? '' : 's'}.`
      : '✔️ Mano cerrada: te plantaste.',
  })

  if (!pendientes(estado).length) {
    await destaparMesa({ sock, chat, estado, prefijo })
  }
}

export default async ({ sock, jid, msg, args, sender, PREFIX }) => {
  const prefijo = PREFIX?.[0] ?? '/'
  const sub = String(args[0] || '').toLowerCase()
  const resto = args.slice(1)
  const quien = sender || jid
  const grupal = esGrupo(jid)

  // Privado del bot: las jugadas de cada jugador
  if (!grupal) {
    const encontrada = mesaDelJugador(quien)

    if (!encontrada) {
      await sock.sendMessage(jid, {
        text:
          '❌ No estás en ninguna mesa.\n' +
          '_Abre o únete a una mesa en el grupo con `/poker start` o `/poker join`._',
      })
      return
    }

    const { chat, estado } = encontrada
    const jugador = estado.jugadores.find((j) => j.jid === quien)

    if (!enJuego(estado)) {
      await sock.sendMessage(jid, {
        text: '⏳ La mesa todavía no reparte. Espera el `/poker go` en el grupo.',
      })
      return
    }

    if (jugador.abandonado) {
      await sock.sendMessage(jid, { text: '🚪 Ya te retiraste de esta mesa.' })
      return
    }

    // Ver la mano
    if (!sub || sub === 'mano' || sub === 'hand' || sub === 'cartas' || sub === 'help' || sub === 'ayuda') {
      await sock.sendMessage(jid, {
        text:
          `🃏 *PÓKER — tu mano*\n\n${tableroDM(estado, jugador)}\n\n` +
          (jugador.listo
            ? '⏳ Mano cerrada: esperando a los demás jugadores.'
            : `${pieDM(prefijo)}\n✎ \`${prefijo}poker fold\` para retirarte`),
      })
      return
    }

    // Retirarse
    if (sub === 'fold' || sub === 'cancel' || sub === 'cancelar' || sub === 'retirar') {
      if (jugador.listo) {
        await sock.sendMessage(jid, { text: '✔️ Ya cerraste tu mano.' })
        return
      }

      jugador.abandonado = true
      jugador.listo = true
      jugador.mano = []
      jugador.conservar = []
      guardarPoker(chat, estado)

      await sock.sendMessage(jid, {
        text: `🚪 Te retiraste${estado.apuesta > 0 ? ` y pierdes *${estado.apuesta}* oro` : ''}.`,
      })

      await anunciarProgreso({
        sock,
        chat,
        estado,
        texto:
          `🚪 *${nombreLegible(quien, obtenerUsuario)}* se retira de la mesa.\n` +
          `${progreso(estado)}`,
        excluir: quien,
      })

      if (!pendientes(estado).length) {
        await destaparMesa({ sock, chat, estado, prefijo })
      }
      return
    }

    // Conservar cartas
    if (sub === 'hold' || sub === 'guardar' || sub === 'conservar' || sub === 'keep') {
      if (jugador.listo) {
        await sock.sendMessage(jid, { text: '✔️ Ya cerraste tu mano.' })
        return
      }

      const conservar = []
      for (const arg of resto) {
        const n = Math.trunc(Number(arg))
        if (!Number.isFinite(n) || n < 1 || n > 5) {
          await sock.sendMessage(jid, {
            text: `❓ *Uso:* \`${prefijo}poker hold 1 3 5\` _(cartas del 1 al 5)_`,
          })
          return
        }
        if (!conservar.includes(n - 1)) conservar.push(n - 1)
      }

      if (!conservar.length) {
        await sock.sendMessage(jid, { text: `❓ Marca al menos una carta: \`${prefijo}poker hold 1 3 5\`` })
        return
      }

      conservar.sort((a, b) => a - b)
      jugador.conservar = conservar
      guardarPoker(chat, estado)

      await sock.sendMessage(jid, {
        text:
          `🔒 Conservas *${conservar.length}* carta${conservar.length === 1 ? '' : 's'}.\n\n` +
          `${tableroDM(estado, jugador)}\n\n` +
          `✎ \`${prefijo}poker draw\` para cambiar el resto\n` +
          `✎ \`${prefijo}poker stand\` para plantarte`,
      })

      await anunciarProgreso({
        sock,
        chat,
        estado,
        texto:
          `🔒 *${nombreLegible(quien, obtenerUsuario)}* conserva *${conservar.length}* carta` +
          `${conservar.length === 1 ? '' : 's'}.`,
        excluir: quien,
      })
      return
    }

    // Cambiar cartas
    if (sub === 'draw' || sub === 'cambio' || sub === 'cambiar' || sub === 'robar') {
      if (jugador.listo) {
        await sock.sendMessage(jid, { text: '✔️ Ya cerraste tu mano.' })
        return
      }

      const cambiadas = jugador.mano.length - jugador.conservar.length
      const { mano, mazo } = descartarYRobar(jugador.mano, estado.mazo, jugador.conservar)
      jugador.mano = mano
      estado.mazo = mazo

      await sock.sendMessage(jid, {
        text: `🔄 Cambiaste *${cambiadas}* carta${cambiadas === 1 ? '' : 's'}.`,
      })

      await cerrarMano({ sock, chat, jugador, estado, prefijo, cambiadas })
      return
    }

    // Plantarse
    if (sub === 'stand' || sub === 'plantarse' || sub === 'quedarse' || sub === 'show') {
      if (jugador.listo) {
        await sock.sendMessage(jid, { text: '✔️ Ya cerraste tu mano.' })
        return
      }

      await cerrarMano({ sock, chat, jugador, estado, prefijo, cambiadas: 0 })
      return
    }

    await sock.sendMessage(jid, {
      text:
        `❓ No entendí esa jugada.\n\n${pieDM(prefijo)}\n` +
        `✎ \`${prefijo}poker fold\` para retirarte`,
    })
    return
  }

  // Grupo: la mesa
  const estado = mesaDeChat(jid)

  const mostrarReglas = async (extra = '') => {
    reglasVistas.add(jid)
    await sock.sendMessage(jid, {
      text: REGLAS + (extra ? `\n\n${extra}` : ''),
      quoted: msg,
    })
  }

  // Reglas / estado
  if (!sub || sub === 'help' || sub === 'ayuda' || sub === 'reglas' || sub === 'rules') {
    await mostrarReglas(
      estado
        ? `🃏 Mesa ${estado.fase === 'esperando' ? 'abierta' : 'en juego'} · apuesta *${estado.apuesta}* oro · *${estado.jugadores.length}/${MAX_JUGADORES}* jugadores.`
        : `▶️ Abre mesa con \`${prefijo}poker start <apuesta>\``
    )
    return
  }

  // Estado de la mesa
  if (sub === 'mesa' || sub === 'ver' || sub === 'status') {
    if (!estado) {
      await sock.sendMessage(jid, { text: '❌ No hay mesa abierta.', quoted: msg })
      return
    }

    const lista = estado.jugadores
      .map((j) => {
        const nombre = nombreLegible(j.jid, obtenerUsuario)
        if (estado.fase === 'esperando') return `• ${nombre}`
        if (j.abandonado) return `• ${nombre} — 🚪 retirado`
        if (j.listo) return `• ${nombre} — ✔️ cerrada`
        if (j.conservar.length) return `• ${nombre} — 🔒 ${j.conservar.length} conservadas`
        return `• ${nombre} — 🃏 jugando`
      })
      .join('\n')

    await sock.sendMessage(jid, {
      text:
        `🃏 *Mesa de póker*\n\n` +
        `💰 Apuesta: *${estado.apuesta}* oro\n` +
        `👥 Jugadores: *${estado.jugadores.length}/${MAX_JUGADORES}*\n\n` +
        `${lista}\n\n` +
        (estado.fase === 'esperando'
          ? `▶️ \`${prefijo}poker join\` para sentarte · \`${prefijo}poker go\` para repartir`
          : progreso(estado)),
      quoted: msg,
    })
    return
  }

  // Abrir mesa
  if (sub === 'start' || sub === 'crear' || sub === 'new') {
    if (!reglasVistas.has(jid)) {
      await mostrarReglas(`▶️ Ahora sí: \`${prefijo}poker start <apuesta>\``)
      return
    }

    if (estado) {
      await sock.sendMessage(jid, {
        text: `⚠️ Ya hay una mesa abierta. Únete con \`${prefijo}poker join\`.`,
        quoted: msg,
      })
      return
    }

    const apuesta = Math.max(0, Math.trunc(Number(resto[0])))
    if (!Number.isFinite(apuesta) || apuesta > APUESTA_MAXIMA) {
      await sock.sendMessage(jid, {
        text: `❓ *Uso:* \`${prefijo}poker start <apuesta>\` _(máximo ${APUESTA_MAXIMA} oro)_`,
        quoted: msg,
      })
      return
    }

    let delBanco = 0
    if (apuesta > 0) {
      const pago = pagarConBanco(quien, apuesta, 'casino', 'Apuesta póker')
      if (!pago.ok) {
        const saldo = oroDisponible(quien)
        await sock.sendMessage(jid, {
          text:
            `💸 No tienes oro suficiente: apuesta *${apuesta}*.\n` +
            `│ Cartera: *${saldo.enMano}* · Banco: *${saldo.enBanco}*`,
          quoted: msg,
        })
        return
      }
      delBanco = pago.delBanco
    }

    const nueva = {
      fase: 'esperando',
      apuesta,
      creador: quien,
      jugadores: [{ jid: quien, mano: [], conservar: [], listo: false, abandonado: false }],
      banca: [],
      mazo: [],
    }
    guardarPoker(jid, nueva)

    await sock.sendMessage(jid, {
      text:
        `🃏 *Mesa de póker abierta*\n\n` +
        `💰 Apuesta: *${apuesta}* oro por jugador\n` +
        `👤 Creador: *${nombreLegible(quien, obtenerUsuario)}*\n` +
        (delBanco > 0 ? `🏦 Del banco: *${delBanco}* oro\n` : '') +
        `\n_Únete con \`${prefijo}poker join\` y reparte con \`${prefijo}poker go\`._`,
      quoted: msg,
    })
    return
  }

  // Sentarse
  if (sub === 'join' || sub === 'unirse' || sub === 'entrar') {
    if (!estado) {
      await sock.sendMessage(jid, { text: `❌ No hay mesa. Abre una con \`${prefijo}poker start <apuesta>\`.`, quoted: msg })
      return
    }

    if (estado.fase !== 'esperando') {
      await sock.sendMessage(jid, { text: '❌ La mesa ya repartió.', quoted: msg })
      return
    }

    if (estado.jugadores.some((j) => j.jid === quien)) {
      await sock.sendMessage(jid, { text: '⚠️ Ya estás sentado.', quoted: msg })
      return
    }

    if (estado.jugadores.length >= MAX_JUGADORES) {
      await sock.sendMessage(jid, { text: `❌ La mesa está llena (${MAX_JUGADORES}).`, quoted: msg })
      return
    }

    let delBanco = 0
    if (estado.apuesta > 0) {
      const pago = pagarConBanco(quien, estado.apuesta, 'casino', 'Apuesta póker')
      if (!pago.ok) {
        const saldo = oroDisponible(quien)
        await sock.sendMessage(jid, {
          text:
            `💸 Necesitas *${estado.apuesta}* oro para sentarte.\n` +
            `│ Cartera: *${saldo.enMano}* · Banco: *${saldo.enBanco}*`,
          quoted: msg,
        })
        return
      }
      delBanco = pago.delBanco
    }

    estado.jugadores.push({ jid: quien, mano: [], conservar: [], listo: false, abandonado: false })
    guardarPoker(jid, estado)

    const mencion = await mencionEnGrupo(sock, jid, quien)
    await anunciarProgreso({
      sock,
      chat: jid,
      estado,
      texto:
        `🙋 ${mencion.token} se sentó · *${estado.jugadores.length}/${MAX_JUGADORES}*.` +
        (delBanco > 0 ? `\n🏦 Del banco: *${delBanco}* oro.` : '') +
        `\n_Reparte con \`${prefijo}poker go\`._`,
      menciones: [mencion.jid],
      excluir: quien,
    })
    return
  }

  // Repartir
  if (sub === 'go' || sub === 'empezar' || sub === 'repartir' || sub === 'deal' || sub === 'jugar') {
    if (!estado) {
      await sock.sendMessage(jid, { text: `❌ No hay mesa. Abre una con \`${prefijo}poker start <apuesta>\`.`, quoted: msg })
      return
    }

    if (estado.fase !== 'esperando') {
      await sock.sendMessage(jid, { text: '⚠️ La mesa ya está en juego.', quoted: msg })
      return
    }

    if (!estado.jugadores.length) {
      await sock.sendMessage(jid, { text: '❌ No hay jugadores en la mesa.', quoted: msg })
      return
    }

    const mazo = barajar(crearBaraja())

    for (const jugador of estado.jugadores) {
      jugador.mano = robar(mazo, 5)
      jugador.conservar = []
      jugador.listo = false
      jugador.abandonado = false
    }

    estado.fase = 'jugando'
    estado.banca = robar(mazo, 5)
    estado.mazo = mazo
    guardarPoker(jid, estado)

    const menciones = []
    let entregados = 0
    for (const jugador of estado.jugadores) {
      const ok = await enviarManoDM({ sock, chat: jid, jugador, estado, prefijo })
      if (ok) entregados++
      menciones.push(nombreLegible(jugador.jid, obtenerUsuario))
    }

    await sock.sendMessage(jid, {
      text:
        `🃏 *¡Reparto!* — *${estado.jugadores.length}* jugador${estado.jugadores.length === 1 ? '' : 'es'}\n` +
        `│ Banca: *5* cartas boca abajo\n` +
        `│ Apuesta: *${estado.apuesta}* oro\n\n` +
        `📩 Manos enviadas por privado a: ${menciones.join(', ')}\n` +
        (entregados < estado.jugadores.length
          ? `⚠️ A *${estado.jugadores.length - entregados}* no pude escribirle: que abran el chat del bot y manden \`${prefijo}poker\`.\n`
          : '') +
        `\n✎ Juega en mi privado: \`${prefijo}poker hold 1 3 5\` · \`${prefijo}poker draw\` · \`${prefijo}poker stand\``,
      quoted: msg,
    })
    return
  }

  // Cancelar mesa (solo el creador, solo antes del reparto)
  if (sub === 'cancel' || sub === 'cancelar' || sub === 'cerrar') {
    if (!estado) {
      await sock.sendMessage(jid, { text: '❌ No hay mesa abierta.', quoted: msg })
      return
    }

    if (estado.creador !== quien) {
      await sock.sendMessage(jid, { text: '❌ Solo el creador puede cerrar la mesa.', quoted: msg })
      return
    }

    if (estado.fase !== 'esperando') {
      await sock.sendMessage(jid, {
        text: `❌ La mesa está en juego. Retírate desde mi privado con \`${prefijo}poker fold\`.`,
        quoted: msg,
      })
      return
    }

    const devueltos = []
    for (const j of estado.jugadores) {
      if (estado.apuesta > 0) sumarMonedas(j.jid, estado.apuesta, 'casino', 'Mesa póker cancelada')
      devueltos.push(nombreLegible(j.jid, obtenerUsuario))
    }

    borrarPoker(jid)
    await sock.sendMessage(jid, {
      text:
        `🚫 *Mesa cerrada* por ${nombreLegible(quien, obtenerUsuario)}.\n` +
        (estado.apuesta > 0 ? `💰 Devuelto *${estado.apuesta}* oro a: ${devueltos.join(', ')}.` : '_Sin apuestas de por medio._'),
      quoted: msg,
    })
    return
  }

  // Jugadas en el grupo: se mandan al privado
  if (['hold', 'guardar', 'conservar', 'keep', 'draw', 'cambio', 'cambiar', 'robar', 'stand', 'plantarse', 'quedarse', 'show', 'fold', 'mano', 'hand'].includes(sub)) {
    await sock.sendMessage(jid, {
      text:
        '🔒 *Tus jugadas van por privado.*\n' +
        `Escríbeme \`${prefijo}poker\` en mi chat privado para ver tu mano.\n` +
        '_Tu mano nunca se publica en el grupo._',
      quoted: msg,
    })
    return
  }

  await mostrarReglas(`▶️ Abre mesa con \`${prefijo}poker start <apuesta>\``)
}
