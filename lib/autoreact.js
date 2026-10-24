/**
 * Autoreact: reacciona al azar a mensajes de los grupos donde está activado
 * (`.autoreact on`, solo admins). Se ajusta en config.js:
 *   AUTOREACT_PROBABILIDAD  probabilidad (0 a 1) de reaccionar a cada mensaje
 *   AUTOREACT_PAUSA_MS      pausa mínima entre dos reacciones del mismo grupo
 *
 * Elige el emoji según el contenido (risa, comida, saludos, Dragon Ball...) o,
 * si nada encaja, uno al azar según el tipo de mensaje.
 */
import { normalizeMessageContent } from '@whiskeysockets/baileys'
import { modoChat } from '../database/db.js'
import { AUTOREACT_PROBABILIDAD, AUTOREACT_PAUSA_MS } from '../config.js'

/** Mensajes más viejos que esto (al reconectar llegan atrasados) no se reaccionan */
const EDAD_MAXIMA_S = 60

const GENERALES = ['😂', '🔥', '💥', '👀', '😎', '🍮', '💀', '👑', '😼', '⚡', '🤣', '😱', '👌', '🎉', '🌟']

const POR_TIPO = {
  sticker: ['😂', '🤣', '😼', '💀', '👀'],
  imagen: ['🔥', '😍', '👀', '😱', '👏', '😎'],
  video: ['🔥', '😂', '👀', '😱', '🍿'],
  audio: ['🎧', '👀', '😂', '🔥'],
  documento: ['👀', '👌', '👍'],
}

/** [expresión, emojis]: se usa la primera que coincida con el texto (en minúsculas) */
const POR_TEXTO = [
  [/ja(ja)+|je(je)+|jsjs|jaja|lmao|lol|xd+|kjkj|😂|🤣/, ['😂', '🤣', '💀']],
  [/pud[ií]n|pizza|sushi|ramen|tempura|hambre|comida|tacos?|hamburguesa|helado|chocolate/, ['🍮', '🍜', '😋']],
  [/te amo|te quiero|amor|cari[nñ]o|beso|❤|💖/, ['💖', '😍', '🥺']],
  [/felicidades|felicitaciones|cumplea|ganamos|victoria|\bgg\b|campe[oó]n/, ['🎉', '👏', '👑']],
  [/triste|llor[oéa]|\brip\b|falleci|muri[oó]|deprim/, ['🥺', '😢', '🫂']],
  [/goku|vegeta|dragon ?ball|saiyajin|saiyan|whis|gohan|freezer|frieza|zeno/, ['🔥', '💥', '🐉']],
  [/buen(os|as)? (d[ií]as|tardes|noches)|\bhola\b|\bbuenas\b/, ['👋', '😼', '☀️']],
  [/gracias|thanks|\bthx\b/, ['🙏', '😼', '👍']],
  [/\bwtf\b|\bomg\b|\bwow\b|no puede ser|incre[ií]ble/, ['😱', '🤯', '👀']],
]

/** Última reacción por chat (para respetar la pausa) */
const ultimaReaccion = new Map()

/** Tipo de mensaje reaccionable, o null si no conviene reaccionarle (reacciones, borrados, encuestas...) */
function tipoDe(contenido) {
  if (!contenido) return null
  if (contenido.conversation || contenido.extendedTextMessage) return 'texto'
  if (contenido.imageMessage) return 'imagen'
  if (contenido.videoMessage) return 'video'
  if (contenido.stickerMessage) return 'sticker'
  if (contenido.audioMessage) return 'audio'
  if (contenido.documentMessage) return 'documento'
  return null
}

/** Segundos desde epoch del mensaje (viene como número o como Long de protobuf) */
function segundosDe(marca) {
  if (marca === undefined || marca === null) return null
  if (typeof marca === 'object') return typeof marca.toNumber === 'function' ? marca.toNumber() : Number(marca.low)
  return Number(marca)
}

/** Elige el emoji: por palabras clave del texto o, si no hay, al azar según el tipo */
export function elegirEmoji(texto, tipo, azar = Math.random) {
  const elegir = (lista) => lista[Math.floor(azar() * lista.length)]
  const limpio = String(texto || '').toLowerCase()
  if (limpio) {
    for (const [regla, emojis] of POR_TEXTO) {
      if (regla.test(limpio)) return elegir(emojis)
    }
  }
  return elegir(POR_TIPO[tipo] || GENERALES)
}

/**
 * Reacciona (o no) a un mensaje. Devuelve el emoji usado, o false si no reaccionó.
 *
 * @param {object} ctx { sock, jid, msg, texto, prefijos }
 * @param {object} [opciones] probabilidad, pausaMs, modo, azar, ahora (para pruebas)
 */
export async function autoReaccionar({ sock, jid, msg, texto = '', prefijos = [] }, opciones = {}) {
  const {
    probabilidad = AUTOREACT_PROBABILIDAD,
    pausaMs = AUTOREACT_PAUSA_MS,
    modo = modoChat,
    azar = Math.random,
    ahora = Date.now,
  } = opciones

  // Solo grupos, mensajes ajenos y con id
  if (!jid?.endsWith('@g.us') || msg?.key?.fromMe || !msg?.key?.id) return false

  // Modo activo en el chat y bot encendido
  if (!modo(jid, 'autoreact') || !modo(jid, 'bot')) return false

  // Solo contenido normal; los comandos no se reaccionan (ya los responde el bot)
  const tipo = tipoDe(normalizeMessageContent(msg.message))
  if (!tipo) return false
  if (prefijos.some((p) => String(texto).startsWith(p))) return false

  // Nada de reaccionar a mensajes viejos (historial al reconectar)
  const marca = segundosDe(msg.messageTimestamp)
  if (marca !== null && ahora() / 1000 - marca > EDAD_MAXIMA_S) return false

  // Azar y pausa entre reacciones del mismo grupo
  if (azar() >= probabilidad) return false
  if (ahora() - (ultimaReaccion.get(jid) || 0) < pausaMs) return false

  const emoji = elegirEmoji(texto, tipo, azar)
  ultimaReaccion.set(jid, ahora())
  await sock.sendMessage(jid, { react: { text: emoji, key: msg.key } })
  return emoji
}
