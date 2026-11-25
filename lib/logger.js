/**
 * Logs organizados para la terminal.
 *
 *   ╭──────────────────╮
 *   │ BEERUS BOT MD    │
 *   │ prefijos  / . !  │
 *   │ node      v24.9  │
 *   ╰──────────────────╯
 *
 *   12:34:56 │ MSG  [Mi Grupo] Mateo (549...) · 💬 texto › .pinterest rosas
 *   12:34:56 │ CMD  ┌ #1 pinterest rosas · [Mi Grupo]
 *   12:34:57 │ OUT  → [Mi Grupo] ✉ texto · 📌 Pinterest · Buscando...
 *   12:34:59 │ CMD  └ #1 ✔ pinterest (2.8s)
 *
 * Tipos: MSG entrante · CMD comando · OUT enviado · SEC seguridad ·
 *        SYS sistema · WARN aviso · ERR error · SUB sub-bot
 * Los colores se desactivan solos si la salida no es una terminal
 * (o con NO_COLOR=1) y se fuerzan con FORCE_COLOR=1. Las trazas internas
 * (log.depuracion: tamaños, respuestas de APIs, campos de un proto) solo
 * salen con LOG_DEBUG=1.
 */
import { normalizeMessageContent } from '@whiskeysockets/baileys'

const COLOR = !process.env.NO_COLOR && (process.stdout.isTTY || !!process.env.FORCE_COLOR)
/** Trazas internas (progreso, tamaños, respuestas de APIs) solo con LOG_DEBUG=1 */
const DEPURACION = /^(1|true|si|sí|on|yes)$/i.test(String(process.env.LOG_DEBUG || ''))
/** Color de 256 colores; `extra` permite anteponer negrita (`1;`) */
const fg = (n, extra = '') => (texto) => (COLOR ? `\x1b[${extra}38;5;${n}m${texto}\x1b[0m` : String(texto))
const negrita = (texto) => (COLOR ? `\x1b[1m${texto}\x1b[0m` : String(texto))

const gris = fg(245) // hora y separadores de texto
const borde = fg(238) // lineas, cajas y arbol del stack
const azul = fg(75)
const cian = fg(80)
const verde = fg(78)
const amarillo = fg(221)
const rojo = fg(203)
const magenta = fg(177)
const lavanda = fg(183)

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
  console.log(`${gris(hora())} ${borde('│')} ${colorTag(negrita(tag.padEnd(4)))} ${cuerpo}`)
}

/** Sangria que alinea el stack bajo el cuerpo de una linea */
const SANGRIA = ' '.repeat(16)

/**
 * Dibuja una caja de bordes finos. Cada fila es un texto o `{ t, c }`, donde
 * `t` es el texto visible y `c` lo pinta sin cambiar su longitud.
 */
function caja(filas, anchoMinimo = 0) {
  const visibles = filas.map((f) => (typeof f === 'string' ? f : f.t))
  const ancho = Math.max(anchoMinimo, ...visibles.map((t) => t.length))
  const techo = borde(`╭${'─'.repeat(ancho + 2)}╮`)
  const piso = borde(`╰${'─'.repeat(ancho + 2)}╯`)

  console.log(techo)
  filas.forEach((fila, i) => {
    const texto = visibles[i]
    const pintado = typeof fila === 'string' ? fila : fila.c ? fila.c(texto) : texto
    console.log(`${borde('│')} ${pintado}${' '.repeat(ancho - texto.length)} ${borde('│')}`)
  })
  console.log(piso)
}

