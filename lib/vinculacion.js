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
