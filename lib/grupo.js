import { isJidGroup, jidNormalizedUser, normalizeMessageContent } from '@whiskeysockets/baileys'

/**
 * Indica si el JID corresponde a un grupo de WhatsApp.
 */
export function esGrupo(jid) {
  return isJidGroup(jid)
}

/**
 * Normaliza un JID para comparar usuarios (s.whatsapp.net <-> lid).
 */
export function normalizar(jid) {
  return jidNormalizedUser(jid)
}

/**
 * Obtiene los metadatos del grupo. Lanza error si no es un grupo.
 */
export async function obtenerMetadata(sock, jid) {
  if (!esGrupo(jid)) throw new Error('NO_ES_GRUPO')
  return await sock.groupMetadata(jid)
}

/**
 * Busca un participante del grupo por JID, número o LID.
 * Acepta menciones (@user), números con o sin '+' y JID literales.
 */
export function buscarParticipante(metadata, objetivo) {
  if (!metadata?.participants?.length || !objetivo) return null

  const crudo = String(objetivo).trim()
  if (!crudo) return null

  const sinArroba = crudo.replace(/^@+/, '')
  const soloDigitos = sinArroba.replace(/\D/g, '')
  const objetivoNorm = normalizar(sinArroba)
  const comparaDigitos = soloDigitos.length >= 6

  const digitos = (v) => String(v || '').replace(/\D/g, '')

  return (
    metadata.participants.find((p) => p.id && normalizar(p.id) === objetivoNorm) ||
    metadata.participants.find((p) => p.lid && normalizar(p.lid) === objetivoNorm) ||
    metadata.participants.find((p) => p.phoneNumber && normalizar(p.phoneNumber) === objetivoNorm) ||
    (comparaDigitos &&
      metadata.participants.find((p) => digitos(p.phoneNumber) === soloDigitos)) ||
    (comparaDigitos &&
      metadata.participants.find(
        (p) => p.id?.endsWith('@s.whatsapp.net') && digitos(p.id) === soloDigitos
      )) ||
    null
  )
}

/**
 * Verifica si un JID es administrador del grupo (admin o superadmin).
 */
export function esAdmin(metadata, jid) {
  const participante = buscarParticipante(metadata, jid)
  if (!participante) return false
  return Boolean(participante.isAdmin || participante.isSuperAdmin || participante.admin)
}

/**
 * Extrae los JID mencionados en un mensaje (@usuario).
 */
export function menciones(msg) {
  const contenido = normalizeMessageContent(msg?.message)
  const ctx =
    contenido?.extendedTextMessage?.contextInfo ||
    contenido?.imageMessage?.contextInfo ||
    contenido?.videoMessage?.contextInfo ||
    contenido?.documentMessage?.contextInfo ||
    contenido?.audioMessage?.contextInfo ||
    contenido?.stickerMessage?.contextInfo
  return ctx?.mentionedJid || []
}

/**
 * Resuelve el objetivo de un comando: @mención, número o JID literal.
 * Devuelve { jid, participante } o null si no se pudo resolver.
 */
export function resolverObjetivo(metadata, msg, args) {
  // 1) Menciones del mensaje (@usuario)
  const mencionados = menciones(msg)
  if (mencionados.length) {
    const participante = buscarParticipante(metadata, mencionados[0])
    if (participante) return { jid: participante.id, participante }
  }

  // 2) Primer argumento (número o JID)
  const arg = args?.[0]
  if (arg) {
    const participante = buscarParticipante(metadata, arg)
    if (participante) return { jid: participante.id, participante }
  }

  return null
}

/**
 * Nombre legible de un participante.
 */
export function nombreParticipante(participante) {
  return (
    participante?.name ||
    participante?.pushName ||
    participante?.verifiedName ||
    participante?.notify ||
    (participante?.phoneNumber ? `+${participante.phoneNumber}` : participante?.id)
  )
}

/**
 * Comprueba que el bot es admin del grupo.
 */
export async function botEsAdmin(sock, jid) {
  const metadata = await obtenerMetadata(sock, jid)
  const botJid = sock.user?.id
  return esAdmin(metadata, botJid)
}

/**
 * Parte numerica de un JID (tambien con LIDs): '15939412181175@lid' -> '15939412181175'.
 */
export function digitosJid(jid) {
  return String(jid || '').split('@')[0].replace(/\D/g, '')
}

/**
 * Token de mencion para un JID: el texto debe llevar '@<digitos>'
 * y el array mentions de Baileys hace que WhatsApp lo marque como etiqueta.
 */
export function tokenMencion(jid) {
  const digitos = digitosJid(jid)
  return digitos ? `@${digitos}` : ''
}

/**
 * Devuelve el array 'mentions' para un texto con tokens '@<digitos>',
 * usando los JIDs que se le pasan. Devuelve undefined si no hay coincidencias,
 * asi se puede añadir directamente al contenido del mensaje.
 */
export function mencionarEnTexto(texto, jids = []) {
  const lista = []
  for (const jid of jids.filter(Boolean)) {
    if (lista.includes(jid)) continue
    const token = tokenMencion(jid)
    if (token && String(texto).includes(token)) lista.push(jid)
  }
  return lista.length ? lista : undefined
}

/**
 * JID de usuario en forma canonica (sin sufijo de dispositivo ":16")
 * listo para pasarlo al array 'mentions' de Baileys.
 */
