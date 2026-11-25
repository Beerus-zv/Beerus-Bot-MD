/**
 * Memoria corta de lo que pasa durante una vinculacion.
 *
 * En un panel como Pterodactyl la consola esta ocupada por el bot: no hay
 * shell donde correr un script, y cuando el telefono dice "no se pudo
 * vincular" no queda rastro de en que paso se rompio. Aca se guardan los
 * ultimos eventos del emparejamiento para que `/code diag` los mande por el
 * chat, que es el unico canal que siempre esta a mano.
 *
 * Es un buffer circular en memoria: nada de disco, nada que limpiar.
 */
import { resumenParches, reporteParches } from '../scripts/parche-baileys.mjs'

const MAX_EVENTOS = 60
const eventos = []

/**
 * Anota un evento de vinculacion.
 * @param {string} numero  numero del sub-bot ('' para el principal)
 * @param {string} texto   que paso, en una linea
 */
export function anotarVinculacion(numero, texto) {
  eventos.push({ en: Date.now(), numero: numero || 'principal', texto: String(texto) })
  if (eventos.length > MAX_EVENTOS) eventos.shift()
}

/** Ultimos eventos, del mas viejo al mas nuevo. */
export function eventosVinculacion(limite = 25) {
  return eventos.slice(-limite)
}

/** Hora corta para el chat. */
function hora(ms) {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(
    d.getSeconds()
  ).padStart(2, '0')}`
}

/**
 * Informe completo para el chat: parches, version, reloj y traza.
 *
 * @param {{ reloj?: string }} [extra]
 * @returns {string} texto listo para mandar
 */
export function informeVinculacion(extra = {}) {
  const lineas = ['*Diagnóstico de vinculación*', '']

  const { estado, ruta, avisos } = reporteParches()
  if (!estado?.instalado) {
    lineas.push('• Baileys: *no instalado*')
    for (const aviso of avisos) lineas.push(`  _${aviso}_`)
  } else {
    const marca = (ok) => (ok ? '✅' : '❌')
    lineas.push(
      `• Parches: ${marca(estado.nonce)} nonce · ${marca(estado.etapa)} etapa · ${marca(estado.cuenta)} registro`
    )
    if (estado.faltan.length) {
      lineas.push(`  _falta: ${estado.faltan.join(', ')}_`)
      for (const aviso of avisos) lineas.push(`  _${aviso}_`)
    }
    if (ruta) lineas.push(`• Ruta: \`${ruta}\``)
  }

  if (extra.reloj) lineas.push(`• Reloj: ${extra.reloj}`)
  if (extra.version) lineas.push(`• Baileys: ${extra.version}`)

  const traza = eventosVinculacion()
  lineas.push('', traza.length ? '*Traza*' : '_Sin eventos todavía._')
  for (const evento of traza) {
    lineas.push(`\`${hora(evento.en)}\` ${evento.numero} · ${evento.texto}`)
  }

  return lineas.join('\n')
}

/** Una linea para el log de arranque. */
export function resumenVinculacion() {
  return resumenParches()
}
