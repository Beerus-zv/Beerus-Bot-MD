/**
 * Estado de autenticacion de Baileys en un unico archivo SQLite.
 *
 * Sustituye a `useMultiFileAuthState`, que escribe una llave por archivo
 * (pre-key, session, lid-mapping...). Con una sesion normal eso son ~1400
 * archivos y ~1400 escrituras por lote; aqui es una fila y una transaccion.
 *
 * Ventajas concretas:
 *   - Atomicidad: una escritura o entra entera o no entra. El multi-archivo
 *     puede dejar una llave a medias si el proceso muere.
 *   - Arranque: una consulta en vez de 1400 lecturas de archivo.
 *   - Menos basura: la carpeta de sesion pasa de 1400 archivos a 1.
 *
 * Formato de las llaves: se guarda `JSON.stringify(valor, BufferJSON.replacer)`,
 * igual que el multi-archivo, asi el contenido es identico byte a byte.
 *
 * Migracion: si no existe la base y hay archivos .json (formato antiguo), se
 * importan todos y la carpeta vieja se mueve a `legacy-<fecha>/`. No se borra
 * nada: si algo sale mal, la sesion original sigue ahi.
 */
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { BufferJSON, initAuthCreds, proto } from '@whiskeysockets/baileys'
import { log } from './logger.js'

/** Nombre del archivo de sesion dentro de la carpeta de auth */
const ARCHIVO_DB = 'sesion.sqlite'

/**
 * Categorias que usa Baileys como prefijo de archivo / columna.
 * El orden importa: se comprueba de mas larga a mas corta para que
 * 'sender-key-memory' no se confunda con 'sender-key'.
 */
const CATEGORIAS = [
  'app-state-sync-version',
  'app-state-sync-key',
  'sender-key-memory',
  'sender-key',
  'identity-key',
  'device-list',
  'lid-mapping',
  'tctoken',
  'pre-key',
  'session',
]

/**
 * Misma transformacion que usa Baileys para el nombre de archivo.
 * Se aplica al id en lectura y escritura para que las llaves importadas
 * desde el multi-archivo coincidan con las que pide el socket.
 */
