/**
 * Reconocimiento del owner del bot (Beerus_zv).
 *
 * En grupos el remitente puede llegar como JID LID (p.ej. '1668...:5@lid'),
 * sin el numero de telefono y sin participantPn. Baileys guarda el mapeo
 * LID <-> numero en la carpeta de sesion (archivos lid-mapping-*.json), asi
 * que aqui se lee ese mapeo para resolver quien es el owner.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { digitosJid } from './grupo.js'
import { AUTH_DIR } from '../config.js'

/** Numero telefonico del owner, sin '+' ni '@s.whatsapp.net'. */
export const OWNER_NUM = '573208089136'

/**
 * LIDs del owner conocidos, resueltos desde la carpeta de sesion.
 * Los archivos lid-mapping-<PN>.json guardan '<LID>' por cada numero.
 */
let lidsOwner = []
let leidoEn = 0
const TTL = 30000 // relee como mucho cada 30s (el mapeo puede crecer)

function carpetaSesion() {
  const aqui = path.dirname(fileURLToPath(import.meta.url))
  const rel = path.resolve(aqui, '..', AUTH_DIR)
  if (fs.existsSync(rel)) return rel
  return path.resolve(process.cwd(), AUTH_DIR)
}

function refrescarLidsOwner() {
  if (Date.now() - leidoEn < TTL) return
  leidoEn = Date.now()
  lidsOwner = []
  try {
    const archivo = path.join(carpetaSesion(), `lid-mapping-${OWNER_NUM}.json`)
    if (fs.existsSync(archivo)) {
      const lid = JSON.parse(fs.readFileSync(archivo, 'utf-8'))
      // El valor puede ser el LID pelado ('1668...') o vec ['lid'] del store
      const texto = Array.isArray(lid) ? String(lid[0]?.[1] ?? '') : String(lid ?? '')
      if (texto) lidsOwner.push(texto.replace(/\D/g, ''))
    }
  } catch {
    // Si no se puede leer, seguimos con el chequeo por numero directo
  }
}

/**
 * Devuelve los digitos del LID registrado para un numero telefonico, o null
 * si la sesion no tiene ese mapeo todavia.
 */
export function lidParaPN(numero = '') {
  const solo = String(numero).replace(/[^\d]/g, '')
  if (!solo) return null
  try {
    const archivo = path.join(carpetaSesion(), `lid-mapping-${solo}.json`)
    if (!fs.existsSync(archivo)) return null
    const lid = JSON.parse(fs.readFileSync(archivo, 'utf-8'))
    const texto = Array.isArray(lid) ? String(lid[0]?.[1] ?? '') : String(lid ?? '')
    const digitos = texto.replace(/\D/g, '')
    return digitos || null
  } catch {
    return null
  }
}

/**
 * Verdad si alguno de los JIDs dados pertenece al owner.
 * Compara digitos y acepta '+', 's.whatsapp.net', sufijo de dispositivo
 * del propio bot ('573208089136:5@...') y el LID mapeado del owner.
 */
export function esOwnerJid(...candidatos) {
  refrescarLidsOwner()
  for (const c of candidatos) {
    const digitos = digitosJid(c)
    if (!digitos) continue
    if (digitos === OWNER_NUM) return true
    // JIDs del propio bot: los digitos son numero + sufijo de dispositivo
    if (digitos.length > OWNER_NUM.length && digitos.startsWith(OWNER_NUM)) return true
    // LID del owner: '1668...:5@lid' o pelado '1668...@lid'
    for (const lid of lidsOwner) {
      if (lid && digitos.startsWith(lid)) return true
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
  return esOwnerJid(
    sender,
    key.participant,
    key.participantPn,
    key.participantAlt,
    enChatPrivado ? key.remoteJid : null,
    key.fromMe ? sock?.user?.id : null,
    sock?.user?.id,
  )
}

/**
 * Vincula el JID actual del owner (aunque sea @lid) a la tabla vip, para que
 * los comandos que miran la base de datos (vipbadge/vipboost/gachaclaim)
 * funcionen sin importar con que formato llegue su JID.
 * @returns {boolean} true si se inserto una fila nueva
 */
export function asegurarOwnerVip(db, { msg, sender, sock } = {}) {
  if (!esOwnerMsg({ msg, sender, sock })) return false
  const info = db.prepare(`
    INSERT INTO vip (jid, rango, puntos, creado_en)
    VALUES (?, 'owner', 1000, datetime('now','localtime'))
    ON CONFLICT(jid) DO NOTHING
  `).run(sender)
  return info.changes > 0
}
