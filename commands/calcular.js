/**
 * `/calcular` — calculadora de expresiones.
 *
 *   /calcular 2+2*3
 *   /calcular sqrt(16)+pi
 *
 * No usa eval: la expresión se analiza con un parser propio (descendiente
 * recursivo), asi que no se puede ejecutar codigo arbitrario.
 */

const FUNCIONES = {
  sqrt: Math.sqrt,
  raiz: Math.sqrt,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  log: Math.log10,
  ln: Math.log,
}

/**
 * Evalúa una expresión aritmética.
 * @param {string} expresion
 * @returns {number} resultado
 */
export function evaluar(expresion) {
  const texto = String(expresion)
    .replace(/[\s,]/g, '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .toLowerCase()

  let pos = 0

  const mirar = () => texto[pos]
  const comer = () => texto[pos++]

  function sumar() {
    let valor = termino()
    while (mirar() === '+' || mirar() === '-') {
      const op = comer()
      const der = termino()
      valor = op === '+' ? valor + der : valor - der
    }
    return valor
  }

  function termino() {
    let valor = unario()
    while (mirar() === '*' || mirar() === '/' || mirar() === '%') {
      const op = comer()
      const der = unario()
      if (op === '*') valor *= der
      else if (op === '/') {
        if (der === 0) throw new Error('división por cero')
        valor /= der
      } else valor %= der
    }
    return valor
  }

  function unario() {
    if (mirar() === '-') {
      comer()
      return -unario()
    }
    if (mirar() === '+') {
      comer()
      return unario()
    }
    return potencia()
  }

  function potencia() {
    const base = atomo()
    if (mirar() === '^') {
      comer()
      return base ** unario()
    }
    return base
  }

  function atomo() {
    // Funcion: sqrt(...)
    for (const nombre of Object.keys(FUNCIONES)) {
      if (texto.startsWith(nombre, pos)) {
        pos += nombre.length
        if (mirar() !== '(') throw new Error('expresión inválida')
        comer()
        const valor = sumar()
        if (mirar() !== ')') throw new Error('falta cerrar el paréntesis')
        comer()
        return FUNCIONES[nombre](valor)
      }
    }

    // Parentesis
    if (mirar() === '(') {
      comer()
      const valor = sumar()
      if (mirar() !== ')') throw new Error('falta cerrar el paréntesis')
      comer()
      return valor
    }

    // Constantes
    if (texto.startsWith('pi', pos)) {
      pos += 2
      return Math.PI
    }
    if (mirar() === 'e' && !/\d/.test(texto[pos + 1] ?? '')) {
      pos += 1
      return Math.E
    }

    // Numero
    let numero = ''
    while (pos < texto.length && /[\d.]/.test(texto[pos])) numero += texto[pos++]
    if (!numero) throw new Error('expresión inválida')

    const valor = Number(numero)
    if (Number.isNaN(valor)) throw new Error('número inválido')
    return valor
  }

  const resultado = sumar()
  if (pos < texto.length) throw new Error('expresión inválida')
  return resultado
}

export default async ({ sock, jid, msg, args }) => {
  const expresion = args.join(' ').trim()

  if (!expresion) {
    await sock.sendMessage(jid, {
      text:
        `🧮 *Calculadora*\n\n` +
        `*Uso:* /calcular <expresión>\n\n` +
        `*Ejemplos:*\n` +
        `• /calcular 2+2*3\n` +
        `• /calcular (10-4)/2\n` +
        `• /calcular sqrt(16)+pi\n\n` +
        `_Operadores: + - * / % ^ y funciones sqrt, abs, sin, cos, tan, log, ln_`,
      quoted: msg,
    })
    return
  }

  try {
    const resultado = evaluar(expresion)
    const formateado = Number.isInteger(resultado)
      ? String(resultado)
      : String(Number(resultado.toFixed(10)))

    await sock.sendMessage(jid, {
      text: `🧮 *${expresion}*\n\n*= ${formateado}*`,
      quoted: msg,
    })
  } catch (err) {
    await sock.sendMessage(jid, {
      text: `❓ No pude calcular eso: *${err.message}*.\n\n_Ejemplo:_ /calcular 2+2*3`,
      quoted: msg,
    })
  }
}
