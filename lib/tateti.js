/**
 * Motor del Ta-Te-Ti para Beerus Bot MD.
 * Estado en memoria por grupo: /tateti @usuario crea partida,
 * /tateti <posicion 1-9> juega, /tateti terminar cancela.
 */

const PARTIDAS = new Map()

// Fichas ASCII: dentro del bloque de código el tablero tiene que medir igual
// en todos los clientes, y los emoji ocupan ancho doble en unos y simple en otros.
const FICHAS = { x: 'X', o: 'O' }

/**
 * Crea una partida entre dos jugadores.
 * @returns {boolean} false si ya hay una partida abierta en el grupo
 */
export function crearPartida(grupo, jugadorX, jugadorO) {
  if (PARTIDAS.has(grupo)) return false
  PARTIDAS.set(grupo, {
    jugadorX,
    jugadorO,
    turno: 'x',
    casillas: Array(9).fill(null), // 'x', 'o' o null
    movidas: 0,
  })
  return true
}

export function partidaDe(grupo) {
  return PARTIDAS.get(grupo) || null
}

/** Cancela y elimina la partida de un grupo */
export function finPartida(grupo) {
  PARTIDAS.delete(grupo)
}

/** Lista de grupos con partida activa (para limpieza de inactivas) */
export function gruposConPartida() {
  return Array.from(PARTIDAS.keys())
}

/**
 * Juega un turno si le toca al jugador.
 * @returns {string} 'no-partida' | 'no-turno' | 'casilla' | 'gano-x' | 'gano-o' | 'empate' | 'sigue'
 */
export function jugar(grupo, jugador, posicion) {
  const partida = PARTIDAS.get(grupo)
  if (!partida) return 'no-partida'

  const simbolo =
    jidIgual(jugador, partida.jugadorX) ? 'x' : jidIgual(jugador, partida.jugadorO) ? 'o' : null
  if (!simbolo) return 'no-jugador'
  if (partida.turno !== simbolo) return 'no-turno'

  const casilla = Number(posicion)
  if (!Number.isInteger(casilla) || casilla < 1 || casilla > 9) return 'casilla'
  if (partida.casillas[casilla - 1]) return 'casilla'

  partida.casillas[casilla - 1] = simbolo
  partida.movidas += 1

  if (gano(partida.casillas, simbolo)) {
    const fila = lineaGanadora(partida.casillas, simbolo) || []
    PARTIDAS.delete(grupo)
    return { estado: `gano-${simbolo}`, fila, partida }
  }

  if (partida.movidas === 9) {
    PARTIDAS.delete(grupo)
    return { estado: 'empate', fila: [], partida }
  }

  partida.turno = partida.turno === 'x' ? 'o' : 'x'
  return { estado: 'sigue', fila: [], partida }
}

/** Lineas ganadoras: por indices 0-8 */
const LINEAS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // filas
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columnas
  [0, 4, 8], [2, 4, 6], // diagonales
]

function gano(casillas, simbolo) {
  return Boolean(lineaGanadora(casillas, simbolo))
}

function lineaGanadora(casillas, simbolo) {
  for (const linea of LINEAS) {
    if (linea.every((i) => casillas[i] === simbolo)) return linea
  }
  return null
}

/**
 * Dibuja el tablero con la línea ganadora resaltada (si aplica).
 *
 * Va dentro de un bloque de código para que WhatsApp lo muestre en
 * monoespaciada: con la fuente normal las columnas se desalinean en cuanto
 * una casilla lleva emoji en vez de número. Por eso las fichas son `X` y `O`,
 * y cada casilla ocupa exactamente 3 caracteres (` 1 `, ` X `, `(X)`), así el
 * tablero no se mueve entre jugada y jugada.
 */
export function dibujar(partida, fila = []) {
  const marcadas = new Set(fila)
  const celdas = partida.casillas.map((valor, i) => {
    const ficha = valor ? FICHAS[valor] : String(i + 1)
    return marcadas.has(i) ? `(${ficha})` : ` ${ficha} `
  })

  const SEPARADOR = '---+---+---'
  const filas = []
  for (let filaN = 0; filaN < 3; filaN += 1) {
    if (filaN > 0) filas.push(SEPARADOR)
    filas.push(celdas.slice(filaN * 3, filaN * 3 + 3).join('|'))
  }

  return ['```', ...filas, '```'].join('\n')
}

function jidIgual(a, b) {
  return String(a || '').split('@')[0] === String(b || '').split('@')[0]
}
