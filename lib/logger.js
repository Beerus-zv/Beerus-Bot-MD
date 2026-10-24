/**
 * Logs organizados para la terminal.
 *
 *   12:34:56 MSG  [Mi Grupo] Mateo (549...) › .pinterest rosas
 *   12:34:56 CMD  ▶ .pinterest rosas · [Mi Grupo]
 *   12:34:57 OUT  → [Mi Grupo] ✉ texto · "📌 Pinterest · Buscando..."
 *   12:34:59 OUT  → [Mi Grupo] 🖼 imagen (59 KB) · "📌 rosas"
 *   12:34:59 CMD  ✔ .pinterest (2.8s)
 *
 * Tipos: MSG entrante · CMD comando · OUT enviado · SEC seguridad ·
 *        SYS sistema · WARN aviso · ERR error
 * Los colores se desactivan solos si la salida no es una terminal
 * (o con NO_COLOR=1) y se fuerzan con FORCE_COLOR=1.
 */
import { normalizeMessageContent } from '@whiskeysockets/baileys'

const COLOR = !process.env.NO_COLOR && (process.stdout.isTTY || !!process.env.FORCE_COLOR)
const pintar = (codigo) => (texto) => (COLOR ? `\x1b[${codigo}m${texto}\x1b[0m` : String(texto))
const gris = pintar(90)
const negrita = pintar(1)
const rojo = pintar(31)
const verde = pintar(32)
const amarillo = pintar(33)
const azul = pintar(34)
const magenta = pintar(35)
const cian = pintar(36)

// ───────────── Utilidades ─────────────
function recortar(texto, max = 90) {
  const limpio = String(texto ?? '').replace(/\s*\n\s*/g, ' ⏎ ').trim()
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio
}

function hora() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function linea(tag, colorTag, cuerpo) {
  console.log(`${gris(hora())} ${colorTag(tag.padEnd(4))} ${cuerpo}`)
}

