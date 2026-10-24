import { RAREZAS, ORDEN_RAREZAS } from '../database/catalogo.js'
import { listarPersonajesGacha, registrarRollGacha, statsGacha, estadoPersonaje, ventaDePersonajeActiva } from '../database/db.js'

export { RAREZAS, ORDEN_RAREZAS }

/** Umbral de tiradas sin rareza alta para activar el pity */
export const PITY_MAXIMO = 50

/**
 * Peso de una rareza en el sorteo.
 * Con el pity alto solo salen rarezas medias o altas.
 */
function pesoRareza(rareza, pity) {
  if (pity < PITY_MAXIMO) return RAREZAS[rareza]?.peso ?? 1
  if (rareza === 'comun') return 0
  if (rareza === 'raro') return 50
  if (rareza === 'epico') return 30
  if (rareza === 'legendario') return 15
  return 5
}

/** Elige una rareza según los pesos disponibles */
export function elegirRareza(pity = 0, disponibles = Object.keys(RAREZAS)) {
  const lista = disponibles.length ? disponibles : Object.keys(RAREZAS)
  const total = lista.reduce((acc, r) => acc + pesoRareza(r, pity), 0)
  if (total <= 0) return lista[0] || 'comun'
  let n = Math.random() * total
  for (const rareza of lista) {
    n -= pesoRareza(rareza, pity)
    if (n <= 0) return rareza
  }
  return lista[0]
}

/**
 * Sortea un personaje del catálogo respetando los pesos de rareza.
 * @param {object} opts
 * @param {Array}  opts.personajes  lista opcional de candidatos
 * @param {number} opts.pity        tiradas acumuladas sin rareza alta
 */
export function elegirPersonaje({ personajes = null, pity = 0 } = {}) {
  const lista = personajes?.length ? personajes : listarPersonajesGacha()
  if (!lista.length) return null

  const porRareza = new Map()
  for (const p of lista) {
    if (!porRareza.has(p.rareza)) porRareza.set(p.rareza, [])
    porRareza.get(p.rareza).push(p)
  }

  const disponibles = [...porRareza.keys()]
  const rareza = elegirRareza(pity, disponibles)
  const candidatos = porRareza.get(rareza) || []

  if (!candidatos.length) {
    // La rareza sorteada no tiene personajes: se usa cualquiera disponible
    return lista[Math.floor(Math.random() * lista.length)]
  }

  return candidatos[Math.floor(Math.random() * candidatos.length)]
}

/** Sortea y registra la tirada en las estadísticas del usuario */
export function sortearPersonaje(jid, { personajes = null } = {}) {
  const actual = statsGacha(jid)
  const personaje = elegirPersonaje({ personajes, pity: actual.pity })
  if (!personaje) return null
  const nuevos = registrarRollGacha(jid, personaje.rareza)
  return { personaje, rolls: nuevos.rolls, pity: nuevos.pity }
}

/** Emoji y etiqueta de una rareza */
export function datosRareza(rareza) {
  return RAREZAS[rareza] || RAREZAS.comun
}

/** Compara dos rarezas: 1 si a > b, -1 si a < b, 0 si iguales */
export function compararRarezas(a, b) {
  const ia = ORDEN_RAREZAS.indexOf(a)
  const ib = ORDEN_RAREZAS.indexOf(b)
  if (ia === -1 || ib === -1) return 0
  return ia < ib ? 1 : ia > ib ? -1 : 0
}

/**
 * Estado visible de un personaje para la ficha.
 * Prioridad: en venta > reclamado por mi > reclamado por otro > libre.
 * @param {number}  id            id del personaje
 * @param {string}  yo            jid del usuario que consulta
 * @param {Function} resolverNombre  (jid) => nombre legible
 */
export function estadoVisible(id, { yo = null, resolverNombre = null } = {}) {
  const venta = ventaDePersonajeActiva(id)
  if (venta) return 'En venta'

  const { dueno } = estadoPersonaje(id)
  if (!dueno) return 'Libre'
  if (yo && dueno === yo) return 'En tu colección'

  const nombre = resolverNombre ? resolverNombre(dueno) : null
  return nombre ? `Reclamado por ${nombre}` : 'Reclamado'
}

/**
 * Calcula el estado visible de un personaje: Libre, Reclamado o En venta.
 * @param {object} personaje
 * @param {string} dueno  jid del usuario que lo reclamo (o null)
 */
export function calcularEstado(personaje, { dueno = null, enVenta = false } = {}) {
  if (enVenta) return 'En venta'
  if (!dueno) return 'Libre'
  return 'Reclamado'
}

/**
 * Formato de ficha estilo waifu-bot.
 * Devuelve las lineas con el separador » :
 *   Nombre » Gojo Satoru
 *   Genero » Hombre
 *   Valor » 1500
 *   Estado » Libre
 *   Fuente » Jujutsu Kaisen
 *
 * @param {object}  opts
 * @param {string}  opts.estado  'Libre' | 'Reclamado' | 'En venta' | 'En tu colección'
 * @param {number}  opts.valor   valor override (por defecto el del personaje)
 * @param {boolean} opts.nuevo   marca como personaje nuevo
 * @param {number}  opts.premio  oro ganados en la tirada
 */
export function formatearFicha(personaje, { estado = 'Libre', valor = null, nuevo = false, premio = 0 } = {}) {
  const genero = String(personaje.genero || 'X').toUpperCase()
  const etiquetaGenero = genero === 'F' ? 'Mujer' : genero === 'M' ? 'Hombre' : 'Desconocido'
  const simbolo = genero === 'F' ? '♀️' : genero === 'M' ? '♂️' : '⚧'

  const lineas = [
    `✦ *Nombre* » ${personaje.nombre}`,
    `${simbolo} *Género* » ${etiquetaGenero}`,
    `⚔️ *Valor* » ${valor ?? personaje.valor ?? 0}`,
    `♡ *Estado* » ${estado}`,
    `🎬 *Fuente* » ${personaje.anime || 'Desconocida'}`,
  ]

  if (nuevo) lineas.push('', '🆕 *¡Nuevo personaje desbloqueado!*')
  if (premio) lineas.push('', `🪙 *Ganaste ${premio} oro*`)

  return lineas.join('\n')
}

/** Texto de la carta del personaje */
export function formatearCarta(personaje, { nuevo = true, valorGanado = 0 } = {}) {
  const r = datosRareza(personaje.rareza)
  const lineas = [
    `${r.emoji} *${personaje.nombre}*`,
    `🎬 ${personaje.anime || 'Anime desconocido'}`,
    `💎 Rareza: *${r.etiqueta}*`,
    `💰 Valor: *${personaje.valor ?? r.valor}* oro`,
  ]
  if (nuevo) lineas.push('🆕 ¡Personaje nuevo desbloqueado!')
  if (valorGanado) lineas.push(`🪙 Ganaste *${valorGanado}* oro`)
  return lineas.join('\n')
}

/** Resumen del inventario agrupado por rareza */
export function resumirInventario(inventario) {
  const resumen = {}
  for (const item of inventario) {
    resumen[item.rareza] = (resumen[item.rareza] || 0) + item.cantidad
  }
  return ORDEN_RAREZAS.filter((r) => resumen[r]).map((r) => ({
    rareza: r,
    etiqueta: datosRareza(r).etiqueta,
    emoji: datosRareza(r).emoji,
    cantidad: resumen[r],
  }))
}
