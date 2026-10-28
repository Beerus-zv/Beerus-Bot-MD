import { esGrupo, obtenerMetadata, resolverObjetivo } from '../lib/grupo.js'
import {
  obtenerEconomia,
  sumarMonedas,
  restarMonedas,
  transferirMonedas,
  anadirExperiencia,
  topEconomia,
  totalMonedas,
  obtenerUsuario,
  ultimoRob,
  marcarRob,
  reclamarDiario,
  marcarTrabajo,
  marcarUso,
  XP_POR_NIVEL,
} from '../database/db.js'
import {
  segundosDesde,
  barraNivel,
  nombreLegible,
  formatearNumero,
  recargaActiva,
} from '../lib/economia.js'

const AYUDA = `💰 *Economía*

*Uso:*
• \`/economy bal\` - Ver tu saldo
• \`/economy daily\` - Recompensa diaria
• \`/economy work\` - Trabajar para ganar oro
• \`/economy rob @user\` - Intentar robar a alguien
• \`/economy pay @user <cantidad>\` - Enviar oro
• \`/economy gift @user <cantidad>\` - Regalar oro (regalo amistoso)
• \`/economy stats\` - Ver estadísticas personales
• \`/economy rank\` - Ver la tabla de posiciones
• \`/economy help\` - Esta ayuda

_También puedes usar: \`/bal\`, \`/daily\`, \`/work\`, \`/rob\`, \`/pay\`, \`/gift\`, \`/stats\`, \`/rank\`._

⏳ _Cada comando tiene su tiempo de recarga _
_frenar el spam: daily 24 h, work 5 m, _
_rob 30 m, pay 30 s, gift 1 h._`

