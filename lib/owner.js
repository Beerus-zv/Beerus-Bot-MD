/**
 * Reconocimiento del owner del bot (Beerus_zv).
 *
 * En grupos el remitente puede llegar como JID LID (p.ej. '1668...:5@lid'),
 * sin el numero de telefono. Baileys guarda el mapeo LID <-> numero en el
 * store de la sesion, y aqui se lee para resolver quien es el owner.
 *
 * El store puede ser SQLite (`auth_info/sesion.sqlite`, el que usa este bot)
 * o el formato viejo de un archivo por llave (`lid-mapping-<PN>.json`). Se
 * consultan los dos: el SQLite primero y el archivo como respaldo, para que
 * una sesion migrada siga resolviendo el LID aunque el mapeo sea viejo.
 */
import fs from 'fs'
import path from 'path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'url'
import { jidUsuario } from './grupo.js'
import { AUTH_DIR } from '../config.js'

/** Numero telefonico del owner, sin '+' ni '@s.whatsapp.net'. */
export const OWNER_NUM = '573208089136'

/**
 * LIDs del owner conocidos, resueltos desde la carpeta de sesion.
 * La clave `lid-mapping` guarda `<PN> -> LID` y `<LID>_reverse -> PN`.
 */
let lidsOwner = []
let leidoEn = 0
const TTL = 30000 // relee como mucho cada 30s (el mapeo puede crecer)

const ARCHIVO_SESION = 'sesion.sqlite'
let baseSesion = null

function carpetaSesion() {
  const aqui = path.dirname(fileURLToPath(import.meta.url))
  const rel = path.resolve(aqui, '..', AUTH_DIR)
  if (fs.existsSync(rel)) return rel
  return path.resolve(process.cwd(), AUTH_DIR)
}

/**
 * Conexion de solo lectura a la base de la sesion.
 *
 * Se abre una vez y se reutiliza: es lectura sobre un archivo que otro proceso
 * (o este mismo) mantiene en WAL, y una conexion nueva por mensaje en un grupo
 * activo cuesta mas que la consulta. Si el archivo todavia no existe se
 * devuelve null y el que llama cae al formato de archivos.
 */
function baseSesionLectura() {
  if (baseSesion) return baseSesion
  const archivo = path.join(carpetaSesion(), ARCHIVO_SESION)
  if (!fs.existsSync(archivo)) return null
  try {
    baseSesion = new DatabaseSync(archivo, { readOnly: true })
  } catch {
    baseSesion = null
  }
  return baseSesion
}

