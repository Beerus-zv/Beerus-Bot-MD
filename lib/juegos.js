/**
 * Contenido de los juegos y herramientas de entretenimiento de Beerus Bot MD.
 * Todo es local: el bot no depende de ninguna API externa.
 */

/**
 * Acertijos con su respuesta.
 * Se usan en el comando `/adivinar` (modo acertijo).
 */
export const ACERTIJOS = [
  { pregunta: 'Soy alto, tengo ramas y hojas, y del mar no me mojo. ¿Qué soy?', respuesta: 'arbol' },
  { pregunta: 'Tengo agujas pero no sé coser, oigo el viento y no estornudo. ¿Qué soy?', respuesta: 'pino' },
  { pregunta: 'Cuanto más grande, menos se ve. ¿Qué soy?', respuesta: 'oscuridad' },
  { pregunta: 'Tengo ciudades, pero no casas. Tengo montañas, pero no árboles, y agua, pero no peces. ¿Qué soy?', respuesta: 'mapa' },
  { pregunta: 'Puedo volar sin alas y sin nada. ¿Qué soy?', respuesta: 'nube' },
  { pregunta: 'Tengo patas pero no camino, y tengo espalda pero no lomo. ¿Qué soy?', respuesta: 'silla' },
  { pregunta: '¿Qué se compra para comer pero no se come?', respuesta: 'tenedor' },
  { pregunta: 'Tengo cabeza, cuerpo y cola, pero no tengo vida. ¿Qué soy?', respuesta: 'moneda' },
  { pregunta: 'Si me nombras me rompes. ¿Qué soy?', respuesta: 'silencio' },
  { pregunta: 'Empieza por E, termina en E y solo tiene una letra. ¿Qué soy?', respuesta: 'envoltura' },
  { pregunta: '¿Qué es lo que se rompe al nombrarlo?', respuesta: 'silencio' },
  { pregunta: 'Todos los días corre y nunca camina. ¿Qué soy?', respuesta: 'reloj' },
  { pregunta: 'Tengo escamas pero no soy pez, nado pero no en el agua. ¿Qué soy?', respuesta: 'serpiente' },
  { pregunta: '¿Cuál es el dios de la destruccion en Dragon Ball?', respuesta: 'beerus' },
]

/** Palabras para la sopa de letras (se barajan y se esconden letras) */
export const PALABRAS_SOPA = [
  'DESTRUCCION',
  'ANIME',
  'GOKU',
  'POKEMON',
  'NARUTO',
  'DRAGONBALL',
  'ONEPIECE',
  'HUNTERXHUNTER',
  'MYHEROACADEMIA',
  'JUJUTSUKAISEN',
  'CHAINSAWMAN',
  'SOLOLEVELING',
  'TOKYOGHOUL',
  'BERSERK',
  'SAKAMOTO',
  'DEATHNOTE',
  'ATTACKONTITAN',
  'EVANGELION',
  'BLEACH',
  'SPYXYFAMILY',
]

/** Estilos de texto para el comando de estilizar */
export const ESTILOS_TEXTO = {
  negrita: (t) => `*${t}*`,
  cursiva: (t) => `_${t}_`,
  tachado: (t) => `~${t}~`,
  monoespaciado: (t) => `\`\`${t}\`\``,
  invertida: (t) => [...t].reverse().join(''),
  mayusculas: (t) => t.toUpperCase(),
  minusculas: (t) => t.toLowerCase(),
  invertido: (t) => [...t].reverse().join(''),
  mayus: (t) => t.toUpperCase(),
  minús: (t) => t.toLowerCase(),
  negrita2: (t) => `*${t}*`,
}

