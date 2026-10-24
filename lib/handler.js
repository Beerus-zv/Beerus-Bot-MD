import { normalizeMessageContent } from '@whiskeysockets/baileys'
import { PREFIXES, RESPONDER_A_SI_MISMO } from '../config.js'

/**
 * Extrae el texto plano de un mensaje de WhatsApp
 * (conversation, texto extendido o caption de imagen/video).
 */
export function extraerTexto(message) {
  const m = normalizeMessageContent(message)

  return (
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.videoMessage?.caption ||
    ''
  )
}

/**
 * Busca un comando en el texto a partir de los prefijos configurados.
 * @returns {{nombre:string, args:string[], prefix:string, comando:Function}|null}
 */
export function buscarComando(texto, commands = {}) {
  const limpio = String(texto).trim()
  const prefix = PREFIXES.find((p) => limpio.startsWith(p))
  if (!prefix) return null

  const [nombre, ...args] = limpio.slice(prefix.length).trim().split(/\s+/)
  if (!nombre) return null

  const comando = commands[nombre.toLowerCase()]
  if (typeof comando !== 'function') return null

  return { nombre: nombre.toLowerCase(), args, prefix, comando }
}

/**
 * Procesa un mensaje entrante y ejecuta el comando correspondiente.
 * @param {object} ctx contexto del bot (sock, jid, msg, commands, ...)
 */
export async function handleMessage(ctx = {}) {
  const { sock, msg, commands } = ctx
  if (!msg?.message || !commands) return null

  if (msg.key?.fromMe && !RESPONDER_A_SI_MISMO) return null

  const jid = msg.key?.remoteJid
  if (!jid || jid === 'status@broadcast') return null

  const encontrado = buscarComando(extraerTexto(msg.message), commands)
  if (!encontrado) return null

  await encontrado.comando({
    ...ctx,
    jid,
    msg,
    args: encontrado.args,
    commands,
    prefix: encontrado.prefix,
  })

  return encontrado
}
