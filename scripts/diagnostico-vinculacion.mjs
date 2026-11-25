/**
 * Diagnostico de vinculacion por codigo.
 *
 * Junta en una sola salida todo lo que hace falta para saber por que el
 * telefono responde "No se pudo vincular el dispositivo":
 *
 *   · reloj del servidor contra el de WhatsApp (un desfase rompe la
 *     criptografia del emparejamiento)
 *   · version del paquete de Baileys y estado de los tres parches, con el
 *     bloque real del nonce para confirmar que se parcheo el nodo correcto
 *   · version de WhatsApp que resuelve Baileys
 *   · sesiones guardadas de los sub-bots y que campos tienen
 *   · con `--abrir <numero>`: un emparejamiento real, con la traza completa
 *
 * Uso:
 *   node scripts/diagnostico-vinculacion.mjs
 *   node scripts/diagnostico-vinculacion.mjs --abrir 57323447326
 *
 * La prueba con `--abrir` usa su propia carpeta (`data/diagnostico/<numero>`)
 * y la borra al terminar: no toca la sesion de ningun sub-bot.
 */
import fs from 'node:fs'
import path from 'node:path'
import { estadoBaileys } from './parche-baileys.mjs'

const linea = (titulo) => console.log(`\n── ${titulo} ${'─'.repeat(Math.max(0, 58 - titulo.length))}`)
const dato = (clave, valor) => console.log(`  ${String(clave).padEnd(24)} ${valor}`)

/** Version del paquete instalado, o null. */
function versionPaquete() {
  try {
    return JSON.parse(fs.readFileSync('node_modules/@whiskeysockets/baileys/package.json', 'utf8'))
      ?.version
  } catch {
    return null
  }
}

/** El stub local permite importar pero no conectar: no sirve para emparejar. */
const ES_STUB = String(versionPaquete() || '').includes('stub')

// ───────────── Entorno ─────────────

async function reloj() {
  linea('reloj')
  dato('hora local', new Date().toISOString())

  try {
    const respuesta = await fetch('https://web.whatsapp.com', {
      method: 'HEAD',
      signal: AbortSignal.timeout(8000),
    })
    const fecha = respuesta.headers.get('date')
    if (!fecha) {
      dato('hora de WhatsApp', 'sin cabecera Date')
      return
    }
    const desfase = Date.parse(fecha) - Date.now()
    dato('hora de WhatsApp', fecha)
    dato('desfase', `${(desfase / 1000).toFixed(1)} s`)
    if (Math.abs(desfase) > 20_000) {
      console.log('  ⚠ desfase alto: la criptografia del emparejamiento usa tiempos')
    }
  } catch (err) {
    dato('hora de WhatsApp', `no pude consultar (${err?.message || err})`)
  }
}

// ───────────── Baileys ─────────────

async function paquete() {
  linea('paquete')

  let pkg = null
  try {
    pkg = JSON.parse(fs.readFileSync('node_modules/@whiskeysockets/baileys/package.json', 'utf8'))
  } catch {
    // se informa abajo
  }

  dato('version', pkg?.version || 'no instalado')
  dato('node', process.version)

  if (String(pkg?.version || '').includes('stub')) {
    console.log('\n  ⚠ ESTE ES EL STUB LOCAL. No hay Baileys real aqui: el diagnostico')
    console.log('    de vinculacion solo sirve corriendo en el servidor, donde el')
    console.log('    paquete esta instalado de verdad (/home/container en el VPS).')
  }

  const estado = estadoBaileys()
  dato('ruta', estado.ruta || 'no encontrada')

  if (!estado.instalado) return

  const marcar = (ok) => (ok ? 'ok' : 'FALTA')
  dato('parche nonce', marcar(estado.nonce))
  dato('parche etapa', marcar(estado.etapa))
  dato('parche registro', marcar(estado.cuenta))

  // Bloque real del nonce: confirma que el byte nulo esta en el nodo que se
  // envia, no en un comentario ni en otra estructura.
  const archivo = buscarArchivo(estado.ruta, 'link_code_pairing_nonce')
  if (archivo) {
    const texto = fs.readFileSync(archivo, 'utf8')
    const marca = texto.indexOf('link_code_pairing_nonce')
    const bloque = texto.slice(Math.max(0, marca - 220), marca + 220).trim()
    console.log(`\n  bloque del nonce en ${path.basename(archivo)}:\n`)
    for (const fila of bloque.split(/\r?\n/)) console.log(`    ${fila}`)
  }

  const manejador = buscarArchivo(estado.ruta, 'link_code_companion_reg')
  if (manejador) {
    const texto = fs.readFileSync(manejador, 'utf8')
    const marca = texto.indexOf('const linkCodeCompanionReg')
    if (marca >= 0) {
      const bloque = texto.slice(marca, marca + 420).trim()
      console.log(`\n  manejador de companion_reg en ${path.basename(manejador)}:\n`)
      for (const fila of bloque.split(/\r?\n/).slice(0, 14)) console.log(`    ${fila}`)
    }
  }
}

