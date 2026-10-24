/**
 * `/sopa` — sopa de letras con una palabra escondida.
 *
 *   /sopa          → genera una sopa con una palabra al azar
 *   /sopa BEERUS   → genera una sopa con la palabra indicada
 */
import { PALABRAS_SOPA, elegirAleatorio } from '../lib/juegos.js'

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const TAMANIO_MINIMO = 7

/**
 * Crea la cuadrícula con la palabra escondida en horizontal o vertical.
 */
function crearCuadricula(palabra) {
  const tam = Math.max(TAMANIO_MINIMO, palabra.length)
  const cuadricula = Array.from({ length: tam }, () => Array(tam).fill(''))

  const horizontal = Math.random() < 0.5
  const largo = palabra.length

  // Posición de la palabra (cabe en horizontal o en vertical)
  const desplazamiento = Math.floor(Math.random() * (horizontal ? tam : tam - largo + 1))
  const fijo = Math.floor(Math.random() * (horizontal ? tam - largo + 1 : tam))

  for (let i = 0; i < largo; i++) {
    if (horizontal) cuadricula[fijo][desplazamiento + i] = palabra[i]
    else cuadricula[desplazamiento + i][fijo] = palabra[i]
  }

  // Relleno con letras aleatorias
  for (let f = 0; f < tam; f++) {
    for (let c = 0; c < tam; c++) {
      if (!cuadricula[f][c]) cuadricula[f][c] = LETRAS[Math.floor(Math.random() * LETRAS.length)]
    }
  }

  return cuadricula
}

export default async ({ sock, jid, msg, args }) => {
  const pedida = (args[0] || '').toUpperCase().replace(/[^A-ZÑ]/g, '')
  const palabra = pedida || elegirAleatorio(PALABRAS_SOPA) || 'BEERUS'

  const cuadricula = crearCuadricula(palabra)
  const filas = cuadricula.map((fila) => fila.join(' '))

  await sock.sendMessage(jid, {
    text:
      `🔍 *Sopa de letras*\n\n` +
      '```\n' +
      filas.join('\n') +
      '\n```\n\n' +
      `_Encuentra la palabra: *${palabra}*_`,
    quoted: msg,
  })
}
