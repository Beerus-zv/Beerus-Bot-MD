/**
 * Motor del RPG de economía: caza, minería, pesca, aventura, mazmorra,
 * cofres, curación y rituales.
 *
 * Todo se apoya en lo que ya existe:
 *   - `economia` (sumarMonedas/restarMonedas) para el oro
 *   - `rpg_perfil` para hp, nivel, ataque y defensa
 *   - `rpg_inventario` para los items
 *   - `rpg_cofres` para los tiempos de espera de cada caja
 *
 * Los cooldowns son de reloj: cada acción guarda su marca en `rpg_cofres`
 * con el nombre de la acción, así no hace falta una tabla por comando.
 */
import {
  obtenerRpg,
  guardarRpg,
  darItem,
  quitarItem,
  cantidadDeItem,
  listarInventario,
  ultimoCofre,
  marcarCofre,
  obtenerEconomia,
  sumarMonedas,
  restarMonedas,
} from '../database/db.js'

/** Items que se pueden vender, usar o equipar */
export const ITEMS = {
  pocion: { nombre: 'Poción', precio: 40, cura: 40, emoji: '🧪' },
  vendaje: { nombre: 'Vendaje', precio: 15, cura: 15, emoji: '🩹' },
  carne: { nombre: 'Carne', precio: 12, emoji: '🥩' },
  piel: { nombre: 'Piel', precio: 18, emoji: '🧶' },
  mineral: { nombre: 'Mineral', precio: 25, emoji: '🪨' },
  gema: { nombre: 'Gema', precio: 90, emoji: '💎' },
  pescado: { nombre: 'Pescado', precio: 14, emoji: '🐟' },
  perla: { nombre: 'Perla', precio: 70, emoji: '🦪' },
  reliquia: { nombre: 'Reliquia', precio: 150, emoji: '🏺' },
  // Equipo: sube ataque o defensa mientras esté puesto
  espada: { nombre: 'Espada', precio: 220, ataque: 8, emoji: '🗡️' },
  hacha: { nombre: 'Hacha', precio: 300, ataque: 13, emoji: '🪓' },
  armadura: { nombre: 'Armadura', precio: 260, defensa: 8, emoji: '🛡️' },
  escudo: { nombre: 'Escudo', precio: 340, defensa: 13, emoji: '🛡️' },
}

/** Cooldowns en segundos por acción */
export const ESPERAS = {
  hunt: 90,
  mine: 120,
  fish: 90,
  adventure: 180,
  dungeon: 300,
  ritual: 600,
  cofre: 3600,
}

/** Nombres legibles de las clases */
export const CLASES = {
  guerrero: { ataque: 12, defensa: 8, hp: 110, emoji: '⚔️' },
  mago: { ataque: 15, defensa: 5, hp: 90, emoji: '🔮' },
  arquero: { ataque: 13, defensa: 6, hp: 100, emoji: '🏹' },
  tanque: { ataque: 8, defensa: 14, hp: 140, emoji: '🛡️' },
}

/** Entero entre min y max (incluidos) */
export function azar(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** Elige un elemento al azar */
export function elegir(lista) {
  return lista[Math.floor(Math.random() * lista.length)]
}

/** Segundos que faltan para poder repetir una acción (0 = libre) */
export function esperaRestante(jid, accion) {
  const ultimo = ultimoCofre(jid, `cd:${accion}`)
  if (!ultimo) return 0
  const pasado = (Date.now() - new Date(String(ultimo).replace(' ', 'T')).getTime()) / 1000
  if (!Number.isFinite(pasado)) return 0
  return Math.max(0, ESPERAS[accion] - pasado)
}

/** Marca la acción como hecha ahora */
export function marcarAccion(jid, accion) {
  marcarCofre(jid, `cd:${accion}`)
}

/** "2m 15s" */
export function tiempoLegible(segundos) {
  const s = Math.ceil(segundos)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

/** Ataque total con el equipo puesto */
export function ataqueTotal(perfil, jid) {
  let total = Number(perfil?.ataque) || 10
  if (cantidadDeItem(jid, 'espada')) total += ITEMS.espada.ataque
  if (cantidadDeItem(jid, 'hacha')) total += ITEMS.hacha.ataque
  return total
}

/** Defensa total con el equipo puesto */
export function defensaTotal(perfil, jid) {
  let total = Number(perfil?.defensa) || 5
  if (cantidadDeItem(jid, 'armadura')) total += ITEMS.armadura.defensa
  if (cantidadDeItem(jid, 'escudo')) total += ITEMS.escudo.defensa
  return total
}

/** Aplica daño al perfil; devuelve el hp resultante */
export function recibirDanio(jid, danio) {
  const perfil = obtenerRpg(jid)
  const hp = Math.max(0, Number(perfil.hp) - Math.max(0, Math.trunc(danio)))
  guardarRpg(jid, { hp })
  return hp
}

/** Cura hasta el máximo; devuelve cuanto curó de verdad */
export function curar(jid, cantidad) {
  const perfil = obtenerRpg(jid)
  const maximo = Number(perfil.hp_max) || 100
  const hp = Math.min(maximo, Number(perfil.hp) + Math.max(0, Math.trunc(cantidad)))
  const curado = hp - Number(perfil.hp)
  guardarRpg(jid, { hp })
  return curado
}

/** Sube de nivel si la xp pasa el umbral (100 * nivel) */
export function revisarNivel(jid) {
  const perfil = obtenerRpg(jid)
  let { nivel, xp, ataque, defensa, hp_max, hp } = perfil
  let subio = 0
  while (xp >= nivel * 100) {
    xp -= nivel * 100
    nivel += 1
    ataque += 2
    defensa += 1
    hp_max += 10
    hp = hp_max
    subio += 1
  }
  if (subio) guardarRpg(jid, { nivel, xp, ataque, defensa, hp_max, hp })
  return { subio, nivel, xp }
}

/** Suma xp y devuelve el resultado de la subida */
export function ganarXp(jid, cantidad) {
  const perfil = obtenerRpg(jid)
  guardarRpg(jid, { xp: Number(perfil.xp) + Math.max(0, Math.trunc(cantidad)) })
  return revisarNivel(jid)
}

/** Perfil listo para mostrar, con el equipo aplicado */
export function fichaRpg(jid) {
  const perfil = obtenerRpg(jid)
  return {
    ...perfil,
    ataque: ataqueTotal(perfil, jid),
    defensa: defensaTotal(perfil, jid),
    claseEmoji: CLASES[perfil.clase]?.emoji || '⚔️',
  }
}

/**
 * Caja con espera. Devuelve null si aún no toca y el texto de espera.
 * @returns {{listo:boolean, texto?:string}}
 */
export function revisarCaja(jid, caja, segundos) {
  const ultimo = ultimoCofre(jid, caja)
  if (!ultimo) return { listo: true }
  const pasado = (Date.now() - new Date(String(ultimo).replace(' ', 'T')).getTime()) / 1000
  const faltan = segundos - pasado
  if (!Number.isFinite(pasado) || faltan <= 0) return { listo: true }
  return { listo: false, texto: tiempoLegible(faltan) }
}

export { listarInventario, cantidadDeItem, darItem, quitarItem, obtenerEconomia, sumarMonedas, restarMonedas }
