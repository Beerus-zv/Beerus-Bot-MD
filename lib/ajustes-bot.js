/**
 * Ajustes del bot editables en caliente (`/setbotname`, `/setbotprefix`, ...).
 *
 * Todo vive en la tabla `ajustes` (clave/valor) para sobrevivir reinicios, y
 * cada lectura cae al valor de config.js/tema.js cuando no hay nada guardado.
 * Asi el bot arranca igual que siempre hasta que el owner cambia algo.
 */
import { obtenerAjuste, guardarAjuste } from '../database/db.js'
import { BOT_NAME, PREFIXES } from '../config.js'
import { TEMA } from './tema.js'

/** Claves de la tabla `ajustes` usadas por la configuracion del bot */
export const CLAVES = {
  nombre: 'bot_nombre',
  owner: 'bot_owner',
  link: 'bot_link',
  moneda: 'bot_moneda',
  prefijos: 'bot_prefijos',
  banner: 'bot_banner',
  icono: 'bot_icono',
  username: 'bot_username',
  privado: 'bot_privado',
}

/** Valor guardado o el de fabrica; nunca devuelve cadena vacia si hay default */
function leer(clave, porDefecto) {
  const valor = obtenerAjuste(clave)
  if (valor === null || valor === undefined || valor === '') return porDefecto
  return valor
}

/** Nombre visible del bot (menu, cabeceras, respuestas) */
export function nombreBot() {
  return leer(CLAVES.nombre, BOT_NAME)
}

/** Titulo que usa el menu */
export function tituloBot() {
  return leer(CLAVES.nombre, TEMA.titulo)
}

/** JID o numero del owner configurado; null si no se toco */
export function ownerConfigurado() {
  return leer(CLAVES.owner, null)
}

/** Link que se muestra en el menu */
export function linkBot() {
  return leer(CLAVES.link, TEMA.link)
}

/** Nombre de la moneda (menu y economia) */
export function monedaBot() {
  return leer(CLAVES.moneda, TEMA.moneda)
}

/** Emoji/icono que precede al nombre en el menu */
export function iconoBot() {
  return leer(CLAVES.icono, TEMA.emoji)
}

/** URL o ruta del banner fijado; null = usar el banner al azar */
export function bannerFijado() {
  return leer(CLAVES.banner, null)
}

/** Nombre de perfil del socket (pushname) guardado; null si no se toco */
export function usernameBot() {
  return leer(CLAVES.username, null)
}

/** true si el bot esta en modo privado (ignora grupos) */
export function modoPrivado() {
  return leer(CLAVES.privado, '0') === '1'
}

/**
 * Prefijos activos. Se guardan como JSON en un solo ajuste para poder
 * cambiarlos todos de golpe (`/setbotprefix .` deja solo el punto).
 */
export function prefijosBot() {
  const crudo = leer(CLAVES.prefijos, null)
  if (!crudo) return PREFIXES
  try {
    const lista = JSON.parse(crudo)
    if (Array.isArray(lista) && lista.length && lista.every((p) => typeof p === 'string' && p)) {
      return lista
    }
  } catch {
    // Un ajuste corrupto no debe romper el arranque: se cae a los prefijos de config
  }
  return PREFIXES
}

/**
 * Guarda un prefijo nuevo. Acepta varios separados por coma (`. / #`) o uno
 * solo. Devuelve la lista aplicada, o null si no habia ningun prefijo valido.
 */
export function fijarPrefijos(texto) {
  const lista = String(texto || '')
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter((p) => p && p.length <= 4 && !/\s/.test(p))
  if (!lista.length) return null
  const unicos = [...new Set(lista)]
  guardarAjuste(CLAVES.prefijos, JSON.stringify(unicos))
  return unicos
}

/** Vuelve a los prefijos de config.js */
export function resetPrefijos() {
  guardarAjuste(CLAVES.prefijos, '')
  return PREFIXES
}

/** Cambia un ajuste de texto. Cadena vacia borra (vuelve al valor de fabrica). */
export function fijarAjuste(clave, valor) {
  guardarAjuste(clave, String(valor ?? '').trim())
}

/** Activa o desactiva el modo privado y devuelve el estado nuevo */
export function fijarModoPrivado(activo) {
  guardarAjuste(CLAVES.privado, activo ? '1' : '0')
  return Boolean(activo)
}
