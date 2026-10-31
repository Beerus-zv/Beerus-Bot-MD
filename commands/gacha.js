import {
  obtenerMetadata,
  nombreParticipante,
  resolverObjetivo,
  esAdmin,
  esGrupo,
  mencionDeParticipantes,
  tokenMencion,
  jidUsuario,
} from '../lib/grupo.js'
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
  registrarRollGacha,
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
import { datosRareza, formatearFicha, estadoVisible, RAREZAS, elegirRareza, probabilidades, PITY_DURO, PITY_SUAVE, PITY_MEDIO_DURO } from '../lib/gacha.js'
import { enviarCartaPersonaje } from '../lib/imagenes.js'
import { nombreLegible, recargaActiva } from '../lib/economia.js'
import { BANDAS_RAREZA, PERSONAJES_POR_SERIE, SERIES_POR_PAGINA } from '../lib/anilist.js'
import { buscarOImportar, completarPersonajesSeries, personajesDeSerieInternet, listarSeriesInternet, sincronizarRarezas, tirarDeInternet } from '../lib/gacha-internet.js'
import { asegurarOwnerVip, esOwnerMsg } from '../lib/owner.js'

/**
 * Etiqueta de un usuario para los mensajes de gacha: nombre resuelto (BD) y
 * mencion real. Sin esto los metadatos del grupo (que solo traen `id`/`lid`)
 * hacian que el mensaje mostrara el JID crudo.
 */
function etiquetaObjetivo(metadata, objetivo) {
  const mencion = mencionDeParticipantes(metadata?.participants || [], objetivo.jid)
  const token = mencion?.token || tokenMencion(objetivo.jid)
  const jidEtiqueta = mencion?.jid || jidUsuario(objetivo.jid)

  const nombre = nombreParticipante(objetivo.participante, (j) => nombreLegible(j, obtenerUsuario))
  const digitosNombre = String(nombre).replace(/\D/g, '')
  const digitosToken = String(token).replace(/\D/g, '')

  // Si el nombre resuelto es el propio numero, el token ya lo muestra
  const soloToken = !digitosNombre || digitosNombre === digitosToken

  return {
    texto: soloToken ? token : `${nombre} ${token}`,
    jid: jidEtiqueta,
  }
}

/**
 * Tabla de probabilidades para la ayuda.
 * Sale del mismo motor que el sorteo (`probabilidades`), asi que si se
 * reajustan los pesos la ayuda cambia sola en vez de mentir.
 */
function tablaProbabilidades() {
  return probabilidades()
    .map(({ rareza, porcentaje }) => {
      const r = datosRareza(rareza)
      return `${r.emoji} ${r.etiqueta}: *${porcentaje.toFixed(2)}%*`
    })
    .reverse()
    .join('\n')
}

/**
 * Linea de bandas de rareza para la ayuda.
 * Se arma con BANDAS_RAREZA, la misma tabla que decide la rareza real, para
 * que la ayuda no pueda quedarse con cortes viejos.
 */
function tablaBandas() {
  // es-ES no agrupa numeros de 4 cifras por defecto, y "3600" al lado de
  // "25.000" se lee mal: useGrouping siempre deja la tabla pareja.
  const miles = (n) => Number(n).toLocaleString('es-ES', { useGrouping: 'always' })
  const cortes = BANDAS_RAREZA.map((b) => {
    const r = datosRareza(b.rareza)
    return `${r.emoji} ${r.etiqueta} ≥${miles(b.favoritos)}`
  })
  const comun = datosRareza('comun')
  return [...cortes, `${comun.emoji} ${comun.etiqueta} <${miles(BANDAS_RAREZA.at(-1).favoritos)}`].join(' · ')
}

