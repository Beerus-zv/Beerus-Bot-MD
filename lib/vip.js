/**
 * Club VIP: registro y comprobacion de rangos.
 *
 * El problema historico era doble:
 *   - `.vip add` usaba `db.exec(sql, params)`; `exec` NO acepta parametros,
 *     asi que insertaba `jid = NULL` y el alta se perdia en silencio.
 *   - La comprobacion buscaba el JID exacto, pero en grupos WhatsApp puede
 *     llegar como `@lid`, `@s.whatsapp.net` o con sufijo de dispositivo.
 *
 * Aqui se guardan todos los JIDs conocidos de una persona y se comprueba
 * cualquiera de ellos, incluido el LID mapeado en la sesion.
 */
import { db } from '../database/db.js'
import { digitosJid, jidUsuario } from './grupo.js'
import { lidParaPN, pnParaLid } from './owner.js'

/** Rangos con acceso al club */
export const RANGOS_VIP = ['vip', 'owner']

/** Comandos exclusivos del club (bloqueados en index.js) */
export const COMANDOS_VIP = new Set(['gachaclaim', 'vipboost'])

/** Normaliza un JID crudo a su forma canonica; null si no sirve */
function canonico(crudo) {
  const texto = String(crudo || '').trim()
  if (!texto) return null
  // Quita el '+' que WhatsApp/Baileys a veces deja en el numero
  const jid = jidUsuario(texto).replace(/^\+/, '')
  if (!jid) return null
  return jid.includes('@') ? jid : `${jid}@s.whatsapp.net`
}

/**
 * JIDs posibles de quien envia el mensaje: remitente, participante y sus
 * variantes PN/LID, mas el LID mapeado en la sesion para su numero.
 */
export function jidsDe({ msg, sender, sock } = {}) {
  const key = msg?.key || {}
  const crudos = [
    sender,
    key.participant,
    key.participantPn,
    key.participantAlt,
    key.fromMe ? sock?.user?.id : null,
    sock?.user?.id,
  ]

  const jids = new Set()
  for (const crudo of crudos.filter(Boolean)) {
    const jid = canonico(crudo)
    if (jid) jids.add(jid)
    const lid = lidParaPN(digitosJid(crudo))
    if (lid) jids.add(`${lid}@lid`)
  }
  return [...jids]
}

/** JIDs de un participante del grupo (id, telefono y LID) */
export function jidsDeParticipante(participante, extra = []) {
  const jids = new Set(extra.map(canonico).filter(Boolean))
  if (participante) {
    for (const crudo of [participante.id, participante.phoneNumber, participante.lid]) {
      const jid = canonico(crudo)
      if (jid) jids.add(jid)
    }
    const lid = lidParaPN(digitosJid(participante.phoneNumber || participante.id))
    if (lid) jids.add(`${lid}@lid`)
  }
  return [...jids]
}

/** JIDs deducidos de un texto suelto: numero, JID o mencion */
export function jidsDeTexto(texto) {
  const limpio = String(texto || '').replace(/^@/, '').trim()
  if (!limpio) return []
  // Numero pelado, con '+' o con espacios: '+57 320 8089136'
  if (!limpio.includes('@')) {
    const digitos = limpio.replace(/\D/g, '')
    return digitos.length >= 6 ? [`${digitos}@s.whatsapp.net`] : []
  }
  const jid = canonico(limpio)
  return jid ? [jid] : []
}

/** JID preferido para menciones: el de telefono si existe */
export function jidPrincipal(jids = []) {
  return jids.find((j) => j.endsWith('@s.whatsapp.net')) || jids[0] || null
}

/** Fila VIP que coincide con alguno de los JIDs; prioriza owner */
export function filaVip(jids = []) {
  const lista = [...new Set(jids.map(canonico).filter(Boolean))]
  if (!lista.length) return null
  const marcas = lista.map(() => '?').join(',')
  return (
    db
      .prepare(
        `SELECT * FROM vip
          WHERE jid IN (${marcas})
          ORDER BY CASE rango WHEN 'owner' THEN 0 WHEN 'vip' THEN 1 ELSE 2 END
          LIMIT 1`
      )
      .get(...lista) ?? null
  )
}

