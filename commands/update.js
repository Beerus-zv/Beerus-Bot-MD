import { esOwnerMsg } from '../lib/owner.js'
import { actualizarBot } from '../lib/actualizador.js'
import { log } from '../lib/logger.js'

/**
 * Actualiza el bot desde GitHub y reinicia.
 * Solo el owner puede ejecutarlo.
 * Uso: .update
 */
export default async ({ sock, jid, msg, sender }) => {
  // Solo el owner
  if (!esOwnerMsg({ msg, sender, sock })) {
    await sock.sendMessage(jid, {
      text: '⛔ Solo el propietario puede actualizar el bot.',
      quoted: safeQuote(msg),
    })
    return
  }

  await sock.sendMessage(jid, {
    text: '🔄 Buscando actualizaciones...',
    quoted: safeQuote(msg),
  })

  try {
    const resultado = actualizarBot()

    let texto = ''
    switch (resultado.estado) {
      case 'actualizado':
        texto = `✅ *Bot actualizado*\n\n` +
          `📦 Versión: v${resultado.de} → v${resultado.a}\n\n` +
          `♻️ Reiniciando para aplicar los cambios...`
        break
      case 'al-dia':
        texto = `✅ El bot ya está actualizado (v${resultado.de || '?'}).`
        break
      case 'cambios-locales':
        texto = `⚠️ Hay actualizaciones disponibles, pero hay cambios locales sin guardar.\n` +
          `Haz commit o descártalos para actualizar.`
        break
      case 'divergido':
        texto = `⚠️ Hay actualizaciones, pero tu rama tiene commits propios.\n` +
          `El bot no se actualiza solo para no perder cambios.`
        break
      case 'sin-git':
        texto = `❌ No es un repositorio git o git no está instalado.`
        break
      case 'omitido':
        texto = `⚠️ Repositorio en HEAD desacoplado. No se puede actualizar.`
        break
      case 'error':
      default:
        texto = `❌ Error al buscar actualizaciones.`
    }

    await sock.sendMessage(jid, { texto, quoted: safeQuote(msg) })

    // Si se actualizó, reiniciar el proceso
    if (resultado.estado === 'actualizado') {
      log.sistema('🔁 Reiniciando el bot tras actualización...')
      // Esperar un poco para que se envíe el mensaje
      setTimeout(() => {
        process.exit(0)
      }, 1500)
    }
  } catch (err) {
    log.error('Error en comando .update', err)
    await sock.sendMessage(jid, {
      text: `❌ Error: ${err?.message || err}`,
      quoted: safeQuote(msg),
    })
  }
}

/**
 * Devuelve el mensaje original si es seguro para citar (texto), o undefined si no.
 * Tipos seguros: 'conversation', 'extendedTextMessage'.
 */
function safeQuote(msg) {
  if (!msg?.message) return undefined
  const type = Object.keys(msg.message)[0]
  return ['conversation', 'extendedTextMessage'].includes(type) ? msg : undefined
}