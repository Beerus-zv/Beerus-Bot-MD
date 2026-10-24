import { obtenerMetadata, nombreParticipante, resolverObjetivo, esAdmin, esGrupo } from '../lib/grupo.js'
import {
  db,
  obtenerEconomia,
  obtenerUsuario,
  restarMonedas,
  sumarMonedas,
  anadirExperiencia,
  personajePorNombre,
  obtenerPersonajeGacha,
  listarPersonajesGacha,
  listarAnimesGacha,
  reclamarPersonaje,
  tieneReclamado,
  reclamacionesGacha,
  quitarReclamacion,
  marcarFavorito,
  transferirReclamacion,
  ponerEnVenta,
  quitarDeVenta,
  listarVentas,
  ventaPorId,
  marcarVendido,
  votarPersonaje,
  votosPersonaje,
  topFavoritos,
  topValor,
  guardarClaimMsg,
  obtenerClaimMsg,
  quitarClaimMsg,
  marcarUso,
  guardarUltimaWaifu,
  obtenerUltimaWaifu,
  inventarioGacha,
  statsGacha,
  agregarPersonajeGacha,
  setImagenPersonaje,
  setVideoPersonaje,
  setGeneroPersonaje,
  configGacha,
  setConfigGacha,
  contarPersonajesGacha,
  modoChat,
  configurarModo,
} from '../database/db.js'
import { datosRareza, formatearFicha, estadoVisible, RAREZAS } from '../lib/gacha.js'
import { enviarCartaPersonaje } from '../lib/imagenes.js'
import { nombreLegible, recargaActiva } from '../lib/economia.js'
import { buscarOImportar, tirarDeInternet } from '../lib/gacha-internet.js'
import { elegirRareza } from '../lib/gacha.js'
import { asegurarOwnerVip } from '../lib/owner.js'

const AYUDA = `💞 *Waifu · el gacha unificando todo*

*Uso:*
• \`/gacha random <rareza>\` - Waifu aleatoria (el nuevo gacha roll)
• \`.c\` - Reclamar la waifu random del chat (todos)
• \`/gacha claim <nombre>\` - Reclamar (VIP, 1 vez/mes)
• \`/gacha collection\` - Ver tu colección
• \`/gacha info <nombre>\` - Ficha de un personaje
• \`/gacha image <nombre>\` - Ver la imagen de un personaje
• \`/gacha video <nombre>\` - Ver el video de un personaje
• \`/gacha stats\` - Tus estadísticas
• \`/gacha claimmsg <texto>\` - Tu mensaje al reclamar (vacío: borrarlo)
• \`/gacha give @user <nombre>\` - Regalar un personaje
• \`/gacha giveallgacha @user\` - Regalar todos tus personajes
• \`/gacha trade @user <tuPJ> <suPJ>\` - Intercambiar personajes
• \`/gacha sell <precio> <nombre>\` - Poner un personaje en venta
• \`/gacha removesale <nombre>\` - Quitar un personaje de la venta
• \`/gacha shop\` - Ver los personajes en venta
• \`/gacha buy <nombre>\` - Comprar un personaje en venta
• \`/gacha vote <nombre>\` - Votar por un personaje
• \`/gacha fav <nombre>\` - Marcar favorito
• \`/gacha deletegacha <nombre>\` - Soltar un personaje

*Admin:*
• \`/gacha on | off\` - Activar/apagar el gacha en el grupo
• \`/gacha add <nombre> <anime> <rareza> [url] [F|M]\` - Añadir personaje
• \`/gacha setimage <id> <url>\` - Poner imagen a un personaje
• \`/gacha setvideo <id> <url>\` - Poner video a un personaje
• \`/gacha setgender <id> <F|M>\` - Poner género a un personaje

*Rarezas:* ⚪ Comun · 🔵 Raro · 🟣 Epico · 🟡 Legendario · 🔴 Mitico`

/** Busca un personaje por nombre, id o parcial */
function buscarPersonaje(texto) {
  const ref = String(texto || '').trim()
  if (!ref) return null
  if (/^\d+$/.test(ref)) {
    const porId = obtenerPersonajeGacha(ref)
    if (porId) return porId
  }
  const exacto = personajePorNombre(ref)
  if (exacto) return exacto
  const parcial = listarPersonajesGacha().find(
    (p) => String(p.nombre).toLowerCase().includes(ref.toLowerCase())
  )
  return parcial || null
}

/**
 * Mismo criterio que buscarPersonaje, pero si el personaje no esta en el
 * catalogo lo busca en internet (Jikan) y lo deja sembrado para futuras
 * tiradas. Con peticiones de menos de 3 letras no consulta la red (ruido).
 */
async function buscarOInternet(texto) {
  const local = buscarPersonaje(texto)
  if (local) return local
  if (String(texto || '').trim().length < 3) return null
  const hallador = await buscarOImportar(String(texto).trim())
  return hallador?.personaje || null
}

/** Envía la imagen del personaje con un pie de foto */
async function enviarImagen(sock, jid, msg, personaje, texto) {
  return enviarCartaPersonaje(sock, jid, msg, personaje, texto)
}

/**
 * Pregunta la recarga de un sub del gacha. Envia el aviso si sigue
 * en recarga y devuelve true (para hacer return).
 */
async function enRecarga(sock, jid, msg, quien, clave) {
  const espera = recargaActiva(quien, clave)
  if (espera) {
    await sock.sendMessage(jid, { text: espera, quoted: msg })
    return true
  }
  return false
}

