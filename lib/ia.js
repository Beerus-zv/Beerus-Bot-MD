/**
 * Motor de conversación con IA de Beerus.
 *
 * - Modelo libre: varios proveedores gratuitos sin clave (ver ia-proveedores.js).
 * - Gemini: API oficial de Google con una clave GRATUITA de AI Studio que el
 *   admin guarda con `/ia clave <KEY>`. Sin clave, cae al modelo libre.
 *
 * El historial de cada chat vive en memoria (Map) con tope de turnos.
 */
import { obtenerAjuste, guardarAjuste } from '../database/db.js'
import { PERSONALIDAD, chatLibre, LimiteIA, nombresProveedores } from './ia-proveedores.js'

const MODELOS_GEMINI = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash']

/** Tope de texto por mensaje de WhatsApp */
const TOPE_RESPUESTA = 3500
/** Turnos (pares user/assistant) que se recuerdan por chat */
const MAX_HISTORIAL = 12

/** Historial de conversación por chat (jid -> Array<{role, content}>) */
const historial = new Map()

export { LimiteIA, PERSONALIDAD, nombresProveedores }

/** Etiqueta del modelo libre, para la ayuda y el estado */
export const MODELO_LIBRE = 'GPT-4o (ch.at) con respaldo'

/** Devuelve el historial vivo de un chat (solo para tests/inspección). */
export function obtenerHistorial(jid) {
  return historial.get(jid) ?? []
}

/** Borra el contexto de un chat: olvida toda la conversación previa. */
export function limpiarHistorial(jid) {
  historial.delete(jid)
}

function apuntar(jid, role, content) {
  const lista = historial.get(jid) ?? []
  lista.push({ role, content })
  // Solo se recuerdan los últimos MAX_HISTORIAL * 2 mensajes (sin el sistema)
  while (lista.length > MAX_HISTORIAL * 2) lista.shift()
  historial.set(jid, lista)
  return lista
}

/** Corta respuestas largas para que WhatsApp las acepte */
function ajustar(texto) {
  const limpio = String(texto ?? '').trim()
  if (limpio.length <= TOPE_RESPUESTA) return limpio
  return `${limpio.slice(0, TOPE_RESPUESTA)}\n\n_...me aburrí de escribir. Di "continúa" para el resto._`
}

/** En grupos se antepone el nombre para que Beerus sepa quién habla */
const conNombre = (texto, nombre) => (nombre ? `${nombre}: ${texto}` : texto)

/**
 * Conversa con el modelo libre de Beerus (sin clave).
 * Mantiene el historial del chat y devuelve el texto de respuesta.
 */
export async function preguntarIA(jid, texto, nombre = '') {
  const entrada = conNombre(texto, nombre)
  const mensajes = [{ role: 'system', content: PERSONALIDAD }, ...obtenerHistorial(jid), { role: 'user', content: entrada }]

  const { texto: respuesta } = await chatLibre(mensajes)

  apuntar(jid, 'user', entrada)
  apuntar(jid, 'assistant', respuesta)
  return ajustar(respuesta)
}

/**
 * Conversa con Gemini (modelo oficial de Google) manteniendo historial.
 * Devuelve { texto, gemini } donde `gemini` indica si se usó la API oficial.
 * Sin clave configurada: usa el modelo libre y gemini = false.
 */
export async function preguntarGemini(jid, texto, nombre = '') {
  const clave = obtenerAjuste('gemini_key') || ''

  if (!clave) {
    return { texto: await preguntarIA(jid, texto, nombre), gemini: false }
  }

  const entrada = conNombre(texto, nombre)
  const historialG = obtenerHistorial(jid).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  let ultimoError = null

  for (const modelo of MODELOS_GEMINI) {
    try {
      const respuesta = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: PERSONALIDAD }] },
            contents: [...historialG, { role: 'user', parts: [{ text: entrada }] }],
          }),
          signal: AbortSignal.timeout(90_000),
        },
      )

      const datos = await respuesta.json().catch(() => null)

      if (!respuesta.ok) {
        ultimoError = new Error(datos?.error?.message || `HTTP ${respuesta.status}`)
        continue
      }

      const salida = (datos?.candidates?.[0]?.content?.parts ?? [])
        .filter((p) => p?.text)
        .map((p) => p.text)
        .join('\n')
        .trim()

      if (!salida) {
        ultimoError = new Error('Gemini no devolvió texto')
        continue
      }

      apuntar(jid, 'user', entrada)
      apuntar(jid, 'assistant', salida)
      return { texto: ajustar(salida), gemini: true, modelo }
    } catch (err) {
      ultimoError = err
    }
  }

  // Sin éxito en los modelos de Google: se va al modelo libre
  return { texto: await preguntarIA(jid, texto, nombre), gemini: false, error: ultimoError }
}

/** Clave gratuita de AI Studio que guarda el admin */
export function claveGemini() {
  return obtenerAjuste('gemini_key') || ''
}

/** Guarda o borra (texto vacío) la clave de Gemini */
export function configClaveGemini(clave) {
  guardarAjuste('gemini_key', clave ? clave.trim() : '')
}
