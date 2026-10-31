import { RAREZAS, ORDEN_RAREZAS } from '../database/catalogo.js'
import { listarPersonajesGacha, registrarRollGacha, statsGacha, estadoPersonaje, ventaDePersonajeActiva } from '../database/db.js'

export { RAREZAS, ORDEN_RAREZAS }

/**
 * Pity, como en un gacha real: la mala racha tiene tope.
 *
 * Hay dos contadores, igual que en los gacha de verdad, porque un solo
 * contador deja una de las dos colas sin proteger:
 *
 *   PITY_MEDIO_DURO — tiradas seguidas sin epico o mejor. Al llegar, la
 *     tirada sale epico o mejor si o si (la "garantia de 4 estrellas").
 *   PITY_SUAVE / PITY_DURO — tiradas seguidas sin legendario ni mitico.
 *     Desde PITY_SUAVE la probabilidad de las dos altas sube de forma
 *     lineal, y en PITY_DURO la tirada sale legendario o mitico si o si
 *     (la "garantia de 5 estrellas").
 *
 * Los contadores viven en `gacha_stats` y los reinicia el resultado que
 * corresponde a cada uno: epico+ para el medio, legendario+ para el alto.
 */
export const PITY_MEDIO_DURO = 10
export const PITY_SUAVE = 60
export const PITY_DURO = 90

/** Rarezas que reinician la garantia media (epico, legendario o mitico) */
const RAREZAS_MEDIAS = new Set(['epico', 'legendario', 'mitico'])
/** Rarezas que reinician la garantia alta (legendario o mitico) */
const RAREZAS_ALTAS = new Set(['legendario', 'mitico'])

/** true si la rareza reinicia la garantia media (epico, legendario o mitico) */
export function esRarezaAlta(rareza) {
  return RAREZAS_MEDIAS.has(rareza)
}

/** true si la rareza reinicia la garantia alta (legendario o mitico) */
export function esRarezaLegendaria(rareza) {
  return RAREZAS_ALTAS.has(rareza)
}

/**
 * Pesos del sorteo para un estado de garantias dado.
 *
 * Por debajo de los umbrales son los pesos base. La garantia media apaga
 * comun y raro; la alta, ademas, sustituye el sorteo por legendario/mitico.
 * Entre PITY_SUAVE y PITY_DURO las dos altas se multiplican de forma lineal
 * (hasta x61), asi la cola se acorta sin mover la tirada media.
 *
 * @param {{ pity?: number, pityAlto?: number }} estado contadores de garantia
 * @returns {Record<string, number>}
 */
function pesosConPity({ pity = 0, pityAlto = 0 } = {}) {
  const medio = Math.max(0, Math.trunc(Number(pity) || 0))
  const alto = Math.max(0, Math.trunc(Number(pityAlto) || 0))

  // `pity` cuenta fallos ya hechos, asi que la tirada numero N de la racha
  // llega con pity = N-1: la garantia dispara en la tirada que completa el
  // tope, no en la siguiente.
  if (alto >= PITY_DURO - 1) {
    return { comun: 0, raro: 0, epico: 0, legendario: 8500, mitico: 1500 }
  }

  const medioGarantizado = medio >= PITY_MEDIO_DURO - 1

  // t = 0 en PITY_SUAVE, t = 1 en la vispera de la garantia alta
  const t = alto < PITY_SUAVE ? 0 : Math.min(1, (alto - PITY_SUAVE + 1) / (PITY_DURO - PITY_SUAVE))
  const factorAlta = 1 + 60 * t
  const factorMedia = 1 + 5 * t

  const pesos = {}
  for (const [rareza, datos] of Object.entries(RAREZAS)) {
    const base = Number(datos?.peso) || 0
    if (rareza === 'comun' || rareza === 'raro') pesos[rareza] = medioGarantizado ? 0 : base
    else if (rareza === 'epico') pesos[rareza] = base * factorMedia
    else pesos[rareza] = base * factorAlta
  }
  return pesos
}

/**
 * Probabilidad real de cada rareza en una tirada, en porcentaje.
 * Sale del mismo motor que el sorteo, asi que la ayuda y las estadisticas
 * muestran los numeros de verdad en vez de una tabla copiada a mano.
 *
 * @param {{ pity?: number, pityAlto?: number }} estado contadores de garantia
 * @returns {Array<{ rareza: string, porcentaje: number }>}
 */
export function probabilidades(estado = {}) {
  const pesos = pesosConPity(estado)
  const lista = Object.keys(RAREZAS)
  const total = lista.reduce((acc, r) => acc + (pesos[r] || 0), 0)
  if (total <= 0) return []

  return lista.map((rareza) => ({
    rareza,
    porcentaje: ((pesos[rareza] || 0) / total) * 100,
  }))
}

/**
 * Elige una rareza segun los pesos disponibles.
 *
 * @param {{ pity?: number, pityAlto?: number, disponibles?: string[] }} [opciones]
 * @returns {string} clave de rareza
 */
export function elegirRareza({ pity = 0, pityAlto = 0, disponibles = Object.keys(RAREZAS) } = {}) {
  const lista = disponibles.length ? disponibles : Object.keys(RAREZAS)
  const pesos = pesosConPity({ pity, pityAlto })
  const total = lista.reduce((acc, r) => acc + (pesos[r] ?? 0), 0)

  // La garantia solo ofrece epico, legendario o mitico: si el catalogo no
  // tiene ninguna, se sortea con los pesos base para no devolver vacio.
  if (total <= 0) return elegirRareza({ disponibles: lista })

  let n = Math.random() * total
  for (const rareza of lista) {
    n -= pesos[rareza] ?? 0
    if (n <= 0) return rareza
  }
  return lista[0]
}

/**
 * Sortea un personaje del catálogo respetando los pesos de rareza.
 * @param {object} opts
 * @param {Array}  opts.personajes  lista opcional de candidatos
 * @param {number} opts.pity        tiradas sin epico o mejor
 * @param {number} opts.pityAlto    tiradas sin legendario ni mitico
 */
export function elegirPersonaje({ personajes = null, pity = 0, pityAlto = 0 } = {}) {
  const lista = personajes?.length ? personajes : listarPersonajesGacha()
  if (!lista.length) return null

  const porRareza = new Map()
  for (const p of lista) {
    if (!porRareza.has(p.rareza)) porRareza.set(p.rareza, [])
    porRareza.get(p.rareza).push(p)
  }

  const disponibles = [...porRareza.keys()]
  const rareza = elegirRareza({ pity, pityAlto, disponibles })
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
  const personaje = elegirPersonaje({
    personajes,
    pity: actual.pity,
    pityAlto: actual.pity_alto,
  })
  if (!personaje) return null
  const nuevos = registrarRollGacha(jid, personaje.rareza)
  return { personaje, rolls: nuevos.rolls, pity: nuevos.pity, pityAlto: nuevos.pity_alto }
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
