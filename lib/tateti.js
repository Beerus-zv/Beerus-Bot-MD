/**
 * Motor del Ta-Te-Ti para Beerus Bot MD.
 * Estado en memoria por grupo: /tateti @usuario crea partida,
 * /tateti <posicion 1-9> juega, /tateti terminar cancela.
 */

const PARTIDAS = new Map()
const SIMBOLOS = { x: '❌', o: '⭕' }

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
 */
export function dibujar(partida, fila = []) {
  const casillas = partida.casillas.map((valor, i) => {
    if (valor) return valor === 'x' ? SIMBOLOS.x : SIMBOLOS.o
    return String(i + 1)
  })

  const marcadas = new Set(fila)
  const filas = []
  for (let filaN = 0; filaN < 3; filaN += 1) {
    const trozo = casillas.slice(filaN * 3, filaN * 3 + 3).map((texto, col) => {
      const i = filaN * 3 + col
      return marcadas.has(i) ? `${texto}*` : texto
    })
    filas.push(`${trozo[0]} | ${trozo[1]} | ${trozo[2]}`)
  }
  return filas.join('\n─────\n')
}

function jidIgual(a, b) {
  return String(a || '').split('@')[0] === String(b || '').split('@')[0]
}
