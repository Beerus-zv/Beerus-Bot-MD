/**
 * Identidad y textos del bot: Beerus, el Dios de la Destruccion.
 * Todo lo que se muestra al usuario sale de aqui para mantener un estilo unico.
 */

import { readFileSync } from 'node:fs'

/**
 * Version del bot: la unica fuente es "version" en package.json.
 * Para subirla usa `npm version <x.y.z> --no-git-tag-version`.
 */
export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version

export const TEMA = {
  nombre: 'Beerus',
  titulo: 'Beerus Bot MD',
  subtitulo: 'El Dios de la Destruccion',
  emoji: '👑',
  lema: 'Todo cae ante el Dios de la Destruccion',
  version: VERSION,
  descripcion: 'Bot de WhatsApp multi-dispositivo construido con Baileys',
  moneda: 'Oro',
  desarrollador: 'Beerus_zv',
  modo: 'Premium',
  link: '',
  poderes: [
    'Economia, casino y gacha anime',
    'Multimedia: stickers, video y audio',
    'Moderacion y seguridad de grupos',
    'Bienvenidas y despedidas automaticas',
    'Busqueda en internet, clima y traduccion',
    'Menciones y comandos por nombre',
  ],
}

/**
 * Ornamentos del estilo del menu — version limpia (inspirada en GataBot-MD):
 * casi sin ASCII pesado, todo se apoya en el formato nativo de WhatsApp
 * ( citas con ">" ) y en un margen punteado para separar zonas.
 */
export const ORNAMENTOS = {
  separador: '*··················································*',
  titulo: '❖ ❃ ☽',
  fleur: '♛',
  check: '✓',
}

/** Saludo corto */
export const SALUDO = `👑 *¡Hola! Soy Beerus, el Dios de la Destruccion.* 💥

Mi reino es este chat. Pídeme lo que quieras, o desaparece en un destello.`

/** Pie de firma para respuestas rapidas */
export const FIRMA = '_La destruccion es mi Especialidad._'

/**
 * Cabecera en caja del menu, al estilo de los menus de bot.
 * Va en una sola linea para dejar sitio a la lista de comandos.
 */
export function cabeceraMenu(prefijo = '/', titulo = TEMA.titulo) {
  return `👑 *${titulo}*  ·  ${prefijo}menu`
}

/**
 * Panel de datos del bot (modo, version, desarrollador, moneda, comandos, link).
 */
export function panelDatos({ modo, version, desarrollador, moneda, comandos, link }) {
  const filas = [
    ['Modo', modo],
    ['Version', version],
    ['Desarrollador', desarrollador],
    ['Moneda', moneda],
    ['Comandos', comandos],
    ['Link', link],
  ]

  return filas
    .filter(([, valor]) => valor !== undefined && valor !== null && valor !== '')
    .map(([clave, valor]) => `${ORNAMENTOS.fleur} ${clave} › ${valor}`)
    .join('\n')
}

/**
 * Panel de datos del menu, en citas (">") con icono por dato:
 * queda alineado y copiable dentro del mensaje.
 */
export function panelLinea({ modo, version, desarrollador, moneda, comandos, link }) {
  const filas = [
    ['⚙️', 'Modo', modo],
    ['🏷️', 'Versión', version],
    ['🧬', 'Creador', desarrollador],
    ['💠', 'Moneda', moneda],
    ['📜', 'Comandos', comandos],
    ['🔗', 'Repo', link],
  ].filter(([, , valor]) => valor !== undefined && valor !== null && valor !== '')

  return filas.map(([icono, etiqueta, valor]) => `> ${icono} *${etiqueta}:* ${valor}`).join('\n')
}

/**
 * Fecha y hora local en espanol para la cabecera del menu.
 */
export function fechaMenu() {
  return new Date().toLocaleString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** Texto cuando alguien pide la ayuda */
export const AYUDA_INTRO = `📚 *Ayuda de ${TEMA.titulo}*\n_${TEMA.lema}_\n\n_Tambien puedes llamarme escribiendo *@Beerus* o *beerus menu*._`