/** Rango efectivo ('owner', 'vip' o null) */
export function rangoDe(jids = []) {
  return filaVip(jids)?.rango ?? null
}

/** true si alguno de los JIDs pertenece al club */
export function esVip(jids = []) {
  return RANGOS_VIP.includes(rangoDe(jids))
}

/**
 * Da de alta los JIDs indicados como VIP (idempotente).
 * @returns {{jids:string[], nuevos:number}}
 */
export function registrarVip(jids = [], razon = 'Alta manual') {
  const lista = [...new Set(jids.map(canonico).filter(Boolean))]
  // Persona: se prefiere el telefono para agrupar las filas PN y LID
  const persona = digitosJid(lista.find((j) => j.endsWith('@s.whatsapp.net')) || lista[0]) || null
  const insertar = db.prepare("INSERT OR IGNORE INTO vip (jid, rango, persona) VALUES (?, 'vip', ?)")
  const completar = db.prepare('UPDATE vip SET persona = COALESCE(persona, ?) WHERE jid = ?')
  const registrar = db.prepare('INSERT INTO vip_log (jid, accion, razon) VALUES (?, ?, ?)')
  let nuevos = 0

  for (const jid of lista) {
    const info = insertar.run(jid, persona)
    if (info.changes) {
      nuevos++
      registrar.run(jid, 'add', razon)
    } else {
      completar.run(persona, jid)
    }
  }

  return { jids: lista, nuevos, persona }
}

/** Quita del club todos los JIDs indicados */
export function quitarVip(jids = []) {
  const lista = [...new Set(jids.map(canonico).filter(Boolean))]
  if (!lista.length) return 0
  const marcas = lista.map(() => '?').join(',')
  const info = db.prepare(`DELETE FROM vip WHERE jid IN (${marcas})`).run(...lista)
  const registrar = db.prepare('INSERT INTO vip_log (jid, accion, razon) VALUES (?, ?, ?)')
  for (const jid of lista) registrar.run(jid, 'remove', 'Baja manual')
  return Number(info.changes) || 0
}

/** Miembros del club agrupados por persona, sin filas rotas */
export function listarVip() {
  const filas = db
    .prepare(
      `SELECT jid, rango, puntos, ultimo_boost, persona FROM vip
        WHERE jid IS NOT NULL AND jid <> ''
        ORDER BY CASE rango WHEN 'owner' THEN 0 WHEN 'vip' THEN 1 ELSE 2 END,
                 CASE WHEN jid LIKE '%@s.whatsapp.net' THEN 0 ELSE 1 END, jid`
    )
    .all()

  // LIDs que ya estan representados por una fila de telefono de la misma
  // persona (al dar de alta se guardan los dos JIDs).
  const telefonos = new Set(
    filas.filter((f) => f.jid.endsWith('@s.whatsapp.net')).map((f) => digitosJid(f.jid))
  )
  const lidsCubiertos = new Set()
  for (const fila of filas) {
    if (!fila.jid.endsWith('@s.whatsapp.net')) continue
    const lid = lidParaPN(digitosJid(fila.jid))
    if (lid) lidsCubiertos.add(lid)
  }

  const vistos = new Set()
  return filas.filter((fila) => {
    const digitos = digitosJid(fila.jid)
    if (!digitos) return false
    const esLid = fila.jid.endsWith('@lid')
    const pn = esLid ? pnParaLid(digitos) : null
    const clave = fila.persona || pn || digitos
    if (vistos.has(clave)) return false
    // Fila LID redundante: se prefiere la del numero de telefono
    if (esLid && (lidsCubiertos.has(digitos) || (pn && telefonos.has(pn)))) return false
    vistos.add(clave)
    return true
  })
}

/** Borra las filas corruptas que dejo el antiguo `.vip add` */
export function limpiarVipRoto() {
  try {
    return db.prepare("DELETE FROM vip WHERE jid IS NULL OR jid = ''").run().changes
  } catch {
    return 0
  }
}
