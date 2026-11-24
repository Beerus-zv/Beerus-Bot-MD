/**
 * RPG de economía: `/hunt`, `/mine`, `/fish`, `/adventure`, `/dungeon`,
 * `/cofre`, `/heal`, `/ritual`, `/shop`, `/inventory` y `/equip`.
 *
 * Cada acción gasta su espera de reloj, da oro y a veces un item. El perfil
 * vive en `rpg_perfil` (hp, nivel, ataque, defensa) y los items en
 * `rpg_inventario`. El equipo puesto (espada, hacha, armadura, escudo) se
 * aplica al calcular ataque y defensa.
 *
 *   /rpg                     ficha del personaje
 *   /rpg <acción>            ejecuta la acción
 */
import {
  ITEMS,
  CLASES,
  ESPERAS,
  azar,
  elegir,
  esperaRestante,
  marcarAccion,
  tiempoLegible,
  fichaRpg,
  curar,
  ganarXp,
  recibirDanio,
  revisarNivel,
  revisarCaja,
  listarInventario,
  cantidadDeItem,
  darItem,
  quitarItem,
  obtenerEconomia,
  sumarMonedas,
  restarMonedas,
} from '../lib/rpg.js'
import { guardarRpg, marcarCofre } from '../database/db.js'

const AYUDA =
  '⚔️ *RPG de Beerus*\n\n' +
  '• `/rpg` — tu ficha\n' +
  '• `/hunt` — cazar (90s)\n' +
  '• `/mine` — minar (2m)\n' +
  '• `/fish` — pescar (90s)\n' +
  '• `/adventure` — aventura (3m)\n' +
  '• `/dungeon` — mazmorra (5m)\n' +
  '• `/cofre` — caja cada hora\n' +
  '• `/heal` — curarte con pociones\n' +
  '• `/ritual` — ritual (10m)\n' +
  '• `/shop [comprar|vender] <item>`\n' +
  '• `/inventory` — tu mochila\n' +
  '• `/equip <item>` — equipar\n\n' +
  '_El oro va a tu cartera. Las pociones y vendajes curan._'

/** Nombre con emoji de un item */
function nombreItem(clave) {
  const it = ITEMS[clave]
  return it ? `${it.emoji} ${it.nombre}` : clave
}

/** Resumen corto de una tirada de botín */
function botin(items) {
  if (!items.length) return '_sin botín_'
  return items.map(([clave, n]) => `${nombreItem(clave)} ×${n}`).join(', ')
}

/** Responde con el aviso de espera si la acción no está lista */
async function espera(sock, jid, msg, quien, accion) {
  const faltan = esperaRestante(quien, accion)
  if (!faltan) return false
  await sock.sendMessage(jid, {
    text: `⏳ *${accion}* en espera. Vuelve en *${tiempoLegible(faltan)}*.`,
    quoted: msg,
  })
  return true
}

/** Bloque de nivel subido, o cadena vacía */
function bloqueNivel(subida) {
  if (!subida?.subio) return ''
  return `\n\n🎉 *¡Subiste al nivel ${subida.nivel}!* +10 HP máx, +2 ataque, +1 defensa.`
}

