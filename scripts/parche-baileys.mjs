/**
 * Parches de vinculacion para @whiskeysockets/baileys 7.0.0-rc14.
 *
 * La version publicada tiene tres defectos que rompen la vinculacion por codigo
 * contra los servidores actuales de WhatsApp:
 *
 *   1. `link_code_pairing_nonce` viaja como el texto '0' (0x30). WhatsApp Web
 *      manda un unico byte nulo (0x00) y el telefono deriva las claves con otro
 *      nonce, no puede descifrar el paquete y contesta "no se pudo vincular el
 *      dispositivo".
 *
 *   2. El manejador de la notificacion `link_code_companion_reg` no mira la
 *      etapa. El servidor manda dos: una al recibir `companion_hello`, sin los
 *      campos de criptografia, y otra despues de que la persona escribe el
 *      codigo. Sin el filtro, la primera revienta y `companion_finish` nunca se
 *      manda, que es exactamente el mismo error en el telefono.
 *
 *   3. El handshake elige el camino de login con solo mirar `creds.me`.
 *      `requestPairingCode` escribe `creds.me` antes de que la vinculacion
 *      termine, asi que cualquier reconexion manda un login pasivo con
 *      credenciales que el servidor nunca confirmo y contesta 401.
 *
 * ── Por que este archivo es distinto a la version anterior ──
 *
 * Antes se parcheaba una ruta fija (`lib/Socket/socket.js`). Si el paquete
 * cambia de layout, de `main`, o viene minificado distinto, el parche no
 * encontraba el punto, imprimia un aviso en consola y el bot arrancaba con el
 * defecto intacto: el codigo se generaba, se veia bien, y el telefono decia
 * "no se pudo vincular". Ahora se busca por MARCA en todo el paquete, se
 * toleran varias formas del literal, y sobre todo se VERIFICA al final: si un
 * parche no quedo puesto, se dice con nombre y apellido.
 *
 * Corre en `npm install` (postinstall) y al importarlo desde `iniciar.js` e
 * `index.js`. Es idempotente y repara los parches que dejo la version vieja.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

const MARCA_NONCE = 'link_code_pairing_nonce'
const MARCA_COMPANION = 'link_code_companion_reg'
const MARCA_REGISTRO = 'creds.me'

/** Raiz del paquete instalado, o null si no esta. */
function raizBaileys() {
  if (process.env.BAILEYS_RAIZ) return process.env.BAILEYS_RAIZ

  try {
    // `require.resolve` devuelve el archivo de entrada (`lib/index.js` en el
    // paquete real). Subir hasta la carpeta del paquete cubre tambien un layout
    // donde el entry sea `index.js` en la raiz.
    let dir = path.dirname(require.resolve('@whiskeysockets/baileys'))
    for (let i = 0; i < 4; i += 1) {
      if (fs.existsSync(path.join(dir, 'package.json'))) {
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
        if (String(pkg?.name || '').includes('baileys')) return dir
      }
      const arriba = path.dirname(dir)
      if (arriba === dir) break
      dir = arriba
    }
    return path.dirname(require.resolve('@whiskeysockets/baileys'))
  } catch {
    return null
  }
}

/** Todos los .js del paquete, sin entrar en sus dependencias. */
function archivosJs(dir, salida = [], profundidad = 0) {
  if (profundidad > 8) return salida

  let entradas
  try {
    entradas = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return salida
  }

  for (const entrada of entradas) {
    const ruta = path.join(dir, entrada.name)
    if (entrada.isDirectory()) {
      if (entrada.name === 'node_modules' || entrada.name === '.git') continue
      archivosJs(ruta, salida, profundidad + 1)
    } else if (/\.(c|m)?js$/.test(entrada.name)) {
      salida.push(ruta)
    }
  }

  return salida
}

/**
 * Archivos que contienen una marca.
 *
 * Se cachea por proceso: recorrer el paquete cuesta milisegundos y esto corre
 * una sola vez al arrancar.
 */
const cacheArchivos = new Map()
function archivosCon(marca, raiz) {
  if (cacheArchivos.has(marca)) return cacheArchivos.get(marca)
  const encontrados = archivosJs(raiz).filter((ruta) => {
    try {
      return fs.readFileSync(ruta, 'utf8').includes(marca)
    } catch {
      return false
    }
  })
  cacheArchivos.set(marca, encontrados)
  return encontrados
}

// ───────────── Parche 1: nonce nulo ─────────────

/**
 * Cambia el literal '0' del nonce por un byte nulo.
 *
 * Tolera las formas que puede dejar un build: `'0'`, `"0"`,
 * `Buffer.from('0')` y `Buffer.from("0", "utf8")`. Si ya esta en
 * `Buffer.from([0])` no toca nada.
 */
