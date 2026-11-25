/**
 * Generacion de imagenes con IA para el comando `.dalle`.
 *
 * IMPORTANTE: OpenAI retiro DALL·E 2 y DALL·E 3 de la API el 12/05/2026.
 * El reemplazo oficial son los modelos GPT Image. Por eso el comando sigue
 * llamandose `.dalle`, pero el motor real es `gpt-image-2`.
 *
 * Orden de motores:
 *   1. OpenAI Images (`gpt-image-2`) con la clave que el owner guarda con
 *      `.dalle clave <KEY>` (o la variable OPENAI_API_KEY).
 *   2. Gemini (gratis) con la clave de AI Studio que ya usa `/gemini`
 *      (`/ia clave <KEY>`). Los modelos de imagen de Google tienen cuota
 *      gratuita y no cuestan nada.
 *   3. Pollinations (gratis, sin clave) como ultimo respaldo.
 *
 * Todas las imagenes se validan antes de devolverlas: la API vieja del bot
 * respondia HTTP 200 con un JPEG de ~500 bytes (un placeholder roto) y el
 * bot lo enviaba como si fuera una imagen real.
 */
import { obtenerAjuste, guardarAjuste } from '../database/db.js'
import { log } from './logger.js'

/** Endpoint oficial de imagenes de OpenAI */
const URL_OPENAI = 'https://api.openai.com/v1/images/generations'

/**
 * Modelo de imagenes de OpenAI. `dall-e-3` ya no existe; `gpt-image-2` es
 * el reemplazo estable. Se puede cambiar con la variable OPENAI_IMAGE_MODEL.
 */
export const MODELO_IMAGEN = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2'

/** Modelos de imagen de Gemini que se prueban en orden (el primero gratis) */
const MODELOS_GEMINI = [
  'gemini-2.5-flash-image',
  'gemini-3-pro-image',
  'gemini-2.0-flash-preview-image-generation',
]

/** Generador gratuito de ultimo respaldo (sin clave) */
const URL_POLLINATIONS = 'https://image.pollinations.ai/prompt'

/** Tamano y calidad de la imagen de OpenAI */
const TAMANO = '1024x1024'
const CALIDAD = 'medium'

/** Una imagen real pesa bastante mas que un placeholder de error */
const MINIMO_BYTES = 2000

/** Tiempos maximos de espera */
const ESPERA_OPENAI = 180_000
const ESPERA_GEMINI = 120_000
const ESPERA_POLLINATIONS = 90_000

/** Pollinations limita el acceso anonimo: se deja pasar este tiempo entre llamadas */
const INTERVALO_POLLINATIONS = 65_000

/** Espera ms milisegundos */
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Clave de OpenAI guardada por el owner (cadena vacia si no hay) */
export function claveOpenAI() {
  return (obtenerAjuste('openai_key') || process.env.OPENAI_API_KEY || '').trim()
}

/** Guarda o borra (texto vacio) la clave de OpenAI */
export function configClaveOpenAI(clave) {
  guardarAjuste('openai_key', clave ? clave.trim() : '')
}

/** True si hay una clave de OpenAI configurada */
export function usaDalle() {
  return Boolean(claveOpenAI())
}

/** Clave de Gemini que ya usa `/ia clave` (cadena vacia si no hay) */
function claveGemini() {
  return (obtenerAjuste('gemini_key') || '').trim()
}

/** True si hay una clave de Gemini configurada (la misma de `/ia clave`) */
export function hayClaveGemini() {
  return Boolean(claveGemini())
}

