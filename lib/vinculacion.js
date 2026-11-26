/**
 * Metodo de vinculacion con WhatsApp: QR o codigo de emparejamiento.
 * Solo se usa cuando la sesion todavia no esta registrada.
 */
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { log } from './logger.js'

/** Deja solo los digitos del numero y valida el largo (formato internacional) */
export function normalizarNumero(texto) {
  const numero = String(texto ?? '').replace(/\D/g, '')
  return numero.length >= 8 && numero.length <= 15 ? numero : null
}

/** Formatea el codigo como XXXX-XXXX para leerlo mejor */
export function formatearCodigo(codigo) {
  const limpio = String(codigo ?? '')
  return limpio.length === 8 ? `${limpio.slice(0, 4)}-${limpio.slice(4)}` : limpio
}

/**
 * Deja el codigo como lo espera el telefono: 8 caracteres, sin guion.
 *
 * `requestPairingCode` devuelve `4KDL-VBY8`. El campo del telefono tiene ocho
 * casillas y pone el guion solo; pegar el guion adentro lo corta o lo rechaza.
 * Tambien se quitan los asteriscos con los que WhatsApp marca la negrita al
 * copiar el mensaje: el teclado los ofrece en la barra de sugerencias.
 */
export function codigoPlano(codigo) {
  return String(codigo ?? '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()
}

/**
 * Navegador que se anuncia cuando la vinculacion es por codigo.
 *
 * WhatsApp trata el emparejamiento como el de un navegador de escritorio: el
 * telefono muestra `companion_platform_display` y recibe `companion_platform_id`
 * derivado de `browser[1]`. Luna-Botv6, que vincula por codigo sin problemas,
 * abre con `['Windows', 'Chrome', '149.0.7827.197']`; con un nombre propio en la
 * posicion del sistema operativo el aviso del telefono queda raro y el id de
 * plataforma no es el de Chrome.
 *
 * El QR sigue usando el nombre del bot: ahi el navegador solo decora la entrada
 * de "Dispositivos vinculados" y no participa del emparejamiento por codigo.
 */
export const NAVEGADOR_CODIGO = ['Windows', 'Chrome', '149.0.7827.197']

/**
 * Browser que se pasa a `makeWASocket` segun el metodo de vinculacion.
 *
 * @param {{ metodo?: 'qr' | 'codigo' | null, nombre: string, navegador: string }} datos
 * @returns {string[]} `[sistema, navegador, version]`
 */
export function navegadorVinculacion({ metodo, nombre, navegador }) {
  if (metodo === 'codigo') return [...NAVEGADOR_CODIGO]
  return [nombre, navegador, '2.1.0']
}

/**
 * Espera antes de pedir el codigo.
 *
 * `requestPairingCode` manda un IQ apenas el socket esta abierto. El `qr` llega
 * en el mismo instante en que el servidor responde `pair-device`; pedir el
 * codigo con esa carrera delante hace que el IQ se pierda y el telefono quede
 * esperando un codigo que nunca llega. Luna espera 1,5 s entre el `qr` y la
 * peticion; aca se usa el mismo margen.
 */
export const ESPERA_CODIGO_MS = 1500

/** Espera en milisegundos */
export function esperar(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms))
}

/**
 * Largo esperado de un numero por pais, para los paises que se usan de verdad.
 *
 * `normalizarNumero` acepta de 8 a 15 digitos, que es el rango del estandar:
 * un numero con un digito de menos pasa esa prueba, se pide el codigo, y el
 * telefono contesta "comprueba que el numero de telefono es correcto". Revisar
 * el largo ANTES de pedir el codigo ahorra el intento y el error.
 *
 * Es solo para avisar: un pais que no este en la tabla no se bloquea.
 */
const PAISES = {
  57: { nombre: 'Colombia', digitos: [12] },
  52: { nombre: 'Mexico', digitos: [12, 13] },
  54: { nombre: 'Argentina', digitos: [12, 13] },
  55: { nombre: 'Brasil', digitos: [12, 13] },
  56: { nombre: 'Chile', digitos: [11] },
  51: { nombre: 'Peru', digitos: [11] },
  58: { nombre: 'Venezuela', digitos: [12] },
  593: { nombre: 'Ecuador', digitos: [11] },
  591: { nombre: 'Bolivia', digitos: [11] },
  595: { nombre: 'Paraguay', digitos: [12] },
  598: { nombre: 'Uruguay', digitos: [11] },
  34: { nombre: 'Espana', digitos: [11] },
  1: { nombre: 'EE. UU. y Canada', digitos: [11] },
}