const duracion = (ms) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`)
const numero = (jid) => String(jid || '').split('@')[0].split(':')[0]
const mensajeDe = (err) => err?.message || String(err)

function pila(err) {
  const lineas = String(err?.stack || '').split('\n').slice(1, 4)
  return lineas.length
    ? `\n${lineas.map((l) => `${SANGRIA}${borde('┆')} ${gris(l.trim())}`).join('\n')}`
    : ''
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

/**
 * True si el texto es el subcomando `clave <KEY>` de .dalle o /ia.
 * Se usa para no escribir claves de API en los logs.
 */
function esClaveSecreta(texto) {
  return /(?:^|\s)[.#/]?(?:dalle|ia)\s+clave(?:\s|$)/i.test(String(texto || ''))
}

export const log = {
  /** Mensaje entrante */
  mensaje({ jid, sender, nombre, fromMe, message }) {
    conteo.recibidos += 1
    const d = describirEntrante(message)
    const detalle = esClaveSecreta(d.detalle) ? '••••• (clave oculta)' : d.detalle
    const cuerpo = detalle ? ` ${gris('›')} ${recortar(detalle, 120)}` : ''
    linea('MSG', azul, `${lugar(jid)} ${autor(sender, nombre, fromMe)} ${gris('·')} ${d.icono} ${gris(d.tipo)}${cuerpo}`)
  },

  /** Empieza un comando; devuelve fin(error?) para cerrar con su duración */
  comando({ nombre, args = [], jid, via = 'prefijo' }) {
    conteo.comandos += 1
    const id = ++contador
    const inicio = Date.now()
    const argsLog = esClaveSecreta(`${nombre} ${args.join(' ')}`) ? [args[0], '•••••'] : args
    const argumentos = argsLog.length ? ` ${recortar(argsLog.join(' '), 60)}` : ''
    const etiqueta = `${negrita(nombre)}${via === 'mención' ? gris(' (mención)') : ''}`
    linea('CMD', cian, `${borde('┌')} ${gris(`#${id}`)} ${etiqueta}${argumentos} ${gris('·')} ${lugar(jid)}`)
    return (error) => {
      const tiempo = duracion(Date.now() - inicio)
      if (error) {
        conteo.errores += 1
        linea('ERR', rojo, `${borde('└')} ${gris(`#${id}`)} ${rojo('✖')} ${negrita(nombre)} ${gris(`(${tiempo})`)} ${rojo(recortar(mensajeDe(error), 140))}${pila(error)}`)
      } else {
        linea('CMD', cian, `${borde('└')} ${gris(`#${id}`)} ${verde('✔')} ${negrita(nombre)} ${gris(`(${tiempo})`)}`)
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
    linea('OUT', verde, `${verde('→')} ${lugar(jid)} ${d.icono} ${gris(d.tipo)}${cuerpo}`)
  },

  /** Filtros: antilink, palabras prohibidas, antispam, anti-delete... */
  seguridad(filtro, detalle, jid) {
    linea('SEC', amarillo, `${amarillo(filtro)} ${gris('·')} ${recortar(detalle, 100)}${jid ? ` ${gris('·')} ${lugar(jid)}` : ''}`)
  },

  sistema(texto) {
    linea('SYS', verde, texto)
  },

  /**
   * Traza de depuración: progreso interno (resultados de una API, tamaño de un
   * buffer, campos de un proto). Solo sale con `LOG_DEBUG=1`; sin eso, un grupo
   * movido llena la consola de líneas que no cambian ninguna decisión.
   */
  depuracion(texto) {
    if (!DEPURACION) return
    linea('SYS', gris, gris(texto))
  },

  aviso(texto) {
    linea('WARN', amarillo, texto)
  },

  error(contexto, err) {
    conteo.errores += 1
    linea('ERR', rojo, `${negrita(contexto)}${err ? ` ${gris('·')} ${rojo(recortar(mensajeDe(err), 160))}${pila(err)}` : ''}`)
  },

  /**
   * Sub-bots: cada linea lleva el numero que la origino, para que con varios
   * sockets abiertos se pueda seguir una vinculacion sin adivinar de quien es.
   * `numero` vacio deja la linea sin etiqueta (mensajes del motor, no de una
   * sesion concreta).
   */
  sub(numero, texto) {
    linea('SUB', magenta, `${numero ? `${negrita(numero)} ${gris('·')} ` : ''}${texto}`)
  },

  subAviso(numero, texto) {
    linea('SUB', amarillo, `${numero ? `${negrita(numero)} ${gris('·')} ` : ''}${amarillo(texto)}`)
  },

  subError(numero, texto, err) {
    conteo.errores += 1
    const detalle = err ? ` ${gris('·')} ${rojo(recortar(mensajeDe(err), 160))}${pila(err)}` : ''
    linea('SUB', rojo, `${numero ? `${negrita(numero)} ${gris('·')} ` : ''}${rojo(texto)}${detalle}`)
  },

  /** Cabecera de sección: ──── TEXTO ──── */
  titulo(texto) {
    const visible = String(texto || '')
    const relleno = Math.max(4, Math.floor((46 - visible.length) / 2))
    console.log(
      `\n${borde('─'.repeat(relleno))} ${negrita(lavanda(visible))} ${borde('─'.repeat(relleno))}`
    )
  },

  /** Línea divisoria simple */
  separador() {
    console.log(borde('─'.repeat(52)))
  },

  /**
   * Código de vinculación en una caja, sin adornos alrededor para que se pueda
   * copiar tal cual. Va con las instrucciones del telefono debajo, que es lo
   * unico que hace falta leer en ese momento.
   */
  codigo(codigo, venceSegundos = 55) {
    console.log('')
    caja([
      { t: 'VINCULAR DISPOSITIVO', c: (x) => negrita(cian(x)) },
      { t: ' ', c: () => '' },
      { t: String(codigo), c: (x) => negrita(amarillo(x)) },
    ])
    console.log(`  ${gris('WhatsApp › Dispositivos vinculados › Vincular con número de teléfono')}`)
    console.log(`  ${gris(`Vence en ${venceSegundos} segundos.`)}`)
    console.log('')
  },

  /** Caja de arranque con los datos del bot */
  banner({ nombre = 'Beerus', prefijos = '/', version = '' } = {}) {
    const par = (clave, valor) => ({
      t: `${clave}${' '.repeat(Math.max(1, 9 - clave.length))}${valor}`,
      c: () => `${gris(clave)}${' '.repeat(Math.max(1, 9 - clave.length))}${negrita(valor)}`,
    })

    const filas = [
      {
        t: String(nombre).toUpperCase(),
        c: (x) => negrita(cian(x)),
      },
      par('prefijos', prefijos),
      par('node', process.version),
    ]
    if (version) filas.push(par('version', version))

    console.log('')
    caja(filas)
  },

  /** Resumen de actividad desde que arrancó el bot */
  resumen() {
    return `${conteo.recibidos} recibidos · ${conteo.comandos} comandos · ${conteo.enviados} enviados · ${conteo.errores} errores`
  },
}

export default log