/**
 * Verifica recarga mensual para usuarios VIP.
 * Devuelve mensaje de espera si aún falta tiempo (30 días).
 */
async function enRecargaVip(sock, jid, msg, quien, clave) {
  const vig = recargaActivaVip(quien, clave)
  if (vig) {
    await sock.sendMessage(jid, { text: vig, quoted: msg })
    return true
  }
  return false
}

export default async ({ sock, jid, msg, args, sender, esGrupo: esG }) => {
  const sub = String(args[0] || 'random').toLowerCase()
  const resto = args.slice(1)
  const quien = sender || jid

  // ───────────── Reclamar ─────────────
  if (sub === 'claim' || sub === 'reclamar') {
    // Vincula el JID actual del owner (aunque sea @lid) a la tabla vip
    asegurarOwnerVip(db, { sock, msg, sender })
    // Solo VIP (el owner tambien)
    const vipRow = db.prepare('SELECT * FROM vip WHERE jid = ?').get(quien)
    if (!vipRow || !['vip', 'owner'].includes(vipRow.rango)) {
      await sock.sendMessage(jid, { text: '❌ Solo usuarios VIP pueden usar `/gacha claim`.\nUsa `.vipbadge` para verificar tu rango.', quoted: msg })
      return
    }
    // Cooldown mensual (30 días)
    if (await enRecargaVip(sock, jid, msg, quien, 'vip_claim')) return

    const nombre = resto.join(' ').trim()
    if (!nombre) {
      await sock.sendMessage(jid, {
        text: '❓ Uso: `/gacha claim <nombre del personaje>`',
        quoted: msg,
      })
      return
    }

    const personaje = await buscarOInternet(nombre)
    if (!personaje) {
      await sock.sendMessage(jid, { text: `❌ No encontré el personaje *${nombre}*.`, quoted: msg })
      return
    }

    if (tieneReclamado(quien, personaje.id)) {
      await sock.sendMessage(jid, {
        text: `⚠️ Ya tienes a *${personaje.nombre}* en tu colección.`,
        quoted: msg,
      })
      return
    }

    reclamarPersonaje(quien, personaje.id, esG ? jid : null)
    anadirExperiencia(quien, 10)

    const mensajePropio = obtenerClaimMsg(quien)
    const texto =
      formatearFicha(personaje, { estado: 'En tu colección' }) +
      (mensajePropio
        ? `\n\n💌 ${mensajePropio}`
        : `\n\n_Ya está en tu colección. Usa \`/gacha collection\` para verl@._`)

    await enviarImagen(sock, jid, msg, personaje, texto)
    marcarUso(quien, 'claim')
    return
  }

  // ───────────── Colección ─────────────
  if (sub === 'collection' || sub === 'coleccion' || sub === 'harem' || sub === 'waifus' || sub === 'claims' || sub === 'mis') {
    const claims = reclamacionesGacha(quien)
    if (!claims.length) {
      await sock.sendMessage(jid, {
        text: '📭 No has reclamado ningún personaje todavía.\n_Usa `/gacha claim <nombre>`._',
        quoted: msg,
      })
      return
    }

    const total = claims.reduce((acc, c) => acc + (c.valor || 0), 0)

    // Jerarquia: grupos por rareza (mitico primero) y valor dentro de cada grupo
    const TIERS = ['mitico', 'legendario', 'epico', 'raro', 'comun']
    const ordenados = [...claims].sort((a, b) => {
      const ta = TIERS.indexOf(a.rareza)
      const tb = TIERS.indexOf(b.rareza)
      if (ta !== tb) return ta - tb
      return (b.valor || 0) - (a.valor || 0)
    })

    const lineas = []
    let n = 0
    let tierPrevio = null
    for (const c of ordenados.slice(0, 40)) {
      if (c.rareza !== tierPrevio) {
        tierPrevio = c.rareza
        const r = datosRareza(tierPrevio)
        lineas.push(`\n${r.emoji} *${r.etiqueta}*`)
      }
      n++
      const r = datosRareza(c.rareza)
      const fav = c.favorito ? ' ⭐' : ''
      lineas.push(`${n}. ${r.emoji} *${c.nombre}*${fav} _(${c.anime})_ — ${c.valor} 🪙`)
    }

    await sock.sendMessage(jid, {
      text:
        `🎴 *Tu colección* (${claims.length} personajes · ${total} oro)\n` +
        `${lineas.join('\n')}` +
        (claims.length > 40 ? `\n\n_...y ${claims.length - 40} más_` : ''),
      quoted: msg,
    })
    return
  }

  // ───────────── Ficha ─────────────
  if (sub === 'info' || sub === 'winfo' || sub === 'waifuinfo' || sub === 'charinfo') {
    const nombre = resto.join(' ').trim()
    if (!nombre) {
      await sock.sendMessage(jid, {
        text: '❓ Uso: `/gacha info <nombre del personaje>`',
        quoted: msg,
      })
      return
    }

    const personaje = await buscarOInternet(nombre)
    if (!personaje) {
      await sock.sendMessage(jid, { text: `❌ No encontré el personaje *${nombre}*.`, quoted: msg })
      return
    }

    const r = datosRareza(personaje.rareza)
    const votos = votosPersonaje(personaje.id)
    const mio = tieneReclamado(quien, personaje.id)

    const texto =
      formatearFicha(personaje, {
        estado: estadoVisible(personaje.id, {
          yo: quien,
          resolverNombre: (j) => nombreLegible(j, obtenerUsuario),
        }),
      }) +
      `\n💎 *Rareza* » ${r.etiqueta}` +
      `\n❤️ *Votos* » ${votos}` +
      `\n💞 *Reclamado por ti* » ${mio ? 'sí' : 'no'}`

    await enviarImagen(sock, jid, msg, personaje, texto)
    return
  }

  // ───────────── Solo imagen ─────────────
  if (sub === 'image' || sub === 'img' || sub === 'charimage' || sub === 'cimage') {
    if (await enRecarga(sock, jid, msg, quien, 'wimage')) return

    const nombre = resto.join(' ').trim()
    if (!nombre) {
      await sock.sendMessage(jid, {
        text: '❓ Uso: `/gacha image <nombre del personaje>`',
        quoted: msg,
      })
      return
    }

    const personaje = await buscarOInternet(nombre)
    if (!personaje) {
      await sock.sendMessage(jid, { text: `❌ No encontré el personaje *${nombre}*.`, quoted: msg })
      return
    }

    await enviarImagen(
      sock,
      jid,
      msg,
      personaje,
      formatearFicha(personaje, {
        estado: estadoVisible(personaje.id, {
          yo: quien,
          resolverNombre: (j) => nombreLegible(j, obtenerUsuario),
        }),
      })
    )
    marcarUso(quien, 'wimage')
    return
  }

  // ───────────── Regalar ─────────────
  if (sub === 'give' || sub === 'givewaifu' || sub === 'regalar') {
    if (await enRecarga(sock, jid, msg, quien, 'give')) return

    if (!esG) {
      await sock.sendMessage(jid, { text: '⚠️ Solo funciona en grupos.', quoted: msg })
      return
    }

    const metadata = await obtenerMetadata(sock, jid)
    const objetivo = resolverObjetivo(metadata, msg, resto)
    if (!objetivo) {
      await sock.sendMessage(jid, {
        text: '❓ Uso: `/gacha give @usuario <nombre del personaje>`',
        quoted: msg,
      })
      return
    }

    const nombre = resto.slice(1).join(' ').trim()
    const personaje = nombre ? buscarPersonaje(nombre) : null
    if (!personaje) {
      await sock.sendMessage(jid, { text: `❌ No encontré el personaje *${nombre || ''}*.`, quoted: msg })
      return
    }

    if (!tieneReclamado(quien, personaje.id)) {
      await sock.sendMessage(jid, {
        text: `❌ No tienes a *${personaje.nombre}* en tu colección.`,
        quoted: msg,
      })
      return
    }

    transferirReclamacion(quien, objetivo.jid, personaje.id)
    quitarDeVenta(quien, personaje.id)

    const nombreTarget = nombreParticipante(objetivo.participante)
    await sock.sendMessage(jid, {
      text: `💞 Le regalaste *${personaje.nombre}* a *${nombreTarget}*.`,
      quoted: msg,
    })
    return
  }

  // ───────────── Regalar todo ─────────────
  if (sub === 'giveall' || sub === 'giveallgacha') {
    if (await enRecarga(sock, jid, msg, quien, 'giveall')) return

    if (!esG) {
      await sock.sendMessage(jid, { text: '⚠️ Solo funciona en grupos.', quoted: msg })
      return
    }

    const metadata = await obtenerMetadata(sock, jid)
    const objetivo = resolverObjetivo(metadata, msg, resto)
    if (!objetivo) {
      await sock.sendMessage(jid, { text: '❓ Uso: `/gacha giveallgacha @usuario`', quoted: msg })
      return
    }

    const claims = reclamacionesGacha(quien)
    if (!claims.length) {
      await sock.sendMessage(jid, { text: '📭 No tienes personajes para regalar.', quoted: msg })
      return
    }

    for (const c of claims) {
      transferirReclamacion(quien, objetivo.jid, c.personaje_id)
      quitarDeVenta(quien, c.personaje_id)
    }

    const nombreTarget = nombreParticipante(objetivo.participante)
    await sock.sendMessage(jid, {
      text: `💞 Regalaste tus *${claims.length}* personajes a *${nombreTarget}*.`,
      quoted: msg,
    })
    marcarUso(quien, 'giveall')
    return
  }

  // ───────────── Intercambiar ─────────────
  if (sub === 'trade' || sub === 'intercambiar') {
    if (await enRecarga(sock, jid, msg, quien, 'trade')) return

    if (!esG) {
      await sock.sendMessage(jid, { text: '⚠️ Solo funciona en grupos.', quoted: msg })
      return
    }

    const metadata = await obtenerMetadata(sock, jid)
    const objetivo = resolverObjetivo(metadata, msg, resto)
    if (!objetivo) {
      await sock.sendMessage(jid, {
        text: '❓ Uso: `/gacha trade @usuario <tuPJ> <suPJ>`',
        quoted: msg,
      })
      return
    }

    const [mio, suyo] = resto.slice(1)
    const pjMio = buscarPersonaje(mio)
    const pjSuyo = buscarPersonaje(suyo)

    if (!pjMio || !pjSuyo) {
      await sock.sendMessage(jid, {
        text: '❌ Necesito dos nombres válidos: `/gacha trade @usuario <tuPJ> <suPJ>`',
        quoted: msg,
      })
      return
    }

    if (!tieneReclamado(quien, pjMio.id) || !tieneReclamado(objetivo.jid, pjSuyo.id)) {
      await sock.sendMessage(jid, { text: '❌ Alguien no tiene el personaje que ofrece.', quoted: msg })
      return
    }

    if (tieneReclamado(quien, pjSuyo.id)) {
      await sock.sendMessage(jid, {
        text: `❌ Tú ya tienes a *${pjSuyo.nombre}*. Pide otro personaje.`,
        quoted: msg,
      })
      return
    }

    if (tieneReclamado(objetivo.jid, pjMio.id)) {
      await sock.sendMessage(jid, {
        text: `❌ *${nombreParticipante(objetivo.participante)}* ya tiene a *${pjMio.nombre}*.`,
        quoted: msg,
      })
      return
    }

    transferirReclamacion(quien, objetivo.jid, pjMio.id)
    transferirReclamacion(objetivo.jid, quien, pjSuyo.id)

    const nombreTarget = nombreParticipante(objetivo.participante)
    await sock.sendMessage(jid, {
      text:
        `🔄 *Intercambio completado*\n` +
        `Tú: *${pjMio.nombre}* → *${pjSuyo.nombre}*\n` +
        `${nombreTarget}: *${pjSuyo.nombre}* → *${pjMio.nombre}*`,
      quoted: msg,
    })
    marcarUso(quien, 'trade')
    marcarUso(String(objetivo.jid), 'trade')
    return
  }

  // ───────────── Vender ─────────────
  if (sub === 'sell' || sub === 'vender') {
    if (await enRecarga(sock, jid, msg, quien, 'sell')) return

    const precio = Number(resto[0])
    const nombre = resto.slice(1).join(' ').trim()

    if (!Number.isFinite(precio) || precio < 0 || !nombre) {
      await sock.sendMessage(jid, {
        text: '❓ Uso: `/gacha sell <precio> <nombre del personaje>`',
        quoted: msg,
      })
      return
    }

    const personaje = buscarPersonaje(nombre)
    if (!personaje) {
      await sock.sendMessage(jid, { text: `❌ No encontré el personaje *${nombre}*.`, quoted: msg })
      return
    }

    if (!tieneReclamado(quien, personaje.id)) {
      await sock.sendMessage(jid, {
        text: `❌ No tienes a *${personaje.nombre}* en tu colección.`,
        quoted: msg,
      })
      return
    }

    ponerEnVenta(quien, personaje.id, Math.trunc(precio), esG ? jid : null)

    await sock.sendMessage(jid, {
      text: `🏷️ Puse a *${personaje.nombre}* en venta por *${Math.trunc(precio)}* oro.`,
      quoted: msg,
    })
    marcarUso(quien, 'sell')
    return
  }

  // ───────────── Quitar de la venta ─────────────
  if (sub === 'removesale' || sub === 'removerventa') {
    if (await enRecarga(sock, jid, msg, quien, 'removesale')) return

    const nombre = resto.join(' ').trim()
    const personaje = buscarPersonaje(nombre)
    if (!personaje) {
      await sock.sendMessage(jid, { text: `❌ No encontré el personaje *${nombre}*.`, quoted: msg })
      return
    }

    const ok = quitarDeVenta(quien, personaje.id)
    await sock.sendMessage(jid, {
      text: ok
        ? `🗑️ Quité a *${personaje.nombre}* de la venta.`
        : `❌ *${personaje.nombre}* no estaba en venta.`,
      quoted: msg,
    })
    if (ok) marcarUso(quien, 'removesale')
    return
  }

  // ───────────── Tienda ─────────────
  if (sub === 'shop' || sub === 'tienda' || sub === 'gachashop') {
    const ventas = listarVentas({ grupo: esG ? jid : null, limite: 30 })
    if (!ventas.length) {
      await sock.sendMessage(jid, { text: '🏪 Nadie ha puesto personajes en venta todavía.', quoted: msg })
      return
    }

    const lineas = ventas.map((v, i) => {
      const r = datosRareza(v.rareza)
      return `${i + 1}. ${r.emoji} *${v.nombre}* — *${v.precio}* 🪙`
    })

    await sock.sendMessage(jid, {
      text: `🏪 *Personajes en venta*\n\n${lineas.join('\n')}\n\n_Compra con \`/gacha buy <nombre>\`._`,
      quoted: msg,
    })
    return
  }

  // ───────────── Comprar ─────────────
  if (sub === 'buy' || sub === 'buychar' || sub === 'comprar') {
    if (await enRecarga(sock, jid, msg, quien, 'buy')) return

    const nombre = resto.join(' ').trim()
    const venta = /^\d+$/.test(nombre)
      ? ventaPorId(nombre)
      : listarVentas({ grupo: esG ? jid : null, limite: 100 }).find(
          (v) => String(v.nombre).toLowerCase() === nombre.toLowerCase()
        )

    if (!venta || venta.estado !== 'venta') {
      await sock.sendMessage(jid, { text: `❌ No hay ningún personaje *${nombre}* en venta.`, quoted: msg })
      return
    }

    if (venta.vendedor === quien) {
      await sock.sendMessage(jid, { text: '🙃 Es tu propio personaje en venta.', quoted: msg })
      return
    }

    const eco = obtenerEconomia(quien)
    if (eco.monedas < venta.precio) {
      await sock.sendMessage(jid, {
        text: `💸 Necesitas *${venta.precio}* oro y solo tienes *${eco.monedas}*.`,
        quoted: msg,
      })
      return
    }

    restarMonedas(quien, venta.precio, 'gacha', `Compra de ${venta.nombre}`)
    sumarMonedas(venta.vendedor, venta.precio, 'gacha', `Venta de ${venta.nombre}`)

    quitarReclamacion(venta.vendedor, venta.personaje_id)
    reclamarPersonaje(quien, venta.personaje_id, esG ? jid : null)
    marcarVendido(venta.id, quien)
    anadirExperiencia(quien, 15)

    const personaje = obtenerPersonajeGacha(venta.personaje_id)
    const texto = `🛒 *Compraste a ${venta.nombre}* por *${venta.precio}* oro.`

    if (personaje) await enviarImagen(sock, jid, msg, personaje, texto)
    else await sock.sendMessage(jid, { text: texto, quoted: msg })
    marcarUso(quien, 'buy')
    return
  }


  // ───────────── Votar ─────────────
  if (sub === 'vote' || sub === 'votar') {
    if (await enRecarga(sock, jid, msg, quien, 'vote')) return

    const nombre = resto.join(' ').trim()
    const personaje = buscarPersonaje(nombre)
    if (!personaje) {
      await sock.sendMessage(jid, { text: `❌ No encontré el personaje *${nombre}*.`, quoted: msg })
      return
    }

    const nuevo = votarPersonaje(quien, personaje.id)
    const votos = votosPersonaje(personaje.id)
    const valor = Number(obtenerPersonajeGacha(personaje.id)?.valor ?? 0)

    await sock.sendMessage(jid, {
      text: nuevo
        ? `❤️ Votaste por *${personaje.nombre}*. Ahora tiene *${votos}* votos y su valor subió a *${valor} 🪙*.`
        : `😐 Ya habías votado por *${personaje.nombre}*. Tiene *${votos}* votos y vale *${valor} 🪙*.`,
      quoted: msg,
    })
    marcarUso(quien, 'vote')
    return
  }

  // ───────────── Top de favoritos ─────────────
  if (sub === 'favtop' || sub === 'favoritetop' || sub === 'favortop') {
    if (await enRecarga(sock, jid, msg, quien, 'favtop')) return

    const top = topFavoritos(15)
    if (!top.length) {
      await sock.sendMessage(jid, {
        text: '⭐ Nadie fijó favorito todavía.\n_Elige el tuyo con_ `/setfavourite <nombre>`_.',
        quoted: msg,
      })
      return
    }

    const lineas = top.map((p, i) => {
      const r = datosRareza(p.rareza)
      return `${i + 1}. ${r.emoji} *${p.nombre}* — ⭐ ${p.favoritos} favorito(s) · ${p.valor} 🪙`
    })

    await sock.sendMessage(jid, {
      text: `⭐ *Personajes favoritos del reino*\n\n${lineas.join('\n')}`,
      quoted: msg,
    })
    marcarUso(quien, 'favtop')
    return
  }

  // ───────────── Top por valor (Neko: #gachaboard / #wtop) ─────────────
  if (sub === 'valtop' || sub === 'wtop' || sub === 'gachaboard' || sub === 'topwaifus') {
    if (await enRecarga(sock, jid, msg, quien, 'wtop')) return

    const top = topValor(15)
    if (!top.length) {
      await sock.sendMessage(jid, { text: '❌ El catálogo está vacío.', quoted: msg })
      return
    }

    const lineas = top.map((p, i) => {
      const r = datosRareza(p.rareza)
      return `${i + 1}. ${r.emoji} *${p.nombre}* (${r.etiqueta}) — ${p.valor} 🪙 · ❤️ ${p.votos}`
    })

    await sock.sendMessage(jid, {
      text: `🏆 *Personajes de mayor valor*\n\n${lineas.join('\n')}\n\n_Suben de valor con_ \`/vote <nombre>\`_.`,
      quoted: msg,
    })
    marcarUso(quien, 'wtop')
    return
  }

  // ───────────── Series ─────────────
  if (sub === 'serielist' || sub === 'slist' || sub === 'animelist') {
    if (await enRecarga(sock, jid, msg, quien, 'serielist')) return

    const series = listarAnimesGacha()
    if (!series.length) {
      await sock.sendMessage(jid, { text: '❌ El catálogo está vacío.', quoted: msg })
      return
    }

    const lineas = series.map((s) => `• *${s.anime}* — ${s.personajes} personajes`)
    await sock.sendMessage(jid, {
      text: `📺 *Series del catálogo*\n\n${lineas.join('\n')}`,
      quoted: msg,
    })
    marcarUso(quien, 'serielist')
    return
  }

  // ───────────── Info de serie ─────────────
  if (sub === 'serieinfo' || sub === 'ainfo' || sub === 'animeinfo') {
    if (await enRecarga(sock, jid, msg, quien, 'serieinfo')) return

    const nombre = resto.join(' ').trim().toLowerCase()
    if (!nombre) {
      await sock.sendMessage(jid, { text: '❓ Uso: `/gacha serieinfo <nombre de la serie>`', quoted: msg })
      return
    }

    const personajes = listarPersonajesGacha().filter((p) =>
      String(p.anime || '').toLowerCase().includes(nombre)
    )

    if (!personajes.length) {
      await sock.sendMessage(jid, { text: `❌ No encontré la serie *${nombre}*.`, quoted: msg })
      return
    }

    const lineas = personajes.map((p) => {
      const r = datosRareza(p.rareza)
      return `${r.emoji} *${p.nombre}* — ${r.etiqueta} · ${p.valor} 🪙`
    })

    await sock.sendMessage(jid, {
      text: `📺 *${personajes[0].anime}* (${personajes.length} personajes)\n\n${lineas.join('\n')}`,
      quoted: msg,
    })
    marcarUso(quien, 'serieinfo')
    return
  }

  // ───────────── Favorito ─────────────
  if (sub === 'fav' || sub === 'setfav' || sub === 'setfavourite') {
    const nombre = resto.join(' ').trim()
    const personaje = buscarPersonaje(nombre)
    if (!personaje) {
      await sock.sendMessage(jid, { text: `❌ No encontré el personaje *${nombre}*.`, quoted: msg })
      return
    }

    if (!tieneReclamado(quien, personaje.id)) {
      await sock.sendMessage(jid, {
        text: `❌ Primero reclama a *${personaje.nombre}* con \`/gacha claim\`.`,
        quoted: msg,
      })
      return
    }

    marcarFavorito(quien, personaje.id)
    await sock.sendMessage(jid, {
      text: `⭐ Tu personaje favorito es ahora *${personaje.nombre}*.`,
      quoted: msg,
    })
    return
  }

  // ───────────── Soltar personaje ─────────────
  if (sub === 'delwaifu' || sub === 'delchar' || sub === 'deletegacha') {
    const nombre = resto.join(' ').trim()
    const personaje = buscarPersonaje(nombre)
    if (!personaje) {
      await sock.sendMessage(jid, { text: `❌ No encontré el personaje *${nombre}*.`, quoted: msg })
      return
    }

    const ok = quitarReclamacion(quien, personaje.id)
    quitarDeVenta(quien, personaje.id)

    await sock.sendMessage(jid, {
      text: ok
        ? `🗑️ Soltaste a *${personaje.nombre}*.`
        : `❌ No tenías a *${personaje.nombre}*.`,
      quoted: msg,
    })
    return
  }

  // ───────────── Waifu aleatoria ─────────────
  if (sub === 'random' || sub === 'rand' || sub === 'aleatorio' || sub === 'aleatoria' || sub === 'rnd') {
    if (esG && !modoChat(jid, 'gacha')) {
      await sock.sendMessage(jid, {
        text: '🎰 *El gacha está apagado en este chat.*\n_Un admin puede activarlo con_ `/gacha on`_.',
        quoted: msg,
      })
      return
    }
    if (await enRecarga(sock, jid, msg, quien, 'roll')) return

    // Rareza opcional: /gacha random epico
    const filtro = String(resto[0] || '').toLowerCase().trim()
    if (filtro && !Object.prototype.hasOwnProperty.call(RAREZAS, filtro)) {
      await sock.sendMessage(jid, {
        text: `❌ Rareza *${filtro}* no válida.\n_Usa: comun, raro, epico, legendario o mitico._`,
        quoted: msg,
      })
      return
    }

    // La tirada se hace directo de internet (AniList) y si el personaje no
    // esta en el catalogo se importa al vuelo, con la rareza salida.
    const rarezaBuscada = filtro || elegirRareza()
    let personaje = null
    try {
      personaje = await tirarDeInternet(rarezaBuscada)
    } catch {
      personaje = null
    }

    // Plan B si la red falla o la banda no dio resultados: tirada local
    if (!personaje) {
      const catalogo = listarPersonajesGacha()
      let candidatos = filtro ? catalogo.filter((p) => p.rareza === filtro) : catalogo
      if (!candidatos.length) candidatos = catalogo
      if (candidatos.length) {
        // Se prefiere un personaje que el usuario aun no tenga en su colección
        const yaReclamados = new Set(reclamacionesGacha(quien).map((c) => c.personaje_id))
        const nuevos = candidatos.filter((p) => !yaReclamados.has(p.id))
        const pool = nuevos.length ? nuevos : candidatos
        personaje = pool[Math.floor(Math.random() * pool.length)]
      }
    }

    if (!personaje) {
      await sock.sendMessage(jid, { text: '🎲 La tirada falló, inténtalo de nuevo.', quoted: msg })
      return
    }

    const r = datosRareza(personaje.rareza)
    const mio = tieneReclamado(quien, personaje.id)

    const texto =
      formatearFicha(personaje, {
        estado: estadoVisible(personaje.id, {
          yo: quien,
          resolverNombre: (j) => nombreLegible(j, obtenerUsuario),
        }),
      }) +
      `\n🎲 *Rareza* » ${r.emoji} ${r.etiqueta}` +
      `\n❤️ *Votos* » ${votosPersonaje(personaje.id)}` +
      (mio
        ? `\n\n_Ya la tienes en tu colección._`
        : `\n\n_Reclámala con \`.c\` antes de que otro lo haga._`)

    await enviarImagen(sock, jid, msg, personaje, texto)
    guardarUltimaWaifu(jid, personaje)
    marcarUso(quien, 'roll')
    return
  }

  // ───────────── Solo video ─────────────
  if (sub === 'video' || sub === 'charvideo' || sub === 'waifuvideo' || sub === 'cvideo' || sub === 'wvideo') {
    if (await enRecarga(sock, jid, msg, quien, 'wvideo')) return

    const nombre = resto.join(' ').trim()
    if (!nombre) {
      await sock.sendMessage(jid, {
        text: '❓ Uso: `/gacha video <nombre del personaje>`',
        quoted: msg,
      })
      return
    }

    const personaje = await buscarOInternet(nombre)
    if (!personaje) {
      await sock.sendMessage(jid, { text: `❌ No encontré el personaje *${nombre}*.`, quoted: msg })
      return
    }

    if (!personaje.video) {
      await sock.sendMessage(jid, {
        text:
          `🎬 *${personaje.nombre}* no tiene video registrado.` +
          `\n_Un admin puede añadirlo con:_ \`/gacha setvideo ${personaje.nombre} <url del video>\``,
        quoted: msg,
      })
      return
    }

    await sock.sendMessage(jid, {
      video: { url: personaje.video },
      caption: `🎬 *${personaje.nombre}*${personaje.anime ? ` · ${personaje.anime}` : ''}`,
    })
    marcarUso(quien, 'wvideo')
    return
  }

  // ───────────── Mensaje al reclamar ─────────────
  if (sub === 'claimmsg' || sub === 'setclaimmsg' || sub === 'setclaim') {
    const texto = resto.join(' ').trim()

    if (!texto || texto === 'borrar' || texto === 'reset' || texto === 'off') {
      const quitado = quitarClaimMsg(quien)
      await sock.sendMessage(jid, {
        text: quitado
          ? '🗑️ Mensaje al reclamar restablecido al de siempre.'
          : 'ℹ️ No tenías ningún mensaje al reclamar personalizado.',
        quoted: msg,
      })
      return
    }

    if (texto.length > 200) {
      await sock.sendMessage(jid, { text: '❌ El mensaje no puede pasar de 200 caracteres.', quoted: msg })
      return
    }

    guardarClaimMsg(quien, texto)
    await sock.sendMessage(jid, {
      text: `💌 *Mensaje al reclamar guardado.*\n\n> ${texto}`,
      quoted: msg,
    })
    return
  }

  // ───────────── Borrar mensaje al reclamar ─────────────
  if (sub === 'delclaimmsg' || sub === 'delclaim') {
    const quitado = quitarClaimMsg(quien)
    await sock.sendMessage(jid, {
      text: quitado
        ? '🗑️ Mensaje al reclamar restablecido al de siempre.'
        : 'ℹ️ No tenías ningún mensaje al reclamar personalizado.',
      quoted: msg,
    })
    return
  }

  // ───────────── Estadísticas (del gacha) ─────────────
  if (sub === 'stats' || sub === 'estado') {
    if (await enRecarga(sock, jid, msg, quien, 'gstats')) return

    const stats = statsGacha(quien) || { rolls: 0 }
    const economia = obtenerEconomia(quien)
    const inventario = inventarioGacha(quien)
    const valor = inventario.reduce((acc, i) => acc + (i.valor || 0) * (i.cantidad || 1), 0)
    const claims = reclamacionesGacha(quien)
    const valorClaims = claims.reduce((acc, c) => acc + (c.valor || 0), 0)

    await sock.sendMessage(jid, {
      text:
        `📊 *Tus estadísticas*\n\n` +
        `🎰 Tiradas: *${stats.rolls ?? 0}*\n` +
        `📦 Colección: *${inventario.reduce((acc, i) => acc + (i.cantidad || 1), 0)}* (${inventario.length} distintos)\n` +
        `🏆 Valor de la colección: *${valor}* oro\n` +
        `💞 Harem: *${claims.length}* reclamos (${valorClaims} oro)\n` +
        `🪙 Saldo: *${economia.monedas}* oro\n` +
        `⭐ Nivel: *${economia.nivel}* (${economia.experiencia} XP)`,
      quoted: msg,
    })
    marcarUso(quien, 'gstats')
    return
  }

  // ───────────── Modo gacha on/off (admin) ─────────────
  if (sub === 'on' || sub === 'off') {
    let metadata = null
    try {
      metadata = await obtenerMetadata(sock, jid)
    } catch {
      metadata = null
    }
    if ((esG && !metadata) || (metadata && !esAdmin(metadata, quien))) {
      await sock.sendMessage(jid, {
        text: '⛔ Solo los *administradores* pueden cambiar el modo del gacha.',
        quoted: msg,
      })
      return
    }

    const activar = sub === 'on'
    configurarModo(jid, 'gacha', activar)
    await sock.sendMessage(jid, {
      text: activar
        ? '⚡ *Gacha activado* en este chat. ¡A tirar!'
        : '🌙 *Gacha desactivado*. `/gacha on` reanuda el sorteo.',
      quoted: msg,
    })
    return
  }

  // ───────────── Añadir personaje (admin) ─────────────
  if (sub === 'addchar' || sub === 'add') {
    let metadata = null
    try { metadata = await obtenerMetadata(sock, jid) } catch {}
    if (esG && (!metadata || !esAdmin(metadata, quien))) {
      await sock.sendMessage(jid, { text: '⛔ Solo los *administradores* pueden añadir personajes.', quoted: msg })
      return
    }

    const nombre = resto[0]
    const anime = resto[1]
    const rareza = String(resto[2] || 'comun').toLowerCase()
    const prueba = String(resto[3] || '')
    const esVideo = /\.(mp4|webm|mov|avi)(\?.*)?$/i.test(prueba)
    const imagen = esVideo ? null : prueba || null
    const videoUrl = esVideo ? prueba : null
    const generoArg = String(resto[4] || '').toUpperCase()

    if (!nombre || !anime) {
      await sock.sendMessage(jid, {
        text:
          '❓ *Uso:* `/gacha add <nombre> <anime> <rareza> [url] [genero]`\n' +
          '_Rarezas:_ comun, raro, epico, legendario, mitico\n' +
          '_Genero:_ F (mujer) o M (hombre)',
        quoted: msg,
      })
      return
    }

    if (!Object.prototype.hasOwnProperty.call(RAREZAS, rareza)) {
      await sock.sendMessage(jid, {
        text: '❌ Rareza no válida. Usa: `comun`, `raro`, `epico`, `legendario` o `mitico`.',
        quoted: msg,
      })
      return
    }

    if (personajePorNombre(nombre)) {
      await sock.sendMessage(jid, {
        text: `❌ El personaje *${nombre}* ya existe en el catálogo.`,
        quoted: msg,
      })
      return
    }

    const genero = generoArg.startsWith('F') ? 'F' : generoArg.startsWith('M') ? 'M' : null
    const id = agregarPersonajeGacha({ nombre, anime, rareza, imagen, genero })
    if (videoUrl) setVideoPersonaje(id, videoUrl)
    const r = datosRareza(rareza)

    await sock.sendMessage(jid, {
      text:
        `✅ Personaje añadido: ${r.emoji} *${nombre}* _(${anime})_ — id \`${id}\`\n` +
        `♀️♂️ Género: *${genero === 'F' ? 'Mujer' : genero === 'M' ? 'Hombre' : 'Desconocido'}*` +
        (videoUrl ? `\n🎬 Video registrado.` : ''),
      quoted: msg,
    })
    return
  }

  // ───────────── Poner género (admin) ─────────────
  if (sub === 'setgender' || sub === 'setgenero' || sub === 'genero') {
    let metadata = null
    try { metadata = await obtenerMetadata(sock, jid) } catch {}
    if (esG && (!metadata || !esAdmin(metadata, quien))) {
      await sock.sendMessage(jid, { text: `⛔ Solo los *administradores* pueden cambiar el género.`, quoted: msg })
      return
    }

    const ref = resto[0]
    const valor = String(resto[1] || '').toUpperCase()
    if (!ref || !['F', 'M'].includes(valor)) {
      await sock.sendMessage(jid, {
        text: '❓ *Uso:* `/gacha setgender <id o nombre> <F|M>`\n_F = mujer · M = hombre_',
        quoted: msg,
      })
      return
    }

    const personaje = /^\d+$/.test(ref) ? obtenerPersonajeGacha(ref) : personajePorNombre(ref)
    if (!personaje) {
      await sock.sendMessage(jid, {
        text: `❌ No encontré el personaje *${ref}*.`,
        quoted: msg,
      })
      return
    }

    const g = setGeneroPersonaje(personaje.id, valor)
    await sock.sendMessage(jid, {
      text: `♀️♂️ Género de *${personaje.nombre}* → *${g === 'F' ? 'Mujer' : 'Hombre'}*`,
      quoted: msg,
    })
    return
  }

  // ───────────── Poner imagen (admin) ─────────────
  if (sub === 'setimage' || sub === 'setimg') {
    let metadata = null
    try { metadata = await obtenerMetadata(sock, jid) } catch {}
    if (esG && (!metadata || !esAdmin(metadata, quien))) {
      await sock.sendMessage(jid, { text: '⛔ Solo los *administradores* pueden cambiar las imágenes.', quoted: msg })
      return
    }

    const ref = resto[0]
    const url = resto.slice(1).join(' ')
    if (!ref || !url) {
      await sock.sendMessage(jid, {
        text: '❓ *Uso:* `/gacha setimage <id o nombre> <url de la imagen>`',
        quoted: msg,
      })
      return
    }

    const personaje = /^\d+$/.test(ref) ? obtenerPersonajeGacha(ref) : personajePorNombre(ref)
    if (!personaje) {
      await sock.sendMessage(jid, {
        text: `❌ No encontré el personaje *${ref}*.`,
        quoted: msg,
      })
      return
    }

    setImagenPersonaje(personaje.id, url)
    await sock.sendMessage(jid, {
      text: `🖼️ Imagen de *${personaje.nombre}* actualizada.`,
      quoted: msg,
    })
    return
  }

  // ───────────── Poner video (admin) ─────────────
  if (sub === 'setvideo' || sub === 'setvid') {
    let metadata = null
    try { metadata = await obtenerMetadata(sock, jid) } catch {}
    if (esG && (!metadata || !esAdmin(metadata, quien))) {
      await sock.sendMessage(jid, { text: '⛔ Solo los *administradores* pueden cambiar los videos.', quoted: msg })
      return
    }

    const ref = resto[0]
    const url = resto.slice(1).join(' ')
    if (!ref || !url) {
      await sock.sendMessage(jid, {
        text: '❓ *Uso:* `/gacha setvideo <id o nombre> <url del video (mp4/webm)>`',
        quoted: msg,
      })
      return
    }

    const personaje = /^\d+$/.test(ref) ? obtenerPersonajeGacha(ref) : personajePorNombre(ref)
    if (!personaje) {
      await sock.sendMessage(jid, {
        text: `❌ No encontré el personaje *${ref}*.`,
        quoted: msg,
      })
      return
    }

    setVideoPersonaje(personaje.id, url)
    await sock.sendMessage(jid, {
      text: `🎬 Video de *${personaje.nombre}* registrado. Prueba con \`/gacha video ${personaje.nombre}\`.`,
      quoted: msg,
    })
    return
  }

  // ───────────── Ayuda ─────────────
  await sock.sendMessage(jid, { text: AYUDA, quoted: msg })
}