const duracion = (ms) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`)
const numero = (jid) => String(jid || '').split('@')[0].split(':')[0]
const mensajeDe = (err) => err?.message || String(err)

function pila(err) {
  const lineas = String(err?.stack || '').split('\n').slice(1, 4)
  return lineas.length ? `\n${lineas.map((l) => gris(`         ${l.trim()}`)).join('\n')}` : ''
}

// ───────────── Nombres de chats ─────────────
const grupos = new Map()
const intentos = new Map()
const REINTENTO_NOMBRE_MS = 10 * 60 * 1000

/** true si es un grupo del que aún no se conoce el nombre (y no se probó hace poco) */
export function necesitaNombre(jid) {
  return !!jid?.endsWith('@g.us') && !grupos.has(jid) && Date.now() - (intentos.get(jid) || 0) > REINTENTO_NOMBRE_MS
}

export function intentoNombre(jid) {
  intentos.set(jid, Date.now())
}

export function recordarGrupo(jid, nombre) {
  if (nombre) grupos.set(jid, nombre)
}

function lugar(jid) {
  if (!jid) return gris('[?]')
  if (jid.endsWith('@g.us')) {
    return magenta(`[${recortar(grupos.get(jid) || `Grupo …${numero(jid).slice(-6)}`, 30)}]`)
  }
  if (jid.endsWith('@broadcast')) return gris('[Difusión]')
  return verde('[Privado]')
}

function autor(sender, nombre, fromMe) {
  if (fromMe) return negrita('Yo (cuenta del bot)')
  const num = numero(sender)
  return nombre ? `${negrita(recortar(nombre, 24))} ${gris(`(${num})`)}` : negrita(num || '?')
}

// ───────────── Descripción de contenido ─────────────
const TAMANO = (n) => {
  const bytes = Number(n) || 0
  if (!bytes) return ''
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** Describe un mensaje ENTRANTE de Baileys: { icono, tipo, detalle } */
export function describirEntrante(message) {
  let m
  try {
    m = normalizeMessageContent(message)
  } catch {
    m = message
  }
  if (!m) return { icono: '❔', tipo: 'vacío', detalle: '' }

  if (m.conversation) return { icono: '💬', tipo: 'texto', detalle: m.conversation }
  if (m.extendedTextMessage) {
    const citado = m.extendedTextMessage.contextInfo?.quotedMessage ? gris(' ↩ respuesta') : ''
    return { icono: '💬', tipo: 'texto', detalle: `${m.extendedTextMessage.text || ''}${citado}` }
  }
  const medios = [
    ['imageMessage', '🖼', 'imagen'],
    ['videoMessage', '🎬', 'video'],
    ['audioMessage', '🎤', 'audio'],
    ['documentMessage', '📄', 'documento'],
    ['stickerMessage', '🎭', 'sticker'],
  ]
  for (const [clave, icono, tipo] of medios) {
    const x = m[clave]
    if (!x) continue
    const extra = [x.fileName || '', TAMANO(x.fileLength)].filter(Boolean).join(' · ')
    const pie = x.caption ? `"${x.caption}"` : ''
    const detalle = [extra && gris(`(${extra})`), pie].filter(Boolean).join(' · ')
    return { icono, tipo: x.ptt ? 'nota de voz' : tipo, detalle }
  }
  if (m.reactionMessage) return { icono: '😀', tipo: 'reacción', detalle: m.reactionMessage.text || '(quitada)' }
  if (m.protocolMessage) {
    const t = m.protocolMessage.type
    return { icono: '🗑', tipo: t === 0 || t === 'REVOKE' ? 'mensaje borrado' : 'protocolo', detalle: '' }
  }
  if (m.pollCreationMessage || m.pollCreationMessageV3) {
    return { icono: '📊', tipo: 'encuesta', detalle: (m.pollCreationMessage || m.pollCreationMessageV3).name || '' }
  }
  if (m.pollUpdateMessage) return { icono: '📊', tipo: 'voto', detalle: '' }
  if (m.locationMessage || m.liveLocationMessage) return { icono: '📍', tipo: 'ubicación', detalle: '' }
  if (m.contactMessage || m.contactsArrayMessage) return { icono: '👤', tipo: 'contacto', detalle: '' }
  if (m.buttonsResponseMessage || m.listResponseMessage || m.templateButtonReplyMessage) {
    return { icono: '🔘', tipo: 'botón', detalle: '' }
  }
  const [clave] = Object.keys(m)
  return { icono: '❔', tipo: clave ? clave.replace(/Message$/, '') : 'desconocido', detalle: '' }
}

/** Describe un mensaje SALIENTE (el contenido que se pasa a sock.sendMessage) */
export function describirSaliente(c) {
  if (!c || typeof c !== 'object') return { icono: '✉', tipo: 'mensaje', detalle: '' }
  const peso = (x) => (Buffer.isBuffer(x) ? TAMANO(x.length) : '')
  const unir = (...partes) => partes.filter(Boolean).join(' · ')
  if (c.text !== undefined) return { icono: '✉', tipo: 'texto', detalle: c.text }
  if (c.image) return { icono: '🖼', tipo: 'imagen', detalle: unir(peso(c.image), c.caption && `"${c.caption}"`) }
  if (c.video) return { icono: '🎬', tipo: 'video', detalle: unir(peso(c.video), c.caption && `"${c.caption}"`) }
  if (c.audio) return { icono: '🎵', tipo: c.ptt ? 'nota de voz' : 'audio', detalle: unir(peso(c.audio), c.fileName) }
  if (c.document) return { icono: '📄', tipo: 'documento', detalle: unir(c.fileName, peso(c.document)) }
  if (c.sticker) return { icono: '🎭', tipo: 'sticker', detalle: peso(c.sticker) }
  if (c.react) return { icono: '😀', tipo: 'reacción', detalle: c.react.text || '(quitada)' }
  if (c.delete) return { icono: '🗑', tipo: 'borrado', detalle: '' }
  if (c.poll) return { icono: '📊', tipo: 'encuesta', detalle: c.poll.name || '' }
  if (c.location) return { icono: '📍', tipo: 'ubicación', detalle: '' }
  if (c.contacts) return { icono: '👤', tipo: 'contacto', detalle: '' }
  if (c.forward) return { icono: '↪', tipo: 'reenvío', detalle: '' }
  return { icono: '✉', tipo: Object.keys(c)[0] || 'mensaje', detalle: '' }
}


// ───────────── API de logs ─────────────
let contador = 0
const conteo = { recibidos: 0, comandos: 0, errores: 0, enviados: 0 }

export const log = {
  /** Mensaje entrante */
  mensaje({ jid, sender, nombre, fromMe, message }) {
    conteo.recibidos += 1
    const d = describirEntrante(message)
    const cuerpo = d.detalle ? ` ${gris('›')} ${recortar(d.detalle, 120)}` : ''
    linea('MSG', azul, `${lugar(jid)} ${autor(sender, nombre, fromMe)} ${gris('·')} ${d.icono} ${gris(d.tipo)}${cuerpo}`)
  },

  /** Empieza un comando; devuelve fin(error?) para cerrar con su duración */
  comando({ nombre, args = [], jid, via = 'prefijo' }) {
    conteo.comandos += 1
    const id = ++contador
    const inicio = Date.now()
    const argumentos = args.length ? ` ${recortar(args.join(' '), 60)}` : ''
    const etiqueta = `${nombre}${via === 'mención' ? gris(' (mención)') : ''}`
    linea('CMD', cian, `${gris(`#${id}`)} ${cian('▶')} ${negrita(etiqueta)}${argumentos} ${gris('·')} ${lugar(jid)}`)
    return (error) => {
      const tiempo = duracion(Date.now() - inicio)
      if (error) {
        conteo.errores += 1
        linea('ERR', rojo, `${gris(`#${id}`)} ${rojo('✖')} ${negrita(nombre)} ${gris(`(${tiempo})`)} ${rojo(recortar(mensajeDe(error), 140))}${pila(error)}`)
      } else {
        linea('CMD', cian, `${gris(`#${id}`)} ${verde('✔')} ${negrita(nombre)} ${gris(`(${tiempo})`)}`)
      }
    }
  },

  /** Comando que no existe, o bloqueado por un modo del grupo */
  ignorado({ nombre, jid, motivo }) {
    linea('CMD', gris, gris(`· ${nombre} ignorado (${motivo}) · ${jid?.endsWith('@g.us') ? '[grupo]' : '[privado]'}`))
  },

  /** Mensaje enviado por el bot */
  enviado(jid, contenido) {
    conteo.enviados += 1
    const d = describirSaliente(contenido)
    const cuerpo = d.detalle ? ` ${gris('·')} ${recortar(d.detalle, 100)}` : ''
    linea('OUT', verde, `${gris('→')} ${lugar(jid)} ${d.icono} ${gris(d.tipo)}${cuerpo}`)
  },

  /** Filtros: antilink, palabras prohibidas, antispam, anti-delete... */
  seguridad(filtro, detalle, jid) {
    linea('SEC', amarillo, `${amarillo(filtro)} ${gris('·')} ${recortar(detalle, 100)}${jid ? ` ${gris('·')} ${lugar(jid)}` : ''}`)
  },

  sistema(texto) {
    linea('SYS', verde, texto)
  },

  aviso(texto) {
    linea('WARN', amarillo, amarillo(texto))
  },

  error(contexto, err) {
    conteo.errores += 1
    linea('ERR', rojo, `${negrita(contexto)}${err ? ` ${gris('·')} ${rojo(recortar(mensajeDe(err), 160))}${pila(err)}` : ''}`)
  },

  /** Resumen de actividad desde que arrancó el bot */
  resumen() {
    return `${conteo.recibidos} recibidos · ${conteo.comandos} comandos · ${conteo.enviados} enviados · ${conteo.errores} errores`
  },
}

export default log

