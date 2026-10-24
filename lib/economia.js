/**
 * Utilidades del sistema de economía.
 */
import { db, ultimoUso } from '../database/db.js'

/** Segundos transcurridos desde una fecha local 'YYYY-MM-DD HH:MM:SS' */
export function segundosDesde(fecha) {
  if (!fecha) return Infinity
  const t = new Date(String(fecha).replace(' ', 'T')).getTime()
  if (Number.isNaN(t)) return Infinity
  return (Date.now() - t) / 1000
}

/** Formatea segundos como "1h 2m 3s" */
export function formatearTiempo(segundos) {
  const s = Math.max(0, Math.floor(Number(segundos) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const seg = s % 60
  const partes = []
  if (h) partes.push(`${h}h`)
  if (m) partes.push(`${m}m`)
  if (seg || !partes.length) partes.push(`${seg}s`)
  return partes.join(' ')
}

/** Barra de progreso del nivel actual */
export function barraNivel(nivel, experiencia, xpPorNivel = 250) {
  const base = (nivel - 1) * xpPorNivel
  const actual = Math.max(0, experiencia - base)
  const progreso = Math.min(1, actual / xpPorNivel)
  const llenos = Math.round(progreso * 10)
  return `${'█'.repeat(llenos)}${'░'.repeat(10 - llenos)} ${actual}/${xpPorNivel} XP`
}

/** Nombre legible de un usuario (usa la tabla de usuarios) */
export function nombreLegible(jid, obtenerUsuario) {
  if (!jid) return 'Desconocido'
  try {
    const usuario = obtenerUsuario?.(jid)
    if (usuario?.nombre) return usuario.nombre
  } catch {
    // sin nombre registrado
  }
  return String(jid).split('@')[0]
}

/** Formatea un número con separadores de miles */
export function formatearNumero(n) {
  return Number(n || 0).toLocaleString('es-ES')
}

// ───────────── Recargas anti-spam ─────────────

/**
 * Tiempos de recarga anti-spam por comando (en segundos).
 * Cada comando que genera dinero, riesgo o carga al chat tiene el suyo.
 */
export const RECARGAS = {
  // ── /economy ──
  daily: 24 * 60 * 60, // recompensa diaria
  work: 5 * 60, // trabajar
  rob: 30 * 60, // robar
  pay: 30, // enviar oro
  bal: 5, // consultar saldo
  rank: 10, // tabla de posiciones
  // ── /casino ──
  slots: 20, // tragamonedas
  coinflip: 15, // cara o cruz
  bet: 15, // doble o nada
  // bonuses del lote Neko
  deposit: 8, // guardar en el banco
  withdraw: 8, // retirar del banco
  crime: 30, // crimen (botin o multa)
  roulette: 15, // ruleta del casino
  topcount: 10, // top de mensajes del grupo
  // ── stickers de interacciones ──
  interaccion: 8, // converter GIF -> sticker animado con ffmpeg
  // ── NSFW ──
  nsfw: 10, // descarga de imagen de los boorus
  'nsfw-accion': 8, // acciones NSFW con mencion (frase + imagen)
  // ── Waifus y gacha de anime: recarga de 20 minutos ──
  claim: 20 * 60, // reclamar personaje (manda carta con imagen)
  roll: 20 * 60, // waifu/husbando aleatorio
  wimage: 20 * 60, // imagen suelta de un personaje
  wvideo: 20 * 60, // video suelto de un personaje
  give: 20 * 60, // regalar un personaje
  giveall: 20 * 60, // regalar toda la coleccion
  trade: 20 * 60, // intercambio de personajes
  sell: 20 * 60, // poner en venta
  buy: 20 * 60, // comprar un personaje en venta
  vote: 20 * 60, // votar (sube el valor del personaje)
  removesale: 20 * 60, // quitar de la venta
  wtop: 60, // top de personajes por valor (1 minuto)
  favtop: 20 * 60, // top de favoritos
  serieinfo: 20 * 60, // ficha de un anime
  serielist: 20 * 60, // lista de series
  // ── Tirada del gacha (/gacha) ──
  groll: 20 * 60, // tirada del gacha
  glist: 20 * 60, // coleccion propia
  gtop: 20 * 60, // top de personajes raros
  gstats: 20 * 60, // estadisticas propias
  gficha: 20 * 60, // ficha de un personaje por nombre
  // ── VIP: reclamos con cooldown mensual (30 días) ──
  vip_claim: 30 * 24 * 60 * 60, // /waifu claim (VIP, 1 vez al mes)
  vip_waifuclaim: 30 * 24 * 60 * 60, // .waifuclaim (VIP, 1 vez al mes)
  vip_gachaclaim: 30 * 24 * 60 * 60, // .gachaclaim (VIP, 1 vez al mes)
  // ── VIP boost ──
  vip_boost: 7 * 24 * 60 * 60, // .vipboost semanal
}

/** Mensaje de espera activa por comando (con sabor de Beerus) */
const FRASES_RECARGA = {
  daily: '⏳ Ya cobraste la recompensa de hoy.',
  work: '⏳ Cansado de tanto trabajar.',
  rob: '⏳ La policía te tiene vigilado.',
  pay: '⏳ La ventanilla sigue procesando tu último envío.',
  bal: '⏳ El cajero cuenta tus oro... usa /bal otra vez en un rato.',
  rank: '⏳ La tabla de posiciones respira un momento.',
  slots: '⏳ La máquina recarga su suerte.',
  coinflip: '⏳ Aún estás recogiendo la moneda del aire.',
  bet: '⏳ La banca necesita descansar entre rondas.',
  deposit: '⏳ El banco aún guarda tu último depósito.',
  withdraw: '⏳ La bóveda se está cerrando.',
  crime: '⏳ El bajo mundo aún te vigila.',
  roulette: '⏳ La ruleta aún gira.',
  topcount: '⏳ El contador respira un momento.',
  interaccion: '⏳ El taller de stickers está ocupado con el anterior.',
  // ── NSFW ──
  nsfw: '⏳ Los boorus se toman un respiro.',
  'nsfw-accion': '⏳ La escena NSFW necesita una pausa.',
  // ── Waifus y gacha ──
  claim: '⏳ Tu alma espera antes de reclamar otra vez.',
  roll: '⏳ El gacha recarga su energía.',
  wimage: '⏳ La galería de imágenes descansa.',
  wvideo: '⏳ El reproductor se enfría.',
  give: '⏳ La generosidad también cansa.',
  giveall: '⏳ Tu colección necesita ordenarse primero.',
  trade: '⏳ El intercambio toma su tiempo.',
  sell: '⏳ El mercado se estabiliza.',
  buy: '⏳ La compra aún se procesa.',
  vote: '⏳ Tu voto ya fue contado. Paciencia.',
  removesale: '⏳ La retirada de venta tarda un momento.',
  wtop: '⏳ El ranking de personajes se recalcula.',
  favtop: '⏳ Los favoritos se están conteando.',
  serieinfo: '⏳ La ficha del anime carga.',
  serielist: '⏳ La lista de series se refresca.',
  groll: '⏳ El gacha recarga su suerte.',
  glist: '⏳ Tu colección se está ordenando.',
  gtop: '⏳ El top del gacha se actualiza.',
  gstats: '⏳ Tus estadísticas se calculan.',
  gficha: '⏳ La ficha del personaje carga.',
  // ── VIP ──
  vip_claim: '👑 Aún no pasa un mes desde tu último claim VIP.',
  vip_waifuclaim: '👑 Aún no pasa un mes desde tu último .waifuclaim.',
  vip_gachaclaim: '👑 Aún no pasa un mes desde tu último .gachaclaim.',
  vip_boost: '👑 Tu boost VIP semanal ya fue usado.',
}

/** Tiempo restante de recarga en segundos */
export function recargaRestante(segundosPasados, comando) {
  const total = RECARGAS[comando] ?? 0
  if (!total || !Number.isFinite(segundosPasados)) return 0
  return Math.max(0, total - segundosPasados)
}

/** Texto de aviso cuando un comando sigue en recarga */
export function avisoRecarga(comando, faltan) {
  const frase = FRASES_RECARGA[comando] ?? '⏳ Ese comando esta en recarga.'
  return `${frase} Vuelve en *${formatearTiempo(faltan)}*.`
}

/**
 * Mensaje de recarga activa para un usuario y comando ('' = puede usarlo).
 *
 * @param {string} quien jid del usuario
 * @param {string} comando clave de RECARGAS
 * @param {string|null} desdeLegado fecha extra de la era vieja (columnas
 *   ultimo_diario/ultimo_trabajo/ultimo_robo), para no regalar recargas
 */
export function recargaActiva(quien, comando, desdeLegado = null) {
  const candidatos = [segundosDesde(ultimoUso(quien, comando))]
  if (desdeLegado) candidatos.push(segundosDesde(desdeLegado))
  const masReciente = Math.min(...candidatos)
  const faltan = recargaRestante(masReciente, comando)
  return faltan ? avisoRecarga(comando, faltan) : ''
}

// Reexportar marcarUso (definido en database/db.js) para no duplicar lógica
export { marcarUso } from '../database/db.js'
