/**
 * Logica del poker: mano de cinco cartas con un solo descarte contra la banca.
 *
 * Las cartas son objetos planos: { rango, palo }
 *   rango -> '2'..'10', 'J', 'Q', 'K', 'A'
 *   palo  -> 's' (picas), 'h' (corazones), 'd' (diamantes), 'c' (treboles)
 *
 * La evaluacion devuelve una categoria numerica (0 carta alta ... 8 escalera
 * de color) y los valores de desempate ordenados de mayor a menor, de forma
 * que dos manos se comparan con `compararManos` sin mirar las cartas.
 */
import { barajar } from './juegos.js'

export const PALOS = { s: '♠', h: '♥', d: '♦', c: '♣' }
export const NOMBRES_PALO = { s: 'picas', h: 'corazones', d: 'diamantes', c: 'treboles' }
export const RANGOS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']

/** Valor numerico de cada rango: '2' -> 2 ... 'A' -> 14 */
export const VALOR = {}
RANGOS.forEach((rango, i) => { VALOR[rango] = i + 2 })

/** Nombre de cada categoria, indexado por su fuerza (0 = la mas debil) */
export const NOMBRES_CATEGORIA = [
  'Carta alta',
  'Pareja',
  'Doble pareja',
  'Trío',
  'Escalera',
  'Color',
  'Full',
  'Póker',
  'Escalera de color',
]

/** Baraja inglesa completa de 52 cartas, sin barajar */
export function crearBaraja() {
  const baraja = []
  for (const palo of Object.keys(PALOS)) {
    for (const rango of RANGOS) baraja.push({ rango, palo })
  }
  return baraja
}

/** Roba `cantidad` cartas del final del mazo (el mazo se consume) */
export function robar(mazo, cantidad) {
  const cartas = []
  for (let i = 0; i < cantidad; i++) {
    const carta = mazo.pop()
    if (!carta) break
    cartas.push(carta)
  }
  return cartas
}

/**
 * Evalua una mano de cinco cartas.
 * @param {Array<{rango:string, palo:string}>} cartas
 * @returns {{categoria:number, nombre:string, valores:number[]}}
 */
export function evaluarMano(cartas) {
  if (!Array.isArray(cartas) || cartas.length !== 5) {
    return { categoria: -1, nombre: 'Mano incompleta', valores: [] }
  }

  const valores = cartas.map((c) => VALOR[c.rango]).sort((a, b) => b - a)
  const color = new Set(cartas.map((c) => c.palo)).size === 1

  // Escalera: cinco valores distintos consecutivos, o la rueda A-2-3-4-5
  const unicos = [...new Set(valores)]
  let escalera = null
  if (unicos.length === 5) {
    if (unicos[0] - unicos[4] === 4) escalera = unicos[0]
    else if (unicos[0] === 14 && unicos[1] === 5 && unicos[4] === 2) escalera = 5
  }

  const conteo = new Map()
  for (const v of valores) conteo.set(v, (conteo.get(v) || 0) + 1)
  const grupos = [...conteo.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const conCuenta = (n) => grupos.filter(([, c]) => c === n).map(([v]) => v)

  const cuadruples = conCuenta(4)
  const triples = conCuenta(3)
  const pares = conCuenta(2)

  let categoria
  let desempate

  if (escalera !== null && color) {
    categoria = 8
    desempate = [escalera]
  } else if (cuadruples.length) {
    categoria = 7
    desempate = [cuadruples[0], ...valores.filter((v) => v !== cuadruples[0])]
  } else if (triples.length && pares.length) {
    categoria = 6
    desempate = [triples[0], pares[0]]
  } else if (color) {
    categoria = 5
    desempate = valores
  } else if (escalera !== null) {
    categoria = 4
    desempate = [escalera]
  } else if (triples.length) {
    categoria = 3
    desempate = [triples[0], ...valores.filter((v) => v !== triples[0])]
  } else if (pares.length >= 2) {
    categoria = 2
    desempate = [pares[0], pares[1], ...valores.filter((v) => v !== pares[0] && v !== pares[1])]
  } else if (pares.length === 1) {
    categoria = 1
    desempate = [pares[0], ...valores.filter((v) => v !== pares[0])]
  } else {
    categoria = 0
    desempate = valores
  }

  return { categoria, nombre: NOMBRES_CATEGORIA[categoria], valores: desempate }
}

/**
 * Compara dos manos evaluadas.
 * @returns {number} 1 si gana `a`, -1 si gana `b`, 0 si empatan
 */
export function compararManos(a, b) {
  if (a.categoria !== b.categoria) return a.categoria > b.categoria ? 1 : -1
  const largo = Math.max(a.valores.length, b.valores.length)
  for (let i = 0; i < largo; i++) {
    const va = a.valores[i] ?? 0
    const vb = b.valores[i] ?? 0
    if (va !== vb) return va > vb ? 1 : -1
  }
  return 0
}

/** Texto corto de una carta: '10♠', 'A♥' */
export function nombreCarta(carta) {
  if (!carta) return '??'
  return `${carta.rango}${PALOS[carta.palo] ?? '?'}`
}

/** Texto de una mano completa: '10♠ J♦ 3♣ K♥ A♠' */
export function textoMano(cartas) {
  return (cartas || []).map(nombreCarta).join(' ')
}

/**
 * Indices (0-based) de las cartas que la banca conserva en el descarte.
 * Regla: guarda todo grupo repetido (pareja o mejor); si no hay nada,
 * se queda con las dos cartas mas altas.
 * @param {Array<{rango:string, palo:string}>} mano
 * @returns {number[]}
 */
export function indicesQueGuardaBanca(mano) {
  const conteo = new Map()
  for (const carta of mano) conteo.set(carta.rango, (conteo.get(carta.rango) || 0) + 1)

  const guarda = []
  mano.forEach((carta, i) => {
    if ((conteo.get(carta.rango) || 0) >= 2) guarda.push(i)
  })
  if (guarda.length) return guarda

  const porValor = mano
    .map((carta, i) => ({ i, valor: VALOR[carta.rango] }))
    .sort((a, b) => b.valor - a.valor)

  return porValor.slice(0, 2).map((c) => c.i).sort((a, b) => a - b)
}

/**
 * Cambia las cartas cuyos indices NO estan en `conservar`.
 * @returns {{mano: Array, mazo: Array}}
 */
export function descartarYRobar(mano, mazo, conservar = []) {
  const restantes = [...mazo]
  const nueva = mano.map((carta, i) => {
    if (conservar.includes(i)) return carta
    return restantes.pop() ?? carta
  })
  return { mano: nueva, mazo: restantes }
}

/** Baraja y reparte una mesa nueva para un jugador */
export function repartirMesa() {
  const mazo = barajar(crearBaraja())
  return {
    mano: robar(mazo, 5),
    banca: robar(mazo, 5),
    mazo,
  }
}