function buscarArchivo(raiz, marca) {
  const pila = [raiz]
  while (pila.length) {
    const dir = pila.pop()
    let entradas
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entrada of entradas) {
      const ruta = path.join(dir, entrada.name)
      if (entrada.isDirectory()) {
        if (entrada.name !== 'node_modules' && entrada.name !== '.git') pila.push(ruta)
      } else if (/\.(c|m)?js$/.test(entrada.name)) {
        try {
          if (fs.readFileSync(ruta, 'utf8').includes(marca)) return ruta
        } catch {
          // archivo ilegible: se sigue
        }
      }
    }
  }
  return null
}

async function versionWhatsApp() {
  linea('version de WhatsApp')

  try {
    const baileys = await import('@whiskeysockets/baileys')
    const { version, isLatest } = await baileys.fetchLatestBaileysVersion()
    dato('resuelta', Array.isArray(version) ? version.join('.') : String(version))
    dato('es la ultima', String(isLatest))
    if (isLatest === false) {
      console.log('  ⚠ el servidor de versiones no respondio: se usa la del paquete')
    }
  } catch (err) {
    dato('resuelta', `error · ${err?.message || err}`)
  }
}

// ───────────── Sesiones guardadas ─────────────

async function sesiones() {
  linea('sesiones de sub-bots')

  const raiz = path.resolve('data', 'subbots')
  let carpetas = []
  try {
    carpetas = fs
      .readdirSync(raiz, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  } catch {
    dato('carpetas', 'no existe data/subbots')
    return
  }

  if (!carpetas.length) {
    dato('carpetas', 'ninguna')
    return
  }

  for (const numero of carpetas) {
    const base = path.join(raiz, numero, 'sesion.sqlite')
    if (!fs.existsSync(base)) {
      dato(numero, 'sin sesion.sqlite')
      continue
    }
    try {
      const { DatabaseSync } = await import('node:sqlite')
      const db = new DatabaseSync(base, { readOnly: true })
      const fila = db.prepare('SELECT datos FROM creds WHERE id = 1').get()
      db.close()
      if (!fila?.datos) {
        dato(numero, 'base sin credenciales')
        continue
      }
      const creds = JSON.parse(fila.datos)
      const campos = ['me', 'account', 'registered', 'pairingCode', 'platform'].filter(
        (c) => creds[c] !== undefined
      )
      dato(numero, `campos: ${campos.join(', ') || 'ninguno'}`)
      if (creds.me?.id) dato('  me.id', creds.me.id)
      if (creds.me?.name) dato('  me.name', creds.me.name)
    } catch (err) {
      dato(numero, `no pude leer (${err?.message || err})`)
    }
  }
}

// ───────────── Emparejamiento real ─────────────

async function abrir(numero) {
  linea(`emparejamiento de prueba · ${numero}`)

  if (ES_STUB) {
    console.log('  el paquete instalado es el stub local: no hay socket que abrir.')
    console.log('  corre este diagnostico en el servidor, donde Baileys esta instalado.')
    return
  }

  const baileys = await import('@whiskeysockets/baileys')
  const { useSqliteAuthState } = await import('../lib/auth-state.js')

  // El paquete real expone la funcion en `default`; se acepta tambien
  // `makeWASocket` por si el build cambia.
  const makeWASocket = [baileys.default, baileys.makeWASocket, baileys.default?.default].find(
    (f) => typeof f === 'function'
  )
  if (!makeWASocket) {
    console.log('  el paquete instalado no expone makeWASocket.')
    return
  }

  const carpeta = path.resolve('data', 'diagnostico', numero)
  fs.rmSync(carpeta, { recursive: true, force: true })
  fs.mkdirSync(carpeta, { recursive: true })

  const { state, saveCreds, cerrar } = await useSqliteAuthState(carpeta)
  const version = await baileys
    .fetchLatestBaileysVersion()
    .then((v) => v.version)
    .catch(() => null)

  console.log('  abriendo socket…')

  // Baileys traga los errores de criptografia en su logger. Con uno propio que
  // imprime warn/error, el motivo real ("Invalid buffer", fallo al descifrar el
  // paquete del telefono) sale en pantalla en vez de quedarse dentro.
  const consola = {
    level: 'debug',
    child: () => consola,
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: (...args) => console.log('  [warn]', ...args),
    error: (...args) => console.log('  [error]', ...args),
    fatal: (...args) => console.log('  [fatal]', ...args),
  }

  const sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: {
      creds: state.creds,
      keys: baileys.makeCacheableSignalKeyStore
        ? baileys.makeCacheableSignalKeyStore(state.keys)
        : state.keys,
    },
    browser: ['Beerus Bot MD', 'Firefox', '2.1.0'],
    logger: consola,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('creds.update', (update) => {
    const marcas = Object.keys(update || {})
    if (marcas.length) console.log(`  creds.update: ${marcas.join(' + ')}`)
  })

  sock.ev.on('CB:notification', (nodo) => {
    const hijos = Array.isArray(nodo?.content) ? nodo.content : [nodo?.content]
    for (const hijo of hijos) {
      if (hijo?.tag !== 'link_code_companion_reg') continue
      const campos = (Array.isArray(hijo.content) ? hijo.content : [])
        .map((c) => c?.tag)
        .filter(Boolean)
      console.log(`  companion_reg: [${campos.join(' ') || 'vacio'}]`)
    }
  })

  let pedido = false
  let terminado = false

  const cerrarTodo = (mensaje) => {
    if (terminado) return
    terminado = true
    console.log(`\n  ${mensaje}`)
    try {
      sock.end(undefined)
    } catch {
      // ya cerrado
    }
    try {
      cerrar()
    } catch {
      // ya cerrada
    }
    fs.rmSync(carpeta, { recursive: true, force: true })
    process.exit(0)
  }

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    const estado = lastDisconnect?.error?.output?.statusCode
    console.log(
      `  connection=${connection ?? '-'}${qr ? ' qr' : ''}${estado ? ` status=${estado}` : ''}` +
        `${lastDisconnect?.error?.message ? ` (${lastDisconnect.error.message})` : ''}`
    )

    if (qr && !pedido) {
      pedido = true
      try {
        const codigo = await sock.requestPairingCode(numero)
        console.log(`  CODIGO: ${codigo}`)
        console.log('  escribelo en el telefono; esperando 120 s…')
      } catch (err) {
        console.log(`  no pude pedir el codigo: ${err?.message || err}`)
      }
    }

    if (connection === 'open') {
      cerrarTodo(`VINCULADO · ${sock.user?.id || 'sin id'}`)
    }
  })

  setTimeout(() => cerrarTodo('sin respuesta en 120 s'), 120_000)
}

// ───────────── Principal ─────────────

const indice = process.argv.indexOf('--abrir')
const numero = indice >= 0 ? String(process.argv[indice + 1] || '').replace(/\D/g, '') : null

console.log('Diagnostico de vinculacion · Beerus Bot MD')
console.log(`  cwd ${process.cwd()}`)

await reloj()
await paquete()
await versionWhatsApp()
await sesiones()

if (numero) await abrir(numero)
else {
  console.log('\nPara probar un emparejamiento real: --abrir <numero con pais>')
  process.exit(0)
}
