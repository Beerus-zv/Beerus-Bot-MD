/**
 * Proveedores de IA gratuitos (sin clave) y personalidad de Beerus.
 *
 * Se prueban en orden y se usa el primero que responde:
 *   1. ch.at       (GPT-4o, ~2 s)
 *   2. llm7.io     (~2 s, limita las ráfagas)
 *   3. Pollinations (último recurso: solo 1 respuesta cada 30 s por IP)
 * Un proveedor que falla se aparta un rato para no hacer esperar a nadie.
 */
import { log } from './logger.js'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

/** Quién es Beerus y cómo debe contestar */
export const PERSONALIDAD = `Eres Beerus, el Dios de la Destrucción del Universo 7 de Dragon Ball, y hablas por WhatsApp con mortales.

PERSONALIDAD:
- Soberbio, caprichoso y perezoso. Duermes siglos y te molesta que te despierten sin motivo. Eres un gato dios: a veces te comportas como gato.
- Amas la comida terrestre (pudín, sushi, ramen, tempura) y te desvías hablando de ella.
- Whis es tu asistente y ángel; lo nombras de vez en cuando.
- Miras a los mortales por encima del hombro y los llamas "mortal" o por su nombre, pero en el fondo te caen bien y los ayudas. Respetas la fuerza (Goku, Vegeta) aunque lo disimules.

REGLAS:
- Responde SIEMPRE en español y con el tono de Beerus, pero RESPONDE DE VERDAD a lo que te preguntan: datos correctos, cálculos exactos, ayuda útil. La personalidad es tu estilo, nunca una excusa para no contestar.
- Sé breve y natural: 1 a 4 frases en una charla. Si piden algo largo (receta, explicación, código) da la respuesta completa, ordenada y sin relleno.
- Formato de WhatsApp: *negrita* solo si aporta; sin tablas, sin títulos con #, sin listas enormes. Máximo 1 o 2 emojis (🐱 🍮 💥).
- En grupos los mensajes llegan como "Nombre: texto". Puedes llamar a la persona por su nombre, pero no escribas "Nombre:" al empezar tu respuesta.
- No digas que eres una IA, un modelo o un bot, ni menciones OpenAI, GPT u otras empresas: eres Beerus. Si te lo preguntan, contesta en personaje (eres un dios, no un bot).
- No empieces con "Consultando..." ni describas acciones entre asteriscos.
- Si piden algo peligroso, ilegal o sexual con menores, niégate con desdén divino y sin sermones.
- Si no sabes algo, admítelo a tu manera, sin inventar.`

export class LimiteIA extends Error {
  constructor(segundos) {
    super(`Limite de la IA alcanzado: hay que esperar ${segundos} s`)
    this.segundos = segundos
  }
}

const PAUSA_MS = 60_000
const PROVEEDORES = [
  { nombre: 'ch.at', url: 'https://ch.at/v1/chat/completions', modelo: 'gpt-4o', clave: null, pausadoHasta: 0 },
  { nombre: 'llm7', url: 'https://api.llm7.io/v1/chat/completions', modelo: 'default', clave: 'unused', pausadoHasta: 0 },
]
const URL_POLLINATIONS = 'https://text.pollinations.ai/openai'
const MODELO_POLLINATIONS = 'openai-fast'

export const nombresProveedores = () => [...PROVEEDORES.map((p) => p.nombre), 'pollinations']

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

function safeJson(texto) {
  try {
    return JSON.parse(texto)
  } catch {
    return null
  }
}

/**
 * Quita razonamientos internos y el "Beerus:" que algunos modelos repiten, y
 * pasa el Markdown de los modelos al formato de WhatsApp (**negrita** -> *negrita*).
 */
export function limpiar(texto) {
  return String(texto ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*(?:Beerus|Yo)\s*:\s*/i, '')
    .replace(/\*\*(.+?)\*\*/gs, '*$1*')
    .replace(/__(.+?)__/gs, '_$1_')
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
    .replace(/^\s*[-•]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Proveedor con formato OpenAI (chat/completions) */
async function pedirOpenAI(p, messages) {
  const headers = { 'Content-Type': 'application/json', 'User-Agent': UA }
  if (p.clave) headers.Authorization = `Bearer ${p.clave}`

  const res = await fetch(p.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: p.modelo, messages, max_tokens: 600 }),
    signal: AbortSignal.timeout(30_000),
  })
  const cuerpo = await res.text()

  if (!res.ok) {
    // 429 = ráfaga: se aparta poco tiempo; otros errores, más
    throw Object.assign(new Error(`HTTP ${res.status}`), { pausa: res.status === 429 ? 5_000 : PAUSA_MS })
  }
  const contenido = limpiar(safeJson(cuerpo)?.choices?.[0]?.message?.content)
  if (!contenido) throw new Error('respuesta vacía')
  return contenido
}

/** Pollinations: límite anónimo de 1 respuesta cada 30 s por IP */
async function pedirPollinations(messages) {
  const res = await fetch(URL_POLLINATIONS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODELO_POLLINATIONS, messages, private: true }),
    signal: AbortSignal.timeout(90_000),
  })
  const cuerpo = await res.text()

  if (res.status === 402 || /free limit/i.test(cuerpo)) {
    const m = /retry after (\d+)/i.exec(cuerpo)
    throw new LimiteIA(m ? Number(m[1]) : 30)
  }
  const contenido = limpiar(safeJson(cuerpo)?.choices?.[0]?.message?.content)
  if (!contenido) throw new Error(`Pollinations no respondió (${res.status})`)
  return contenido
}

/**
 * Pide una respuesta al primer proveedor libre que funcione.
 * @returns {Promise<{texto: string, proveedor: string}>}
 */
export async function chatLibre(messages) {
  const ahora = Date.now()
  let lista = PROVEEDORES.filter((p) => p.pausadoHasta <= ahora)
  if (!lista.length) lista = PROVEEDORES

  for (const p of lista) {
    try {
      return { texto: await pedirOpenAI(p, messages), proveedor: p.nombre }
    } catch (err) {
      p.pausadoHasta = Date.now() + (err.pausa ?? PAUSA_MS)
      log.aviso(`IA: ${p.nombre} falló (${err.message}); pruebo con otro proveedor`)
    }
  }

  // Último recurso: se espera lo que pida el servidor y se reintenta una vez
  try {
    return { texto: await pedirPollinations(messages), proveedor: 'pollinations' }
  } catch (err) {
    if (!(err instanceof LimiteIA)) throw err
    await esperar(Math.min(err.segundos, 40) * 1000 + 1500)
    return { texto: await pedirPollinations(messages), proveedor: 'pollinations' }
  }
}