/** Alfabeto "estilizado" (letras con Unicode) */
export const ALFABETO_ESTILOS = {
  negrita: {
    a: '𝐀', b: '𝐁', c: '𝐂', d: '𝐃', e: '𝐄', f: '𝐅', g: '𝐆', h: '𝐇', i: '𝐈',
    j: '𝐉', k: '𝐊', l: '𝐋', m: '𝐌', n: '𝐍', o: '𝐎', p: '𝐏', q: '𝐐', r: '𝐑',
    s: '𝐒', t: '𝐓', u: '𝐔', v: '𝐕', w: '𝐖', x: '𝐗', y: '𝐘', z: '𝐙',
    A: '𝐀', B: '𝐁', C: '𝐂', D: '𝐃', E: '𝐄', F: '𝐅', G: '𝐆', H: '𝐇', I: '𝐈',
    J: '𝐉', K: '𝐊', L: '𝐋', M: '𝐌', N: '𝐍', O: '𝐎', P: '𝐏', Q: '𝐐', R: '𝐑',
    S: '𝐒', T: '𝐓', U: '𝐔', V: '𝐕', W: '𝐖', X: '𝐗', Y: '𝐘', Z: '𝐙',
    0: '𝟎', 1: '𝟏', 2: '𝟐', 3: '𝟑', 4: '𝟒', 5: '𝟓', 6: '𝟔', 7: '𝟕',
    8: '𝟖', 9: '𝟗',
  },
  cursiva: {
    a: '𝒶', b: '𝒷', c: '𝒸', d: '𝒹', e: 'ℯ', f: '𝒻', g: '𝒼', h: '𝒽',
    i: '𝒾', j: '𝒿', k: '𝓀', l: '𝓁', m: '𝓂', n: '𝓃', o: '𝓄', p: '𝓅',
    q: '𝓆', r: '𝓇', s: '𝓈', t: '𝓉', u: '𝓊', v: '𝓋', w: '𝓌', x: '𝓍',
    y: '𝓎', z: '𝓏',
    A: '𝒜', B: 'ℬ', C: '𝒞', D: '𝒟', E: 'ℰ', F: 'ℱ', G: '𝒢', H: 'ℋ',
    I: 'ℐ', J: '𝒥', K: '𝒦', L: 'ℒ', M: 'ℳ', N: '𝒩', O: '𝒪', P: '𝒫',
    Q: '𝒬', R: 'ℛ', S: '𝒮', T: '𝒯', U: '𝒰', V: '𝒱', W: '𝒲', X: '𝒳',
    Y: '𝒴', Z: '𝒵',
  },
  bonito: {
    a: 'á', b: 'b', c: 'c', d: 'd', e: 'é', f: 'f', g: 'g', h: 'h',
    i: 'í', j: 'j', k: 'k', l: 'l', m: 'm', n: 'ñ', o: 'ó', p: 'p',
    q: 'q', r: 'r', s: 's', t: 't', u: 'ú', v: 'v', w: 'w', x: 'x',
    y: 'ý', z: 'z',
  },
}

/**
 * Aplica un estilo del alfabeto a un texto.
 * @param {string} texto
 * @param {string} nombre  clave de ALFABETO_ESTILOS
 */
export function aplicarEstilo(texto, nombre) {
  const alfabeto = ALFABETO_ESTILOS[nombre]
  if (!alfabeto) return null
  return [...String(texto)]
    .map((c) => alfabeto[c] ?? c)
    .join('')
}

/** Baraja un array (algoritmo Fisher-Yates) */
export function barajar(lista) {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

/** Elige un elemento al azar de una lista */
export function elegirAleatorio(lista) {
  if (!lista?.length) return null
  return lista[Math.floor(Math.random() * lista.length)]
}

/**
 * Prepara un ahorcado: palabra oculta, progreso y numero de fallos.
 * @returns {{palabra:string, oculta:string, fallos:number, maxFallos:number, usados:string[], terminado:boolean, ganado:boolean}}
 */
export function crearAhorcado(palabras = PALABRAS_SOPA, maxFallos = 6) {
  const palabra = elegirAleatorio(palabras) || 'BEERUS'
  const normalizada = palabra.toUpperCase().replace(/[^A-ZÑ]/g, '')
  const oculta = normalizada
    .split('')
    .map((c) => (/[A-ZÑ]/.test(c) ? '_' : c))
    .join(' ')

  return {
    palabra: normalizada,
    oculta,
    fallos: 0,
    maxFallos,
    usados: [],
    terminado: false,
    ganado: false,
  }
}

/**
 * Aplica una letra a la partida de ahorcado.
 * @returns {object} el estado actualizado
 */
export function usarLetra(estado, letra) {
  if (!estado || estado.terminado) return estado
  const L = String(letra || '').toUpperCase().replace(/[^A-ZÑ]/g, '')
  if (!L || estado.usados.includes(L)) return estado

  const usados = [...estado.usados, L]
  const acierto = estado.palabra.includes(L)

  let oculta = estado.palabra
    .split('')
    .map((c) => (/[A-ZÑ]/.test(c) ? (c === L ? c : '_') : c))
    .join(' ')

  const fallos = acierto ? estado.fallos : estado.fallos + 1
  const ganado = !oculta.includes('_')
  const terminado = ganado || fallos >= estado.maxFallos

  return { ...estado, oculta, fallos, usados, ganado, terminado }
}

/** Dibuja el ahorcado con ASCII segun los fallos */
export function dibujarAhorcado(fallos, maxFallos = 6) {
  const niveles = [
    `
      +---+
      |   |
      O
      |
    /|\\`,
    `
      +---+
      |   |
      O
      |
     / \\
     |`,
    `
      +---+
      |   |
      O
    /|\\
      |`,
    `
      +---+
      |   |
      O
    /|\\\\
      |`,
    `
      +---+
      |   |
      O
    /|\\\\
     /`,
    `
      +---+
      |   |
    💀 O
    /|\\\\
     / \\`,
  ]
  const nivel = Math.min(fallos, niveles.length - 1)
  return niveles[nivel].trim()
}