export default async ({ sock, jid, msg, args, sender }) => {
  const sub = String(args[0] || 'bal').toLowerCase()
  const resto = args.slice(1)
  const quien = sender || jid

  // ───────────── Saldo ─────────────
  if (sub === 'bal' || sub === 'balance' || sub === 'monedas' || sub === 'saldo' || sub === '') {
    // Recarga liviana para que /bal no se use como spam
    const espera = recargaActiva(quien, 'bal')
    if (espera) {
      await sock.sendMessage(jid, { text: espera, quoted: msg })
      return
    }
    marcarUso(quien, 'bal')

    const eco = obtenerEconomia(quien)
    const nombre = nombreLegible(quien, obtenerUsuario)

    await sock.sendMessage(jid, {
      text:
        `✨ *🎴 Cuenta de ${nombre}* ✨\n` +
        `┌─────────────────────────────┐\n` +
        `│ 🪙 *Oro:* ${formatearNumero(eco.monedas)} │\n` +
        `│ ⭐ *Nivel:* ${eco.nivel} │\n` +
        `│ 📈 *Progreso:* ${barraNivel(eco.nivel, eco.experiencia, XP_POR_NIVEL)} │\n` +
        `│ 🔥 *Racha:* ${eco.racha} día(s) │\n` +
        `└─────────────────────────────┘`,
      quoted: msg,
    })
    return
  }

  // ───────────── Recompensa diaria ─────────────
  if (sub === 'daily' || sub === 'diario' || sub === 'cobrar') {
    const eco = obtenerEconomia(quien)

    // La recarga mira la tabla nueva y la columna vieja (ultimo_diario)
    const espera = recargaActiva(quien, 'daily', eco.ultimo_diario)
    if (espera) {
      await sock.sendMessage(jid, { text: espera, quoted: msg })
      return
    }

    // La racha se reinicia si pasaron más de 48h
    const pasado = segundosDesde(eco.ultimo_diario)
    const racha = eco.racha > 0 && pasado < 48 * 60 * 60 ? eco.racha + 1 : 1
    // Balance progresivo: la base crece con el nivel y la racha lo premia
    // (nivel 1 con racha 1: 60 oro; nivel 10 con racha 7: 255)
    const premio = 60 + Math.max(0, eco.nivel - 1) * 15 + (racha - 1) * 10

    sumarMonedas(quien, premio, 'daily', 'Recompensa diaria')
    anadirExperiencia(quien, 25)
    reclamarDiario(quien, racha)
    marcarUso(quien, 'daily')

    await sock.sendMessage(jid, {
      text:
        `🎁 *Recompensa diaria*\n\n` +
        `🪙 +*${premio}* oro\n` +
        `🔥 Racha: *${racha}* día(s) seguidos\n` +
        `💰 Total: *${formatearNumero(obtenerEconomia(quien).monedas)}* oro`,
      quoted: msg,
    })
    return
  }

  // ───────────── Trabajar ─────────────
  if (sub === 'work' || sub === 'trabajar' || sub === 'laburo') {
    const eco = obtenerEconomia(quien)

    // La recarga mira la tabla nueva y la columna vieja (ultimo_trabajo)
    const espera = recargaActiva(quien, 'work', eco.ultimo_trabajo)
    if (espera) {
      await sock.sendMessage(jid, { text: espera, quoted: msg })
      return
    }

    // Balance progresivo: colilla de trabajo modesta que crece con el nivel
    const premio = 25 + Math.max(0, eco.nivel - 1) * 8 + Math.floor(Math.random() * 26)
    sumarMonedas(quien, premio, 'work', 'Trabajo')
    anadirExperiencia(quien, 10)
    marcarTrabajo(quien)
    marcarUso(quien, 'work')

    const frases = [
      'Trabajaste en un puesto de tacos',
      'Ayudaste en una biblioteca',
      'Reparaste el WiFi del barrio',
      'Vendiste limonada en la esquina',
      'Fuiste repartidor de pizzas',
      'Cuidaste las mascotas de tus vecinos',
      'Fotografaste una boda',
      'Limpiaste un parque',
    ]

    await sock.sendMessage(jid, {
      text:
        `💼 *${frases[Math.floor(Math.random() * frases.length)]}*\n\n` +
        `🪙 Ganaste *${premio}* oro\n` +
        `💰 Saldo: *${formatearNumero(obtenerEconomia(quien).monedas)}*\n` +
        `⭐ +10 XP`,
      quoted: msg,
    })
    return
  }

  // ───────────── Robar ─────────────
  if (sub === 'rob' || sub === 'robar' || sub === 'robo') {
    if (!esGrupo(jid)) {
      await sock.sendMessage(jid, {
        text: '❌ El robo solo funciona en grupos.',
        quoted: msg,
      })
      return
    }

    const eco = obtenerEconomia(quien)

    // La recarga mira la tabla nueva y la columna vieja (ultimo_robo)
    const espera = recargaActiva(quien, 'rob', ultimoRob(quien))
    if (espera) {
      await sock.sendMessage(jid, { text: espera, quoted: msg })
      return
    }

    let metadata = null
    try {
      metadata = await obtenerMetadata(sock, jid)
    } catch {
      metadata = null
    }

    const objetivo = resolverObjetivo(metadata, msg, resto)
    if (!objetivo?.jid) {
      await sock.sendMessage(jid, {
        text: '❓ Menciona a quien quieres robar: `/rob @usuario`',
        quoted: msg,
      })
      return
    }

    if (objetivo.jid === quien) {
      await sock.sendMessage(jid, {
        text: '🤦 No puedes robarte a ti mismo.',
        quoted: msg,
      })
      return
    }

    const ecoObjetivo = obtenerEconomia(objetivo.jid)
    if (ecoObjetivo.monedas <= 0) {
      await sock.sendMessage(jid, {
        text: `🪙 ${nombreLegible(objetivo.jid, obtenerUsuario)} no tiene oro.`,
        quoted: msg,
      })
      return
    }

    marcarRob(quien)
    marcarUso(quien, 'rob')

    if (Math.random() < 0.5) {
      const maximo = Math.max(1, Math.floor(ecoObjetivo.monedas * (0.2 + Math.random() * 0.4)))
      const cantidad = Math.min(maximo, ecoObjetivo.monedas)
      const victima = nombreLegible(objetivo.jid, obtenerUsuario)

      restarMonedas(objetivo.jid, cantidad, 'robo', `Robo de ${nombreLegible(quien, obtenerUsuario)}`)
      sumarMonedas(quien, cantidad, 'robo', `Robo a ${victima}`)

      await sock.sendMessage(jid, {
        text:
          `🥷 *¡Robo exitoso!*\n\n` +
          `Le robaste *${cantidad}* oro a *${victima}*.\n` +
          `💰 Saldo: *${formatearNumero(obtenerEconomia(quien).monedas)}*`,
        quoted: msg,
      })
      return
    }

    const multa = Math.min(20, eco.monedas)
    if (multa > 0) restarMonedas(quien, multa, 'multa', 'Intento de robo fallido')

    await sock.sendMessage(jid, {
      text:
        `🚨 *¡Te atraparon!*\n\n` +
        `La policía te finedó *${multa}* oro.\n` +
        `💰 Saldo: *${formatearNumero(obtenerEconomia(quien).monedas)}*`,
      quoted: msg,
    })
    return
  }

  // ───────────── Enviar oro ─────────────
  if (sub === 'pay' || sub === 'enviar' || sub === 'pagar' || sub === 'transferir') {
    if (!esGrupo(jid)) {
      await sock.sendMessage(jid, {
        text: '❌ Los envíos solo funcionan en grupos.',
        quoted: msg,
      })
      return
    }

    // Recarga corta para frenar hambrunas de envíos
    const espera = recargaActiva(quien, 'pay')
    if (espera) {
      await sock.sendMessage(jid, { text: espera, quoted: msg })
      return
    }

    // El monto es el último número; el resto se usa para resolver el destinatario
    const objetivoArgs = [...resto]
    let monto = 0
    for (let i = objetivoArgs.length - 1; i >= 0; i--) {
      if (/^\d+$/.test(objetivoArgs[i])) {
        monto = Number(objetivoArgs[i])
        objetivoArgs.splice(i, 1)
        break
      }
    }

    if (!monto || monto <= 0) {
      await sock.sendMessage(jid, {
        text: '❓ *Uso:* `/economy pay @usuario <cantidad>`',
        quoted: msg,
      })
      return
    }

    let metadata = null
    try {
      metadata = await obtenerMetadata(sock, jid)
    } catch {
      metadata = null
    }

    const objetivo = resolverObjetivo(metadata, msg, objetivoArgs)
    if (!objetivo?.jid) {
      await sock.sendMessage(jid, {
        text: '❓ Menciona a quien quieres pagar: `/pay @usuario 100`',
        quoted: msg,
      })
      return
    }

    if (objetivo.jid === quien) {
      await sock.sendMessage(jid, {
        text: '🤦 ¿Vas a pagarte a ti mismo?',
        quoted: msg,
      })
      return
    }

    const resultado = transferirMonedas(quien, objetivo.jid, monto)
    if (!resultado.ok) {
      await sock.sendMessage(jid, {
        text:
          resultado.motivo === 'saldo'
            ? `💸 No tienes suficientes oro. Tienes *${obtenerEconomia(quien).monedas}*.`
            : '❌ Cantidad no válida.',
        quoted: msg,
      })
      return
    }

    // La recarga solo se gasta si la transferencia salió bien
    marcarUso(quien, 'pay')

    const receptor = nombreLegible(objetivo.jid, obtenerUsuario)

    await sock.sendMessage(jid, {
      text:
        `💸 *Transferencia*\n\n` +
        `Enviaste *${formatearNumero(monto)}* oro a *${receptor}*.\n` +
        `💰 Tu saldo: *${formatearNumero(obtenerEconomia(quien).monedas)}*`,
      quoted: msg,
    })
    return
  }

  // ───────────── Ranking ─────────────
  if (sub === 'rank' || sub === 'top' || sub === 'ranking' || sub === 'tabla') {
    // Recarga liviana para frenar el spam de la tabla
    const espera = recargaActiva(quien, 'rank')
    if (espera) {
      await sock.sendMessage(jid, { text: espera, quoted: msg })
      return
    }
    marcarUso(quien, 'rank')

    const botJid = sock.user?.id || sock.user?.jid || ''
    const JIDS_EXCLUIR_RANKING = new Set(['test@s.whatsapp.net', 'banco@s.whatsapp.net'])
    const top = topEconomia(100)
      .filter(u => {
        const j = u.jid || ''
        return j
          && !j.endsWith('@g.us')
          && j !== botJid
          && !JIDS_EXCLUIR_RANKING.has(j)
          && !j.split('@')[0].startsWith('banco-')
      })
      .slice(0, 10)

    if (!top.length) {
      await sock.sendMessage(jid, {
        text: '📭 Todavía no hay nadie en la tabla de posiciones.',
        quoted: msg,
      })
      return
    }

    const mentions = []
    const lineas = top.map((u, i) => {
      const medalla = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '▫️'
      const nombre = nombreLegible(u.jid, obtenerUsuario)
      mentions.push(u.jid)
      return `${medalla} ${i + 1}. @${u.jid.split('@')[0]} — ${formatearNumero(u.monedas)} 🪙 (Nv.${u.nivel})`
    })

    await sock.sendMessage(jid, {
      text: `🏆 *Tabla de posiciones*\n\n${lineas.join('\n')}\n\n_Oro en circulación: ${formatearNumero(totalMonedas())}_`,
      mentions,
      quoted: msg,
    })
    return
  }

  // ───────────── Stats ─────────────
  if (sub === 'stats' || sub === 'estadisticas' || sub === 'estadística') {
    const eco = obtenerEconomia(quien)
    const nombre = nombreLegible(quien, obtenerUsuario)

    const stats = [
      `📊 *Estadísticas de ${nombre}*`,
      `│ 🪙 Oro actual: *${formatearNumero(eco.monedas)}*`,
      `│ ⭐ Nivel: *${eco.nivel}*`,
      `│ 📈 Experiencia: *${eco.experiencia}* / ${XP_POR_NIVEL * eco.nivel}`,
      `│ 🔥 Racha diaria: *${eco.racha}*`,
      `│ 🏆 Total ganado: *${topEconomia(1)[0]?.monedas ? formatearNumero(eco.monedas - 0) : formatearNumero(eco.monedas)}*`,
    ]
    const top = topEconomia(1)
    const lineas = [
      `📊 *Estadísticas de ${nombre}*`,
      `🪙 *Oro:* ${formatearNumero(eco.monedas)}`,
      `⭐ *Nivel:* ${eco.nivel}`,
      `📈 *XP:* ${eco.experiencia} / ${XP_POR_NIVEL * eco.nivel}`,
      `🔥 *Racha:* ${eco.racha} día(s)`,
    ]

    await sock.sendMessage(jid, { text: lineas.join('\n'), quoted: msg })
    return
  }

  // ───────────── Regalar oro ─────────────
  if (sub === 'gift' || sub === 'regalar' || sub === 'regalo') {
    if (!esGrupo(jid)) {
      await sock.sendMessage(jid, { text: '❌ El regalo solo funciona en grupos.', quoted: msg })
      return
    }

    const espera = recargaActiva(quien, 'gift')
    if (espera) {
      await sock.sendMessage(jid, { text: espera, quoted: msg })
      return
    }

    const objetivoArgs = [...resto]
    let monto = 0
    for (let i = objetivoArgs.length - 1; i >= 0; i--) {
      if (/^\d+$/.test(objetivoArgs[i])) {
        monto = Number(objetivoArgs[i])
        objetivoArgs.splice(i, 1)
        break
      }
    }

    if (!monto || monto <= 0) {
      await sock.sendMessage(jid, { text: '❓ *Uso:* `/economy gift @usuario <cantidad>`', quoted: msg })
      return
    }

    let metadata = null
    try { metadata = await obtenerMetadata(sock, jid) } catch { metadata = null }
    const objetivo = resolverObjetivo(metadata, msg, objetivoArgs)
    if (!objetivo?.jid) {
      await sock.sendMessage(jid, { text: '❓ Menciona a quien quieres regalar: `/gift @usuario 50`', quoted: msg })
      return
    }

    if (objetivo.jid === quien) {
      await sock.sendMessage(jid, { text: '🤦 No puedes regalarte a ti mismo.', quoted: msg })
      return
    }

    const resultado = transferirMonedas(quien, objetivo.jid, monto, 'regalo')
    if (!resultado.ok) {
      await sock.sendMessage(jid, { text: `💸 No tienes suficientes oro. Tienes *${obtenerEconomia(quien).monedas}*.`, quoted: msg })
      return
    }

    marcarUso(quien, 'gift')

    await sock.sendMessage(jid, {
      text:
        `🎁 *Regalo enviado!*\n\n` +
        `Enviaste *${formatearNumero(monto)}* oro a *${nombreLegible(objetivo.jid, obtenerUsuario)}*.\n` +
        `💰 Tu saldo: *${formatearNumero(obtenerEconomia(quien).monedas)}*`,
      quoted: msg,
    })
    return
  }

  // ───────────── Ayuda ─────────────
  await sock.sendMessage(jid, { text: AYUDA, quoted: msg })
}
