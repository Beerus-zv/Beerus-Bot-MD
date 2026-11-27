/**
 * `/poker` — póker de cinco cartas con un solo descarte, contra la banca y
 * entre los jugadores de la mesa.
 *
 * Todo pasa en el grupo, en el mismo chat donde se abre la mesa:
 *   /poker                 → reglas y como jugar
 *   /poker start [apuesta] → abre la mesa y paga tu apuesta
 *   /poker join            → te sientas (paga la apuesta)
 *   /poker go              → reparte las manos y empieza
 *   /poker mesa            → estado de la mesa
 *   /poker mano            → tu mano, como tarjeta de ver una vez
 *   /poker hold 1 3 5      → conservas esas cartas
 *   /poker draw            → cambias el resto y te plantas
 *   /poker stand           → te quedas con las cinco
 *   /poker fold            → abandonas la mano (pierdes la apuesta)
 *   /poker cancel          → el creador cierra la mesa y devuelve el oro
 *
 * Las manos no salen del grupo: cada jugador recibe la suya como mensaje de
 * ver una vez, con su mención. El grupo ve el progreso y, al final, la mesa
 * destapada.
 */
import {
  obtenerPoker,
  guardarPoker,
  borrarPoker,
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
import { participantesGrupo } from '../lib/privado.js'
import { enviarManoEnGrupo } from '../lib/mano-grupo.js'
import { nombreLegible } from '../lib/economia.js'

/** Apuesta maxima por mano: evita desbordes y apuestas absurdas */
const APUESTA_MAXIMA = 1_000_000
/** Jugadores por mesa */
const MAX_JUGADORES = 6
/** Chats de grupo que ya vieron las reglas: no se abre mesa sin pasar por ellas */
const reglasVistas = new Set()

/** Subcomandos que son jugadas de la mano, no de la mesa */
const JUGADAS = new Set([
  'mano', 'hand', 'cartas',
  'fold', 'retirar', 'retirarse',
  'hold', 'guardar', 'conservar', 'keep',
  'draw', 'cambio', 'cambiar', 'robar',
  'stand', 'plantarse', 'quedarse', 'show',
])

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
5. \`/poker mano\` te muestra tu mano (mensaje de ver una vez)
6. \`/poker hold 1 3 5\`, \`/poker draw\` o \`/poker stand\`
7. \`/poker fold\` si te retiras

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

/** Lineas de la tarjeta: cartas numeradas y la jugada que forman */
function lineasManoPoker(estado, jugador) {
  const evaluada = evaluarMano(jugador.mano)
  const lista = jugador.mano.map(
    (c, i) => `${i + 1}. ${nombreCarta(c)}${jugador.conservar.includes(i) ? '  (guardada)' : ''}`
  )
  lista.push('')
  lista.push(`Jugada: ${evaluada.nombre}`)
  lista.push(`Apuesta: ${estado.apuesta} oro · Banca: 5 boca abajo`)
  return lista
}

/** Pie de la tarjeta con las jugadas disponibles */
function pieJugadas(prefijo) {
  return (
    `Conservar: ${prefijo}poker hold 1 3 5\n` +
    `Cambiar el resto: ${prefijo}poker draw\n` +
    `Plantarse: ${prefijo}poker stand`
  )
}

/**
 * Manda la mano al grupo como tarjeta de ver una vez, solo para ese jugador.
 * El chat privado ya no participa: la mesa vive en el grupo.
 */
async function enviarManoAlGrupo({ sock, chat, jugador, estado, prefijo, nota = '' }) {
  return await enviarManoEnGrupo({
    sock,
    grupo: chat,
    jugador: jugador.jid,
    titulo: 'PÓKER · tu mano',
    subtitulo: jugador.listo ? 'Mano cerrada' : `Apuesta ${estado.apuesta} oro`,
    lineas: lineasManoPoker(estado, jugador),
    pie: jugador.listo ? 'Esperando a los demás jugadores' : pieJugadas(prefijo),
    nota,
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

/** Publica el progreso de la mesa en el grupo. No hay copias al privado. */
async function anunciarProgreso({ sock, chat, texto, menciones = [] }) {
  await sock.sendMessage(chat, { text: texto, mentions: menciones })
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

  await enviarManoAlGrupo({
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

  // Póker se juega en el grupo: la mesa, las manos y las jugadas viven ahí.
  if (!grupal) {
    await sock.sendMessage(jid, {
      text:
        '🎲 *El póker se juega en el grupo.*\n' +
        `Abrí la mesa donde están los jugadores: \`${prefijo}poker start <apuesta>\`.\n` +
        '_Tu mano llega al grupo como mensaje de ver una vez, solo para vos._',
    })
    return
  }

  const mesa = mesaDeChat(jid)

  // Jugadas de la mano: corren en el grupo, junto a la mesa
  if (JUGADAS.has(sub)) {
    const encontrada = mesa ? { chat: jid, estado: mesa } : null

    if (!encontrada) {
      await sock.sendMessage(jid, {
        text:
          '❌ No hay mesa en este grupo.\n' +
          `_Abrí una con \`${prefijo}poker start <apuesta>\` o sentate con \`${prefijo}poker join\`._`,
        quoted: msg,
      })
      return
    }

    const { chat, estado } = encontrada
    const jugador = estado.jugadores.find((j) => j.jid === quien)

    if (!jugador) {
      await sock.sendMessage(jid, {
        text: `❌ No estás sentado en esta mesa. Entrá con \`${prefijo}poker join\`.`,
        quoted: msg,
      })
      return
    }

    if (!enJuego(estado)) {
      await sock.sendMessage(jid, {
        text: `⏳ La mesa todavía no reparte. Esperá el \`${prefijo}poker go\` en el grupo.`,
        quoted: msg,
      })
      return
    }

    if (jugador.abandonado) {
      await sock.sendMessage(jid, { text: '🚪 Ya te retiraste de esta mesa.', quoted: msg })
      return
    }

    // Ver la mano
    if (sub === 'mano' || sub === 'hand' || sub === 'cartas') {
      await enviarManoAlGrupo({ sock, chat, jugador, estado, prefijo })
      return
    }

    // Retirarse
    if (sub === 'fold' || sub === 'retirar' || sub === 'retirarse') {
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

      await anunciarProgreso({
        sock,
        chat,
        estado,
        texto:
          `🔒 *${nombreLegible(quien, obtenerUsuario)}* conserva *${conservar.length}* carta` +
          `${conservar.length === 1 ? '' : 's'}.`,
        excluir: quien,
      })

      await enviarManoAlGrupo({
        sock,
        chat,
        jugador,
        estado,
        prefijo,
        nota: `🔒 Conservás *${conservar.length}* carta${conservar.length === 1 ? '' : 's'}.`,
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
        `❓ No entendí esa jugada.\n\n${pieJugadas(prefijo)}\n` +
        `Retirarte: \`${prefijo}poker fold\``,
      quoted: msg,
    })
    return
  }

  // Grupo: la mesa
  const estado = mesa

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
      const ok = await enviarManoAlGrupo({ sock, chat: jid, jugador, estado, prefijo })
      if (ok) entregados++
      menciones.push(nombreLegible(jugador.jid, obtenerUsuario))
    }

    await sock.sendMessage(jid, {
      text:
        `🃏 *¡Reparto!* — *${estado.jugadores.length}* jugador${estado.jugadores.length === 1 ? '' : 'es'}\n` +
        `│ Banca: *5* cartas boca abajo\n` +
        `│ Apuesta: *${estado.apuesta}* oro\n\n` +
        `🃏 Manos repartidas a: ${menciones.join(', ')}\n` +
        (entregados < estado.jugadores.length
          ? `⚠️ A *${estado.jugadores.length - entregados}* no le salió la tarjeta: que pidan \`${prefijo}poker mano\`.\n`
          : '') +
        `\n✎ Acá mismo: \`${prefijo}poker hold 1 3 5\` · \`${prefijo}poker draw\` · \`${prefijo}poker stand\``,
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

  // Cualquier otra cosa no es jugada ni orden de mesa: se muestran las reglas
  await mostrarReglas(`▶️ Abrí mesa con \`${prefijo}poker start <apuesta>\``)
}
