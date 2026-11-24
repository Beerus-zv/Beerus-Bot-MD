import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'

const DB_PATH = path.join(process.cwd(), 'data', 'beerus.db')
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

export const db = new DatabaseSync(DB_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS chats (jid TEXT PRIMARY KEY, creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS usuarios (jid TEXT PRIMARY KEY, nombre TEXT, creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')), ult_visto TEXT, genero TEXT, descripcion TEXT);
  CREATE TABLE IF NOT EXISTS notas (id INTEGER PRIMARY KEY AUTOINCREMENT, jid TEXT NOT NULL, texto TEXT NOT NULL, creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS tiradas (id INTEGER PRIMARY KEY AUTOINCREMENT, jid TEXT NOT NULL, resultado TEXT, creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS moderacion (id INTEGER PRIMARY KEY AUTOINCREMENT, grupo TEXT NOT NULL, jid TEXT NOT NULL, accion TEXT NOT NULL, motivo TEXT, ejecutor TEXT, creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS alertas (id INTEGER PRIMARY KEY AUTOINCREMENT, chat TEXT NOT NULL, texto TEXT NOT NULL, activo INTEGER NOT NULL DEFAULT 1, creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS alertas_estado (chat TEXT PRIMARY KEY, activo INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS antilink (chat TEXT PRIMARY KEY, activo INTEGER NOT NULL DEFAULT 0, accion TEXT NOT NULL DEFAULT 'kick', whitelist TEXT, creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS baneados_bot (jid TEXT PRIMARY KEY, razon TEXT, baneado_por TEXT, creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS economia (jid TEXT PRIMARY KEY, monedas INTEGER NOT NULL DEFAULT 100, nivel INTEGER NOT NULL DEFAULT 1, experiencia INTEGER NOT NULL DEFAULT 0, racha INTEGER NOT NULL DEFAULT 0, ultimo_diario TEXT, ultimo_trabajo TEXT, creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')), ultimo_robo TEXT);
  CREATE TABLE IF NOT EXISTS economia_log (id INTEGER PRIMARY KEY AUTOINCREMENT, jid TEXT NOT NULL, tipo TEXT, monto INTEGER, motivo TEXT, creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS gacha_personajes (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, anime TEXT, rareza TEXT, valor INTEGER NOT NULL DEFAULT 15, imagen TEXT, genero TEXT, creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS gacha_inventario (jid TEXT NOT NULL, personaje_id INTEGER NOT NULL, cantidad INTEGER NOT NULL DEFAULT 1, obtenido_en TEXT NOT NULL DEFAULT (datetime('now','localtime')), PRIMARY KEY (jid, personaje_id));
  CREATE TABLE IF NOT EXISTS gacha_stats (jid TEXT PRIMARY KEY, rolls INTEGER NOT NULL DEFAULT 0, pity INTEGER NOT NULL DEFAULT 0, creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')), ultimo_roll TEXT);
  CREATE TABLE IF NOT EXISTS gacha_config (grupo TEXT PRIMARY KEY, coste INTEGER NOT NULL DEFAULT 50, cooldown INTEGER NOT NULL DEFAULT 30);
  CREATE TABLE IF NOT EXISTS gacha_claims (jid TEXT NOT NULL, personaje_id INTEGER NOT NULL, grupo TEXT, favorito INTEGER NOT NULL DEFAULT 0, reclamado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')), PRIMARY KEY (jid, personaje_id));
  CREATE TABLE IF NOT EXISTS gacha_ventas (id INTEGER PRIMARY KEY AUTOINCREMENT, personaje_id INTEGER NOT NULL, vendedor TEXT NOT NULL, comprador TEXT, precio INTEGER NOT NULL DEFAULT 0, estado TEXT NOT NULL DEFAULT 'activa', grupo TEXT, creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS gacha_votos (personaje_id INTEGER NOT NULL, jid TEXT NOT NULL, PRIMARY KEY (personaje_id, jid));
  CREATE TABLE IF NOT EXISTS gacha_claimmsg (jid TEXT PRIMARY KEY, texto TEXT, actualizado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS economia_banco (jid TEXT PRIMARY KEY, depositado INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS cumpleanos (jid TEXT PRIMARY KEY, fecha TEXT NOT NULL, creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS matrimonios (jid TEXT PRIMARY KEY, pareja TEXT NOT NULL, fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS matrimonio_pendiente (tipo TEXT NOT NULL, desde TEXT NOT NULL, para TEXT NOT NULL, creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')), PRIMARY KEY (tipo, desde, para));
  CREATE TABLE IF NOT EXISTS mensajes_grupo (chat TEXT NOT NULL, usuario TEXT NOT NULL, cuenta INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (chat, usuario));
  CREATE TABLE IF NOT EXISTS historial_matrimonio (id INTEGER PRIMARY KEY AUTOINCREMENT, jid TEXT NOT NULL, pareja TEXT NOT NULL, tipo TEXT NOT NULL, creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS sugerencias (id INTEGER PRIMARY KEY AUTOINCREMENT, jid TEXT NOT NULL, texto TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'pendiente', creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS uno_partidas (id INTEGER PRIMARY KEY AUTOINCREMENT, grupo TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'esperando', creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS uno_jugadores (partida_id INTEGER NOT NULL, jid TEXT NOT NULL, PRIMARY KEY (partida_id, jid));
  CREATE TABLE IF NOT EXISTS welcome (grupo TEXT NOT NULL, tipo TEXT NOT NULL, texto TEXT, imagen TEXT, audio TEXT, activo INTEGER NOT NULL DEFAULT 1, creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')), PRIMARY KEY (grupo, tipo));
  CREATE TABLE IF NOT EXISTS ajustes (clave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE IF NOT EXISTS advertencias (id INTEGER PRIMARY KEY AUTOINCREMENT, grupo TEXT NOT NULL, jid TEXT NOT NULL, razon TEXT, ejecutor TEXT, creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE INDEX IF NOT EXISTS idx_advertencias_grupo ON advertencias(grupo, jid);
  CREATE TABLE IF NOT EXISTS afk (jid TEXT PRIMARY KEY, motivo TEXT, chat TEXT, desde TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS vip (jid TEXT PRIMARY KEY, puntos INTEGER NOT NULL DEFAULT 0, rango TEXT NOT NULL DEFAULT 'miembro', ultimo_boost TEXT, creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')), persona TEXT);
  CREATE INDEX IF NOT EXISTS idx_vip_rango ON vip(rango);
  CREATE TABLE IF NOT EXISTS vip_log (id INTEGER PRIMARY KEY AUTOINCREMENT, jid TEXT NOT NULL, accion TEXT NOT NULL, razon TEXT, creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS ultima_waifu (chat TEXT PRIMARY KEY, personaje_id INTEGER NOT NULL, nombre TEXT, enviado TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS ahorcado (grupo TEXT NOT NULL, estado TEXT, creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS poker (chat TEXT NOT NULL, estado TEXT, creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS adivinar (jid TEXT NOT NULL, numero INTEGER NOT NULL, maximo INTEGER NOT NULL, intentos INTEGER NOT NULL DEFAULT 0, creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS recarga (jid TEXT NOT NULL, comando TEXT NOT NULL, ultimo TEXT NOT NULL DEFAULT (datetime('now','localtime')), PRIMARY KEY (jid, comando));
  CREATE TABLE IF NOT EXISTS nsfw (chat TEXT PRIMARY KEY, activo INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS modos_chat (chat TEXT NOT NULL, modo TEXT NOT NULL, activo INTEGER NOT NULL DEFAULT 0, creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')), PRIMARY KEY (chat, modo));
  CREATE TABLE IF NOT EXISTS palabras_prohibidas (chat TEXT NOT NULL, palabra TEXT NOT NULL, creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')), PRIMARY KEY (chat, palabra));
`)

try { db.exec('ALTER TABLE gacha_stats ADD COLUMN ultimo_roll TEXT') } catch {}
// Segundo contador de garantia: el alto (legendario/mitico) se mueve aparte
// del medio (epico+), asi las dos colas tienen tope.
try { db.exec('ALTER TABLE gacha_stats ADD COLUMN pity_alto INTEGER NOT NULL DEFAULT 0') } catch {}
try { db.exec('ALTER TABLE economia ADD COLUMN ultimo_robo TEXT') } catch {}
try { db.exec('ALTER TABLE usuarios ADD COLUMN genero TEXT') } catch {}
try { db.exec('ALTER TABLE usuarios ADD COLUMN descripcion TEXT') } catch {}
try { db.exec('ALTER TABLE usuarios ADD COLUMN pasatiempo TEXT') } catch {}
try { db.exec('ALTER TABLE gacha_personajes ADD COLUMN video TEXT') } catch {}
try { db.exec('ALTER TABLE gacha_personajes ADD COLUMN favoritos INTEGER') } catch {}
// Popularidad de la serie y peso del personaje en su reparto: los otros dos
// tercios del score de rareza (el resto son los favoritos propios).
try { db.exec('ALTER TABLE gacha_personajes ADD COLUMN serie_pop INTEGER') } catch {}
try { db.exec('ALTER TABLE gacha_personajes ADD COLUMN importancia INTEGER') } catch {}
try { db.exec('ALTER TABLE vip ADD COLUMN ultimo_boost TEXT') } catch {}
// Persona = digitos del telefono (o del LID si no se conoce): agrupa las
// filas PN y LID de un mismo miembro en la lista del club.
try { db.exec('ALTER TABLE vip ADD COLUMN persona TEXT') } catch {}

// Migrar esquema antilink (desde config a activo/accion/whitelist)
try { db.exec('ALTER TABLE antilink ADD COLUMN activo INTEGER NOT NULL DEFAULT 0') } catch {}
try { db.exec('ALTER TABLE antilink ADD COLUMN accion TEXT NOT NULL DEFAULT "kick"') } catch {}
try { db.exec('ALTER TABLE antilink ADD COLUMN whitelist TEXT') } catch {}
try { db.exec('ALTER TABLE antilink RENAME COLUMN grupo TO chat') } catch {}

// UNO: instalaciones viejas guardaban el grupo en la columna `chat`.
// Se renombra a `grupo` (la base actual ya usa ese nombre) para que todas
// las consultas funcionen igual en cualquier instalacion.
try { db.exec('ALTER TABLE uno_partidas RENAME COLUMN chat TO grupo') } catch {}

// UNO: columnas que faltaban para guardar la partida completa
try { db.exec("ALTER TABLE uno_partidas ADD COLUMN creador TEXT NOT NULL DEFAULT ''") } catch {}
try { db.exec('ALTER TABLE uno_partidas ADD COLUMN apuesta INTEGER NOT NULL DEFAULT 0') } catch {}
try { db.exec("ALTER TABLE uno_partidas ADD COLUMN mazo TEXT NOT NULL DEFAULT '[]'") } catch {}
try { db.exec('ALTER TABLE uno_partidas ADD COLUMN color TEXT') } catch {}
try { db.exec('ALTER TABLE uno_partidas ADD COLUMN ultima TEXT') } catch {}
try { db.exec('ALTER TABLE uno_partidas ADD COLUMN turno TEXT') } catch {}
try { db.exec('ALTER TABLE uno_partidas ADD COLUMN direccion INTEGER NOT NULL DEFAULT 1') } catch {}
try { db.exec('ALTER TABLE uno_jugadores ADD COLUMN mano TEXT') } catch {}
try { db.exec('ALTER TABLE uno_jugadores ADD COLUMN puntos INTEGER NOT NULL DEFAULT 0') } catch {}
try { db.exec('ALTER TABLE uno_jugadores ADD COLUMN pasado INTEGER NOT NULL DEFAULT 0') } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_uno_partidas_grupo ON uno_partidas(grupo, estado)') } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_uno_jugadores_partida ON uno_jugadores(partida_id)') } catch {}

// JIDs antiguos con '+' delante ('+573...@s.whatsapp.net') nunca coincidian
// al comprobar el acceso. Se reparan (y se descartan si ya existe el limpio).
try { db.exec("DELETE FROM vip WHERE jid LIKE '+%@%' AND REPLACE(jid, '+', '') IN (SELECT jid FROM vip)") } catch {}
try { db.exec("UPDATE vip SET jid = REPLACE(jid, '+', '') WHERE jid LIKE '+%@%'") } catch {}

// Limpieza: el antiguo `.vip add` insertaba jid = NULL (db.exec no acepta
// parametros) y esas filas rotas nunca coincidian con ningun usuario.
try { db.exec("DELETE FROM vip WHERE jid IS NULL OR jid = ''") } catch {}

import { CATALOGO_ANIME, RAREZAS } from './catalogo.js'

/**
 * Reajuste de valores del gacha.
 *
 * `valor` se guarda por personaje, asi que al rebalancear las rarezas las
 * filas que ya existian conservaban el valor viejo y la coleccion quedaba
 * tasada con dos escalas distintas. Se realinean una sola vez con la misma
 * formula que usa la sincronizacion con AniList:
 *   valor = base de su rareza + 5 por voto
 *
 * Solo toca las filas cuyo valor no coincide, asi que en arranques
 * posteriores no escribe nada.
 */
try {
  const caso = Object.entries(RAREZAS)
    .map(([rareza, datos]) => `WHEN '${rareza}' THEN ${Number(datos.valor) || 0}`)
    .join(' ')
  const base = `(CASE rareza ${caso} ELSE ${Number(RAREZAS.comun.valor) || 0} END)`
  const esperado = `${base} + 5 * (SELECT COUNT(*) FROM gacha_votos v WHERE v.personaje_id = gacha_personajes.id)`

  const desalineados = db
    .prepare(`SELECT COUNT(*) AS n FROM gacha_personajes WHERE valor != ${esperado}`)
    .get()?.n

  if (desalineados) {
    db.exec(`UPDATE gacha_personajes SET valor = ${esperado} WHERE valor != ${esperado}`)
    console.log(`[gacha] valores realineados: ${desalineados}`)
  }
} catch {
  // El reajuste es mantenimiento: si falla, el bot arranca igual.
}

export const XP_POR_NIVEL = 250

export function sembrarCatalogoAnime() {
  const existentes = new Set(db.prepare('SELECT nombre FROM gacha_personajes').all().map((r) => r.nombre))
  let sembrados = 0
  for (const p of CATALOGO_ANIME) {
    if (existentes.has(p.nombre)) continue
    const valor = RAREZAS[p.rareza]?.valor ?? 15
    db.prepare('INSERT INTO gacha_personajes (nombre, anime, rareza, valor) VALUES (?,?,?,?)').run(p.nombre, p.anime, p.rareza, valor)
    sembrados++
  }
  return sembrados
}

function segundosDesde(fecha) {
  if (!fecha) return Infinity
  const t = new Date(String(fecha).replace(' ', 'T')).getTime()
  if (Number.isNaN(t)) return Infinity
  return Math.max(0, (Date.now() - t) / 1000)
}

// Economia
export function obtenerEconomia(jid) {
  let row = db.prepare('SELECT * FROM economia WHERE jid = ?').get(jid)
  if (!row) { db.prepare('INSERT INTO economia (jid) VALUES (?)').run(jid); row = db.prepare('SELECT * FROM economia WHERE jid = ?').get(jid) }
  if (!row) row = { jid, monedas: 100, nivel: 1, experiencia: 0, racha: 0 }
  return row
}
export function sumarMonedas(jid, monto, tipo = '', motivo = '') {
  obtenerEconomia(jid)
  const base = Math.trunc(Number(monto) || 0)
  // Beneficio de donantes: gana x2 o x3 (salvo retiros del banco, que son
  // transferencias, no ganancias)
  const creditado = base > 0 && tipo !== 'banco' ? base * multiplicadorDonor(jid) : base
  db.prepare('UPDATE economia SET monedas = monedas + ? WHERE jid = ?').run(creditado, jid)
  try { db.prepare('INSERT INTO economia_log (jid, tipo, monto, motivo) VALUES (?,?,?,?)').run(jid, tipo, creditado, motivo) } catch {}
  return creditado
}
export function restarMonedas(jid, monto, tipo = '', motivo = '') {
  const eco = obtenerEconomia(jid)
  if (eco.monedas < monto) return false
  db.prepare('UPDATE economia SET monedas = monedas - ? WHERE jid = ?').run(monto, jid)
  try { db.prepare('INSERT INTO economia_log (jid, tipo, monto, motivo) VALUES (?,?,?,?)').run(jid, tipo, -monto, motivo) } catch {}
  return true
}
export function anadirExperiencia(jid, xp) {
  obtenerEconomia(jid)
  const base = Math.trunc(Number(xp) || 0)
  // Beneficio de donantes: la experiencia tambien se gana x2 o x3
  xp = base * multiplicadorDonor(jid)
  db.prepare('UPDATE economia SET experiencia = experiencia + ? WHERE jid = ?').run(xp, jid)
  const eco = obtenerEconomia(jid)
  const nivel = Math.floor(eco.experiencia / XP_POR_NIVEL) + 1
  if (nivel !== eco.nivel) db.prepare('UPDATE economia SET nivel = ? WHERE jid = ?').run(nivel, jid)
  return nivel
}
export function nivelDesdeExperiencia(xp) { return Math.floor((xp || 0) / XP_POR_NIVEL) + 1 }
export function topExperiencia(limite = 10, pagina = 1) {
  const p = Math.max(1, Math.trunc(Number(pagina) || 1))
  return db.prepare('SELECT jid, monedas, nivel, experiencia FROM economia ORDER BY experiencia DESC, monedas DESC LIMIT ? OFFSET ?').all(limite, (p - 1) * limite)
}
export function totalRanking() { return Number(db.prepare('SELECT COUNT(*) AS n FROM economia').get()?.n ?? 0) }

// ───────────── Donantes ─────────────
// Beneficios por donar: 1 USD = x2 (xp y oro), 2 USD = x3 (xp y oro).
// Ademas el donante entra al club VIP automaticamente.
try { db.exec('CREATE TABLE IF NOT EXISTS donores (jid TEXT PRIMARY KEY, nivel INTEGER NOT NULL DEFAULT 1, donado REAL NOT NULL DEFAULT 0, registrado_en TEXT NOT NULL DEFAULT (datetime(\'now\',\'localtime\')))') } catch {}
/** Nivel del donante del jid: 0 no donante · 1 = x2 · 2 = x3 */
export function nivelDonor(jid) {
  return Number(db.prepare('SELECT nivel FROM donores WHERE jid = ?').get(jid)?.nivel ?? 0)
}
/** Digitos de un jid sin decoraciones (sufijo de dispositivo incluido) */
function digitos(jid) {
  return String(jid || '').split('@')[0].replace(/\D/g, '')
}
/** Nivel del donante, con tolerancia a variantes de JID (LID y sufijo de dispositivo) */
function nivelDonorFlexible(jid) {
  const directo = db.prepare('SELECT nivel FROM donores WHERE jid = ?').get(jid)
  if (directo) return Number(directo.nivel ?? 0)
  const d = digitos(jid)
  if (!d) return 0
  for (const fila of db.prepare('SELECT jid, nivel FROM donores').all()) {
    const e = digitos(fila.jid)
    if (!e) continue
    // mismo numero pelado, o el stored es prefijo del que llega (lid + sufijo)
    if (e === d || (d.startsWith(e) && e.length >= 8)) return Number(fila.nivel ?? 0)
  }
  return 0
}
/** Multiplicador de xp/oro del jid: 1 si no es donante, 2 o 3 si lo es */
export function multiplicadorDonor(jid) {
  const n = nivelDonorFlexible(jid)
  return n >= 2 ? 3 : n === 1 ? 2 : 1
}
export function registrarDonor(jid, nivel, donado = 0) {
  db.prepare(`
    INSERT INTO donores (jid, nivel, donado) VALUES (?, ?, ?)
    ON CONFLICT(jid) DO UPDATE SET nivel = excluded.nivel, donado = donores.donado + excluded.donado
  `).run(jid, nivel, donado)
  return true
}
export function quitarDonor(jid) {
  return db.prepare('DELETE FROM donores WHERE jid = ?').run(jid).changes > 0
}
export function listarDonores() {
  return db.prepare('SELECT d.*, u.nombre FROM donores d LEFT JOIN usuarios u ON u.jid = d.jid ORDER BY d.nivel DESC, d.donado DESC').all()
}

// Usuarios
export function obtenerUsuario(jid) { return db.prepare('SELECT * FROM usuarios WHERE jid = ?').get(jid) ?? null }
export function registrarUsuario(jid, nombre = null) {
  db.prepare('INSERT INTO usuarios (jid, nombre) VALUES (?, ?) ON CONFLICT(jid) DO UPDATE SET nombre = COALESCE(excluded.nombre, nombre), ult_visto = datetime(\'now\',\'localtime\')').run(jid, nombre)
  return obtenerUsuario(jid)
}
export function totalUsuarios() { return Number(db.prepare('SELECT COUNT(*) AS n FROM usuarios').get()?.n ?? 0) }
export function configurarPerfil(jid, campo, valor) {
  if (campo !== 'genero' && campo !== 'descripcion' && campo !== 'pasatiempo') return false
  if (!obtenerUsuario(jid)) registrarUsuario(jid)
  if (campo === 'genero') db.prepare('UPDATE usuarios SET genero = ? WHERE jid = ?').run(valor, jid)
  if (campo === 'descripcion') db.prepare('UPDATE usuarios SET descripcion = ? WHERE jid = ?').run(valor, jid)
  if (campo === 'pasatiempo') db.prepare('UPDATE usuarios SET pasatiempo = ? WHERE jid = ?').run(valor, jid)
  return obtenerUsuario(jid)
}
export function quitarGenero(jid) {
  const u = obtenerUsuario(jid)
  if (!u?.genero) return false
  db.prepare('UPDATE usuarios SET genero = NULL WHERE jid = ?').run(jid)
  return true
}
export function quitarDescripcion(jid) {
  const u = obtenerUsuario(jid)
  if (!u?.descripcion) return false
  db.prepare('UPDATE usuarios SET descripcion = NULL WHERE jid = ?').run(jid)
  return true
}
export function quitarPasatiempo(jid) {
  const u = obtenerUsuario(jid)
  if (!u?.pasatiempo) return false
  db.prepare('UPDATE usuarios SET pasatiempo = NULL WHERE jid = ?').run(jid)
  return true
}

// Notas
export function crearNota(jid, texto) { const r = db.prepare('INSERT INTO notas (jid, texto) VALUES (?, ?)').run(jid, texto); return Number(r.lastInsertRowid) }
export function listarNotas(jid) { return db.prepare('SELECT * FROM notas WHERE jid = ? ORDER BY id DESC').all(jid) }
export function eliminarNota(jid, id) { return db.prepare('DELETE FROM notas WHERE jid = ? AND id = ?').run(jid, id).changes }
export function totalNotas() { return Number(db.prepare('SELECT COUNT(*) AS n FROM notas').get()?.n ?? 0) }

// Daily
export function reclamarDiario(jid, racha) { db.prepare('UPDATE economia SET ultimo_diario = datetime(\'now\',\'localtime\'), racha = ? WHERE jid = ?').run(racha, jid) }

// Recarga
export function marcarUso(jid, comando) { db.prepare('INSERT INTO recarga (jid, comando, ultimo) VALUES (?,?,datetime(\'now\',\'localtime\')) ON CONFLICT(jid, comando) DO UPDATE SET ultimo = excluded.ultimo').run(jid, comando) }
export function ultimoUso(jid, comando) { return db.prepare('SELECT ultimo FROM recarga WHERE jid = ? AND comando = ?').get(jid, comando)?.ultimo ?? null }
export function liberarUso(jid, comando) { db.prepare('DELETE FROM recarga WHERE jid = ? AND comando = ?').run(jid, comando) }

// Última waifu random del chat (para .c)
export function guardarUltimaWaifu(chat, personaje) { db.prepare('INSERT INTO ultima_waifu (chat, personaje_id, nombre) VALUES (?,?,?) ON CONFLICT(chat) DO UPDATE SET personaje_id = excluded.personaje_id, nombre = excluded.nombre, enviado = datetime(\'now\',\'localtime\')').run(chat, personaje.id, personaje.nombre) }
export function obtenerUltimaWaifu(chat) { return db.prepare('SELECT personaje_id, nombre, enviado FROM ultima_waifu WHERE chat = ?').get(chat) ?? null }

// Banco
export function obtenerBanco(jid) {
  let row = db.prepare('SELECT * FROM economia_banco WHERE jid = ?').get(jid)
  if (!row) { db.prepare('INSERT INTO economia_banco (jid) VALUES (?)').run(jid); row = db.prepare('SELECT * FROM economia_banco WHERE jid = ?').get(jid) }
  return row
}
export function depositarMonedas(jid, monto) {
  obtenerBanco(jid)
  db.prepare('UPDATE economia_banco SET depositado = depositado + ? WHERE jid = ?').run(monto, jid)
  return true
}
export function retirarMonedas(jid, monto) {
  const b = obtenerBanco(jid)
  if (b.depositado < monto) return 0
  db.prepare('UPDATE economia_banco SET depositado = depositado - ? WHERE jid = ?').run(monto, jid)
  return monto
}

/** Oro disponible para gastar: cartera y banco */
export function oroDisponible(jid) {
  const eco = obtenerEconomia(jid)
  const banco = obtenerBanco(jid)
  const enMano = Math.max(0, Number(eco?.monedas) || 0)
  const enBanco = Math.max(0, Number(banco?.depositado) || 0)
  return { enMano, enBanco, total: enMano + enBanco }
}

/**
 * Cobra un gasto empezando por la cartera y siguiendo por el banco cuando el
 * disponible no alcanza. Una sola entrada en el log, con lo que salió del banco.
 * @returns {{ok: boolean, pagado: number, deMano: number, delBanco: number, faltan: number}}
 */
export function pagarConBanco(jid, monto, tipo = '', motivo = '') {
  const total = Math.trunc(Number(monto) || 0)
  if (!Number.isFinite(total) || total <= 0) {
    return { ok: true, pagado: 0, deMano: 0, delBanco: 0, faltan: 0 }
  }

  const { enMano, enBanco } = oroDisponible(jid)
  if (enMano + enBanco < total) {
    return { ok: false, pagado: 0, deMano: 0, delBanco: 0, faltan: total - enMano - enBanco }
  }

  const delBanco = Math.min(enBanco, Math.max(0, total - enMano))
  const deMano = total - delBanco

  if (deMano > 0) {
    db.prepare('UPDATE economia SET monedas = monedas - ? WHERE jid = ?').run(deMano, jid)
  }
  if (delBanco > 0) {
    db.prepare('UPDATE economia_banco SET depositado = depositado - ? WHERE jid = ?').run(delBanco, jid)
  }

  try {
    const nota = delBanco > 0 ? `${motivo} (${delBanco} del banco)` : motivo
    db.prepare('INSERT INTO economia_log (jid, tipo, monto, motivo) VALUES (?,?,?,?)')
      .run(jid, tipo || 'pago', -total, nota)
  } catch {}

  return { ok: true, pagado: total, deMano, delBanco, faltan: 0 }
}

// Modos
const MODO_DEFAULT = { bot: 1, economia: 1, gacha: 1, onlyadmin: 0, autoreact: 0, autoread: 1, rpg: 1, juegos: 1, antistatus: 0, anticall: 0 }
export function modoChat(chat, modo) {
  const fila = db.prepare('SELECT activo FROM modos_chat WHERE chat = ? AND modo = ?').get(chat, modo)
  if (fila) return Boolean(fila.activo)
  return Boolean(MODO_DEFAULT[modo] ?? 0)
}
export function configurarModo(chat, modo, activo) {
  db.prepare('INSERT INTO modos_chat (chat, modo, activo) VALUES (?, ?, ?) ON CONFLICT(chat, modo) DO UPDATE SET activo = excluded.activo').run(chat, modo, activo ? 1 : 0)
}
/** true si algun chat tiene ese modo activado (para ajustes globales como antistatus) */
export function algunModoActivo(modo) {
  return Boolean(db.prepare('SELECT 1 FROM modos_chat WHERE modo = ? AND activo = 1 LIMIT 1').get(modo))
}

// NSFW
export function nsfwActivo(chat) {
  const row = db.prepare('SELECT activo FROM nsfw WHERE chat = ?').get(chat)
  return Boolean(row?.activo)
}
export function configurarNSFW(chat, activo) {
  db.prepare('INSERT INTO nsfw (chat, activo) VALUES (?, ?) ON CONFLICT(chat) DO UPDATE SET activo = excluded.activo').run(chat, activo ? 1 : 0)
}

// Alertas
export function configurarAlertas(chat, activo) {
  db.prepare('INSERT INTO alertas_estado (chat, activo) VALUES (?, ?) ON CONFLICT(chat) DO UPDATE SET activo = excluded.activo').run(chat, activo ? 1 : 0)
}
export function alertasActivas(chat) {
  const fila = db.prepare('SELECT activo FROM alertas_estado WHERE chat = ?').get(chat)
  return Boolean(fila?.activo)
}
export function crearAlerta(chat, texto) {
  const r = db.prepare('INSERT INTO alertas (chat, texto) VALUES (?, ?)').run(chat, texto)
  return Number(r.lastInsertRowid)
}
export function listarAlertas(chat) {
  return db.prepare('SELECT * FROM alertas WHERE chat = ? AND activo = 1 ORDER BY id DESC').all(chat)
}
export function eliminarAlerta(chat, id) {
  return db.prepare('UPDATE alertas SET activo = 0 WHERE chat = ? AND id = ?').run(chat, Number(id)).changes
}
export function limpiarAlertas(chat) {
  return db.prepare('UPDATE alertas SET activo = 0 WHERE chat = ?').run(chat).changes
}
// Alertas automaticas (auto-eventos: promociones / cambios de config)
export function alertasAutoActivas(chat) {
  const v = obtenerAjuste('alertas_auto:' + chat)
  return String(v) === '1'
}
export function configurarAlertasAuto(chat, activo) {
  guardarAjuste('alertas_auto:' + chat, activo ? '1' : '0')
  return Boolean(activo)
}

// Antilink
export function obtenerAntilink(chat) {
  return db.prepare('SELECT * FROM antilink WHERE chat = ?').get(chat) ?? null
}
export function dominiosPermitidos(grupo) {
  const row = obtenerAntilink(grupo)
  try {
    if (!row?.whitelist) return []
    return Array.isArray(row.whitelist) ? row.whitelist : String(row.whitelist).split(/[,\s]+/).filter(Boolean)
  } catch { return [] }
}
export function configurarAntilink(jid, config = {}) {
  const actual = obtenerAntilink(jid) || {}
  db.prepare('INSERT INTO antilink (chat, activo, accion, whitelist) VALUES (?, ?, ?, ?) ON CONFLICT(chat) DO UPDATE SET activo = excluded.activo, accion = excluded.accion, whitelist = excluded.whitelist').run(jid, config.activo ?? actual.activo ?? 0, config.accion ?? actual.accion ?? 'kick', config.whitelist ?? actual.whitelist ?? '')
  return { activo: config.activo ?? actual.activo ?? 0, accion: config.accion ?? actual.accion ?? 'kick', whitelist: config.whitelist ?? actual.whitelist ?? '' }
}

// AFK
export function marcarAfk(jid, motivo, chat) { db.prepare('INSERT INTO afk (jid, motivo, chat) VALUES (?,?,?) ON CONFLICT(jid) DO UPDATE SET motivo=excluded.motivo, chat=excluded.chat, desde=datetime(\'now\',\'localtime\')').run(jid, motivo, chat) }
export function obtenerAfk(jid) { return db.prepare('SELECT * FROM afk WHERE jid = ?').get(jid) ?? null }
export function quitarAfk(jid) { db.prepare('DELETE FROM afk WHERE jid = ?').run(jid) }

// Cumpleanos
export function guardarCumpleanos(jid, fecha) { db.prepare('INSERT INTO cumpleanos (jid, fecha) VALUES (?, ?) ON CONFLICT(jid) DO UPDATE SET fecha = excluded.fecha').run(jid, fecha); return fecha }
export function obtenerCumpleanos(jid) { return db.prepare('SELECT fecha FROM cumpleanos WHERE jid = ?').get(jid)?.fecha ?? null }
export function quitarCumpleanos(jid) { return db.prepare('DELETE FROM cumpleanos WHERE jid = ?').run(jid).changes }
export function proximosCumpleanos(limite = 50) { return db.prepare('SELECT * FROM cumpleanos ORDER BY substr(fecha, 6, 5) ASC LIMIT ?').all(limite) }
export function todosCumpleanos() { return db.prepare('SELECT * FROM cumpleanos ORDER BY substr(fecha, 6, 5) ASC').all() }

// Mensajes por grupo
export function contarMensaje(jid, esGrupo) { }
export function contarMensajeUsuario(chat, usuario) { db.prepare('INSERT INTO mensajes_grupo (chat, usuario, cuenta) VALUES (?,?,1) ON CONFLICT(chat, usuario) DO UPDATE SET cuenta = cuenta + 1').run(chat, usuario) }
export function mensajesDeUsuario(chat, usuario) { return db.prepare('SELECT cuenta FROM mensajes_grupo WHERE chat = ? AND usuario = ?').get(chat, usuario)?.cuenta ?? 0 }
export function topMensajesGrupo(chat, limite = 10) { return db.prepare('SELECT usuario, cuenta FROM mensajes_grupo WHERE chat = ? ORDER BY cuenta DESC LIMIT ?').all(chat, limite) }
export function posicionMensajes(chat, usuario) {
  try {
    const filas = db.prepare('SELECT usuario, cuenta FROM mensajes_grupo WHERE chat = ? ORDER BY cuenta DESC, usuario ASC LIMIT 1000').all(chat)
    const idx = filas.findIndex((f) => String(f.usuario) === String(usuario))
    if (idx !== -1) return idx + 1
    const activos = filas.filter((f) => Number(f.cuenta) > 0).length
    return activos + 1
  } catch {
    return 0
  }
}

// Welcome
export function obtenerWelcome(grupo, tipo) { return db.prepare('SELECT * FROM welcome WHERE grupo = ? AND tipo = ?').get(grupo, tipo) ?? null }
export function configurarWelcome(grupo, tipo, opts = {}) {
  const texto = (opts && typeof opts === 'object') ? (opts.texto ?? opts.text ?? '') : (opts ?? '')
  const activo = (opts && typeof opts === 'object') ? (opts.activo ?? 1) : 1
  const imagen = (opts && typeof opts === 'object') ? (opts.imagen ?? null) : null
  const audio = (opts && typeof opts === 'object') ? (opts.audio ?? null) : null
  db.prepare('INSERT INTO welcome (grupo, tipo, texto, imagen, audio, activo) VALUES (?,?,?,?,?,?) ON CONFLICT(grupo, tipo) DO UPDATE SET texto=excluded.texto, imagen=excluded.imagen, audio=excluded.audio, activo=excluded.activo').run(grupo, tipo, texto, imagen, audio, activo ? 1 : 0)
  return obtenerWelcome(grupo, tipo)
}
export function eliminarWelcome(grupo, tipo) { db.prepare('DELETE FROM welcome WHERE grupo = ? AND tipo = ?').run(grupo, tipo) }

// Ajustes
export function obtenerAjuste(clave) { return db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave)?.valor ?? null }
export function guardarAjuste(clave, valor) { db.prepare('INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor').run(clave, valor) }

// Matrimonio
export function casarse(jid, pareja) { db.prepare('INSERT INTO matrimonios (jid, pareja) VALUES (?, ?) ON CONFLICT(jid) DO UPDATE SET pareja = excluded.pareja, fecha = datetime(\'now\',\'localtime\')').run(jid, pareja); db.prepare("INSERT INTO historial_matrimonio (jid, pareja, tipo) VALUES (?, ?, 'boda')").run(jid, pareja); return true }
export function obtenerPareja(jid) { return db.prepare('SELECT * FROM matrimonios WHERE jid = ?').get(jid)?.pareja ?? null }
export function divorciarse(jid) { const pareja = obtenerPareja(jid); if (!pareja) return null; db.prepare('DELETE FROM matrimonios WHERE jid = ? OR pareja = ?').run(jid, jid); db.prepare("INSERT INTO historial_matrimonio (jid, pareja, tipo) VALUES (?, ?, 'divorcio')").run(jid, pareja); return pareja }
export function proponerMatrimonio(desde, para) { db.prepare("INSERT INTO matrimonio_pendiente (tipo, desde, para) VALUES ('boda', ?, ?)").run(desde, para); return true }
export function proponerDivorcio(desde) { const pareja = obtenerPareja(desde); if (!pareja) return false; db.prepare("INSERT INTO matrimonio_pendiente (tipo, desde, para) VALUES ('divorcio', ?, ?)").run(desde, pareja); return true }
export function pendienteMatrimonio(jid) { return db.prepare("SELECT * FROM matrimonio_pendiente WHERE tipo = 'boda' AND para = ?").get(jid) ?? null }
export function pendienteDivorcio(jid) { return db.prepare("SELECT * FROM matrimonio_pendiente WHERE tipo = 'divorcio' AND para = ?").get(jid) ?? null }
export function aceptarMatrimonio(jid) { const p = pendienteMatrimonio(jid); if (!p) return null; db.prepare("DELETE FROM matrimonio_pendiente WHERE tipo = 'boda' AND desde = ? AND para = ?").run(p.desde, jid); casarse(p.desde, jid); casarse(jid, p.desde); return p.desde }
export function aceptarDivorcio(jid) { const p = pendienteDivorcio(jid); if (!p) return null; db.prepare("DELETE FROM matrimonio_pendiente WHERE tipo = 'divorcio' AND desde = ? AND para = ?").run(p.desde, jid); divorciarse(p.desde); return p.desde }
export function historialMatrimonio(jid, limite = 10) { return db.prepare('SELECT * FROM historial_matrimonio WHERE jid = ? ORDER BY id DESC LIMIT ?').all(jid, limite) }

// Advertencias
export function registrarAdvertencia(grupo, jid, razon = '', ejecutor = '') { const res = db.prepare('INSERT INTO advertencias (grupo, jid, razon, ejecutor) VALUES (?,?,?,?)').run(grupo, jid, String(razon || ''), String(ejecutor || '')); return Number(res.lastInsertRowid) }
export function contarAdvertencias(grupo, jid) { return Number(db.prepare('SELECT COUNT(*) AS n FROM advertencias WHERE grupo = ? AND jid = ?').get(grupo, jid)?.n ?? 0) }
export function listarAdvertencias(grupo, jid, limite = 20) { return db.prepare('SELECT * FROM advertencias WHERE grupo = ? AND jid = ? ORDER BY id DESC LIMIT ?').all(grupo, jid, limite) }
export function limiteAdvertencias(grupo) { const valor = obtenerAjuste(`warnlimite:${grupo}`); const n = Number(valor); return n >= 1 ? Math.floor(n) : 3 }
export function configurarLimiteAdvertencias(grupo, limite) { const n = Math.max(1, Math.floor(Number(limite))); guardarAjuste(`warnlimite:${grupo}`, n); return n }
export function borrarAdvertencias(grupo, jid) { return db.prepare('DELETE FROM advertencias WHERE grupo = ? AND jid = ?').run(grupo, jid).changes }

// Palabras prohibidas
export function agregarPalabraProhibida(chat, palabra) { const p = String(palabra || '').trim().toLowerCase(); if (!p) return false; try { db.prepare('INSERT INTO palabras_prohibidas (chat, palabra) VALUES (?, ?)').run(chat, p); return true } catch { return false } }
export function quitarPalabraProhibida(chat, palabra) { const p = String(palabra || '').trim().toLowerCase(); if (!p) return 0; return db.prepare('DELETE FROM palabras_prohibidas WHERE chat = ? AND palabra = ?').run(chat, p).changes }
export function listarPalabrasProhibidas(chat) { return db.prepare('SELECT palabra FROM palabras_prohibidas WHERE chat = ? ORDER BY palabra ASC').all(chat).map((r) => r.palabra) }
export function limpiarPalabrasProhibidas(chat) { return db.prepare('DELETE FROM palabras_prohibidas WHERE chat = ?').run(chat).changes }
export function palabraProhibidaEn(chat, texto) {
  if (!texto) return null
  const norm = String(texto).toLowerCase()
  const palabras = listarPalabrasProhibidas(chat)
  for (const p of palabras) {
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${esc}([^\\p{L}\\p{N}]|$)`, 'iu')
    if (re.test(norm)) return p
  }
  return null
}

// Recarga

// Anti-eliminar mensajes
export function setAntiDelete(chat, activo) { db.prepare('INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor').run('anti_delete:' + chat, activo ? '1' : '0'); return Boolean(activo) }
export function getAntiDelete(chat) { const v = db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get('anti_delete:' + chat)?.valor; return String(v) === '1' }
export function limpiarAntiDelete(chat) { db.prepare('DELETE FROM ajustes WHERE clave = ?').run('anti_delete:' + chat) }

// Gacha personajes
export function listarPersonajesGacha() { return db.prepare('SELECT * FROM gacha_personajes').all() }

/**
 * Anota una tirada y mueve los dos contadores de garantia.
 *
 *   pity      — tiradas seguidas sin epico o mejor. Sube con comun y raro,
 *               vuelve a 0 con epico, legendario o mitico.
 *   pity_alto — tiradas seguidas sin legendario ni mitico. Sube con comun,
 *               raro y epico, vuelve a 0 solo con las dos altas.
 *
 * Es lo que alimenta las garantias de lib/gacha.js (PITY_MEDIO_DURO,
 * PITY_SUAVE y PITY_DURO).
 *
 * @param {string} jid    quien tira
 * @param {string} rareza rareza que salio
 * @returns {{ rolls: number, pity: number, pity_alto: number, ultimo_roll: string|null }}
 */
export function registrarRollGacha(jid, rareza = 'comun') {
  const media = rareza === 'epico' || rareza === 'legendario' || rareza === 'mitico'
  const alta = rareza === 'legendario' || rareza === 'mitico'

  db.prepare(`
    INSERT INTO gacha_stats (jid, rolls, pity, pity_alto, ultimo_roll)
    VALUES (?, 1, ?, ?, datetime('now','localtime'))
    ON CONFLICT(jid) DO UPDATE SET
      rolls = rolls + 1,
      pity = CASE WHEN ? = 1 THEN 0 ELSE pity + 1 END,
      pity_alto = CASE WHEN ? = 1 THEN 0 ELSE pity_alto + 1 END,
      ultimo_roll = datetime('now','localtime')
  `).run(jid, media ? 0 : 1, alta ? 0 : 1, media ? 1 : 0, alta ? 1 : 0)

  return statsGacha(jid)
}

export function statsGacha(jid) {
  const fila = db
    .prepare('SELECT rolls, pity, pity_alto, ultimo_roll FROM gacha_stats WHERE jid = ?')
    .get(jid)
  return {
    rolls: Number(fila?.rolls ?? 0),
    pity: Number(fila?.pity ?? 0),
    pity_alto: Number(fila?.pity_alto ?? 0),
    ultimo_roll: fila?.ultimo_roll ?? null,
  }
}
export function ventaDePersonajeActiva() { return null }
export function setImagenPersonaje(id, url) { db.prepare('UPDATE gacha_personajes SET imagen = ? WHERE id = ?').run(url, id) }

// Registrar accion
export function registrarAccion(grupo, jid, accion, motivo = '', ejecutor = '') { try { db.prepare('INSERT INTO moderacion (grupo, jid, accion, motivo, ejecutor) VALUES (?,?,?,?,?)').run(grupo, jid, accion, motivo, ejecutor) } catch {} }

// Ahorcado / adivinar
export function guardarAhorcado(grupo, estado) { db.prepare('DELETE FROM ahorcado WHERE grupo = ?').run(grupo); db.prepare('INSERT INTO ahorcado (grupo, estado) VALUES (?, ?)').run(grupo, JSON.stringify(estado)) }
export function obtenerAhorcado(grupo) { const r = db.prepare('SELECT estado FROM ahorcado WHERE grupo = ? ORDER BY creado_en DESC LIMIT 1').get(grupo); try { return r ? JSON.parse(r.estado) : null } catch { return null } }
export function borrarAhorcado(grupo) { db.prepare('DELETE FROM ahorcado WHERE grupo = ?').run(grupo) }

// Poker (una mesa activa por chat)
export function guardarPoker(chat, estado) { db.prepare('DELETE FROM poker WHERE chat = ?').run(chat); db.prepare('INSERT INTO poker (chat, estado) VALUES (?, ?)').run(chat, JSON.stringify(estado)) }
export function obtenerPoker(chat) { const r = db.prepare('SELECT estado FROM poker WHERE chat = ? ORDER BY creado_en DESC LIMIT 1').get(chat); try { return r ? JSON.parse(r.estado) : null } catch { return null } }
export function borrarPoker(chat) { db.prepare('DELETE FROM poker WHERE chat = ?').run(chat) }
export function todasLasPoker() { return db.prepare('SELECT chat, estado FROM poker').all() }
export function guardarAdivinar(jid, numero, maximo, intentos = 0) { db.prepare('INSERT INTO adivinar (jid, numero, maximo, intentos) VALUES (?,?,?,?)').run(jid, numero, maximo, intentos) }
export function obtenerAdivinar(jid) { return db.prepare('SELECT * FROM adivinar WHERE jid = ?').get(jid) ?? null }
export function borrarAdivinar(jid) { db.prepare('DELETE FROM adivinar WHERE jid = ?').run(jid) }

// Notas

// Tiradas
export function registrarTirada(jid, resultado) { const r = db.prepare('INSERT INTO tiradas (jid, resultado) VALUES (?, ?)').run(jid, resultado); return Number(r.lastInsertRowid) }
export function statsTiradas(jid) { return db.prepare('SELECT COUNT(*) AS total FROM tiradas WHERE jid = ?').get(jid) ?? { total: 0 } }

// Sugerencias
export function crearSugerencia(jid, texto) { const r = db.prepare('INSERT INTO sugerencias (jid, texto) VALUES (?, ?)').run(jid, texto); return Number(r.lastInsertRowid) }
export function listarSugerencias(limite = 10) { return db.prepare('SELECT * FROM sugerencias ORDER BY id DESC LIMIT ?').all(limite) }
export function contarSugerencias() { return Number(db.prepare('SELECT COUNT(*) AS n FROM sugerencias').get()?.n ?? 0) }

// Advertencias por grupo (lista general)
export function advertenciasPorGrupo(grupo) {
  return db
    .prepare(
      `SELECT jid, COUNT(*) AS total FROM advertencias
        WHERE grupo = ? GROUP BY jid ORDER BY total DESC, jid ASC`
    )
    .all(grupo)
}

// Bot primario del grupo
export function primarioDe(grupo) { return obtenerAjuste(`primario:${grupo}`) }
export function configurarPrimario(grupo, jid) { guardarAjuste(`primario:${grupo}`, String(jid || '')); return jid }
export function quitarPrimario(grupo) { db.prepare('DELETE FROM ajustes WHERE clave = ?').run(`primario:${grupo}`) }

// Config gacha
export function obtenerConfigGacha(chat) { let row = db.prepare('SELECT * FROM gacha_config WHERE grupo = ?').get(chat); if (!row) { db.prepare('INSERT INTO gacha_config (grupo) VALUES (?)').run(chat); row = db.prepare('SELECT * FROM gacha_config WHERE grupo = ?').get(chat) }; return row }
export function setConfigGacha(chat, cfg = {}) { db.prepare('INSERT INTO gacha_config (grupo, coste, cooldown) VALUES (?,?,?) ON CONFLICT(grupo) DO UPDATE SET coste=excluded.coste, cooldown=excluded.cooldown').run(chat, cfg.coste ?? 50, cfg.cooldown ?? 30); return db.prepare('SELECT * FROM gacha_config WHERE grupo = ?').get(chat) }

// Inventario gacha
export function agregarAlInventario(jid, personajeId, cantidad = 1) { db.prepare('INSERT INTO gacha_inventario (jid, personaje_id, cantidad) VALUES (?,?,?) ON CONFLICT(jid, personaje_id) DO UPDATE SET cantidad = cantidad + excluded.cantidad').run(jid, personajeId, cantidad); return { jid, personaje_id: personajeId, cantidad } }
export function ultimoRollGacha(jid) { return db.prepare('SELECT ultimo_roll FROM gacha_stats WHERE jid = ?').get(jid)?.ultimo_roll ?? null }

// Historial grupo
export function historialGrupo(grupo, limite = 10) { return [] }

// Mensajes
export function totalChats() { return Number(db.prepare('SELECT COUNT(DISTINCT jid) AS n FROM chats').get()?.n ?? 0) }
export function totalMensajes() { return Number(db.prepare('SELECT COALESCE(SUM(cuenta),0) AS n FROM mensajes_grupo').get()?.n ?? 0) }
export function obtenerMensajes(jid) { return Number(db.prepare('SELECT COALESCE(SUM(cuenta),0) AS n FROM mensajes_grupo WHERE chat = ?').get(jid)?.n ?? 0) }

// Sugerencias

// Top economia
export function topEconomia(limite = 10) { return db.prepare('SELECT jid, monedas, nivel, experiencia FROM economia ORDER BY monedas DESC, experiencia DESC LIMIT ?').all(limite) }

// Gacha stats

// Configurar welcome (already above) - redefine safe
// (eliminarWelcome already above)

// Obtener mensajes (already above)

// ───────────── (stubs for missing) ─────────────

export function obtenerPersonajeGacha(id) {
  return db.prepare('SELECT * FROM gacha_personajes WHERE id = ?').get(id) ?? null
}
export function personajePorNombre(nombre) {
  if (!nombre) return null
  return db.prepare('SELECT * FROM gacha_personajes WHERE LOWER(nombre) = LOWER(?)').get(String(nombre).trim()) ?? null
}
export function tieneReclamado(jid, personajeId) {
  return Boolean(db.prepare('SELECT 1 FROM gacha_claims WHERE jid = ? AND personaje_id = ?').get(jid, personajeId))
}
export function marcarFavorito(jid, personajeId) {
  db.prepare('UPDATE gacha_claims SET favorito = 0 WHERE jid = ?').run(jid)
  db.prepare('UPDATE gacha_claims SET favorito = 1 WHERE jid = ? AND personaje_id = ?').run(jid, personajeId)
  return true
}
export function limpiarFavorito(jid) {
  return db.prepare('UPDATE gacha_claims SET favorito = 0 WHERE jid = ? AND favorito = 1').run(jid).changes > 0
}
export function favoritoGacha(jid) {
  const row = db.prepare('SELECT gp.id, gp.nombre, gp.anime FROM gacha_claims gc JOIN gacha_personajes gp ON gp.id = gc.personaje_id WHERE gc.jid = ? AND gc.favorito = 1').get(jid)
  if (!row) return undefined
  return { id: row.id, nombre: row.nombre, anime: row.anime }
}
export function agregarPersonajeGacha({ nombre, anime, rareza, imagen = null, genero = null, favoritos = null, seriePop = null, importancia = null } = {}) {
  const valor = (RAREZAS && RAREZAS[rareza]?.valor) ?? 15
  const r = db.prepare('INSERT INTO gacha_personajes (nombre, anime, rareza, valor, imagen, genero, favoritos, serie_pop, importancia) VALUES (?,?,?,?,?,?,?,?,?)').run(nombre, anime, rareza, valor, imagen, genero ?? '', favoritos, seriePop, importancia)
  return Number(r.lastInsertRowid)
}

/**
 * Reescribe rareza, valor y los tres numeros que la sostienen (favoritos del
 * personaje, popularidad de la serie e importancia dentro de ella).
 */
export function actualizarRarezaPersonaje(id, rareza, valor, favoritos = null, { seriePop = null, importancia = null } = {}) {
  db.prepare('UPDATE gacha_personajes SET rareza = ?, valor = ?, favoritos = ?, serie_pop = ?, importancia = ? WHERE id = ?').run(rareza, valor, favoritos, seriePop, importancia, id)
  return true
}

export function reclamarPersonaje(jid, personajeId, grupo = null) {
  try { db.prepare('INSERT INTO gacha_claims (jid, personaje_id, grupo, favorito) VALUES (?,?,?,0)').run(jid, personajeId, grupo) } catch {}
  return true
}

export function iniciarAdivinar(jid, numero, maximo) {
  db.prepare('DELETE FROM adivinar WHERE jid = ?').run(jid)
  db.prepare('INSERT INTO adivinar (jid, numero, maximo, intentos) VALUES (?,?,?,0)').run(jid, numero, maximo)
  return obtenerAdivinar(jid)
}
export function sumarIntentoAdivinar(jid) {
  db.prepare('UPDATE adivinar SET intentos = intentos + 1 WHERE jid = ?').run(jid)
  return obtenerAdivinar(jid)
}

export function activarAntilink(jid, tipo = 'kick') {
  return configurarAntilink(jid, { activo: true, accion: tipo })
}
export function desactivarAntilink(jid) {
  return configurarAntilink(jid, { activo: false })
}
export function agregarDominioPermitido(jid, dominio) {
  const actual = obtenerAntilink(jid) || {}
  const lista = Array.isArray(actual.whitelist) ? actual.whitelist : String(actual.whitelist || '').split(/[,\s]+/).filter(Boolean)
  if (!lista.includes(dominio)) lista.push(dominio)
  return configurarAntilink(jid, { whitelist: lista })
}
export function quitarDominioPermitido(jid, dominio) {
  const actual = obtenerAntilink(jid) || {}
  const lista = (Array.isArray(actual.whitelist) ? actual.whitelist : String(actual.whitelist || '').split(/[,\s]+/).filter(Boolean)).filter((d) => d !== dominio)
  return configurarAntilink(jid, { whitelist: lista })
}

export function marcarRob(jid) { db.prepare("UPDATE economia SET ultimo_robo = datetime('now','localtime') WHERE jid = ?").run(jid) }

export function marcarTrabajo(jid) { db.prepare("UPDATE economia SET ultimo_trabajo = datetime('now','localtime') WHERE jid = ?").run(jid) }

export function totalMonedas() { return Number(db.prepare('SELECT COALESCE(SUM(monedas),0) AS n FROM economia').get()?.n ?? 0) }

export function transferirMonedas(desde, para, monto, tipo = 'pay', descripcion = 'Pago') {
  if (!monto || monto <= 0) return { ok: false, motivo: 'cantidad' }
  const eco = obtenerEconomia(desde)
  if (eco.monedas < monto) return { ok: false, motivo: 'saldo' }
  restarMonedas(desde, monto, tipo, descripcion)
  sumarMonedas(para, monto, tipo, descripcion === 'Pago recibido' ? 'Pago recibido' : (tipo === 'regalo' ? 'Regalo recibido' : 'Pago recibido'))
  return { ok: true }
}

export function ultimoRob(jid) { return db.prepare('SELECT ultimo_robo FROM economia WHERE jid = ?').get(jid)?.ultimo_robo ?? null }

export function configGacha(jid) { return obtenerConfigGacha(jid) }

export function contarPersonajesGacha() { return Number(db.prepare('SELECT COUNT(*) AS n FROM gacha_personajes').get()?.n ?? 0) }

export function inventarioGacha(jid) {
  return db.prepare('SELECT gi.*, gp.nombre, gp.anime, gp.rareza, gp.valor FROM gacha_inventario gi JOIN gacha_personajes gp ON gp.id = gi.personaje_id WHERE gi.jid = ?').all(jid)
}
export function listarAnimesGacha() {
  const filas = db
    .prepare(
      'SELECT anime, COUNT(*) AS n FROM gacha_personajes ' +
        "WHERE anime IS NOT NULL AND TRIM(anime) <> '' GROUP BY anime"
    )
    .all()

  // Une las variantes de escritura del mismo anime ("One Piece" / "ONE PIECE")
  const mapa = new Map()
  for (const fila of filas) {
    const nombre = String(fila.anime).trim()
    const clave = nombre.toLowerCase()
    const previo = mapa.get(clave)
    const n = Number(fila.n) || 0
    if (!previo) {
      mapa.set(clave, { anime: nombre, personajes: n })
      continue
    }
    previo.personajes += n
    // Se queda la escritura con minusculas ("One Piece" antes que "ONE PIECE")
    if (/[a-z]/.test(nombre) && !/[a-z]/.test(previo.anime)) previo.anime = nombre
  }

  return [...mapa.values()].sort(
    (a, b) => b.personajes - a.personajes || a.anime.localeCompare(b.anime)
  )
}
export function reclamacionesGacha(jid) {
  return db.prepare('SELECT gc.*, gp.nombre, gp.anime, gp.rareza, gp.valor FROM gacha_claims gc JOIN gacha_personajes gp ON gp.id = gc.personaje_id WHERE gc.jid = ?').all(jid)
}
export function quitarReclamacion(jid, personajeId) {
  return db.prepare('DELETE FROM gacha_claims WHERE jid = ? AND personaje_id = ?').run(jid, personajeId).changes
}
export function transferirReclamacion(desde, para, personajeId) {
  db.prepare('UPDATE gacha_claims SET jid = ? WHERE jid = ? AND personaje_id = ?').run(para, desde, personajeId)
  return true
}
export function ponerEnVenta(jid, personajeId, precio, grupo = null) {
  const r = db.prepare('INSERT INTO gacha_ventas (personaje_id, vendedor, precio, estado, grupo) VALUES (?,?,?,?,?)').run(personajeId, jid, precio, 'venta', grupo)
  return Number(r.lastInsertRowid)
}
export function quitarDeVenta(jid, ventaId) {
  return db.prepare("UPDATE gacha_ventas SET estado = 'cancelada' WHERE id = ? AND vendedor = ?").run(ventaId, jid).changes
}
export function listarVentas(arg = null) {
  const grupo = (arg && typeof arg === 'object') ? (arg.grupo ?? null) : arg
  const limite = (arg && typeof arg === 'object') ? (arg.limite ?? 100) : 100
  if (grupo) {
    return db.prepare("SELECT v.*, p.nombre AS personaje_nombre, p.anime AS personaje_anime FROM gacha_ventas v LEFT JOIN gacha_personajes p ON p.id = v.personaje_id WHERE v.estado = 'venta' AND v.grupo = ? LIMIT ?").all(grupo, limite)
  }
  return db.prepare("SELECT v.*, p.nombre AS personaje_nombre, p.anime AS personaje_anime FROM gacha_ventas v LEFT JOIN gacha_personajes p ON p.id = v.personaje_id WHERE v.estado = 'venta' LIMIT ?").all(limite)
}
export function ventaPorId(id) {
  return db.prepare("SELECT v.*, p.nombre AS personaje_nombre, p.anime AS personaje_anime FROM gacha_ventas v LEFT JOIN gacha_personajes p ON p.id = v.personaje_id WHERE v.id = ?").get(id) ?? null
}
export function marcarVendido(ventaId, comprador) {
  db.prepare("UPDATE gacha_ventas SET estado = 'vendida', comprador = ? WHERE id = ?").run(comprador, ventaId)
  return true
}
export function votarPersonaje(jid, personajeId) {
  let nuevo = false
  try {
    nuevo = db.prepare('INSERT INTO gacha_votos (personaje_id, jid) VALUES (?, ?)').run(personajeId, jid).changes > 0
  } catch {
    nuevo = false
  }
  // Solo el primer voto de cada usuario sube el valor del personaje
  if (nuevo) {
    db.prepare('UPDATE gacha_personajes SET valor = valor + 5 WHERE id = ?').run(personajeId)
  }
  return nuevo
}
export function votosPersonaje(personajeId) {
  return Number(db.prepare('SELECT COUNT(*) AS n FROM gacha_votos WHERE personaje_id = ?').get(personajeId)?.n ?? 0)
}
export function topFavoritos(limite = 10) {
  return db.prepare('SELECT gp.id, gp.nombre, gp.anime, COUNT(gc.jid) AS favs FROM gacha_claims gc JOIN gacha_personajes gp ON gp.id = gc.personaje_id WHERE gc.favorito = 1 GROUP BY gp.id ORDER BY favs DESC LIMIT ?').all(limite)
}
export function topValor(limite = 10) {
  return db.prepare(`
    SELECT gp.id, gp.nombre, gp.anime, gp.rareza, gp.valor,
           (SELECT COUNT(*) FROM gacha_votos g WHERE g.personaje_id = gp.id) AS votos
    FROM gacha_personajes gp
    ORDER BY CASE gp.rareza
               WHEN 'mitico' THEN 5
               WHEN 'legendario' THEN 4
               WHEN 'epico' THEN 3
               WHEN 'raro' THEN 2
               ELSE 1
             END DESC,
             gp.valor DESC
    LIMIT ?
  `).all(limite)
}
export function guardarClaimMsg(jid, texto) {
  db.prepare("INSERT INTO gacha_claimmsg (jid, texto) VALUES (?, ?) ON CONFLICT(jid) DO UPDATE SET texto = excluded.texto, actualizado_en = datetime('now','localtime')").run(jid, texto)
  return true
}
export function obtenerClaimMsg(jid) {
  return db.prepare('SELECT texto FROM gacha_claimmsg WHERE jid = ?').get(jid)?.texto ?? null
}
export function quitarClaimMsg(jid) {
  const r = db.prepare('DELETE FROM gacha_claimmsg WHERE jid = ?').run(jid)
  return r.changes > 0
}

export function setGeneroPersonaje(id, genero) {
  db.prepare('UPDATE gacha_personajes SET genero = ? WHERE id = ?').run(genero, id)
  return genero
}
export function setVideoPersonaje(id, url) {
  const exists = db.prepare('SELECT id FROM gacha_personajes WHERE id = ?').get(id)
  if (!exists) return false
  db.prepare('UPDATE gacha_personajes SET video = ? WHERE id = ?').run(url, id)
  return true
}

// ───────────── UNO ─────────────
/** Crea una partida de UNO y devuelve su id */
export function crearPartidaUno({ grupo, creador = '', apuesta = 0 } = {}) {
  const r = db.prepare(`
    INSERT INTO uno_partidas (grupo, estado, creador, apuesta, mazo, color, ultima, turno, direccion)
    VALUES (?, 'esperando', ?, ?, '[]', NULL, NULL, NULL, 1)
  `).run(grupo, creador || '', Math.max(0, Math.trunc(Number(apuesta) || 0)))
  return Number(r.lastInsertRowid)
}

/** Partida activa (esperando o jugando) de un grupo */
export function partidaUnoActiva(grupo) {
  return db.prepare(`
    SELECT id, grupo, estado, creador, apuesta, mazo, color, ultima, turno, direccion, creado_en
    FROM uno_partidas
    WHERE grupo = ? AND estado IN ('esperando', 'jugando')
    ORDER BY id DESC
    LIMIT 1
  `).get(grupo) ?? null
}

/** Partidas activas en las que participa un jugador (para jugar por privado) */
export function partidasUnoDeJugador(jid) {
  return db.prepare(`
    SELECT p.id, p.grupo, p.estado, p.creador, p.apuesta, p.mazo, p.color, p.ultima, p.turno, p.direccion, p.creado_en
    FROM uno_partidas p
    JOIN uno_jugadores j ON j.partida_id = p.id
    WHERE j.jid = ? AND p.estado IN ('esperando', 'jugando')
    ORDER BY p.id DESC
  `).all(jid)
}

/** Campos que se pueden actualizar de una partida */
const CAMPOS_PARTIDA_UNO = new Set(['estado', 'mazo', 'color', 'ultima', 'turno', 'direccion', 'apuesta'])

/** Actualiza solo los campos permitidos de una partida */
export function actualizarPartidaUno(id, cambios = {}) {
  const asignaciones = []
  const valores = []
  for (const [campo, valor] of Object.entries(cambios)) {
    if (!CAMPOS_PARTIDA_UNO.has(campo)) continue
    asignaciones.push(`${campo} = ?`)
    valores.push(valor)
  }
  if (!asignaciones.length) return false
  valores.push(id)
  const r = db.prepare(`UPDATE uno_partidas SET ${asignaciones.join(', ')} WHERE id = ?`).run(...valores)
  return r.changes > 0
}

/** Agrega un jugador a la partida (sin duplicarlo) */
export function agregarJugadorUno(partidaId, jid, mano = []) {
  db.prepare(`
    INSERT INTO uno_jugadores (partida_id, jid, mano, puntos, pasado)
    VALUES (?, ?, ?, 0, 0)
    ON CONFLICT(partida_id, jid) DO NOTHING
  `).run(partidaId, jid, JSON.stringify(Array.isArray(mano) ? mano : []))
  return true
}

/** Jugadores de una partida, en orden de entrada */
export function jugadoresUno(partidaId) {
  return db.prepare(`
    SELECT jid, mano, puntos, pasado
    FROM uno_jugadores
    WHERE partida_id = ?
    ORDER BY rowid ASC
  `).all(partidaId).map((j) => ({
    jid: j.jid,
    mano: j.mano || '[]',
    puntos: Number(j.puntos) || 0,
    pasado: Boolean(j.pasado),
  }))
}

/** Guarda la mano de un jugador */
export function actualizarManoUno(partidaId, jid, mano) {
  const r = db.prepare('UPDATE uno_jugadores SET mano = ? WHERE partida_id = ? AND jid = ?')
    .run(JSON.stringify(Array.isArray(mano) ? mano : []), partidaId, jid)
  return r.changes > 0
}

/** Marca o desmarca a un jugador como pasado */
export function marcarPasoUno(partidaId, jid, pasado) {
  const r = db.prepare('UPDATE uno_jugadores SET pasado = ? WHERE partida_id = ? AND jid = ?')
    .run(pasado ? 1 : 0, partidaId, jid)
  return r.changes > 0
}

/** Quita a un jugador de la partida */
export function quitarJugadorUno(partidaId, jid) {
  const r = db.prepare('DELETE FROM uno_jugadores WHERE partida_id = ? AND jid = ?').run(partidaId, jid)
  return r.changes > 0
}

/** Termina o cancela una partida */
export function terminarPartidaUno(partidaId, estado = 'terminada') {
  const r = db.prepare('UPDATE uno_partidas SET estado = ? WHERE id = ?').run(estado, partidaId)
  return r.changes > 0
}

/** Ultimas partidas finalizadas */
export function partidasUnoFinalizadas(limite = 10) {
  const tope = Math.max(1, Math.trunc(Number(limite) || 10))
  return db.prepare(`
    SELECT id, grupo, estado, apuesta, creado_en
    FROM uno_partidas
    WHERE estado IN ('terminada', 'cancelada')
    ORDER BY id DESC
    LIMIT ?
  `).all(tope)
}

/** Suma los puntos que gano un jugador en una partida */
export function sumarPuntosUno(partidaId, jid, puntos) {
  const suma = Math.max(0, Math.trunc(Number(puntos) || 0))
  if (!suma) return false
  const r = db.prepare('UPDATE uno_jugadores SET puntos = puntos + ? WHERE partida_id = ? AND jid = ?')
    .run(suma, partidaId, jid)
  return r.changes > 0
}

/** Puntos acumulados de un jugador */
export function puntosUno(jid) {
  return Number(db.prepare('SELECT COALESCE(SUM(puntos), 0) AS total FROM uno_jugadores WHERE jid = ?').get(jid)?.total ?? 0)
}

/** Clasificacion global de UNO */
export function topUno(limite = 10) {
  const tope = Math.max(1, Math.trunc(Number(limite) || 10))
  return db.prepare(`
    SELECT jid, SUM(puntos) AS puntos
    FROM uno_jugadores
    GROUP BY jid
    HAVING puntos > 0
    ORDER BY puntos DESC
    LIMIT ?
  `).all(tope)
}

export function borrarPersonajeGacha(id) { db.prepare('DELETE FROM gacha_personajes WHERE id = ?').run(id); db.prepare('DELETE FROM gacha_claims WHERE personaje_id = ?').run(id); db.prepare('DELETE FROM gacha_inventario WHERE personaje_id = ?').run(id) }

export function estadoPersonaje(id) {
  const claim = db.prepare('SELECT jid FROM gacha_claims WHERE personaje_id = ? LIMIT 1').get(id)
  return { dueno: claim?.jid ?? null }
}