function fijarId(id) {
  return String(id).replace(/\//g, '__').replace(/:/g, '-')
}

/** Serializa un valor con el mismo formato que el multi-archivo */
function serializar(valor) {
  return JSON.stringify(valor, BufferJSON.replacer)
}

/** Deserializa y rehidrata los tipos especiales de Baileys */
function deserializar(categoria, texto) {
  let valor = JSON.parse(texto, BufferJSON.reviver)
  if (categoria === 'app-state-sync-key' && valor) {
    valor = proto.Message.AppStateSyncKeyData.fromObject(valor)
  }
  return valor
}

/**
 * Abre (o crea) la base de datos de sesion.
 * @param {string} carpeta carpeta de auth (p. ej. 'auth_info')
 */
function abrirBase(carpeta) {
  fs.mkdirSync(carpeta, { recursive: true })
  const db = new DatabaseSync(path.join(carpeta, ARCHIVO_DB))

  // WAL: lecturas sin bloquear escrituras y sin reescribir el archivo entero.
  // synchronous NORMAL es seguro con WAL y mucho mas rapido que FULL.
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS creds (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      datos TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS claves (
      categoria TEXT NOT NULL,
      id TEXT NOT NULL,
      valor TEXT NOT NULL,
      PRIMARY KEY (categoria, id)
    ) WITHOUT ROWID;
  `)

  return db
}

/** Divide 'sender-key-120363...--1593_1--0.json' en categoria + id */
function partirNombreArchivo(nombre) {
  if (!nombre.endsWith('.json')) return null
  const base = nombre.slice(0, -5)
  for (const categoria of CATEGORIAS) {
    if (base.startsWith(`${categoria}-`)) {
      return { categoria, id: base.slice(categoria.length + 1) }
    }
  }
  return null
}

/**
 * Ejecuta `tarea` sobre cada elemento con un maximo de `limite` a la vez.
 *
 * Importa: en Windows, leer 1377 archivos con `readFileSync` uno detras de
 * otro tarda ~24 s (el antivirus revisa cada apertura). Las mismas lecturas
 * en paralelo bajan a ~0.25 s porque el costo es espera, no CPU.
 */
async function enLotes(elementos, limite, tarea) {
  let siguiente = 0
  const trabajadores = Array.from(
    { length: Math.min(limite, elementos.length) },
    async () => {
      while (siguiente < elementos.length) {
        const elemento = elementos[siguiente++]
        await tarea(elemento)
      }
    }
  )
  await Promise.all(trabajadores)
}

/**
 * Importa una sesion del formato multi-archivo si la base esta vacia.
 * Mueve los .json a `legacy-<fecha>/` para no borrar nada.
 * @returns {Promise<{ importadas: number, credenciales: boolean } | null>}
 */
async function migrarDesdeArchivos(db, carpeta) {
  const credsViejas = path.join(carpeta, 'creds.json')
  if (!fs.existsSync(credsViejas)) return null

  const yaHayCreds = db.prepare('SELECT 1 AS hay FROM creds WHERE id = 1').get()
  if (yaHayCreds) return null

  const archivos = fs
    .readdirSync(carpeta, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => e.name)

  // Lectura en paralelo antes de tocar la base: la transaccion queda corta y
  // no se mezcla I/O de disco con escrituras.
  const contenidos = new Map()
  await enLotes(archivos, 64, async (nombre) => {
    try {
      contenidos.set(nombre, await fsp.readFile(path.join(carpeta, nombre), 'utf8'))
    } catch {
      // archivo ilegible: se omite, no impide migrar el resto
    }
  })

  const insertar = db.prepare(
    'INSERT INTO claves (categoria, id, valor) VALUES (?, ?, ?) ON CONFLICT(categoria, id) DO UPDATE SET valor = excluded.valor'
  )
  const guardarCreds = db.prepare(
    'INSERT INTO creds (id, datos) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET datos = excluded.datos'
  )

  let importadas = 0
  let credenciales = false

  db.exec('BEGIN')
  try {
    for (const [nombre, texto] of contenidos) {
      if (nombre === 'creds.json') {
        guardarCreds.run(texto)
        credenciales = true
        continue
      }

      const partes = partirNombreArchivo(nombre)
      if (!partes) continue

      insertar.run(partes.categoria, partes.id, texto)
      importadas += 1
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }

  // La sesion vieja no se borra: se aparta por si hay que volver atras.
  // El renombrado va en serie a proposito: en Windows mover cientos de
  // archivos en paralelo se pelea con el antivirus y tarda 10x mas.
  const destino = path.join(carpeta, `legacy-${new Date().toISOString().replace(/[:.]/g, '-')}`)
  fs.mkdirSync(destino, { recursive: true })
  for (const nombre of archivos) {
    try {
      fs.renameSync(path.join(carpeta, nombre), path.join(destino, nombre))
    } catch {
      // si un archivo esta bloqueado se queda donde esta; no impide arrancar
    }
  }

  return { importadas, credenciales }
}

/**
 * Estado de autenticacion respaldado por SQLite.
 *
 * @param {string} carpeta carpeta donde vive `sesion.sqlite`
 * @returns {Promise<{
 *   state: { creds: object, keys: { get: Function, set: Function } },
 *   saveCreds: () => Promise<void>,
 *   tieneSesion: boolean,
 *   cerrar: () => void
 * }>}
 */
export async function useSqliteAuthState(carpeta) {
  const db = abrirBase(carpeta)

  const migracion = await migrarDesdeArchivos(db, carpeta)

  const filaCreds = db.prepare('SELECT datos FROM creds WHERE id = 1').get()
  const tieneSesion = Boolean(filaCreds?.datos)

  const creds = filaCreds?.datos
    ? JSON.parse(filaCreds.datos, BufferJSON.reviver)
    : initAuthCreds()

  const consultarClave = db.prepare('SELECT valor FROM claves WHERE categoria = ? AND id = ?')
  const guardarClave = db.prepare(
    'INSERT INTO claves (categoria, id, valor) VALUES (?, ?, ?) ON CONFLICT(categoria, id) DO UPDATE SET valor = excluded.valor'
  )
  const borrarClave = db.prepare('DELETE FROM claves WHERE categoria = ? AND id = ?')
  const guardarCredenciales = db.prepare(
    'INSERT INTO creds (id, datos) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET datos = excluded.datos'
  )

  /** Escribe un lote de llaves en una sola transaccion */
  const escribirLote = (operaciones) => {
    if (!operaciones.length) return
    db.exec('BEGIN')
    try {
      for (const op of operaciones) {
        if (op.valor === null) borrarClave.run(op.categoria, op.id)
        else guardarClave.run(op.categoria, op.id, op.valor)
      }
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }

  const state = {
    creds,
    keys: {
      get: async (categoria, ids) => {
        const datos = {}
        for (const id of ids) {
          const fila = consultarClave.get(categoria, fijarId(id))
          datos[id] = fila?.valor ? deserializar(categoria, fila.valor) : null
        }
        return datos
      },
      set: async (datos) => {
        const operaciones = []
        for (const categoria in datos) {
          for (const id in datos[categoria]) {
            const valor = datos[categoria][id]
            operaciones.push({
              categoria,
              id: fijarId(id),
              valor: valor === null || valor === undefined ? null : serializar(valor),
            })
          }
        }
        escribirLote(operaciones)
      },
    },
  }

  const saveCreds = async () => {
    guardarCredenciales.run(serializar(creds))
  }

  // No se escriben credenciales hasta que Baileys las actualice (igual que el
  // multi-archivo): asi un primer arranque sin sesion sigue pidiendo QR/codigo.
  if (migracion) {
    log.sistema(
      `Sesión migrada a SQLite: ${migracion.importadas} llaves` +
        (migracion.credenciales ? ' + credenciales' : '') +
        ` · los archivos originales quedan en ${carpeta}/legacy-*/`
    )
  }

  return {
    state,
    saveCreds,
    tieneSesion,
    cerrar: () => {
      try {
        db.close()
      } catch {
        // ya cerrada
      }
    },
  }
}