/** Descarga una URL y devuelve el Buffer, validando que sea una imagen real */
async function descargarImagen(url, timeout) {
  if (!url) throw new Error('OpenAI no devolvio la URL de la imagen')

  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar la imagen`)

  const tipo = res.headers.get('content-type') || ''
  if (tipo && !tipo.toLowerCase().startsWith('image/')) {
    throw new Error(`la respuesta no es una imagen (${tipo})`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.length < MINIMO_BYTES) throw new Error('la imagen recibida esta vacia')
  return buffer
}

/**
 * Genera una imagen con el modelo OpenAI Images (gpt-image-2).
 * Los modelos GPT Image devuelven siempre la imagen en base64.
 * @returns {Promise<Buffer>}
 */
async function generarConOpenAI(prompt, clave) {
  const res = await fetch(URL_OPENAI, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${clave}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODELO_IMAGEN,
      prompt,
      n: 1,
      size: TAMANO,
      quality: CALIDAD,
      output_format: 'jpeg',
    }),
    signal: AbortSignal.timeout(ESPERA_OPENAI),
  })

  const datos = await res.json().catch(() => null)

  if (!res.ok) {
    const detalle = datos?.error?.message || `HTTP ${res.status}`
    throw new Error(`OpenAI: ${detalle}`)
  }

  const item = datos?.data?.[0]
  if (item?.b64_json) {
    const buffer = Buffer.from(item.b64_json, 'base64')
    if (buffer.length < MINIMO_BYTES) throw new Error('OpenAI devolvio una imagen vacia')
    return buffer
  }

  // Por compatibilidad, si algun modelo devolviera una URL
  return descargarImagen(item?.url, ESPERA_OPENAI)
}

/**
 * Genera una imagen con Gemini (clave gratuita de AI Studio).
 * Los modelos de imagen devuelven la imagen en `inlineData` (base64).
 * @returns {Promise<Buffer>}
 */
async function generarConGemini(prompt, clave) {
  let ultimoError = null

  for (const modelo of MODELOS_GEMINI) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
          }),
          signal: AbortSignal.timeout(ESPERA_GEMINI),
        }
      )

      const datos = await res.json().catch(() => null)

      if (!res.ok) {
        ultimoError = new Error(datos?.error?.message || `HTTP ${res.status}`)
        continue
      }

      const partes = datos?.candidates?.[0]?.content?.parts || []
      const imagen = partes.find((p) => p?.inlineData?.data)
      if (!imagen) {
        ultimoError = new Error('Gemini no devolvio una imagen')
        continue
      }

      const buffer = Buffer.from(imagen.inlineData.data, 'base64')
      if (buffer.length < MINIMO_BYTES) {
        ultimoError = new Error('Gemini devolvio una imagen vacia')
        continue
      }

      return buffer
    } catch (err) {
      ultimoError = err
    }
  }

  throw ultimoError || new Error('Gemini no genero la imagen')
}

/** Cola para no disparar varias peticiones seguidas a Pollinations */
let colaPollinations = Promise.resolve()
let ultimaPollinations = 0

function enCola(tarea) {
  const ejecucion = colaPollinations.then(tarea, tarea)
  colaPollinations = ejecucion.then(
    () => undefined,
    () => undefined
  )
  return ejecucion
}

/** Referrer y User-Agent que usa el navegador: Pollinations rechaza los de Node */
const REFERRER_POLLINATIONS = 'https://github.com/beerus-bot-md'
const UA_NAVEGADOR =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/**
 * Genera una imagen con Pollinations (gratis, sin clave).
 * El acceso anonimo esta limitado (HTTP 402 si se piden varias seguidas),
 * asi que las llamadas se serializan y se espacian entre si.
 * @returns {Promise<Buffer>}
 */
function generarConPollinations(prompt) {
  return enCola(async () => {
    const espera = Math.max(0, ultimaPollinations + INTERVALO_POLLINATIONS - Date.now())
    if (espera > 0) await esperar(espera)
    ultimaPollinations = Date.now()

    const semilla = Math.floor(Math.random() * 1_000_000_000)
    const url =
      `${URL_POLLINATIONS}/${encodeURIComponent(prompt)}` +
      `?width=1024&height=1024&nologo=true&referrer=${encodeURIComponent(REFERRER_POLLINATIONS)}&seed=${semilla}`

    let ultimoError = null

    for (let intento = 1; intento <= 2; intento++) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': UA_NAVEGADOR,
            Accept: 'image/*,*/*;q=0.8',
          },
          signal: AbortSignal.timeout(ESPERA_POLLINATIONS),
        })

        if (!res.ok) {
          const error = new Error(`Pollinations: HTTP ${res.status}`)
          // 402/429/503 = limite temporal: se espera y se reintenta una vez
          if (![402, 429, 503].includes(res.status) || intento === 2) throw error
          ultimoError = error
          await esperar(INTERVALO_POLLINATIONS)
          continue
        }

        const tipo = (res.headers.get('content-type') || '').toLowerCase()
        if (tipo && !tipo.startsWith('image/')) {
          throw new Error(`Pollinations: respuesta ${tipo}`)
        }

        const buffer = Buffer.from(await res.arrayBuffer())
        if (buffer.length < MINIMO_BYTES) throw new Error('Pollinations devolvio una imagen vacia')
        return buffer
      } catch (err) {
        ultimoError = err
        if (intento === 2) break
        await esperar(INTERVALO_POLLINATIONS)
      }
    }

    throw ultimoError || new Error('Pollinations no respondio')
  })
}

/**
 * Genera la imagen de un prompt.
 *
 * Intenta OpenAI (si hay clave), luego Gemini (si hay clave) y por ultimo
 * el generador gratuito. Devuelve tambien qué motor respondio para que el
 * comando pueda avisar cuando el motor principal no esta disponible.
 *
 * @param {string} prompt
 * @returns {Promise<{ buffer: Buffer, motor: 'openai'|'gemini'|'pollinations', error: Error|null }>}
 */
export async function generarImagenDalle(prompt) {
  const texto = String(prompt || '').trim()
  if (!texto) throw new Error('prompt vacio')

  const claveO = claveOpenAI()
  const claveG = claveGemini()
  let error = null

  if (claveO) {
    try {
      const buffer = await generarConOpenAI(texto, claveO)
      return { buffer, motor: 'openai', error: null }
    } catch (err) {
      error = err
      log.error('dalle · OpenAI fallo', err.message)
    }
  }

  if (claveG) {
    try {
      const buffer = await generarConGemini(texto, claveG)
      return { buffer, motor: 'gemini', error }
    } catch (err) {
      error = err
      log.error('dalle · Gemini fallo', err.message)
    }
  }

  const buffer = await generarConPollinations(texto)
  return { buffer, motor: 'pollinations', error }
}