/** Claves de pais de mas larga a mas corta, para no leer 57 donde dice 593 */
const CLAVES_PAIS = Object.keys(PAISES).sort((a, b) => b.length - a.length)

/** Pais de un numero, o null si no esta en la tabla */
function paisDe(numero) {
  const clave = CLAVES_PAIS.find((c) => numero.startsWith(c))
  return clave ? { clave, ...PAISES[clave] } : null
}

/** Agrupa los digitos para leerlos: 323 447 3216 */
function agrupar(digitos) {
  if (digitos.length === 10 || digitos.length === 9) {
    return `${digitos.slice(0, 3)} ${digitos.slice(3, 6)} ${digitos.slice(6)}`
  }
  if (digitos.length === 8) return `${digitos.slice(0, 4)} ${digitos.slice(4)}`
  return digitos.replace(/(\d{3})(?=\d)/g, '$1 ')
}

/** Numero legible: +57 323 447 3216 */
export function formatearNumero(numero) {
  const limpio = String(numero ?? '').replace(/\D/g, '')
  if (!limpio) return ''
  const pais = paisDe(limpio)
  if (!pais) return `+${limpio}`
  return `+${pais.clave} ${agrupar(limpio.slice(pais.clave.length))}`
}

/**
 * Aviso si el numero no puede ser de ese pais, o null si el largo cuadra.
 *
 * Un digito de menos es el error de tipeo mas caro: el codigo se genera, el
 * telefono lo escribe, y WhatsApp responde "comprueba que el numero de
 * telefono es correcto en tu dispositivo".
 */
export function avisoDeNumero(numero) {
  const limpio = String(numero ?? '').replace(/\D/g, '')
  const pais = paisDe(limpio)
  if (!pais) return null
  if (pais.digitos.includes(limpio.length)) return null

  const valido = pais.digitos[0]
  const diferencia = valido - limpio.length
  const cuenta =
    diferencia > 0
      ? `le falta${diferencia === 1 ? '' : 'n'} ${diferencia} digito${diferencia === 1 ? '' : 's'}`
      : `le sobra${diferencia === -1 ? '' : 'n'} ${-diferencia} digito${diferencia === -1 ? '' : 's'}`

  const esperados = pais.digitos.join(' o ')
  return (
    `*${pais.nombre}* usa ${esperados} digitos y este tiene ${limpio.length}: ${cuenta}.\n\n` +
    `Escribilo con el codigo de pais, solo digitos, sin + ni espacios.`
  )
}

/** Hace una pregunta por consola */
async function preguntar(rl, texto) {
  return (await rl.question(texto)).trim()
}

/**
 * Resuelve que metodo usar.
 * Prioridad: argumentos (--qr / --code) > config > pregunta por consola.
 * Sin consola interactiva se usa QR (o codigo si ya hay numero configurado).
 *
 * @returns {Promise<{ metodo: 'qr' | 'codigo', numero: string | null }>}
 */
export async function elegirVinculacion({ metodoConfig = 'preguntar', numeroConfig = '', argv = [] } = {}) {
  let metodo = metodoConfig
  if (argv.includes('--qr')) metodo = 'qr'
  if (argv.includes('--code') || argv.includes('--codigo')) metodo = 'codigo'

  let numero = normalizarNumero(numeroConfig)

  if (metodo === 'qr') return { metodo: 'qr', numero: null }
  if (metodo === 'codigo' && numero) return { metodo: 'codigo', numero }

  // Sin consola interactiva no se puede preguntar
  if (!input.isTTY) {
    return numero ? { metodo: 'codigo', numero } : { metodo: 'qr', numero: null }
  }

  const rl = readline.createInterface({ input, output })

  try {
    if (metodo !== 'codigo') {
      log.titulo('Vinculación')
      log.sistema('¿Cómo quieres vincular el bot a WhatsApp?')
      log.sub('', '1) Código QR')
      log.sub('', '2) Código de emparejamiento (8 caracteres)')
      console.log('')

      let eleccion = ''
      while (!['1', '2'].includes(eleccion)) {
        eleccion = await preguntar(rl, 'Elige una opción (1 o 2): ')
      }
      metodo = eleccion === '2' ? 'codigo' : 'qr'
    }

    if (metodo === 'qr') return { metodo: 'qr', numero: null }

    while (!numero) {
      const respuesta = await preguntar(
        rl,
        '📞 Número del bot con código de país, sin + ni espacios (ej: 5215512345678): '
      )
      numero = normalizarNumero(respuesta)
      if (!numero) log.aviso('Número inválido. Usa solo dígitos con el código de país.')
    }

    return { metodo: 'codigo', numero }
  } finally {
    rl.close()
  }
}