/** Misma transformacion de id que usa lib/auth-state.js al guardar */
function fijarId(id) {
  return String(id).replace(/\//g, '__').replace(/:/g, '-')
}

/**
 * Lee una clave del store de Baileys. Cadena vacia si no existe.
 * Los valores se guardan como JSON (`"573..."`), igual que el multi-archivo.
 */
function claveSesion(categoria, id) {
  const db = baseSesionLectura()
  if (!db) return ''
  try {
    const fila = db.prepare('SELECT valor FROM claves WHERE categoria = ? AND id = ?').get(categoria, fijarId(id))
    if (!fila?.valor) return ''
    const valor = JSON.parse(fila.valor)
    return typeof valor === 'string' ? valor : ''
  } catch {
    return ''
  }
}

/** Lee un archivo lid-mapping-*.json del formato viejo */
function claveArchivo(sufijo) {
  try {
    const archivo = path.join(carpetaSesion(), `lid-mapping-${sufijo}.json`)
    if (!fs.existsSync(archivo)) return ''
    const valor = JSON.parse(fs.readFileSync(archivo, 'utf-8'))
    // El valor puede ser el identificador pelado o vec ['id'] del store
    return Array.isArray(valor) ? String(valor[0]?.[1] ?? '') : String(valor ?? '')
  } catch {
    return ''
  }
}

/** Digitos del LID registrado para un numero telefonico, o '' si no hay mapeo */
function lidDeNumero(numero) {
  const solo = String(numero).replace(/\D/g, '')
  if (!solo) return ''
  const digitos = (claveSesion('lid-mapping', solo) || claveArchivo(solo)).replace(/\D/g, '')
  return digitos
}

/** Digitos del numero telefonico dueño de un LID, o '' si no hay mapeo */
function numeroDeLid(lid) {
  const solo = String(lid).replace(/\D/g, '')
  if (!solo) return ''
  const digitos = (claveSesion('lid-mapping', `${solo}_reverse`) || claveArchivo(`${solo}_reverse`)).replace(/\D/g, '')
  return digitos
}

function refrescarLidsOwner() {
  if (Date.now() - leidoEn < TTL) return
  leidoEn = Date.now()
  lidsOwner = []
  const lid = lidDeNumero(OWNER_NUM)
  if (lid) lidsOwner.push(lid)
}

/**
 * Devuelve los digitos del LID registrado para un numero telefonico, o null
 * si la sesion no tiene ese mapeo todavia.
 */
export function lidParaPN(numero = '') {
  return lidDeNumero(numero) || null
}

/**
 * Devuelve los digitos del numero telefonico dueño de un LID, leyendo el
 * mapeo inverso que guarda Baileys (`<LID>_reverse`).
 */
export function pnParaLid(lid = '') {
  return numeroDeLid(lid) || null
}

/**
 * Verdad si alguno de los JIDs dados pertenece al owner.
 * Compara digitos y acepta '+', 's.whatsapp.net', sufijo de dispositivo
 * del propio bot ('573208089136:5@...') y el LID mapeado del owner.
 */
export function esOwnerJid(...candidatos) {
  refrescarLidsOwner()
  // Cuenta sin dominio ni sufijo de dispositivo: '573...:5@s.whatsapp.net'
  const cuenta = (v) => String(v || '').split('@')[0].split(':')[0].replace(/\D/g, '')
  for (const c of candidatos) {
    const digitos = cuenta(c)
    if (!digitos) continue
    if (digitos === OWNER_NUM) return true
    // LID del owner: '1668...:5@lid' o pelado '1668...@lid'
    for (const lid of lidsOwner) {
      if (lid && digitos === lid) return true
    }
    // Un LID del owner puede llegar antes de que el cache del numero lo
    // resuelva: se mira el mapeo inverso. Se salta para numeros del largo del
    // owner (unos 12 digitos) porque ahi la comparacion directa ya no dio y no
    // hay LID que valga: un LID siempre es mas largo.
    if (digitos.length !== OWNER_NUM.length) {
      const pn = numeroDeLid(digitos)
      if (pn && pn === OWNER_NUM) return true
    }
  }
  return false
}

/**
 * Verdad si el remitente del mensaje es el owner.
 * Revisa sender y las cabeceras de Baileys que sobreviven al formato LID.
 */
export function esOwnerMsg({ msg, sender, sock } = {}) {
  const key = msg?.key || {}
  const enChatPrivado = key.remoteJid && !key.remoteJid.endsWith('@g.us')
  // OJO: el JID del propio bot solo cuenta si el mensaje es suyo (fromMe).
  // Si se pasa siempre, cuando el bot corre en el numero del owner TODOS
  // los remitentes pasarian por owner.
  return esOwnerJid(
    sender,
    key.participant,
    key.participantPn,
    key.participantAlt,
    key.senderLid,
    enChatPrivado ? key.remoteJid : null,
    // En un chat privado por LID, `remoteJid` es el LID y `remoteJidAlt` trae
    // el numero. Sin esta cabecera el owner quedaba sin reconocer hasta que el
    // mapeo del LID estuviera guardado.
    enChatPrivado ? key.remoteJidAlt : null,
    key.fromMe ? sock?.user?.id : null,
  )
}

/** Forma canonica de un JID; cadena vacia si no sirve */
function canonico(crudo) {
  const texto = String(crudo || '').trim()
  if (!texto) return ''
  // Quita el '+' que WhatsApp/Baileys a veces deja en el numero
  const limpio = jidUsuario(texto).replace(/^\+/, '')
  if (!limpio) return ''
  return limpio.includes('@') ? limpio : `${limpio}@s.whatsapp.net`
}

/**
 * Vincula todos los JIDs conocidos del owner (numero, LID y sufijo de
 * dispositivo) a la tabla vip, para que los comandos que miran la base de
 * datos (vipbadge/vipboost/gachaclaim) funcionen sin importar con que
 * formato llegue su mensaje.
 *
 * Las filas que ya existieran se suben a rango 'owner' (antes podian haber
 * quedado como 'vip' o 'miembro').
 *
 * @returns {{jids:string[], nuevos:number}}
 */
export function asegurarOwnerVip(db, { msg, sender, sock } = {}) {
  if (!esOwnerMsg({ msg, sender, sock })) return { jids: [], nuevos: 0 }

  const key = msg?.key || {}
  const enChatPrivado = key.remoteJid && !key.remoteJid.endsWith('@g.us')
  const crudos = [
    sender,
    key.participant,
    key.participantPn,
    key.participantAlt,
    key.senderLid,
    enChatPrivado ? key.remoteJid : null,
    enChatPrivado ? key.remoteJidAlt : null,
    key.fromMe ? sock?.user?.id : null,
    `${OWNER_NUM}@s.whatsapp.net`,
  ]

  const jids = new Set()
  for (const crudo of crudos.filter(Boolean)) {
    const jid = canonico(crudo)
    if (jid) jids.add(jid)
  }
  for (const lid of lidsOwner) {
    if (lid) jids.add(`${lid}@lid`)
  }
  const lidMapeado = lidParaPN(OWNER_NUM)
  if (lidMapeado) jids.add(`${lidMapeado}@lid`)

  const alta = db.prepare(`
    INSERT INTO vip (jid, rango, puntos, persona, creado_en)
    VALUES (?, 'owner', 1000, ?, datetime('now','localtime'))
    ON CONFLICT(jid) DO UPDATE SET rango = 'owner',
      persona = COALESCE(vip.persona, excluded.persona)
  `)
  let nuevos = 0
  for (const jid of jids) {
    const antes = db.prepare('SELECT 1 FROM vip WHERE jid = ?').get(jid)
    alta.run(jid, OWNER_NUM)
    if (!antes) nuevos++
  }

  return { jids: [...jids], nuevos }
}
