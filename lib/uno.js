/**
 * Logica del juego UNO.
 * Las cartas se guardan como objetos planos: { color, valor, tipo }.
 */

export const COLORES = {
  rojo: { emoji: '🔴', nombre: 'Rojo' },
  azul: { emoji: '🔵', nombre: 'Azul' },
  verde: { emoji: '🟢', nombre: 'Verde' },
  amarillo: { emoji: '🟡', nombre: 'Amarillo' },
}

export const CLAVES = Object.keys(COLORES)

/** Emojis y nombres alternativos para elegir color */
export const ALIAS_COLOR = {
  rojo: 'rojo',
  red: 'rojo',
  '🔴': 'rojo',
  azul: 'azul',
  blue: 'azul',
  '🔵': 'azul',
  verde: 'verde',
  green: 'verde',
  '🟢': 'verde',
  amarillo: 'amarillo',
  yellow: 'amarillo',
  '🟡': 'amarillo',
}

export const TIPOS_ESPECIALES = ['skip', 'reverse', '+2', '+4', 'comodin']

/** Etiqueta legible de una carta */
export function etiquetaCarta(carta) {
  if (!carta) return '?'
  if (carta.tipo === 'comodin') return '🃏 Comodin'
  if (carta.tipo === '+4') return '🃏 +4'
  const emoji = COLORES[carta.color]?.emoji ?? '⚫'
  const valor = carta.valor === 'skip' ? '⛔' : carta.valor === 'reverse' ? '🔄' : carta.valor === '+2' ? '+2'
    : carta.valor
  return `${emoji} ${valor}`
}

/** Texto corto de la carta */
export function textoCarta(carta) {
  if (!carta) return '?'
  if (carta.tipo === 'comodin') return 'Comodin'
  if (carta.tipo === '+4') return '+4'
  return String(carta.valor)
}

/**
 * Crea un mazo completo de UNO.
 */
export function crearMazo() {
  const mazo = []
  for (const color of CLAVES) {
    mazo.push({ color, valor: '0', tipo: 'numero' })
    for (let n = 1; n <= 9; n++) {
      mazo.push({ color, valor: String(n), tipo: 'numero' })
      mazo.push({ color, valor: String(n), tipo: 'numero' })
    }
    for (const tipo of ['skip', 'reverse', '+2']) {
      mazo.push({ color, valor: tipo, tipo })
      mazo.push({ color, valor: tipo, tipo })
    }
  }
  for (let i = 0; i < 4; i++) {
    mazo.push({ color: 'comodin', valor: '+4', tipo: '+4' })
    mazo.push({ color: 'comodin', valor: 'comodin', tipo: 'comodin' })
  }
  return mazo
}

/** Baraja una lista */
export function barajar(lista) {
  const arr = [...lista]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Reparte 7 cartas a cada jugador */
export function repartir(cartas, jugadores) {
  const mazo = barajar(cartas)
  const manos = new Map(jugadores.map((jid) => [jid, []]))
  for (let i = 0; i < 7; i++) {
    for (const jid of jugadores) {
      const carta = mazo.pop()
      if (carta) manos.get(jid).push(carta)
    }
  }
  return { manos, mazo }
}

/**
 * Indica si una carta puede jugarse sobre la ultima carta.
 * @param {object} carta      carta a jugar
 * @param {object} ultima     carta en juego
 * @param {string} colorActual color activo (para comodines)
 */
export function esValida(carta, ultima, colorActual) {
  if (!carta) return false
  if (carta.tipo === 'comodin' || carta.tipo === '+4') return true
  if (!ultima) return true
  if (ultima.tipo === 'comodin' || ultima.tipo === '+4') {
    return carta.color === colorActual
  }
  if (carta.color === ultima.color) return true
  if (carta.valor === ultima.valor && carta.tipo === ultima.tipo) return true
  return false
}

/** Busca en la mano la carta que coincide con color y valor pedidos */
export function buscarCartaEnMano(mano, { color = null, valor = null, tipo = null }) {
  return mano.find((carta) => {
    if (tipo && carta.tipo === tipo) return true
    if (valor && String(carta.valor).toLowerCase() === String(valor).toLowerCase()) {
      if (!color) return true
      if (carta.tipo === 'comodin' || carta.tipo === '+4') return true
      return carta.color === color
    }
    return false
  }) || null
}

/** Puntos de una carta al terminar la ronda */
export function puntosCarta(carta) {
  if (!carta) return 0
  if (carta.valor === '+4') return 20
  if (carta.valor === 'skip' || carta.valor === 'reverse' || carta.valor === '+2') return 20
  const n = Number(carta.valor)
  return Number.isFinite(n) ? n : 0
}

/** Normaliza el texto de color escrito por el usuario */
export function normalizarColor(texto) {
  if (!texto) return null
  return ALIAS_COLOR[String(texto).trim().toLowerCase()] ?? null
}