function arreglarNonce(texto) {
  let salida = ''
  let desde = 0
  let cambios = 0

  for (;;) {
    const marca = texto.indexOf(MARCA_NONCE, desde)
    if (marca < 0) {
      salida += texto.slice(desde)
      break
    }

    salida += texto.slice(desde, marca)

    // La ventana cubre el objeto del nodo: `{ tag: '...nonce', attrs: {},
    // content: '0' }`. 300 caracteres sobran incluso con comentarios en medio.
    const ventana = texto.slice(marca, marca + 300)
    const encontrado = ventana.match(
      /content:\s*(?:'0'|"0"|Buffer\.from\(\s*(['"])0\1(?:\s*,\s*(['"])utf-?8\2)?\s*\))/
    )

    if (encontrado) {
      const inicioLiteral = marca + encontrado.index
      const finLiteral = inicioLiteral + encontrado[0].length
      salida += texto.slice(marca, inicioLiteral) + 'content: Buffer.from([0])'
      desde = finLiteral
      cambios += 1
    } else {
      salida += texto.slice(marca, marca + MARCA_NONCE.length)
      desde = marca + MARCA_NONCE.length
    }
  }

  return { texto: salida, cambios }
}

// ───────────── Parche 2: filtro de etapa ─────────────

/**
 * Mete un `break` cuando la notificacion no trae los campos de criptografia.
 *
 * El guard va despues de leer `link_code_companion_reg`, antes de que el
 * manejador toque `primary_identity_pub` (que en la primera etapa no existe).
 */
function arreglarEtapa(texto) {
  const yaEsta = /getBinaryNodeChild\(\s*linkCodeCompanionReg\s*,\s*['"]primary_identity_pub['"]\s*\)/.test(
    texto
  )
  if (yaEsta) return { texto, cambios: 0 }

  const objetivo = texto.match(
    /\n([ \t]*)const\s+linkCodeCompanionReg\s*=\s*getBinaryNodeChild\(\s*node\s*,\s*['"]link_code_companion_reg['"]\s*\)\s*;?/
  )
  if (!objetivo) return { texto, cambios: 0, sinPunto: true }

  const sangria = objetivo[1]
  const guardia =
    `${objetivo[0]}\n` +
    `${sangria}// La primera notificacion (respuesta a companion_hello) no trae los\n` +
    `${sangria}// campos de criptografia: sin este filtro el manejador revienta y\n` +
    `${sangria}// companion_finish nunca se manda, y el telefono responde "no se pudo\n` +
    `${sangria}// vincular el dispositivo".\n` +
    `${sangria}if (!getBinaryNodeChild(linkCodeCompanionReg, 'primary_identity_pub')) break;`

  return { texto: texto.replace(objetivo[0], guardia), cambios: 1 }
}

// ───────────── Parche 3: marca de sesion real ─────────────

/**
 * La condicion de registro pasa a mirar `creds.account`.
 *
 * En Baileys 7 `creds.registered` nunca pasa a true, asi que `!registered`
 * siempre es verdadero y CADA socket manda un registro: QR, 515, QR, 515.
 * `creds.account` la escribe `configureSuccessfulPairing` junto con `me`.
 */
function arreglarRegistro(texto) {
  let cambios = 0
  let salida = texto

  if (/if \(!creds\.me \|\| !creds\.registered\) \{/.test(salida)) {
    salida = salida.replace(
      /if \(!creds\.me \|\| !creds\.registered\) \{/g,
      'if (!creds.me || !creds.account) {'
    )
    cambios += 1
  }

  if (!/if \(!creds\.me \|\| !creds\.account\) \{/.test(salida)) {
    const antes = salida
    salida = salida.replace(/if \(!creds\.me\) \{/g, 'if (!creds.me || !creds.account) {')
    if (salida !== antes) cambios += 1
  }

  return { texto: salida, cambios }
}

// ───────────── Motor ─────────────

/**
 * Aplica un arreglo a un archivo y dice si el texto cambio.
 * @returns {{cambios: number, sinPunto?: boolean, error?: string}}
 */
function aplicar(ruta, arreglo) {
  try {
    const texto = fs.readFileSync(ruta, 'utf8')
    const resultado = arreglo(texto)
    if (resultado.texto !== texto) fs.writeFileSync(ruta, resultado.texto, 'utf8')
    return { cambios: resultado.cambios ?? 0, sinPunto: resultado.sinPunto }
  } catch (err) {
    return { cambios: 0, error: err?.message || String(err) }
  }
}

/**
 * Estado de los tres parches sobre la instalacion actual.
 *
 * Se lee del disco, no de lo que el script cree haber hecho: es lo que ve
 * Baileys al ejecutarse.
 */
export function estadoBaileys(raiz = raizBaileys()) {
  if (!raiz) {
    return { instalado: false, nonce: false, etapa: false, cuenta: false, ruta: null, faltan: ['paquete'] }
  }

  const leer = (marca) =>
    archivosCon(marca, raiz)
      .map((ruta) => {
        try {
          return fs.readFileSync(ruta, 'utf8')
        } catch {
          return ''
        }
      })
      .join('\n')

  const textoNonce = leer(MARCA_NONCE)
  const textoCompanion = leer(MARCA_COMPANION)
  const textoRegistro = leer(MARCA_REGISTRO)

  const nonce = /content:\s*Buffer\.from\(\[0\]\)/.test(textoNonce)
  const etapa = /getBinaryNodeChild\(\s*linkCodeCompanionReg\s*,\s*['"]primary_identity_pub['"]\s*\)/.test(
    textoCompanion
  )
  const cuenta =
    /if \(!creds\.me \|\| !creds\.account\) \{/.test(textoRegistro) &&
    !/if \(!creds\.me \|\| !creds\.registered\) \{/.test(textoRegistro)

  const faltan = []
  if (!nonce) faltan.push('nonce')
  if (!etapa) faltan.push('etapa')
  if (!cuenta) faltan.push('registro')

  return { instalado: true, nonce, etapa, cuenta, ruta: raiz, faltan }
}

/**
 * Aplica los tres parches y devuelve que quedo realmente puesto.
 *
 * Nunca lanza: un parche que no encaja no puede tumbar el arranque.
 */
export function parchearBaileys(raiz = raizBaileys()) {
  const reporte = { aplicados: 0, instalado: Boolean(raiz), ruta: raiz, avisos: [], estado: null }

  if (!raiz) {
    reporte.avisos.push('el paquete de Baileys no esta instalado; nada que parchear')
    return reporte
  }

  const trabajos = [
    { marca: MARCA_NONCE, arreglo: arreglarNonce, nombre: 'nonce nulo' },
    { marca: MARCA_COMPANION, arreglo: arreglarEtapa, nombre: 'filtro de etapa' },
    { marca: MARCA_REGISTRO, arreglo: arreglarRegistro, nombre: 'marca de sesion' },
  ]

  for (const trabajo of trabajos) {
    const archivos = archivosCon(trabajo.marca, raiz)

    if (!archivos.length) {
      reporte.avisos.push(`${trabajo.nombre}: ningun archivo del paquete contiene "${trabajo.marca}"`)
      continue
    }

    let tocados = 0
    for (const ruta of archivos) {
      const resultado = aplicar(ruta, trabajo.arreglo)
      if (resultado.error) {
        reporte.avisos.push(`${trabajo.nombre}: ${path.basename(ruta)} · ${resultado.error}`)
        continue
      }
      if (resultado.sinPunto) {
        reporte.avisos.push(`${trabajo.nombre}: no encontre el punto en ${path.basename(ruta)}`)
        continue
      }
      if (resultado.cambios > 0) tocados += 1
    }
    reporte.aplicados += tocados
  }

  reporte.estado = estadoBaileys(raiz)

  for (const falta of reporte.estado.faltan) {
    const detalle =
      falta === 'nonce'
        ? 'el nonce de la vinculacion sigue en texto en vez de byte nulo'
        : falta === 'etapa'
          ? 'el manejador de companion_reg no filtra la etapa'
          : 'la condicion de registro no mira creds.account'
    reporte.avisos.push(`SIN PARCHE · ${detalle}`)
  }

  return reporte
}

// ───────────── Ejecucion al importar ─────────────

let reporteInicial = { aplicados: 0, instalado: false, avisos: [], estado: null }

try {
  reporteInicial = parchearBaileys()
} catch (err) {
  reporteInicial.avisos.push(`error inesperado · ${err?.message || err}`)
}

/**
 * Reporte de la ultima aplicacion. `index.js` lo imprime al conectar y
 * `lib/subbot.js` lo deja en el log antes de abrir un sub-bot: si un dia la
 * vinculacion vuelve a fallar, la causa queda escrita sin tener que adivinar.
 */
export function reporteParches() {
  return reporteInicial
}

/** Linea de una sola fila con el estado, para el log. */
export function resumenParches() {
  const { estado, ruta, avisos } = reporteInicial
  if (!estado?.instalado) return `baileys sin instalar · ${avisos[0] || 'nada que parchear'}`
  const marcas = [
    estado.nonce ? 'nonce' : 'nonce✗',
    estado.etapa ? 'etapa' : 'etapa✗',
    estado.cuenta ? 'registro' : 'registro✗',
  ].join(' ')
  return `${marcas} · ${ruta}`
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { estado, ruta, avisos, aplicados } = reporteInicial
  if (aplicados) console.log(`[parche] baileys: ${aplicados} correccion(es) escrita(s)`)
  else console.log('[parche] baileys: sin cambios en disco')

  if (estado?.instalado) {
    console.log(`[parche] ruta: ${ruta}`)
    console.log(
      `[parche] nonce=${estado.nonce ? 'ok' : 'FALTA'} ` +
        `etapa=${estado.etapa ? 'ok' : 'FALTA'} ` +
        `registro=${estado.cuenta ? 'ok' : 'FALTA'}`
    )
  }
  for (const aviso of avisos) console.warn(`[parche] ${aviso}`)
}
