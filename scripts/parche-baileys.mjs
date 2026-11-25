/**
 * Parches de vinculacion para @whiskeysockets/baileys 7.0.0-rc14.
 *
 * La ultima version publicada (7.0.0-rc14, 2026-07-29) tiene tres defectos que
 * rompen el codigo de vinculacion contra los servidores actuales de WhatsApp:
 *
 *   1. `link_code_pairing_nonce` viaja como el texto '0' (0x30). WhatsApp Web
 *      manda un unico byte nulo (0x00) y el telefono rechaza cualquier otra
 *      cosa: "no se pudo vincular el dispositivo".
 *
 *   2. El manejador de la notificacion `link_code_companion_reg` no mira la
 *      etapa. El servidor manda dos: una al recibir `companion_hello`, sin los
 *      campos de criptografia, y otra con stage `primary_hello` despues de que
 *      la persona escribe el codigo. Sin el filtro, la primera revienta con
 *      "Invalid buffer" y `companion_finish` nunca se manda.
 *
 *   3. El handshake elige el camino de login con solo mirar `creds.me`.
 *      `requestPairingCode` escribe `creds.me` antes de que la vinculacion
 *      termine, asi que cualquier reconexion manda un login pasivo con
 *      credenciales que el servidor nunca confirmo y contesta 401.
 *
 * Los tres estan corregidos en el repositorio de Baileys pero no en una
 * version publicada, asi que se aplican sobre el paquete instalado.
 *
 * Corre solo en `npm install` (postinstall) y al arrancar el bot. Es
 * idempotente: si ya esta aplicado no toca nada.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

/** Carpeta `lib` del paquete instalado, o null si no esta. */
function carpetaBaileys() {
  if (process.env.BAILEYS_LIB) return process.env.BAILEYS_LIB

  try {
    return path.dirname(require.resolve('@whiskeysockets/baileys'))
  } catch {
    return null
  }
}

/**
 * Aplica una lista de parches a un archivo.
 *
 * Cada parche dice como saber si ya esta puesto (`ya`), que buscar y con que
 * reemplazarlo. Si el punto no aparece se avisa y se sigue: un parche que no
 * encaja no puede impedir que el bot arranque.
 */
function parchearArchivo(ruta, parches) {
  if (!fs.existsSync(ruta)) {
    console.warn(`[parche] no existe ${path.basename(ruta)}, se omite`)
    return 0
  }

  let texto = fs.readFileSync(ruta, 'utf8')
  const original = texto
  let aplicados = 0

  for (const parche of parches) {
    if (parche.ya(texto)) continue

    if (!parche.buscar.test(texto)) {
      console.warn(`[parche] ${parche.nombre}: no encontre el punto en ${path.basename(ruta)}`)
      continue
    }

    texto = texto.replace(parche.buscar, parche.reemplazo)
    aplicados += 1
    console.log(`[parche] ${parche.nombre}: aplicado`)
  }

  if (texto !== original) fs.writeFileSync(ruta, texto, 'utf8')
  return aplicados
}

/** Aplica los tres parches. Devuelve cuantos se aplicaron ahora. */
export function parchearBaileys(lib = carpetaBaileys()) {
  if (!lib) {
    console.warn('[parche] baileys no esta instalado, nada que parchear')
    return 0
  }

  const socket = path.join(lib, 'Socket', 'socket.js')
  const recv = path.join(lib, 'Socket', 'messages-recv.js')

  let aplicados = 0

  aplicados += parchearArchivo(socket, [
    {
      nombre: 'nonce nulo en la vinculacion',
      ya: (t) =>
        /tag:\s*'link_code_pairing_nonce'[\s\S]{0,200}?Buffer\.from\(\[0\]\)/.test(t),
      buscar: /(tag:\s*'link_code_pairing_nonce',\s*attrs:\s*\{\},\s*content:\s*)'0'/,
      reemplazo: '$1Buffer.from([0])',
    },
    {
      nombre: 'registro mientras no este registrado',
      ya: (t) => /if \(!creds\.me \|\| !creds\.registered\)/.test(t),
      buscar: /if \(!creds\.me\) \{/,
      reemplazo: 'if (!creds.me || !creds.registered) {',
    },
  ])

  aplicados += parchearArchivo(recv, [
    {
      nombre: 'filtro de etapa en companion_reg',
      ya: (t) => /getBinaryNodeChild\(linkCodeCompanionReg, 'primary_identity_pub'\)\)\s*break/.test(t),
      buscar: /(\n(\s*)const linkCodeCompanionReg = getBinaryNodeChild\(node, 'link_code_companion_reg'\);)/,
      reemplazo:
        "$1\n$2if (!getBinaryNodeChild(linkCodeCompanionReg, 'primary_identity_pub')) break;",
    },
  ])

  return aplicados
}

// Ejecutado directo (postinstall o arranque): aplica y sale.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const total = parchearBaileys()
  console.log(total ? `[parche] baileys: ${total} correccion(es) aplicada(s)` : '[parche] baileys: ya estaba al dia')
}
