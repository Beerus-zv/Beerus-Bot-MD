/**
 * Botones interactivos para los mensajes del bot.
 *
 * WhatsApp los entrega como `interactiveMessage` con un bloque `nativeFlow`:
 * el cliente los dibuja debajo del texto y, al tocarlos, devuelven el `id` del
 * botón como si el usuario hubiera escrito ese texto. Todos los botones que
 * armamos acá devuelven **un comando completo**, así el flujo normal del bot
 * lo atiende sin casos especiales.
 *
 * Baileys no sabe generar este tipo de mensaje desde `sendMessage` (cae en
 * `prepareWAMessageMedia` y revienta con "Invalid media type"), así que se arma
 * el mensaje con `generateWAMessageFromContent` y se manda con `relayMessage`,
 * que es exactamente lo que hace `sendMessage` por dentro.
 */
import { generateWAMessageFromContent, generateMessageID } from '@whiskeysockets/baileys'
import { log } from './logger.js'

/** Máximo de botones que se dibujan cómodos en cualquier cliente */
export const MAX_BOTONES = 3

/** Botón que devuelve un comando escrito (`/audio …`, `/menu juegos`, …) */
export function botonComando(etiqueta, comando) {
  return {
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({ display_text: corto(etiqueta), id: comando }),
  }
}

/** Botón que abre un enlace en el navegador */
export function botonUrl(etiqueta, url) {
  return {
    name: 'cta_url',
    buttonParamsJson: JSON.stringify({
      display_text: corto(etiqueta),
      url,
      merchant_url: url,
    }),
  }
}

/** Botón que copia un texto al portapapeles */
export function botonCopiar(etiqueta, texto) {
  return {
    name: 'cta_copy',
    buttonParamsJson: JSON.stringify({ display_text: corto(etiqueta), copy_code: texto }),
  }
}

/** WhatsApp corta las etiquetas largas: mejor recortar acá */
function corto(etiqueta, maximo = 24) {
  const texto = String(etiqueta ?? '').replace(/\s+/g, ' ').trim()
  return texto.length > maximo ? `${texto.slice(0, maximo - 1)}…` : texto
}

/** Texto de respaldo con los botones listados como comandos */
export function respaldoTexto({ texto, pie, botones }) {
  const lista = botones.map((b) => {
    try {
      const datos = JSON.parse(b.buttonParamsJson)
      const destino = datos.url || datos.copy_code || datos.id || ''
      return `• *${datos.display_text}* → \`${destino}\``
    } catch {
      return ''
    }
  })
  return [texto, lista.join('\n'), pie].filter(Boolean).join('\n\n')
}

/**
 * Manda un mensaje con botones.
 *
 * @param {object} opciones
 * @param {object} opciones.sock socket de Baileys
 * @param {string} opciones.jid chat destino
 * @param {string} [opciones.titulo] línea del encabezado
 * @param {string} opciones.texto cuerpo del mensaje
 * @param {string} [opciones.pie] pie pequeño en gris
 * @param {Array} opciones.botones de `botonComando`, `botonUrl` o `botonCopiar`
 * @param {object} [opciones.quoted] mensaje a citar
 * @returns {Promise<boolean>} true si salió con botones
 */
export async function enviarBotones({ sock, jid, titulo = '', texto, pie = '', botones = [], quoted = null }) {
  if (!botones.length) {
    await sock.sendMessage(jid, { text: texto, quoted })
    return false
  }

  const recortados = botones.slice(0, MAX_BOTONES)

  try {
    const interactiveMessage = {
      ...(titulo ? { header: { title: corto(titulo, 60), hasMediaAttachment: false } } : {}),
      body: { text: texto },
      ...(pie ? { footer: { text: pie } } : {}),
      nativeFlowMessage: {
        buttons: recortados,
        messageParamsJson: '',
        messageVersion: 1,
      },
    }

    // El `interactiveMessage` no puede ir suelto: el servidor descarta el
    // mensaje sin avisar. Tiene que viajar envuelto en `viewOnceMessage` y con
    // el `messageContextInfo` de lista de dispositivos, igual que los clientes
    // oficiales. Sin este envoltorio no llega nada al chat.
    const contenido = {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
          },
          interactiveMessage,
        },
      },
    }

    const mensaje = generateWAMessageFromContent(jid, contenido, {
      userJid: sock.user?.id,
      messageId: generateMessageID(),
      quoted: quoted || undefined,
    })

    await sock.relayMessage(jid, mensaje.message, { messageId: mensaje.key.id })
    return true
  } catch (err) {
    log.aviso(`botones · no salieron en ${jid}: ${err?.message || err}`)
    // Sin botones el mensaje igual tiene que llegar: se listan los comandos.
    await sock.sendMessage(jid, { text: respaldoTexto({ texto, pie, botones: recortados }), quoted })
    return false
  }
}

/**
 * Lee la respuesta a un botón desde un mensaje entrante.
 *
 * Devuelve el `id` del botón tocado (que es el comando a ejecutar) o null si el
 * mensaje no es una respuesta a botones.
 *
 * @returns {string|null}
 */
export function respuestaDeBoton(message) {
  const contenido = message?.message ?? message
  if (!contenido) return null

  // Botones propios (native flow): el id viaja como JSON en paramsJson
  const respuesta = contenido.interactiveResponseMessage?.nativeFlowResponseMessage
  if (respuesta?.paramsJson) {
    try {
      const datos = JSON.parse(respuesta.paramsJson)
      if (typeof datos.id === 'string' && datos.id) return datos.id
    } catch {
      // si el JSON no se puede leer, no hay comando que ejecutar
    }
  }

  // Plantillas clásicas: el id viene como campo
  const plantilla = contenido.templateButtonReplyMessage
  if (plantilla) return plantilla.selectedId || plantilla.selectedDisplayText || null

  const botones = contenido.buttonsResponseMessage
  if (botones) return botones.selectedButtonId || botones.selectedDisplayText || null

  const lista = contenido.listResponseMessage?.singleSelectReply
  if (lista) return lista.selectedRowId || null

  return null
}
