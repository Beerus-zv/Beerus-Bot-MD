/**
 * .dalle <texto> — genera una imagen con OpenAI (GPT Image).
 *
 * OpenAI retiró DALL·E de su API el 12/05/2026; el comando conserva el nombre
 * `.dalle` pero usa el reemplazo oficial: el modelo `gpt-image-2`.
 *
 * Uso:
 *   .dalle un gato astronauta   genera la imagen
 *   .dalle estado               muestra el motor y si hay clave
 *   .dalle clave <KEY>          guarda la clave de OpenAI (solo owner)
 *
 * Sin clave de OpenAI, o si OpenAI falla, se intenta Gemini (clave gratuita
 * de AI Studio) y por ultimo Pollinations, para que el comando siempre
 * responda con imagen.
 */
import { esOwnerMsg } from '../lib/owner.js'
import {
  claveOpenAI,
  configClaveOpenAI,
  generarImagenDalle,
  hayClaveGemini,
  MODELO_IMAGEN,
} from '../lib/dalle.js'
import { log } from '../lib/logger.js'

const AYUDA = `🎨 *DALL·E — imágenes con IA*

*Uso:* \`.dalle <descripción>\`
_Ej: \`.dalle un gato astronauta en la luna\`_

*Configuración (solo owner):*
• \`.dalle clave <KEY>\` — guarda tu clave de OpenAI
• \`/ia clave <KEY>\` — clave gratuita de Gemini (respaldo)
• \`.dalle estado\` — muestra el motor en uso

_Sin clave de OpenAI se usa Gemini (si está configurado) o un generador gratuito._`

/** Texto corto del error para el pie de foto */
function motivoCorto(err) {
  const texto = String(err?.message || 'error desconocido').replace(/\s+/g, ' ').trim()
  return texto.length > 120 ? `${texto.slice(0, 117)}...` : texto
}

export default async ({ sock, jid, msg, args, sender }) => {
  const partes = (args || []).map((a) => String(a))
  const primero = (partes[0] || '').toLowerCase()
  const resto = partes.slice(1).join(' ').trim()

  // `.dalle` sin texto: ayuda
  if (!partes.length) {
    return await sock.sendMessage(jid, { text: AYUDA, quoted: msg })
  }

  // `.dalle estado` — motor y clave
  if (primero === 'estado') {
    const openai = Boolean(claveOpenAI())
    const gemini = hayClaveGemini()
    return await sock.sendMessage(
      jid,
      {
        text:
          `🎨 *Estado de imágenes IA*\n\n` +
          `• OpenAI Images: ${openai ? `✅ activo (${MODELO_IMAGEN})` : '❌ sin clave de OpenAI'}\n` +
          `• Gemini: ${gemini ? '✅ activo (respaldo gratis)' : '❌ sin clave de Gemini'}\n` +
          `• Pollinations: ✅ respaldo sin clave\n\n` +
          (openai
            ? 'Todo listo: `.dalle <texto>` genera con OpenAI.'
            : gemini
              ? '`.dalle <texto>` genera con Gemini. Para usar OpenAI: `.dalle clave <KEY>`.'
              : 'Configura una clave con `.dalle clave <KEY>` o `/ia clave <KEY>`.'),
      },
      { quoted: msg }
    )
  }

  // `.dalle clave <KEY>` — guarda o borra la clave (solo owner)
  if (primero === 'clave') {
    if (!esOwnerMsg({ sock, msg, sender })) {
      return await sock.sendMessage(
        jid,
        { text: '🔒 Solo el dueño del bot puede configurar la clave (desde el chat propio).', quoted: msg }
      )
    }

    if (msg.key?.remoteJid?.endsWith('@g.us')) {
      return await sock.sendMessage(
        jid,
        {
          text: '🔒 Por seguridad, configura la clave en tu chat privado con el bot, no en un grupo.',
          quoted: msg,
        }
      )
    }

    configClaveOpenAI(resto)
    return await sock.sendMessage(
      jid,
      {
        text: resto
          ? '✅ *Clave de OpenAI guardada.* `.dalle` ya genera con DALL·E.'
          : '🧹 *Clave de OpenAI borrada.* `.dalle` usará el generador gratuito.',
      },
      { quoted: msg }
    )
  }

  // `.dalle <texto>` — genera la imagen
  const prompt = partes.join(' ').trim()
  await sock.sendMessage(jid, { text: '⌛ Generando imagen...', quoted: msg })

  try {
    const { buffer, motor, error } = await generarImagenDalle(prompt)

    const etiqueta = motor === 'openai' ? 'DALL·E' : motor === 'gemini' ? 'Gemini' : 'Imagen IA'
    let caption = `🎨 *${etiqueta}* — "${prompt}"`
    if (motor === 'gemini' && error) {
      caption += `\n\n_⚠️ OpenAI no respondió (${motivoCorto(error)}). Imagen generada con Gemini._`
    } else if (motor === 'pollinations' && error) {
      caption += `\n\n_⚠️ El motor principal no respondió (${motivoCorto(error)}). Imagen generada con el respaldo gratuito._`
    } else if (motor === 'pollinations' && msg.key?.fromMe) {
      caption += `\n\n_💡 Sin claves configuradas: usa_ \`.dalle clave <KEY>\` _o_ \`/ia clave <KEY>\`.`
    }

    await sock.sendMessage(jid, { image: buffer, caption }, { quoted: msg })
  } catch (e) {
    log.error('dalle · no se pudo generar la imagen', e.message)
    await sock.sendMessage(
      jid,
      { text: '❌ No se pudo generar la imagen. Intenta de nuevo en unos segundos.', quoted: msg }
    )
  }
}