export function jidUsuario(jid) {
  const limpio = String(jid || '').replace(/:\d+/g, '').trim()
  if (!limpio.includes('@')) return limpio
  const [cuenta, dominio] = limpio.split('@')
  return `${cuenta}@${dominio === 'lid' ? 'lid' : 's.whatsapp.net'}`
}

/**
 * Toma un texto que pueda llevar JIDs crudos (p. ej. "15939412181175@lid")
 * y los convierte en tokens de mencion '@<digitos>'. Devuelve el texto
 * limpio y los JIDs encontrados, para sumarlos al array 'mentions'.
 */
export function saneaJidsCrudos(texto) {
  const jids = []
  const limpio = String(texto || '').replace(
    /(\d{6,})@(s\.whatsapp\.net|lid)(:\d+)?/g,
    (_completo, digitos, dominio) => {
      jids.push(`${digitos}@${dominio}`)
      return `@${digitos}`
    }
  )
  return { texto: limpio, jids }
}

/**
 * Elige la mejor forma de mencionar a un usuario dentro de un grupo:
 *  - Si el JID crudo es un LID y los metadatos revelan su JID de telefono,
 *    se menciona por el telefono (todos los clientes resuelven ese tag).
 *  - Si no, se menciona por el propio JID (lid o telefono).
 * @param {Array} participantes metadatos.participants del grupo
 * @param {string} objetivo JID crudo del usuario (puede ser lid con ":device")
 * @returns {{ token: string, jid: string } | null}
 */
export function mencionDeParticipantes(participantes = [], objetivo) {
  const objetivoLimpio = String(objetivo || '').split(':')[0]
  if (!objetivoLimpio.includes('@')) return null

  const esLid = objetivoLimpio.endsWith('@lid')
  const digitos = digitosJid(objetivoLimpio)

  const participante = esLid
    ? participantes.find((p) => digitosJid(p.lid) === digitos) ||
      participantes.find((p) => digitosJid(p.id) === digitos)
    : participantes.find((p) => digitosJid(p.id) === digitos) ||
      participantes.find((p) => digitosJid(p.lid) === digitos) ||
      participantes.find((p) => digitosJid(p.phoneNumber) === digitos)

  // Si conocemos su numero de telefono, esa es la etiqueta mas fiable
  const telefono =
    digitosJid(participante?.phoneNumber) ||
    (participante?.id?.endsWith('@s.whatsapp.net') ? digitosJid(participante.id) : null)

  if (telefono) return { token: `@${telefono}`, jid: `${telefono}@s.whatsapp.net` }

  return { token: `@${digitos}`, jid: jidUsuario(objetivo) }
}

/**
 * Normaliza un JID para poder compararlo (quita el sufijo de dispositivo).
 */
export function jidComparacion(jid) {
  return String(jid || '')
    .replace(/:\d+/g, '')
    .trim()
    .toLowerCase()
}

/**
 * Indica si el bot fue mencionado en el mensaje:
 *  - por @mención real (el JID del bot aparece entre los mencionados)
 *  - por su nombre escrito (ej. "beerus help")
 */
export function esMencionDelBot(msg, sock, nombres = []) {
  const idsBot = new Set(
    [sock?.user?.id, sock?.user?.lid].filter(Boolean).map(jidComparacion)
  )

  for (const mencionado of menciones(msg)) {
    if (idsBot.has(jidComparacion(mencionado))) return true
  }

  const contenido = normalizeMessageContent(msg?.message)
  const texto = String(
    contenido?.conversation ||
      contenido?.extendedTextMessage?.text ||
      contenido?.imageMessage?.caption ||
      contenido?.videoMessage?.caption ||
      ''
  ).toLowerCase()

  return nombres.some((nombre) => texto.includes(String(nombre).toLowerCase()))
}

function escaparRegex(texto) {
  return String(texto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Extrae el comando que sigue a una mención del bot.
 * "beerus, help" -> { nombre: 'help', args: [] }
 */
export function extraerComandoTrasMencion(texto, nombres = []) {
  let limpio = String(texto || '')

  for (const nombre of nombres) {
    limpio = limpio.replace(new RegExp(escaparRegex(nombre), 'ig'), ' ')
  }

  // Quita las menciones @usuario y los signos de puntuación
  limpio = limpio.replace(/@\S+/g, ' ')
  limpio = limpio.replace(/[^\p{L}\p{N}_]/gu, ' ').trim()

  const partes = limpio.split(/\s+/).filter(Boolean)
  if (!partes.length) return null

  return { nombre: partes[0], args: partes.slice(1) }
}

/**
 * Saca el texto de una mención para charlar con el bot:
 * "@bot ¿cuánto es 2+2?" / "beerus, cuéntame un chiste" -> "¿cuánto es 2+2?"
 * Quita el nombre del bot y las @menciones, y conserva la puntuación y los saltos de línea.
 * Con `sock` también quita la mención numérica del propio bot (@número).
 */
export function extraerPreguntaTrasMencion(texto, nombres = [], sock = null) {
  let limpio = String(texto || '')

  for (const nombre of nombres) {
    limpio = limpio.replace(new RegExp(escaparRegex(nombre), 'ig'), ' ')
  }

  // @<digitos> del propio bot (el texto de una mención real es "@numero")
  const digitosBot = [sock?.user?.id, sock?.user?.lid]
    .filter(Boolean)
    .map((id) => String(id).split('@')[0].split(':')[0])
  for (const d of digitosBot) limpio = limpio.replace(new RegExp(`@${escaparRegex(d)}`, 'g'), ' ')

  return limpio
    .replace(/^[\s,.:;!¡¿?\-–—]+/, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