export default async ({ sock, jid, msg, args, sender, BOT_NAME }) => {
  const accion = String(args?.[0] || '').toLowerCase()
  const resto = (args || []).slice(1)
  const quien = sender || msg.key.participant || jid
  const responder = (texto) => sock.sendMessage(jid, { text: texto, quoted: msg })

  // ── Ficha ──
  if (!accion || ['perfil', 'ficha', 'status', 'stats'].includes(accion)) {
    const f = fichaRpg(quien)
    const eco = obtenerEconomia(quien)
    const inv = listarInventario(quien)
    return responder(
      `⚔️ *${f.claseEmoji} ${f.clase}* — nivel ${f.nivel}\n\n` +
        `▸ *HP:* ${f.hp}/${f.hp_max}\n` +
        `▸ *Ataque:* ${f.ataque}\n` +
        `▸ *Defensa:* ${f.defensa}\n` +
        `▸ *XP:* ${f.xp}/${f.nivel * 100}\n` +
        `▸ *Oro:* ${eco.monedas}\n` +
        `▸ *Mochila:* ${inv.length ? inv.map((i) => `${ITEMS[i.item]?.emoji || '▫️'}${i.cantidad}`).join(' ') : 'vacía'}\n\n` +
        `_Cambia de clase con_ \`/rpg clase mago\``
    )
  }

  if (['help', 'ayuda'].includes(accion)) return responder(AYUDA)

  // ── Clase ──
  if (accion === 'clase' || accion === 'class') {
    const pedida = String(resto[0] || '').toLowerCase()
    if (!pedida) {
      return responder(
        '⚔️ *Clases*\n\n' +
          Object.entries(CLASES)
            .map(([k, v]) => `• \`${k}\` — ${v.emoji} atq ${v.ataque} · def ${v.defensa} · ${v.hp} HP`)
            .join('\n') +
          '\n\n_Uso:_ `/rpg clase mago`'
      )
    }
    const clase = CLASES[pedida]
    if (!clase) return responder(`❌ No existe la clase \`${pedida}\`.`)
    guardarRpg(quien, {
      clase: pedida,
      ataque: clase.ataque,
      defensa: clase.defensa,
      hp_max: clase.hp,
      hp: clase.hp,
    })
    return responder(`${clase.emoji} *Ahora eres ${pedida}.* HP ${clase.hp}, ataque ${clase.ataque}, defensa ${clase.defensa}.`)
  }

  // ── Caza ──
  if (accion === 'hunt' || accion === 'cazar') {
    if (await espera(sock, jid, msg, quien, 'hunt')) return
    marcarAccion(quien, 'hunt')
    const presa = elegir([
      ['jabalí', 30, 60, 'carne'],
      ['lobo', 40, 80, 'piel'],
      ['ciervo', 35, 70, 'carne'],
      ['oso', 70, 120, 'piel'],
    ])
    const [nombre, min, max, drop] = presa
    const oro = azar(min, max)
    sumarMonedas(quien, oro, 'rpg', `caza ${nombre}`)
    const items = []
    if (Math.random() < 0.65) {
      const n = azar(1, 2)
      darItem(quien, drop, n)
      items.push([drop, n])
    }
    const xp = ganarXp(quien, azar(8, 16))
    return responder(
      `🏹 *Cacería:* ${nombre}\n\n` +
        `▸ Oro: *+${oro}*\n` +
        `▸ Botín: ${botin(items)}\n` +
        `▸ XP: +${azar(8, 16)}${bloqueNivel(xp)}`
    )
  }

  // ── Minería ──
  if (accion === 'mine' || accion === 'minar') {
    if (await espera(sock, jid, msg, quien, 'mine')) return
    marcarAccion(quien, 'mine')
    const oro = azar(45, 95)
    sumarMonedas(quien, oro, 'rpg', 'minería')
    const items = []
    const n = azar(1, 3)
    darItem(quien, 'mineral', n)
    items.push(['mineral', n])
    if (Math.random() < 0.12) {
      darItem(quien, 'gema', 1)
      items.push(['gema', 1])
    }
    const subida = ganarXp(quien, azar(10, 18))
    return responder(
      `⛏️ *Minería*\n\n` +
        `▸ Oro: *+${oro}*\n` +
        `▸ Botín: ${botin(items)}${bloqueNivel(subida)}`
    )
  }

  // ── Pesca ──
  if (accion === 'fish' || accion === 'pescar') {
    if (await espera(sock, jid, msg, quien, 'fish')) return
    marcarAccion(quien, 'fish')
    const oro = azar(20, 55)
    sumarMonedas(quien, oro, 'rpg', 'pesca')
    const items = []
    const n = azar(1, 3)
    darItem(quien, 'pescado', n)
    items.push(['pescado', n])
    if (Math.random() < 0.08) {
      darItem(quien, 'perla', 1)
      items.push(['perla', 1])
    }
    const subida = ganarXp(quien, azar(6, 14))
    return responder(
      `🎣 *Pesca*\n\n` +
        `▸ Oro: *+${oro}*\n` +
        `▸ Botín: ${botin(items)}${bloqueNivel(subida)}`
    )
  }

  // ── Aventura ──
  if (accion === 'adventure' || accion === 'aventura') {
    if (await espera(sock, jid, msg, quien, 'adventure')) return
    marcarAccion(quien, 'adventure')
    const f = fichaRpg(quien)
    const peligro = azar(5, 25)
    const danio = Math.max(0, peligro - Math.floor(f.defensa / 2))
    const hp = recibirDanio(quien, danio)
    const oro = azar(90, 200)
    sumarMonedas(quien, oro, 'rpg', 'aventura')
    const items = []
    if (Math.random() < 0.25) {
      darItem(quien, 'reliquia', 1)
      items.push(['reliquia', 1])
    }
    const subida = ganarXp(quien, azar(20, 35))
    return responder(
      `🗺️ *Aventura*\n\n` +
        `▸ Oro: *+${oro}*\n` +
        `▸ Daño recibido: *-${danio} HP* (quedas en ${hp})\n` +
        `▸ Botín: ${botin(items)}${bloqueNivel(subida)}` +
        (hp <= 0 ? '\n\n💀 *Caíste.* Usa `/heal` para volver a levantarte.' : '')
    )
  }

  // ── Mazmorra ──
  if (accion === 'dungeon' || accion === 'mazmorra') {
    if (await espera(sock, jid, msg, quien, 'dungeon')) return
    marcarAccion(quien, 'dungeon')
    const f = fichaRpg(quien)
    const piso = azar(1, 5)
    let hp = Number(f.hp)
    let log = []
    let oro = 0
    for (let i = 1; i <= piso; i += 1) {
      const enemigo = elegir(['goblin', 'esqueleto', 'lobo sombrío', 'gólem'])
      const golpe = Math.max(0, azar(8, 22) - Math.floor(f.defensa / 3))
      hp = Math.max(0, hp - golpe)
      oro += azar(30, 70)
      log.push(`▸ Piso ${i}: ${enemigo} — *-${golpe} HP*`)
      if (hp <= 0) break
    }
    guardarRpg(quien, { hp })
    if (oro) sumarMonedas(quien, oro, 'rpg', 'mazmorra')
    const items = []
    if (hp > 0 && Math.random() < 0.35) {
      darItem(quien, 'gema', 1)
      items.push(['gema', 1])
    }
    const subida = hp > 0 ? ganarXp(quien, azar(30, 50)) : { subio: 0 }
    return responder(
      `🏰 *Mazmorra* — ${piso} pisos\n\n` +
        `${log.join('\n')}\n\n` +
        (hp > 0
          ? `✅ *Sobreviviste.* Oro *+${oro}*${items.length ? ` · ${botin(items)}` : ''}\n▸ HP: ${hp}/${f.hp_max}`
          : `💀 *Caíste en el piso ${log.length}.* Oro recuperado: *+${oro}*`) +
        bloqueNivel(subida)
    )
  }

  // ── Cofre por hora ──
  if (accion === 'cofre' || accion === 'chest') {
    const caja = revisarCaja(quien, 'cofre', ESPERAS.cofre)
    if (!caja.listo) {
      return responder(`🧰 *El cofre está cerrado.* Abre en *${caja.texto}*.`)
    }
    marcarCofre(quien, 'cofre')
    const oro = azar(120, 260)
    sumarMonedas(quien, oro, 'rpg', 'cofre')
    const items = []
    if (Math.random() < 0.5) {
      const drop = elegir(['pocion', 'vendaje', 'mineral', 'pescado'])
      darItem(quien, drop, 1)
      items.push([drop, 1])
    }
    const subida = ganarXp(quien, 15)
    return responder(
      `🧰 *Cofre abierto*\n\n` +
        `▸ Oro: *+${oro}*\n` +
        `▸ Botín: ${botin(items)}${bloqueNivel(subida)}`
    )
  }

  // ── Curación ──
  if (accion === 'heal' || accion === 'curar') {
    const f = fichaRpg(quien)
    if (f.hp >= f.hp_max) return responder('❤️ Ya estás a tope de vida.')
    const pedido = String(resto[0] || '').toLowerCase()

    // Cura el item pedido o el mejor disponible
    const orden = pedido && ITEMS[pedido]?.cura ? [pedido] : ['pocion', 'vendaje']
    let curado = 0
    let usado = null
    for (const item of orden) {
      if (!cantidadDeItem(quien, item)) continue
      if (!quitarItem(quien, item, 1)) continue
      curado = curar(quien, ITEMS[item].cura)
      usado = item
      break
    }

    if (!usado) {
      return responder(
        `🩹 No te queda nada que curar.\n\n` +
          `_Compra con_ \`/shop comprar pocion\` _(40 de oro, cura 40)._\n` +
          `_O espera a que se regenere._`
      )
    }

    const ahora = fichaRpg(quien)
    return responder(
      `🩹 *${nombreItem(usado)} usado.*\n\n` +
        `▸ Curación: *+${curado} HP*\n` +
        `▸ Vida: ${ahora.hp}/${ahora.hp_max}`
    )
  }

  // ── Ritual ──
  if (accion === 'ritual') {
    if (await espera(sock, jid, msg, quien, 'ritual')) return
    const costo = 60
    if (!restarMonedas(quien, costo, 'rpg', 'ritual')) {
      return responder(`🔮 El ritual cuesta *${costo}* de oro y no te alcanza.`)
    }
    marcarAccion(quien, 'ritual')
    const exito = Math.random() < 0.55
    const subida = exito ? ganarXp(quien, azar(40, 80)) : { subio: 0 }
    if (!exito) {
      const f = fichaRpg(quien)
      const danio = azar(10, 25)
      const hp = recibirDanio(quien, danio)
      return responder(
        `🔮 *El ritual falló.*\n\n` +
          `▸ Ofrenda perdida: -${costo} oro\n` +
          `▸ Castigo: *-${danio} HP* (quedas en ${hp}/${f.hp_max})`
      )
    }
    const oro = azar(200, 400)
    sumarMonedas(quien, oro, 'rpg', 'ritual')
    darItem(quien, 'reliquia', 1)
    return responder(
      `🔮 *El ritual prosperó.*\n\n` +
        `▸ Oro: *+${oro}*\n` +
        `▸ Botín: ${nombreItem('reliquia')} ×1${bloqueNivel(subida)}`
    )
  }

  // ── Tienda ──
  if (accion === 'shop' || accion === 'tienda') {
    const modo = String(resto[0] || '').toLowerCase()

    if (modo === 'comprar' || modo === 'buy') {
      const clave = String(resto[1] || '').toLowerCase()
      const it = ITEMS[clave]
      if (!it) return responder(`❌ No vendo \`${clave || 'nada'}\`. Mira \`/shop\`.`)
      if (!restarMonedas(quien, it.precio, 'rpg', `compra ${clave}`)) {
        return responder(`💸 *${it.nombre}* cuesta *${it.precio}* y no te alcanza.`)
      }
      darItem(quien, clave, 1)
      return responder(`🛒 Compraste ${nombreItem(clave)} por *${it.precio}* de oro.`)
    }

    if (modo === 'vender' || modo === 'sell') {
      const clave = String(resto[1] || '').toLowerCase()
      const it = ITEMS[clave]
      if (!it) return responder(`❌ No hay \`${clave || 'nada'}\` en la lista.`)
      if (!quitarItem(quien, clave, 1)) return responder(`❌ No tienes ${nombreItem(clave)}.`)
      const ganancia = Math.floor(it.precio * 0.6)
      sumarMonedas(quien, ganancia, 'rpg', `venta ${clave}`)
      return responder(`💱 Vendiste ${nombreItem(clave)} por *${ganancia}* de oro.`)
    }

    const catalogo = Object.entries(ITEMS)
      .map(([k, v]) => {
        const extra = v.cura ? ` · cura ${v.cura}` : v.ataque ? ` · atq +${v.ataque}` : v.defensa ? ` · def +${v.defensa}` : ''
        return `• ${v.emoji} \`${k}\` — ${v.precio} oro${extra}`
      })
      .join('\n')
    return responder(
      `🛒 *Tienda del RPG*\n\n${catalogo}\n\n` +
        `_Compra:_ \`/shop comprar pocion\`\n_Vende:_ \`/shop vender mineral\` _(60% del precio)_`
    )
  }

  // ── Mochila ──
  if (accion === 'inventory' || accion === 'inventario' || accion === 'inv') {
    const inv = listarInventario(quien)
    if (!inv.length) {
      return responder('🎒 *Mochila vacía.*\n\n_Sal a_ `/hunt`_,_ `/mine` _o_ `/fish` _para llenarla._')
    }
    const lineas = inv.map((i) => `• ${nombreItem(i.item)} ×${i.cantidad}`).join('\n')
    return responder(`🎒 *Mochila*\n\n${lineas}`)
  }

  // ── Equipo ──
  if (accion === 'equip' || accion === 'equipar') {
    const clave = String(resto[0] || '').toLowerCase()
    const it = ITEMS[clave]
    if (!it) return responder('❌ Uso: `/equip espada` (espada, hacha, armadura o escudo).')
    if (!it.ataque && !it.defensa) {
      return responder(`❌ ${nombreItem(clave)} no se equipa.`)
    }
    if (!cantidadDeItem(quien, clave)) {
      return responder(`❌ No tienes ${nombreItem(clave)}. _Cómpralo en_ \`/shop\`.`)
    }
    const f = fichaRpg(quien)
    return responder(
      `✅ *${nombreItem(clave)} equipado.*\n\n` +
        `▸ Ataque: ${f.ataque}\n` +
        `▸ Defensa: ${f.defensa}\n\n` +
        `_El equipo puesto se aplica solo mientras lo tengas en la mochila._`
    )
  }

  return responder(`❓ No conozco \`${accion}\`.\n\n${AYUDA}`)
}
