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
import { jidUsuario } from './grupo.js'
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
 * Devuelve los digitos del numero telefonico dueño de un LID, leyendo el
 * archivo inverso que guarda Baileys (lid-mapping-<LID>_reverse.json).
 */
export function pnParaLid(lid = '') {
  const solo = String(lid).replace(/[^\d]/g, '')
  if (!solo) return null
  try {
    const archivo = path.join(carpetaSesion(), `lid-mapping-${solo}_reverse.json`)
    if (!fs.existsSync(archivo)) return null
    const pn = JSON.parse(fs.readFileSync(archivo, 'utf-8'))
    const texto = Array.isArray(pn) ? String(pn[0]?.[1] ?? '') : String(pn ?? '')
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
    enChatPrivado ? key.remoteJid : null,
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
    enChatPrivado ? key.remoteJid : null,
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