const AYUDA = `💞 *Gacha anime*

_Tira cartas, reclama personajes y haz crecer tu coleccion._

*Uso:*
• \`.gacha\` · \`.gc\` - Tirar un personaje al azar
• \`.gacha random <rareza>\` - Tirada de una rareza concreta
• \`.gacha help\` - Ver esta ayuda
• \`.c\` - Reclamar la carta random del chat (todos)
• \`.gacha claim <nombre>\` - Reclamar (VIP, 1 vez/mes)
• \`.gacha collection\` - Ver tu colección
• \`.gacha info <nombre>\` - Ficha de un personaje
• \`.gacha image <nombre>\` - Ver la imagen de un personaje
• \`.gacha video <nombre>\` - Ver el video de un personaje
• \`.gacha stats\` - Tus estadísticas
• \`.gacha claimmsg <texto>\` - Tu mensaje al reclamar (vacío: borrarlo)
• \`.gacha give @user <nombre>\` - Regalar un personaje
• \`.gacha giveallgacha @user\` - Regalar todos tus personajes
• \`.gacha trade @user <tuPJ> <suPJ>\` - Intercambiar personajes
• \`.gacha sell <precio> <nombre>\` - Poner un personaje en venta
• \`.gacha removesale <nombre>\` - Quitar un personaje de la venta
• \`.gacha shop\` - Ver los personajes en venta
• \`.gacha buy <nombre>\` - Comprar un personaje en venta
• \`.gacha vote <nombre>\` - Votar por un personaje
• \`.gacha fav <nombre>\` - Marcar favorito
• \`.gacha deletegacha <nombre>\` - Soltar un personaje

*Series (internet):*
• \`.serielist [página]\` - Series de anime por popularidad (AniList)
• \`.serieinfo <serie>\` - Personajes de esa serie y su rareza

*Probabilidades por tirada:*
${tablaProbabilidades()}

*Garantía (pity):*
• Cada *${PITY_MEDIO_DURO}* tiradas sin épico o mejor, sale épico o mejor sí o sí.
• Desde la *${PITY_SUAVE}* sin legendario ni mítico, las dos altas suben.
• En la *${PITY_DURO}* sin legendario ni mítico, sale una de las dos sí o sí.
• Progreso en \`.gacha stats\`. Con rareza forzada no se mueve ninguna.

*Rarezas (banda de favoritos en AniList):*
${tablaBandas()}

*Mantenimiento (owner):*
• \`.gacha sync\` - Recalcular las rarezas del catálogo desde AniList

*Admin:*
• \`.gacha on | off\` - Activar/apagar el gacha en el grupo
• \`.gacha add <nombre> <anime> <rareza> [url] [F|M]\` - Añadir personaje
• \`.setcardimage <nombre|id> [url]\` - Cambiar la imagen de una carta (\`.sci\`, respondiendo a una foto)
• \`.gacha setimage <id> <url>\` - Poner imagen a un personaje
• \`.gacha setvideo <id> <url>\` - Poner video a un personaje
• \`.gacha setgender <id> <F|M>\` - Poner género a un personaje

*Rarezas:* ⚪ Comun · 🔵 Raro · 🟣 Epico · 🟡 Legendario · 🔴 Mitico

_Con rareza forzada (\`.gacha random epico\`) no se mueve la garantía._`

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

  // ───────────── Ayuda ─────────────
  if (sub === 'help' || sub === 'ayuda' || sub === 'comandos') {
    await sock.sendMessage(jid, { text: AYUDA, quoted: msg })
    return
  }

  // ───────────── Reclamar ─────────────
  if (sub === 'claim' || sub === 'reclamar') {
    // Vincula el JID actual del owner (aunque sea @lid) a la tabla vip
    asegurarOwnerVip(db, { sock, msg, sender })
    // Solo VIP (el owner tambien), aceptando PN, LID o sufijo de dispositivo
    if (!esVip(jidsDe({ msg, sender: quien, sock }))) {
      await sock.sendMessage(jid, { text: '❌ Solo usuarios VIP pueden usar `/gacha claim`.\nPide acceso con `.vip add @usuario` (owner).', quoted: msg })
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

    const etiqueta = etiquetaObjetivo(metadata, objetivo)
    await sock.sendMessage(jid, {
      text: `💞 Le regalaste *${personaje.nombre}* a ${etiqueta.texto}.`,
      mentions: [etiqueta.jid],
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

    const etiqueta = etiquetaObjetivo(metadata, objetivo)
    await sock.sendMessage(jid, {
      text: `💞 Regalaste tus *${claims.length}* personajes a ${etiqueta.texto}.`,
      mentions: [etiqueta.jid],
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

    const etiqueta = etiquetaObjetivo(metadata, objetivo)

    if (tieneReclamado(objetivo.jid, pjMio.id)) {
      await sock.sendMessage(jid, {
        text: `❌ ${etiqueta.texto} ya tiene a *${pjMio.nombre}*.`,
        mentions: [etiqueta.jid],
        quoted: msg,
      })
      return
    }

    transferirReclamacion(quien, objetivo.jid, pjMio.id)
    transferirReclamacion(objetivo.jid, quien, pjSuyo.id)

    await sock.sendMessage(jid, {
      text:
        `🔄 *Intercambio completado*\n` +
        `Tú: *${pjMio.nombre}* → *${pjSuyo.nombre}*\n` +
        `${etiqueta.texto}: *${pjSuyo.nombre}* → *${pjMio.nombre}*`,
      mentions: [etiqueta.jid],
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

    const pedida = Math.trunc(Number(resto[0]))
    const paginaPedida = Number.isFinite(pedida) && pedida > 0 ? pedida : 1

    // 1) La lista sale de la misma fuente que las tiradas (AniList)
    const internet = await listarSeriesInternet(paginaPedida)
    if (internet) {
      // Numero real de personajes (MyAnimeList, cache 24 h)
      await completarPersonajesSeries(internet.series)

      const { series, pagina, paginas, total } = internet
      const desde = (pagina - 1) * SERIES_POR_PAGINA
      const lineas = series.map((s, i) => {
        const anio = s.anio ? ` (${s.anio})` : ''
        const cuantos = Number.isFinite(s.personajes)
          ? ` — ${s.personajes} ${s.personajes === 1 ? 'personaje' : 'personajes'}`
          : ''
        const favs = s.favoritos ? ` · ${s.favoritos.toLocaleString('es-ES')} ⭐` : ''
        return `${desde + i + 1}. *${s.titulo}*${anio}${cuantos}${favs}`
      })
      const siguiente = pagina < paginas ? pagina + 1 : 1
      const rango = `${desde + 1}-${desde + series.length} de ${total}`

      await sock.sendMessage(jid, {
        text:
          `📺 *Series de anime* (${rango})\n` +
          `_Fuente: AniList · personajes: MyAnimeList._\n\n` +
          `${lineas.join('\n')}\n\n` +
          (paginas > 1
            ? `_Página ${pagina}/${paginas} · siguiente:_ \`.serielist ${siguiente}\`\n`
            : '') +
          `_Abre una con_ \`.serieinfo <serie>\`_._`,
        quoted: msg,
      })
      marcarUso(quien, 'serielist')
      return
    }

    // 2) Sin internet: catalogo local
    const series = listarAnimesGacha()
    if (!series.length) {
      await sock.sendMessage(jid, { text: '❌ El catálogo está vacío.', quoted: msg })
      return
    }

    // Son muchas series: se pagina para que quepan en un mensaje
    const POR_PAGINA = 30
    const paginas = Math.max(1, Math.ceil(series.length / POR_PAGINA))
    const pagina = Number.isFinite(pedida) && pedida > 0 ? Math.min(pedida, paginas) : 1
    const desde = (pagina - 1) * POR_PAGINA
    const trozo = series.slice(desde, desde + POR_PAGINA)

    const lineas = trozo.map((s, i) => {
      const n = s.personajes
      return `${desde + i + 1}. *${s.anime}* — ${n} ${n === 1 ? 'personaje' : 'personajes'}`
    })

    const siguiente = pagina < paginas ? pagina + 1 : 1
    const pie =
      paginas > 1
        ? `\n\n_Página ${pagina}/${paginas} · siguiente:_ \`.serielist ${siguiente}\``
        : ''
    const rango = paginas > 1 ? ` (${desde + 1}-${desde + trozo.length} de ${series.length})` : ` (${series.length})`

    await sock.sendMessage(jid, {
      text:
        `📺 *Series del catálogo*${rango}\n` +
        `_Sin internet: solo lo ya tirado._\n\n` +
        `${lineas.join('\n')}\n\n` +
        `_Abre una con_ \`.serieinfo <serie>\`_._` +
        pie,
      quoted: msg,
    })
    marcarUso(quien, 'serielist')
    return
  }

  // ───────────── Info de serie ─────────────
  if (sub === 'serieinfo' || sub === 'ainfo' || sub === 'animeinfo') {
    if (await enRecarga(sock, jid, msg, quien, 'serieinfo')) return

    const nombre = resto.join(' ').trim()
    if (!nombre) {
      await sock.sendMessage(jid, {
        text: '❓ Uso: `.serieinfo <serie>`\n_Mira las series con_ `.serielist`_.',
        quoted: msg,
      })
      return
    }

    // 1) La ficha sale de la misma fuente que las tiradas (AniList)
    const internet = await personajesDeSerieInternet(nombre)
    if (internet) {
      const { serie, personajes, total } = internet
      const MAX = PERSONAJES_POR_SERIE
      const lineas = personajes.slice(0, MAX).map((p) => {
        const r = datosRareza(p.rareza)
        return `${r.emoji} *${p.nombre}* — ${r.etiqueta} · ${p.favoritos.toLocaleString('es-ES')} ⭐`
      })
      const sobran = Math.max(0, total - lineas.length)
      const anio = serie.anio ? ` (${serie.anio})` : ''

      await sock.sendMessage(jid, {
        text:
          `📺 *${serie.titulo}*${anio} · ${total} ` +
          `${total === 1 ? 'personaje' : 'personajes'}\n` +
          `_Fuente: AniList · ${serie.favoritos.toLocaleString('es-ES')} ⭐_\n\n` +
          `${lineas.join('\n')}` +
          (sobran > 0 ? `\n\n_...y ${sobran} más._` : '') +
          `\n\n_Tirada con_ \`.gacha random\` _y ficha con_ \`.gacha info <nombre>\`_._`,
        quoted: msg,
      })
      marcarUso(quien, 'serieinfo')
      return
    }

    // 2) Sin internet: catalogo local
    const buscar = nombre.toLowerCase()
    const series = listarAnimesGacha()
    const exacta = series.find((s) => s.anime.toLowerCase() === buscar)
    const parciales = series.filter((s) => s.anime.toLowerCase().includes(buscar))

    if (!exacta && parciales.length > 1) {
      // Varias series contienen el texto: que elija una
      const opciones = parciales.slice(0, 12).map((s) => `• *${s.anime}* (${s.personajes})`)
      const restoOpciones =
        parciales.length > opciones.length ? `\n_...y ${parciales.length - opciones.length} más._` : ''
      await sock.sendMessage(jid, {
        text:
          `🔎 *${nombre}* coincide con ${parciales.length} series:\n\n` +
          `${opciones.join('\n')}${restoOpciones}\n\n` +
          `_Escribe el nombre completo:_ \`.serieinfo ${parciales[0].anime}\`_._`,
        quoted: msg,
      })
      return
    }

    const elegida = exacta || parciales[0]
    if (!elegida) {
      await sock.sendMessage(jid, {
        text: `❌ No encontré la serie *${nombre}*.\n_Mira las series con_ \`.serielist\`_.`,
        quoted: msg,
      })
      return
    }

    // Personajes de esa serie, del más valioso al menos
    const personajes = listarPersonajesGacha()
      .filter((p) => String(p.anime || '').toLowerCase() === elegida.anime.toLowerCase())
      .sort((a, b) => (Number(b.valor) || 0) - (Number(a.valor) || 0))

    const MAX = 40
    const lineas = personajes.slice(0, MAX).map((p) => {
      const r = datosRareza(p.rareza)
      return `${r.emoji} *${p.nombre}* — ${r.etiqueta} · ${p.valor} 🪙`
    })
    const sobran = personajes.length - lineas.length

    await sock.sendMessage(jid, {
      text:
        `📺 *${elegida.anime}* · ${personajes.length} ` +
        `${personajes.length === 1 ? 'personaje' : 'personajes'}\n\n` +
        `${lineas.join('\n')}` +
        (sobran > 0 ? `\n\n_...y ${sobran} más._` : '') +
        `\n\n_Ficha con_ \`.gacha info <nombre>\`_._`,
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
    // esta en el catalogo se importa al vuelo. La rareza sale siempre de sus
    // favoritos (misma banda que .serielist/.serieinfo).
    //
    // Sin rareza forzada el sorteo usa el contador de pity del usuario, asi
    // que la mala racha tiene tope (PITY_SUAVE sube las altas, PITY_DURO las
    // garantiza).
    // Sin rareza forzada el sorteo usa los dos contadores de garantia del
    // usuario, asi que ninguna de las dos colas queda sin tope.
    const previas = statsGacha(quien)
    const rarezaBuscada = filtro || elegirRareza({ pity: previas.pity, pityAlto: previas.pity_alto })
    let personaje = null
    try {
      personaje = await tirarDeInternet(rarezaBuscada)
      // La red responde pero esa banda no dio nada: tirada libre online
      if (!personaje && !filtro) personaje = await tirarDeInternet()
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

    // Con rareza forzada no se toca el contador: si contara, se podria
    // farmear la garantia pidiendo siempre la rareza mas baja.
    if (!filtro) registrarRollGacha(quien, personaje.rareza)

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

    const stats = statsGacha(quien)
    const economia = obtenerEconomia(quien)
    const inventario = inventarioGacha(quien)
    const valor = inventario.reduce((acc, i) => acc + (i.valor || 0) * (i.cantidad || 1), 0)
    const claims = reclamacionesGacha(quien)
    const valorClaims = claims.reduce((acc, c) => acc + (c.valor || 0), 0)

    // Progreso de las dos garantias: el jugador ve cuando se le acerca el premio
    const faltaMedia = Math.max(0, PITY_MEDIO_DURO - stats.pity)
    const faltaAlta = Math.max(0, PITY_DURO - stats.pity_alto)

    await sock.sendMessage(jid, {
      text:
        `📊 *Tus estadísticas*\n\n` +
        `🎰 Tiradas: *${stats.rolls}*\n` +
        `🟣 Épico o mejor: *${stats.pity}/${PITY_MEDIO_DURO}*` +
        (faltaMedia ? ` _(faltan ${faltaMedia})_` : ' _(próxima tirada)_') + `\n` +
        `🟡 Legendario o mítico: *${stats.pity_alto}/${PITY_DURO}*` +
        (faltaAlta ? ` _(faltan ${faltaAlta})_` : ' _(próxima tirada)_') + `\n` +
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

  // ───────────── Sincronizar rarezas con AniList (owner) ─────────────
  if (sub === 'sync' || sub === 'syncrareza' || sub === 'syncrarities') {
    if (!esOwnerMsg({ msg, sender, sock })) {
      await sock.sendMessage(jid, {
        text: '⛔ Solo el *owner* puede sincronizar las rarezas del gacha.',
        quoted: msg,
      })
      return
    }

    await sock.sendMessage(jid, {
      text: '⏳ Recalculando rarezas desde AniList...\n_Puede tardar unos minutos._',
      quoted: msg,
    })

    const resultado = await sincronizarRarezas({ forzar: true })
    if (!resultado) {
      await sock.sendMessage(jid, {
        text: '❌ Sin internet: no se pudo sincronizar. Inténtalo más tarde.',
        quoted: msg,
      })
      return
    }

    await sock.sendMessage(jid, {
      text:
        `✅ *Rarezas sincronizadas*\n\n` +
        `📄 Páginas leídas: *${resultado.paginas}*\n` +
        `🗂️ Personajes en catálogo: *${resultado.revisados}*\n` +
        `🔎 Encontrados en AniList: *${resultado.encontrados}*\n` +
        `🔄 Rarezas corregidas: *${resultado.actualizados}*` +
        (resultado.duplicados?.length
          ? `\n♻️ Duplicados sin tocar: *${resultado.duplicados.length}* (${resultado.duplicados.map((d) => d.nombre).join(', ')})`
          : '') +
        (resultado.sinDatos?.length
          ? `\n❔ Sin datos en AniList: *${resultado.sinDatos.length}* (${resultado.sinDatos.join(', ')})`
          : ''),
      quoted: msg,
    })
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

